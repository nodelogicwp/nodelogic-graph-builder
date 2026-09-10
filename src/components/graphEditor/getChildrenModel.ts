/**
 * Get Children — data model (Stage: modes).
 *
 * Pure module: no DOM, no React. Mirrors elementPropertyModel:
 *   - the mode / return-as data-model types,
 *   - pure helpers that turn `data` + a live child count into pin metadata,
 *   - legacy migration (old nodes had `data: {}` and behaved as All / Children).
 *
 * A `get-children` node has:
 *   getChildrenMode?:      'single' | 'all' | 'custom'   (default 'all')
 *   getChildrenReturnAs?:  'child'  | 'children'         (default 'children', All/Custom only)
 *   getChildrenSingleIndex?: number                      (Single mode: which child)
 *   getChildrenSelected?:  number[]                      (Custom mode: ordered child indices)
 *
 * Output shape:
 *   single ................... 1 pin, type `element`
 *   all/custom + children .... 1 pin, type `array` (item type `element`)
 *   all       + child ........ N pins (N = live child count), each type `element`
 *   custom    + child ........ K pins (K = selected count),   each type `element`
 */

export type GetChildrenMode = 'single' | 'all' | 'custom';
export type GetChildrenReturnAs = 'child' | 'children';

interface GetChildrenDataView {
    getChildrenMode?: unknown;
    getChildrenReturnAs?: unknown;
    getChildrenSingleIndex?: unknown;
    getChildrenSelected?: unknown;
}

const isKnownMode = (value: unknown): value is GetChildrenMode =>
    value === 'single' || value === 'all' || value === 'custom';

const isKnownReturnAs = (value: unknown): value is GetChildrenReturnAs =>
    value === 'child' || value === 'children';

export const readGetChildrenMode = (
    data: GetChildrenDataView | null | undefined,
): GetChildrenMode => (isKnownMode(data?.getChildrenMode) ? data!.getChildrenMode : 'all');

export const readGetChildrenReturnAs = (
    data: GetChildrenDataView | null | undefined,
): GetChildrenReturnAs =>
    isKnownReturnAs(data?.getChildrenReturnAs) ? data!.getChildrenReturnAs : 'children';

export const readGetChildrenSingleIndex = (
    data: GetChildrenDataView | null | undefined,
): number => {
    const n = Math.trunc(Number(data?.getChildrenSingleIndex));
    return Number.isFinite(n) && n >= 0 ? n : 0;
};

export const readGetChildrenSelectedIndices = (
    data: GetChildrenDataView | null | undefined,
): number[] =>
    (Array.isArray(data?.getChildrenSelected) ? data!.getChildrenSelected : [])
        .map((value: unknown) => Math.trunc(Number(value)))
        .filter((value: number) => Number.isFinite(value) && value >= 0);

/** true when the node's (single) output pin is an array; false when it is element(s). */
export const getChildrenOutputsArray = (
    data: GetChildrenDataView | null | undefined,
): boolean => {
    if (readGetChildrenMode(data) === 'single') return false;
    return readGetChildrenReturnAs(data) === 'children';
};

/**
 * Child index for each output pin. Empty for the single-array ("children") pin
 * cases (that pin is not index-mapped). `detectedCount` is the live number of
 * direct child elements (0 when unknown).
 */
export const getChildrenOrderedIndices = (
    data: GetChildrenDataView | null | undefined,
    detectedCount: number,
): number[] => {
    const mode = readGetChildrenMode(data);
    if (mode === 'single') return [readGetChildrenSingleIndex(data)];
    if (readGetChildrenReturnAs(data) === 'children') return [];
    if (mode === 'all') {
        const count = Math.max(0, Math.trunc(Number(detectedCount)) || 0);
        const out: number[] = [];
        for (let i = 0; i < count; i += 1) out.push(i);
        return out;
    }
    return readGetChildrenSelectedIndices(data);
};

/**
 * The concrete child index that output pin `pinIndex` maps to, in the "child"
 * return-as modes — WITHOUT depending on live preview detection.
 *
 *   single ............ the fixed single index
 *   all    + child .... identity: pin k -> child k
 *   custom + child .... the k-th persisted selected index
 *
 * Returns null only when the pin has no stable mapping (the single-array
 * "children" pin, or a custom pin past the end of the persisted selection).
 *
 * `getChildrenOrderedIndices` above is detection-derived and drives how many
 * pins are *shown*; this is what a connected pin's formula/target must use, so
 * an already-wired pin keeps working when the preview DOM is unavailable (e.g.
 * headless save, un-mounted Elementor preview iframe).
 */
export const getChildrenPinChildIndex = (
    data: GetChildrenDataView | null | undefined,
    pinIndex: number,
): number | null => {
    const mode = readGetChildrenMode(data);
    if (mode === 'single') return readGetChildrenSingleIndex(data);
    if (readGetChildrenReturnAs(data) === 'children') return null;
    const k = Math.trunc(Number(pinIndex));
    if (!Number.isFinite(k) || k < 0) return null;
    if (mode === 'all') return k;
    const selected = readGetChildrenSelectedIndices(data);
    return k < selected.length ? selected[k] : null;
};

/** Number of output pins. */
export const getChildrenOutputCount = (
    data: GetChildrenDataView | null | undefined,
    detectedCount: number,
): number => {
    const mode = readGetChildrenMode(data);
    if (mode === 'single') return 1;
    if (readGetChildrenReturnAs(data) === 'children') return 1;
    if (mode === 'all') return Math.max(0, Math.trunc(Number(detectedCount)) || 0);
    return readGetChildrenSelectedIndices(data).length;
};

/**
 * Legacy migration. Old `get-children` nodes carried `data: {}` and behaved as
 * "all direct children, as one array". Stamp that explicitly; idempotent; any
 * other node (or a node already carrying a known mode + return-as) is returned
 * untouched (same reference).
 */
export function migrateGetChildrenNodeData<T extends object>(node: T): T {
    const n = node as { type?: unknown; data?: GetChildrenDataView | null };
    if (!n || n.type !== 'get-children') return node;

    const data: GetChildrenDataView =
        n.data && typeof n.data === 'object' ? n.data : {};

    if (isKnownMode(data.getChildrenMode) && isKnownReturnAs(data.getChildrenReturnAs)) {
        return node;
    }

    return {
        ...node,
        data: {
            ...data,
            getChildrenMode: isKnownMode(data.getChildrenMode) ? data.getChildrenMode : 'all',
            getChildrenReturnAs: isKnownReturnAs(data.getChildrenReturnAs)
                ? data.getChildrenReturnAs
                : 'children',
        },
    } as T;
}
