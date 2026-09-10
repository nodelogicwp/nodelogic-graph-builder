/**
 * Editor-side preview DOM access for Element Reference / Element Property.
 *
 *   - `resolvePreviewElement` : id / selector -> live Element in the editor preview
 *   - `detectElementProperties` : Element -> controlled list of graph properties
 *   - `observePreviewDomChanges` : refresh signal when the preview DOM mutates
 *
 * All DOM/document/iframe traversal lives here; the runtime equivalent in
 * frontend.js is separate and is never imported (it is not loaded in editors).
 * The property taxonomy is owned by ./elementPropertyModel (single source).
 *
 * Supported contexts (searched in this order):
 *   1. the top document (modal container, un-iframed Gutenberg canvas, page)
 *   2. Gutenberg block canvas .... iframe[name="editor-canvas"]  (WP 6.3+)
 *   3. Elementor preview .......... iframe#elementor-preview-iframe
 *                                   or window.elementor.$preview[0]
 *   4. any other same-origin iframe currently in the top document
 *
 * Missing / unmounted / cross-origin frames are skipped silently.
 */

import {
    CURATED_PROPERTY_KEYS,
    classifyPropertyType,
    type DetectedElementProperty,
} from './elementPropertyModel';

const NL_ELEMENT_ATTR_SELECTORS = [
    'data-nodelogic-id',
    'data-nodelogic-chart-id',
    'data-nodelogic-custom-element-id',
    'data-slider-id',
] as const;

const NL_CONTROL_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON']);

const cssEscape = (value: string): string => {
    const scope: unknown = typeof window !== 'undefined' ? window : undefined;
    const cssApi = (scope as { CSS?: { escape?: (v: string) => string } } | undefined)?.CSS;
    if (cssApi && typeof cssApi.escape === 'function') {
        return cssApi.escape(value);
    }
    // Minimal fallback for very old engines: escape the characters that would
    // break an [attr="..."] selector.
    return value.replace(/["\\\]]/g, '\\$&');
};

const readFrameDocument = (frame: HTMLIFrameElement | null | undefined): Document | null => {
    if (!frame) return null;
    try {
        return frame.contentDocument || (frame.contentWindow ? frame.contentWindow.document : null);
    } catch {
        // Cross-origin or not yet accessible.
        return null;
    }
};

/**
 * Ordered list of candidate documents to search for a previewed element.
 * Exported so later stages (property detection) can reuse the exact same set.
 */
export const getPreviewDocuments = (): Document[] => {
    const docs: Document[] = [];
    if (typeof document === 'undefined') {
        return docs;
    }

    const push = (doc: Document | null | undefined): void => {
        if (doc && typeof doc.querySelector === 'function' && docs.indexOf(doc) === -1) {
            docs.push(doc);
        }
    };

    // 1. Top document.
    push(document);

    // 2. Gutenberg block canvas.
    try {
        push(readFrameDocument(document.querySelector('iframe[name="editor-canvas"]')));
    } catch {
        /* ignore */
    }

    // 3. Elementor preview iframe — by id, then via the Elementor editor API.
    try {
        push(readFrameDocument(document.querySelector('iframe#elementor-preview-iframe')));
    } catch {
        /* ignore */
    }
    try {
        const elementor = (window as unknown as {
            elementor?: { $preview?: ArrayLike<HTMLIFrameElement> };
        }).elementor;
        const previewFrame =
            elementor && elementor.$preview && elementor.$preview[0]
                ? elementor.$preview[0]
                : null;
        push(readFrameDocument(previewFrame));
    } catch {
        /* ignore */
    }

    // 4. Any other same-origin iframe currently mounted in the top document.
    try {
        const frames = document.querySelectorAll('iframe');
        for (let i = 0; i < frames.length; i += 1) {
            push(readFrameDocument(frames[i] as HTMLIFrameElement));
        }
    } catch {
        /* ignore */
    }

    return docs;
};

/**
 * Run the canonical NodeLogic selector chain inside one document.
 * Mirrors frontend.js `resolveNodeElement`:
 *   - #/./[ selectors -> querySelector only
 *   - bare token      -> getElementById, then the data-* attribute selectors
 */
const queryInDocument = (selector: string, doc: Document): Element | null => {
    if (!doc || typeof doc.querySelector !== 'function') {
        return null;
    }

    if (selector.startsWith('#') || selector.startsWith('.') || selector.indexOf('[') !== -1) {
        try {
            return doc.querySelector(selector);
        } catch {
            return null;
        }
    }

    try {
        const byId = doc.getElementById(selector);
        if (byId) return byId;
    } catch {
        /* ignore */
    }

    for (let i = 0; i < NL_ELEMENT_ATTR_SELECTORS.length; i += 1) {
        try {
            const found = doc.querySelector(
                `[${NL_ELEMENT_ATTR_SELECTORS[i]}="${cssEscape(selector)}"]`,
            );
            if (found) return found;
        } catch {
            /* ignore malformed selector for this attribute */
        }
    }

    return null;
};

/**
 * Container-unwrap rule: NodeLogic element blocks render as a wrapper
 * (`.slider-container`, a bare `<div>`/`<span>`) around the real form control,
 * and at runtime the id sits on that wrapper. When the resolved node is not
 * itself a form control, descend to the first nested input/select/textarea.
 *
 * Stage 1 has no property-key context, so this is unconditional (opt out with
 * `unwrapControl: false`). A later stage can make it key-aware.
 */
const unwrapControl = (element: Element): Element => {
    if (NL_CONTROL_TAGS.has(element.tagName)) {
        return element;
    }
    try {
        const inner = element.querySelector('input, select, textarea');
        if (inner) return inner;
    } catch {
        /* ignore */
    }
    return element;
};

export interface ResolvePreviewElementOptions {
    /** Descend a wrapper element to its inner form control. Default: true. */
    unwrapControl?: boolean;
    /** Override the candidate documents (mainly for tests). */
    documents?: Document[];
}

/**
 * Resolve a manually entered element id / selector to a real DOM element in the
 * current editor preview, or null when it cannot be found. Never throws.
 */
export const resolvePreviewElement = (
    idOrSelector: string,
    options: ResolvePreviewElementOptions = {},
): Element | null => {
    let selector = String(idOrSelector == null ? '' : idOrSelector).trim();
    if (!selector) {
        return null;
    }

    // Accept the graph's `[id]` literal form.
    if (selector.startsWith('[') && selector.endsWith(']') && selector.length > 2) {
        selector = selector.slice(1, -1).trim();
    }
    if (!selector) {
        return null;
    }

    const docs =
        options.documents && options.documents.length > 0
            ? options.documents
            : getPreviewDocuments();

    for (let i = 0; i < docs.length; i += 1) {
        const hit = queryInDocument(selector, docs[i]);
        if (hit) {
            return options.unwrapControl === false ? hit : unwrapControl(hit);
        }
    }

    return null;
};

/* ===========================================================================
 * DOM property detection
 * ========================================================================= */

const CONTROL_SELECTOR = 'input, select, textarea';
const NUMERIC_INPUT_TYPES = new Set(['number', 'range']);
const RANGEY_INPUT_TYPES = new Set([
    'number',
    'range',
    'date',
    'month',
    'week',
    'time',
    'datetime-local',
]);
const TEXTLEN_INPUT_TYPES = new Set([
    '',
    'text',
    'search',
    'url',
    'tel',
    'password',
    'email',
]);
const ATTR_KEY_RE = /^(data-|aria-)/i;

const findControl = (element: Element): Element | null => {
    if (NL_CONTROL_TAGS.has(element.tagName)) {
        return element;
    }
    try {
        return element.querySelector(CONTROL_SELECTOR);
    } catch {
        return null;
    }
};

const inputTypeOf = (control: Element | null): string => {
    if (!control || control.tagName !== 'INPUT') {
        return '';
    }
    try {
        return (
            control.getAttribute('type') ||
            (control as HTMLInputElement).type ||
            ''
        ).toLowerCase();
    } catch {
        return '';
    }
};

const hasDescendant = (element: Element, selector: string): boolean => {
    try {
        return !!element.querySelector(selector);
    } catch {
        return false;
    }
};

const findImg = (element: Element, control: Element | null): Element | null => {
    if (element.tagName === 'IMG') return element;
    if (control && control.tagName === 'IMG') return control;
    try {
        return element.querySelector('img');
    } catch {
        return null;
    }
};

interface CuratedApplicabilityCtx {
    element: Element;
    control: Element | null;
    itype: string;
    hasSelect: boolean;
    img: Element | null;
    hasHref: boolean;
}

const curatedKeyApplies = (key: string, c: CuratedApplicabilityCtx): boolean => {
    switch (key) {
        case 'id':
        case 'className':
        case 'title':
        case 'hidden':
        case 'tabIndex':
        case 'textContent':
            return true;
        case 'name':
        case 'type':
        case 'value':
        case 'disabled':
        case 'required':
        case 'readOnly':
        case 'placeholder':
            return !!c.control;
        case 'checked':
            return (
                !!c.control &&
                c.control.tagName === 'INPUT' &&
                (c.itype === 'checkbox' || c.itype === 'radio')
            );
        case 'min':
        case 'max':
        case 'step':
            return (
                !!c.control &&
                c.control.tagName === 'INPUT' &&
                RANGEY_INPUT_TYPES.has(c.itype)
            );
        case 'minLength':
        case 'maxLength':
            return (
                !!c.control &&
                (c.control.tagName === 'TEXTAREA' ||
                    (c.control.tagName === 'INPUT' && TEXTLEN_INPUT_TYPES.has(c.itype)))
            );
        case 'selectedIndex':
        case 'selectedOption':
        case 'selectedText':
            return c.hasSelect;
        case 'src':
        case 'alt':
            return !!c.img;
        case 'width':
        case 'height':
            return (
                !!c.img ||
                c.element.tagName === 'CANVAS' ||
                c.element.tagName === 'VIDEO'
            );
        case 'href':
            return c.hasHref;
        default:
            return false;
    }
};

/** Transient detection result. `element` / `control` are live DOM refs and must
 *  never be written into canvas state; only `properties` is serializable. */
export interface ElementPropertyDetection {
    element: Element | null;
    control: Element | null;
    properties: DetectedElementProperty[];
}

export interface DetectElementPropertiesOptions {
    /** Pre-resolved element; skips `resolvePreviewElement`. `null` -> empty result. */
    element?: Element | null;
    /** Candidate documents override, forwarded to `resolvePreviewElement`. */
    documents?: Document[];
}

/**
 * Inspect the live preview DOM for an Element Reference id / selector and return
 * a controlled list of meaningful graph properties. Reads only tag names, input
 * `type`, attribute presence, `element.attributes`, and `<select>`/`<img>`
 * descendants — never an arbitrary `element[key]` JS property, so no DOM object /
 * function / node can leak out. Missing element -> empty list. Never throws.
 */
export const detectElementProperties = (
    idOrSelector: string,
    options: DetectElementPropertiesOptions = {},
): ElementPropertyDetection => {
    const element =
        options.element !== undefined
            ? options.element
            : resolvePreviewElement(idOrSelector, {
                  unwrapControl: false,
                  documents: options.documents,
              });

    if (!element) {
        return { element: null, control: null, properties: [] };
    }

    const control = findControl(element);
    const itype = inputTypeOf(control);
    const hasSelect =
        (!!control && control.tagName === 'SELECT') || hasDescendant(element, 'select');
    const img = findImg(element, control);
    let hasHref = false;
    try {
        hasHref =
            element.tagName === 'A' ||
            element.tagName === 'AREA' ||
            element.hasAttribute('href');
    } catch {
        hasHref = false;
    }

    const ctx: CuratedApplicabilityCtx = {
        element,
        control,
        itype,
        hasSelect,
        img,
        hasHref,
    };

    const properties: DetectedElementProperty[] = [];
    const seen = new Set<string>();

    // 1. Curated DOM properties, canonical order.
    const numericValueControl = NUMERIC_INPUT_TYPES.has(itype);
    for (let i = 0; i < CURATED_PROPERTY_KEYS.length; i += 1) {
        const key = CURATED_PROPERTY_KEYS[i];
        if (!curatedKeyApplies(key, ctx)) continue;
        properties.push({
            key,
            type: classifyPropertyType(key, { numericValueControl }),
            source: 'dom-property',
        });
        seen.add(key.toLowerCase());
    }

    // 2. data-* / aria-* / role attributes from the wrapper and its control.
    const collectAttrs = (node: Element | null): void => {
        if (!node || !node.attributes) return;
        for (let i = 0; i < node.attributes.length; i += 1) {
            const attr = node.attributes[i];
            const name = attr && typeof attr.name === 'string' ? attr.name : '';
            if (!name) continue;
            const lower = name.toLowerCase();
            if (seen.has(lower)) continue;
            if (lower === 'class' || lower === 'style') continue;
            if (!ATTR_KEY_RE.test(lower) && lower !== 'role') continue;
            seen.add(lower);
            properties.push({ key: name, type: 'string', source: 'attribute' });
        }
    };
    collectAttrs(element);
    if (control && control !== element) collectAttrs(control);

    return { element, control, properties };
};

/* ===========================================================================
 * Direct-child detection (for the Get Children node)
 * ========================================================================= */

/** Serializable descriptor of one direct child element. No DOM refs. */
export interface DetectedChild {
    index: number;
    tag: string;
    id: string;
    label: string;
}

export interface ElementChildrenDetection {
    /** Live element the reference resolved to. Transient — never persist. */
    element: Element | null;
    /** Number of direct child *elements* (text nodes excluded). */
    count: number;
    children: DetectedChild[];
}

export interface DetectElementChildrenOptions {
    element?: Element | null;
    documents?: Document[];
}

/**
 * Page builders wrap a block's real content in a structural element with no
 * authored meaning: Elementor renders every widget as
 * `<div class="elementor-element" id="my-id"><div class="elementor-widget-container">…</div></div>`
 * and flex containers add an inner `<div class="e-con-inner">`. "The children
 * of my-id" means the children of that content, so descend through such a
 * wrapper while it is the (rendered) element's only child. Mirrors
 * `__nodeGetChildren` in frontend.js; a no-op on Gutenberg / plain markup.
 */
const TRANSPARENT_CONTAINER_CLASSES = ['elementor-widget-container', 'e-con-inner'];

/**
 * Elementor's editor/preview injects helper + handle elements as real DOM
 * children that DO NOT exist in the rendered frontend (overlay with the
 * edit/duplicate/remove controls, jQuery-UI resize handles, add-section
 * affordances, the empty-container placeholder). If Get Children counted them,
 * a child the author picked at editor index N would sit at a different index on
 * the frontend. Filtering them here — before the child list and its pin/index
 * mapping are built — makes the stored index refer to the rendered children
 * only, so it resolves to the same element in both places. On the rendered
 * frontend none of these classes are present, so this is a no-op there.
 */
const ELEMENTOR_EDITOR_ONLY_CLASSES = [
    'elementor-element-overlay',
    'elementor-editor-element-settings',
    'ui-resizable-handle',
    'elementor-empty-view',
    'elementor-first-add',
    'elementor-widget-empty-icon',
];

const isElementorEditorChrome = (el: Element): boolean => {
    const cl = el.classList;
    if (!cl) return false;
    if (ELEMENTOR_EDITOR_ONLY_CLASSES.some((cls) => cl.contains(cls))) return true;
    for (let i = 0; i < cl.length; i += 1) {
        if (cl[i].indexOf('elementor-add-') === 0) return true; // add-section / add-new-section / …
    }
    return false;
};

/** Direct element children that will exist in the rendered frontend: text
 *  nodes and Elementor editor-only helper/handle elements removed. */
const renderedChildElements = (node: Element): Element[] => {
    const out: Element[] = [];
    const kids = node.children;
    if (!kids) return out;
    for (let i = 0; i < kids.length; i += 1) {
        const child = kids[i];
        if (child && child.nodeType === 1 && !isElementorEditorChrome(child)) out.push(child);
    }
    return out;
};

/**
 * Direct child *elements* of `element` as they will exist in the rendered
 * frontend, in DOM order. Text nodes and Elementor editor-only helper/handle
 * elements are excluded; a lone structural wrapper is stepped through. Single
 * source of truth for editor-side child access — mirrors `__nodeGetChildren`
 * in frontend.js. Never throws.
 */
export const directElementChildren = (element: Element | null | undefined): Element[] => {
    if (!element) return [];
    try {
        let node: Element = element;
        for (let hop = 0; hop < 6; hop += 1) {
            const real = renderedChildElements(node);
            if (
                real.length === 1 &&
                real[0].classList &&
                TRANSPARENT_CONTAINER_CLASSES.some((cls) => real[0].classList.contains(cls))
            ) {
                node = real[0];
                continue;
            }
            return real;
        }
        return renderedChildElements(node);
    } catch {
        return [];
    }
};

/** Nth direct child element (0-based, elements only), or null. */
export const getPreviewChildAt = (
    element: Element | null | undefined,
    index: number,
): Element | null => {
    const idx = Math.trunc(Number(index));
    if (!Number.isFinite(idx) || idx < 0) return null;
    const kids = directElementChildren(element);
    return idx < kids.length ? kids[idx] : null;
};

/**
 * Inspect the live preview DOM and describe the direct child elements of the
 * element an Element Reference resolves to. Mirrors `__nodeGetChildren` in
 * frontend.js: direct element children only, text nodes excluded, operates on
 * the resolved element itself (same document / iframe). Never throws.
 */
export const detectElementChildren = (
    idOrSelector: string,
    options: DetectElementChildrenOptions = {},
): ElementChildrenDetection => {
    const element =
        options.element !== undefined
            ? options.element
            : resolvePreviewElement(idOrSelector, {
                  unwrapControl: false,
                  documents: options.documents,
              });

    if (!element) {
        return { element: null, count: 0, children: [] };
    }

    const children: DetectedChild[] = [];
    try {
        directElementChildren(element).forEach((child, index) => {
            const tag = (child.tagName || '').toLowerCase();
            const id = typeof child.id === 'string' ? child.id : '';
            children.push({
                index,
                tag,
                id,
                label: `${index}: ${tag || 'element'}${id ? `#${id}` : ''}`,
            });
        });
    } catch {
        return { element, count: 0, children: [] };
    }

    return { element, count: children.length, children };
};

/* ===========================================================================
 * Detection refresh signal
 * ========================================================================= */

export interface ObservePreviewOptions {
    /** Debounce window in ms before `callback` fires (default 120). */
    debounceMs?: number;
}

/**
 * Invoke `callback` (debounced) whenever the editor preview DOM changes across
 * any candidate document. Returns a disposer. No-ops safely when
 * MutationObserver is unavailable. Stage 2B owns when to (re)subscribe.
 */
export const observePreviewDomChanges = (
    callback: () => void,
    options: ObservePreviewOptions = {},
): (() => void) => {
    if (typeof MutationObserver === 'undefined' || typeof callback !== 'function') {
        return () => {};
    }

    const debounceMs =
        typeof options.debounceMs === 'number' && options.debounceMs >= 0
            ? options.debounceMs
            : 120;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = (): void => {
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            try {
                callback();
            } catch {
                /* ignore */
            }
        }, debounceMs);
    };

    // One observer per document. `sync()` attaches observers to any candidate
    // document not yet watched (preview iframes mount/unmount over the editor's
    // lifetime) and drops observers whose document has been torn down.
    const observed = new Map<Document, MutationObserver>();

    const sync = (): void => {
        Array.from(observed.entries()).forEach(([doc, observer]) => {
            let alive = false;
            try {
                alive = !!doc.defaultView && !!(doc.body || doc.documentElement);
            } catch {
                alive = false;
            }
            if (!alive) {
                try {
                    observer.disconnect();
                } catch {
                    /* ignore */
                }
                observed.delete(doc);
            }
        });

        const docs = getPreviewDocuments();
        for (let i = 0; i < docs.length; i += 1) {
            const doc = docs[i];
            if (observed.has(doc)) continue;
            const root = doc.body || doc.documentElement;
            if (!root) continue;
            try {
                const observer = new MutationObserver((mutations) => {
                    // A structural change may have added a preview iframe.
                    if (mutations.some((mutation) => mutation.type === 'childList')) {
                        sync();
                    }
                    fire();
                });
                observer.observe(root, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    characterData: true,
                });
                observed.set(doc, observer);
            } catch {
                /* skip this document */
            }
        }
    };

    sync();
    // Backstop for iframes that appear with no observed mutation (e.g. the whole
    // canvas iframe being swapped).
    const backstop =
        typeof setInterval !== 'undefined' ? setInterval(sync, 2000) : null;

    return () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        if (backstop !== null) {
            clearInterval(backstop);
        }
        Array.from(observed.values()).forEach((observer) => {
            try {
                observer.disconnect();
            } catch {
                /* ignore */
            }
        });
        observed.clear();
    };
};
