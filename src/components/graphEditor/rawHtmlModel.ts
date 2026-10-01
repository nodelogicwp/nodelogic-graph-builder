// Raw HTML node: the allowlist sanitizer and structure ("slot") detection.
//
// The SAME sanitizing rules run at runtime in frontend.js (nlSanitizeHtml*)
// for every visitor; this editor copy only drives the editor (preview element
// for Element Property / Get Children, the slot checklist, and the "removed
// for safety" hint). Keep the two equivalent -- tests/raw_html_smoke.js
// checks parity on a shared corpus.
//
// Policy (approved by the user): allowlisted tags/attributes only; scripts,
// event handlers, javascript:/non-image data: URLs, <style>, plugins and SVG
// animation are removed; <iframe> survives only for https YouTube, Vimeo and
// Google Maps embeds.

// Removed WITH their content.
export const RAW_HTML_DROP_TAGS = new Set([
    'script', 'style', 'template', 'noscript', 'object', 'embed', 'applet', 'frame', 'frameset',
    'base', 'link', 'meta', 'title', 'head', 'math', 'portal', 'foreignobject', 'animate',
    'animatemotion', 'animatetransform', 'set', 'discard', 'handler', 'listener', 'xml', 'param',
]);

export const RAW_HTML_ALLOWED_TAGS = new Set([
    'a', 'abbr', 'address', 'article', 'aside', 'audio', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'button',
    'caption', 'cite', 'code', 'col', 'colgroup', 'data', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt',
    'em', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'header', 'hgroup', 'hr', 'i', 'iframe', 'img', 'input', 'ins', 'kbd', 'label', 'legend', 'li', 'main',
    'mark', 'meter', 'nav', 'ol', 'optgroup', 'option', 'output', 'p', 'picture', 'pre', 'progress', 'q',
    's', 'samp', 'section', 'select', 'small', 'source', 'span', 'strong', 'sub', 'summary', 'sup',
    'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'tr', 'track', 'u', 'ul', 'var',
    'video', 'wbr',
    // SVG (static drawing only)
    'svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'text', 'tspan',
    'defs', 'lineargradient', 'radialgradient', 'stop', 'use', 'symbol', 'clippath', 'mask', 'pattern',
    'desc', 'image', 'marker',
]);

export const RAW_HTML_ALLOWED_ATTRS = new Set([
    // global
    'id', 'class', 'style', 'title', 'lang', 'dir', 'role', 'hidden', 'tabindex', 'translate', 'draggable',
    // links / media
    'href', 'target', 'rel', 'download', 'hreflang', 'src', 'srcset', 'sizes', 'alt', 'width', 'height',
    'loading', 'decoding', 'poster', 'controls', 'autoplay', 'muted', 'loop', 'playsinline', 'preload',
    'kind', 'srclang', 'label', 'default', 'media', 'type', 'cite', 'datetime',
    // forms
    'name', 'value', 'placeholder', 'checked', 'disabled', 'readonly', 'required', 'min', 'max', 'step',
    'minlength', 'maxlength', 'pattern', 'multiple', 'size', 'autocomplete', 'list', 'for', 'selected',
    'rows', 'cols', 'wrap', 'action', 'method', 'enctype', 'novalidate', 'form', 'formaction',
    // tables / lists / misc
    'colspan', 'rowspan', 'headers', 'scope', 'span', 'start', 'reversed', 'open', 'low', 'high', 'optimum',
    // iframe (host-checked)
    'allow', 'allowfullscreen', 'frameborder', 'referrerpolicy',
    // svg
    'viewbox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
    'stroke-dasharray', 'stroke-dashoffset', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2',
    'y2', 'points', 'transform', 'opacity', 'fill-opacity', 'stroke-opacity', 'offset', 'stop-color',
    'stop-opacity', 'gradientunits', 'gradienttransform', 'preserveaspectratio', 'text-anchor',
    'font-size', 'font-family', 'font-weight', 'dominant-baseline', 'clip-path', 'mask', 'fill-rule',
    'clip-rule', 'xlink:href', 'patternunits', 'markerwidth', 'markerheight', 'refx', 'refy', 'orient',
]);

export const RAW_HTML_URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'poster', 'cite', 'xlink:href']);

// Attributes NodeLogic's own runtime interprets -- a raw snippet must not be
// able to pose as a logic block / control.
const isReservedAttr = (name: string): boolean =>
    name.startsWith('data-nodelogic') || name === 'data-editor-id' || name === 'data-formula' || name === 'data-slider-id';

const IFRAME_HOSTS = new Set([
    'www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com',
    'player.vimeo.com', 'www.google.com', 'maps.google.com',
]);

export const RAW_HTML_BOOLEAN_ATTRS = new Set([
    'checked', 'disabled', 'selected', 'readonly', 'required', 'hidden', 'multiple', 'open', 'autoplay',
    'muted', 'loop', 'controls', 'playsinline', 'reversed', 'default', 'allowfullscreen', 'novalidate',
]);

/** Scheme check after stripping what browsers ignore inside a scheme. */
export const isSafeRawHtmlUrl = (value: string, attr: string, tag: string): boolean => {
    const compact = String(value).replace(/[\u0000- \u007f-\u009f]/g, '');
    if (attr === 'xlink:href' || (attr === 'href' && (tag === 'use' || tag === 'image'))) {
        // SVG references: in-document fragments only (or an image URL on <image>).
        if (compact.startsWith('#')) return true;
        if (tag !== 'image') return false;
    }
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
    if (!scheme) return true; // relative URL / fragment / query
    const name = scheme[1].toLowerCase();
    if (name === 'http' || name === 'https') return true;
    if ((name === 'mailto' || name === 'tel') && attr === 'href') return true;
    if (name === 'data' && attr === 'src' && (tag === 'img' || tag === 'source' || tag === 'image')) {
        return /^data:image\/(png|jpe?g|gif|webp|avif|bmp);/i.test(compact);
    }
    return false;
};

const isSafeSrcset = (value: string, tag: string): boolean =>
    String(value).split(',').every((candidate) => {
        const url = candidate.trim().split(/\s+/)[0] || '';
        return url === '' || isSafeRawHtmlUrl(url, 'src', tag);
    });

export const isAllowedIframeSrc = (value: string): boolean => {
    try {
        const url = new URL(String(value).trim());
        if (url.protocol !== 'https:' || !IFRAME_HOSTS.has(url.hostname.toLowerCase())) return false;
        if (url.hostname.toLowerCase().endsWith('google.com')) return url.pathname.startsWith('/maps/embed');
        return true;
    } catch {
        return false;
    }
};

const isUnsafeStyle = (value: string): boolean =>
    /expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|behavior\s*:|@import/i.test(String(value).replace(/\\/g, ''));

/**
 * Sanitizes `root`'s subtree IN PLACE (an inert container: a <template>'s
 * content or a DOMParser document body). Returns human-readable notes of what
 * was removed (for the editor hint). Order-stable and deterministic.
 */
export const sanitizeRawHtmlTree = (root: ParentNode): string[] => {
    const removed: string[] = [];
    const note = (text: string) => { if (!removed.includes(text)) removed.push(text); };
    const walk = (parent: ParentNode) => {
        Array.from(parent.childNodes).forEach((node) => {
            if (node.nodeType === 8) { // comment
                node.parentNode?.removeChild(node);
                return;
            }
            if (node.nodeType !== 1) return;
            const el = node as Element;
            const tag = el.localName.toLowerCase();
            if (RAW_HTML_DROP_TAGS.has(tag)) {
                note(`<${tag}>`);
                el.remove();
                return;
            }
            if (!RAW_HTML_ALLOWED_TAGS.has(tag)) {
                // Unknown / custom element: keep its content, drop the tag.
                note(`<${tag}> tag`);
                walk(el);
                while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el);
                el.remove();
                return;
            }
            if (tag === 'iframe' && !isAllowedIframeSrc(el.getAttribute('src') || '')) {
                note('<iframe> (only YouTube, Vimeo and Google Maps embeds are allowed)');
                el.remove();
                return;
            }
            Array.from(el.attributes).forEach((attr) => {
                const name = attr.name.toLowerCase();
                let drop = false;
                if (name.startsWith('on')) {
                    drop = true;
                    note(`${name} handler`);
                } else if (isReservedAttr(name)) {
                    drop = true;
                    note(`${name} attribute`);
                } else if (name.startsWith('aria-') || name.startsWith('data-')) {
                    drop = false;
                } else if (!RAW_HTML_ALLOWED_ATTRS.has(name)) {
                    drop = true;
                    note(`${name} attribute`);
                } else if (RAW_HTML_URL_ATTRS.has(name) && !isSafeRawHtmlUrl(attr.value, name, tag)) {
                    drop = true;
                    note(`unsafe ${name} URL`);
                } else if (name === 'srcset' && !isSafeSrcset(attr.value, tag)) {
                    drop = true;
                    note('unsafe srcset URL');
                } else if (name === 'style' && isUnsafeStyle(attr.value)) {
                    drop = true;
                    note('unsafe style');
                }
                if (drop) el.removeAttribute(attr.name);
            });
            if (tag === 'a' && (el.getAttribute('target') || '').toLowerCase() === '_blank') {
                el.setAttribute('rel', 'noopener noreferrer');
            }
            walk(el);
        });
    };
    walk(root);
    return removed;
};

// ---------------------------------------------------------------------------
// Root + slots
// ---------------------------------------------------------------------------

/**
 * The element a Raw HTML node outputs: its single top-level element, or --
 * for several top-level nodes / bare text -- a <div> wrapping all of them.
 * Runtime uses the identical rule (nlRawHtmlRoot in frontend.js).
 */
export const rawHtmlRootFrom = (container: ParentNode, doc: Document): Element => {
    const nodes = Array.from(container.childNodes).filter((node) => node.nodeType === 1 || (node.nodeType === 3 && (node.textContent || '').trim() !== ''));
    if (nodes.length === 1 && nodes[0].nodeType === 1) return nodes[0] as Element;
    const wrapper = doc.createElement('div');
    Array.from(container.childNodes).forEach((node) => wrapper.appendChild(node));
    return wrapper;
};

export type RawHtmlSlotKind = 'text' | 'attr' | 'style';

export interface RawHtmlSlot {
    /** Stable key stored in the graph: "<path>|text", "<path>|attr:href", "<path>|style:color". */
    id: string;
    /** Element-child indices from the root ([] = the root itself). */
    path: number[];
    kind: RawHtmlSlotKind;
    /** attribute / CSS property name ('' for text) */
    name: string;
    /** short pin label, e.g. "h2.title Text", "a href", "p color" */
    label: string;
    type: 'string' | 'color' | 'boolean';
    /** value as written in the HTML */
    original: string;
}

const RAW_HTML_VOID_TAGS = new Set(['img', 'input', 'br', 'hr', 'wbr', 'source', 'track', 'col', 'iframe', 'area', 'embed']);

const COLOR_PROPS = /(^|-)color$|^background$|^fill$|^stroke$/i;

/**
 * Slot ids are SEMANTIC ("div.card/p|style:color"): each segment is the tag
 * plus #id or .first-class, numbered only among same-looking siblings. So
 * editing the HTML (adding / removing an unrelated sibling) doesn't silently
 * re-point a wire to a different element's value -- a numeric index path
 * would. The numeric `path` is still what the runtime uses to find it.
 */
export const slotIdOf = (keyPath: string, kind: RawHtmlSlotKind, name: string): string =>
    `${keyPath}|${kind}${kind === 'text' ? '' : `:${name}`}`;

const segmentOf = (el: Element): string => {
    const tag = el.localName.toLowerCase();
    const id = el.getAttribute('id');
    if (id) return `${tag}#${id}`;
    const firstClass = (el.getAttribute('class') || '').trim().split(/\s+/)[0] || '';
    return firstClass ? `${tag}.${firstClass}` : tag;
};

/** "color: red; background-color: #fff" -> [["color","red"],["background-color","#fff"]] (names as written). */
export const parseInlineStyle = (style: string): Array<[string, string]> =>
    String(style || '')
        .split(';')
        .map((part) => {
            const index = part.indexOf(':');
            if (index <= 0) return null;
            const name = part.slice(0, index).trim().toLowerCase();
            const value = part.slice(index + 1).trim();
            return /^-?[a-z][a-z0-9-]*$/.test(name) ? [name, value] as [string, string] : null;
        })
        .filter((entry): entry is [string, string] => entry !== null);

/** Every settable value of the structure, in document order. */
export const detectRawHtmlSlots = (root: Element): RawHtmlSlot[] => {
    const slots: RawHtmlSlot[] = [];
    const descriptorCounts = new Map<string, number>();
    const visit = (el: Element, path: number[], keyPath: string) => {
        const tag = el.localName.toLowerCase();
        let descriptor = segmentOf(el);
        const seen = (descriptorCounts.get(descriptor) || 0) + 1;
        descriptorCounts.set(descriptor, seen);
        if (seen > 1) descriptor = `${descriptor}(${seen})`;

        const hasElementChildren = el.children.length > 0;
        if (!hasElementChildren && !RAW_HTML_VOID_TAGS.has(tag)) {
            slots.push({ id: slotIdOf(keyPath, 'text', ''), path, kind: 'text', name: '', label: `${descriptor} Text`, type: 'string', original: el.textContent || '' });
        }
        Array.from(el.attributes).forEach((attr) => {
            const name = attr.name.toLowerCase();
            if (name === 'style') return;
            slots.push({
                id: slotIdOf(keyPath, 'attr', name),
                path,
                kind: 'attr',
                name,
                label: `${descriptor} ${name}`,
                type: RAW_HTML_BOOLEAN_ATTRS.has(name) ? 'boolean' : 'string',
                original: attr.value,
            });
        });
        parseInlineStyle(el.getAttribute('style') || '').forEach(([name, value]) => {
            slots.push({
                id: slotIdOf(keyPath, 'style', name),
                path,
                kind: 'style',
                name,
                label: `${descriptor} ${name}`,
                type: COLOR_PROPS.test(name) ? 'color' : 'string',
                original: value,
            });
        });
        const siblingCounts = new Map<string, number>();
        Array.from(el.children).forEach((child, index) => {
            const segment = segmentOf(child);
            const nth = (siblingCounts.get(segment) || 0) + 1;
            siblingCounts.set(segment, nth);
            visit(child, [...path, index], `${keyPath}/${nth > 1 ? `${segment}(${nth})` : segment}`);
        });
    };
    visit(root, [], segmentOf(root));
    return slots;
};

export interface RawHtmlAnalysis {
    root: Element | null;
    slots: RawHtmlSlot[];
    removed: string[];
}

/**
 * Parses + sanitizes `html` into a DETACHED element owned by `doc` (inert:
 * DOMParser documents never run scripts or load resources).
 */
export const analyzeRawHtml = (html: string, doc: Document = document): RawHtmlAnalysis => {
    const source = String(html || '');
    if (!source.trim()) return { root: null, slots: [], removed: [] };
    const parsed = new DOMParser().parseFromString(`<!doctype html><body>${source}`, 'text/html');
    const removed = sanitizeRawHtmlTree(parsed.body);
    const root = rawHtmlRootFrom(parsed.body, parsed);
    const adopted = doc.importNode(root, true) as Element;
    return { root: adopted, slots: detectRawHtmlSlots(adopted), removed };
};

// Pin counts/labels are read during render (node heights, pin rows), so the
// parse is memoized per HTML string. The cached root is a shared, detached,
// read-only preview element -- callers must not mutate it.
const analysisCache = new Map<string, RawHtmlAnalysis>();
export const analyzeRawHtmlCached = (html: string): RawHtmlAnalysis => {
    const key = String(html || '');
    const hit = analysisCache.get(key);
    if (hit) return hit;
    let analysis: RawHtmlAnalysis;
    try {
        analysis = typeof DOMParser === 'undefined' ? { root: null, slots: [], removed: [] } : analyzeRawHtml(key);
    } catch {
        analysis = { root: null, slots: [], removed: [] };
    }
    if (analysisCache.size >= 40) analysisCache.delete(analysisCache.keys().next().value as string);
    analysisCache.set(key, analysis);
    return analysis;
};

/** Slots the node exposes as input pins: the checked ones that still exist, in document order. */
export const selectedRawHtmlSlots = (slots: RawHtmlSlot[], selectedIds: unknown): RawHtmlSlot[] => {
    const chosen = new Set(Array.isArray(selectedIds) ? selectedIds.map(String) : []);
    return slots.filter((slot) => chosen.has(slot.id));
};
