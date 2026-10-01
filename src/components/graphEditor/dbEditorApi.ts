// Editor-side support for PRO Database nodes: schema lookups and the admin
// signature request. Every call goes to admin-only REST routes (the PRO
// plugin's db-rest.php); nothing here is used on the live site.

export type DbEditorConnection = {
    id: string;
    label: string;
    type: string;
    status: string;
    defaultDatabase: string;
    databases: string[];
    error?: string;
};

export type DbColumnInfo = {
    name: string;
    type: string;
    nullable: boolean;
    key: string;
    autoIncrement: boolean;
};

type DbGraphElement = { id: string; type: string; data?: Record<string, any> };
type DbGraphConnection = { fromId: string; toId: string; toInput: string; fromOutput?: string };

export const DB_OP_TYPES = new Set(['db-select', 'db-insert', 'db-update', 'db-delete']);
export const DB_CHAIN_TYPES = new Set(['db-fields', 'db-join', 'db-filter', 'db-sort']);
export const DB_NODE_TYPES = new Set(['db-connect', 'db-table', ...DB_CHAIN_TYPES, ...DB_OP_TYPES]);

export type DbApiConfig = { restUrl: string; nonce: string; canManage: boolean; adminUrl: string };

export const getDbApiConfig = (): DbApiConfig | null => {
    if (typeof window === 'undefined') return null;
    const config = (window as any).calcgraphProEditorConfig || {};
    if (!config.restUrl || !config.restNonce) return null;
    return {
        restUrl: String(config.restUrl),
        nonce: String(config.restNonce),
        canManage: config.canManageDatabase === true || config.canManageDatabase === 1 || config.canManageDatabase === '1',
        // NodeLogic > Database (admin page); only http(s) links are accepted.
        adminUrl: /^https?:\/\//i.test(String(config.dbAdminUrl || '')) ? String(config.dbAdminUrl) : '',
    };
};

export const dbApiFetch = async <T = any>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> => {
    const config = getDbApiConfig();
    if (!config) throw new Error('NodeLogic Pro is not active.');
    const response = await fetch(config.restUrl + path, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': config.nonce },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data: any = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
        throw new Error((data && data.message) || `HTTP ${response.status}`);
    }
    return data as T;
};

/**
 * The post being edited -- DB signatures are bound to it. Gutenberg exposes
 * it through core/editor; Elementor through its document config. 0 when
 * unknown (e.g. a site-editor template), in which case signing refuses.
 */
export const resolveEditorPostId = (): number => {
    if (typeof window === 'undefined') return 0;
    const w = window as any;
    const candidates: unknown[] = [];
    try { candidates.push(w.wp?.data?.select?.('core/editor')?.getCurrentPostId?.()); } catch { /* not Gutenberg */ }
    try { candidates.push(w.elementor?.config?.document?.id); } catch { /* not Elementor */ }
    try { candidates.push(w.elementor?.documents?.getCurrent?.()?.id); } catch { /* not Elementor */ }
    for (const candidate of candidates) {
        const id = Number(candidate);
        if (Number.isInteger(id) && id > 0) return id;
    }
    return 0;
};

export const dbColumnsCacheKey = (connectionId: string, database: string, table: string): string => `${connectionId}|${database}|${table}`;
export const dbTablesCacheKey = (connectionId: string, database: string): string => `${connectionId}|${database}`;

export type DbChainInfo = {
    connectNode: DbGraphElement | null;
    tableNode: DbGraphElement | null;
    connectionId: string;
    database: string;
    table: string;
    joinTables: string[];
    chainIds: string[]; // upstream nodes (excluding the node itself): connect, table, then the chain
};

/**
 * Walks input0 upstream from a DB node to its DB Table, then from DB Table's
 * Connection pin to its DB Connect -- the same path the server's
 * calcgraph_db_derive_spec follows (bounded, cycle-safe).
 */
export const resolveDbChain = (
    nodeId: string,
    elements: DbGraphElement[],
    connections: DbGraphConnection[],
): DbChainInfo => {
    const byId = new Map(elements.map((el) => [el.id, el]));
    const inputOf = (id: string): string | null => {
        const match = connections.find((c) => c.toId === id && c.toInput === 'input0');
        return match ? match.fromId : null;
    };
    const chain: DbGraphElement[] = [];
    const visited = new Set<string>([nodeId]);
    const self = byId.get(nodeId);
    let connectNode: DbGraphElement | null = self && self.type === 'db-connect' ? self : null;
    let tableNode: DbGraphElement | null = self && self.type === 'db-table' ? self : null;
    let current = tableNode || connectNode ? null : inputOf(nodeId);
    while (current && !visited.has(current) && chain.length <= 32) {
        visited.add(current);
        const node = byId.get(current);
        if (!node) break;
        if (node.type === 'db-table') { tableNode = node; break; }
        if (!DB_CHAIN_TYPES.has(node.type)) break;
        chain.push(node);
        current = inputOf(current);
    }
    if (tableNode && !connectNode) {
        const upstream = byId.get(inputOf(tableNode.id) || '');
        connectNode = upstream && upstream.type === 'db-connect' ? upstream : null;
    }
    chain.reverse();
    const joinTables = chain
        .filter((node) => node.type === 'db-join')
        .map((node) => String(node.data?.dbJoinTable || ''))
        .filter(Boolean);
    return {
        connectNode,
        tableNode,
        connectionId: String(connectNode?.data?.dbConnectionId || 'wp'),
        database: String(connectNode?.data?.dbDatabase || ''),
        // No table without a connection+database to resolve it against.
        table: connectNode ? String(tableNode?.data?.dbTable || '') : '',
        joinTables,
        chainIds: [
            ...(connectNode ? [connectNode.id] : []),
            ...(tableNode ? [tableNode.id] : []),
            ...chain.map((node) => node.id),
        ],
    };
};

const SIGNATURE_FIELDS = new Set(['dbSignature', 'dbSignatureError']);

const stripSignature = (data: Record<string, any> | undefined): Record<string, any> => {
    const out: Record<string, any> = {};
    Object.keys(data || {}).sort().forEach((key) => {
        if (!SIGNATURE_FIELDS.has(key)) out[key] = (data as Record<string, any>)[key];
    });
    return out;
};

/**
 * Everything the server's signed spec depends on for one operation node --
 * its own config, its whole upstream chain's config, which of their pins
 * are wired, and the page/block it lives in. Re-signing is requested only
 * when this changes, so moving nodes around never hits the server.
 */
export const computeDbSignFingerprint = (
    opNodeId: string,
    elements: DbGraphElement[],
    connections: DbGraphConnection[],
    postId: number,
    editorId: string,
): string => {
    const op = elements.find((el) => el.id === opNodeId);
    if (!op) return '';
    const chain = resolveDbChain(opNodeId, elements, connections);
    const involved = new Set<string>([opNodeId, ...chain.chainIds]);
    const nodes = elements
        .filter((el) => involved.has(el.id))
        .map((el) => ({ id: el.id, type: el.type, data: stripSignature(el.data) }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const wiring = connections
        .filter((c) => involved.has(c.toId))
        .map((c) => `${c.fromId}>${c.toId}:${c.toInput}`)
        .sort();
    return JSON.stringify({ postId, editorId, nodes, wiring });
};
