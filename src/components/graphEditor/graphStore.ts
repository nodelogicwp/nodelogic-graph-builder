/*
 * Graph persistence & versioning domain model.
 *
 * Pure module: no React, no window access (Storage is passed in), so every
 * rule here is unit-tested directly (tests/graph_store_smoke.js). The editor
 * (graphEditor.tsx) only wires these functions to its state and UI.
 *
 *   MAIN     the graph committed to the host block / Elementor widget
 *            (`graphState`). It is what the page runs once WordPress saves
 *            the post. Changed ONLY by publish (Save Graph).
 *   HISTORY  previous MAIN versions, stored next to MAIN in the host
 *            (`graphHistory`), pruned to a 0-10 retention limit in the SAME
 *            atomic host update that adds the new version.
 *   WORK     the user's working copy: every edit lands here first. Persisted
 *            per browser (localStorage) with a monotonic revision and a
 *            compare-and-swap guard, so an older write never replaces a newer
 *            one and another tab's write is never silently overwritten.
 *   RECOVERY per-session emergency snapshots of in-memory state that may not
 *            have reached WORK (crash, tab kill, failed WORK write). Offered
 *            back ONLY when its content is semantically different from both
 *            WORK and MAIN and not superseded by a later WORK save of the
 *            same session -- never because it is merely newer.
 *   BACKUPS  local checkpoints taken before every operation that replaces
 *            WORK or MAIN (publish, restore, import, discard, recovery).
 *
 * Timestamps and revisions are metadata only. "Is this different user
 * state?" is always answered by comparing the canonical form of the graph
 * (canonicalGraphString / semanticEqual), never by a timestamp.
 */

export const GRAPH_FORMAT_VERSION = 2;
export const STORAGE_VERSION = 1;
export const EXPORT_FORMAT = 'nodelogic-graph';
export const EXPORT_FORMAT_VERSION = 1;
export const HISTORY_LIMIT_MIN = 0;
export const HISTORY_LIMIT_MAX = 10;
export const HISTORY_LIMIT_DEFAULT = 5;
export const BACKUP_LIMIT = 5;
export const DISMISSED_LIMIT = 50;
export const GRAPH_LIMITS = { maxNodes: 5000, maxConnections: 20000, maxImportBytes: 10 * 1024 * 1024 };

// Hashes carry the canonicalization version, so a hash produced by a future
// canonical form is never mistaken for a comparable one.
const HASH_PREFIX = 's1:';

export interface GraphNodeLike {
    id: string;
    type: string;
    name?: string;
    x: number;
    y: number;
    data?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface GraphEdgeLike {
    id?: string;
    fromId: string;
    fromOutput: string;
    toId: string;
    toInput: string;
    [key: string]: unknown;
}

export interface GraphContent {
    elements: GraphNodeLike[];
    connections: GraphEdgeLike[];
    customNodeUi?: unknown;
    groups?: GraphGroupLike[];
}

export interface GraphGroupLike {
    id: string;
    name: string;
    description?: string;
    color?: string;
    visible?: boolean;
    showTerrain?: boolean;
    memberIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toList = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (isRecord(value)) {
        // Legacy graphs stored elements as an id -> node map.
        return Object.entries(value).map(([key, item]) => (
            isRecord(item) && !('id' in item) ? { ...item, id: key } : item
        ));
    }
    return [];
};

// ── Hashing ──────────────────────────────────────────────────────────────────

const cyrb53 = (str: string, seed: number): number => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

/** 106-bit non-cryptographic hash (two seeded cyrb53 passes), hex. */
export const hashString = (str: string): string =>
    cyrb53(str, 0).toString(16).padStart(14, '0') + cyrb53(str, 0x9e3779b9).toString(16).padStart(14, '0');

// ── Canonical form (semantic identity) ───────────────────────────────────────

// Fields the editor DERIVES from the rest of the graph. They never represent
// a user decision, so two graphs that differ only here are the same state.
//   valueType            recomputed by updateElementValueTypes from wiring
//   connections          legacy per-node field, unused
//   dbSignature(/Error)  server-issued authorization over the query shape
//   unzipSchemaSnapshot  cache of the live-detected source schema
// Connection ids are random and carry no meaning: a wire is identified by
// its endpoints (deleting and redrawing the same wire is not a change).
const NODE_DERIVED_KEYS = new Set(['valueType', 'connections']);
const DATA_DERIVED_KEYS = new Set(['dbSignature', 'dbSignatureError', 'unzipSchemaSnapshot']);
const EDGE_DERIVED_KEYS = new Set(['id', 'valueType']);

const roundCoordinate = (value: unknown): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    const rounded = Math.round(numeric * 1000) / 1000;
    return Object.is(rounded, -0) ? 0 : rounded;
};

// JSON semantics (what persistence actually stores), with object keys sorted.
const canonicalValue = (value: unknown, depth = 0): unknown => {
    if (depth > 100) return null;
    if (value === null) return null;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) {
        return value.map((item) => (
            item === undefined || typeof item === 'function' || typeof item === 'symbol'
                ? null
                : canonicalValue(item, depth + 1)
        ));
    }
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        Object.keys(value as Record<string, unknown>).sort().forEach((key) => {
            const item = (value as Record<string, unknown>)[key];
            if (item === undefined || typeof item === 'function' || typeof item === 'symbol') return;
            out[key] = canonicalValue(item, depth + 1);
        });
        return out;
    }
    return null;
};

const canonicalNode = (node: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    Object.keys(node).forEach((key) => {
        if (NODE_DERIVED_KEYS.has(key) || key === 'x' || key === 'y' || key === 'data') return;
        out[key] = node[key];
    });
    out.x = roundCoordinate(node.x);
    out.y = roundCoordinate(node.y);
    const data: Record<string, unknown> = {};
    if (isRecord(node.data)) {
        Object.keys(node.data).forEach((key) => {
            if (!DATA_DERIVED_KEYS.has(key)) data[key] = (node.data as Record<string, unknown>)[key];
        });
    }
    out.data = data;
    return canonicalValue(out) as Record<string, unknown>;
};

const canonicalEdge = (edge: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    Object.keys(edge).forEach((key) => {
        if (EDGE_DERIVED_KEYS.has(key)) return;
        if (key === 'connectionType' && (edge[key] === 'normal' || edge[key] === undefined)) return;
        out[key] = edge[key];
    });
    return canonicalValue(out) as Record<string, unknown>;
};

const canonicalCustomUi = (raw: unknown): unknown => {
    if (!isRecord(raw)) return null;
    const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    const shared = Array.isArray(raw.sharedVariables) ? raw.sharedVariables : [];
    if (!raw.enabled && nodes.length === 0 && shared.length === 0) return null;
    return canonicalValue(raw);
};

export interface CanonicalGraph {
    elements: Array<Record<string, unknown>>;
    connections: Array<Record<string, unknown>>;
    customNodeUi: unknown;
    groups: Array<Record<string, unknown>>;
}

/**
 * Deterministic normal form: element and connection order is irrelevant,
 * object key order is irrelevant, derived fields are dropped, coordinates are
 * rounded to 1/1000 px. Equal canonical form <=> same user-visible state.
 */
export const canonicalizeGraph = (content: Partial<GraphContent> | null | undefined): CanonicalGraph => {
    const elements = toList(content?.elements)
        .filter(isRecord)
        .map((node) => canonicalNode(node));
    const elementKeys = elements.map((node) => ({ node, key: `${String(node.id ?? '')}\u0000${JSON.stringify(node)}` }));
    elementKeys.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const connections = toList(content?.connections)
        .filter(isRecord)
        .map((edge) => canonicalEdge(edge))
        .map((edge) => ({ edge, key: JSON.stringify(edge) }));
    connections.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return {
        elements: elementKeys.map((entry) => entry.node),
        connections: connections.map((entry) => entry.edge),
        customNodeUi: canonicalCustomUi(content?.customNodeUi),
        groups: toList(content?.groups).filter(isRecord).map((group) => canonicalValue(group) as Record<string, unknown>),
    };
};

export const canonicalGraphString = (content: Partial<GraphContent> | null | undefined): string =>
    JSON.stringify(canonicalizeGraph(content));

export const semanticHash = (content: Partial<GraphContent> | null | undefined): string =>
    HASH_PREFIX + hashString(canonicalGraphString(content));

/** The source of truth for "same state": full canonical comparison, not a hash. */
export const semanticEqual = (
    a: Partial<GraphContent> | null | undefined,
    b: Partial<GraphContent> | null | undefined
): boolean => canonicalGraphString(a) === canonicalGraphString(b);

export const isComparableHash = (hash: unknown): hash is string =>
    typeof hash === 'string' && hash.startsWith(HASH_PREFIX);

/** The minimal graph content (what the user actually authored). */
export const pickGraphContent = (raw: unknown): GraphContent => {
    const record = isRecord(raw) ? raw : {};
    return {
        elements: toList(record.elements).filter(isRecord) as GraphNodeLike[],
        connections: toList(record.connections).filter(isRecord) as GraphEdgeLike[],
        customNodeUi: record.customNodeUi ?? null,
        groups: toList(record.groups).filter(isRecord).map((group) => ({
            id: String(group.id || ''),
            name: String(group.name || 'Group'),
            description: String(group.description || ''),
            color: String(group.color || '#38bdf8'),
            visible: group.visible !== false,
            showTerrain: group.showTerrain !== false,
            memberIds: toList(group.memberIds).map(String).filter(Boolean),
        })).filter((group) => group.id && group.memberIds.length > 0) as GraphGroupLike[],
    };
};

/** An editor state with nothing but the always-present main block. */
export const isEffectivelyEmptyGraph = (content: Partial<GraphContent> | null | undefined): boolean => {
    const elements = toList(content?.elements).filter(isRecord);
    const connections = toList(content?.connections).filter(isRecord);
    return connections.length === 0
        && elements.every((node) => node.id === 'main-block' && node.type === 'main');
};

// ── Diff (for explaining changes to the user) ────────────────────────────────

export interface GraphDiffNodeRef {
    id: string;
    name: string;
    type: string;
}

export interface GraphDiff {
    addedNodes: GraphDiffNodeRef[];
    removedNodes: GraphDiffNodeRef[];
    changedNodes: GraphDiffNodeRef[];
    movedNodes: GraphDiffNodeRef[];
    addedEdges: number;
    removedEdges: number;
    customUiChanged: boolean;
    identical: boolean;
}

const nodeRef = (node: Record<string, unknown>): GraphDiffNodeRef => ({
    id: String(node.id ?? ''),
    name: String(node.name ?? node.type ?? node.id ?? ''),
    type: String(node.type ?? ''),
});

const withoutPosition = (node: Record<string, unknown>): string => {
    const { x: _x, y: _y, ...rest } = node;
    return JSON.stringify(rest);
};

/** What changes when going from `base` to `next`. */
export const diffGraphs = (
    base: Partial<GraphContent> | null | undefined,
    next: Partial<GraphContent> | null | undefined
): GraphDiff => {
    const a = canonicalizeGraph(base);
    const b = canonicalizeGraph(next);
    const aById = new Map(a.elements.map((node) => [String(node.id ?? ''), node]));
    const bById = new Map(b.elements.map((node) => [String(node.id ?? ''), node]));
    const diff: GraphDiff = {
        addedNodes: [],
        removedNodes: [],
        changedNodes: [],
        movedNodes: [],
        addedEdges: 0,
        removedEdges: 0,
        customUiChanged: JSON.stringify(a.customNodeUi) !== JSON.stringify(b.customNodeUi),
        identical: false,
    };
    bById.forEach((node, id) => {
        const previous = aById.get(id);
        if (!previous) {
            diff.addedNodes.push(nodeRef(node));
            return;
        }
        if (withoutPosition(previous) !== withoutPosition(node)) diff.changedNodes.push(nodeRef(node));
        if (previous.x !== node.x || previous.y !== node.y) diff.movedNodes.push(nodeRef(node));
    });
    aById.forEach((node, id) => {
        if (!bById.has(id)) diff.removedNodes.push(nodeRef(node));
    });
    const edgeCounts = new Map<string, number>();
    a.connections.forEach((edge) => {
        const key = JSON.stringify(edge);
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
    });
    b.connections.forEach((edge) => {
        const key = JSON.stringify(edge);
        const count = edgeCounts.get(key) || 0;
        if (count > 0) edgeCounts.set(key, count - 1);
        else diff.addedEdges += 1;
    });
    edgeCounts.forEach((count) => { diff.removedEdges += count; });
    diff.identical = diff.addedNodes.length === 0
        && diff.removedNodes.length === 0
        && diff.changedNodes.length === 0
        && diff.movedNodes.length === 0
        && diff.addedEdges === 0
        && diff.removedEdges === 0
        && !diff.customUiChanged;
    return diff;
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Short human summary, e.g. ["+1 node", "~2 nodes changed", "moved 3 nodes", "-1 connection"]. */
export const summarizeDiff = (diff: GraphDiff): string[] => {
    const parts: string[] = [];
    if (diff.addedNodes.length) parts.push(`+${plural(diff.addedNodes.length, 'node')}`);
    if (diff.removedNodes.length) parts.push(`−${plural(diff.removedNodes.length, 'node')}`);
    if (diff.changedNodes.length) parts.push(`~${plural(diff.changedNodes.length, 'node')} changed`);
    if (diff.movedNodes.length) parts.push(`moved ${plural(diff.movedNodes.length, 'node')}`);
    if (diff.addedEdges) parts.push(`+${plural(diff.addedEdges, 'connection')}`);
    if (diff.removedEdges) parts.push(`−${plural(diff.removedEdges, 'connection')}`);
    if (diff.customUiChanged) parts.push('custom UI changed');
    return parts;
};

export const graphStats = (content: Partial<GraphContent> | null | undefined) => {
    const elements = toList(content?.elements).filter(isRecord);
    return {
        nodes: elements.filter((node) => !(node.id === 'main-block' && node.type === 'main')).length,
        connections: toList(content?.connections).filter(isRecord).length,
    };
};

// ── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
    content: GraphContent | null;
}

/**
 * Structural validation.
 *   strict (import): anything that would load as a damaged graph is an
 *     error -- nothing is applied. Connections to missing nodes are dropped
 *     with a warning (they can never compile).
 *   lenient (stored data): only "not a graph at all" is an error; repairable
 *     problems are warnings and the editor's own normalizer repairs them
 *     (existing user data must always load).
 */
export const validateGraphContent = (raw: unknown, options: { strict: boolean }): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!isRecord(raw)) {
        return { ok: false, errors: ['Graph data is not an object.'], warnings, content: null };
    }
    if (raw.elements !== undefined && raw.elements !== null && !Array.isArray(raw.elements) && !isRecord(raw.elements)) {
        errors.push('"elements" must be a list of nodes.');
    }
    if (raw.connections !== undefined && raw.connections !== null && !Array.isArray(raw.connections) && !isRecord(raw.connections)) {
        errors.push('"connections" must be a list of connections.');
    }
    if (errors.length) return { ok: false, errors, warnings, content: null };

    const rawElements = toList(raw.elements);
    const rawConnections = toList(raw.connections);
    if (rawElements.length > GRAPH_LIMITS.maxNodes) errors.push(`Too many nodes (${rawElements.length} > ${GRAPH_LIMITS.maxNodes}).`);
    if (rawConnections.length > GRAPH_LIMITS.maxConnections) errors.push(`Too many connections (${rawConnections.length} > ${GRAPH_LIMITS.maxConnections}).`);
    if (errors.length) return { ok: false, errors, warnings, content: null };

    const report = (message: string) => (options.strict ? errors : warnings).push(message);
    const elements: GraphNodeLike[] = [];
    const seen = new Map<string, number>();
    rawElements.forEach((item, index) => {
        if (!isRecord(item)) {
            report(`Node #${index + 1} is not an object.`);
            return;
        }
        const id = typeof item.id === 'string' ? item.id.trim() : '';
        if (!id) report(`Node #${index + 1} has no id.`);
        if (typeof item.type !== 'string' || item.type.trim() === '') report(`Node "${id || `#${index + 1}`}" has no type.`);
        if (!Number.isFinite(Number(item.x)) || !Number.isFinite(Number(item.y))) {
            warnings.push(`Node "${id || `#${index + 1}`}" has an invalid position (reset to 0,0).`);
        }
        if (item.data !== undefined && item.data !== null && !isRecord(item.data)) {
            report(`Node "${id || `#${index + 1}`}" has invalid settings data.`);
        }
        if (id) seen.set(id, (seen.get(id) || 0) + 1);
        elements.push(item as GraphNodeLike);
    });
    const duplicates = Array.from(seen.entries()).filter(([, count]) => count > 1).map(([id]) => id);
    if (duplicates.length) report(`Duplicate node ids: ${duplicates.slice(0, 10).join(', ')}${duplicates.length > 10 ? ', ...' : ''}.`);

    const nodeIds = new Set(elements.map((node) => (typeof node.id === 'string' ? node.id.trim() : '')).filter(Boolean));
    const connections: GraphEdgeLike[] = [];
    let dangling = 0;
    rawConnections.forEach((item, index) => {
        if (!isRecord(item)) {
            report(`Connection #${index + 1} is not an object.`);
            return;
        }
        const fromId = typeof item.fromId === 'string' ? item.fromId : '';
        const toId = typeof item.toId === 'string' ? item.toId : '';
        if (!fromId || !toId) {
            report(`Connection #${index + 1} has no source or target.`);
            return;
        }
        if (item.fromOutput !== undefined && typeof item.fromOutput !== 'string') report(`Connection #${index + 1} has an invalid source pin.`);
        if (item.toInput !== undefined && typeof item.toInput !== 'string') report(`Connection #${index + 1} has an invalid target pin.`);
        if (!nodeIds.has(fromId) || !nodeIds.has(toId)) {
            dangling += 1;
            if (options.strict) return; // can never compile; drop it
        }
        connections.push(item as GraphEdgeLike);
    });
    if (dangling) {
        warnings.push(options.strict
            ? `${plural(dangling, 'connection')} pointing to missing nodes ${dangling === 1 ? 'was' : 'were'} removed.`
            : `${plural(dangling, 'connection')} point${dangling === 1 ? 's' : ''} to missing nodes.`);
    }

    // A data-flow graph must remain acyclic.  A feedback edge such as
    // For Each -> Collect Results -> Merge -> the same For Each would make
    // expression lowering recurse forever (or repeatedly rebuild the same
    // collection at runtime).  Catch the cycle at graph validation time so it
    // cannot be saved as a graph that can never terminate.
    const adjacency = new Map<string, string[]>();
    connections.forEach((connection) => {
        if (!nodeIds.has(connection.fromId) || !nodeIds.has(connection.toId)) return;
        const outgoing = adjacency.get(connection.fromId) || [];
        outgoing.push(connection.toId);
        adjacency.set(connection.fromId, outgoing);
    });
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const cycleNodes: string[] = [];
    const visit = (id: string): boolean => {
        if (visiting.has(id)) {
            cycleNodes.push(id);
            return true;
        }
        if (visited.has(id)) return false;
        visiting.add(id);
        let found = false;
        for (const next of adjacency.get(id) || []) {
            if (visit(next)) found = true;
        }
        visiting.delete(id);
        visited.add(id);
        return found;
    };
    for (const id of nodeIds) visit(id);
    if (cycleNodes.length > 0) {
        report(`Potential infinite loop: graph contains a feedback cycle (${Array.from(new Set(cycleNodes)).slice(0, 5).join(' -> ')}).`);
    }
    if (raw.customNodeUi !== undefined && raw.customNodeUi !== null && !isRecord(raw.customNodeUi)) {
        warnings.push('Custom node UI settings are invalid and were ignored.');
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        content: errors.length === 0
            ? { elements, connections, customNodeUi: isRecord(raw.customNodeUi) ? raw.customNodeUi : null, groups: pickGraphContent(raw).groups }
            : null,
    };
};

// ── Stored records (WORK / RECOVERY) ─────────────────────────────────────────

export type StoredRecordKind = 'nodelogic-work' | 'nodelogic-recovery';

export interface StoredGraphRecord {
    kind: StoredRecordKind;
    storageVersion: number;
    editorId: string;
    /** Unique per written snapshot (recovery dismissals are keyed by it). */
    snapshotId: string;
    sessionId: string;
    /** WORK: monotonic revision. RECOVERY: the session's write sequence. */
    revision: number;
    /** RECOVERY: the WORK revision this session had last saved (-1 if none). */
    afterWorkRevision: number;
    createdAt: number;
    /** Semantic hash of the MAIN this content was based on. */
    baseMainHash: string;
    /** Semantic hash of `graph` (diagnostic; always recomputed on read). */
    contentHash: string;
    /** Integrity checksum of JSON.stringify(graph) as written. */
    checksum: string;
    complete: boolean;
    reason: string;
    appVersion: string;
    graph: GraphContent;
}

export type RecordStatus = 'ok' | 'missing' | 'corrupt' | 'invalid' | 'foreign' | 'unsupported' | 'incomplete';

export interface ParsedRecord {
    status: RecordStatus;
    reason: string;
    record: StoredGraphRecord | null;
}

export const buildStoredRecord = (
    fields: Omit<StoredGraphRecord, 'storageVersion' | 'contentHash' | 'checksum' | 'complete' | 'graph'> & { graph: GraphContent }
): StoredGraphRecord => {
    const graph = pickGraphContent(fields.graph);
    return {
        ...fields,
        storageVersion: STORAGE_VERSION,
        graph,
        contentHash: semanticHash(graph),
        checksum: hashString(JSON.stringify(graph)),
        complete: true,
    };
};

/** read -> parse -> verify kind/version/identity/completeness/checksum -> validate. Never throws. */
export const parseStoredRecord = (
    text: string | null | undefined,
    expected: { kind: StoredRecordKind; editorId: string }
): ParsedRecord => {
    if (text === null || text === undefined || text === '') return { status: 'missing', reason: 'not stored', record: null };
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        return { status: 'corrupt', reason: `unreadable JSON (${(error as Error)?.message || 'parse error'})`, record: null };
    }
    if (!isRecord(parsed)) return { status: 'corrupt', reason: 'not an object', record: null };
    if (parsed.kind !== expected.kind) return { status: 'invalid', reason: `unexpected kind ${String(parsed.kind)}`, record: null };
    const version = Number(parsed.storageVersion);
    if (!Number.isFinite(version) || version < 1) return { status: 'invalid', reason: 'missing storage version', record: null };
    if (version > STORAGE_VERSION) return { status: 'unsupported', reason: `written by a newer version (storage v${version})`, record: null };
    if (parsed.editorId !== expected.editorId) return { status: 'foreign', reason: `belongs to graph ${String(parsed.editorId)}`, record: null };
    if (parsed.complete !== true) return { status: 'incomplete', reason: 'snapshot was not completely written', record: null };
    if (!isRecord(parsed.graph)) return { status: 'corrupt', reason: 'graph payload missing', record: null };
    if (typeof parsed.checksum !== 'string' || hashString(JSON.stringify(parsed.graph)) !== parsed.checksum) {
        return { status: 'corrupt', reason: 'checksum mismatch (partial or damaged write)', record: null };
    }
    const validation = validateGraphContent(parsed.graph, { strict: false });
    if (!validation.ok) return { status: 'corrupt', reason: validation.errors.join(' '), record: null };
    const record: StoredGraphRecord = {
        kind: expected.kind,
        storageVersion: version,
        editorId: expected.editorId,
        snapshotId: typeof parsed.snapshotId === 'string' && parsed.snapshotId ? parsed.snapshotId : `unknown-${parsed.checksum}`,
        sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
        revision: Number.isFinite(Number(parsed.revision)) ? Number(parsed.revision) : 0,
        afterWorkRevision: Number.isFinite(Number(parsed.afterWorkRevision)) ? Number(parsed.afterWorkRevision) : -1,
        createdAt: Number.isFinite(Number(parsed.createdAt)) ? Number(parsed.createdAt) : 0,
        baseMainHash: typeof parsed.baseMainHash === 'string' ? parsed.baseMainHash : '',
        contentHash: semanticHash(pickGraphContent(parsed.graph)),
        checksum: parsed.checksum,
        complete: true,
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
        appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : '',
        graph: pickGraphContent(parsed.graph),
    };
    return { status: 'ok', reason: '', record };
};

// ── Startup: which state does the editor open? ───────────────────────────────

export type StartupReason =
    | 'no-work'
    | 'work-equals-main'
    | 'work-based-on-main'
    | 'published-not-saved'
    | 'base-changed';

export interface StartupDecision {
    source: 'main' | 'work' | 'conflict';
    reason: StartupReason;
}

/**
 * WORK is the user's working copy, so a WORK built on the current MAIN is
 * simply reopened (no prompt). If MAIN changed underneath it (page reverted,
 * edited elsewhere, or Save Graph was never followed by saving the page),
 * neither side may silently win: the user chooses, and the side not chosen
 * is kept (MAIN stays in the page, WORK goes to local backups).
 */
export const decideStartup = (input: {
    main: Partial<GraphContent> | null;
    work: StoredGraphRecord | null;
}): StartupDecision => {
    if (!input.work) return { source: 'main', reason: 'no-work' };
    const mainHash = semanticHash(input.main);
    if (semanticEqual(input.work.graph, input.main)) return { source: 'main', reason: 'work-equals-main' };
    if (input.work.baseMainHash === mainHash) return { source: 'work', reason: 'work-based-on-main' };
    if (input.work.baseMainHash === semanticHash(input.work.graph)) return { source: 'conflict', reason: 'published-not-saved' };
    return { source: 'conflict', reason: 'base-changed' };
};

// ── Recovery detection ───────────────────────────────────────────────────────

export interface RecoveryCandidateInput {
    key: string;
    parsed: ParsedRecord;
    /** Legacy (pre-v2) drafts have no session/revision provenance. */
    legacy?: boolean;
}

export type RecoveryDecisionKind =
    | 'prompt'
    | 'equal-to-work'
    | 'equal-to-main'
    | 'superseded'
    | 'dismissed'
    | 'own-session'
    | 'corrupt'
    | 'foreign'
    | 'unsupported';

export interface RecoveryDecision {
    key: string;
    decision: RecoveryDecisionKind;
    reason: string;
    record: StoredGraphRecord | null;
    /** Safe to delete: its content is provably held by WORK or MAIN, or it was dismissed. */
    cleanup: boolean;
    legacy: boolean;
    diffVsWork?: GraphDiff;
    diffVsMain?: GraphDiff;
}

/**
 * Decide, per stored snapshot, whether it may hold user changes that are NOT
 * in the safely stored WORK/MAIN. Read-only: it never replaces or deletes
 * anything itself (the caller acts on `cleanup` / the user's choice).
 *
 * A snapshot is offered back ONLY if all of these hold:
 *   - it is intact (checksum, completeness, version, this graph's id);
 *   - it comes from another (ended) session;
 *   - its canonical content differs from WORK *and* from MAIN;
 *   - the same session did not save a later WORK revision (superseded);
 *   - the user has not dismissed this exact snapshot before.
 * Timestamps are never part of the decision.
 */
export const evaluateRecoveryCandidates = (input: {
    currentSessionId: string;
    main: Partial<GraphContent> | null;
    work: { content: Partial<GraphContent> | null; record: StoredGraphRecord | null };
    candidates: RecoveryCandidateInput[];
    dismissed: ReadonlySet<string>;
}): { decisions: RecoveryDecision[]; prompts: RecoveryDecision[] } => {
    const mainCanonical = canonicalGraphString(input.main);
    const workCanonical = canonicalGraphString(input.work.content);
    const decisions = input.candidates.map((candidate): RecoveryDecision => {
        const base = { key: candidate.key, legacy: Boolean(candidate.legacy) };
        const { parsed } = candidate;
        if (parsed.status !== 'ok' || !parsed.record) {
            const decision: RecoveryDecisionKind = parsed.status === 'foreign'
                ? 'foreign'
                : parsed.status === 'unsupported' ? 'unsupported' : 'corrupt';
            return { ...base, decision, reason: parsed.reason || parsed.status, record: null, cleanup: false };
        }
        const record = parsed.record;
        if (!candidate.legacy && record.sessionId === input.currentSessionId) {
            return { ...base, decision: 'own-session', reason: 'written by the running session', record, cleanup: false };
        }
        const canonical = canonicalGraphString(record.graph);
        if (canonical === workCanonical) {
            return { ...base, decision: 'equal-to-work', reason: 'identical to the working copy', record, cleanup: true };
        }
        if (canonical === mainCanonical) {
            return { ...base, decision: 'equal-to-main', reason: 'identical to the published graph', record, cleanup: true };
        }
        if (input.dismissed.has(record.snapshotId)) {
            return { ...base, decision: 'dismissed', reason: 'dismissed by the user earlier', record, cleanup: true };
        }
        const workRecord = input.work.record;
        if (
            !candidate.legacy
            && workRecord
            && workRecord.sessionId === record.sessionId
            && workRecord.revision > record.afterWorkRevision
        ) {
            return {
                ...base,
                decision: 'superseded',
                reason: `the same session saved a later working copy (revision ${workRecord.revision} > ${record.afterWorkRevision})`,
                record,
                cleanup: true,
            };
        }
        return {
            ...base,
            decision: 'prompt',
            reason: candidate.legacy
                ? 'unsaved draft from the previous editor version differs from the working copy and the published graph'
                : 'contains changes that are in neither the working copy nor the published graph',
            record,
            cleanup: false,
            diffVsWork: diffGraphs(input.work.content, record.graph),
            diffVsMain: diffGraphs(input.main, record.graph),
        };
    });
    const prompts = decisions
        .filter((decision) => decision.decision === 'prompt')
        .sort((a, b) => (b.record?.createdAt || 0) - (a.record?.createdAt || 0));
    return { decisions, prompts };
};

// ── MAIN + HISTORY ───────────────────────────────────────────────────────────

export interface MainMeta {
    formatVersion: number;
    revision: number;
    publishedAt: number;
}

export interface MainHistoryEntry {
    id: string;
    revision: number;
    publishedAt: number;
    /** When it stopped being MAIN. */
    replacedAt: number;
    contentHash: string;
    graph: GraphContent;
}

export const clampHistoryLimit = (value: unknown): number => {
    // Missing / empty is "default", never 0 (Number('') === 0 would turn history off).
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return HISTORY_LIMIT_DEFAULT;
    const numeric = Math.round(Number(value));
    if (!Number.isFinite(numeric)) return HISTORY_LIMIT_DEFAULT;
    return Math.max(HISTORY_LIMIT_MIN, Math.min(HISTORY_LIMIT_MAX, numeric));
};

export const readMainMeta = (raw: unknown): MainMeta => {
    const record = isRecord(raw) ? raw : {};
    const formatVersion = Number(record.formatVersion);
    const revision = Number(record.revision);
    const publishedAt = Number(record.publishedAt ?? record.updatedAt);
    return {
        formatVersion: Number.isFinite(formatVersion) && formatVersion > 0 ? formatVersion : 1,
        revision: Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0,
        publishedAt: Number.isFinite(publishedAt) && publishedAt > 0 ? publishedAt : 0,
    };
};

/** Validates host-stored history; unusable entries are reported, never thrown. */
export const normalizeHistory = (raw: unknown): { entries: MainHistoryEntry[]; dropped: number } => {
    const list = Array.isArray(raw) ? raw : [];
    const entries: MainHistoryEntry[] = [];
    let dropped = 0;
    list.forEach((item, index) => {
        if (!isRecord(item) || !isRecord(item.graph)) {
            dropped += 1;
            return;
        }
        const validation = validateGraphContent(item.graph, { strict: false });
        if (!validation.ok) {
            dropped += 1;
            return;
        }
        const graph = pickGraphContent(item.graph);
        entries.push({
            id: typeof item.id === 'string' && item.id ? item.id : `history-${index}`,
            revision: Number.isFinite(Number(item.revision)) ? Number(item.revision) : 0,
            publishedAt: Number.isFinite(Number(item.publishedAt)) ? Number(item.publishedAt) : 0,
            replacedAt: Number.isFinite(Number(item.replacedAt)) ? Number(item.replacedAt) : 0,
            contentHash: semanticHash(graph),
            graph,
        });
    });
    return { entries, dropped };
};

export interface PublishPlan {
    revision: number;
    publishedAt: number;
    contentHash: string;
    history: MainHistoryEntry[];
    addedToHistory: MainHistoryEntry | null;
    pruned: MainHistoryEntry[];
    unchanged: boolean;
}

/**
 * Prepare (do not commit) the next MAIN + HISTORY. The previous MAIN is put
 * at the head of the history BEFORE pruning, and pruning removes only the
 * oldest entries beyond the limit -- both land in the host in the same
 * atomic update, so a failed publish leaves MAIN and HISTORY untouched.
 *
 * Limit 0 = no previous versions are kept in the page. The replaced MAIN is
 * still saved as a local backup (this browser) by the caller and remains in
 * WordPress / Elementor page revisions.
 */
export const preparePublish = (input: {
    previousMain: Partial<GraphContent> | null;
    previousMeta: MainMeta;
    history: MainHistoryEntry[];
    next: Partial<GraphContent>;
    limit: number;
    now: number;
    makeId: () => string;
}): PublishPlan => {
    const limit = clampHistoryLimit(input.limit);
    const contentHash = semanticHash(input.next);
    const highestKnown = Math.max(input.previousMeta.revision, ...input.history.map((entry) => entry.revision), 0);
    const revision = highestKnown + 1;
    const previousGraph = input.previousMain ? pickGraphContent(input.previousMain) : null;
    const unchanged = previousGraph !== null && semanticEqual(previousGraph, input.next);
    let addedToHistory: MainHistoryEntry | null = null;
    if (previousGraph && !unchanged && !isEffectivelyEmptyGraph(previousGraph)) {
        addedToHistory = {
            id: input.makeId(),
            revision: input.previousMeta.revision,
            publishedAt: input.previousMeta.publishedAt,
            replacedAt: input.now,
            contentHash: semanticHash(previousGraph),
            graph: previousGraph,
        };
    }
    const candidates = addedToHistory ? [addedToHistory, ...input.history] : [...input.history];
    return {
        revision,
        publishedAt: input.now,
        contentHash,
        history: candidates.slice(0, limit),
        addedToHistory,
        pruned: candidates.slice(limit),
        unchanged,
    };
};

// ── Import / export ──────────────────────────────────────────────────────────

export type ExportSourceKind = 'work' | 'main' | 'history' | 'backup';

export interface ExportDocument {
    format: typeof EXPORT_FORMAT;
    formatVersion: number;
    exportedAt: string;
    appVersion: string;
    source: { kind: ExportSourceKind; revision?: number; label?: string };
    contentHash: string;
    stats: { nodes: number; connections: number };
    graph: GraphContent;
}

/** Stable, versioned export. Only authored content: no derived formula, no recovery/session metadata. */
export const buildExportDocument = (
    content: Partial<GraphContent>,
    meta: { source: ExportSourceKind; revision?: number; label?: string; appVersion?: string; now: number }
): ExportDocument => {
    const graph = pickGraphContent(content);
    return {
        format: EXPORT_FORMAT,
        formatVersion: EXPORT_FORMAT_VERSION,
        exportedAt: new Date(meta.now).toISOString(),
        appVersion: meta.appVersion || '',
        source: {
            kind: meta.source,
            ...(typeof meta.revision === 'number' ? { revision: meta.revision } : {}),
            ...(meta.label ? { label: meta.label } : {}),
        },
        contentHash: semanticHash(graph),
        stats: graphStats(graph),
        graph,
    };
};

export const serializeExportDocument = (doc: ExportDocument): string => `${JSON.stringify(doc, null, 2)}\n`;

export type ImportStage = 'read' | 'parse' | 'validate' | 'migrate' | 'verify' | 'done';

export interface ImportResult {
    ok: boolean;
    stage: ImportStage;
    errors: string[];
    warnings: string[];
    sourceFormat: 'export-v1' | 'legacy-state' | null;
    content: GraphContent | null;
    exportedAt: string | null;
}

/**
 * READ -> PARSE -> VALIDATE -> NORMALIZE/MIGRATE -> VERIFY. Pure: it never
 * touches the current graph. The caller asks for confirmation, checkpoints
 * the current WORK, and only then commits the returned content.
 */
export const parseImportText = (
    text: string,
    options: { migrate?: (content: GraphContent) => GraphContent; maxBytes?: number } = {}
): ImportResult => {
    const fail = (stage: ImportStage, errors: string[], warnings: string[] = []): ImportResult => ({
        ok: false, stage, errors, warnings, sourceFormat: null, content: null, exportedAt: null,
    });
    const maxBytes = options.maxBytes ?? GRAPH_LIMITS.maxImportBytes;
    if (typeof text !== 'string' || text.trim() === '') return fail('read', ['The file is empty.']);
    if (text.length > maxBytes) return fail('read', [`The file is too large (${Math.round(text.length / 1024)} KB, limit ${Math.round(maxBytes / 1024)} KB).`]);

    let parsed: unknown;
    try {
        parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    } catch (error) {
        return fail('parse', [`The file is not valid JSON (${(error as Error)?.message || 'parse error'}).`]);
    }
    if (!isRecord(parsed)) return fail('parse', ['The file does not contain a graph.']);

    const warnings: string[] = [];
    let sourceFormat: ImportResult['sourceFormat'];
    let rawGraph: unknown;
    let exportedAt: string | null = null;
    if (parsed.format === EXPORT_FORMAT) {
        const version = Number(parsed.formatVersion);
        if (!Number.isFinite(version) || version < 1) return fail('validate', ['The file has no valid "formatVersion".']);
        if (version > EXPORT_FORMAT_VERSION) {
            return fail('validate', [`The file was created by a newer version of NodeLogic (format ${version}; this editor reads up to ${EXPORT_FORMAT_VERSION}). Update the plugin to import it.`]);
        }
        if (!isRecord(parsed.graph)) return fail('validate', ['The file has no "graph" section.']);
        sourceFormat = 'export-v1';
        rawGraph = parsed.graph;
        exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null;
        if (isComparableHash(parsed.contentHash) && parsed.contentHash !== semanticHash(pickGraphContent(parsed.graph))) {
            warnings.push('The file was modified after it was exported (content hash differs).');
        }
    } else if (parsed.format !== undefined) {
        return fail('validate', [`Unknown file format "${String(parsed.format)}".`]);
    } else if ('elements' in parsed) {
        // Pre-format files: a raw saved graph state / graphState attribute.
        sourceFormat = 'legacy-state';
        rawGraph = parsed;
        warnings.push('Legacy graph file (no format version) - it was converted to the current format.');
    } else {
        return fail('validate', ['This is not a NodeLogic graph file.']);
    }

    const validation = validateGraphContent(rawGraph, { strict: true });
    if (!validation.ok || !validation.content) return fail('validate', validation.errors, [...warnings, ...validation.warnings]);
    warnings.push(...validation.warnings);

    let migrated: GraphContent = validation.content;
    if (options.migrate) {
        try {
            migrated = options.migrate(validation.content);
        } catch (error) {
            return fail('migrate', [`The graph could not be converted to the current format (${(error as Error)?.message || String(error)}).`], warnings);
        }
    }

    const verification = validateGraphContent(migrated, { strict: true });
    if (!verification.ok || !verification.content) {
        return fail('verify', verification.errors.map((message) => `After conversion: ${message}`), warnings);
    }
    return {
        ok: true,
        stage: 'done',
        errors: [],
        warnings,
        sourceFormat,
        content: verification.content,
        exportedAt,
    };
};

// ── Ordered, conflict-safe WORK writes ───────────────────────────────────────

export type CasDecision = 'write' | 'superseded' | 'conflict';

export interface StoredWorkStamp {
    sessionId: string;
    revision: number;
}

export type CasResult =
    | { outcome: 'written' }
    | { outcome: 'superseded' | 'conflict'; stored: StoredWorkStamp | null }
    | { outcome: 'failed'; error: string };

export interface WorkStoreAdapter {
    /**
     * Atomically: read the stamp of the stored WORK, ask `decide`, and write
     * `record` only if it answers 'write'. Sync or async.
     */
    compareAndSwap(record: StoredGraphRecord, decide: (stored: StoredWorkStamp | null) => CasDecision): CasResult | Promise<CasResult>;
}

export type SaveOutcome =
    | { status: 'committed'; revision: number }
    | { status: 'superseded'; revision: number }
    | { status: 'conflict'; revision: number; stored: StoredWorkStamp | null }
    | { status: 'failed'; revision: number; error: string };

const isThenable = <T>(value: unknown): value is Promise<T> =>
    Boolean(value) && typeof (value as { then?: unknown }).then === 'function';

/**
 * Every save takes a revision when it STARTS (monotonic, never reused, seeded
 * from the stored revision so it is monotonic across sessions too). The
 * commit is a compare-and-swap against what is stored at commit time:
 *   - stored by this session with a revision >= mine  -> 'superseded'
 *     (an older save finishing late never replaces a newer one);
 *   - stored by another session/tab since this one last read or wrote it
 *     -> 'conflict' (never silently overwrite someone else's work);
 *   - otherwise write.
 */
export const createWorkSaveCoordinator = (options: {
    adapter: WorkStoreAdapter;
    sessionId: string;
    known: StoredWorkStamp | null;
}) => {
    let issued = Math.max(0, options.known?.revision ?? 0);
    let known: StoredWorkStamp | null = options.known;
    let committed = known?.sessionId === options.sessionId ? known.revision : 0;

    const decideFor = (revision: number) => (stored: StoredWorkStamp | null): CasDecision => {
        if (stored && stored.sessionId === options.sessionId && stored.revision >= revision) return 'superseded';
        if (stored && stored.sessionId !== options.sessionId) {
            if (!known || known.sessionId !== stored.sessionId || known.revision !== stored.revision) return 'conflict';
        }
        // Nothing stored (first save, or the stored copy was removed): write.
        return 'write';
    };

    const finish = (revision: number, result: CasResult): SaveOutcome => {
        if (result.outcome === 'written') {
            if (revision > committed) {
                committed = revision;
                known = { sessionId: options.sessionId, revision };
            }
            return { status: 'committed', revision };
        }
        if (result.outcome === 'failed') return { status: 'failed', revision, error: result.error };
        if (result.outcome === 'superseded') return { status: 'superseded', revision };
        return { status: 'conflict', revision, stored: result.stored };
    };

    return {
        /** `build` receives the revision this save owns. */
        save(build: (revision: number) => StoredGraphRecord): SaveOutcome | Promise<SaveOutcome> {
            const revision = ++issued;
            let record: StoredGraphRecord;
            try {
                record = build(revision);
            } catch (error) {
                return { status: 'failed', revision, error: `could not prepare the snapshot: ${(error as Error)?.message || String(error)}` };
            }
            let result: CasResult | Promise<CasResult>;
            try {
                result = options.adapter.compareAndSwap(record, decideFor(revision));
            } catch (error) {
                return { status: 'failed', revision, error: (error as Error)?.message || String(error) };
            }
            if (isThenable<CasResult>(result)) {
                return result.then(
                    (resolved) => finish(revision, resolved),
                    (error) => ({ status: 'failed' as const, revision, error: (error as Error)?.message || String(error) })
                );
            }
            return finish(revision, result);
        },
        /** After the user explicitly resolves a conflict in favour of this session. */
        adoptStored(stamp: StoredWorkStamp | null) {
            known = stamp;
            if (stamp) issued = Math.max(issued, stamp.revision);
        },
        get committedRevision() { return committed; },
        get known() { return known; },
    };
};

export type WorkSaveCoordinator = ReturnType<typeof createWorkSaveCoordinator>;

// ── Browser storage (localStorage) ───────────────────────────────────────────

export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    key(index: number): string | null;
    readonly length: number;
}

export interface BackupEntry {
    id: string;
    reason: string;
    label: string;
    createdAt: number;
    contentHash: string;
    checksum: string;
    graph: GraphContent;
}

export interface StorageWriteResult {
    ok: boolean;
    error?: string;
    quota?: boolean;
}

const isQuotaError = (error: unknown): boolean => {
    const name = String((error as { name?: unknown })?.name || '');
    const code = Number((error as { code?: unknown })?.code);
    return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
};

export const storageKeys = (editorId: string) => {
    const base = `nodelogic.graph.v2.${editorId}`;
    return {
        work: `${base}.work`,
        recoveryPrefix: `${base}.recovery.`,
        recovery: (sessionId: string) => `${base}.recovery.${sessionId}`,
        backups: `${base}.backups`,
        dismissed: `${base}.dismissed`,
        legacyAutosave: `formulaEditor.autosave.${editorId}`,
        legacySave: `formulaEditor.save.${editorId}`,
    };
};

/**
 * All localStorage access for one graph. Every failure is returned (and the
 * caller surfaces it) -- nothing is swallowed.
 */
export const createGraphStorage = (storage: StorageLike | null, editorId: string) => {
    const keys = storageKeys(editorId);
    const available = Boolean(storage);

    const read = (key: string): { ok: boolean; value: string | null; error?: string } => {
        if (!storage) return { ok: false, value: null, error: 'storage unavailable' };
        try {
            return { ok: true, value: storage.getItem(key) };
        } catch (error) {
            return { ok: false, value: null, error: (error as Error)?.message || String(error) };
        }
    };

    const write = (key: string, value: string): StorageWriteResult => {
        if (!storage) return { ok: false, error: 'storage unavailable' };
        try {
            storage.setItem(key, value);
        } catch (error) {
            return { ok: false, error: (error as Error)?.message || String(error), quota: isQuotaError(error) };
        }
        // Verify: what is stored is exactly what we meant to store.
        const check = read(key);
        if (!check.ok || check.value !== value) return { ok: false, error: 'read-back verification failed' };
        return { ok: true };
    };

    const remove = (key: string): StorageWriteResult => {
        if (!storage) return { ok: false, error: 'storage unavailable' };
        try {
            storage.removeItem(key);
            return { ok: true };
        } catch (error) {
            return { ok: false, error: (error as Error)?.message || String(error) };
        }
    };

    const stampOf = (text: string | null): StoredWorkStamp | null => {
        if (!text) return null;
        try {
            const parsed = JSON.parse(text);
            if (!isRecord(parsed)) return { sessionId: '?', revision: Number.MAX_SAFE_INTEGER };
            return {
                sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '?',
                revision: Number.isFinite(Number(parsed.revision)) ? Number(parsed.revision) : 0,
            };
        } catch {
            // Unreadable WORK is somebody's data too: never overwrite it blindly.
            return { sessionId: '?corrupt', revision: Number.MAX_SAFE_INTEGER };
        }
    };

    const readJsonList = (key: string): unknown[] => {
        const result = read(key);
        if (!result.ok || !result.value) return [];
        try {
            const parsed = JSON.parse(result.value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    const readBackups = (): BackupEntry[] => readJsonList(keys.backups)
        .filter((item): item is Record<string, unknown> => isRecord(item) && isRecord(item.graph))
        .filter((item) => typeof item.checksum === 'string' && hashString(JSON.stringify(item.graph)) === item.checksum)
        .map((item) => ({
            id: String(item.id || ''),
            reason: String(item.reason || ''),
            label: String(item.label || ''),
            createdAt: Number(item.createdAt) || 0,
            contentHash: semanticHash(pickGraphContent(item.graph)),
            checksum: String(item.checksum),
            graph: pickGraphContent(item.graph),
        }));

    return {
        keys,
        available,
        readWork(): ParsedRecord {
            const result = read(keys.work);
            if (!result.ok) return { status: 'missing', reason: result.error || 'unreadable', record: null };
            return parseStoredRecord(result.value, { kind: 'nodelogic-work', editorId });
        },
        readWorkStamp(): StoredWorkStamp | null {
            return stampOf(read(keys.work).value);
        },
        /**
         * Move an unusable stored WORK (damaged, foreign, newer format) aside
         * byte-for-byte instead of overwriting it, so the next WORK write can
         * proceed and the original stays inspectable.
         */
        quarantineWork(at: number): StorageWriteResult & { quarantineKey?: string } {
            const current = read(keys.work);
            if (!current.ok) return { ok: false, error: current.error };
            if (current.value === null) return { ok: true };
            const quarantineKey = `${keys.work}.quarantine.${at}`;
            const copied = write(quarantineKey, current.value);
            if (!copied.ok) return copied;
            const removed = remove(keys.work);
            return removed.ok ? { ok: true, quarantineKey } : removed;
        },
        adapter: {
            compareAndSwap(record: StoredGraphRecord, decide: (stored: StoredWorkStamp | null) => CasDecision): CasResult {
                const current = read(keys.work);
                if (!current.ok) return { outcome: 'failed', error: current.error || 'unreadable' };
                const stored = stampOf(current.value);
                const decision = decide(stored);
                if (decision !== 'write') return { outcome: decision, stored };
                const result = write(keys.work, JSON.stringify(record));
                return result.ok ? { outcome: 'written' } : { outcome: 'failed', error: `${result.error}${result.quota ? ' (storage full)' : ''}` };
            },
        } as WorkStoreAdapter,
        writeRecovery(record: StoredGraphRecord): StorageWriteResult {
            return write(keys.recovery(record.sessionId), JSON.stringify(record));
        },
        listRecoveries(): RecoveryCandidateInput[] {
            if (!storage) return [];
            const found: string[] = [];
            try {
                for (let i = 0; i < storage.length; i++) {
                    const key = storage.key(i);
                    if (key && key.startsWith(keys.recoveryPrefix)) found.push(key);
                }
            } catch {
                return [];
            }
            return found.map((key) => ({
                key,
                parsed: parseStoredRecord(read(key).value, { kind: 'nodelogic-recovery', editorId }),
            }));
        },
        readLegacyDrafts(): Array<{ key: string; raw: unknown }> {
            return [keys.legacyAutosave, keys.legacySave]
                .map((key) => {
                    const result = read(key);
                    if (!result.ok || !result.value) return null;
                    try {
                        return { key, raw: JSON.parse(result.value) as unknown };
                    } catch {
                        return { key, raw: null };
                    }
                })
                .filter((item): item is { key: string; raw: unknown } => item !== null);
        },
        remove,
        readBackups,
        /** Newest first; deduplicated by content; evicts the oldest on quota pressure. */
        pushBackup(entry: { reason: string; label: string; graph: GraphContent; createdAt: number; id: string }): StorageWriteResult {
            const graph = pickGraphContent(entry.graph);
            const contentHash = semanticHash(graph);
            const next: BackupEntry = { ...entry, graph, contentHash, checksum: hashString(JSON.stringify(graph)) };
            let list = [next, ...readBackups().filter((item) => item.contentHash !== contentHash)].slice(0, BACKUP_LIMIT);
            let result = write(keys.backups, JSON.stringify(list));
            while (!result.ok && result.quota && list.length > 1) {
                list = list.slice(0, -1);
                result = write(keys.backups, JSON.stringify(list));
            }
            return result;
        },
        readDismissed(): Set<string> {
            return new Set(readJsonList(keys.dismissed)
                .map((item) => (isRecord(item) ? item.snapshotId : item))
                .filter((id): id is string => typeof id === 'string' && id !== ''));
        },
        addDismissed(snapshotId: string, at: number): StorageWriteResult {
            const list = readJsonList(keys.dismissed)
                .filter((item) => isRecord(item) && item.snapshotId !== snapshotId)
                .slice(-(DISMISSED_LIMIT - 1));
            return write(keys.dismissed, JSON.stringify([...list, { snapshotId, at }]));
        },
    };
};

export type GraphStorage = ReturnType<typeof createGraphStorage>;

/** Wrap a pre-v2 draft (formulaEditor.autosave/save) as a recovery candidate. */
export const legacyDraftCandidate = (
    key: string,
    raw: unknown,
    editorId: string,
    normalize: (content: GraphContent) => GraphContent
): RecoveryCandidateInput => {
    const validation = validateGraphContent(raw, { strict: false });
    if (!validation.ok || !validation.content) {
        return { key, legacy: true, parsed: { status: 'corrupt', reason: validation.errors.join(' ') || 'unreadable legacy draft', record: null } };
    }
    let graph: GraphContent;
    try {
        graph = pickGraphContent(normalize(validation.content));
    } catch (error) {
        return { key, legacy: true, parsed: { status: 'corrupt', reason: `legacy draft could not be migrated: ${(error as Error)?.message || String(error)}`, record: null } };
    }
    const updatedAt = isRecord(raw) && Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0;
    const record = buildStoredRecord({
        kind: 'nodelogic-recovery',
        editorId,
        snapshotId: `legacy:${semanticHash(graph)}`,
        sessionId: 'legacy',
        revision: 0,
        afterWorkRevision: -1,
        createdAt: updatedAt,
        baseMainHash: '',
        reason: key.includes('.autosave.') ? 'legacy-autosave' : 'legacy-save',
        appVersion: '',
        graph,
    });
    return { key, legacy: true, parsed: { status: 'ok', reason: '', record } };
};

// ── Diagnostics ──────────────────────────────────────────────────────────────

export interface PersistenceLogEntry {
    at: number;
    event: string;
    editorId: string;
    details?: Record<string, unknown>;
}

/**
 * Structured log of persistence decisions (hashes, revisions, reasons --
 * never graph content). Answers "why did the editor offer a recovery?".
 */
export const createPersistenceLog = (
    editorId: string,
    sink: (entry: PersistenceLogEntry) => void
) => (event: string, details?: Record<string, unknown>) => {
    try {
        sink({ at: Date.now(), event, editorId, ...(details ? { details } : {}) });
    } catch {
        // A broken log sink must never break saving.
    }
};
