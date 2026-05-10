export interface GraphSnapshot {
    elements: unknown[];
    connections: unknown[];
    mainFormula: string;
    eventFormulas: Record<string, string>;
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
            formula?: unknown; // backward compatibility
            updatedAt?: unknown;
        };

        return {
            elements: toList(data.elements),
            connections: toList(data.connections),
            mainFormula: typeof data.mainFormula === 'string' ? data.mainFormula : (typeof data.formula === 'string' ? data.formula : ''),
            eventFormulas: (data.eventFormulas && typeof data.eventFormulas === 'object') ? data.eventFormulas as Record<string, string> : {},
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
    return connectionsScore + elementsScore + formulaScore;
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
