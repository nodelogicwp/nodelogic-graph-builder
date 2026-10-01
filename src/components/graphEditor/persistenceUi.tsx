import * as React from 'react';
import {
    HISTORY_LIMIT_MAX,
    HISTORY_LIMIT_MIN,
    diffGraphs,
    graphStats,
    summarizeDiff,
    type BackupEntry,
    type GraphContent,
    type GraphDiff,
    type MainHistoryEntry,
} from './graphStore';

/*
 * Presentational pieces of the MAIN / WORK / history / recovery UI. They only
 * render what they are given and report clicks: every decision and every
 * write lives in graphEditor.tsx + graphStore.ts.
 */

export const formatTimestamp = (ms: number): string => {
    if (!ms || !Number.isFinite(ms)) return 'unknown time';
    try {
        return new Date(ms).toLocaleString();
    } catch {
        return String(ms);
    }
};

const colors = {
    overlay: 'rgba(2, 6, 23, 0.62)',
    panel: '#0f172a',
    border: '#334155',
    text: '#e2e8f0',
    muted: '#94a3b8',
    accent: '#2563eb',
    danger: '#b91c1c',
    warn: '#f59e0b',
    added: '#22c55e',
    changed: '#f59e0b',
    moved: '#38bdf8',
    removed: '#ef4444',
    node: '#475569',
};

export const dialogButtonStyle = (variant: 'primary' | 'secondary' | 'danger' = 'secondary'): React.CSSProperties => ({
    padding: '7px 14px',
    background: variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : '#334155',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: variant === 'secondary' ? 500 : 600,
});

/** Modal frame. Escape closes only when `onClose` is given (blocking choices omit it). */
export const PersistenceDialogFrame: React.FC<{
    title: string;
    children: React.ReactNode;
    actions: React.ReactNode;
    onClose?: () => void;
    width?: number;
    tone?: 'default' | 'warning' | 'error';
}> = ({ title, children, actions, onClose, width = 720, tone = 'default' }) => {
    // Not React.useId: older WordPress installs ship React 17.
    const titleId = React.useRef(`nl-dialog-${Math.random().toString(36).slice(2, 10)}`).current;
    const frameRef = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        const frame = frameRef.current;
        const primary = frame?.querySelector<HTMLButtonElement>('[data-autofocus="true"]') || frame?.querySelector<HTMLButtonElement>('button');
        primary?.focus();
    }, []);
    return (
        <div
            className="nl-persistence-overlay"
            style={{ position: 'fixed', inset: 0, zIndex: 7100, background: colors.overlay, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === 'Escape' && onClose) onClose();
            }}
        >
            <div
                ref={frameRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="nl-persistence-dialog"
                style={{
                    width: `min(${width}px, 100%)`,
                    maxHeight: 'calc(100vh - 48px)',
                    display: 'flex',
                    flexDirection: 'column',
                    background: colors.panel,
                    color: colors.text,
                    border: `1px solid ${tone === 'error' ? colors.danger : tone === 'warning' ? colors.warn : colors.border}`,
                    borderRadius: '10px',
                    boxShadow: '0 18px 40px rgba(2, 6, 23, 0.55)',
                }}
            >
                <div id={titleId} style={{ padding: '14px 16px 8px', fontSize: '14px', fontWeight: 700, overflowWrap: 'anywhere' }}>{title}</div>
                <div style={{ padding: '0 16px', fontSize: '12px', lineHeight: 1.45, color: '#cbd5e1', overflowY: 'auto', overflowWrap: 'anywhere' }}>
                    {children}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end', padding: '12px 16px 14px' }}>
                    {actions}
                </div>
            </div>
        </div>
    );
};

const NamedList: React.FC<{ label: string; color: string; names: string[] }> = ({ label, color, names }) => {
    if (names.length === 0) return null;
    const shown = names.slice(0, 8);
    return (
        <li style={{ marginBottom: '2px' }}>
            <span style={{ color, fontWeight: 600 }}>{label}:</span>{' '}
            {shown.join(', ')}{names.length > shown.length ? `, +${names.length - shown.length} more` : ''}
        </li>
    );
};

/** "+1 node, moved 3 nodes ..." with the node names behind each number. */
export const DiffSummaryList: React.FC<{ diff: GraphDiff; emptyText?: string }> = ({ diff, emptyText = 'No differences.' }) => {
    if (diff.identical) return <div style={{ color: colors.muted }}>{emptyText}</div>;
    const label = (refs: Array<{ name: string; id: string }>) => refs.map((ref) => (ref.name && ref.name !== ref.id ? `${ref.name} (${ref.id})` : ref.id));
    return (
        <div>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>{summarizeDiff(diff).join(' · ')}</div>
            <ul style={{ margin: 0, paddingLeft: '18px' }}>
                <NamedList label="Added" color={colors.added} names={label(diff.addedNodes)} />
                <NamedList label="Removed" color={colors.removed} names={label(diff.removedNodes)} />
                <NamedList label="Changed" color={colors.changed} names={label(diff.changedNodes)} />
                <NamedList label="Moved" color={colors.moved} names={label(diff.movedNodes)} />
                {(diff.addedEdges > 0 || diff.removedEdges > 0) && (
                    <li>Connections: {diff.addedEdges > 0 ? `+${diff.addedEdges}` : ''}{diff.addedEdges > 0 && diff.removedEdges > 0 ? ' / ' : ''}{diff.removedEdges > 0 ? `−${diff.removedEdges}` : ''}</li>
                )}
                {diff.customUiChanged && <li>Custom node UI changed</li>}
            </ul>
        </div>
    );
};

const PREVIEW_NODE_W = 180;
const PREVIEW_NODE_H = 56;

/**
 * Read-only picture of a graph version (no editor state involved, so viewing
 * can never modify anything). Optional `compareTo` colours what differs:
 * green added, amber changed, blue moved, red dashed = removed.
 */
export const GraphVersionPreview: React.FC<{ content: GraphContent; compareTo?: GraphContent | null; height?: number }> = ({ content, compareTo, height = 280 }) => {
    const diff = React.useMemo(() => (compareTo ? diffGraphs(compareTo, content) : null), [compareTo, content]);
    const status = React.useMemo(() => {
        const map = new Map<string, string>();
        if (!diff) return map;
        diff.movedNodes.forEach((ref) => map.set(ref.id, colors.moved));
        diff.changedNodes.forEach((ref) => map.set(ref.id, colors.changed));
        diff.addedNodes.forEach((ref) => map.set(ref.id, colors.added));
        return map;
    }, [diff]);
    const nodes = content.elements.filter((node) => node && typeof node === 'object');
    const removed = React.useMemo(() => {
        if (!diff || !compareTo) return [];
        const ids = new Set(diff.removedNodes.map((ref) => ref.id));
        return compareTo.elements.filter((node) => ids.has(String(node.id)));
    }, [diff, compareTo]);
    const all = [...nodes, ...removed];
    if (all.length === 0) {
        return <div style={{ padding: '24px', textAlign: 'center', color: colors.muted, border: `1px dashed ${colors.border}`, borderRadius: '8px' }}>This version is empty.</div>;
    }
    const xs = all.map((node) => Number(node.x) || 0);
    const ys = all.map((node) => Number(node.y) || 0);
    const minX = Math.min(...xs) - 30;
    const minY = Math.min(...ys) - 30;
    const width = Math.max(...xs) + PREVIEW_NODE_W + 30 - minX;
    const heightSpan = Math.max(...ys) + PREVIEW_NODE_H + 30 - minY;
    const byId = new Map(nodes.map((node) => [String(node.id), node]));
    const anchor = (node: { x: unknown; y: unknown }, side: 'in' | 'out') => ({
        x: (Number(node.x) || 0) + (side === 'out' ? PREVIEW_NODE_W : 0),
        y: (Number(node.y) || 0) + PREVIEW_NODE_H / 2,
    });
    return (
        <svg
            role="img"
            aria-label={`Graph preview: ${graphStats(content).nodes} nodes, ${graphStats(content).connections} connections`}
            viewBox={`${minX} ${minY} ${width} ${heightSpan}`}
            preserveAspectRatio="xMidYMid meet"
            // border-box: width 100% must include the border (no 2px overflow).
            style={{ width: '100%', height: `${height}px`, boxSizing: 'border-box', background: '#111827', border: `1px solid ${colors.border}`, borderRadius: '8px', display: 'block' }}
        >
            {content.connections.map((edge, index) => {
                const from = byId.get(String(edge.fromId));
                const to = byId.get(String(edge.toId));
                if (!from || !to) return null;
                const a = anchor(from, 'out');
                const b = anchor(to, 'in');
                const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
                return <path key={`e${index}`} d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`} fill="none" stroke="#64748b" strokeWidth={2} />;
            })}
            {all.map((node, index) => {
                const isRemoved = index >= nodes.length;
                const stroke = isRemoved ? colors.removed : (status.get(String(node.id)) || colors.node);
                const name = String(node.name || node.type || node.id);
                const label = name.length > 22 ? `${name.slice(0, 21)}…` : name;
                return (
                    <g key={`n${index}-${String(node.id)}`} opacity={isRemoved ? 0.55 : 1}>
                        <title>{`${name} (${String(node.id)})${isRemoved ? ' - removed' : ''}`}</title>
                        <rect x={Number(node.x) || 0} y={Number(node.y) || 0} width={PREVIEW_NODE_W} height={PREVIEW_NODE_H} rx={8} fill="#1f2937" stroke={stroke} strokeWidth={stroke === colors.node ? 1.5 : 3} strokeDasharray={isRemoved ? '6 4' : undefined} />
                        <text x={(Number(node.x) || 0) + 10} y={(Number(node.y) || 0) + 24} fill="#e2e8f0" fontSize={14} fontWeight={600}>{label}</text>
                        <text x={(Number(node.x) || 0) + 10} y={(Number(node.y) || 0) + 44} fill="#94a3b8" fontSize={11}>{String(node.type || '')}</text>
                    </g>
                );
            })}
        </svg>
    );
};

const smallButton: React.CSSProperties = {
    padding: '3px 8px',
    fontSize: '11px',
    borderRadius: '4px',
    border: '1px solid #475569',
    background: '#1f2937',
    color: '#e2e8f0',
    cursor: 'pointer',
};

const rowStyle: React.CSSProperties = {
    padding: '6px 0',
    borderTop: '1px solid rgba(148, 163, 184, 0.18)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
};

export type VersionRef = { kind: 'main' } | { kind: 'history'; id: string } | { kind: 'backup'; id: string };

/** Sidebar section: published versions, retention limit, local backups, import/export. */
export const VersionsPanel: React.FC<{
    mainInfo: { revision: number; publishedAt: number };
    mainContent: GraphContent;
    history: MainHistoryEntry[];
    backups: BackupEntry[];
    historyLimit: number;
    canPersistHistory: boolean;
    onHistoryLimitChange: (limit: number) => void;
    onView: (ref: VersionRef) => void;
    onRestore: (ref: VersionRef) => void;
    onExport: (ref: VersionRef | { kind: 'work' }) => void;
    onImport: () => void;
    onOpen: () => void;
}> = ({ mainInfo, mainContent, history, backups, historyLimit, canPersistHistory, onHistoryLimitChange, onView, onRestore, onExport, onImport, onOpen }) => {
    const [open, setOpen] = React.useState(false);
    const mainStats = graphStats(mainContent);
    return (
        <div style={{ marginTop: '12px', borderTop: '1px solid #555', paddingTop: '10px', color: '#ddd', fontSize: '12px' }}>
            <button
                type="button"
                onClick={() => { setOpen(!open); if (!open) onOpen(); }}
                aria-expanded={open}
                style={{ ...smallButton, width: '100%', textAlign: 'left', fontWeight: 700, fontSize: '12px', padding: '6px 8px' }}
            >
                {open ? '▾' : '▸'} Versions, import &amp; export
            </button>
            {open && (
                <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <button type="button" style={smallButton} onClick={() => onExport({ kind: 'work' })} title="Download the working copy as a JSON file">Export working copy</button>
                        <button type="button" style={smallButton} onClick={onImport} title="Load a graph JSON file into the working copy">Import from file…</button>
                    </div>

                    <div style={{ fontWeight: 700, margin: '6px 0 2px' }}>Published (on the page)</div>
                    <div style={rowStyle}>
                        <div>{mainInfo.revision > 0 ? `Version ${mainInfo.revision}` : 'Current version'} · {mainInfo.publishedAt ? formatTimestamp(mainInfo.publishedAt) : 'not saved with the new editor yet'}</div>
                        <div style={{ color: '#94a3b8' }}>{mainStats.nodes} nodes · {mainStats.connections} connections</div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button type="button" style={smallButton} onClick={() => onView({ kind: 'main' })}>View</button>
                            <button type="button" style={smallButton} onClick={() => onExport({ kind: 'main' })}>Export</button>
                        </div>
                    </div>

                    <div style={{ fontWeight: 700, margin: '10px 0 2px' }}>Previous versions</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#cbd5e1', margin: '4px 0' }}>
                        Keep
                        <select
                            className="input-control"
                            value={historyLimit}
                            onChange={(event) => onHistoryLimitChange(Number(event.target.value))}
                            style={{ width: '64px' }}
                            disabled={!canPersistHistory}
                        >
                            {Array.from({ length: HISTORY_LIMIT_MAX - HISTORY_LIMIT_MIN + 1 }, (_, index) => HISTORY_LIMIT_MIN + index).map((value) => (
                                <option key={value} value={value}>{value}</option>
                            ))}
                        </select>
                        previous versions
                    </label>
                    <div style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.35, marginBottom: '4px' }}>
                        {historyLimit === 0
                            ? '0 = no previous versions are stored in the page. The replaced version is still kept as a local backup in this browser and in WordPress page revisions.'
                            : `Each Save Graph keeps the replaced version. Older versions beyond ${historyLimit} are removed at the next Save Graph - never before the new version is stored.`}
                        {!canPersistHistory && ' (This host does not store version history.)'}
                    </div>
                    {history.length === 0 && <div style={{ color: '#94a3b8' }}>No previous versions yet.</div>}
                    {history.map((entry) => {
                        const stats = graphStats(entry.graph);
                        return (
                            <div key={entry.id} style={rowStyle}>
                                <div>{entry.revision > 0 ? `Version ${entry.revision}` : 'Earlier version'} · replaced {formatTimestamp(entry.replacedAt)}</div>
                                <div style={{ color: '#94a3b8' }}>{stats.nodes} nodes · {stats.connections} connections{entry.publishedAt ? ` · saved ${formatTimestamp(entry.publishedAt)}` : ''}</div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button type="button" style={smallButton} onClick={() => onView({ kind: 'history', id: entry.id })}>View</button>
                                    <button type="button" style={smallButton} onClick={() => onRestore({ kind: 'history', id: entry.id })}>Restore…</button>
                                    <button type="button" style={smallButton} onClick={() => onExport({ kind: 'history', id: entry.id })}>Export</button>
                                </div>
                            </div>
                        );
                    })}

                    <div style={{ fontWeight: 700, margin: '10px 0 2px' }}>Local backups (this browser)</div>
                    <div style={{ color: '#94a3b8', fontSize: '11px', lineHeight: 1.35, marginBottom: '4px' }}>
                        Taken automatically before Save Graph, restores, imports and discards.
                    </div>
                    {backups.length === 0 && <div style={{ color: '#94a3b8' }}>No local backups.</div>}
                    {backups.map((entry) => {
                        const stats = graphStats(entry.graph);
                        return (
                            <div key={entry.id} style={rowStyle}>
                                <div>{entry.label || entry.reason}</div>
                                <div style={{ color: '#94a3b8' }}>{formatTimestamp(entry.createdAt)} · {stats.nodes} nodes · {stats.connections} connections</div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    <button type="button" style={smallButton} onClick={() => onView({ kind: 'backup', id: entry.id })}>View</button>
                                    <button type="button" style={smallButton} onClick={() => onRestore({ kind: 'backup', id: entry.id })}>Restore…</button>
                                    <button type="button" style={smallButton} onClick={() => onExport({ kind: 'backup', id: entry.id })}>Export</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
