import { normalizeSnapshot } from './persistence';

export interface GraphTemplate {
    id: string;
    name: string;
    state: ReturnType<typeof normalizeSnapshot>;
    updatedAt: number;
}

export interface GraphCustomNode {
    id: string;
    name: string;
    state: ReturnType<typeof normalizeSnapshot>;
    inputSchema: Array<{
        id: string;
        label: string;
        type: 'number' | 'string' | 'boolean' | 'color' | 'zip' | 'case';
        defaultValue?: string;
        sourceNodeId?: string;
        sourcePin?: string;
    }>;
    outputSchema: Array<{
        id: string;
        label: string;
        type: 'number' | 'string' | 'boolean' | 'color' | 'zip' | 'case';
        defaultValue?: string;
        sourceNodeId?: string;
        sourcePin?: string;
    }>;
    updatedAt: number;
}

interface ApiFetchOptions {
    path: string;
    method?: string;
    data?: unknown;
}

type ApiFetchFn = (options: ApiFetchOptions) => Promise<unknown>;

const asRecord = (value: unknown): Record<string, unknown> => {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
};

const getApiFetch = (): ApiFetchFn => {
    const win = typeof window !== 'undefined'
        ? (window as Window & { wp?: { apiFetch?: ApiFetchFn }; wpApiSettings?: { nonce?: string } })
        : undefined;

    const wpApiFetch = win?.wp?.apiFetch;
    if (typeof wpApiFetch === 'function') {
        return wpApiFetch;
    }

    return async ({ path, method = 'GET', data }: ApiFetchOptions) => {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        const nonce = win?.wpApiSettings?.nonce;
        if (nonce) {
            headers['X-WP-Nonce'] = nonce;
        }

        let url = `/wp-json${path}`;
        if (method === 'GET') {
            const separator = path.includes('?') ? '&' : '?';
            url += `${separator}_t=${Date.now()}`;
        }

        const response = await fetch(url, {
            method,
            headers,
            body: method === 'GET' ? undefined : JSON.stringify(data || {}),
            credentials: 'same-origin',
        });

        if (!response.ok) {
            let errorMessage = `API request failed (${response.status})`;
            try {
                const body = await response.json() as { message?: unknown };
                if (body && typeof body.message === 'string' && body.message.trim()) {
                    errorMessage = body.message;
                }
            } catch {
                // keep fallback message
            }
            throw new Error(errorMessage);
        }

        return response.json();
    };
};

const apiFetch = getApiFetch();

const normalizeSchemaPin = (
    raw: unknown
): GraphCustomNode['inputSchema'][number] => {
    const item = asRecord(raw);
    const idRaw = typeof item.id === 'string' ? item.id : '';
    const labelRaw = typeof item.label === 'string' ? item.label : '';
    const typeRaw = String(item.type ?? '').trim().toLowerCase();
    const type = (
        typeRaw === 'string'
        || typeRaw === 'boolean'
        || typeRaw === 'color'
        || typeRaw === 'zip'
        || typeRaw === 'case'
    ) ? typeRaw : 'number';

    return {
        id: idRaw || `pin-${Math.random().toString(36).slice(2, 8)}`,
        label: labelRaw || 'Pin',
        type,
        defaultValue: typeof item.defaultValue === 'string' ? item.defaultValue : '',
        sourceNodeId: typeof item.sourceNodeId === 'string' ? item.sourceNodeId : '',
        sourcePin: typeof item.sourcePin === 'string' ? item.sourcePin : '',
    };
};

const normalizeGraphCustomNode = (item: unknown): GraphCustomNode | null => {
    if (!item || typeof item !== 'object') return null;
    const raw = item as Record<string, unknown>;

    const id = typeof raw.id === 'string' ? raw.id : '';
    const name = typeof raw.name === 'string' ? raw.name : '';
    if (!id || !name) return null;

    const inputSchema = Array.isArray(raw.inputSchema)
        ? raw.inputSchema.map(normalizeSchemaPin)
        : [];
    const outputSchema = Array.isArray(raw.outputSchema)
        ? raw.outputSchema.map(normalizeSchemaPin)
        : [];

    return {
        id,
        name,
        state: normalizeSnapshot(raw.state),
        inputSchema,
        outputSchema,
        updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
    };
};

export const fetchGraphTemplates = async (bust = false): Promise<GraphTemplate[]> => {
    const path = bust ? `/calcgraph/v1/templates?_t=${Date.now()}` : '/calcgraph/v1/templates';
    const response = await apiFetch({ path });
    if (!Array.isArray(response)) {
        return [];
    }

    return response
        .map((item) => {
            if (!item || typeof item !== 'object') {
                return null;
            }

            const raw = item as {
                id?: unknown;
                name?: unknown;
                state?: unknown;
                updatedAt?: unknown;
            };

            const id = typeof raw.id === 'string' ? raw.id : '';
            const name = typeof raw.name === 'string' ? raw.name : '';
            if (!id || !name) {
                return null;
            }

            return {
                id,
                name,
                state: normalizeSnapshot(raw.state),
                updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
            };
        })
        .filter((item): item is GraphTemplate => Boolean(item));
};

export const fetchGraphCustomNodes = async (bust = false): Promise<GraphCustomNode[]> => {
    const path = bust ? `/calcgraph/v1/custom-nodes?_t=${Date.now()}` : '/calcgraph/v1/custom-nodes';
    const response = await apiFetch({ path });
    if (!Array.isArray(response)) {
        return [];
    }

    return response
        .map((item) => normalizeGraphCustomNode(item))
        .filter((item): item is GraphCustomNode => Boolean(item));
};

export const saveGraphCustomNode = async (
    payload: {
        name: string;
        state: unknown;
        id?: string;
        inputSchema?: GraphCustomNode['inputSchema'];
        outputSchema?: GraphCustomNode['outputSchema'];
    }
): Promise<GraphCustomNode> => {
    const response = await apiFetch({
        path: '/calcgraph/v1/custom-nodes',
        method: 'POST',
        data: {
            id: payload.id || '',
            name: payload.name,
            state: payload.state,
            inputSchema: payload.inputSchema || [],
            outputSchema: payload.outputSchema || [],
        },
    });

    const normalized = normalizeGraphCustomNode(response);
    if (!normalized) {
        throw new Error('Unable to save custom node.');
    }
    return normalized;
};

export const deleteGraphCustomNode = async (id: string): Promise<void> => {
    await apiFetch({
        path: `/calcgraph/v1/custom-nodes/${id}`,
        method: 'DELETE',
    });
};

export const exportGraphTemplates = async (): Promise<{ templates: GraphTemplate[] }> => {
    const response = await apiFetch({ path: '/calcgraph/v1/templates/export' });
    const data = asRecord(response);
    const templates = Array.isArray(data.templates)
        ? data.templates
            .map((item) => {
                const normalized = item && typeof item === 'object' ? item as Record<string, unknown> : null;
                if (!normalized) return null;
                const id = typeof normalized.id === 'string' ? normalized.id : '';
                const name = typeof normalized.name === 'string' ? normalized.name : '';
                if (!id || !name) return null;
                return {
                    id,
                    name,
                    state: normalizeSnapshot(normalized.state),
                    updatedAt: typeof normalized.updatedAt === 'number' ? normalized.updatedAt : 0,
                };
            })
            .filter((item): item is GraphTemplate => Boolean(item))
        : [];

    return { templates };
};

export const importGraphTemplates = async (templates: unknown): Promise<void> => {
    await apiFetch({
        path: '/calcgraph/v1/templates/import',
        method: 'POST',
        data: { templates },
    });
};

export const exportGraphCustomNodes = async (): Promise<{ customNodes: GraphCustomNode[] }> => {
    const response = await apiFetch({ path: '/calcgraph/v1/custom-nodes/export' });
    const data = asRecord(response);
    const customNodes = Array.isArray(data.customNodes)
        ? data.customNodes
            .map((item) => normalizeGraphCustomNode(item))
            .filter((item): item is GraphCustomNode => Boolean(item))
        : [];
    return { customNodes };
};

export const importGraphCustomNodes = async (customNodes: unknown): Promise<void> => {
    await apiFetch({
        path: '/calcgraph/v1/custom-nodes/import',
        method: 'POST',
        data: { customNodes },
    });
};

export const saveGraphTemplate = async (name: string, state: unknown, templateId?: string): Promise<GraphTemplate> => {
    const response = await apiFetch({
        path: '/calcgraph/v1/templates',
        method: 'POST',
        data: { id: templateId, name, state },
    });

    const normalized = normalizeSnapshot((response as { state?: unknown })?.state);
    const responseId = typeof (response as { id?: unknown })?.id === 'string' ? (response as { id: string }).id : '';
    const templateName = typeof (response as { name?: unknown })?.name === 'string' ? (response as { name: string }).name : '';
    const updatedAt = typeof (response as { updatedAt?: unknown })?.updatedAt === 'number'
        ? (response as { updatedAt: number }).updatedAt
        : Date.now();

    return {
        id: responseId,
        name: templateName || name,
        state: normalized,
        updatedAt,
    };
};

export const deleteGraphTemplate = async (id: string): Promise<void> => {
    await apiFetch({
        path: `/calcgraph/v1/templates/${id}`,
        method: 'DELETE',
    });
};
