export interface CustomNodeUiNode {
    id: string;
    kind: 'container' | 'field';
    parentId: string | null;
    sortOrder: number;
    label: string;
    fieldId?: string;
    fieldType?: string;
    slot?: number;
    rows?: number;
    columns?: number;
}

export interface CustomNodeUiSharedVariable {
    id: string;
    label: string;
    path: string;
    type: 'number' | 'string' | 'boolean' | 'color' | 'zip' | 'case';
    sourceNodeId?: string;
}

export interface CustomNodeUiState {
    enabled: boolean;
    displayMode: 'item' | 'standalone';
    nodes: CustomNodeUiNode[];
    sharedVariables: CustomNodeUiSharedVariable[];
}

export interface GraphSnapshot {
    elements: unknown[];
    connections: unknown[];
    mainFormula: string;
    eventFormulas: Record<string, string>;
    customNodeUi?: CustomNodeUiState | null;
    updatedAt: number;
}

const toList = (value: unknown): unknown[] => {
    if (Array.isArray(value)) {
        return value;
    }

    if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).map(([key, item]) => {
            if (item && typeof item === 'object') {
                const record = item as Record<string, unknown>;
                if (!('id' in record)) {
                    return { ...record, id: key };
                }
            }
            return item;
        });
    }

    return [];
};

const normalizeCustomNodeUiNode = (raw: unknown, index: number): CustomNodeUiNode | null => {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const item = raw as Record<string, unknown>;
    const kind = String(item.kind ?? '').trim().toLowerCase();
    if (kind !== 'container' && kind !== 'field' && kind !== 'image') {
        return null;
    }

    const id = typeof item.id === 'string' && item.id.trim() !== ''
        ? item.id.trim()
        : `ui-node-${index + 1}`;
    const parentId = typeof item.parentId === 'string' && item.parentId.trim() !== ''
        ? item.parentId.trim()
        : null;
    const sortOrder = Number.isFinite(Number(item.sortOrder)) ? Math.max(0, Math.round(Number(item.sortOrder))) : index;

    return {
        id,
        kind,
        parentId,
        sortOrder,
        label: typeof item.label === 'string' && item.label.trim() !== '' ? item.label.trim() : (kind === 'container' ? 'Container' : 'Field'),
        fieldId: typeof item.fieldId === 'string' && item.fieldId.trim() !== '' ? item.fieldId.trim() : undefined,
        fieldType: typeof item.fieldType === 'string' && item.fieldType.trim() !== '' ? item.fieldType.trim() : undefined,
        slot: Number.isFinite(Number(item.slot)) ? Math.max(0, Math.round(Number(item.slot))) : undefined,
        rows: Number.isFinite(Number(item.rows)) ? Math.max(1, Math.min(12, Math.round(Number(item.rows)))) : undefined,
        columns: Number.isFinite(Number(item.columns)) ? Math.max(1, Math.min(12, Math.round(Number(item.columns)))) : undefined,
    };
};

const normalizeCustomNodeUiSharedVariable = (raw: unknown, index: number): CustomNodeUiSharedVariable | null => {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const item = raw as Record<string, unknown>;
    const type = String(item.type ?? '').trim().toLowerCase();
    const normalizedType: CustomNodeUiSharedVariable['type'] = (
        type === 'string'
        || type === 'boolean'
        || type === 'color'
        || type === 'zip'
        || type === 'case'
    ) ? type : 'number';

    const id = typeof item.id === 'string' && item.id.trim() !== ''
        ? item.id.trim()
        : `shared-var-${index + 1}`;
    const label = typeof item.label === 'string' && item.label.trim() !== ''
        ? item.label.trim()
        : `Shared ${index + 1}`;
    const path = typeof item.path === 'string' && item.path.trim() !== ''
        ? item.path.trim()
        : `o${index}`;
    const sourceNodeId = typeof item.sourceNodeId === 'string' && item.sourceNodeId.trim() !== ''
        ? item.sourceNodeId.trim()
        : undefined;

    return {
        id,
        label,
        path,
        type: normalizedType,
        sourceNodeId,
    };
};

export const normalizeCustomNodeUiState = (raw: unknown): CustomNodeUiState | null => {
    if (!raw || typeof raw !== 'object') {
        return null;
    }

    const data = raw as Record<string, unknown>;
    const nodesSource = Array.isArray(data.nodes)
        ? data.nodes
        : Array.isArray(data.layout)
            ? data.layout
            : [];

    const nodes = nodesSource
        .map((item, index) => normalizeCustomNodeUiNode(item, index))
        .filter((item): item is CustomNodeUiNode => Boolean(item))
        .sort((a, b) => a.sortOrder - b.sortOrder);

    const sharedVariablesSource = Array.isArray(data.sharedVariables) ? data.sharedVariables : [];
    const derivedSharedVariables = nodes
        .filter((node) => (node.kind === 'field' || node.kind === 'image') && typeof node.fieldId === 'string' && node.fieldId.trim() !== '')
        .map((node, index) => ({
            id: node.fieldId || `shared-var-${index + 1}`,
            label: node.label || node.fieldId || `Shared ${index + 1}`,
            path: node.fieldId || `o${index}`,
            type: (() => {
                if (node.kind === 'image') {
                    return 'string' as CustomNodeUiSharedVariable['type'];
                }
                const candidate = String(node.fieldType ?? '').trim().toLowerCase();
                if (candidate === 'string' || candidate === 'boolean' || candidate === 'color' || candidate === 'zip' || candidate === 'case') {
                    return candidate;
                }
                return 'number';
            })() as CustomNodeUiSharedVariable['type'],
            sourceNodeId: node.parentId || undefined,
        }));

    const sharedVariables = [...sharedVariablesSource, ...derivedSharedVariables]
        .map((item, index) => normalizeCustomNodeUiSharedVariable(item, index))
        .filter((item): item is CustomNodeUiSharedVariable => Boolean(item))
        .reduce<CustomNodeUiSharedVariable[]>((acc, item) => {
            if (!acc.some((existing) => existing.path === item.path)) {
                acc.push(item);
            }
            return acc;
        }, []);

    return {
        enabled: Boolean(data.enabled),
        displayMode: data.displayMode === 'standalone' ? 'standalone' : 'item',
        nodes,
        sharedVariables,
    };
};

export const normalizeSnapshot = (raw: unknown): GraphSnapshot | null => {
    if (!raw) {
        return null;
    }

    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const data = parsed as {
            elements?: unknown;
            connections?: unknown;
            mainFormula?: unknown;
            eventFormulas?: unknown;
            customNodeUi?: unknown;
            formula?: unknown; // backward compatibility
            updatedAt?: unknown;
        };

        return {
            elements: toList(data.elements),
            connections: toList(data.connections),
            mainFormula: typeof data.mainFormula === 'string' ? data.mainFormula : (typeof data.formula === 'string' ? data.formula : ''),
            eventFormulas: (data.eventFormulas && typeof data.eventFormulas === 'object') ? data.eventFormulas as Record<string, string> : {},
            customNodeUi: normalizeCustomNodeUiState(data.customNodeUi),
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
        };
    } catch (error) {
        return null;
    }
};

const getCompletenessScore = (snapshot: GraphSnapshot): number => {
    const connectionsScore = snapshot.connections.length * 1000;
    const elementsScore = Math.max(snapshot.elements.length - 1, 0) * 10;
    const formulaScore = snapshot.formula ? 1 : 0;
    const customUiScore = snapshot.customNodeUi?.enabled ? 50 : 0;
    const customUiNodeScore = Array.isArray(snapshot.customNodeUi?.nodes) ? snapshot.customNodeUi!.nodes.length * 5 : 0;
    const customUiSharedVariableScore = Array.isArray(snapshot.customNodeUi?.sharedVariables) ? snapshot.customNodeUi!.sharedVariables.length * 5 : 0;
    return connectionsScore + elementsScore + formulaScore + customUiScore + customUiNodeScore + customUiSharedVariableScore;
};

export const resolveInitialSnapshot = (...candidates: Array<GraphSnapshot | null>): GraphSnapshot | null => {
    const valid = candidates.filter((candidate): candidate is GraphSnapshot => Boolean(candidate));
    if (valid.length === 0) {
        return null;
    }

    const newest = [...valid].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const richest = [...valid].sort((a, b) => {
        const scoreDiff = getCompletenessScore(b) - getCompletenessScore(a);
        if (scoreDiff !== 0) {
            return scoreDiff;
        }
        return b.updatedAt - a.updatedAt;
    })[0];

    const newestLooksEmpty = newest.connections.length === 0 && newest.elements.length <= 1;
    if (newestLooksEmpty && getCompletenessScore(richest) > getCompletenessScore(newest)) {
        return richest;
    }

    const sameFormula = newest.formula === richest.formula;
    if (sameFormula && newest.connections.length === 0 && richest.connections.length > 0) {
        return richest;
    }

    return newest;
};
