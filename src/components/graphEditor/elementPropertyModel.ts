/**
 * Element Property — data model + property taxonomy (Stage 2A).
 *
 * Pure module: no DOM access, no React. It owns
 *   - the three-mode data-model types,
 *   - the curated property taxonomy used by editor-side DOM detection,
 *   - legacy -> `single` migration, invoked from graphEditor's clone/normalize path.
 *
 * The runtime equivalents live independently in frontend.js and are deliberately
 * NOT shared: frontend.js is never imported by the editor.
 */

export type ElementPropertyMode = 'single' | 'all' | 'custom';

/** One entry of the authoritative, ordered selection list used by `custom` mode. */
export interface ElementPropertySelectedEntry {
    key: string;
    origin: 'detected' | 'custom';
    /** User-selected type for manually added properties. */
    type?: DetectedPropertyType;
}

export type DetectedPropertyType = 'number' | 'string' | 'boolean';

/** One meaningful graph property discovered on a live preview element. */
export interface DetectedElementProperty {
    /** Canonical DOM property name, or a data-* / aria-* / author attribute name. */
    key: string;
    /** Inferred graph value type. */
    type: DetectedPropertyType;
    /** Where the value would be read from at runtime. */
    source: 'dom-property' | 'attribute';
}

/* ---------------------------------------------------------------------------
 * Curated taxonomy — the ONLY DOM property names the editor detector surfaces.
 * Anything outside this list is never read off an element as a JS property.
 * data-* / aria-* / author attributes are surfaced separately as string values.
 * ------------------------------------------------------------------------- */

/** Canonical order; also the pin order Stage 2B will use for `all` mode. */
export const CURATED_PROPERTY_KEYS: readonly string[] = [
    'id',
    'name',
    'type',
    'value',
    'checked',
    'disabled',
    'required',
    'readOnly',
    'hidden',
    'placeholder',
    'min',
    'max',
    'step',
    'minLength',
    'maxLength',
    'selectedIndex',
    'selectedOption',
    'selectedText',
    'textContent',
    'className',
    'title',
    'tabIndex',
    'src',
    'alt',
    'width',
    'height',
    'href',
];

export const BOOLEAN_PROPERTY_KEYS: ReadonlySet<string> = new Set([
    'checked',
    'disabled',
    'required',
    'readOnly',
    'hidden',
]);

export const NUMERIC_PROPERTY_KEYS: ReadonlySet<string> = new Set([
    'min',
    'max',
    'step',
    'minLength',
    'maxLength',
    'selectedIndex',
    'width',
    'height',
    'tabIndex',
]);

/**
 * Keys that describe a form control's state/config. When an Element Reference
 * points at a wrapper element, these are resolved against the nested
 * input / select / textarea rather than the wrapper.
 */
export const CONTROL_ORIENTED_KEYS: ReadonlySet<string> = new Set([
    'value',
    'checked',
    'disabled',
    'required',
    'readOnly',
    'name',
    'type',
    'placeholder',
    'min',
    'max',
    'step',
    'minLength',
    'maxLength',
    'selectedIndex',
    'selectedOption',
    'selectedText',
]);

const CURATED_KEY_LOOKUP: ReadonlyMap<string, string> = new Map(
    CURATED_PROPERTY_KEYS.map((key) => [key.toLowerCase(), key]),
);

/** Map any casing of a curated key to its canonical spelling, else null. */
export const canonicalPropertyKey = (key: string): string | null => {
    if (!key) return null;
    return CURATED_KEY_LOOKUP.get(String(key).toLowerCase()) ?? null;
};

export const isBooleanPropertyKey = (key: string): boolean => BOOLEAN_PROPERTY_KEYS.has(key);
export const isNumericPropertyKey = (key: string): boolean => NUMERIC_PROPERTY_KEYS.has(key);
export const isControlOrientedKey = (key: string): boolean => CONTROL_ORIENTED_KEYS.has(key);

/**
 * NodeLogic's own resolution attributes. They are how Element Reference finds an
 * element, not meaningful graph values, so `all` mode must exclude them from the
 * auto-detected list. `custom` mode may still add them explicitly if a user
 * really wants them.
 */
const INTERNAL_RESOLUTION_ATTRS: ReadonlySet<string> = new Set([
    'data-slider-id',
    'data-nodelogic-id',
    'data-nodelogic-chart-id',
    'data-nodelogic-custom-element-id',
]);

export const isInternalResolutionAttr = (key: string): boolean => {
    const k = String(key || '').toLowerCase();
    return INTERNAL_RESOLUTION_ATTRS.has(k) || k.startsWith('data-nodelogic-');
};

export interface ClassifyContext {
    /** true when the resolved control is <input type="number|range">. */
    numericValueControl?: boolean;
}

/**
 * Inferred graph type for a property key. data-* / aria-* / unknown keys are
 * always `string` (read via getAttribute at runtime).
 */
export const classifyPropertyType = (
    key: string,
    context: ClassifyContext = {},
): DetectedPropertyType => {
    const canonical = canonicalPropertyKey(key);
    if (!canonical) return 'string';
    if (BOOLEAN_PROPERTY_KEYS.has(canonical)) return 'boolean';
    if (canonical === 'value') return context.numericValueControl ? 'number' : 'string';
    if (NUMERIC_PROPERTY_KEYS.has(canonical)) return 'number';
    return 'string';
};

/* ---------------------------------------------------------------------------
 * Generic Element property schema.
 *
 * The list the editor surfaces when an Element Property node's Element input is
 * only known to be an `element` (e.g. an Array<element> loop item coming from
 * For Each) and no concrete live preview element can be resolved to sniff.
 *
 * It is a strict, ordered SUBSET of CURATED_PROPERTY_KEYS — derived by
 * filtering, never re-typed — so it can never drift out of the one curated
 * source of truth. It only keeps keys meaningful without knowing the tag; it
 * introduces no new property names and needs no runtime DOM access. Purely a
 * compile-time constant: O(1) with respect to any runtime array.
 * ------------------------------------------------------------------------- */

const GENERIC_ELEMENT_KEY_SET: ReadonlySet<string> = new Set([
    'id',
    'className',
    'textContent',
    'title',
    'tabIndex',
    'hidden',
    'name',
    'type',
    'value',
    'placeholder',
    'checked',
    'disabled',
    'required',
    'readOnly',
    'minLength',
    'maxLength',
    'href',
    'src',
    'alt',
    'width',
    'height',
]);

/** Curated keys, in canonical order, that apply to a generic Element. */
export const GENERIC_ELEMENT_PROPERTY_KEYS: readonly string[] =
    CURATED_PROPERTY_KEYS.filter((key) => GENERIC_ELEMENT_KEY_SET.has(key));

/**
 * The generic Element property list as `DetectedElementProperty` entries, so a
 * caller can feed it through the exact same code path as a live detection
 * result. Takes no argument and iterates only this fixed constant list — it is
 * independent of the size of any runtime array. `source` is `dom-property`
 * because each entry is a genuine DOM property read the same way at runtime;
 * only the list itself is known statically instead of being sniffed.
 */
export const genericElementProperties = (): DetectedElementProperty[] =>
    GENERIC_ELEMENT_PROPERTY_KEYS.map((key) => ({
        key,
        type: classifyPropertyType(key),
        source: 'dom-property' as const,
    }));

/* ---------------------------------------------------------------------------
 * Mode -> ordered output keys (pure; caller supplies the auto-detected list)
 * ------------------------------------------------------------------------- */

interface ElementPropertyDataView {
    elementPropertyMode?: unknown;
    elementProperty?: unknown;
    elementPropertySelected?: unknown;
}

const isKnownMode = (value: unknown): value is ElementPropertyMode =>
    value === 'single' || value === 'all' || value === 'custom';

const readSelectedKeys = (data: ElementPropertyDataView | null | undefined): string[] =>
    (Array.isArray(data?.elementPropertySelected) ? data!.elementPropertySelected : [])
        .map((entry: unknown) => {
            const key = entry && typeof entry === 'object' ? (entry as { key?: unknown }).key : '';
            return String(key ?? '').trim();
        })
        .filter((key: string) => key.length > 0);

const readMode = (data: ElementPropertyDataView | null | undefined): ElementPropertyMode =>
    isKnownMode(data?.elementPropertyMode) ? data!.elementPropertyMode : 'single';

/**
 * The authoritative, ordered list of property keys — one per output pin.
 *   single -> [elementProperty]  (length 1, possibly '')
 *   all    -> autoDetectedKeys in the given order
 *   custom -> elementPropertySelected order
 */
export const elementPropertyOrderedKeys = (
    data: ElementPropertyDataView | null | undefined,
    autoDetectedKeys: readonly string[],
): string[] => {
    const mode = readMode(data);
    if (mode === 'all') return autoDetectedKeys.slice();
    if (mode === 'custom') return readSelectedKeys(data);
    return [String(data?.elementProperty ?? '').trim()];
};

/** Number of output pins for an element-property node. */
export const elementPropertyOutputCount = (
    data: ElementPropertyDataView | null | undefined,
    autoDetectedKeys: readonly string[],
): number => {
    const mode = readMode(data);
    if (mode === 'all') return autoDetectedKeys.length;
    if (mode === 'custom') return readSelectedKeys(data).length;
    return 1;
};

/* ---------------------------------------------------------------------------
 * Legacy migration
 * ------------------------------------------------------------------------- */

type ElementPropertyDataLike = Record<string, unknown> & {
    elementPropertyMode?: unknown;
};

/**
 * Normalize a single canvas node.
 *
 * For a legacy `element-property` node with no `elementPropertyMode`, stamp
 * `single` and leave every legacy field (`elementProperty`,
 * `elementPropertyUseManual`, `elementPropertyType`) exactly as-is — including
 * an unknown manually entered property key. Idempotent. Every other node,
 * and any node already carrying a known mode, is returned untouched (same
 * reference), so this is safe to run on every clone/save.
 */
export function migrateElementPropertyNodeData<T extends object>(node: T): T {
    const n = node as { type?: unknown; data?: ElementPropertyDataLike | null };
    if (!n || n.type !== 'element-property') return node;

    const data: ElementPropertyDataLike =
        n.data && typeof n.data === 'object' ? n.data : {};

    if (isKnownMode(data.elementPropertyMode)) return node;

    return {
        ...node,
        data: { ...data, elementPropertyMode: 'single' as ElementPropertyMode },
    } as T;
}
