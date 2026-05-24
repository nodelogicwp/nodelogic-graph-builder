import * as React from 'react';
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
// @ts-ignore: allow importing CSS in this environment without type declarations
// import './graphEditor.css';
import { TREE_DATA } from './graphEditor/treeData';
import { normalizeSnapshot, resolveInitialSnapshot } from './graphEditor/persistence';
import {
    fetchGraphCustomNodes,
    fetchGraphTemplates,
    saveGraphTemplate,
    GraphCustomNode,
    GraphTemplate,
} from './graphEditor/templateApi';

interface PinStyle extends React.CSSProperties {
    '--pin-gradient'?: string;
}

interface TreeItem {
    id: string;
    name: string;
    type:
        | 'folder'
        | 'main'
        | 'element'
        | 'element-id'
        | 'number'
        | 'constant-boolean'
        | 'constant-string'
        | 'calculation'
        | 'node'
        | 'case-range'
        | 'case-value'
        | 'switch'
        | 'condition'
        | 'regex'
        | 'concat'
        | 'cut-a'
        | 'cut-b'
        | 'cut-c'
        | 'string-count-chars'
        | 'string-count-words'
        | 'string-find-start'
        | 'string-find-end'
        | 'string-to-number'
        | 'number-to-string'
        | 'bool-count'
        | 'color'
        | 'gradient'
        | 'math'
        | 'custom-node'
        | 'unzip'
        | 'memory-read-number'
        | 'memory-read-string'
        | 'memory-read-boolean'
        | 'memory-write-number'
        | 'memory-write-string'
        | 'memory-write-boolean'
        | 'css-unit'
        | 'css-display'
        | 'css-color'
        | 'css-text'
        | 'css-join'
        | 'css-margin'
        | 'css-padding'
        | 'css-width'
        | 'css-height'
        | 'css-font-size'
        | 'event-element'
        | 'event-id'
        | 'event-processor';
    customNodeId?: string;
    children?: TreeItem[];
}

interface CanvasElement {
    id: string;
    name: string;
    type:
        | 'main'
        | 'element'
        | 'element-id'
        | 'number'
        | 'constant-boolean'
        | 'constant-string'
        | 'calculation'
        | 'node'
        | 'case-range'
        | 'case-value'
        | 'switch'
        | 'condition'
        | 'regex'
        | 'concat'
        | 'cut-a'
        | 'cut-b'
        | 'cut-c'
        | 'string-count-chars'
        | 'string-count-words'
        | 'string-find-start'
        | 'string-find-end'
        | 'string-to-number'
        | 'number-to-string'
        | 'bool-count'
        | 'color'
        | 'gradient'
        | 'custom-node'
        | 'unzip'
        | 'output'
        | 'not'
        | 'and'
        | 'or'
        | 'clamp'
        | 'min-val'
        | 'max-val'
        | 'string-split'
        | 'string-replace'
        | 'string-trim'
        | 'string-includes'
        | 'string-upper'
        | 'string-lower'
        | 'number-parse'
        | 'number-to-base'
        | 'multi-concat'
        | 'css-unit'
        | 'css-display'
        | 'css-color'
        | 'css-text'
        | 'css-join'
        | 'css-margin'
        | 'css-padding'
        | 'css-width'
        | 'css-height'
        | 'css-font-size'
        | 'operator'
        | 'math'
        | 'comparison'
        | 'logic'
        | 'constant'
        | 'variable'
        | 'memory-read-number'
        | 'memory-read-string'
        | 'memory-read-boolean'
        | 'memory-write-number'
        | 'memory-write-string'
        | 'memory-write-boolean'
        | 'event-element'
        | 'event-id'
        | 'event-processor'
        | 'fallback';
    x: number;
    y: number;
    data?: {
        formula?: string;
        inputCount?: number;
        operation?: string;
        value?: number | string | boolean;
        valueText?: string;
        selectedElement?: string;
        customElementId?: string;
        customOutputType?: 'number' | 'string' | 'boolean' | 'color';
        outputs?: { name: string; type: 'number' | 'string' | 'boolean' | 'case' | 'color' }[];
        // For number/constant nodes
        inputValues?: number[];
        // For case nodes
        min?: number;
        max?: number;
        caseValue?: number | string | boolean;
        out?: string;
        // String logic nodes
        regexPattern?: string;
        reverse?: boolean;
        mathFunction?: string;
        colorValue?: string;
        gradientColorCount?: number;
        gradientColors?: string[];
        gradientFrom?: string;
        gradientMid?: string;
        gradientTo?: string;
        gradientAngle?: number;
        customNodeId?: string;
        customNodeName?: string;
        customInputSchema?: Array<{
            id: string;
            label: string;
            type: 'number' | 'string' | 'boolean' | 'color' | 'zip' | 'case';
            defaultValue?: string;
            sourceNodeId?: string;
            sourcePin?: string;
        }>;
        customOutputSchema?: Array<{
            id: string;
            label: string;
            type: 'number' | 'string' | 'boolean' | 'color' | 'zip' | 'case';
            defaultValue?: string;
            sourceNodeId?: string;
            sourcePin?: string;
        }>;
        customTemplateFormula?: string;
        customInputValues?: Array<string | number | boolean>;
        unzipIndex?: number;
        outputMode?: 'zipped' | 'unzipped';
        eventType?: string;
        // For switch node - dynamic conditions
        conditions?: string[];
        // For calculation - operations between inputs
        inputOperations?: { [key: string]: string };
        // For logic mode main-block: target element IDs per slot
        logicTargets?: string[];
        // Dynamic node width (px)
        nodeWidth?: number;
        // For constant nodes in customNodeMode: hide from custom node input pins
        hidden?: boolean;
        // For output node in customNodeMode: editable labels per input slot
        outputLabels?: string[];
        // For main-block (Zip Output) in customNodeMode: editable output labels
        zipOutputLabels?: string[];
        // For Element ID node
        elementId?: string;
        // For Memory nodes
        variableKey?: string;
        defaultValue?: number | string | boolean;
        persistVariable?: boolean;
        // For Event nodes
        eventElement?: string;
        eventId?: string;
        eventOption?: string;
        // For custom-node: true = single zip output (legacy), false/undefined = individual output pins
        zipOutput?: boolean;
        // For string-split: delimiter and index
        splitDelimiter?: string;
        splitIndex?: number;
        // For string-replace: find and replace strings
        replaceFind?: string;
        replaceWith?: string;
        // For number-parse: radix (10, 16, 2, 8)
        parseRadix?: number;        // For output node: extended CSS properties
        outputCssProperty?: string;
        // For css-unit node: unit selector
        cssUnit?: string;
        cssUnitValue?: string;
        // For css-display node: display value
        cssDisplay?: string;
        // For css-text node: raw CSS text
        cssText?: string;
    };
    valueType?: 'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event';
    connections?: Connection[];
}

interface Connection {
    id: string;
    fromId: string;
    fromOutput: string;
    toId: string;
    toInput: string;
    operation?: '+' | '-' | '*' | '/' | '**' | '===' | '!==' | '>' | '<' | '>=' | '<=';
    valueType?: 'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event';
    connectionType?: 'normal' | 'case'; // New type for case connections
}

interface CalcFlowSegment {
    key: string;
    d: string;
    step: number;
    badgeX: number;
    badgeY: number;
}

interface DetectedElement {
    id: string;
    type: 'slider' | 'input-number' | 'input-string' | 'checkbox' | 'radio' | 'select' | 'button-group';
    name: string;
    outputs?: { name: string; type: 'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' }[];
}

interface SavedState {
    elements: CanvasElement[];
    connections: Connection[];
    formula: string;
    updatedAt?: number;
}

interface GraphEditorRuntimeConfig {
    enableTemplates?: boolean;
    enableCustomNodes?: boolean;
    treeData?: TreeItem[];
}

interface GraphEditorRuntimeWindow extends Window {
    nodelogicGraphBuilderConfig?: GraphEditorRuntimeConfig;
}


// TreeNode component - stable, outside GraphEditor to prevent re-creation
const TreeNode: React.FC<{
    item: TreeItem;
    expandedFolders: Set<string>;
    onToggleFolder: (itemId: string) => void;
    onStartDrag: (e: React.MouseEvent, item: TreeItem) => void;
    isLockedNode: (item: TreeItem) => boolean;
    onLockedNodeClick: (item: TreeItem) => void;
}> = React.memo(({ item, expandedFolders, onToggleFolder, onStartDrag, isLockedNode, onLockedNodeClick }) => {
    const isExpanded = expandedFolders.has(item.id);
    const isDraggable = item.type !== 'folder';
    const isLocked = isDraggable && isLockedNode(item);

    return (
        <div className="tree-node">
            <div
                className="tree-item"
                data-draggable={isDraggable}
                data-locked={isLocked}
                data-item-id={item.id}
                onMouseDown={(e) => {
                    if (isDraggable) {
                        if (isLocked) {
                            e.preventDefault();
                            onLockedNodeClick(item);
                            return;
                        }
                        onStartDrag(e, item);
                    }
                }}
                onClick={(e) => {
                    if (isLocked) {
                        e.stopPropagation();
                        onLockedNodeClick(item);
                        return;
                    }
                    if (item.children) {
                        e.stopPropagation();
                        onToggleFolder(item.id);
                    }
                }}
            >
                {item.children && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFolder(item.id);
                        }}
                        style={{ pointerEvents: 'auto' }}
                    >
                        {isExpanded ? '\u25BE' : '\u25B8'}
                    </button>
                )}
                {item.type === 'folder' ? '\u{1F4C1}' : '\u{1F527}'} {item.name}{isLocked ? ' (Locked)' : ''}
            </div>
            {isExpanded && item.children && (
                <div className="tree-children">
                    {item.children.map((child) => (
                        <TreeNode
                            key={child.id}
                            item={child}
                            expandedFolders={expandedFolders}
                            onToggleFolder={onToggleFolder}
                            onStartDrag={onStartDrag}
                            isLockedNode={isLockedNode}
                            onLockedNodeClick={onLockedNodeClick}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

interface GraphEditorProps {
    editorId: string;
    onFormulaChange?: (formula: string) => void;
    initialState?: SavedState | null;
    onStateChange?: (state: SavedState) => void;
    onUnsavedChange?: (hasUnsaved: boolean) => void;
    forceInitialState?: boolean;
    showTemplateTools?: boolean;
    enableCustomNodes?: boolean;
    templateMode?: boolean;
    customNodeMode?: boolean;
    editingNodeId?: string;
    liveStateSync?: boolean;
    mainElementType?: 'range' | 'seekbar' | 'number' | 'checkbox' | 'info' | 'template' | 'logic';
}

const INPUT_MAIN_TYPES = new Set<GraphEditorProps['mainElementType']>([
    'range',
    'seekbar',
    'number',
    'checkbox',
    'template',
]);

const GRADIENT_MIN_COLORS = 2;
const GRADIENT_MAX_COLORS = 8;
const GRADIENT_DEFAULT_COLORS = ['#ef4444', '#facc15', '#22c55e'];

const PIN_TYPE_COLORS: Record<string, string> = {
    number: '#2196f3',
    string: '#4caf50',
    boolean: '#e100ff',
    case: '#ff5100',
    color: '#00c7be',
    zip: '#f59e0b',
    css: '#a855f7',
    'css-unit': '#7c3aed',
};

const getConnectionLookupKey = (toId: string, toInput: string): string => `${toId}:${toInput}`;

const buildPinStyle = (types: string[]): PinStyle => {
    if (!types.length) return {};

    const step = 100 / types.length;
    const extended = [...types, types[0]];
    const gradient = `conic-gradient(${extended
        .map((type, index) => `${PIN_TYPE_COLORS[type] || '#000'} ${index * step}%`)
        .join(', ')})`;

    return {
        '--pin-gradient': gradient
    };
};

const GraphEditor: React.FC<GraphEditorProps> = ({
    editorId,
    onFormulaChange,
    initialState = null,
    onStateChange,
    onUnsavedChange,
    forceInitialState = false,
    showTemplateTools = false,
    enableCustomNodes = false,
    templateMode = false,
    customNodeMode = false,
    editingNodeId = '',
    liveStateSync = true,
    mainElementType = 'info',
}) => {
    const SAVE_KEY = `formulaEditor.save.${editorId}`;
    const AUTOSAVE_KEY = `formulaEditor.autosave.${editorId}`;

    const [savedState, setSavedState] = useState<SavedState | null>(null);
    const [autosaveState, setAutosaveState] = useState<SavedState | null>(null);
    const [isStateLoaded, setIsStateLoaded] = useState(false);

    const [unsavedChanges, setUnsavedChanges] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [zoom, setZoom] = useState(1);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);
    const [elements, setElements] = useState<CanvasElement[]>([
        {
            id: 'main-block',
            name: 'Html Element',
            type: 'main',
            x: 0,
            y: 0,
            data: { formula: '' },
            connections: []
        }
    ]);
    const [selected, setSelected] = useState<string | null>('main-block');
    const [draggedItem, setDraggedItem] = useState<TreeItem | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [isDraggingFromSidebar, setIsDraggingFromSidebar] = useState(false);
    const [isDraggingElement, setIsDraggingElement] = useState(false);
    const [draggedElementId, setDraggedElementId] = useState<string | null>(null);
    const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
    const [currentMousePos, setCurrentMousePos] = useState({ x: 0, y: 0 });
    const [isClick, setIsClick] = useState(true);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectionStart, setConnectionStart] = useState<{elementId: string, type: 'input' | 'output', index: number} | null>(null);
    const [detectedElements, setDetectedElements] = useState<DetectedElement[]>([]);
    const [connections, setConnections] = useState<Connection[]>([]);
    const [connectionInProgress, setConnectionInProgress] = useState<{
        elementId: string;
        pinType: 'input' | 'output';
        pinIndex: number;
        x: number;
        y: number;
    } | null>(null);
    const [isDraggingCanvasElement, setIsDraggingCanvasElement] = useState(false);
    const [dragPreview, setDragPreview] = useState<{ x: number; y: number; name: string } | null>(null);
    // Predictive delta tracking for smooth pin positions during drag/pan/zoom
    const [dragElementDelta, setDragElementDelta] = useState<{elementId: string; deltaX: number; deltaY: number} | null>(null);
    const [zoomDelta, setZoomDelta] = useState(1);
    const [offsetDelta, setOffsetDelta] = useState({ x: 0, y: 0 });

    const [formula, setFormula] = useState<string>("");
    const [templates, setTemplates] = useState<GraphTemplate[]>([]);
    const [customNodes, setCustomNodes] = useState<GraphCustomNode[]>([]);
    const [templateName, setTemplateName] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [templateInfo, setTemplateInfo] = useState('');
    const [isTemplateBusy, setIsTemplateBusy] = useState(false);
    const [cssEditorNodeId, setCssEditorNodeId] = useState<string | null>(null);
    const [recoverableDraftState, setRecoverableDraftState] = useState<SavedState | null>(null);
    const [pendingDraftRecovery, setPendingDraftRecovery] = useState<SavedState | null>(null);
    const [showDraftRecoveryNotice, setShowDraftRecoveryNotice] = useState(false);
    const [calcFlowByNode, setCalcFlowByNode] = useState<Record<string, CalcFlowSegment[]>>({});

    const canvasRef = useRef<HTMLDivElement>(null);
    const elementDragRef = useRef<{
        elementId: string;
        startX: number;
        startY: number;
        elementX: number;
        elementY: number;
    } | null>(null);
    const sidebarDragRef = useRef<{
        startX: number;
        startY: number;
        item: TreeItem;
    } | null>(null);
    const lastPanPointRef = useRef({ x: 0, y: 0 });
    const draggedItemRef = useRef<TreeItem | null>(draggedItem);
    const canvasMouseMoveRafRef = useRef<number | null>(null);
    const pendingCanvasMouseRef = useRef<{ x: number; y: number } | null>(null);

    const buttonStyle = {
        width: '100%',
        padding: '8px',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 'bold',
        marginTop: '8px'
    };
    
    // Refs for state to avoid closure issues in global listeners
    const isDraggingFromSidebarRef = useRef(false);
    const isDraggingCanvasElementRef = useRef(false);
    const isPanningRef = useRef(false);
    const connectionInProgressRef = useRef<typeof connectionInProgress>(null);
    const elementsRef = useRef(elements);
    const detectedElementsRef = useRef(detectedElements);
    const zoomRef = useRef(zoom);
    const offsetXRef = useRef(offsetX);
    const offsetYRef = useRef(offsetY);
    const connectionsRef = useRef(connections);
    const formulaRef = useRef(formula);
    const hasInitializedRef = useRef(false);
    const onStateChangeRef = useRef<GraphEditorProps['onStateChange']>(onStateChange);
    const isStateLoadedRef = useRef(isStateLoaded);
    const customNodesRef = useRef(customNodes);
    const previousElementsCountRef = useRef(elements.length);
    // Previous values for delta calculation
    const prevZoomRef = useRef(zoom);
    const prevOffsetXRef = useRef(offsetX);
    const prevOffsetYRef = useRef(offsetY);
    // Refs for delta state to use in pin calculations
    const dragElementDeltaRef = useRef<{elementId: string; deltaX: number; deltaY: number} | null>(null);
    const zoomDeltaRef = useRef(1);
    const offsetDeltaRef = useRef({ x: 0, y: 0 });

    const isMainInputType = INPUT_MAIN_TYPES.has(mainElementType);
    const runtimeConfig: GraphEditorRuntimeConfig = (() => {
        if (typeof window === 'undefined') {
            return {};
        }
        const candidate = (window as GraphEditorRuntimeWindow).nodelogicGraphBuilderConfig;
        return candidate && typeof candidate === 'object' ? candidate : {};
    })();
    const templateToolsEnabled = Boolean(showTemplateTools && runtimeConfig.enableTemplates);
    const customNodeLibraryEnabled = Boolean(customNodeMode || enableCustomNodes || runtimeConfig.enableCustomNodes);
    const outputPropertyNames = ['value', 'background', 'color', 'disabled', 'custom-css'];
    const outputInputLabels = ['Value', 'Background', 'Color', 'Disabled', 'CSS'];
    const elementsById = React.useMemo(() => {
        const map = new Map<string, CanvasElement>();
        elements.forEach((element) => {
            map.set(element.id, element);
        });
        return map;
    }, [elements]);
    const connectionsByTargetInput = React.useMemo(() => {
        const map = new Map<string, Connection>();
        connections.forEach((connection) => {
            map.set(getConnectionLookupKey(connection.toId, connection.toInput), connection);
        });
        return map;
    }, [connections]);
    const getPinStyleByTypes = React.useCallback((types: string[]): PinStyle => buildPinStyle(types), []);
    const configuredTreeData = Array.isArray(runtimeConfig.treeData) && runtimeConfig.treeData.length > 0
        ? runtimeConfig.treeData
        : (TREE_DATA as TreeItem[]);

    const getMainValueAcceptedTypes = (): Array<'number' | 'string' | 'boolean'> => {
        if (mainElementType === 'range' || mainElementType === 'seekbar' || mainElementType === 'number') {
            return ['number'];
        }
        if (mainElementType === 'checkbox') {
            return ['boolean'];
        }
        return ['number', 'string', 'boolean'];
    };

    const normalizeGradientColorCount = (rawCount: unknown, fallback: number = GRADIENT_DEFAULT_COLORS.length): number => {
        const parsed = Number(rawCount);
        if (!Number.isFinite(parsed)) {
            return Math.min(GRADIENT_MAX_COLORS, Math.max(GRADIENT_MIN_COLORS, fallback));
        }
        return Math.min(GRADIENT_MAX_COLORS, Math.max(GRADIENT_MIN_COLORS, Math.round(parsed)));
    };

    const ensureGradientColors = (rawColors: unknown, colorCount: number): string[] => {
        const fallbackColors = [...GRADIENT_DEFAULT_COLORS];
        const source = Array.isArray(rawColors) ? rawColors : [];
        const normalized = source
            .map((value) => String(value ?? '').trim())
            .filter((value) => value.length > 0);

        while (normalized.length < colorCount) {
            const fallback = fallbackColors[normalized.length % fallbackColors.length] || '#22c55e';
            normalized.push(fallback);
        }

        return normalized.slice(0, colorCount);
    };

    const getGradientColorCount = (element: CanvasElement): number => {
        if (element.type !== 'gradient') {
            return GRADIENT_DEFAULT_COLORS.length;
        }

        const fromLegacy = [element.data?.gradientFrom, element.data?.gradientMid, element.data?.gradientTo]
            .map((value) => String(value ?? '').trim())
            .filter((value) => value.length > 0).length;
        const gradientColors = Array.isArray(element.data?.gradientColors) ? element.data?.gradientColors : [];
        const fromArray = gradientColors.length;
        const fallback = Math.max(fromLegacy, fromArray, GRADIENT_DEFAULT_COLORS.length);
        return normalizeGradientColorCount(element.data?.gradientColorCount, fallback);
    };

    const getGradientColors = (element: CanvasElement): string[] => {
        const colorCount = getGradientColorCount(element);

        const rawArray = Array.isArray(element.data?.gradientColors) ? element.data?.gradientColors : [];
        if (rawArray && rawArray.length > 0) {
            return ensureGradientColors(rawArray, colorCount);
        }

        const legacy = [element.data?.gradientFrom, element.data?.gradientMid, element.data?.gradientTo]
            .map((value) => String(value ?? '').trim())
            .filter((value) => value.length > 0);

        if (legacy.length > 0) {
            return ensureGradientColors(legacy, colorCount);
        }

        return ensureGradientColors([], colorCount);
    };

    const getGradientColorByIndex = (element: CanvasElement, index: number): string => {
        const colors = getGradientColors(element);
        return colors[index] || GRADIENT_DEFAULT_COLORS[index % GRADIENT_DEFAULT_COLORS.length] || '#22c55e';
    };

    const getAcceptedTypesForPin = (
        element: CanvasElement,
        inputIndex: number
    ): Array<'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event'> => {
        // Event nodes can only connect to other event nodes
        if (element.type === 'event-processor' && inputIndex === 0) {
            return ['event'];
        }
        if (element.type === 'custom-node') {
            const schema = Array.isArray(element.data?.customInputSchema) ? element.data?.customInputSchema : [];
            const schemaPin = schema[inputIndex];
            if (!schemaPin) {
                return ['number'];
            }
            const pinType = schemaPin.type;
            return (
                pinType === 'string'
                || pinType === 'boolean'
                || pinType === 'color'
                || pinType === 'zip'
                || pinType === 'case'
            ) ? [pinType] : ['number'];
        }

        if (element.type === 'unzip') {
            if (inputIndex === 0) return ['zip'];
            return ['number'];
        }

        if (element.type === 'output') {
            const outputAccepted: Array<Array<'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit'>> = [
                ['number', 'string', 'boolean', 'color', 'zip'], // 0: value
                ['color', 'string'],                              // 1: background
                ['color', 'string'],                              // 2: color (text)
                ['boolean'],                                      // 3: disabled
                ['css', 'string'],                                // 4: custom CSS
            ];
            return (outputAccepted[inputIndex] || ['number']) as Array<'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit'>;
        }

        if (element.type === 'main') {
            if (customNodeMode) {
                return ['number', 'string', 'boolean', 'color'];
            }
            if (mainElementType === 'logic') {
                const slotPin = inputIndex % 4;
                if (slotPin === 0) return ['number', 'string', 'boolean', 'color', 'zip'];
                if (slotPin === 1 || slotPin === 2) return ['color', 'string'];
                return ['boolean'];
            }
            if (inputIndex === 0) return getMainValueAcceptedTypes();
            if (inputIndex === 1 || inputIndex === 2) return ['color', 'string'];
            return ['boolean'];
        }

        if (element.type === 'gradient') {
            const colorCount = getGradientColorCount(element);
            if (inputIndex < colorCount) {
                return ['color', 'string'];
            }
            if (inputIndex === colorCount) {
                return ['number'];
            }
            return ['number'];
        }

        const acceptedByIndex = acceptedTypes[element.type] || [];
        const accepted = acceptedByIndex[inputIndex]
            || acceptedByIndex[acceptedByIndex.length - 1]
            || ['number'];
        return accepted as Array<'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event'>;
    };

    const acceptedTypes: Record<string, Array<Array<'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event'>>> = {
        calculation: [
            ['number'] // one static input
        ],

        element: [],

        condition: [
            ['number', 'string', 'boolean'],
            ['number', 'string', 'boolean']
        ],

        case: [
            ['number', 'string', 'boolean'],
            ['number', 'string', 'boolean', 'color']
        ],

        'case-range': [
            ['number'],
            ['number'],
            ['number', 'string', 'boolean', 'color', 'zip', 'css']
        ],

        'case-value': [
            ['number', 'string', 'boolean'],
            ['number', 'string', 'boolean', 'color', 'zip', 'css']
        ],

        switch: [
            ['number', 'string', 'boolean'],
            ['case']
        ],

        node: [
            ['boolean'],
            ['number', 'string', 'boolean', 'color', 'zip', 'css'],
            ['number', 'string', 'boolean', 'color', 'zip', 'css']
        ],

        regex: [
            ['string']
        ],

        concat: [
            ['string'],
            ['string']
        ],

        'cut-a': [
            ['string'],
            ['string']
        ],

        'cut-b': [
            ['string'],
            ['number']
        ],

        'cut-c': [
            ['string'],
            ['number'],
            ['number']
        ],

        'string-count-chars': [
            ['string']
        ],

        'string-count-words': [
            ['string']
        ],

        'string-find-start': [
            ['string'],
            ['string']
        ],

        'string-find-end': [
            ['string'],
            ['string']
        ],

        'string-to-number': [
            ['string']
        ],

        'number-to-string': [
            ['number']
        ],

        'bool-count': [
            ['boolean']
        ],

        'memory-write-number': [
            ['number'],
            ['boolean', 'event']
        ],

        'memory-write-string': [
            ['string'],
            ['boolean', 'event']
        ],

        'memory-write-boolean': [
            ['boolean'],
            ['boolean', 'event']
        ],

        'event-processor': [
            ['event'],
            ['number', 'string', 'boolean', 'color', 'zip', 'css']
        ],

        color: [],

        gradient: [
            ['color', 'string'],
            ['color', 'string'],
            ['color', 'string'],
            ['number']
        ],

        'custom-node': [
            ['number']
        ],

        unzip: [
            ['zip'],
            ['number']
        ],

        math: [
            ['number']
        ],

        main: [
            ['number', 'string', 'boolean'],
            ['color', 'string'],
            ['color', 'string'],
            ['boolean']
        ],

        not: [['boolean']],
        and: [['boolean'], ['boolean']],
        or: [['boolean'], ['boolean']],
        fallback: [['number', 'string', 'boolean'], ['number', 'string', 'boolean']],
        clamp: [['number'], ['number'], ['number']],
        'min-val': [['number'], ['number']],
        'max-val': [['number'], ['number']],
        'string-split': [['string']],
        'string-replace': [['string']],
        'string-trim': [['string']],
        'string-upper': [['string']],
        'string-lower': [['string']],
        'string-includes': [['string'], ['string']],
        'number-parse': [['string', 'number']],
        'number-to-base': [['number']],
        'multi-concat': [['string', 'number', 'boolean'], ['string', 'number', 'boolean'], ['string', 'number', 'boolean']],
        'css-unit': [['number']],
        'css-margin': [['css-unit'], ['css-unit'], ['css-unit'], ['css-unit']],
        'css-padding': [['css-unit'], ['css-unit'], ['css-unit'], ['css-unit']],
        'css-width': [['css-unit']],
        'css-height': [['css-unit']],
        'css-font-size': [['css-unit']],
        'css-color': [['color', 'string']],
        'css-join': [['css', 'string', 'color', 'number', 'boolean'], ['css', 'string', 'color', 'number', 'boolean'], ['css', 'string', 'color', 'number', 'boolean']],
        output: [
            ['number', 'string', 'boolean', 'color', 'zip'], // 0: value
            ['color', 'string'],                              // 1: background
            ['color', 'string'],                              // 2: color (text)
            ['boolean'],                                      // 3: disabled
            ['css', 'string'],                                // 4: custom CSS
        ],
    };

    const isCaseNodeType = (type: CanvasElement['type']): type is 'case-range' | 'case-value' => {
        return type === 'case-range' || type === 'case-value';
    };

    const getInputIndex = (inputName: string): number => {
        const parsed = parseInt(inputName.replace('input', ''), 10);
        return Number.isFinite(parsed) ? parsed : -1;
    };

    const reconcileGradientConnections = (
        currentConnections: Connection[],
        elementId: string,
        previousColorCount: number,
        nextColorCount: number
    ): Connection[] => {
        const oldAngleInput = `input${previousColorCount}`;
        const newAngleInput = `input${nextColorCount}`;
        const keepUpToColorIndex = Math.min(previousColorCount, nextColorCount);

        return currentConnections
            .map((conn) => {
                if (conn.toId !== elementId) {
                    return conn;
                }

                if (conn.toInput === oldAngleInput) {
                    return { ...conn, toInput: newAngleInput };
                }

                const inputIndex = getInputIndex(conn.toInput);
                if (inputIndex >= 0 && inputIndex < keepUpToColorIndex) {
                    return conn;
                }

                return null;
            })
            .filter((conn): conn is Connection => Boolean(conn));
    };

    const getLiteralType = (raw: unknown): 'number' | 'string' | 'boolean' => {
        if (typeof raw === 'boolean') return 'boolean';
        if (typeof raw === 'number' && Number.isFinite(raw)) return 'number';

        const text = String(raw ?? '').trim();
        if (text === 'true' || text === 'false') return 'boolean';
        if (text !== '' && Number.isFinite(Number(text))) return 'number';
        return 'string';
    };

    const toFormulaLiteral = (raw: unknown): string => {
        if (raw === null || raw === undefined) return '0';
        if (typeof raw === 'boolean') return raw ? 'true' : 'false';
        if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);

        const text = String(raw).trim();
        if (text === '') return '0';
        if (text === 'true' || text === 'false') return text;
        if (Number.isFinite(Number(text))) return String(Number(text));
        return JSON.stringify(text);
    };

    const getDefaultNodeData = (type: CanvasElement['type']): CanvasElement['data'] => {
        switch (type) {
            case 'number':
                return { value: 0, valueText: '0' };
            case 'constant-boolean':
                return { value: false };
            case 'constant-string':
                return { value: '' };
            case 'calculation':
                return { operation: '+', inputValues: [0], inputOperations: {} };
            case 'condition':
                return { operation: '===' };
            case 'case-range':
                return { min: 0, max: 100, out: '0' };
            case 'case-value':
                return { caseValue: 0, out: '0' };
            case 'element-id':
                return { elementId: '' };
            case 'memory-read-number':
                return { variableKey: '', defaultValue: 0, persistVariable: false };
            case 'memory-read-string':
                return { variableKey: '', defaultValue: '', persistVariable: false };
            case 'memory-read-boolean':
                return { variableKey: '', defaultValue: false, persistVariable: false };
            case 'memory-write-number':
            case 'memory-write-string':
            case 'memory-write-boolean':
                return { variableKey: '' };
            case 'event-element':
                return { eventElement: '', eventType: 'click' };
            case 'event-id':
                return { eventId: '', eventType: 'click' };
            case 'event-processor':
                return { passOnlyOnEvent: false };
            case 'fallback':
                return {};
            case 'element':
            case 'regex':
                return { regexPattern: '' };
            case 'cut-a':
            case 'cut-b':
            case 'cut-c':
                return { reverse: false };
            case 'color':
                return { colorValue: '#2563eb' };
            case 'gradient':
                return {
                    gradientColorCount: GRADIENT_DEFAULT_COLORS.length,
                    gradientColors: [...GRADIENT_DEFAULT_COLORS],
                    gradientAngle: 90
                };
            case 'custom-node':
                return {
                    customNodeId: '',
                    customNodeName: '',
                    customInputSchema: [],
                    customOutputSchema: [],
                    customTemplateFormula: '',
                    customInputValues: [],
                    zipOutput: false,
                };
            case 'unzip':
                return {
                    unzipIndex: 0,
                };
            case 'bool-count':
                return {};
            case 'math':
                return { mathFunction: 'sin' };
            case 'main':
                return { formula: '', logicTargets: [''] };
            case 'output':
                return { selectedElement: '', outputs: [], executeOnLoad: true, useIdInput: false };
            case 'not':
            case 'and':
            case 'or':
                return {};
            case 'clamp':
                return {};
            case 'min-val':
            case 'max-val':
                return {};
            case 'string-split':
                return { splitDelimiter: ',', splitIndex: 0 };
            case 'string-replace':
                return { replaceFind: '', replaceWith: '' };
            case 'string-trim':
            case 'string-upper':
            case 'string-lower':
            case 'string-includes':
                return {};
            case 'number-parse':
                return { parseRadix: 10 };
            case 'number-to-base':
                return { parseRadix: 16 };
            case 'multi-concat':
                return { inputCount: 3 };
            case 'css-join':
                return { inputCount: 3 };
            case 'css-unit':
                return { cssUnit: 'px', cssUnitValue: '0' };
            case 'css-display':
                return { cssDisplay: 'block' };
            case 'css-color':
                return { colorValue: '#2563eb' };
            case 'css-text':
                return { cssText: '' };
            case 'css-margin':
            case 'css-padding':
            case 'css-width':
            case 'css-height':
            case 'css-font-size':
                return {};
            default:
                return { operation: '+' };
        }
    };

    const VALID_NODE_TYPES: CanvasElement['type'][] = [
        'main',
        'element',
        'number',
        'constant-boolean',
        'constant-string',
        'calculation',
        'node',
        'case-range',
        'case-value',
        'switch',
        'condition',
        'regex',
        'concat',
        'cut-a',
        'cut-b',
        'cut-c',
        'string-count-chars',
        'string-count-words',
        'string-find-start',
        'string-find-end',
        'string-to-number',
        'number-to-string',
        'bool-count',
        'color',
        'gradient',
        'custom-node',
        'unzip',
        'output',
        'not',
        'and',
        'or',
        'clamp',
        'min-val',
        'max-val',
        'string-split',
        'string-replace',
        'string-trim',
        'string-includes',
        'string-upper',
        'string-lower',
        'number-parse',
        'number-to-base',
        'multi-concat',
        'css-unit',
        'css-margin',
        'css-padding',
        'css-width',
        'css-height',
        'css-font-size',
        'css-display',
        'css-color',
        'css-text',
        'css-join',
        'operator',
        'math',
        'comparison',
        'logic',
        'constant',
        'variable',
        'memory-read-number',
        'memory-read-string',
        'memory-read-boolean',
        'memory-write-number',
        'memory-write-string',
        'memory-write-boolean',
        'element-id',
        'event-element',
        'event-id',
        'event-processor',
        'fallback',
    ];

    const normalizeLoadedElements = (source: unknown[]): CanvasElement[] => {
        const seenIds = new Set<string>();
        const isValidType = (type: string): type is CanvasElement['type'] =>
            (VALID_NODE_TYPES as string[]).includes(type);

        return source
            .map((item, index) => {
                if (!item || typeof item !== 'object') {
                    return null;
                }

                const raw = item as Record<string, unknown>;
                const typeRaw = String(raw.type || '').trim();
                const type = isValidType(typeRaw) ? typeRaw : 'calculation';

                let id = String(raw.id || (type === 'main' ? 'main-block' : `element-${index}`)).trim();
                if (!id) {
                    id = type === 'main' ? 'main-block' : `element-${index}`;
                }
                if (seenIds.has(id)) {
                    let suffix = 1;
                    let next = `${id}-${suffix}`;
                    while (seenIds.has(next)) {
                        suffix += 1;
                        next = `${id}-${suffix}`;
                    }
                    id = next;
                }
                seenIds.add(id);

                const rawData = raw.data && typeof raw.data === 'object'
                    ? (raw.data as CanvasElement['data'])
                    : {};

                const xRaw = Number(raw.x);
                const yRaw = Number(raw.y);
                const x = Number.isFinite(xRaw) ? xRaw : 120 + (index * 20);
                const y = Number.isFinite(yRaw) ? yRaw : 120 + (index * 20);
                const name = type === 'main'
                    ? (customNodeMode ? 'Zip Output' : 'Html Element')
                    : String(raw.name || `Node ${index + 1}`);

                const mergedData: CanvasElement['data'] = {
                    ...getDefaultNodeData(type),
                    ...rawData,
                };

                if (type === 'gradient') {
                    const legacyGradient = [
                        String((rawData as CanvasElement['data'])?.gradientFrom ?? '').trim(),
                        String((rawData as CanvasElement['data'])?.gradientMid ?? '').trim(),
                        String((rawData as CanvasElement['data'])?.gradientTo ?? '').trim(),
                    ].filter((value) => value.length > 0);

                    const rawColors = Array.isArray((rawData as CanvasElement['data'])?.gradientColors)
                        ? (rawData as CanvasElement['data'])?.gradientColors
                        : legacyGradient;
                    const fallbackCount = Math.max(
                        legacyGradient.length,
                        Array.isArray(rawColors) ? rawColors.length : 0,
                        GRADIENT_DEFAULT_COLORS.length
                    );
                    const gradientColorCount = normalizeGradientColorCount(
                        (rawData as CanvasElement['data'])?.gradientColorCount,
                        fallbackCount
                    );
                    const gradientColors = ensureGradientColors(rawColors, gradientColorCount);

                    mergedData.gradientColorCount = gradientColorCount;
                    mergedData.gradientColors = gradientColors;
                    mergedData.gradientFrom = gradientColors[0];
                    mergedData.gradientMid = gradientColors[1];
                    mergedData.gradientTo = gradientColors[2];
                    mergedData.gradientAngle = Number.isFinite(Number((rawData as CanvasElement['data'])?.gradientAngle))
                        ? Number((rawData as CanvasElement['data'])?.gradientAngle)
                        : Number(mergedData.gradientAngle ?? 90);
                }

                const element: CanvasElement = {
                    id,
                    name,
                    type,
                    x,
                    y,
                    data: mergedData,
                };

                const valueTypeRaw = raw.valueType;
                if (
                    valueTypeRaw === 'number'
                    || valueTypeRaw === 'string'
                    || valueTypeRaw === 'boolean'
                    || valueTypeRaw === 'case'
                    || valueTypeRaw === 'color'
                    || valueTypeRaw === 'zip'
                    || valueTypeRaw === 'css'
                    || valueTypeRaw === 'css-unit'
                    || valueTypeRaw === 'event'
                ) {
                    element.valueType = valueTypeRaw;
                }

                return element;
            })
            .filter((element): element is CanvasElement => Boolean(element));
    };

    const normalizePinName = (rawValue: unknown, prefix: 'input' | 'output'): string => {
        const raw = String(rawValue || '').trim();
        if (!raw) {
            return `${prefix}0`;
        }

        const numberMatch = raw.match(/(\d+)/);
        if (!numberMatch) {
            return `${prefix}0`;
        }

        const index = Number.parseInt(numberMatch[1], 10);
        return `${prefix}${Number.isFinite(index) ? index : 0}`;
    };

    const normalizeLoadedConnections = (source: unknown[], validElementIds?: Set<string>): Connection[] => {
        return source
            .map((item, index) => {
                if (!item || typeof item !== 'object') {
                    return null;
                }

                const raw = item as Record<string, unknown>;
                const fromRef = raw.from && typeof raw.from === 'object' ? (raw.from as Record<string, unknown>) : null;
                const toRef = raw.to && typeof raw.to === 'object' ? (raw.to as Record<string, unknown>) : null;
                const fromId = String(raw.fromId || fromRef?.id || '').trim();
                const toId = String(raw.toId || toRef?.id || '').trim();
                const fromOutputRaw = raw.fromOutput || fromRef?.output || fromRef?.pin || '';
                const toInputRaw = raw.toInput || toRef?.input || toRef?.pin || '';

                if (!fromId || !toId) {
                    return null;
                }

                if (validElementIds && (!validElementIds.has(fromId) || !validElementIds.has(toId))) {
                    return null;
                }

                const fromOutput = normalizePinName(fromOutputRaw, 'output');
                const toInput = normalizePinName(toInputRaw, 'input');

                const valueTypeRaw = raw.valueType;
                const valueType = valueTypeRaw === 'number' || valueTypeRaw === 'string' || valueTypeRaw === 'boolean' || valueTypeRaw === 'case' || valueTypeRaw === 'color' || valueTypeRaw === 'zip' || valueTypeRaw === 'css' || valueTypeRaw === 'css-unit' || valueTypeRaw === 'event'
                    ? valueTypeRaw
                    : undefined;

                const connectionTypeRaw = raw.connectionType;
                const connectionType = connectionTypeRaw === 'case' || connectionTypeRaw === 'normal'
                    ? connectionTypeRaw
                    : undefined;

                const connection: Connection = {
                    id: String(raw.id || `conn-${Date.now()}-${index}`),
                    fromId,
                    fromOutput,
                    toId,
                    toInput,
                };

                if (
                    raw.operation === '+' || raw.operation === '-' || raw.operation === '*'
                    || raw.operation === '/' || raw.operation === '**' || raw.operation === '%'
                    || raw.operation === '===' || raw.operation === '!=='
                    || raw.operation === '>' || raw.operation === '<'
                    || raw.operation === '>=' || raw.operation === '<='
                ) {
                    connection.operation = raw.operation;
                }
                if (valueType) {
                    connection.valueType = valueType;
                }
                if (connectionType) {
                    connection.connectionType = connectionType;
                }

                return connection;
            })
            .filter((connection): connection is Connection => Boolean(connection));
    };

    const reconcileLoadedConnections = (
        sourceConnections: Connection[],
        normalizedElements: CanvasElement[]
    ): Connection[] => {
        const validIds = new Set(normalizedElements.map((element) => element.id));
        const nonMainIds = normalizedElements
            .map((element) => element.id)
            .filter((id) => id !== 'main-block');

        const resolveEndpointId = (rawId: string): string => {
            if (validIds.has(rawId)) {
                return rawId;
            }

            const rawNumeric = Number(rawId);
            if (Number.isFinite(rawNumeric)) {
                const byNumeric = normalizedElements.find((element) => Number(element.id) === rawNumeric);
                if (byNumeric) {
                    return byNumeric.id;
                }
            }

            const rawDigits = rawId.replace(/\D/g, '');
            if (rawDigits) {
                const byDigits = normalizedElements.find((element) => element.id.replace(/\D/g, '') === rawDigits);
                if (byDigits) {
                    return byDigits.id;
                }
            }

            return rawId;
        };

        return sourceConnections
            .map((conn) => {
                let fromId = resolveEndpointId(conn.fromId);
                let toId = resolveEndpointId(conn.toId);

                // Fallback for simple template/block graphs: single source node -> main-block.
                if (!validIds.has(fromId) && toId === 'main-block' && nonMainIds.length === 1) {
                    fromId = nonMainIds[0];
                }
                if (!validIds.has(toId) && fromId !== 'main-block' && validIds.has(fromId) && validIds.has('main-block')) {
                    toId = 'main-block';
                }

                return {
                    ...conn,
                    fromId,
                    toId,
                };
            })
            .filter((conn) => validIds.has(conn.fromId) && validIds.has(conn.toId));
    };

    const ensureMainBlock = (source: CanvasElement[]): CanvasElement[] => {
        // In logic mode and template mode, no fixed main-block needed
        if (mainElementType === 'logic' || templateMode) {
            return source;
        }
        const hasMain = source.some((element) => element.type === 'main');
        if (hasMain) {
            return source;
        }

        return [
            {
                id: 'main-block',
                name: 'Html Element',
                type: 'main',
                x: 400,
                y: 200,
                data: { formula: '' },
                connections: [],
            },
            ...source,
        ];
    };

    const remapElementIdsFromConnections = (
        elementsInput: CanvasElement[],
        sourceConnections: Connection[]
    ): { elements: CanvasElement[]; remapped: boolean; reason: string } => {
        const endpointIds = Array.from(
            new Set(
                sourceConnections
                    .flatMap((conn) => [conn.fromId, conn.toId])
                    .filter((id) => id && id !== 'main-block')
            )
        );
        if (endpointIds.length === 0) {
            return { elements: elementsInput, remapped: false, reason: 'no endpoint ids in connections' };
        }

        const existingIds = new Set(elementsInput.map((element) => element.id));
        const matchedEndpointCount = endpointIds.filter((id) => existingIds.has(id)).length;
        if (matchedEndpointCount > 0) {
            return { elements: elementsInput, remapped: false, reason: 'at least one endpoint already matched' };
        }

        const mainCandidates = elementsInput.filter((element) => element.type === 'main');
        const nonMainElements = elementsInput.filter((element) => element.type !== 'main');
        const endpointWithoutMain = endpointIds.filter((id) => id !== 'main-block');

        if (nonMainElements.length !== endpointWithoutMain.length) {
            return {
                elements: elementsInput,
                remapped: false,
                reason: `non-main count mismatch (elements=${nonMainElements.length}, endpointIds=${endpointWithoutMain.length})`,
            };
        }

        const sortedEndpointIds = [...endpointWithoutMain].sort((a, b) => Number(a) - Number(b));
        const remapPairs = new Map<string, string>();

        nonMainElements.forEach((element, index) => {
            const targetId = sortedEndpointIds[index] || element.id;
            remapPairs.set(element.id, targetId);
        });

        const remappedElements = elementsInput.map((element) => {
            if (element.type === 'main') {
                const normalizedMainId = mainCandidates.length > 0 ? 'main-block' : element.id;
                if (element.id === normalizedMainId) {
                    return element;
                }
                return { ...element, id: normalizedMainId };
            }

            const targetId = remapPairs.get(element.id);
            if (!targetId || targetId === element.id) {
                return element;
            }
            return { ...element, id: targetId };
        });

        return {
            elements: remappedElements,
            remapped: true,
            reason: `remapped non-main ids from [${nonMainElements.map((el) => el.id).join(', ')}] to [${sortedEndpointIds.join(', ')}]`,
        };
    };

    const applyLoadedState = (
        snapshot: { elements?: unknown[]; connections?: unknown[]; formula?: string }
    ) => {
        const normalizedElements = ensureMainBlock(normalizeLoadedElements(snapshot.elements || []));
        const sourceConnections = normalizeLoadedConnections(snapshot.connections || []);
        const remapResult = remapElementIdsFromConnections(normalizedElements, sourceConnections);
        const reconciledElements = remapResult.elements;
        const normalizedConnections = reconcileLoadedConnections(sourceConnections, reconciledElements);
        const normalizedFormula = typeof snapshot.formula === 'string' ? snapshot.formula : '';

        const typedElements = updateElementValueTypes(reconciledElements, normalizedConnections);
        setElements(typedElements);
        connectionsRef.current = normalizedConnections;
        setConnections(normalizedConnections);
        setFormula(normalizedFormula);
        formulaRef.current = normalizedFormula;

        return {
            elements: typedElements,
            connections: normalizedConnections,
            formula: normalizedFormula,
        };
    };

    const isSnapshotEffectivelyEmpty = (snapshot: SavedState | null): boolean => {
        if (!snapshot) {
            return true;
        }

        const elementsCount = Array.isArray(snapshot.elements) ? snapshot.elements.length : 0;
        const connectionsCount = Array.isArray(snapshot.connections) ? snapshot.connections.length : 0;
        const hasFormula = typeof snapshot.formula === 'string' && snapshot.formula.trim() !== '';

        return connectionsCount === 0 && elementsCount <= 1 && !hasFormula;
    };

    const areSnapshotsEquivalent = (left: SavedState | null, right: SavedState | null): boolean => {
        if (!left || !right) {
            return false;
        }
        const normalizeForCompare = (snapshot: SavedState): string => JSON.stringify({
            elements: Array.isArray(snapshot.elements) ? snapshot.elements : [],
            connections: Array.isArray(snapshot.connections) ? snapshot.connections : [],
            formula: typeof snapshot.formula === 'string' ? snapshot.formula : '',
        });
        return normalizeForCompare(left) === normalizeForCompare(right);
    };

    const toComparableSnapshot = (snapshot: Partial<SavedState> | null) => ({
        elements: Array.isArray(snapshot?.elements) ? snapshot.elements : [],
        connections: Array.isArray(snapshot?.connections) ? snapshot.connections : [],
        formula: typeof snapshot?.formula === 'string' ? snapshot.formula : '',
    });

    useEffect(() => {
        if (hasInitializedRef.current) {
            return;
        }
        hasInitializedRef.current = true;

        const attributeState = normalizeSnapshot(initialState);
        const saved = normalizeSnapshot(localStorage.getItem(SAVE_KEY));
        const autosave = normalizeSnapshot(localStorage.getItem(AUTOSAVE_KEY));

        if (autosave) {
            setAutosaveState(autosave as SavedState);
        }

        const autosaveCandidate = autosave as SavedState | null;
        const savedCandidate = saved as SavedState | null;
        const attributeCandidate = attributeState as SavedState | null;
        const hasMeaningfulAttribute = Boolean(
            attributeCandidate
            && !isSnapshotEffectivelyEmpty(attributeCandidate)
        );

        let snapshotToLoad: SavedState | null = null;
        if (forceInitialState) {
            // Force mode: prefer provided state, then explicit saved state.
            snapshotToLoad = attributeCandidate || savedCandidate;
        } else if (hasMeaningfulAttribute) {
            // Block attribute is canonical when non-empty.
            snapshotToLoad = attributeCandidate;
        } else {
            snapshotToLoad = savedCandidate;
        }

        if (!snapshotToLoad) {
            snapshotToLoad = resolveInitialSnapshot(attributeCandidate, savedCandidate, null) as SavedState | null;
        }

        let synced: SavedState | null = null;
        if (snapshotToLoad) {
            const loaded = applyLoadedState({
                elements: snapshotToLoad.elements || [],
                connections: snapshotToLoad.connections || [],
                formula: snapshotToLoad.formula || '',
            });

            // Keep storage aligned with the loaded canonical state to avoid future conflicts.
            synced = {
                elements: loaded.elements,
                connections: loaded.connections,
                formula: loaded.formula,
                updatedAt: typeof snapshotToLoad.updatedAt === 'number' ? snapshotToLoad.updatedAt : Date.now(),
            };
            localStorage.setItem(SAVE_KEY, JSON.stringify(synced));
            setSavedState(synced);

            // Preserve draft autosave when it differs from saved snapshot.
            if (!autosaveCandidate || areSnapshotsEquivalent(autosaveCandidate, synced)) {
                localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(synced));
                setAutosaveState(synced);
            }
        }

        const baselineSnapshot = synced || snapshotToLoad || savedCandidate || attributeCandidate;
        const autosaveUpdatedAt = Number(autosaveCandidate?.updatedAt || 0);
        const baselineUpdatedAt = Number((baselineSnapshot as SavedState | null)?.updatedAt || 0);
        const hasReliableTimestamps = autosaveUpdatedAt > 0 && baselineUpdatedAt > 0;
        const isDraftNewerOrTimestampUnknown = !hasReliableTimestamps || autosaveUpdatedAt > baselineUpdatedAt;

        const hasRecoverableDraft = Boolean(
            autosaveCandidate
            && !isSnapshotEffectivelyEmpty(autosaveCandidate)
            && (
                !baselineSnapshot
                || !areSnapshotsEquivalent(autosaveCandidate, baselineSnapshot)
            )
            && (
                !baselineSnapshot
                || isDraftNewerOrTimestampUnknown
            )
        );

        if (hasRecoverableDraft && autosaveCandidate) {
            setRecoverableDraftState(autosaveCandidate);
            setPendingDraftRecovery(autosaveCandidate);
            setShowDraftRecoveryNotice(true);
        } else {
            setRecoverableDraftState(null);
            setPendingDraftRecovery(null);
            setShowDraftRecoveryNotice(false);
        }

        setIsStateLoaded(true);
    }, [SAVE_KEY, AUTOSAVE_KEY, initialState, forceInitialState]);


    useEffect(() => {
        if (!isStateLoaded) return;
        if (showDraftRecoveryNotice && pendingDraftRecovery) return;
        const data: SavedState = { elements, connections, formula, updatedAt: Date.now() };
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
        setAutosaveState(data);
    }, [elements, connections, formula, AUTOSAVE_KEY, isStateLoaded, showDraftRecoveryNotice, pendingDraftRecovery]);


    useEffect(() => {
        if (!liveStateSync || !isStateLoaded || !onStateChangeRef.current) return;

        // In customNodeMode fire immediately so the parent always has the latest state
        const delay = customNodeMode ? 0 : 150;
        const timeoutId = window.setTimeout(() => {
            onStateChangeRef.current?.({
                elements,
                connections,
                formula,
                updatedAt: Date.now(),
            });
        }, delay);

        return () => window.clearTimeout(timeoutId);
    }, [elements, connections, formula, isStateLoaded, customNodeMode, liveStateSync]);

    useEffect(() => {
        return () => {
            if (!liveStateSync || !onStateChangeRef.current || !isStateLoadedRef.current) return;
            onStateChangeRef.current({
                elements: elementsRef.current,
                connections: connectionsRef.current,
                formula: formulaRef.current,
                updatedAt: Date.now(),
            });
        };
    }, [liveStateSync]);



    useEffect(() => {
        const currentComparable = toComparableSnapshot({
            elements,
            connections,
            formula
        });

        if (!savedState) {
            const hasData = connections.length > 0
                || elements.length > 1
                || (typeof formula === 'string' && formula.trim() !== '');
            setUnsavedChanges(hasData);
            return;
        }

        const savedComparable = toComparableSnapshot(savedState);
        const changed = JSON.stringify(currentComparable) !== JSON.stringify(savedComparable);
        setUnsavedChanges(changed);
    }, [elements, connections, formula, savedState]);

    useEffect(() => {
        onUnsavedChange?.(unsavedChanges);
    }, [unsavedChanges, onUnsavedChange]);

    const pendingDraftLabel = React.useMemo(() => {
        const updatedAt = pendingDraftRecovery?.updatedAt;
        if (!updatedAt || !Number.isFinite(updatedAt)) {
            return '';
        }
        try {
            return new Date(updatedAt).toLocaleString();
        } catch (_error) {
            return '';
        }
    }, [pendingDraftRecovery]);


    const handleSave = () => {
        const currentElements = elementsRef.current;
        const currentConnections = connectionsRef.current;
        const blockingErrors = getDynamicInputGapErrors(currentElements, currentConnections);
        if (Object.keys(blockingErrors).length > 0) {
            const firstError = Object.values(blockingErrors)[0];
            setTemplateInfo(`Save blocked: ${firstError}`);
            return;
        }
        const { formula: generatedFormula } = generateFormula(currentElements, currentConnections);
        const nextFormula = generatedFormula || formulaRef.current;
        const data: SavedState = {
            elements: currentElements,
            connections: currentConnections,
            formula: nextFormula,
            updatedAt: Date.now()
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
        connectionsRef.current = currentConnections;
        setFormula(nextFormula);
        setSavedState(data);
        setAutosaveState(data);
        setUnsavedChanges(false);
        setRecoverableDraftState(null);
        setPendingDraftRecovery(null);
        setShowDraftRecoveryNotice(false);
        onFormulaChange?.(nextFormula);
        onStateChange?.(data);
    };


    const handleRestore = () => {
        const data = savedState || normalizeSnapshot(localStorage.getItem(SAVE_KEY));
        if (!data) return;

        applyLoadedState({
            elements: data.elements || [],
            connections: data.connections || [],
            formula: data.formula || '',
        });
        setSavedState({
            elements: data.elements || [],
            connections: data.connections || [],
            formula: data.formula || '',
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
        });
        setUnsavedChanges(false);
    };

    const handleRestoreUnsaved = () => {
        const source = pendingDraftRecovery || recoverableDraftState || autosaveState;
        if (!source) return;

        applyLoadedState({
            elements: source.elements || [],
            connections: source.connections || [],
            formula: source.formula || '',
        });
        setShowDraftRecoveryNotice(false);
        setPendingDraftRecovery(null);
        setRecoverableDraftState(null);
    };

    const handleDismissDraftRecovery = () => {
        const currentDraft = pendingDraftRecovery || recoverableDraftState || autosaveState;
        if (!currentDraft) {
            setShowDraftRecoveryNotice(false);
            setPendingDraftRecovery(null);
            return;
        }

        setShowDraftRecoveryNotice(false);
        setPendingDraftRecovery(null);
        setRecoverableDraftState(null);

        if (savedState) {
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(savedState));
            setAutosaveState(savedState);
        } else {
            localStorage.removeItem(AUTOSAVE_KEY);
            setAutosaveState(null);
        }
    };

    // Initialize canvas to be centered
    React.useEffect(() => {
        if (canvasRef.current) {
            const container = canvasRef.current;
            const containerRect = container.getBoundingClientRect();
            // Center the view
            const centerX = containerRect.width / 2;
            const centerY = containerRect.height / 2;

            setOffsetX(centerX);
            setOffsetY(centerY);
        }
    }, []);
    
    // Sync refs with state to avoid closure issues
    React.useEffect(() => {
        isDraggingFromSidebarRef.current = isDraggingFromSidebar;
    }, [isDraggingFromSidebar]);

    React.useEffect(() => {
        draggedItemRef.current = draggedItem;
    }, [draggedItem]);
    
    React.useEffect(() => {
        isDraggingCanvasElementRef.current = isDraggingCanvasElement;
    }, [isDraggingCanvasElement]);

    React.useEffect(() => {
        isPanningRef.current = isPanning;
    }, [isPanning]);
    
    React.useEffect(() => {
        connectionInProgressRef.current = connectionInProgress;
    }, [connectionInProgress]);
    
    React.useEffect(() => {
        elementsRef.current = elements;
    }, [elements]);

    React.useEffect(() => {
        detectedElementsRef.current = detectedElements;
    }, [detectedElements]);
    
    React.useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);
    
    React.useEffect(() => {
        offsetXRef.current = offsetX;
    }, [offsetX]);
    
    React.useEffect(() => {
        offsetYRef.current = offsetY;
    }, [offsetY]);
    
    React.useEffect(() => {
        connectionsRef.current = connections;
    }, [connections]);

    React.useEffect(() => {
        formulaRef.current = formula;
    }, [formula]);

    React.useEffect(() => {
        onStateChangeRef.current = onStateChange;
    }, [onStateChange]);

    React.useEffect(() => {
        isStateLoadedRef.current = isStateLoaded;
    }, [isStateLoaded]);

    React.useEffect(() => {
        customNodesRef.current = customNodes;
    }, [customNodes]);

    React.useEffect(() => {
        setElements((prev) =>
            prev.map((element) => {
                if (element.id !== 'main-block' || element.type !== 'main') {
                    return element;
                }
                return {
                    ...element,
                    name: customNodeMode ? 'Zip Output' : 'Html Element',
                };
            })
        );
    }, [customNodeMode]);

    React.useEffect(() => {
        previousElementsCountRef.current = elements.length;
    }, []);

    // Keep connections in sync when nodes are deleted (remove orphan edges).
    // We intentionally skip prune on load/replace to avoid dropping valid connections
    // during hydration when ids/states may settle across renders.
    React.useEffect(() => {
        const previousCount = previousElementsCountRef.current;
        const currentCount = elements.length;
        previousElementsCountRef.current = currentCount;

        if (currentCount >= previousCount) {
            return;
        }

        setConnections(prev => {
            const existingIds = new Set(elements.map(el => el.id));
            const next = prev.filter(conn => existingIds.has(conn.fromId) && existingIds.has(conn.toId));
            const resolved = next.length === prev.length ? prev : next;
            connectionsRef.current = resolved;
            return resolved;
        });
    }, [elements]);

    // Track zoom delta
    React.useEffect(() => {
        const newZoomDelta = zoom / prevZoomRef.current;
        setZoomDelta(newZoomDelta);
        zoomDeltaRef.current = newZoomDelta;
        prevZoomRef.current = zoom;
    }, [zoom]);

    // Track offset delta
    React.useEffect(() => {
        const deltaX = offsetX - prevOffsetXRef.current;
        const deltaY = offsetY - prevOffsetYRef.current;
        setOffsetDelta({ x: deltaX, y: deltaY });
        offsetDeltaRef.current = { x: deltaX, y: deltaY };
        prevOffsetXRef.current = offsetX;
        prevOffsetYRef.current = offsetY;
    }, [offsetX, offsetY]);

    // Sync dragElementDelta to ref
    React.useEffect(() => {
        dragElementDeltaRef.current = dragElementDelta;
    }, [dragElementDelta]);

    // Real-time pin position updates on every state change
    // Removed predictive pin position cache; positions are always current geometry.
    React.useEffect(() => {
        // No work needed here because getPinPosition always computes from element geometry.
    }, [elements, connections, zoom, offsetX, offsetY]);

    // Detect DOM elements after component mounts
    React.useEffect(() => {
        if (templateMode || customNodeMode) {
            const templateElementTypes: DetectedElement[] = [
                {
                    id: 'template-number',
                    type: 'input-number',
                    name: 'Template Number',
                    outputs: [{ name: 'value', type: 'number' }],
                },
                {
                    id: 'template-boolean',
                    type: 'checkbox',
                    name: 'Template Boolean',
                    outputs: [{ name: 'value', type: 'boolean' }],
                },
                {
                    id: 'template-string',
                    type: 'select',
                    name: 'Template String',
                    outputs: [{ name: 'value', type: 'string' }],
                },
            ];
            setDetectedElements(templateElementTypes);
            return;
        }

        const detectElements = () => {
            const getCanvasDocument = (): Document => {
                const iframe = document.querySelector('iframe[name="editor-canvas"]');
                if (iframe instanceof HTMLIFrameElement && iframe.contentDocument) {
                    return iframe.contentDocument;
                }
                return document;
            };
            const doc = getCanvasDocument();

            // Exclude elements inside the graph editor UI itself
            const isInsideEditor = (el: Element): boolean => {
                return !!(
                    el.closest('.graph-editor')
                    || el.closest('.calcgraph-editor-modal')
                    || el.closest('[data-nodelogic-logic]')
                    || el.closest('.components-modal__frame')
                    || el.closest('.block-editor-block-list__layout')?.closest('.components-modal__frame')
                );
            };

            const rangeElements: DetectedElement[] = Array.from(doc.querySelectorAll('input[type="range"]'))
                .filter(el => !isInsideEditor(el))
                .map((el, index) => {
                    const htmlEl = el as HTMLElement;
                    return {
                        id: htmlEl.id || htmlEl.dataset.sliderId || htmlEl.dataset.nodelogicId || `seekbar-${index}`,
                        type: 'slider' as const,
                        name: htmlEl.dataset.nodelogicLabel || htmlEl.id || htmlEl.dataset.sliderId || `Seekbar ${index + 1}`,
                        outputs: [{ name: 'value', type: 'number' as const }]
                    };
                });

            const numberElements: DetectedElement[] = Array.from(doc.querySelectorAll('input[type="number"]'))
                .filter(el => !isInsideEditor(el))
                .map((el, index) => {
                    const htmlEl = el as HTMLInputElement;
                    return {
                        id: htmlEl.id || htmlEl.dataset.nodelogicId || `number-input-${index}`,
                        type: 'input-number' as const,
                        name: htmlEl.dataset.nodelogicLabel || htmlEl.id || `Number Input ${index + 1}`,
                        outputs: [{ name: 'value', type: 'number' as const }]
                    };
                });

            const stringElements: DetectedElement[] = Array.from(doc.querySelectorAll('input[type="text"]'))
                .filter(el => !isInsideEditor(el))
                .map((el, index) => {
                    const htmlEl = el as HTMLInputElement;
                    return {
                        id: htmlEl.id || htmlEl.dataset.nodelogicId || `string-input-${index}`,
                        type: 'input-string' as const,
                        name: htmlEl.dataset.nodelogicLabel || htmlEl.id || `Text Input ${index + 1}`,
                        outputs: [{ name: 'value', type: 'string' as const }]
                    };
                });

            const checkboxElements: DetectedElement[] = Array.from(doc.querySelectorAll('input[type="checkbox"]'))
                .filter(el => !isInsideEditor(el))
                .map((el, index) => {
                    const htmlEl = el as HTMLInputElement;
                    return {
                        id: htmlEl.id || htmlEl.dataset.nodelogicId || `checkbox-${index}`,
                        type: 'checkbox' as const,
                        name: htmlEl.dataset.nodelogicLabel || htmlEl.id || `Checkbox ${index + 1}`,
                        outputs: [{ name: 'checked', type: 'boolean' as const }]
                    };
                });

            const radioGroups = new Map<string, DetectedElement>();
            Array.from(doc.querySelectorAll('input[type="radio"]'))
                .filter(el => !isInsideEditor(el))
                .forEach((el, index) => {
                    const htmlEl = el as HTMLInputElement;
                    const groupId = (htmlEl.name || htmlEl.id || `radio-${index}`).trim();
                    if (!groupId || radioGroups.has(groupId)) return;
                    radioGroups.set(groupId, {
                        id: groupId,
                        type: 'radio',
                        name: htmlEl.dataset.nodelogicLabel || htmlEl.name || htmlEl.id || `Radio Group ${index + 1}`,
                        outputs: [{ name: 'selected', type: 'string' }]
                    });
                });
            const radioElements = Array.from(radioGroups.values());

            const selectElements: DetectedElement[] = Array.from(doc.querySelectorAll('select'))
                .filter(el => !isInsideEditor(el))
                .map((el, index) => {
                    const htmlEl = el as HTMLSelectElement;
                    return {
                        id: htmlEl.id || htmlEl.dataset.nodelogicId || `select-${index}`,
                        type: 'select' as const,
                        name: htmlEl.dataset.nodelogicLabel || htmlEl.id || `Select ${index + 1}`,
                        outputs: [{ name: 'selected', type: 'string' as const }]
                    };
                });

            const buttonGroups: DetectedElement[] = Array.from(doc.querySelectorAll('.btn_container'))
                .filter(el => !isInsideEditor(el))
                .map((el, index) => {
                    const htmlEl = el as HTMLElement;
                    return {
                        id: htmlEl.id || htmlEl.dataset.nodelogicId || `button-group-${index}`,
                        type: 'button-group' as const,
                        name: htmlEl.dataset.nodelogicLabel || htmlEl.id || `Button Group ${index + 1}`,
                        outputs: [{ name: 'selected', type: 'string' as const }]
                    };
                });

            // Detect plugin's own label elements (data-nodelogic-id)
            const labelElements: DetectedElement[] = Array.from(doc.querySelectorAll('[data-nodelogic-id]'))
                .filter(el => !isInsideEditor(el) && !el.matches('input, select, textarea'))
                .map((el) => {
                    const htmlEl = el as HTMLElement;
                    const id = htmlEl.dataset.nodelogicId || '';
                    if (!id) return null;
                    return {
                        id,
                        type: 'input-string' as const,
                        name: htmlEl.dataset.nodelogicLabel || id,
                        outputs: [{ name: 'value', type: 'string' as const }]
                    };
                })
                .filter((el): el is DetectedElement => el !== null);

            // Detect any element with class nodelogic-detect (user-added external elements)
            const externalElements: DetectedElement[] = Array.from(doc.querySelectorAll('.nodelogic-detect'))
                .filter(el => !isInsideEditor(el))
                .map((el) => {
                    const htmlEl = el as HTMLElement;
                    const id = htmlEl.id || htmlEl.dataset.nodelogicId || '';
                    if (!id) return null;
                    const isInput = el.matches('input, select, textarea');
                    const outputType = el.matches('input[type="number"], input[type="range"]') ? 'number' as const
                        : el.matches('input[type="checkbox"]') ? 'boolean' as const
                        : 'string' as const;
                    return {
                        id,
                        type: isInput ? 'input-string' as const : 'input-string' as const,
                        name: htmlEl.dataset.nodelogicLabel || htmlEl.id || id,
                        outputs: [{ name: 'value', type: outputType }]
                    };
                })
                .filter((el): el is DetectedElement => el !== null);

            const allDetected = [
                ...rangeElements,
                ...numberElements,
                ...stringElements,
                ...checkboxElements,
                ...radioElements,
                ...selectElements,
                ...buttonGroups,
                ...labelElements,
                ...externalElements,
            ];

            const uniqueById = new Map<string, DetectedElement>();
            allDetected.forEach((detected) => {
                const key = String(detected.id || '').trim();
                if (!key || uniqueById.has(key)) return;
                uniqueById.set(key, detected);
            });

            setDetectedElements(Array.from(uniqueById.values()));
        };

        // Detect elements immediately
        detectElements();

        // Also detect elements after a short delay to ensure DOM is ready
        const timeoutId = setTimeout(detectElements, 100);

        return () => clearTimeout(timeoutId);
    }, [customNodeMode, templateMode]);

    const treeData: TreeItem[] = React.useMemo(() => {
        const base = (configuredTreeData as TreeItem[]).map((item) => ({
            ...item,
            children: item.children ? [...item.children] : undefined,
        }));

        if (mainElementType === 'logic' || templateMode) {
            // In logic mode and template mode, add Output node to the top of the sidebar
            const outputFolder: TreeItem = {
                id: 'output-folder',
                name: 'Outputs',
                type: 'folder',
                children: [
                    { id: 'output-node', name: 'Output Node', type: 'output' },
                ],
            };
            base.unshift(outputFolder);
        }

        // Build the set of node IDs that would cause recursion if used inside editingNodeId.
        // A node X causes recursion if X === editingNodeId, or if X transitively uses editingNodeId.
        const getRecursiveIds = (currentId: string): Set<string> => {
            const forbidden = new Set<string>([currentId]);
            if (!currentId) return forbidden;

            // For each custom node, collect which other custom node IDs it uses
            const usesMap = new Map<string, Set<string>>();
            customNodes.forEach(node => {
                const used = new Set<string>();
                const formula = String(node.state?.mainFormula || node.state?.formula || '');
                // The formula contains __customIn("nodeId") placeholders for inputs,
                // but the actual custom-node references are embedded as sub-expressions.
                // We detect them by scanning the formula for customNodeId references.
                // More reliably: scan the node's saved elements for custom-node type elements.
                const elements = Array.isArray(node.state?.elements) ? node.state.elements : [];
                elements.forEach((el: any) => {
                    if (el?.type === 'custom-node' && el?.data?.customNodeId) {
                        used.add(String(el.data.customNodeId));
                    }
                });
                usesMap.set(node.id, used);
            });

            // BFS: find all nodes that transitively use currentId
            const queue = [currentId];
            while (queue.length > 0) {
                const id = queue.shift()!;
                usesMap.forEach((uses, nodeId) => {
                    if (!forbidden.has(nodeId) && uses.has(id)) {
                        forbidden.add(nodeId);
                        queue.push(nodeId);
                    }
                });
            }

            return forbidden;
        };

        // In custom node mode, show other custom nodes but exclude recursive ones
        const forbiddenIds = customNodeMode ? getRecursiveIds(editingNodeId) : new Set<string>();

        const allowedCustomNodes = customNodes.filter(node => !forbiddenIds.has(node.id));

        if (customNodeLibraryEnabled) {
            const customFolder: TreeItem = {
                id: 'custom-node-folder',
                name: 'Custom Nodes',
                type: 'folder',
                children: allowedCustomNodes.map((node) => ({
                    id: `custom-node-${node.id}`,
                    name: node.name,
                    type: 'custom-node',
                    customNodeId: node.id,
                })),
            };
            base.push(customFolder);
        }

        return base;
    }, [configuredTreeData, customNodes, customNodeLibraryEnabled, customNodeMode, editingNodeId, mainElementType, templateMode]);

    const handleDelete = (id: string) => {
        setConnections(prevConnections => {
            const nextConnections = prevConnections.filter(conn => conn.fromId !== id && conn.toId !== id);
            connectionsRef.current = nextConnections;
            setElements(prevElements => updateElementValueTypes(prevElements.filter((el) => el.id !== id), nextConnections));
            return nextConnections;
        });
        setSelected(prev => (prev === id ? null : prev));
    };

    const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        
        // Check if clicking on a canvas element (not on pins)
        const canvasElement = target.closest('.canvas-element') as HTMLElement;
        if (canvasElement && !target.closest('.pin') && !target.closest('.operation-input')) {
            const elementId = canvasElement.getAttribute('data-element-id');
            if (elementId) {
                const element = elementsById.get(elementId);
                if (element) {
                    elementDragRef.current = {
                        elementId: elementId,
                        startX: e.clientX,
                        startY: e.clientY,
                        elementX: element.x,
                        elementY: element.y
                    };
                    setSelected(elementId);
                    setIsDraggingCanvasElement(true);
                    e.stopPropagation();
                    return;
                }
            }
        }
        
        // Otherwise, start panning
        if (e.button === 1 || e.button === 0) {
            e.preventDefault();
            setIsPanning(true);
            lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        }
    };

    const processCanvasMouseMove = React.useCallback((clientX: number, clientY: number) => {
        if (connectionInProgressRef.current) {
            setConnectionInProgress(prev =>
                prev ? { ...prev, x: clientX, y: clientY } : null
            );
        }

        if (isPanningRef.current) {
            const deltaX = clientX - lastPanPointRef.current.x;
            const deltaY = clientY - lastPanPointRef.current.y;
            if (deltaX !== 0 || deltaY !== 0) {
                setOffsetX(prev => prev + deltaX);
                setOffsetY(prev => prev + deltaY);
                lastPanPointRef.current = { x: clientX, y: clientY };
            }
        }

        if (isDraggingFromSidebarRef.current && draggedItemRef.current) {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                setDragPreview({
                    x: clientX - rect.left,
                    y: clientY - rect.top,
                    name: draggedItemRef.current.name
                });
            }
        }
    }, []);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        pendingCanvasMouseRef.current = { x: e.clientX, y: e.clientY };
        if (canvasMouseMoveRafRef.current !== null) {
            return;
        }
        canvasMouseMoveRafRef.current = window.requestAnimationFrame(() => {
            canvasMouseMoveRafRef.current = null;
            const pending = pendingCanvasMouseRef.current;
            if (!pending) return;
            processCanvasMouseMove(pending.x, pending.y);
        });
    };

    const handleMouseUp = () => {
        // Only stop panning on canvas mouse up, not drag from sidebar
        setIsPanning(false);
    };

    React.useEffect(() => {
        return () => {
            if (canvasMouseMoveRafRef.current !== null) {
                window.cancelAnimationFrame(canvasMouseMoveRafRef.current);
                canvasMouseMoveRafRef.current = null;
            }
        };
    }, []);

    // Helper function to find item by ID
    const findItemById = (items: TreeItem[], id: string | null): TreeItem | null => {
        for (const item of items) {
            if (item.id === id) return item;
            if (item.children) {
                const found = findItemById(item.children, id);
                if (found) return found;
            }
        }
        return null;
    };

    const getConnectedInputIndexesForElement = (
        elementId: string,
        sourceConnections: Connection[] = connections
    ): number[] => {
        return Array.from(new Set(
            sourceConnections
                .filter((c) => c.toId === elementId && c.toInput.startsWith('input'))
                .map((c) => getInputIndex(c.toInput))
                .filter((i) => Number.isFinite(i) && i >= 0)
        )).sort((a, b) => a - b);
    };

    // Get input pins count for element
    const getInputCount = (element: CanvasElement): number => {
        if (element.type === 'number') return 0; // Number has no input
        if (element.type === 'constant-boolean') return 0;
        if (element.type === 'constant-string') return 0;
        if (element.type === 'element') return 0; // Selectors shown in node header, no input pins
        if (element.type === 'element-id') return 0;
        if (element.type === 'memory-read-number') return 0;
        if (element.type === 'memory-read-string') return 0;
        if (element.type === 'memory-read-boolean') return 0;
        if (element.type === 'memory-write-number') return 2;
        if (element.type === 'memory-write-string') return 2;
        if (element.type === 'memory-write-boolean') return 2;
        if (element.type === 'event-element') return 0;
        if (element.type === 'event-id') return 0;
        if (element.type === 'event-processor') return 2;
        if (element.type === 'not') return 1;
        if (element.type === 'and') return 2;
        if (element.type === 'or') return 2;
        if (element.type === 'fallback') return 2;
        if (element.type === 'condition') return 2; // Left, Right
        if (element.type === 'regex') return 1; // Text input
        if (element.type === 'concat') return 2; // A + B
        if (element.type === 'cut-a') return 2; // Source, needle
        if (element.type === 'cut-b') return 2; // Source, index
        if (element.type === 'cut-c') return 3; // Source, start, end
        if (element.type === 'string-count-chars') return 1; // Text
        if (element.type === 'string-count-words') return 1; // Text
        if (element.type === 'string-find-start') return 2; // Text, Find
        if (element.type === 'string-find-end') return 2; // Text, Find
        if (element.type === 'string-to-number') return 1; // Text
        if (element.type === 'number-to-string') return 1; // Number
        if (element.type === 'bool-count') {
            const connectedInputIndexes = getConnectedInputIndexesForElement(element.id);
            const highestConnected = connectedInputIndexes.length > 0 ? connectedInputIndexes[connectedInputIndexes.length - 1] : -1;
            return highestConnected >= 0 ? highestConnected + 2 : 1;
        }
        if (element.type === 'color') return 0; // Color constant
        if (element.type === 'gradient') return getGradientColorCount(element) + 1; // Colors + Angle
        if (element.type === 'custom-node') {
            const schema = Array.isArray(element.data?.customInputSchema) ? element.data?.customInputSchema : [];
            return schema.length; // 0 is valid - no inputs when all are hidden
        }
        if (element.type === 'unzip') return 1; // Always unzips all - only zip input needed
        if (element.type === 'math') return 1; // Numeric input
        if (element.type === 'case-range') return 3; // Min, Max, Out
        if (element.type === 'case-value') return 2; // Value, Out
        if (element.type === 'switch') {
            const caseIndexes = getConnectedInputIndexesForElement(element.id).filter((index) => index > 0);
            const highestCase = caseIndexes.length > 0 ? caseIndexes[caseIndexes.length - 1] : 0;
            // input0 = value, input1..inputN = cases, plus one trailing empty case pin
            return highestCase > 0 ? highestCase + 2 : 2;
        }
        if (element.type === 'node') return 3; // condition, true, false
        if (element.type === 'calculation') {
            const connectedInputIndexes = getConnectedInputIndexesForElement(element.id);
            const highestConnected = connectedInputIndexes.length > 0 ? connectedInputIndexes[connectedInputIndexes.length - 1] : -1;
            return highestConnected >= 0 ? highestConnected + 2 : 1;
        }
        if (element.type === 'main') {
            if (customNodeMode) {
                const connectedInputIndexes = getConnectedInputIndexesForElement(element.id);
                const highestConnected = connectedInputIndexes.length > 0 ? connectedInputIndexes[connectedInputIndexes.length - 1] : -1;
                return highestConnected >= 0 ? highestConnected + 2 : 1;
            }
            if (mainElementType === 'logic') {
                const targets = Array.isArray(element.data?.logicTargets) ? element.data.logicTargets : [''];
                // 4 inputs per slot (value, background, color, disabled) + always one empty slot at end
                return Math.max(1, targets.length) * 4;
            }
            return isMainInputType ? 4 : 3;
        }
        if (element.type === 'constant' || element.type === 'variable') return 0;
        if (element.type === 'output') return outputPropertyNames.length;
        if (element.type === 'not') return 1;
        if (element.type === 'and' || element.type === 'or') return 2;
        if (element.type === 'clamp') return 3; // value, min, max
        if (element.type === 'min-val' || element.type === 'max-val') return 2;
        if (element.type === 'string-split') return 1;
        if (element.type === 'string-replace') return 1;
        if (element.type === 'string-trim' || element.type === 'string-upper' || element.type === 'string-lower') return 1;
        if (element.type === 'string-includes') return 2; // text, needle
        if (element.type === 'number-parse') return 1;
        if (element.type === 'number-to-base') return 1;
        if (element.type === 'multi-concat') {
            return Number.isFinite(Number(element.data?.inputCount)) ? Math.max(2, Math.min(8, Number(element.data.inputCount))) : 3;
        }
        if (element.type === 'css-join') {
            return Number.isFinite(Number(element.data?.inputCount)) ? Math.max(2, Math.min(8, Number(element.data.inputCount))) : 3;
        }
        if (element.type === 'css-unit') return 1;   // number input
        if (element.type === 'css-margin') return 4;
        if (element.type === 'css-padding') return 4;
        if (element.type === 'css-width') return 1;
        if (element.type === 'css-height') return 1;
        if (element.type === 'css-font-size') return 1;
        if (element.type === 'css-display') return 0; // no inputs, just a selector
        if (element.type === 'css-color') return 1;   // color or string
        if (element.type === 'css-text') return 0;    // no inputs, just text field
        if (element.type === 'operator' || element.type === 'comparison' || element.type === 'logic') return 2;
        // Fallback
        return 1;
    };

    const getDynamicInputGapErrors = (
        sourceElements: CanvasElement[],
        sourceConnections: Connection[]
    ): Record<string, string> => {
        const errors: Record<string, string> = {};

        sourceElements.forEach((element) => {
            const dynamicConfig = (() => {
                if (element.type === 'calculation') {
                    return { startIndex: 0, label: 'Input' };
                }
                if (element.type === 'bool-count') {
                    return { startIndex: 0, label: 'Bool' };
                }
                if (element.type === 'switch') {
                    return { startIndex: 1, label: 'Case' };
                }
                if (element.type === 'main' && customNodeMode) {
                    return { startIndex: 0, label: 'Input' };
                }
                return null;
            })();

            if (!dynamicConfig) {
                return;
            }

            const connectedIndexes = getConnectedInputIndexesForElement(element.id, sourceConnections)
                .filter((index) => index >= dynamicConfig.startIndex);

            if (connectedIndexes.length === 0) {
                return;
            }

            const highestConnected = connectedIndexes[connectedIndexes.length - 1];
            for (let index = dynamicConfig.startIndex; index <= highestConnected; index += 1) {
                if (!connectedIndexes.includes(index)) {
                    const labelNumber = dynamicConfig.label === 'Case'
                        ? index
                        : index + 1;
                    errors[element.id] = `${dynamicConfig.label} ${labelNumber} is missing while lower pins are connected.`;
                    break;
                }
            }
        });

        return errors;
    };

    const dynamicInputGapErrors = React.useMemo(
        () => getDynamicInputGapErrors(elements, connections),
        [elements, connections, customNodeMode]
    );
    const hasDynamicInputGapErrors = Object.keys(dynamicInputGapErrors).length > 0;

    // Walk the connection graph backwards from elementId to find the customOutputSchema
    // of the originating custom-node, even if zip passes through switch/case/if nodes.
    const resolveZipSchema = (
        elementId: string,
        elements: CanvasElement[],
        connections: Connection[],
        depth = 0
    ): Array<{ id: string; label: string; type: string }> => {
        if (depth > 20) return [];
        const el = elements.find(e => e.id === elementId);
        if (!el) return [];

        // Found the source - return its schema
        if (el.type === 'custom-node') {
            return Array.isArray(el.data?.customOutputSchema) ? el.data.customOutputSchema : [];
        }

        // Passthrough nodes - trace back through their value inputs
        const inputsToTrace: string[] = [];
        if (el.type === 'switch') {
            // switch output comes from case out-values - trace input0 (the value) and case inputs
            inputsToTrace.push('input0');
            const caseConns = connections.filter(c => c.toId === el.id && getInputIndex(c.toInput) > 0);
            caseConns.forEach(c => inputsToTrace.push(c.toInput));
        } else if (el.type === 'node') {
            inputsToTrace.push('input1', 'input2');
        } else if (el.type === 'case-range' || el.type === 'case-value') {
            // The "out" value is the last input
            const lastInput = el.type === 'case-range' ? 'input2' : 'input1';
            inputsToTrace.push(lastInput);
        } else {
            // For any other node, trace all inputs
            const inConns = connections.filter(c => c.toId === el.id);
            inConns.forEach(c => inputsToTrace.push(c.toInput));
        }

        for (const inputName of inputsToTrace) {
            const conn = connections.find(c => c.toId === el.id && c.toInput === inputName);
            if (!conn) continue;
            const schema = resolveZipSchema(conn.fromId, elements, connections, depth + 1);
            if (schema.length > 0) return schema;
        }
        return [];
    };

    // Update element value types based on node configuration and current connections
    const updateElementValueTypes = (nextElements: CanvasElement[], nextConnections: Connection[] = connectionsRef.current): CanvasElement[] => {
        const elementMap = new Map(nextElements.map(el => [el.id, el]));

        const getConnectedType = (toId: string, toInput: string): 'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event' | null => {
            const conn = nextConnections.find(c => c.toId === toId && c.toInput === toInput);
            if (!conn) return null;
            const fromElement = elementMap.get(conn.fromId);
            return fromElement?.valueType || null;
        };

        return nextElements.map(el => {
            let valueType: 'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event' = 'number';

            switch (el.type) {
                case 'number':
                    valueType = 'number';
                    break;
                case 'constant-boolean':
                    valueType = 'boolean';
                    break;
                case 'constant-string':
                    valueType = 'string';
                    break;
                case 'element': {
                    const selectedElement = detectedElementsRef.current.find(de => de.id === el.data?.selectedElement);
                    valueType = selectedElement?.outputs?.[0]?.type || 'number';
                    break;
                }
                case 'calculation': {
                    const op = el.data?.operation;
                    valueType = ['===', '!==', '>', '<', '>=', '<='].includes(op || '')
                        ? 'boolean'
                        : 'number';
                    break;
                }
                case 'condition':
                    valueType = 'boolean';
                    break;
                case 'regex':
                    valueType = 'boolean';
                    break;
                case 'concat':
                case 'cut-a':
                case 'cut-b':
                case 'cut-c':
                    valueType = 'string';
                    break;
                case 'string-count-chars':
                case 'string-count-words':
                case 'string-find-start':
                case 'string-find-end':
                case 'string-to-number':
                case 'math':
                case 'bool-count':
                    valueType = 'number';
                    break;
                case 'number-to-string':
                    valueType = 'string';
                    break;
                case 'color':
                case 'gradient':
                    valueType = 'color';
                    break;
                case 'custom-node':
                    valueType = el.data?.zipOutput ? 'zip' : 'number';
                    break;
                case 'element-id':
                    valueType = el.data?.customOutputType || 'string';
                    break;
                case 'memory-read-number':
                    valueType = 'number';
                    break;
                case 'memory-read-string':
                    valueType = 'string';
                    break;
                case 'memory-read-boolean':
                    valueType = 'boolean';
                    break;
                case 'memory-write-number':
                case 'memory-write-string':
                case 'memory-write-boolean': {
                    const inputType = getConnectedType(el.id, 'input0');
                    valueType = inputType || (el.type === 'memory-write-string' ? 'string' : el.type === 'memory-write-boolean' ? 'boolean' : 'number');
                    break;
                }
                case 'event-element':
                case 'event-id':
                    valueType = 'event';
                    break;
                case 'event-processor': {
                    const payloadType = getConnectedType(el.id, 'input1');
                    valueType = payloadType || 'string';
                    break;
                }
                case 'unzip': {
                    // Unzip always exposes all outputs - element-level valueType is number (per-pin types handled separately)
                    valueType = 'number';
                    break;
                }
                case 'case-range':
                case 'case-value':
                    valueType = 'case';
                    break;
                case 'switch': {
                    const switchCaseConnections = nextConnections
                        .filter(c => c.toId === el.id && getInputIndex(c.toInput) > 0)
                        .sort((a, b) => getInputIndex(a.toInput) - getInputIndex(b.toInput));

                    const firstCase = switchCaseConnections.length > 0
                        ? elementMap.get(switchCaseConnections[0].fromId)
                        : null;

                    if (firstCase?.type === 'case-range') {
                        valueType =
                            getConnectedType(firstCase.id, 'input2')
                            || getLiteralType(firstCase.data?.out ?? 0);
                    } else if (firstCase?.type === 'case-value') {
                        valueType =
                            getConnectedType(firstCase.id, 'input1')
                            || getLiteralType(firstCase.data?.out ?? 0);
                    } else {
                        valueType = el.valueType || 'number';
                    }
                    break;
                }
                case 'node': {
                    const trueType = getConnectedType(el.id, 'input1');
                    const falseType = getConnectedType(el.id, 'input2');
                    valueType = trueType || falseType || el.valueType || 'number';
                    break;
                }
                case 'main':
                    valueType = getConnectedType(el.id, 'input0') || el.valueType || getMainValueAcceptedTypes()[0] || 'number';
                    break;
                case 'not':
                case 'and':
                case 'or':
                case 'string-includes':
                    valueType = 'boolean';
                    break;
                case 'fallback': {
                    // Fallback inherits type from primary input (input0), or fallback input (input1)
                    const primaryType = getConnectedType(el.id, 'input0');
                    const fallbackType = getConnectedType(el.id, 'input1');
                    valueType = primaryType || fallbackType || el.valueType || 'number';
                    break;
                }
                case 'clamp':
                case 'min-val':
                case 'max-val':
                case 'number-parse':
                    valueType = 'number';
                    break;
                case 'number-to-base':
                    valueType = 'string';
                    break;
                case 'multi-concat':
                    valueType = 'string';
                    break;
                case 'css-unit':
                    valueType = 'css-unit';
                    break;
                case 'css-margin':
                case 'css-padding':
                case 'css-width':
                case 'css-height':
                case 'css-font-size':
                case 'css-display':
                case 'css-color':
                case 'css-text':
                case 'css-join':
                    valueType = 'css';
                    break;
                case 'string-split':
                case 'string-replace':
                case 'string-trim':
                case 'string-upper':
                case 'string-lower':
                    valueType = 'string';
                    break;
                default:
                    valueType = el.valueType || 'number';
                    break;
            }

            if (el.valueType === valueType) {
                return el;
            }
            return { ...el, valueType };
        });
    };

    useEffect(() => {
        setElements(prev => {
            const updated = updateElementValueTypes(prev, connections);
            const changed = updated.some((el, idx) => el !== prev[idx]);
            return changed ? updated : prev;
        });
    }, [connections, detectedElements]);

    useEffect(() => {
        if (!customNodeMode && mainElementType !== 'logic') {
            return;
        }
        const { formula: generatedFormula } = generateFormula(elements, connections);
        const normalizedFormula = generatedFormula || '';
        setFormula((prev) => (prev === normalizedFormula ? prev : normalizedFormula));
        formulaRef.current = normalizedFormula;
    }, [connections, customNodeMode, mainElementType, elements]);

    useLayoutEffect(() => {
        const rafId = window.requestAnimationFrame(() => {
            const next: Record<string, CalcFlowSegment[]> = {};
            const calcNodes = elements.filter((el) => el.type === 'calculation');

            calcNodes.forEach((node) => {
                const connectedCalcInputs = getConnectedInputIndexesForElement(node.id, connections);
                if (connectedCalcInputs.length === 0) {
                    next[node.id] = [];
                    return;
                }

                const nodeEl = document.querySelector(`.canvas-element[data-element-id="${node.id}"]`) as HTMLElement | null;
                if (!nodeEl) {
                    return;
                }
                const nodeRect = nodeEl.getBoundingClientRect();
                const safeWidth = Math.max(1, getNodeWidth(node));
                const safeHeight = Math.max(1, getNodeHeight(node));
                const scaleX = nodeRect.width > 0 ? (nodeRect.width / safeWidth) : 1;
                const scaleY = nodeRect.height > 0 ? (nodeRect.height / safeHeight) : 1;

                const getInputPinPoint = (inputIndex: number): { x: number; y: number } | null => {
                    const pinEl = nodeEl.querySelector(`.pin.input[data-pin-id="input-${inputIndex}"]`) as HTMLElement | null;
                    if (!pinEl) return null;
                    const pinRect = pinEl.getBoundingClientRect();
                    return {
                        x: (pinRect.right - nodeRect.left) / scaleX,
                        y: ((pinRect.top + (pinRect.height / 2)) - nodeRect.top) / scaleY,
                    };
                };

                const getOperatorPoints = (
                    operatorIndex: number
                ): {
                    left: { x: number; y: number };
                    right: { x: number; y: number };
                    top: { x: number; y: number };
                    bottom: { x: number; y: number };
                    centerX: number;
                } | null => {
                    const opEl = nodeEl.querySelector(`select.calc-op-control[data-calc-op-index="${operatorIndex}"]`) as HTMLElement | null;
                    if (!opEl) return null;
                    const opRect = opEl.getBoundingClientRect();
                    const centerY = ((opRect.top + (opRect.height / 2)) - nodeRect.top) / scaleY;
                    const centerX = ((opRect.left + (opRect.width / 2)) - nodeRect.left) / scaleX;
                    const topY = (opRect.top - nodeRect.top) / scaleY;
                    const bottomY = (opRect.bottom - nodeRect.top) / scaleY;
                    return {
                        left: { x: (opRect.left - nodeRect.left) / scaleX, y: centerY },
                        right: { x: (opRect.right - nodeRect.left) / scaleX, y: centerY },
                        top: { x: centerX, y: topY },
                        bottom: { x: centerX, y: bottomY },
                        centerX,
                    };
                };

                const segments: CalcFlowSegment[] = [];
                const operatorPoints = connectedCalcInputs
                    .map((_, operatorIndex) => getOperatorPoints(operatorIndex))
                    .filter((point): point is {
                        left: { x: number; y: number };
                        right: { x: number; y: number };
                        top: { x: number; y: number };
                        bottom: { x: number; y: number };
                        centerX: number;
                    } => Boolean(point));

                const fallbackOperatorX = safeWidth * 0.58;
                const fallbackTopY = safeHeight * 0.42;
                const fallbackBottomY = safeHeight * 0.58;

                connectedCalcInputs.forEach((sourceInputIndex, activeIndex) => {
                    const inputPoint = getInputPinPoint(sourceInputIndex);
                    if (!inputPoint) {
                        return;
                    }

                    const targetOperatorIndex = activeIndex <= 1
                        ? 0
                        : Math.min(operatorPoints.length - 1, activeIndex - 1);
                    const targetOperator = operatorPoints[targetOperatorIndex];
                    const badgeX = targetOperator?.left.x ?? fallbackOperatorX;
                    const badgeY = activeIndex === 0
                        ? (targetOperator?.top.y ?? fallbackTopY)
                        : (targetOperator?.bottom.y ?? fallbackBottomY);
                    const leftToRight = inputPoint.x <= badgeX;
                    const lineEndX = badgeX + (leftToRight ? -8 : 8);
                    const lineEndY = badgeY;
                    const spanX = Math.max(14, Math.abs(lineEndX - inputPoint.x));
                    const spanY = lineEndY - inputPoint.y;
                    const wobble = activeIndex % 2 === 0 ? -12 : 12;
                    const c1x = inputPoint.x + ((leftToRight ? 1 : -1) * Math.max(12, spanX * 0.4));
                    const c1y = inputPoint.y + (spanY * 0.2) + wobble;
                    const c2x = lineEndX - ((leftToRight ? 1 : -1) * Math.max(10, spanX * 0.2));
                    const c2y = lineEndY - (spanY * 0.15) - wobble;

                    segments.push({
                        key: `input-flow-${sourceInputIndex}`,
                        d: `M ${inputPoint.x} ${inputPoint.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${lineEndX} ${lineEndY}`,
                        step: activeIndex + 1,
                        badgeX,
                        badgeY,
                    });
                });

                next[node.id] = segments;
            });

            setCalcFlowByNode((prev) => {
                const prevJson = JSON.stringify(prev);
                const nextJson = JSON.stringify(next);
                return prevJson === nextJson ? prev : next;
            });
        });

        return () => window.cancelAnimationFrame(rafId);
    }, [elements, connections]);

    // Check if connection types are compatible
    const areTypesCompatible = (fromElement: CanvasElement, toElement: CanvasElement, fromOutputIndex: number, toInputIndex: number, connectionType?: 'normal' | 'case'): boolean => {
        // Special case connections (case nodes to switch)
        if (connectionType === 'case') {
            return isCaseNodeType(fromElement.type) && toElement.type === 'switch' && toInputIndex > 0;
        }

        // For unzip node and unzipped custom-node, each output pin has its own type
        const fromType = (fromElement.type === 'unzip' || (fromElement.type === 'custom-node' && !fromElement.data?.zipOutput))
            ? (getOutputPinType(fromElement, fromOutputIndex) || 'number')
            : (fromElement.valueType || 'number');

        const accepted = getAcceptedTypesForPin(toElement, toInputIndex);
        
        // Event types can only connect to event types - no mixing with other types
        if (fromType === 'event' && !accepted.includes('event')) {
            return false;
        }
        if (fromType !== 'event' && accepted.includes('event') && accepted.length === 1) {
            return false;
        }
        
        return accepted.includes(fromType);
    };

    // Generate formula string from connected nodes.
    const generateFormula = (elements: CanvasElement[], connections: Connection[], traceSteps?: string[]): { formula: string; steps: string[] } => {
        const steps: string[] = traceSteps || [];
        let result = '';
        const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const customPlaceholderForNode = (nodeId: string): string => `__customIn("${nodeId}")`;
        const elementById = new Map<string, CanvasElement>();
        const connectionsByTargetInput = new Map<string, Connection>();
        const connectionsByTargetId = new Map<string, Connection[]>();

        elements.forEach((element) => {
            elementById.set(element.id, element);
        });
        connections.forEach((connection) => {
            connectionsByTargetInput.set(getConnectionLookupKey(connection.toId, connection.toInput), connection);
            const targetConnections = connectionsByTargetId.get(connection.toId);
            if (targetConnections) {
                targetConnections.push(connection);
            } else {
                connectionsByTargetId.set(connection.toId, [connection]);
            }
        });

        const getConnectionToInput = (toId: string, toInput: string): Connection | undefined => {
            return connectionsByTargetInput.get(getConnectionLookupKey(toId, toInput));
        };
        const getConnectionsToElement = (toId: string): Connection[] => {
            return connectionsByTargetId.get(toId) || [];
        };

        // Helper: build expression from a connection, passing the correct output pin index
        const buildFromConn = (conn: Connection, depth: number): string => {
            const outIdx = parseInt(conn.fromOutput.replace('output', ''), 10);
            return buildExpression(conn.fromId, depth, Number.isFinite(outIdx) ? outIdx : 0);
        };

        const buildExpression = (elementId: string, depth: number = 0, outputIndex: number = 0): string => {
            const element = elementById.get(elementId);
            if (!element) return '';

            const indent = '  '.repeat(depth);

            const getInputConnection = (inputName: string): Connection | undefined =>
                getConnectionToInput(element.id, inputName);
            
            switch (element.type) {
                case 'number': {
                    if (customNodeMode) {
                        // Hidden nodes use their literal default value instead of a placeholder
                        if (element.data?.hidden) {
                            const parsed = Number(element.data?.valueText ?? element.data?.value ?? 0);
                            const val = Number.isFinite(parsed) ? parsed : 0;
                            steps.push(`${indent}custom-input number "${element.name}" (hidden): ${val}`);
                            return String(val);
                        }
                        const expr = customPlaceholderForNode(element.id);
                        steps.push(`${indent}custom-input number "${element.name}": ${expr}`);
                        return expr;
                    }
                    const parsed = Number(element.data?.valueText ?? element.data?.value ?? 0);
                    const value = Number.isFinite(parsed) ? parsed : Number(element.data?.value ?? 0) || 0;
                    steps.push(`${indent}number node "${element.name}": ${value}`);
                    return String(value);
                }

                case 'constant-boolean': {
                    if (customNodeMode) {
                        if (element.data?.hidden) {
                            const raw = element.data?.value;
                            const result = (raw === true || String(raw).toLowerCase() === 'true') ? 'true' : 'false';
                            steps.push(`${indent}custom-input boolean "${element.name}" (hidden): ${result}`);
                            return result;
                        }
                        const expr = customPlaceholderForNode(element.id);
                        steps.push(`${indent}custom-input boolean "${element.name}": ${expr}`);
                        return expr;
                    }
                    const raw = element.data?.value;
                    const boolValue = raw === true || String(raw).toLowerCase() === 'true';
                    const result = boolValue ? 'true' : 'false';
                    steps.push(`${indent}boolean constant "${element.name}": ${result}`);
                    return result;
                }

                case 'constant-string': {
                    if (customNodeMode) {
                        if (element.data?.hidden) {
                            const text = String(element.data?.value ?? '');
                            const result = JSON.stringify(text);
                            steps.push(`${indent}custom-input string "${element.name}" (hidden): ${result}`);
                            return result;
                        }
                        const expr = customPlaceholderForNode(element.id);
                        steps.push(`${indent}custom-input string "${element.name}": ${expr}`);
                        return expr;
                    }
                    const text = String(element.data?.value ?? '');
                    const result = JSON.stringify(text);
                    steps.push(`${indent}string constant "${element.name}": ${result}`);
                    return result;
                }

                case 'element-id': {
                    const elementId = String(element.data?.elementId || '');
                    const result = JSON.stringify(elementId);
                    steps.push(`${indent}element-id node "${element.name}": ${result}`);
                    return result;
                }

                case 'memory-read-number':
                case 'memory-read-string':
                case 'memory-read-boolean': {
                    const variableKey = String(element.data?.variableKey || '');
                    const defaultValue = element.data?.defaultValue;
                    const persistVariable = element.data?.persistVariable || false;
                    const literal = toFormulaLiteral(defaultValue);
                    const expr = `__nodeMemoryGet(${JSON.stringify(variableKey)}, ${literal}, ${persistVariable})`;
                    steps.push(`${indent}${element.type} node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'memory-write-number':
                case 'memory-write-string':
                case 'memory-write-boolean': {
                    const variableKey = String(element.data?.variableKey || '');
                    const valueConn = getInputConnection('input0');
                    const resetConn = getInputConnection('input1');
                    const defaultWriteValue = element.type === 'memory-write-boolean' ? false : element.type === 'memory-write-number' ? 0 : '';
                    const valueExpr = valueConn ? buildFromConn(valueConn, depth + 1) : toFormulaLiteral(defaultWriteValue);
                    const resetExpr = resetConn ? buildFromConn(resetConn, depth + 1) : 'false';
                    const expr = `__nodeMemorySet(${JSON.stringify(variableKey)}, ${valueExpr}, ${resetExpr})`;
                    steps.push(`${indent}${element.type} node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'event-element':
                case 'event-id': {
                    const eventTarget = element.type === 'event-element'
                        ? String(element.data?.eventElement || '')
                        : String(element.data?.eventId || '');
                    const eventType = String(element.data?.eventType || 'click');
                    const expr = `__nodeEvent(${JSON.stringify(eventTarget)}, ${JSON.stringify(eventType)})`;
                    steps.push(`${indent}${element.type} node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'event-processor': {
                    const eventConn = getInputConnection('input0');
                    const payloadConn = getInputConnection('input1');
                    const passOnlyOnEvent = element.data?.passOnlyOnEvent === true;
                    const eventExpr = eventConn ? buildFromConn(eventConn, depth + 1) : 'undefined';
                    const payloadExpr = payloadConn ? buildFromConn(payloadConn, depth + 1) : 'undefined';
                    const expr = `__nodeEventProcessor(${eventExpr}, ${payloadExpr}, ${passOnlyOnEvent})`;
                    steps.push(`${indent}event-processor node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'element': {
                    const sourceId = element.data?.selectedElement || 'unknown-element';
                    steps.push(`${indent}element node "${element.name}": ${sourceId}`);
                    return `[${sourceId}]`;
                }

                case 'calculation': {
                    const defaultOp = element.data?.operation || '+';
                    const operations = element.data?.inputOperations || {};
                    const inputCount = getInputCount(element);

                    steps.push(`${indent}calculation node "${element.name}":`);

                    const values = Array.from({ length: inputCount }).map((_, idx) => {
                        const inputConn = getInputConnection(`input${idx}`);
                        return inputConn
                            ? buildExpression(inputConn.fromId, depth + 1)
                            : String(element.data?.inputValues?.[idx] ?? 0);
                    });

                    if (values.length === 0) {
                        steps.push(`${indent}  = 0`);
                        return '0';
                    }

                    if (values.length === 1) {
                        steps.push(`${indent}  = ${values[0]}`);
                        return values[0];
                    }

                    let expression = values[0] || '0';
                    for (let i = 1; i < values.length; i++) {
                        const opKey = `input${i - 1}`;
                        const currentOp = operations[opKey] || defaultOp;
                        expression += ` ${currentOp} ${values[i]}`;
                    }

                    const calcResult = `(${expression})`;
                    steps.push(`${indent}  = ${calcResult}`);
                    return calcResult;
                }

                case 'condition': {
                    const condLeft = getInputConnection('input0');
                    const condRight = getInputConnection('input1');
                    const condOp = (!element.data?.operation || element.data.operation === '+')
                        ? '==='
                        : element.data.operation;

                    steps.push(`${indent}condition node "${element.name}" (${condOp}):`);

                    const condLeftVal = condLeft ? buildExpression(condLeft.fromId, depth + 1) : '0';
                    const condRightVal = condRight ? buildExpression(condRight.fromId, depth + 1) : '0';

                    const condResult = `(${condLeftVal} ${condOp} ${condRightVal})`;
                    steps.push(`${indent}  = ${condResult}`);
                    return condResult;
                }

                case 'node': {
                    const condInput = getInputConnection('input0');
                    const trueInput = getInputConnection('input1');
                    const falseInput = getInputConnection('input2');

                    steps.push(`${indent}if node "${element.name}":`);

                    const condition = condInput
                        ? buildExpression(condInput.fromId, depth + 1)
                        : 'true';

                    const trueVal = trueInput
                        ? buildExpression(trueInput.fromId, depth + 1)
                        : 'undefined';

                    const falseVal = falseInput
                        ? buildExpression(falseInput.fromId, depth + 1)
                        : 'undefined';

                    const ifExpr = `((${condition}) ? (${trueVal}) : (${falseVal}))`;

                    steps.push(`${indent}  = ${ifExpr}`);
                    return ifExpr;
                }

                case 'switch': {
                    steps.push(`${indent}switch node "${element.name}":`);

                    const switchConn = getInputConnection('input0');

                    const switchValue = switchConn
                        ? buildExpression(switchConn.fromId, depth + 1)
                        : 'undefined';

                    steps.push(`${indent}  on value: ${switchValue}`);

                    const caseConnections = getConnectionsToElement(element.id)
                        .filter(c => getInputIndex(c.toInput) > 0)
                        .sort((a, b) =>
                            getInputIndex(a.toInput) - getInputIndex(b.toInput)
                        );

                    const caseClauses: Array<{ condition: string; result: string }> = [];

                    for (const conn of caseConnections) {
                        const caseElement = elementById.get(conn.fromId);
                        if (!caseElement) continue;

                        // CASE-VALUE
                        if (caseElement.type === 'case-value') {
                            const valConn = getConnectionToInput(caseElement.id, 'input0');

                            const val = valConn
                                ? buildExpression(valConn.fromId, depth + 1)
                                : toFormulaLiteral(caseElement.data?.caseValue ?? 0);

                            const outConn = getConnectionToInput(caseElement.id, 'input1');

                            const outVal = outConn
                                ? buildExpression(outConn.fromId, depth + 1)
                                : toFormulaLiteral(caseElement.data?.out ?? 0);

                            caseClauses.push({
                                condition: `__nodeCaseEquals(${switchValue}, ${val})`,
                                result: outVal,
                            });
                        }

                        // CASE-RANGE
                        if (caseElement.type === 'case-range') {
                            const minConn = getConnectionToInput(caseElement.id, 'input0');
                            const minVal = minConn
                                ? buildExpression(minConn.fromId, depth + 1)
                                : toFormulaLiteral(caseElement.data?.min ?? 0);

                            const maxConn = getConnectionToInput(caseElement.id, 'input1');
                            const maxVal = maxConn
                                ? buildExpression(maxConn.fromId, depth + 1)
                                : toFormulaLiteral(caseElement.data?.max ?? 0);

                            const outConn = getConnectionToInput(caseElement.id, 'input2');
                            const outVal = outConn
                                ? buildExpression(outConn.fromId, depth + 1)
                                : toFormulaLiteral(caseElement.data?.out ?? 0);

                            caseClauses.push({
                                condition:
                                    `(Number(${switchValue}) >= Math.min(Number(${minVal}), Number(${maxVal}))` +
                                    ` && Number(${switchValue}) <= Math.max(Number(${minVal}), Number(${maxVal})))`,
                                result: outVal,
                            });
                        }
                    }

                    let switchExpr = '0';
                    for (let index = caseClauses.length - 1; index >= 0; index -= 1) {
                        const clause = caseClauses[index];
                        switchExpr = `((${clause.condition}) ? (${clause.result}) : (${switchExpr}))`;
                    }
                    steps.push(`${indent}  = ${switchExpr}`);
                    return switchExpr;
                }


                case 'case-range': {
                    // input0 = min
                    const minConn = getConnectionToInput(element.id, 'input0');
                    const minVal = minConn
                        ? buildExpression(minConn.fromId, depth + 1)
                        : toFormulaLiteral(element.data?.min ?? 0);

                    // input1 = max
                    const maxConn = getConnectionToInput(element.id, 'input1');
                    const maxVal = maxConn
                        ? buildExpression(maxConn.fromId, depth + 1)
                        : toFormulaLiteral(element.data?.max ?? 0);

                    steps.push(`${indent}case-range node: ${minVal} to ${maxVal}`);
                    return `[${minVal}..${maxVal}]`;
                }


                case 'case-value': {
                    // input0 = case value
                    const valConn = getConnectionToInput(element.id, 'input0');
                    const val = valConn
                        ? buildExpression(valConn.fromId, depth + 1)
                        : toFormulaLiteral(element.data?.caseValue ?? 0);

                    steps.push(`${indent}case-value node: value = ${val}`);
                    return val;
                }

                case 'regex': {
                    const inputConn = getInputConnection('input0');
                    const textExpr = inputConn ? buildExpression(inputConn.fromId, depth + 1) : '""';
                    const pattern = element.data?.regexPattern || '';
                    const regexExpr = `__nodeRegex(${textExpr}, ${JSON.stringify(pattern)})`;
                    steps.push(`${indent}regex node "${element.name}": ${regexExpr}`);
                    return regexExpr;
                }

                case 'concat': {
                    const firstConn = getInputConnection('input0');
                    const secondConn = getInputConnection('input1');
                    const first = firstConn ? buildExpression(firstConn.fromId, depth + 1) : '""';
                    const second = secondConn ? buildExpression(secondConn.fromId, depth + 1) : '""';
                    const concatExpr = `__nodeConcat(${first}, ${second})`;
                    steps.push(`${indent}concat node "${element.name}": ${concatExpr}`);
                    return concatExpr;
                }

                case 'multi-concat': {
                    const inputCount = Number.isFinite(Number(element.data?.inputCount)) ? Math.max(2, Math.min(8, Number(element.data.inputCount))) : 3;
                    const parts = Array.from({ length: inputCount }, (_, i) => {
                        const conn = getInputConnection(`input${i}`);
                        return conn ? buildFromConn(conn, depth + 1) : '""';
                    });
                    const expr = `__nodeConcat(${parts.join(', ')})`;
                    steps.push(`${indent}multi-concat node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'cut-a': {
                    const sourceConn = getInputConnection('input0');
                    const needleConn = getInputConnection('input1');
                    const source = sourceConn ? buildExpression(sourceConn.fromId, depth + 1) : '""';
                    const needle = needleConn ? buildExpression(needleConn.fromId, depth + 1) : '""';
                    const reverse = element.data?.reverse ? 'true' : 'false';
                    const cutExpr = `__nodeCutA(${source}, ${needle}, ${reverse})`;
                    steps.push(`${indent}cut-a node "${element.name}": ${cutExpr}`);
                    return cutExpr;
                }

                case 'cut-b': {
                    const sourceConn = getInputConnection('input0');
                    const indexConn = getInputConnection('input1');
                    const source = sourceConn ? buildExpression(sourceConn.fromId, depth + 1) : '""';
                    const indexValue = indexConn ? buildExpression(indexConn.fromId, depth + 1) : '0';
                    const reverse = element.data?.reverse ? 'true' : 'false';
                    const cutExpr = `__nodeCutB(${source}, ${indexValue}, ${reverse})`;
                    steps.push(`${indent}cut-b node "${element.name}": ${cutExpr}`);
                    return cutExpr;
                }

                case 'cut-c': {
                    const sourceConn = getInputConnection('input0');
                    const startConn = getInputConnection('input1');
                    const endConn = getInputConnection('input2');
                    const source = sourceConn ? buildExpression(sourceConn.fromId, depth + 1) : '""';
                    const start = startConn ? buildExpression(startConn.fromId, depth + 1) : '0';
                    const end = endConn ? buildExpression(endConn.fromId, depth + 1) : '0';
                    const reverse = element.data?.reverse ? 'true' : 'false';
                    const cutExpr = `__nodeCutC(${source}, ${start}, ${end}, ${reverse})`;
                    steps.push(`${indent}cut-c node "${element.name}": ${cutExpr}`);
                    return cutExpr;
                }

                case 'string-count-chars': {
                    const textConn = getInputConnection('input0');
                    const text = textConn ? buildExpression(textConn.fromId, depth + 1) : '""';
                    const expr = `__nodeCountChars(${text})`;
                    steps.push(`${indent}count-chars node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'string-count-words': {
                    const textConn = getInputConnection('input0');
                    const text = textConn ? buildExpression(textConn.fromId, depth + 1) : '""';
                    const expr = `__nodeCountWords(${text})`;
                    steps.push(`${indent}count-words node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'string-find-start': {
                    const textConn = getInputConnection('input0');
                    const queryConn = getInputConnection('input1');
                    const text = textConn ? buildExpression(textConn.fromId, depth + 1) : '""';
                    const query = queryConn ? buildExpression(queryConn.fromId, depth + 1) : '""';
                    const expr = `__nodeFindStart(${text}, ${query})`;
                    steps.push(`${indent}find-start node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'string-find-end': {
                    const textConn = getInputConnection('input0');
                    const queryConn = getInputConnection('input1');
                    const text = textConn ? buildExpression(textConn.fromId, depth + 1) : '""';
                    const query = queryConn ? buildExpression(queryConn.fromId, depth + 1) : '""';
                    const expr = `__nodeFindEnd(${text}, ${query})`;
                    steps.push(`${indent}find-end node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'string-to-number': {
                    const inputConn = getInputConnection('input0');
                    const text = inputConn ? buildExpression(inputConn.fromId, depth + 1) : '""';
                    const expr = `__nodeToNumber(${text})`;
                    steps.push(`${indent}string-to-number node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'number-to-string': {
                    const inputConn = getInputConnection('input0');
                    const value = inputConn ? buildExpression(inputConn.fromId, depth + 1) : '0';
                    const expr = `__nodeToString(${value})`;
                    steps.push(`${indent}number-to-string node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'bool-count': {
                    const inputCount = getInputCount(element);
                    const values = Array.from({ length: inputCount }).map((_, idx) => {
                        const inputConn = getInputConnection(`input${idx}`);
                        return inputConn ? buildExpression(inputConn.fromId, depth + 1) : 'false';
                    });
                    const expr = `__nodeCountTrue(${values.join(', ')})`;
                    steps.push(`${indent}count-true node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'color': {
                    if (customNodeMode) {
                        const expr = customPlaceholderForNode(element.id);
                        steps.push(`${indent}custom-input color "${element.name}": ${expr}`);
                        return expr;
                    }
                    const color = String(element.data?.colorValue || '#2563eb');
                    const expr = JSON.stringify(color);
                    steps.push(`${indent}color node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'gradient': {
                    const colorCount = getGradientColorCount(element);
                    const colorValues = Array.from({ length: colorCount }).map((_, colorIndex) => {
                        const colorConn = getInputConnection(`input${colorIndex}`);
                        if (colorConn) {
                            return buildExpression(colorConn.fromId, depth + 1);
                        }
                        return JSON.stringify(getGradientColorByIndex(element, colorIndex));
                    });

                    const angleInputIndex = colorCount;
                    const angleConn = getInputConnection(`input${angleInputIndex}`);
                    const angleValue = angleConn
                        ? buildExpression(angleConn.fromId, depth + 1)
                        : String(Number(element.data?.gradientAngle ?? 90) || 90);
                    const expr = `__nodeGradient(${angleValue}, ${colorValues.join(', ')})`;
                    steps.push(`${indent}gradient node "${element.name}": ${expr}`);
                    return expr;
                }

                case 'math': {
                    const inputConn = getInputConnection('input0');
                    const valueExpr = inputConn ? buildExpression(inputConn.fromId, depth + 1) : '0';
                    const fn = String(element.data?.mathFunction || 'sin');
                    const functionMap: Record<string, string> = {
                        sin: 'Math.sin',
                        cos: 'Math.cos',
                        tan: 'Math.tan',
                        asin: 'Math.asin',
                        acos: 'Math.acos',
                        atan: 'Math.atan',
                        sqrt: 'Math.sqrt',
                        abs: 'Math.abs',
                        log: 'Math.log',
                        exp: 'Math.exp',
                        floor: 'Math.floor',
                        ceil: 'Math.ceil',
                        round: 'Math.round',
                    };
                    const selectedFn = functionMap[fn] || 'Math.sin';
                    const expr = `${selectedFn}(${valueExpr})`;
                    steps.push(`${indent}math node "${element.name}" (${fn}): ${expr}`);
                    return expr;
                }

                case 'custom-node': {
                    const schema = Array.isArray(element.data?.customInputSchema) ? element.data?.customInputSchema : [];
                    const rawTemplate = String(element.data?.customTemplateFormula || '').trim();
                    const templateExpr = rawTemplate || '({})';
                    let expression = templateExpr;

                    // Track which sourceNodeIds belong to this node's schema
                    const ownSourceIds = new Set<string>();

                    schema.forEach((schemaPin, inputIndex) => {
                        const inputConn = getInputConnection(`input${inputIndex}`);
                        const sourceExpr = inputConn
                            ? buildFromConn(inputConn, depth + 1)
                            : toFormulaLiteral(
                                Array.isArray(element.data?.customInputValues)
                                    ? element.data?.customInputValues[inputIndex]
                                    : (schemaPin.defaultValue || '')
                            );

                        const sourceNodeId = String(schemaPin.sourceNodeId || schemaPin.id || '').trim();
                        if (!sourceNodeId) {
                            return;
                        }

                        ownSourceIds.add(sourceNodeId);
                        const pattern = new RegExp(`__customIn\\((\"|')${escapeRegExp(sourceNodeId)}\\1\\)`, 'g');
                        expression = expression.replace(pattern, `(${sourceExpr})`);
                    });

                    // Only replace __customIn for IDs that belong to THIS node's schema
                    // (unconnected inputs with no match). Leave any other __customIn untouched
                    // so outer custom nodes can substitute them.
                    ownSourceIds.forEach(id => {
                        const pattern = new RegExp(`__customIn\\((\"|')${escapeRegExp(id)}\\1\\)`, 'g');
                        expression = expression.replace(pattern, '0');
                    });

                    const zipExpr = `(${expression})`;

                    // When unzipped (default), each output pin extracts its own index directly
                    if (!element.data?.zipOutput) {
                        const expr = `__nodeUnzip(${zipExpr}, ${outputIndex})`;
                        steps.push(`${indent}custom node "${element.name}" [output ${outputIndex}]: ${expr}`);
                        return expr;
                    }

                    steps.push(`${indent}custom node "${element.name}": ${zipExpr}`);
                    return zipExpr;
                }

                case 'unzip': {
                    const zipConn = getInputConnection('input0');
                    const zipExpr = zipConn ? buildFromConn(zipConn, depth + 1) : '({})';
                    // Always unzip all - each output pin extracts by its index
                    const expr = `__nodeUnzip(${zipExpr}, ${outputIndex})`;
                    steps.push(`${indent}unzip node "${element.name}" [output ${outputIndex}]: ${expr}`);
                    return expr;
                }

                case 'not': {
                    const a = getInputConnection('input0');
                    const aExpr = a ? buildFromConn(a, depth + 1) : 'false';
                    return `(!${aExpr})`;
                }
                case 'and': {
                    const a = getInputConnection('input0');
                    const b = getInputConnection('input1');
                    const aExpr = a ? buildFromConn(a, depth + 1) : 'false';
                    const bExpr = b ? buildFromConn(b, depth + 1) : 'false';
                    return `(${aExpr} && ${bExpr})`;
                }
                case 'or': {
                    const a = getInputConnection('input0');
                    const b = getInputConnection('input1');
                    const aExpr = a ? buildFromConn(a, depth + 1) : 'false';
                    const bExpr = b ? buildFromConn(b, depth + 1) : 'false';
                    return `(${aExpr} || ${bExpr})`;
                }
                case 'fallback': {
                    const primary = getInputConnection('input0');
                    const fallback = getInputConnection('input1');
                    const primaryExpr = primary ? buildFromConn(primary, depth + 1) : 'undefined';
                    const fallbackExpr = fallback ? buildFromConn(fallback, depth + 1) : 'undefined';
                    return `(__nodeFallback(${primaryExpr}, ${fallbackExpr}))`;
                }
                case 'clamp': {
                    const v = getInputConnection('input0');
                    const mn = getInputConnection('input1');
                    const mx = getInputConnection('input2');
                    const vExpr = v ? buildFromConn(v, depth + 1) : '0';
                    const mnExpr = mn ? buildFromConn(mn, depth + 1) : '0';
                    const mxExpr = mx ? buildFromConn(mx, depth + 1) : '100';
                    return `(Math.min(Math.max(Number(${vExpr}), Number(${mnExpr})), Number(${mxExpr})))`;
                }
                case 'min-val': {
                    const a = getInputConnection('input0');
                    const b = getInputConnection('input1');
                    const aExpr = a ? buildFromConn(a, depth + 1) : '0';
                    const bExpr = b ? buildFromConn(b, depth + 1) : '0';
                    return `(Math.min(Number(${aExpr}), Number(${bExpr})))`;
                }
                case 'max-val': {
                    const a = getInputConnection('input0');
                    const b = getInputConnection('input1');
                    const aExpr = a ? buildFromConn(a, depth + 1) : '0';
                    const bExpr = b ? buildFromConn(b, depth + 1) : '0';
                    return `(Math.max(Number(${aExpr}), Number(${bExpr})))`;
                }
                case 'string-split': {
                    const src = getInputConnection('input0');
                    const srcExpr = src ? buildFromConn(src, depth + 1) : '""';
                    const delim = JSON.stringify(String(element.data?.splitDelimiter ?? ','));
                    const idx = Number.isFinite(Number(element.data?.splitIndex)) ? Number(element.data.splitIndex) : 0;
                    return `(__nodeToString(${srcExpr}).split(${delim})[${idx}] ?? "")`;
                }
                case 'string-replace': {
                    const src = getInputConnection('input0');
                    const srcExpr = src ? buildFromConn(src, depth + 1) : '""';
                    const find = JSON.stringify(String(element.data?.replaceFind ?? ''));
                    const repl = JSON.stringify(String(element.data?.replaceWith ?? ''));
                    return `(__nodeToString(${srcExpr}).split(${find}).join(${repl}))`;
                }
                case 'string-trim': {
                    const src = getInputConnection('input0');
                    const srcExpr = src ? buildFromConn(src, depth + 1) : '""';
                    return `(__nodeToString(${srcExpr}).trim())`;
                }
                case 'string-upper': {
                    const src = getInputConnection('input0');
                    const srcExpr = src ? buildFromConn(src, depth + 1) : '""';
                    return `(__nodeToString(${srcExpr}).toUpperCase())`;
                }
                case 'string-lower': {
                    const src = getInputConnection('input0');
                    const srcExpr = src ? buildFromConn(src, depth + 1) : '""';
                    return `(__nodeToString(${srcExpr}).toLowerCase())`;
                }
                case 'string-includes': {
                    const src = getInputConnection('input0');
                    const needle = getInputConnection('input1');
                    const srcExpr = src ? buildFromConn(src, depth + 1) : '""';
                    const needleExpr = needle ? buildFromConn(needle, depth + 1) : '""';
                    return `(__nodeToString(${srcExpr}).includes(__nodeToString(${needleExpr})))`;
                }
                case 'number-parse': {
                    const src = getInputConnection('input0');
                    const srcExpr = src ? buildFromConn(src, depth + 1) : '""';
                    const radix = Number.isFinite(Number(element.data?.parseRadix)) ? Number(element.data.parseRadix) : 10;
                    return `(parseInt(__nodeToString(${srcExpr}), ${radix}))`;
                }
                case 'number-to-base': {
                    const src = getInputConnection('input0');
                    const srcExpr = src ? buildFromConn(src, depth + 1) : '0';
                    const radix = Number.isFinite(Number(element.data?.parseRadix)) ? Number(element.data.parseRadix) : 16;
                    const minLen = Number.isFinite(Number(element.data?.minLength)) ? Number(element.data.minLength) : 0;
                    return `(__nodeToBase(${srcExpr}, ${radix}, ${minLen}))`;
                }
                case 'css-join': {
                    const inputCount = Number.isFinite(Number(element.data?.inputCount)) ? Math.max(2, Math.min(8, Number(element.data.inputCount))) : 3;
                    const parts = Array.from({ length: inputCount }, (_, i) => {
                        const conn = getInputConnection(`input${i}`);
                        return conn ? buildFromConn(conn, depth + 1) : '""';
                    });
                    return `(__nodeCssJoin(${parts.join(', ')}))`;
                }

                case 'css-unit': {
                    const src = getInputConnection('input0');
                    const fallbackValueRaw = String(element.data?.cssUnitValue ?? '0').trim();
                    const fallbackValue = Number.isFinite(Number(fallbackValueRaw)) ? fallbackValueRaw : '0';
                    const numExpr = src ? buildFromConn(src, depth + 1) : fallbackValue;
                    const unit = JSON.stringify(String(element.data?.cssUnit || 'px'));
                    return `(__nodeToString(${numExpr}) + ${unit})`;
                }

                case 'css-margin': {
                    const top = getInputConnection('input0');
                    const right = getInputConnection('input1');
                    const bottom = getInputConnection('input2');
                    const left = getInputConnection('input3');
                    const topExpr = top ? buildFromConn(top, depth + 1) : '"0px"';
                    const rightExpr = right ? buildFromConn(right, depth + 1) : '"0px"';
                    const bottomExpr = bottom ? buildFromConn(bottom, depth + 1) : '"0px"';
                    const leftExpr = left ? buildFromConn(left, depth + 1) : '"0px"';
                    return `(__nodeConcat("margin: ", __nodeToString(${topExpr}).trim(), " ", __nodeToString(${rightExpr}).trim(), " ", __nodeToString(${bottomExpr}).trim(), " ", __nodeToString(${leftExpr}).trim()))`;
                }

                case 'css-padding': {
                    const top = getInputConnection('input0');
                    const right = getInputConnection('input1');
                    const bottom = getInputConnection('input2');
                    const left = getInputConnection('input3');
                    const topExpr = top ? buildFromConn(top, depth + 1) : '"0px"';
                    const rightExpr = right ? buildFromConn(right, depth + 1) : '"0px"';
                    const bottomExpr = bottom ? buildFromConn(bottom, depth + 1) : '"0px"';
                    const leftExpr = left ? buildFromConn(left, depth + 1) : '"0px"';
                    return `(__nodeConcat("padding: ", __nodeToString(${topExpr}).trim(), " ", __nodeToString(${rightExpr}).trim(), " ", __nodeToString(${bottomExpr}).trim(), " ", __nodeToString(${leftExpr}).trim()))`;
                }

                case 'css-width': {
                    const src = getInputConnection('input0');
                    const valueExpr = src ? buildFromConn(src, depth + 1) : '"0px"';
                    return `(__nodeConcat("width: ", __nodeToString(${valueExpr}).trim()))`;
                }

                case 'css-height': {
                    const src = getInputConnection('input0');
                    const valueExpr = src ? buildFromConn(src, depth + 1) : '"0px"';
                    return `(__nodeConcat("height: ", __nodeToString(${valueExpr}).trim()))`;
                }

                case 'css-font-size': {
                    const src = getInputConnection('input0');
                    const valueExpr = src ? buildFromConn(src, depth + 1) : '"16px"';
                    return `(__nodeConcat("font-size: ", __nodeToString(${valueExpr}).trim()))`;
                }

                case 'css-display': {
                    const display = String(element.data?.cssDisplay || 'block').trim() || 'block';
                    return JSON.stringify(`display: ${display}`);
                }

                case 'css-color': {
                    const src = getInputConnection('input0');
                    if (src) {
                        const srcExpr = buildFromConn(src, depth + 1);
                        return `(__nodeConcat("color: ", __nodeToString(${srcExpr}).trim()))`;
                    }
                    const fallbackColor = String(element.data?.colorValue || '#2563eb').trim() || '#2563eb';
                    return JSON.stringify(`color: ${fallbackColor}`);
                }

                case 'css-text': {
                    return JSON.stringify(String(element.data?.cssText || ''));
                }

                default:
                    return '';
            }
        };

        const mainBlock = elements.find(el => el.type === 'main');
        const outputNodeForCustom = !mainBlock ? elements.find(el => el.type === 'output') : null;

        if (mainBlock || outputNodeForCustom) {
            const sinkBlock = mainBlock || outputNodeForCustom!;
            if (customNodeMode) {
                const outputConnections = getConnectionsToElement(sinkBlock.id)
                    .filter(c => c.toInput.startsWith('input'))
                    .map((conn) => {
                        const idx = getInputIndex(conn.toInput);
                        return { conn, idx: idx >= 0 ? idx : 0 };
                    })
                    .sort((a, b) => a.idx - b.idx);

                if (outputConnections.length > 0) {
                    const outputs = outputConnections
                        .map(({ conn, idx }) => `o${idx}: (${buildFromConn(conn, 0)})`)
                        .join(', ');
                    result = `({ ${outputs} })`;
                } else {
                    result = '({})';
                }
                steps.push('Custom Node Formula:');
                steps.push(result);
                return { formula: result, steps };
            }

            const valueConn = getConnectionToInput(sinkBlock.id, 'input0');
            const backgroundConn = getConnectionToInput(sinkBlock.id, 'input1');
            const colorConn = getConnectionToInput(sinkBlock.id, 'input2');
            const disabledConn = getConnectionToInput(sinkBlock.id, 'input3');
            const cssConn = getConnectionToInput(sinkBlock.id, 'input4');

            if (valueConn) {
                steps.push('=== Formula Generation ===');
                const valueExpr = buildFromConn(valueConn, 0);
                const backgroundExpr = backgroundConn ? buildFromConn(backgroundConn, 0) : '';
                const colorExpr = colorConn ? buildFromConn(colorConn, 0) : '';
                const disabledExpr = disabledConn ? buildFromConn(disabledConn, 0) : '';
                const cssExpr = cssConn ? buildFromConn(cssConn, 0) : '';

                const hasPresentation = Boolean(backgroundExpr || colorExpr || disabledExpr || cssExpr);
                if (hasPresentation) {
                    const backgroundPart = backgroundExpr ? `background: (${backgroundExpr}), ` : '';
                    const colorPart = colorExpr ? `color: (${colorExpr}), ` : '';
                    const disabledPart = disabledExpr ? `disabled: (${disabledExpr}), ` : '';
                    const cssPart = cssExpr ? `"custom-css": (${cssExpr}), ` : '';
                    result = `({ value: (${valueExpr}), ${backgroundPart}${colorPart}${disabledPart}${cssPart} })`;
                } else {
                    result = valueExpr;
                }

                steps.push('');
                steps.push('Final Formula:');
                steps.push(result);
            } else {
                steps.push('No formula: Html Element has no Value input connection');
            }
        }

        // Logic mode: collect all output nodes (no main-block needed)
        if (mainElementType === 'logic') {
            const outputNodes = elements.filter(el => el.type === 'output');
            const slotParts: string[] = [];

            for (const outNode of outputNodes) {
                const targetId = String(outNode.data?.selectedElement || '').trim();
                if (!targetId) continue;

                const getConn = (idx: number) => getConnectionToInput(outNode.id, `input${idx}`);

                const parts: string[] = [];
                let hasAny = false;
                outputPropertyNames.forEach((prop, i) => {
                    const conn = getConn(i);
                    if (conn) {
                        hasAny = true;
                        parts.push(`${JSON.stringify(prop)}: (${buildFromConn(conn, 0)})`);
                    }
                });

                if (!hasAny) continue;
                slotParts.push(`${JSON.stringify(targetId)}: { ${parts.join(', ')} }`);
            }

            result = slotParts.length > 0 ? `({ ${slotParts.join(', ')} })` : '({})';
            steps.push('Logic Formula:');
            steps.push(result);
        }

        return { formula: result, steps };
    };

    // Get input label for an element
    const getInputLabel = (element: CanvasElement, index: number): string => {
        switch (element.type) {
            case 'calculation':
                return `Input ${index + 1}`;
            case 'condition':
                if (index === 0) return 'Left';
                if (index === 1) return 'Right';
                return '';
            case 'switch':
                if (index === 0) return 'Value';
                return `Case ${index}`;
            case 'case-range':
                if (index === 0) return 'Min';
                if (index === 1) return 'Max';
                if (index === 2) return 'Out';
                return '';
            case 'case-value':
                if (index === 0) return 'Value';
                if (index === 1) return 'Out';
                return '';
            case 'regex':
                return 'Text';
            case 'concat':
                return index === 0 ? 'A' : 'B';
            case 'cut-a':
                return index === 0 ? 'Text' : 'Find';
            case 'cut-b':
                return index === 0 ? 'Text' : 'Index';
            case 'cut-c':
                if (index === 0) return 'Text';
                if (index === 1) return 'Start';
                if (index === 2) return 'End';
                return '';
            case 'string-count-chars':
                return 'Text';
            case 'string-count-words':
                return 'Text';
            case 'string-find-start':
            case 'string-find-end':
                return index === 0 ? 'Text' : 'Find';
            case 'string-to-number':
                return 'Text';
            case 'number-to-string':
                return 'Value';
            case 'memory-write-number':
            case 'memory-write-string':
            case 'memory-write-boolean':
                return index === 0 ? 'Value' : 'Reset';
            case 'event-processor':
                return index === 0 ? 'Event' : 'Payload';
            case 'bool-count':
                return `Bool ${index + 1}`;
            case 'color':
                return '';
            case 'gradient':
                {
                    const colorCount = getGradientColorCount(element);
                    if (index < colorCount) {
                        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                        const suffix = index < alphabet.length ? alphabet[index] : String(index + 1);
                        return `Color ${suffix}`;
                    }
                    if (index === colorCount) return 'Angle';
                }
                return '';
            case 'custom-node': {
                const schema = Array.isArray(element.data?.customInputSchema) ? element.data?.customInputSchema : [];
                return schema[index]?.label || `Input ${index + 1}`;
            }
            case 'unzip':
                return 'Zip';
            case 'math':
                return 'Value';
            case 'element':
                return '';
            case 'number':
                return 'Value';
            case 'constant-boolean':
                return '';
            case 'constant-string':
                return '';
            case 'main':
                if (customNodeMode) {
                    return `Output ${index + 1}`;
                }
                if (mainElementType === 'logic') {
                    const slotIndex = Math.floor(index / 4);
                    const slotPin = index % 4;
                    const slotLabel = `[${slotIndex + 1}]`;
                    if (slotPin === 0) return `${slotLabel} Value`;
                    if (slotPin === 1) return `${slotLabel} Background`;
                    if (slotPin === 2) return `${slotLabel} Color`;
                    return `${slotLabel} Disabled`;
                }
                if (index === 0) return 'Value';
                if (index === 1) return 'Background';
                if (index === 2) return 'Color';
                if (index === 3) return 'Disabled';
                return '';
            case 'output': {
                if (customNodeMode && element.data?.outputLabels) {
                    return element.data.outputLabels[index] || outputInputLabels[index] || '';
                }
                return outputInputLabels[index] || '';
            }
            case 'node':
                if (index === 0) return 'Condition';
                if (index === 1) return 'True';
                if (index === 2) return 'False';
                return '';
            case 'css-unit': return 'Number';
            case 'css-margin':
            case 'css-padding':
                if (index === 0) return 'Top';
                if (index === 1) return 'Right';
                if (index === 2) return 'Bottom';
                return 'Left';
            case 'css-width': return 'Value';
            case 'css-height': return 'Value';
            case 'css-font-size': return 'Value';
            case 'css-color': return 'Color';
            case 'css-text': return '';
            case 'css-display': return '';
            case 'and': return index === 0 ? 'A' : 'B';
            case 'or': return index === 0 ? 'A' : 'B';
            case 'fallback': return index === 0 ? 'Primary' : 'Fallback';
            case 'clamp':
                if (index === 0) return 'Value';
                if (index === 1) return 'Min';
                return 'Max';
            case 'min-val': return index === 0 ? 'A' : 'B';
            case 'max-val': return index === 0 ? 'A' : 'B';
            case 'string-split': return 'Text';
            case 'string-replace': return 'Text';
            case 'string-trim': return 'Text';
            case 'string-upper': return 'Text';
            case 'string-lower': return 'Text';
            case 'string-includes': return index === 0 ? 'Text' : 'Find';
            case 'number-parse': return 'Text';
            case 'number-to-base': return 'Number';
            case 'multi-concat': return `Text ${index + 1}`;
            case 'css-join': return `CSS ${index + 1}`;
            default:
                return `Input ${index + 1}`;
        }
    };

    // Get output label for an element
    const getOutputLabel = (element: CanvasElement, index: number): string => {
        switch (element.type) {
            case 'case-range':
                return 'Result';
            case 'case-value':
                return 'Result';
            case 'switch':
                return 'Result';
            case 'node':
                return 'Result';
            case 'calculation':
                return 'Result';
            case 'condition':
                return 'Result';
            case 'element-id':
                return 'Value';
            case 'memory-read-number':
            case 'memory-read-string':
            case 'memory-read-boolean':
                return 'Value';
            case 'memory-write-number':
            case 'memory-write-string':
            case 'memory-write-boolean':
                return 'Value';
            case 'event-element':
            case 'event-id':
            case 'event-processor':
                return 'Value';
            case 'element':
                return 'Value';
            case 'number':
                return 'Value';
            case 'constant-boolean':
                return 'Value';
            case 'constant-string':
                return 'Value';
            case 'regex':
                return 'Match';
            case 'concat':
                return 'Text';
            case 'cut-a':
            case 'cut-b':
            case 'cut-c':
                return 'Text';
            case 'string-count-chars':
                return 'Characters';
            case 'string-count-words':
                return 'Words';
            case 'string-find-start':
                return 'Start';
            case 'string-find-end':
                return 'End';
            case 'string-to-number':
                return 'Number';
            case 'number-to-string':
                return 'Text';
            case 'bool-count':
                return 'Count';
            case 'color':
                return 'Color';
            case 'gradient':
                return 'Color';
            case 'custom-node': {
                if (!element.data?.zipOutput) {
                    const schema = Array.isArray(element.data?.customOutputSchema) ? element.data.customOutputSchema : [];
                    return schema[index]?.label || `Output ${index + 1}`;
                }
                return 'Zip';
            }
            case 'unzip': {
                const schema = Array.isArray(element.data?.customOutputSchema) ? element.data.customOutputSchema : [];
                return schema[index]?.label || `Output ${index + 1}`;
            }
            case 'main':
                return 'Output';
            case 'operator':
                return 'Result';
            case 'math':
                return 'Result';
            case 'comparison':
                return 'Result';
            case 'logic':
                return 'Result';
            case 'constant':
                return 'Value';
            case 'variable':
                return 'Value';
            case 'css-unit':
            case 'css-margin':
            case 'css-padding':
            case 'css-width':
            case 'css-height':
            case 'css-font-size':
            case 'css-display':
            case 'css-color':
            case 'css-text':
            case 'css-join':
                return 'CSS';
            case 'not': return 'Result';
            case 'and': return 'Result';
            case 'or': return 'Result';
            case 'fallback': return 'Value';
            case 'clamp': return 'Value';
            case 'min-val': return 'Min';
            case 'max-val': return 'Max';
            case 'string-split': return 'Part';
            case 'string-replace': return 'Text';
            case 'string-trim': return 'Text';
            case 'string-upper': return 'Text';
            case 'string-lower': return 'Text';
            case 'string-includes': return 'Found';
            case 'number-parse': return 'Number';
            case 'number-to-base': return 'String';
            case 'multi-concat': return 'Text';
            case 'css-join': return 'CSS';
            default:
                return `Output-${index + 1}`;
        }
    };

    // Get number of output pins for an element
    const getOutputCount = (element: CanvasElement): number => {
        switch (element.type) {
            case 'case-range':
                return 1; // true/false output
            case 'case-value':
                return 1; // true/false output
            case 'switch':
                return 1; // Only result output
            case 'node':
                return 1; // Only result output (out is input now)
            case 'operator':
                return 1; // All operators output one value
            case 'math':
                return 1; // All math operations output one value
            case 'comparison':
                return 1; // All comparisons output boolean
            case 'logic':
                return 1; // All logic operations output boolean
            case 'element':
                return 1; // Element nodes output their value
            case 'element-id':
                return 1;
            case 'memory-read-number':
                return 1;
            case 'memory-read-string':
                return 1;
            case 'memory-read-boolean':
                return 1;
            case 'memory-write-number':
                return 1;
            case 'memory-write-string':
                return 1;
            case 'memory-write-boolean':
                return 1;
            case 'event-element':
                return 1;
            case 'event-id':
                return 1;
            case 'event-processor':
                return 1;
            case 'number':
                return 1;
            case 'constant-boolean':
                return 1;
            case 'constant-string':
                return 1;
            case 'regex':
                return 1;
            case 'concat':
                return 1;
            case 'cut-a':
                return 1;
            case 'cut-b':
                return 1;
            case 'cut-c':
                return 1;
            case 'string-count-chars':
                return 1;
            case 'string-count-words':
                return 1;
            case 'string-find-start':
                return 1;
            case 'string-find-end':
                return 1;
            case 'string-to-number':
                return 1;
            case 'number-to-string':
                return 1;
            case 'bool-count':
                return 1;
            case 'color':
                return 1;
            case 'gradient':
                return 1;
            case 'custom-node': {
                if (!element.data?.zipOutput) {
                    const schema = Array.isArray(element.data?.customOutputSchema) ? element.data.customOutputSchema : [];
                    return Math.max(1, schema.length);
                }
                return 1;
            }
            case 'not':
            case 'and':
            case 'or':
            case 'fallback':
            case 'clamp':
            case 'min-val':
            case 'max-val':
            case 'string-split':
            case 'string-replace':
            case 'string-trim':
            case 'string-upper':
            case 'string-lower':
            case 'string-includes':
            case 'number-parse':
            case 'number-to-base':
            case 'multi-concat':
                return 1;
            case 'css-unit':
            case 'css-margin':
            case 'css-padding':
            case 'css-width':
            case 'css-height':
            case 'css-font-size':
            case 'css-display':
            case 'css-color':
            case 'css-text':
            case 'css-join':
                return 1;
            case 'unzip': {
                const schema = Array.isArray(element.data?.customOutputSchema) ? element.data.customOutputSchema : [];
                return Math.max(1, schema.length);
            }
            case 'constant':
                return 1; // Constant nodes output their value
            case 'variable':
                return 1; // Variable nodes output their value
            case 'main':
                return 0; // Main calculator has no output, generates formula
            case 'output':
                return 0; // Output node is a sink - no output pins
            case 'calculation':
                return 1; // Calculation nodes output result
            case 'condition':
                return 1; // Condition nodes output boolean
            default:
                return 1;
        }
    };

    // Get the value type for a specific output pin (used for unzipped unzip/custom-node pins)
    const getOutputPinType = (element: CanvasElement, index: number): CanvasElement['valueType'] => {
        if (element.type === 'unzip' || (element.type === 'custom-node' && !element.data?.zipOutput)) {
            const schema = Array.isArray(element.data?.customOutputSchema) ? element.data.customOutputSchema : [];
            const pinType = schema[index]?.type;
            if (pinType === 'string' || pinType === 'boolean' || pinType === 'color' || pinType === 'case') {
                return pinType;
            }
            return 'number';
        }
        return element.valueType || 'number';
    };

    const NODE_FIXED_WIDTH = 220;

    // Keep node width stable to avoid layout shifts and pin drift.
    const getNodeWidth = (_element: CanvasElement): number => NODE_FIXED_WIDTH;

    // Get node height based on content
    const getCenterControlRowCount = (element: CanvasElement): number => {
        switch (element.type) {
            case 'css-unit':
            case 'number-to-base':
                return 2;
            default:
                return 1;
        }
    };

    const getNodeHeight = (element: CanvasElement): number => {
        const inputCount = getInputCount(element);
        const outputCount = getOutputCount(element);
        const centerRows = getCenterControlRowCount(element);
        const maxRows = Math.max(inputCount, outputCount, centerRows);
        // Header (24px) + padding (16px) + rows (32px each) + bottom padding (8px)
        return 26 + 16 + (maxRows * 34) + 10;
    };

    // Calculate pin position purely from node geometry fallback (if DOM not available)
    const calculatePinPosition = (
        element: CanvasElement,
        type: 'input' | 'output',
        index: number
    ): { x: number; y: number } => {
        const nodeX = element.x * zoomRef.current + offsetXRef.current;
        const nodeY = element.y * zoomRef.current + offsetYRef.current;
        const nodeWidth = getNodeWidth(element);
        const rowHeight = 32;
        const headerHeight = 24;
        const paddingTop = 16;
        const rowY = nodeY + headerHeight + paddingTop + (index * rowHeight) + (rowHeight / 2);

        if (type === 'input') {
            return {
                x: nodeX - 6, // left edge
                y: rowY
            };
        }

        return {
            x: nodeX + nodeWidth + 6, // right edge
            y: rowY
        };
    };

    // Calculate pin position with delta simulation for predictive smooth updates
    const calculatePinPositionWithDelta = (
        element: CanvasElement,
        type: 'input' | 'output',
        index: number,
        applyDelta: boolean = true
    ): { x: number; y: number } => {
        // Start with element position, apply drag delta if active
        let elementX = element.x;
        let elementY = element.y;
        
        if (applyDelta && dragElementDeltaRef.current && dragElementDeltaRef.current.elementId === element.id) {
            elementX += dragElementDeltaRef.current.deltaX;
            elementY += dragElementDeltaRef.current.deltaY;
        }
        
        // Apply zoom and offset changes (current + delta)
        const currentZoom = zoomRef.current * zoomDeltaRef.current;
        const currentOffsetX = offsetXRef.current + offsetDeltaRef.current.x;
        const currentOffsetY = offsetYRef.current + offsetDeltaRef.current.y;
        
        const nodeX = elementX * currentZoom + currentOffsetX;
        const nodeY = elementY * currentZoom + currentOffsetY;
        const nodeWidth = getNodeWidth(element);
        const rowHeight = 32;
        const headerHeight = 24;
        const paddingTop = 16;
        const rowY = nodeY + headerHeight + paddingTop + (index * rowHeight) + (rowHeight / 2);

        if (type === 'input') {
            return {
                x: nodeX - 6, // left edge
                y: rowY
            };
        }

        return {
            x: nodeX + nodeWidth + 6, // right edge
            y: rowY
        };
    };

    // Get pin position in realtime from DOM (preferred), fallback to geometry only if missing.
    const getPinPosition = (
        element: CanvasElement,
        type: 'input' | 'output',
        index: number
    ): { x: number; y: number } => {
        const pinSelector = `.pin.${type}[data-element-id="${element.id}"][data-pin-id="${type}-${index}"]`;
        const pinEl = document.querySelector(pinSelector) as HTMLElement | null;
        const canvasEl = canvasRef.current;

        // Priority 1: DOM realtime position (most accurate)
        if (pinEl && canvasEl) {
            const pinRect = pinEl.getBoundingClientRect();
            const canvasRect = canvasEl.getBoundingClientRect();
            return {
                x: pinRect.left + pinRect.width / 2 - canvasRect.left,
                y: pinRect.top + pinRect.height / 2 - canvasRect.top
            };
        }

        // Priority 2: Delta simulation (predictive, smooth during drag/pan/zoom)
        if (isDraggingCanvasElementRef.current || isPanningRef.current || (dragElementDeltaRef.current && dragElementDeltaRef.current.elementId === element.id) || zoomDeltaRef.current !== 1 || (offsetDeltaRef.current.x !== 0 || offsetDeltaRef.current.y !== 0)) {
            return calculatePinPositionWithDelta(element, type, index, true);
        }

        // Fallback: pure geometry (when idle)
        return calculatePinPosition(element, type, index);
    };

    // Render input control for an element
    const renderInputControl = (element: CanvasElement, index: number): React.ReactNode => {
        switch (element.type) {
            case 'calculation':
                const connected = connections.some(c => c.toId === element.id && c.toInput === `input${index}`);
                const inputValue = element.data?.inputValues?.[index] ?? 0;
                if (!connected) {
                    return (
                        <input
                            type="number"
                            className="input-control"
                            value={String(inputValue)}
                            onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem => {
                                            if (elem.id !== element.id) return elem;
                                            const currentInputs = [...(elem.data?.inputValues || [])];
                                            currentInputs[index] = value;
                                            return { ...elem, data: { ...elem.data, inputValues: currentInputs } };
                                        })
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder={`Input ${index + 1}`}
                        />
                    );
                }
                return null;
            case 'number':
                return null;
            case 'element':
                return null; // Selectors rendered in node header
            case 'condition':
                // No input controls for condition - operator is separate
                return null;
            case 'case-range':
                const hasMinConnection = connections.some(c => c.toId === element.id && c.toInput === 'input0');
                const hasMaxConnection = connections.some(c => c.toId === element.id && c.toInput === 'input1');
                const hasOutConnection = connections.some(c => c.toId === element.id && c.toInput === 'input2');
                
                if (index === 0) {
                    return !hasMinConnection ? (
                        <input
                            type="number"
                            className="input-control"
                            value={element.data?.min || 0}
                            onChange={(e) => {
                                const min = parseFloat(e.target.value) || 0;
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, min } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Min"
                        />
                    ) : <div className="input-placeholder"></div>; // Invisible placeholder
                } else if (index === 1) {
                    return !hasMaxConnection ? (
                        <input
                            type="number"
                            className="input-control"
                            value={element.data?.max || 100}
                            onChange={(e) => {
                                const max = parseFloat(e.target.value) || 100;
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, max } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Max"
                        />
                    ) : <div className="input-placeholder"></div>; // Invisible placeholder
                } else if (index === 2) {
                    return !hasOutConnection ? (
                        <input
                            type="text"
                            className="input-control"
                            value={element.data?.out || ''}
                            onChange={(e) => {
                                const out = e.target.value;
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, out } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Out value"
                        />
                    ) : <div className="input-placeholder"></div>; // Invisible placeholder
                }
                return null;
            case 'case-value':
                const hasValueConnection = connections.some(c => c.toId === element.id && c.toInput === 'input0');
                const hasOutConnection2 = connections.some(c => c.toId === element.id && c.toInput === 'input1');
                
                if (index === 0) {
                    return !hasValueConnection ? (
                        <input
                            type="text"
                            className="input-control"
                            value={String(element.data?.caseValue ?? '')}
                            onChange={(e) => {
                                const caseValue = e.target.value;
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, caseValue } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Value"
                        />
                    ) : <div className="input-placeholder"></div>; // Invisible placeholder
                } else if (index === 1) {
                    return !hasOutConnection2 ? (
                        <input
                            type="text"
                            className="input-control"
                            value={element.data?.out || ''}
                            onChange={(e) => {
                                const out = e.target.value;
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, out } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Out value"
                        />
                    ) : <div className="input-placeholder"></div>; // Invisible placeholder
                }
                return null;
            case 'switch':
                // No input controls for switch
                return null;
            case 'regex':
                if (index !== 0) return null;
                return (
                    <input
                        type="text"
                        className="input-control"
                        value={element.data?.regexPattern || ''}
                        onChange={(e) => {
                            const regexPattern = e.target.value;
                            setElements(prev =>
                                updateElementValueTypes(
                                    prev.map(elem =>
                                        elem.id === element.id
                                            ? { ...elem, data: { ...elem.data, regexPattern } }
                                            : elem
                                    )
                                )
                            );
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="/regex/i"
                    />
                );
            case 'cut-a':
            case 'cut-b':
            case 'cut-c':
                if (index !== 0) return null;
                return (
                    <label
                        className="reverse-toggle"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            type="checkbox"
                            checked={Boolean(element.data?.reverse)}
                            onChange={(e) => {
                                const reverse = e.target.checked;
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, reverse } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                        Reverse
                    </label>
                );
            case 'gradient': {
                const colorCount = getGradientColorCount(element);
                const angleIndex = colorCount;

                if (index < colorCount) {
                    const hasColorConnection = connections.some(
                        c => c.toId === element.id && c.toInput === `input${index}`
                    );
                    const colorValue = getGradientColorByIndex(element, index);

                    return !hasColorConnection ? (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                width: '100%'
                            }}
                        >
                            <input
                                type="text"
                                className="input-control"
                                value={colorValue}
                                onChange={(e) => {
                                    const nextValue = e.target.value;
                                    setElements(prev =>
                                        updateElementValueTypes(
                                            prev.map(elem => {
                                                if (elem.id !== element.id) return elem;
                                                const nextColors = ensureGradientColors(elem.data?.gradientColors, getGradientColorCount(elem));
                                                nextColors[index] = nextValue;
                                                return {
                                                    ...elem,
                                                    data: {
                                                        ...elem.data,
                                                        gradientColors: nextColors,
                                                        gradientFrom: nextColors[0],
                                                        gradientMid: nextColors[1],
                                                        gradientTo: nextColors[2],
                                                    }
                                                };
                                            })
                                        )
                                    );
                                }}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="#22c55e"
                                style={{ maxWidth: '96px' }}
                            />
                        </div>
                    ) : <div className="input-placeholder"></div>;
                }

                if (index === angleIndex) {
                    const hasAngleConnection = connections.some(
                        c => c.toId === element.id && c.toInput === `input${angleIndex}`
                    );
                    return !hasAngleConnection ? (
                        <input
                            type="number"
                            className="input-control"
                            value={String(element.data?.gradientAngle ?? 90)}
                            onChange={(e) => {
                                const parsed = Number(e.target.value);
                                const gradientAngle = Number.isFinite(parsed) ? parsed : 90;
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, gradientAngle } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="90"
                        />
                    ) : <div className="input-placeholder"></div>;
                }

                return null;
            }
            case 'custom-node': {
                const schema = Array.isArray(element.data?.customInputSchema) ? element.data?.customInputSchema : [];
                const schemaPin = schema[index];
                if (!schemaPin) {
                    return null;
                }

                const hasConnection = connections.some(
                    c => c.toId === element.id && c.toInput === `input${index}`
                );
                if (hasConnection) {
                    return <div className="input-placeholder"></div>;
                }

                const values = Array.isArray(element.data?.customInputValues)
                    ? [...element.data.customInputValues]
                    : [];
                const currentValue = values[index] ?? schemaPin.defaultValue ?? '';

                const updateValue = (nextValue: string | number | boolean) => {
                    const nextValues = Array.isArray(element.data?.customInputValues)
                        ? [...element.data.customInputValues]
                        : [];
                    nextValues[index] = nextValue;
                    setElements(prev =>
                        updateElementValueTypes(
                            prev.map(elem =>
                                elem.id === element.id
                                    ? { ...elem, data: { ...elem.data, customInputValues: nextValues } }
                                    : elem
                            )
                        )
                    );
                };

                if (schemaPin.type === 'boolean') {
                    return (
                        <label className="reverse-toggle" onClick={(e) => e.stopPropagation()}>
                            <input
                                type="checkbox"
                                checked={String(currentValue).toLowerCase() === 'true' || currentValue === true}
                                onChange={(e) => updateValue(e.target.checked)}
                                onClick={(e) => e.stopPropagation()}
                            />
                            Value
                        </label>
                    );
                }

                if (schemaPin.type === 'number') {
                    return (
                        <input
                            type="number"
                            className="input-control"
                            value={String(currentValue)}
                            onChange={(e) => updateValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="0"
                        />
                    );
                }

                if (schemaPin.type === 'color') {
                    return (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                width: '100%'
                            }}
                        >
                            <input
                                type="color"
                                className="input-control"
                                value={String(currentValue || '#2563eb')}
                                onChange={(e) => updateValue(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ width: '34px', maxWidth: '34px', padding: '1px' }}
                            />
                            <input
                                type="text"
                                className="input-control"
                                value={String(currentValue)}
                                onChange={(e) => updateValue(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="#2563eb"
                                style={{ maxWidth: '80px' }}
                            />
                        </div>
                    );
                }

                return (
                    <input
                        type="text"
                        className="input-control"
                        value={String(currentValue)}
                        onChange={(e) => updateValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Value"
                    />
                );
            }
            case 'not':
            case 'and':
            case 'or':
            case 'clamp':
            case 'min-val':
            case 'max-val':
            case 'string-trim':
            case 'string-upper':
            case 'string-lower':
            case 'string-includes':
                return null;
            case 'string-split':
                if (index === 0) return null;
                return null;
            case 'string-replace':
                if (index === 0) return null;
                return null;
            case 'number-parse':
                return null;
            case 'number-to-base':
                return null;
            case 'multi-concat':
                return null;
            case 'css-color': {
                if (index !== 0) return null;
                const hasColorConnection = connections.some(
                    c => c.toId === element.id && c.toInput === 'input0'
                );
                if (hasColorConnection) {
                    return <div className="input-placeholder"></div>;
                }
                const currentColor = String(element.data?.colorValue || '#2563eb');
                return (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            width: '100%'
                        }}
                    >
                        <input
                            type="color"
                            className="input-control"
                            value={currentColor}
                            onChange={(e) => {
                                const colorValue = e.target.value;
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, colorValue } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: '34px', maxWidth: '34px', padding: '1px' }}
                        />
                        <input
                            type="text"
                            className="input-control"
                            value={currentColor}
                            onChange={(e) => {
                                const colorValue = e.target.value;
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, colorValue } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="#2563eb"
                            style={{ maxWidth: '80px' }}
                        />
                    </div>
                );
            }
            case 'css-join':
                return null;
            case 'output':
                if (index === 0) {
                    return (
                        <select
                            className="input-control"
                            value={element.data?.selectedElement || ''}
                            onChange={(e) => {
                                const selectedElementId = e.target.value;
                                const selectedElement = detectedElements.find(el => el.id === selectedElementId);
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, selectedElement: selectedElementId, outputs: selectedElement?.outputs || [] }, name: selectedElementId || 'Output' }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <option value="">-- Target Element --</option>
                            {detectedElements.map(detectedEl => (
                                <option key={detectedEl.id} value={detectedEl.id}>
                                    {detectedEl.name} ({detectedEl.type})
                                </option>
                            ))}
                        </select>
                    );
                }
                return null;
            case 'main':
                if (mainElementType === 'logic' && index % 4 === 0) {
                    const slotIndex = Math.floor(index / 4);
                    const targets = Array.isArray(element.data?.logicTargets) ? [...element.data.logicTargets] : [];
                    const currentTarget = targets[slotIndex] || '';
                    return (
                        <select
                            className="input-control"
                            value={currentTarget}
                            onChange={(e) => {
                                const nextTargets = Array.isArray(element.data?.logicTargets)
                                    ? [...element.data.logicTargets]
                                    : [];
                                while (nextTargets.length <= slotIndex) nextTargets.push('');
                                nextTargets[slotIndex] = e.target.value;
                                // Add a new empty slot if this was the last one and it now has a value
                                if (e.target.value && slotIndex === nextTargets.length - 1) {
                                    nextTargets.push('');
                                }
                                setElements(prev =>
                                    updateElementValueTypes(
                                        prev.map(elem =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, logicTargets: nextTargets } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <option value="">-- Target Element --</option>
                            {detectedElements.map(detectedEl => (
                                <option key={detectedEl.id} value={detectedEl.id}>
                                    {detectedEl.name} ({detectedEl.type})
                                </option>
                            ))}
                        </select>
                    );
                }
                return null;
            default:
                return null;
        }
    };

    const renderOutputControl = (element: CanvasElement, index: number): React.ReactNode => {
        if (element.type !== 'gradient' || index !== 0) {
            return null;
        }

        const colorCount = getGradientColorCount(element);

        return (
            <input
                type="number"
                className="input-control gradient-count-control"
                min={GRADIENT_MIN_COLORS}
                max={GRADIENT_MAX_COLORS}
                value={String(colorCount)}
                onChange={(e) => {
                    const nextCount = normalizeGradientColorCount(e.target.value, colorCount);
                    if (nextCount === colorCount) {
                        return;
                    }

                    setConnections((prevConnections) => {
                        const nextConnections = reconcileGradientConnections(
                            prevConnections,
                            element.id,
                            colorCount,
                            nextCount
                        );
                        connectionsRef.current = nextConnections;

                        setElements((prevElements) =>
                            updateElementValueTypes(
                                prevElements.map((elem) => {
                                    if (elem.id !== element.id) return elem;
                                    const nextColors = ensureGradientColors(elem.data?.gradientColors, nextCount);
                                    return {
                                        ...elem,
                                        data: {
                                            ...elem.data,
                                            gradientColorCount: nextCount,
                                            gradientColors: nextColors,
                                            gradientFrom: nextColors[0],
                                            gradientMid: nextColors[1],
                                            gradientTo: nextColors[2],
                                        }
                                    };
                                }),
                                nextConnections
                            )
                        );

                        return nextConnections;
                    });
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                title="Number of colors"
            />
        );
    };

    // Smart bezier routing for connections
    const getBezierPath = (
        fromPos: { x: number; y: number },
        toPos: { x: number; y: number }
    ): string => {
        const distance = Math.abs(fromPos.x - toPos.x);
        const controlPointDistance = Math.min(distance / 2, 100);
        
        return `M ${fromPos.x} ${fromPos.y} 
                C ${fromPos.x + controlPointDistance} ${fromPos.y},
                  ${toPos.x - controlPointDistance} ${toPos.y},
                  ${toPos.x} ${toPos.y}`;
    };

    // Use useEffect to add non-passive wheel listener
    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const handleWheelPassive = (e: WheelEvent) => {
            e.preventDefault();

            if (!canvasRef.current) return;

            const rect = canvasRef.current.getBoundingClientRect();

            // Mouse position relative to canvas
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Calculate new zoom
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor));

            // Adjust offset to keep the point under mouse fixed
            const newOffsetX = mouseX - (mouseX - offsetX) * (newZoom / zoom);
            const newOffsetY = mouseY - (mouseY - offsetY) * (newZoom / zoom);

            setZoom(newZoom);
            setOffsetX(newOffsetX);
            setOffsetY(newOffsetY);
        };

        canvas.addEventListener('wheel', handleWheelPassive, { passive: false });

        return () => {
            canvas.removeEventListener('wheel', handleWheelPassive);
        };
    }, [zoom, offsetX, offsetY]);
    
    // Handle global mouse move for connection drawing
    React.useEffect(() => {
        const processGlobalMouseMove = (e: MouseEvent) => {
            // Update connection in progress
            if (connectionInProgressRef.current) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    const canvasX = mouseX;
                    const canvasY = mouseY; // Since SVG is positioned at 0,0 with 100% width/height
                    setConnectionInProgress(prev =>
                        prev ? { ...prev, x: canvasX, y: canvasY } : null
                    );
                }
            }
            
            // Drag element on canvas - SAFE capture of ref
            if (elementDragRef.current && isDraggingCanvasElementRef.current) {
                const dragRef = elementDragRef.current;
                const deltaX = (e.clientX - dragRef.startX) / zoomRef.current;
                const deltaY = (e.clientY - dragRef.startY) / zoomRef.current;
                
                // Update predictive delta for smooth pin positions during drag
                setDragElementDelta({
                    elementId: dragRef.elementId,
                    deltaX: deltaX,
                    deltaY: deltaY
                });
                
                setElements(prev =>
                    prev.map(elem =>
                        elem.id === dragRef.elementId
                            ? {
                                ...elem,
                                x: dragRef.elementX + deltaX,
                                y: dragRef.elementY + deltaY
                            }
                            : elem
                    )
                );
            }
            
            // Drag from sidebar - show preview
            if (sidebarDragRef.current && isDraggingFromSidebarRef.current) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    setDragPreview({
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top,
                        name: sidebarDragRef.current.item.name
                    });
                }
            }
        };

        let pendingMouseMoveEvent: MouseEvent | null = null;
        let mouseMoveRafId: number | null = null;
        const handleGlobalMouseMove = (e: MouseEvent) => {
            pendingMouseMoveEvent = e;
            if (mouseMoveRafId !== null) {
                return;
            }
            mouseMoveRafId = window.requestAnimationFrame(() => {
                mouseMoveRafId = null;
                if (!pendingMouseMoveEvent) return;
                processGlobalMouseMove(pendingMouseMoveEvent);
            });
        };
        
        const handleGlobalMouseUp = (e: MouseEvent) => {
            // Handle sidebar drop
            if (sidebarDragRef.current && isDraggingFromSidebarRef.current) {
                const dragRef = sidebarDragRef.current;
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    
                    // Check if within canvas bounds
                    if (mouseX >= 0 && mouseY >= 0 && mouseX <= rect.width && mouseY <= rect.height) {
                        const canvasX = (mouseX - offsetXRef.current) / zoomRef.current;
                        const canvasY = (mouseY - offsetYRef.current) / zoomRef.current;
                        
                        const elementType = dragRef.item.type as CanvasElement['type'];
                        const customDefinition = elementType === 'custom-node'
                            ? customNodesRef.current.find((item) => item.id === dragRef.item.customNodeId)
                            : null;
                        const defaultData = getDefaultNodeData(elementType);

                        // Handle control drag
                        if (dragRef.item.id.startsWith('control-')) {
                            const controlId = dragRef.item.id.replace('control-', '');
                            const detectedEl = detectedElementsRef.current.find(de => de.id === controlId);
                            if (detectedEl) {
                                const newElement: CanvasElement = {
                                    id: Date.now().toString(),
                                    name: detectedEl.name,
                                    type: 'element',
                                    x: canvasX,
                                    y: canvasY,
                                    data: {
                                        ...defaultData,
                                        selectedElement: controlId,
                                        outputs: detectedEl.outputs || []
                                    }
                                };
                                setElements(prev => updateElementValueTypes([...prev, newElement], connectionsRef.current));
                            }
                        } else {
                            if (elementType === 'custom-node' && customDefinition) {
                                const inputSchema = Array.isArray(customDefinition.inputSchema)
                                    ? customDefinition.inputSchema
                                    : [];
                                const outputSchema = Array.isArray(customDefinition.outputSchema)
                                    ? customDefinition.outputSchema
                                    : [];

                                if (defaultData) {
                                    defaultData.customNodeId = customDefinition.id;
                                    defaultData.customNodeName = customDefinition.name;
                                    defaultData.customInputSchema = inputSchema;
                                    defaultData.customOutputSchema = outputSchema;
                                    defaultData.customTemplateFormula = String(customDefinition.state?.mainFormula || customDefinition.state?.formula || '');
                                    defaultData.customInputValues = inputSchema.map((pin) => {
                                        if (pin.type === 'boolean') {
                                            return String(pin.defaultValue || '').toLowerCase() === 'true';
                                        }
                                        if (pin.type === 'number') {
                                            const num = Number(pin.defaultValue);
                                            return Number.isFinite(num) ? num : 0;
                                        }
                                        return pin.defaultValue || '';
                                    });
                                }
                            }

                            const newElement: CanvasElement = {
                                id: Date.now().toString(),
                                name: customDefinition?.name || dragRef.item.name,
                                type: elementType,
                                x: canvasX,
                                y: canvasY,
                                data: defaultData,
                                valueType:
                                    elementType === 'condition' ? 'boolean'
                                        : elementType === 'switch' ? 'number'
                                            : elementType === 'case-range' ? 'case'
                                                : elementType === 'case-value' ? 'case'
                                                    : elementType === 'custom-node' ? 'number'
                                                        : elementType === 'unzip' ? 'number'
                                                            : elementType === 'memory-read-number' ? 'number'
                                                            : elementType === 'memory-read-string' ? 'string'
                                                            : elementType === 'memory-read-boolean' ? 'boolean'
                                                            : elementType === 'memory-write-number' ? 'number'
                                                            : elementType === 'memory-write-string' ? 'string'
                                                            : elementType === 'memory-write-boolean' ? 'boolean'
                                                            : elementType === 'element-id' ? 'string'
                                                            : elementType === 'event-element' ? 'string'
                                                            : elementType === 'event-id' ? 'string'
                                                            : elementType === 'event-processor' ? 'string'
                                                            : elementType === 'number' ? 'number'
                                                                : elementType === 'constant-boolean' ? 'boolean'
                                                                    : elementType === 'constant-string' ? 'string'
                                                                        : elementType === 'regex' ? 'boolean'
                                                                            : elementType === 'concat' ? 'string'
                                                                                : elementType === 'cut-a' ? 'string'
                                                                                    : elementType === 'cut-b' ? 'string'
                                                                                        : elementType === 'cut-c' ? 'string'
                                                                                            : elementType === 'string-count-chars' ? 'number'
                                                                                                : elementType === 'string-count-words' ? 'number'
                                                                                                    : elementType === 'string-find-start' ? 'number'
                                                                                                        : elementType === 'string-find-end' ? 'number'
                                                                                                            : elementType === 'string-to-number' ? 'number'
                                                                                                                : elementType === 'number-to-string' ? 'string'
                                                                                                                    : elementType === 'bool-count' ? 'number'
                                                                                                                    : elementType === 'color' ? 'color'
                                                                                                                        : elementType === 'gradient' ? 'color'
                                                                                                                            : elementType === 'math' ? 'number'
                                                                                                                                : 'number'
                            };
                            
                            setElements(prev => updateElementValueTypes([...prev, newElement], connectionsRef.current));
                        }
                    }
                }
            }
            
            // Handle connection end
            if (connectionInProgressRef.current) {
                const element = e.target as HTMLElement;
                const pinElement = element.closest('.pin') as HTMLElement;

                
                if (pinElement) {
                    const elementId = pinElement.getAttribute('data-element-id');
                    const pinId = pinElement.getAttribute('data-pin-id');
                    const pinType = pinElement.classList.contains('input') ? 'input' : 'output';
                    const pinIndex = parseInt(pinId?.split('-')[1] || '0');
                    const connInProgressRef = connectionInProgressRef.current;
                    
                    if (elementId && pinType !== connInProgressRef.pinType && elementId !== connInProgressRef.elementId) {
                        const fromElement = elementsRef.current.find(el => el.id === connInProgressRef.elementId);
                        const toElement = elementsRef.current.find(el => el.id === elementId);
                        
                        if (fromElement && toElement) {
                            const sourceElement = connInProgressRef.pinType === 'output' ? fromElement : toElement;
                            const targetElement = connInProgressRef.pinType === 'output' ? toElement : fromElement;
                            const sourcePinIndex = connInProgressRef.pinType === 'output' ? connInProgressRef.pinIndex : pinIndex;
                            const targetPinIndex = connInProgressRef.pinType === 'output' ? pinIndex : connInProgressRef.pinIndex;

                            const connectionType: 'normal' | 'case' =
                                (isCaseNodeType(sourceElement.type) && targetElement.type === 'switch')
                                    ? 'case'
                                    : 'normal';

                            const compatible = areTypesCompatible(
                                sourceElement,
                                targetElement,
                                sourcePinIndex,
                                targetPinIndex,
                                connectionType
                            );

                            if (!compatible) {
                                console.warn('Incompatible types for connection');
                            } else {
                                const connId = Date.now().toString();
                                const newConnection: Connection = {
                                    id: connId,
                                    fromId: sourceElement.id,
                                    fromOutput: `output${sourcePinIndex}`,
                                    toId: targetElement.id,
                                    toInput: `input${targetPinIndex}`,
                                    operation: '+',
                                    valueType: sourceElement.valueType,
                                    connectionType
                                };

                                setConnections(prev => {
                                    let next = prev.filter(conn =>
                                        !(conn.toId === targetElement.id && conn.toInput === `input${targetPinIndex}`)
                                    );

                                    if (
                                        connectionType === 'case'
                                        && targetElement.type === 'switch'
                                        && isCaseNodeType(sourceElement.type)
                                    ) {
                                        const existingCaseConnections = next.filter(conn =>
                                            conn.toId === targetElement.id
                                            && conn.connectionType === 'case'
                                            && getInputIndex(conn.toInput) > 0
                                        );

                                        const existingCaseTypes = new Set(
                                            existingCaseConnections
                                                .map(conn => elementsRef.current.find(el => el.id === conn.fromId)?.type)
                                                .filter((type): type is 'case-range' | 'case-value' => type !== undefined && isCaseNodeType(type))
                                        );

                                        if (
                                            existingCaseTypes.size > 0
                                            && (existingCaseTypes.size > 1 || !existingCaseTypes.has(sourceElement.type))
                                        ) {
                                            next = next.filter(conn =>
                                                !(conn.toId === targetElement.id && conn.connectionType === 'case' && getInputIndex(conn.toInput) > 0)
                                            );
                                        }
                                    }

                                    next = [...next, newConnection];
                                    connectionsRef.current = next;
                                    setElements(prevElements => {
                                        let updated = updateElementValueTypes(prevElements, next);
                                        // When anything connects to unzip input0, resolve and store the schema
                                        if (targetElement.type === 'unzip' && targetPinIndex === 0) {
                                            const srcSchema = resolveZipSchema(sourceElement.id, updated, next);
                                            if (srcSchema.length > 0) {
                                                updated = updated.map(elem =>
                                                    elem.id === targetElement.id
                                                        ? { ...elem, data: { ...elem.data, customOutputSchema: srcSchema } }
                                                        : elem
                                                );
                                            }
                                        }
                                        return updated;
                                    });
                                    return next;
                                });
                            }
                            /*const caseConnections = connections.filter(c => c.toId === toElement.id && c.toInput.startsWith('input') && parseInt(c.toInput.replace('input', '')) > 0).length;

                            const connectedInputIndexes = Array.from(new Set(connections
                                .filter(c => c.toId === toElement.id && c.toInput.startsWith('input'))
                                .map(c => parseInt(c.toInput.replace('input', '')))
                                .filter(i => !isNaN(i))
                            ));
                            const inputCount = Math.max(1, connectedInputIndexes.length);
                            console.log()
                            updateAcceptedTypes(acceptedTypes, inputCount, caseConnections);*/
                        }
                    }
                }
            }
            
            // Clean up
            setIsDraggingFromSidebar(false);
            setIsDraggingCanvasElement(false);
            setConnectionInProgress(null);
            setDragPreview(null);
            setDragElementDelta(null);
            setZoomDelta(1);
            setOffsetDelta({ x: 0, y: 0 });
            elementDragRef.current = null;
            sidebarDragRef.current = null;
        };
        
        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);
        
        return () => {
            if (mouseMoveRafId !== null) {
                window.cancelAnimationFrame(mouseMoveRafId);
                mouseMoveRafId = null;
            }
            document.removeEventListener('mousemove', handleGlobalMouseMove);
            document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, []);

    const handleTreeToggleFolder = (itemId: string) => {
        setExpandedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
            } else {
                newSet.add(itemId);
            }
            return newSet;
        });
    };

    const isNodeLockedForCurrentPlan = (_item: TreeItem): boolean => {
        return false;
    };

    const showInfoNotice = (reason: string) => {
        setTemplateInfo(reason);
    };

    const handleTreeStartDrag = (e: React.MouseEvent, item: TreeItem) => {
        if (isNodeLockedForCurrentPlan(item)) {
            e.preventDefault();
            showInfoNotice(`"${item.name}" is unavailable in this context.`);
            return;
        }

        if (item.type === 'custom-node' && !item.customNodeId) {
            e.preventDefault();
            setTemplateInfo('Custom node definition is missing. Refresh list.');
            return;
        }

        if (!e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            sidebarDragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                item: item
            };
            setDraggedItem(item);
            setIsDraggingFromSidebar(true);
        }
    };

    const handleSaveFormula = () => {
        const { formula } = generateFormula(elements, connections);
        setFormula(formula);
        onFormulaChange?.(formula);
    };

    const getCurrentStateSnapshot = (): SavedState => {
        return {
            elements: elementsRef.current,
            connections: connectionsRef.current,
            formula: formulaRef.current,
            updatedAt: Date.now(),
        };
    };

    const refreshTemplates = React.useCallback(async () => {
        try {
            const nextTemplates = await fetchGraphTemplates(true);
            setTemplates(nextTemplates);
            setSelectedTemplateId((prev) => (prev ? prev : (nextTemplates[0]?.id || '')));
        } catch (error) {
            setTemplateInfo('Unable to load templates.');
        }
    }, []);

    const refreshCustomNodes = React.useCallback(async () => {
        if (!customNodeLibraryEnabled) {
            setCustomNodes([]);
            return;
        }

        try {
            const nextCustomNodes = await fetchGraphCustomNodes(true);
            setCustomNodes(nextCustomNodes);
        } catch {
            // Keep editor usable even when custom node endpoint is unavailable.
            setCustomNodes((prev) => prev);
        }
    }, [customNodeLibraryEnabled]);

    useEffect(() => {
        if (!customNodeLibraryEnabled) {
            setCustomNodes([]);
            return;
        }
        refreshCustomNodes();
    }, [customNodeLibraryEnabled, refreshCustomNodes]);

    useEffect(() => {
        if (!customNodes.length) {
            return;
        }

        setElements((prev) =>
            updateElementValueTypes(
                prev.map((element) => {
                    if (element.type !== 'custom-node') {
                        return element;
                    }

                    const customId = String(element.data?.customNodeId || '').trim();
                    if (!customId) {
                        return element;
                    }
                    const definition = customNodes.find((item) => item.id === customId);
                    if (!definition) {
                        return element;
                    }

                    return {
                        ...element,
                        name: definition.name || element.name,
                        data: {
                            ...element.data,
                            customNodeId: definition.id,
                            customNodeName: definition.name,
                            customInputSchema: definition.inputSchema || [],
                            customOutputSchema: definition.outputSchema || [],
                            customTemplateFormula: String(definition.state?.mainFormula || definition.state?.formula || element.data?.customTemplateFormula || ''),
                            customInputValues: Array.isArray(element.data?.customInputValues)
                                ? element.data?.customInputValues
                                : (definition.inputSchema || []).map((pin) => pin.defaultValue || ''),
                        },
                    };
                }),
                connections
            )
        );
    }, [connections, customNodes]);

    useEffect(() => {
        if (!customNodeLibraryEnabled) {
            return undefined;
        }
        if (typeof window === 'undefined') return undefined;

        const handleWindowFocus = () => {
            refreshCustomNodes();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                refreshCustomNodes();
            }
        };

        window.addEventListener('focus', handleWindowFocus);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            window.removeEventListener('focus', handleWindowFocus);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [customNodeLibraryEnabled, refreshCustomNodes]);

    useEffect(() => {
        if (!templateToolsEnabled) return;
        refreshTemplates();
    }, [refreshTemplates, templateToolsEnabled]);

    const handleSaveTemplate = async () => {
        const name = templateName.trim();
        if (!name) {
            setTemplateInfo('Enter a template name.');
            return;
        }

        const normalizedName = name.toLowerCase();
        const existingTemplate = templates.find((item) => item.name.trim().toLowerCase() === normalizedName);
        setIsTemplateBusy(true);
        setTemplateInfo('');
        try {
            const savedTemplate = await saveGraphTemplate(
                name,
                getCurrentStateSnapshot(),
                existingTemplate?.id
            );
            await refreshTemplates();
            if (savedTemplate.id) {
                setSelectedTemplateId(savedTemplate.id);
            }
            setTemplateName('');
            setTemplateInfo('Template saved.');
        } catch (error) {
            const message = error instanceof Error && error.message
                ? error.message
                : 'Unable to save template.';
            setTemplateInfo(message);
            if (message.toLowerCase().includes('template') || message.toLowerCase().includes('limit')) {
                showInfoNotice(message);
            }
        } finally {
            setIsTemplateBusy(false);
        }
    };

    const fillTemplateElementInputs = (templateElements: CanvasElement[]): CanvasElement[] => {
        const detected = detectedElementsRef.current;
        if (detected.length === 0) {
            return templateElements;
        }

        const isValidDetectedId = (id: string) => detected.some((item) => item.id === id);
        const usedDetectedIds = new Set<string>();

        templateElements.forEach((el) => {
            if (el.type !== 'element') return;
            const selectedId = String(el.data?.selectedElement || '');
            if (selectedId && isValidDetectedId(selectedId)) {
                usedDetectedIds.add(selectedId);
            }
        });

        const pickDetectedElement = (expectedType?: 'number' | 'string' | 'boolean' | 'color') => {
            const matchesType = (candidate: DetectedElement) =>
                !expectedType || candidate.outputs?.some((output) => output.type === expectedType);

            let candidate = detected.find((item) => !usedDetectedIds.has(item.id) && matchesType(item));
            if (!candidate) {
                candidate = detected.find((item) => !usedDetectedIds.has(item.id));
            }
            if (!candidate && expectedType) {
                candidate = detected.find((item) => matchesType(item));
            }
            return candidate || null;
        };

        return templateElements.map((el) => {
            if (el.type !== 'element') {
                return el;
            }

            const selectedId = String(el.data?.selectedElement || '');
            const stillExists = selectedId ? detected.find((item) => item.id === selectedId) : null;

            if (stillExists) {
                return {
                    ...el,
                    data: {
                        ...el.data,
                        selectedElement: stillExists.id,
                        outputs: stillExists.outputs || [],
                    },
                };
            }

            const expectedType =
                el.valueType === 'number'
                || el.valueType === 'string'
                || el.valueType === 'boolean'
                || el.valueType === 'color'
                    ? el.valueType
                    : undefined;
            const picked = pickDetectedElement(expectedType);

            if (!picked) {
                return {
                    ...el,
                    data: {
                        ...el.data,
                        selectedElement: '',
                        outputs: [],
                    },
                };
            }

            usedDetectedIds.add(picked.id);
            return {
                ...el,
                data: {
                    ...el.data,
                    selectedElement: picked.id,
                    outputs: picked.outputs || [],
                },
            };
        });
    };

    const handleImportTemplate = () => {
        const template = templates.find((item) => item.id === selectedTemplateId);
        const state = normalizeSnapshot(template?.state);

        if (!template || !state) {
            setTemplateInfo('Select a valid template.');
            return;
        }

        const importedElements = fillTemplateElementInputs(
            ensureMainBlock(normalizeLoadedElements(state.elements || []))
        );
        const loaded = applyLoadedState({
            elements: importedElements,
            connections: state.connections || [],
            formula: state.formula || '',
        });
        const data: SavedState = {
            elements: loaded.elements,
            connections: loaded.connections,
            formula: loaded.formula,
            updatedAt: Date.now(),
        };

        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
        setSavedState(data);
        setAutosaveState(data);

        onFormulaChange?.(data.formula);
        onStateChange?.(data);
        setTemplateInfo(`Imported template: ${template.name}`);
    };

    return (
        <div className="graph-editor">
            {showDraftRecoveryNotice && pendingDraftRecovery && (
                <div
                    style={{
                        position: 'fixed',
                        top: '12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 7000,
                        width: 'min(760px, calc(100vw - 32px))',
                        background: '#0f172a',
                        color: '#e2e8f0',
                        border: '1px solid #334155',
                        borderRadius: '10px',
                        boxShadow: '0 12px 28px rgba(2, 6, 23, 0.45)',
                        padding: '12px 14px',
                    }}
                >
                    <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>
                        Unsaved graph draft found
                    </div>
                    <div style={{ fontSize: '12px', lineHeight: '1.35', color: '#cbd5e1', marginBottom: '10px' }}>
                        {pendingDraftLabel
                            ? `There is an unsaved draft from ${pendingDraftLabel}.`
                            : 'There is an unsaved draft for this graph.'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                            type="button"
                            onClick={handleDismissDraftRecovery}
                            style={{
                                padding: '6px 12px',
                                background: '#334155',
                                color: '#e2e8f0',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                            }}
                        >
                            Dismiss
                        </button>
                        <button
                            type="button"
                            onClick={handleRestoreUnsaved}
                            style={{
                                padding: '6px 12px',
                                background: '#2563eb',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 600,
                            }}
                        >
                            Restore draft
                        </button>
                    </div>
                </div>
            )}
            <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
                <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    {sidebarOpen ? '\u25C0' : '\u25B6'}
                </button>
                {sidebarOpen && (
                    <div className="tree-container">
                        {treeData.map((item) => (
                            <TreeNode
                                key={item.id}
                                item={item}
                                expandedFolders={expandedFolders}
                                onToggleFolder={handleTreeToggleFolder}
                                onStartDrag={handleTreeStartDrag}
                                isLockedNode={isNodeLockedForCurrentPlan}
                                onLockedNodeClick={(lockedItem) => {
                                    showInfoNotice(`"${lockedItem.name}" is unavailable in this context.`);
                                }}
                            />
                        ))}
                        <div style={{ padding: '16px', borderTop: '1px solid #ddd', marginTop: '8px' }}>
                            <div style={{ color: '#cfd8dc', fontSize: '12px', marginBottom: '8px', lineHeight: '1.3' }}>
                                Features: <strong>unlocked</strong>
                            </div>

                            {!templateMode && !customNodeMode && (
                                <button
                                    onClick={() => {
                                        if (hasDynamicInputGapErrors) {
                                            const firstError = Object.values(dynamicInputGapErrors)[0];
                                            setTemplateInfo(`Save blocked: ${firstError}`);
                                            return;
                                        }
                                        try {
                                            handleSaveFormula();
                                        } catch (err) {
                                            // Keep graph save resilient even if formula generation fails.
                                            console.error('Formula generation error during save:', err);
                                        } finally {
                                            handleSave();
                                        }
                                    }}
                                    style={{
                                        ...buttonStyle,
                                        backgroundColor: hasDynamicInputGapErrors ? '#9e9e9e' : '#4caf50',
                                        cursor: hasDynamicInputGapErrors ? 'not-allowed' : 'pointer',
                                        opacity: hasDynamicInputGapErrors ? 0.85 : 1
                                    }}
                                    title={hasDynamicInputGapErrors ? 'Fix dynamic input gaps before saving.' : 'Save current graph'}
                                >
                                    Save Graph
                                </button>
                            )}

                            {hasDynamicInputGapErrors && !templateMode && !customNodeMode && (
                                <div style={{ color: '#ef4444', fontSize: '11px', marginTop: '4px', lineHeight: '1.35' }}>
                                    {Object.values(dynamicInputGapErrors)[0]}
                                </div>
                            )}

                            {unsavedChanges && !templateMode && !customNodeMode && (
                                <>
                                    <div style={{ color: '#ff9800', fontSize: '11px', marginTop: '4px', marginBottom: '2px' }}>
                                        Changes not saved
                                    </div>
                                    <button
                                        onClick={handleRestore}
                                        style={{
                                            ...buttonStyle,
                                            backgroundColor: '#ff9800'
                                        }}
                                    >
                                        Restore Changes
                                    </button>
                                </>
                            )}

                            {!unsavedChanges && recoverableDraftState && !showDraftRecoveryNotice && !templateMode && !customNodeMode && (
                                <button
                                    onClick={handleRestoreUnsaved}
                                    style={{
                                        ...buttonStyle,
                                        backgroundColor: '#3b82f6',
                                        marginTop: '6px',
                                    }}
                                >
                                    Restore Unsaved Draft
                                </button>
                            )}

                            {selected && (selected !== 'main-block' || customNodeMode) && (() => {
                                const selEl = elements.find(e => e.id === selected);
                                if (!selEl) return null;
                                const isConstantInput = customNodeMode && (
                                    selEl.type === 'number' || selEl.type === 'constant-boolean'
                                    || selEl.type === 'constant-string' || selEl.type === 'color'
                                );
                                const isZipOutput = customNodeMode && selEl.type === 'main';
                                return (
                                    <div style={{ marginTop: '10px', borderTop: '1px solid #555', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                                        {isConstantInput && (
                                            <>
                                                <div>
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Input Label</div>
                                                    <input
                                                        type="text"
                                                        className="input-control"
                                                        value={selEl.name}
                                                        placeholder="Input label"
                                                        onChange={(e) => {
                                                            const name = e.target.value;
                                                            setElements(prev => prev.map(elem =>
                                                                elem.id === selected ? { ...elem, name } : elem
                                                            ));
                                                        }}
                                                        style={{ width: '100%' }}
                                                    />
                                                </div>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa', cursor: 'pointer', userSelect: 'none' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={!!selEl.data?.hidden}
                                                        onChange={(e) => {
                                                            const hidden = e.target.checked;
                                                            setElements(prev => prev.map(elem =>
                                                                elem.id === selected ? { ...elem, data: { ...elem.data, hidden } } : elem
                                                            ));
                                                        }}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    Hidden (use default value)
                                                </label>
                                            </>
                                        )}

                                        {isZipOutput && (() => {
                                            const outputConns = connections
                                                .filter(c => c.toId === selEl.id && c.toInput.startsWith('input'))
                                                .sort((a, b) => {
                                                    const ai = parseInt(a.toInput.replace('input', ''), 10);
                                                    const bi = parseInt(b.toInput.replace('input', ''), 10);
                                                    return ai - bi;
                                                });
                                            if (outputConns.length === 0) return null;
                                            const zipLabels: string[] = Array.isArray(selEl.data?.zipOutputLabels)
                                                ? [...selEl.data.zipOutputLabels]
                                                : [];
                                            return (
                                                <div>
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '4px' }}>Output Labels</div>
                                                    {outputConns.map((conn, i) => {
                                                        const idx = parseInt(conn.toInput.replace('input', ''), 10);
                                                        return (
                                                            <div key={conn.id} style={{ marginBottom: '4px' }}>
                                                                <div style={{ color: '#888', fontSize: '10px', marginBottom: '2px' }}>Output {i + 1}</div>
                                                                <input
                                                                    type="text"
                                                                    className="input-control"
                                                                    value={zipLabels[idx] || ''}
                                                                    placeholder={`Output ${i + 1}`}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setElements(prev => prev.map(elem => {
                                                                            if (elem.id !== selected) return elem;
                                                                            const labels = Array.isArray(elem.data?.zipOutputLabels)
                                                                                ? [...elem.data.zipOutputLabels]
                                                                                : [];
                                                                            labels[idx] = val;
                                                                            return { ...elem, data: { ...elem.data, zipOutputLabels: labels } };
                                                                        }));
                                                                    }}
                                                                    style={{ width: '100%' }}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}

                                        {selEl.type === 'custom-node' && (
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa', cursor: 'pointer', userSelect: 'none' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!selEl.data?.zipOutput}
                                                    onChange={(e) => {
                                                        const zipOutput = e.target.checked;
                                                        setElements(prev =>
                                                            updateElementValueTypes(
                                                                prev.map(elem =>
                                                                    elem.id === selected
                                                                        ? { ...elem, data: { ...elem.data, zipOutput }, valueType: zipOutput ? 'zip' : 'number' }
                                                                        : elem
                                                                ),
                                                                connectionsRef.current
                                                            )
                                                        );
                                                        // Remove output connections that no longer exist when switching modes
                                                        setConnections(prev => {
                                                            const next = prev.filter(c => c.fromId !== selected);
                                                            connectionsRef.current = next;
                                                            return next;
                                                        });
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                Zip Output
                                            </label>
                                        )}

                                        {selEl.type === 'element-id' && (
                                            <>
                                                <div>
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Element ID</div>
                                                    <input
                                                        type="text"
                                                        className="input-control"
                                                        value={selEl.data?.elementId || ''}
                                                        onChange={(e) => {
                                                            const elementId = e.target.value;
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === selected
                                                                            ? { ...elem, data: { ...elem.data, elementId } }
                                                                            : elem
                                                                    )
                                                                )
                                                            );
                                                        }}
                                                        placeholder="Element ID"
                                                        style={{ width: '100%' }}
                                                    />
                                                </div>
                                                <div>
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Output Type</div>
                                                    <select
                                                        className="input-control"
                                                        value={selEl.data?.customOutputType || 'string'}
                                                        onChange={(e) => {
                                                            const customOutputType = e.target.value as 'number' | 'string' | 'boolean';
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === selected
                                                                            ? { ...elem, data: { ...elem.data, customOutputType } }
                                                                            : elem
                                                                    )
                                                                )
                                                            );
                                                        }}
                                                        style={{ width: '100%' }}
                                                    >
                                                        <option value="string">String</option>
                                                        <option value="number">Number</option>
                                                        <option value="boolean">Boolean</option>
                                                    </select>
                                                </div>
                                            </>
                                        )}

                                        {selEl.type === 'event-element' && (
                                            <>
                                                <div>
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Target Element</div>
                                                    <select
                                                        className="input-control"
                                                        value={selEl.data?.eventElement || ''}
                                                        onChange={(e) => {
                                                            const eventElement = e.target.value;
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === selected
                                                                            ? { ...elem, data: { ...elem.data, eventElement } }
                                                                            : elem
                                                                    )
                                                                )
                                                            );
                                                        }}
                                                        style={{ width: '100%' }}
                                                    >
                                                        <option value="">-- Select Element --</option>
                                                        {detectedElements.map(d => (
                                                            <option key={d.id} value={d.id}>{d.id}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Event Type</div>
                                                    <select
                                                        className="input-control"
                                                        value={selEl.data?.eventType || 'click'}
                                                        onChange={(e) => {
                                                            const eventType = e.target.value;
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === selected
                                                                            ? { ...elem, data: { ...elem.data, eventType } }
                                                                            : elem
                                                                    )
                                                                )
                                                            );
                                                        }}
                                                        style={{ width: '100%' }}
                                                    >
                                                        <option value="change">on change</option>
                                                        <option value="input">on input</option>
                                                        <option value="click">on click</option>
                                                        <option value="focus">on focus</option>
                                                        <option value="blur">on blur</option>
                                                        <option value="keyup">on keyup</option>
                                                        <option value="keydown">on keydown</option>
                                                    </select>
                                                </div>
                                            </>
                                        )}

                                        {selEl.type === 'event-id' && (
                                            <>
                                                <div>
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Element ID</div>
                                                    <input
                                                        type="text"
                                                        className="input-control"
                                                        value={selEl.data?.eventId || ''}
                                                        onChange={(e) => {
                                                            const eventId = e.target.value;
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === selected
                                                                            ? { ...elem, data: { ...elem.data, eventId } }
                                                                            : elem
                                                                    )
                                                                )
                                                            );
                                                        }}
                                                        placeholder="Element ID"
                                                        style={{ width: '100%' }}
                                                    />
                                                </div>
                                                <div>
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Event Type</div>
                                                    <select
                                                        className="input-control"
                                                        value={selEl.data?.eventType || 'click'}
                                                        onChange={(e) => {
                                                            const eventType = e.target.value;
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === selected
                                                                            ? { ...elem, data: { ...elem.data, eventType } }
                                                                            : elem
                                                                    )
                                                                )
                                                            );
                                                        }}
                                                        style={{ width: '100%' }}
                                                    >
                                                        <option value="change">on change</option>
                                                        <option value="input">on input</option>
                                                        <option value="click">on click</option>
                                                        <option value="focus">on focus</option>
                                                        <option value="blur">on blur</option>
                                                        <option value="keyup">on keyup</option>
                                                        <option value="keydown">on keydown</option>
                                                    </select>
                                                </div>
                                            </>
                                        )}

                                        {selEl.type === 'event-processor' && (
                                            <>
                                                <div>
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '6px' }}>Event Processor Configuration</div>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#ddd', cursor: 'pointer', userSelect: 'none' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selEl.data?.passOnlyOnEvent === true}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setElements(prev =>
                                                                    updateElementValueTypes(
                                                                        prev.map(elem =>
                                                                            elem.id === selected
                                                                                ? { ...elem, data: { ...elem.data, passOnlyOnEvent: checked } }
                                                                                : elem
                                                                        )
                                                                    )
                                                                );
                                                            }}
                                                            style={{ cursor: 'pointer' }}
                                                        />
                                                        Pass value only when event occurs
                                                    </label>
                                                    <div style={{ color: '#888', fontSize: '10px', marginTop: '4px', marginLeft: '22px' }}>
                                                        When unchecked: always passes the payload value<br/>
                                                        When checked: passes value only after event is triggered
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {(selEl.type === 'memory-read-number' || selEl.type === 'memory-read-string' || selEl.type === 'memory-read-boolean') && (
                                            <>
                                                <div>
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Variable Key</div>
                                                    <input
                                                        type="text"
                                                        className="input-control"
                                                        value={selEl.data?.variableKey || ''}
                                                        onChange={(e) => {
                                                            const variableKey = e.target.value;
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === selected
                                                                            ? { ...elem, data: { ...elem.data, variableKey } }
                                                                            : elem
                                                                    )
                                                                )
                                                            );
                                                        }}
                                                        placeholder="Variable key"
                                                        style={{ width: '100%' }}
                                                    />
                                                </div>
                                                <div>
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Default Value</div>
                                                    <input
                                                        type={selEl.type === 'memory-read-number' ? 'number' : 'text'}
                                                        className="input-control"
                                                        value={selEl.data?.defaultValue ?? (selEl.type === 'memory-read-number' ? 0 : selEl.type === 'memory-read-boolean' ? false : '')}
                                                        onChange={(e) => {
                                                            let defaultValue: number | string | boolean;
                                                            if (selEl.type === 'memory-read-number') {
                                                                defaultValue = parseFloat(e.target.value) || 0;
                                                            } else if (selEl.type === 'memory-read-boolean') {
                                                                defaultValue = e.target.value === 'true';
                                                            } else {
                                                                defaultValue = e.target.value;
                                                            }
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === selected
                                                                            ? { ...elem, data: { ...elem.data, defaultValue } }
                                                                            : elem
                                                                    )
                                                                )
                                                            );
                                                        }}
                                                        placeholder={selEl.type === 'memory-read-number' ? '0' : selEl.type === 'memory-read-boolean' ? 'false' : 'Default value'}
                                                        style={{ width: '100%' }}
                                                    />
                                                </div>
                                                {selEl.type === 'memory-read-boolean' && (
                                                    <div>
                                                        <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Boolean Value</div>
                                                        <select
                                                            className="input-control"
                                                            value={String(selEl.data?.defaultValue ?? false)}
                                                            onChange={(e) => {
                                                                const defaultValue = e.target.value === 'true';
                                                                setElements(prev =>
                                                                    updateElementValueTypes(
                                                                        prev.map(elem =>
                                                                            elem.id === selected
                                                                                ? { ...elem, data: { ...elem.data, defaultValue } }
                                                                                : elem
                                                                        )
                                                                    )
                                                                );
                                                            }}
                                                            style={{ width: '100%' }}
                                                        >
                                                            <option value="false">False</option>
                                                            <option value="true">True</option>
                                                        </select>
                                                    </div>
                                                )}
                                                <div>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa', cursor: 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={selEl.data?.persistVariable || false}
                                                            onChange={(e) => {
                                                                const persistVariable = e.target.checked;
                                                                setElements(prev =>
                                                                    updateElementValueTypes(
                                                                        prev.map(elem =>
                                                                            elem.id === selected
                                                                                ? { ...elem, data: { ...elem.data, persistVariable } }
                                                                                : elem
                                                                        )
                                                                    )
                                                                );
                                                            }}
                                                        />
                                                        Persist across sessions
                                                    </label>
                                                </div>
                                            </>
                                        )}

                                        {(selEl.type === 'memory-write-number' || selEl.type === 'memory-write-string' || selEl.type === 'memory-write-boolean') && (
                                            <div>
                                                <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Variable Key</div>
                                                <input
                                                    type="text"
                                                    className="input-control"
                                                    value={selEl.data?.variableKey || ''}
                                                    onChange={(e) => {
                                                        const variableKey = e.target.value;
                                                        setElements(prev =>
                                                            updateElementValueTypes(
                                                                prev.map(elem =>
                                                                    elem.id === selected
                                                                        ? { ...elem, data: { ...elem.data, variableKey } }
                                                                        : elem
                                                                )
                                                            )
                                                        );
                                                    }}
                                                    placeholder="Variable key"
                                                    style={{ width: '100%' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {templateToolsEnabled && (
                            <div style={{ marginTop: '12px', borderTop: '1px solid #555', paddingTop: '12px' }}>
                                <div style={{ color: '#ddd', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
                                    Graph Templates
                                </div>
                                <select
                                    className="input-control"
                                    value={selectedTemplateId}
                                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                                    style={{ width: '100%', marginTop: '8px' }}
                                >
                                    <option value="">Select template</option>
                                    {templates.map((template) => (
                                        <option key={template.id} value={template.id}>
                                            {template.name}
                                        </option>
                                    ))}
                                </select>

                                <button
                                    onClick={handleImportTemplate}
                                    style={{
                                        ...buttonStyle,
                                        backgroundColor: '#8e24aa'
                                    }}
                                >
                                    Import Template
                                </button>
                                {templateInfo && (
                                    <div style={{ color: '#cfd8dc', fontSize: '11px', marginTop: '6px', lineHeight: '1.3' }}>
                                        {templateInfo}
                                    </div>
                                )}
                            </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="main-content">
                <div
                    ref={canvasRef}
                    className="canvas"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    style={{
                        width: '100%',
                        height: '100%',
                        position: 'relative',
                        backgroundColor: '#2a2a2a',
                        backgroundImage:
                            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                        backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                        backgroundPosition: `${offsetX}px ${offsetY}px`,
                        cursor: isDraggingFromSidebar ? 'grabbing' : isPanning ? 'grabbing' : 'grab',
                        overflow: 'hidden'
                    }}
                >
                    {/* Render connections */}
                    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                        {connections.map(conn => {
                            const fromElement = elementsById.get(conn.fromId);
                            const toElement = elementsById.get(conn.toId);
                            
                            if (!fromElement || !toElement) return null;
                            
                            const fromPinIndex = parseInt(conn.fromOutput.replace('output', '')) || 0;
                            const toPinIndex = parseInt(conn.toInput.replace('input', '')) || 0;
                            
                            const fromPin = getPinPosition(fromElement, 'output', fromPinIndex);
                            const toPin = getPinPosition(toElement, 'input', toPinIndex);
                            
                            const isCaseConnection = conn.connectionType === 'case';
                            
                            return (
                                <g key={conn.id}>
                                    <path
                                        d={getBezierPath(fromPin, toPin)}
                                        stroke={isCaseConnection ? "#ff6b35" : "#0099ff"}
                                        strokeWidth="2"
                                        fill="none"
                                        className="connection-line"
                                    />
                                </g>
                            );
                        })}
                        
                        {/* Connection in progress */}
                        {connectionInProgress && (() => {
                            const element = elementsById.get(connectionInProgress.elementId);
                            if (!element) return null;
                            
                            const fromPin = getPinPosition(
                                element,
                                connectionInProgress.pinType,
                                connectionInProgress.pinIndex
                            );
                            
                            const toPin = { x: connectionInProgress.x, y: connectionInProgress.y };
                            
                            return (
                                <path
                                    d={getBezierPath(fromPin, toPin)}
                                    stroke="#0099ff"
                                    strokeWidth="2"
                                    fill="none"
                                    strokeDasharray="5,5"
                                    className="connection-in-progress"
                                />
                            );
                        })()}
                        
                        <defs>
                            <marker id="arrowhead" markerWidth="10" markerHeight="7" 
                                    refX="9" refY="3.5" orient="auto">
                                <polygon points="0 0, 10 3.5, 0 7" fill="#0099ff" />
                            </marker>
                        </defs>
                    </svg>
                    
                    {/* Drag preview from sidebar */}
                    {dragPreview && (
                        <div
                            style={{
                                position: 'absolute',
                                left: `${dragPreview.x - 50}px`,
                                top: `${dragPreview.y - 30}px`,
                                width: '100px',
                                height: '60px',
                                backgroundColor: '#444',
                                border: '2px dashed #0099ff',
                                borderRadius: '6px',
                                padding: '8px',
                                boxSizing: 'border-box',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                color: '#ddd',
                                pointerEvents: 'none',
                                zIndex: 1000,
                                opacity: 0.7
                            }}
                        >
                            {dragPreview.name}
                        </div>
                    )}
                    
                    {elements.map((el) => {
                        const inputCount = getInputCount(el);
                        const outputCount = getOutputCount(el);
                        const nodeHeight = getNodeHeight(el);
                        const nodeWidth = getNodeWidth(el);
                        const noInputPins = inputCount === 0;
                        const noOutputPins = outputCount === 0;
                        const nodePinClass = [
                            noInputPins ? 'no-input-pins' : '',
                            noOutputPins ? 'no-output-pins' : '',
                        ].filter(Boolean).join(' ');

                        //console.log(acceptedTypes);
                        
                        // Special layout for condition and calculation nodes
                        const isSpecialLayout =
                            el.type === 'condition'
                            || el.type === 'calculation'
                            || el.type === 'number'
                            || el.type === 'element'
                            || el.type === 'output'
                            || el.type === 'constant-boolean'
                            || el.type === 'constant-string'
                            || el.type === 'color'
                            || el.type === 'math'
                            || el.type === 'string-split'
                            || el.type === 'string-replace'
                            || el.type === 'number-parse'
                            || el.type === 'number-to-base'
                            || el.type === 'multi-concat'
                            || el.type === 'css-unit'
                            || el.type === 'css-margin'
                            || el.type === 'css-padding'
                            || el.type === 'css-width'
                            || el.type === 'css-height'
                            || el.type === 'css-font-size'
                            || el.type === 'css-join'
                            || el.type === 'css-display'
                            || el.type === 'css-text';
                        const calcSegments = el.type === 'calculation' ? (calcFlowByNode[el.id] || []) : [];
                        const calcMarkerId = `calc-flow-arrow-${el.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;


                        return (
                            <div
                                key={el.id}
                                className={`canvas-element type-${el.type} ${nodePinClass} ${selected === el.id ? 'selected' : ''} ${dynamicInputGapErrors[el.id] ? 'node-error' : ''}`}
                                data-element-id={el.id}
                                style={{ 
                                    left: `${el.x * zoom + offsetX}px`, 
                                    top: `${el.y * zoom + offsetY}px`,
                                    width: `${nodeWidth}px`,
                                    height: `${nodeHeight}px`,
                                    transform: `scale(${zoom})`,
                                    transformOrigin: '0 0',
                                    cursor: isDraggingCanvasElement && draggedElementId === el.id ? 'grabbing' : 'grab'
                                }}
                                title={dynamicInputGapErrors[el.id] || ''}
                                onMouseDown={(e) => {
                                    // Don't trigger element select on pin interaction
                                    const target = e.target as HTMLElement;
                                    if (target.classList.contains('pin') || target.classList.contains('input-control')) {
                                        e.stopPropagation();
                                        return;
                                    }
                                    
                                    // Delegate to handleMouseDown in canvas
                                    handleMouseDown(e as any);
                                    e.stopPropagation();
                                }}
                            >
                                <div className="node-header">{el.name}</div>
                                {el.type === 'calculation' && calcSegments.length > 0 && (
                                    <svg
                                        className="calc-flow-overlay"
                                        viewBox={`0 0 ${nodeWidth} ${nodeHeight}`}
                                        preserveAspectRatio="none"
                                        aria-hidden="true"
                                    >
                                        <defs>
                                            <marker
                                                id={calcMarkerId}
                                                markerWidth="8"
                                                markerHeight="8"
                                                refX="6"
                                                refY="3"
                                                orient="auto"
                                                markerUnits="strokeWidth"
                                            >
                                                <path d="M 0 0 L 6 3 L 0 6 z" fill="#9db4d8" />
                                            </marker>
                                        </defs>
                                        {calcSegments.map((segment) => (
                                            <g key={segment.key}>
                                                <path
                                                    className="calc-flow-path"
                                                    d={segment.d}
                                                    markerEnd={`url(#${calcMarkerId})`}
                                                />
                                                <g transform={`translate(${segment.badgeX}, ${segment.badgeY})`} className="calc-flow-badge">
                                                    <circle r="7" />
                                                    <text textAnchor="middle" dominantBaseline="middle">
                                                        {segment.step}
                                                    </text>
                                                </g>
                                            </g>
                                        ))}
                                    </svg>
                                )}

                                {isSpecialLayout ? (
                                    // Special layout: labels column + inputs column (centered)
                                    <div className={`special-layout ${inputCount === 0 ? 'no-inputs' : ''} ${outputCount === 0 ? 'no-outputs' : ''}`}>
                                        {inputCount > 0 && (
                                            <div className="labels-column">
                                                {Array.from({ length: inputCount }).map((_, i) => {
                                                    const types = getAcceptedTypesForPin(el, i);
                                                    return (
                                                        <div key={`label-row-${i}`} className="label-row">
                                                            <div className="input-label">
                                                                {getInputLabel(el, i)}
                                                            </div>
                                                            <div
                                                                className={
                                                                    `pin input ` +
                                                                types
                                                                        .map(t => `type-${t}`)
                                                                        .join(' ')
                                                                }
                                                                style={getPinStyleByTypes(types) as PinStyle}
                                                                data-pin-id={`input-${i}`}
                                                                data-element-id={el.id}
                                                                onMouseDown={(e) => {
                                                                    e.stopPropagation();
                                                                    const pinPos = getPinPosition(el, 'input', i);

                                                                    const existingConnection = connectionsByTargetInput.get(getConnectionLookupKey(el.id, `input${i}`));

                                                                    if (existingConnection) {
                                                                        const fromElement = elementsById.get(existingConnection.fromId);
                                                                        if (fromElement) {
                                                                            const fromPinIndex = parseInt(existingConnection.fromOutput.replace('output', ''), 10) || 0;
                                                                            const fromPinPos = getPinPosition(fromElement, 'output', fromPinIndex);
                                                                            setConnectionInProgress({
                                                                                elementId: existingConnection.fromId,
                                                                                pinType: 'output',
                                                                                pinIndex: fromPinIndex,
                                                                                x: fromPinPos.x,
                                                                                y: fromPinPos.y
                                                                            });
                                                                            setConnections(prev => {
                                                                                const next = prev.filter(conn => conn.id !== existingConnection.id);
                                                                                connectionsRef.current = next;
                                                                                return next;
                                                                            });
                                                                        }
                                                                    } else {
                                                                        setConnectionInProgress({
                                                                            elementId: el.id,
                                                                            pinType: 'input',
                                                                            pinIndex: i,
                                                                            x: pinPos.x,
                                                                            y: pinPos.y
                                                                        });
                                                                    }
                                                                }}
                                                                title={`Input ${i + 1}`}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        
                                        <div className="inputs-column-special">
                                            {el.type === 'condition' ? (
                                                <div className="input-row-special">
                                                    <select
                                                        className="input-control"
                                                        value={el.data?.operation || '==='}
                                                        onChange={(e) => {
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === el.id
                                                                            ? { ...elem, data: { ...elem.data, operation: e.target.value } }
                                                                            : elem
                                                                    )
                                                                )
                                                            );
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <option value="===">===</option>
                                                        <option value="!==">!==</option>
                                                        <option value=">">{'>'}</option>
                                                        <option value="<">{'<'}</option>
                                                        <option value=">=">{'>='}</option>
                                                        <option value="<=">{'<='}</option>
                                                    </select>
                                                </div>
                                            ) : el.type === 'calculation' ? (
                                                (() => {
                                                    const connectedCalcInputs = getConnectedInputIndexesForElement(el.id);
                                                    const operatorRowCount = Math.max(0, connectedCalcInputs.length - 1);
                                                    return Array.from({ length: operatorRowCount }).map((_, i) => {
                                                        const keyName = `input${i}`;
                                                        return (
                                                            <div key={`operator-row-${i}`} className="input-row-special calc-op-row">
                                                                <select
                                                                    className="input-control calc-op-control"
                                                                    data-calc-op-index={i}
                                                                    value={el.data?.inputOperations?.[keyName] || '+'}
                                                                    onChange={(e) => {
                                                                        const inputOperations = { ...el.data?.inputOperations };
                                                                        inputOperations[keyName] = e.target.value;
                                                                        setElements(prev =>
                                                                            updateElementValueTypes(
                                                                                prev.map(elem =>
                                                                                    elem.id === el.id
                                                                                        ? { ...elem, data: { ...elem.data, inputOperations } }
                                                                                        : elem
                                                                                )
                                                                            )
                                                                        );
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <option value="+">+</option>
                                                                    <option value="-">-</option>
                                                                    <option value="*">*</option>
                                                                    <option value="/">/</option>
                                                                    <option value="**">**</option>
                                                                    <option value="%">%</option>
                                                                </select>
                                                            </div>
                                                        );
                                                    });
                                                })()
                                            ) : el.type === 'math' ? (
                                                (() => {
                                                    const currentFn = String(el.data?.mathFunction || 'sin');
                                                    const options = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'abs', 'log', 'exp', 'floor', 'ceil', 'round'];
                                                    return (
                                                        <div className="input-row-special">
                                                            <select
                                                                className="input-control"
                                                                value={currentFn}
                                                                onChange={(e) => {
                                                                    const mathFunction = e.target.value;
                                                                    setElements(prev =>
                                                                        updateElementValueTypes(
                                                                            prev.map(elem =>
                                                                                elem.id === el.id
                                                                                    ? { ...elem, data: { ...elem.data, mathFunction } }
                                                                                    : elem
                                                                            )
                                                                        )
                                                                    );
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {options.map((name) => (
                                                                    <option key={name} value={name}>{name}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    );
                                                })()
                                            ) : el.type === 'number' ? (
                                                (() => {
                                                    return (
                                                        <div>
                                                            <input
                                                                type="number"
                                                                className="input-control"
                                                                value={String(el.data?.valueText ?? el.data?.value ?? '')}
                                                                onChange={(e) => {
                                                                    const valueText = e.target.value;
                                                                    setElements(prev =>
                                                                        updateElementValueTypes(
                                                                            prev.map(elem =>
                                                                                elem.id === el.id
                                                                                    ? { ...elem, data: { ...elem.data, valueText } }
                                                                                    : elem
                                                                            )
                                                                        )
                                                                    );
                                                                }}
                                                                onBlur={(e) => {
                                                                    const raw = e.target.value.replace(',', '.');
                                                                    const parsed = Number(raw);
                                                                    setElements(prev =>
                                                                        updateElementValueTypes(
                                                                            prev.map(elem => {
                                                                                if (elem.id !== el.id) return elem;
                                                                                const previousValue = Number(elem.data?.value ?? 0);
                                                                                const nextValue = Number.isFinite(parsed) ? parsed : previousValue;
                                                                                return {
                                                                                    ...elem,
                                                                                    data: {
                                                                                        ...elem.data,
                                                                                        value: nextValue,
                                                                                        valueText: String(nextValue)
                                                                                    }
                                                                                };
                                                                            })
                                                                        )
                                                                    );
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                placeholder="Value"
                                                            />
                                                        </div>
                                                    );
                                                })()
                                            ) : el.type === 'constant-boolean' ? (
                                                (() => {
                                                    return (
                                                        <label className="reverse-toggle" onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                type="checkbox"
                                                                checked={Boolean(el.data?.value)}
                                                                onChange={(e) => {
                                                                    const value = e.target.checked;
                                                                    setElements(prev =>
                                                                        updateElementValueTypes(
                                                                            prev.map(elem =>
                                                                                elem.id === el.id
                                                                                    ? { ...elem, data: { ...elem.data, value } }
                                                                                    : elem
                                                                            )
                                                                        )
                                                                    );
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                            True / False
                                                        </label>
                                                    );
                                                })()
                                            ) : el.type === 'constant-string' ? (
                                                (() => {
                                                    return (
                                                        <div>
                                                            <input
                                                                type="text"
                                                                className="input-control"
                                                                value={String(el.data?.value ?? '')}
                                                                onChange={(e) => {
                                                                    const value = e.target.value;
                                                                    setElements(prev =>
                                                                        updateElementValueTypes(
                                                                            prev.map(elem =>
                                                                                elem.id === el.id
                                                                                    ? { ...elem, data: { ...elem.data, value } }
                                                                                    : elem
                                                                            )
                                                                        )
                                                                    );
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                placeholder="Text"
                                                            />
                                                        </div>
                                                    );
                                                })()
                                            ) : el.type === 'color' ? (
                                                (() => {
                                                    return (
                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                            <input
                                                                type="color"
                                                                className="input-control"
                                                                value={String(el.data?.colorValue || '#2563eb')}
                                                                onChange={(e) => {
                                                                    const colorValue = e.target.value;
                                                                    setElements(prev =>
                                                                        updateElementValueTypes(
                                                                            prev.map(elem =>
                                                                                elem.id === el.id
                                                                                    ? { ...elem, data: { ...elem.data, colorValue } }
                                                                                    : elem
                                                                            )
                                                                        )
                                                                    );
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ width: '26px', minWidth: '26px', maxWidth: '26px', height: '26px', minHeight: '26px', maxHeight: '26px', padding: '1px' }}
                                                            />
                                                            <input
                                                                type="text"
                                                                className="input-control"
                                                                value={String(el.data?.colorValue || '#2563eb')}
                                                                onChange={(e) => {
                                                                    const colorValue = e.target.value;
                                                                    setElements(prev =>
                                                                        updateElementValueTypes(
                                                                            prev.map(elem =>
                                                                                elem.id === el.id
                                                                                    ? { ...elem, data: { ...elem.data, colorValue } }
                                                                                    : elem
                                                                            )
                                                                        )
                                                                    );
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                placeholder="#2563eb"
                                                            />
                                                        </div>
                                                    );
                                                })()
                                            ) : el.type === 'element-id' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center', justifyContent: 'center', minHeight: '40px', color: '#aaa', fontSize: '11px' }}>
                                                    Configure in sidebar ->
                                                </div>
                                            ) : el.type === 'memory-read-number' || el.type === 'memory-read-string' || el.type === 'memory-read-boolean' || el.type === 'memory-write-number' || el.type === 'memory-write-string' || el.type === 'memory-write-boolean' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center', justifyContent: 'center', minHeight: '40px', color: '#aaa', fontSize: '11px' }}>
                                                    Configure in sidebar ->
                                                </div>
                                            ) : el.type === 'event-element' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center', justifyContent: 'center', minHeight: '40px', color: '#aaa', fontSize: '11px' }}>
                                                    Configure in sidebar ->
                                                </div>
                                            ) : el.type === 'event-id' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center', justifyContent: 'center', minHeight: '40px', color: '#aaa', fontSize: '11px' }}>
                                                    Configure in sidebar ->
                                                </div>
                                            ) : el.type === 'event-processor' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    <div className="input-control" style={{ padding: '10px', cursor: 'default' }}>
                                                        Connect event input and payload input on the node canvas.
                                                    </div>
                                                </div>
                                            ) : el.type === 'element' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    <select
                                                        className="input-control"
                                                        value={el.data?.selectedElement || ''}
                                                        onChange={(e) => {
                                                            const selectedElementId = e.target.value;
                                                            const selectedElement = detectedElements.find(d => d.id === selectedElementId);
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === el.id
                                                                            ? { ...elem, data: { ...elem.data, selectedElement: selectedElementId, outputs: selectedElement?.outputs || [] } }
                                                                            : elem
                                                                    )
                                                                )
                                                            );
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <option value="">-- Element --</option>
                                                        {detectedElements.map(d => (
                                                            <option key={d.id} value={d.id}>{d.id}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ) : el.type === 'output' ? (
                                                <div className="node-output-controls" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    {!customNodeMode && (
                                                        <>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa', cursor: 'pointer', userSelect: 'none' }} onClick={(e) => e.stopPropagation()}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={el.data?.useIdInput || false}
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked;
                                                                        setElements(prev =>
                                                                            prev.map(elem =>
                                                                                elem.id === el.id
                                                                                    ? { ...elem, data: { ...elem.data, useIdInput: checked, selectedElement: checked ? '' : el.data?.selectedElement } }
                                                                                    : elem
                                                                            )
                                                                        );
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{ cursor: 'pointer' }}
                                                                />
                                                                Use ID Input
                                                            </label>
                                                            {el.data?.useIdInput ? (
                                                                <input
                                                                    type="text"
                                                                    className="input-control output-target-control"
                                                                    value={el.data?.selectedElement || ''}
                                                                    onChange={(e) => {
                                                                        const selectedElementId = e.target.value;
                                                                        setElements(prev =>
                                                                            updateElementValueTypes(
                                                                                prev.map(elem =>
                                                                                    elem.id === el.id
                                                                                        ? { ...elem, data: { ...elem.data, selectedElement: selectedElementId, outputs: [] }, name: selectedElementId || 'Output' }
                                                                                        : elem
                                                                                )
                                                                            )
                                                                        );
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    placeholder="Element ID"
                                                                />
                                                            ) : (
                                                                <select
                                                                    className="input-control output-target-control"
                                                                    value={el.data?.selectedElement || ''}
                                                                    onChange={(e) => {
                                                                        const selectedElementId = e.target.value;
                                                                        const selectedElement = detectedElements.find(d => d.id === selectedElementId);
                                                                        setElements(prev =>
                                                                            updateElementValueTypes(
                                                                                prev.map(elem =>
                                                                                    elem.id === el.id
                                                                                        ? { ...elem, data: { ...elem.data, selectedElement: selectedElementId, outputs: selectedElement?.outputs || [] }, name: selectedElementId || 'Output' }
                                                                                        : elem
                                                                                )
                                                                            )
                                                                        );
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <option value="">-- Target --</option>
                                                                    {detectedElements.map(d => (
                                                                        <option key={d.id} value={d.id}>{d.id}</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa', cursor: 'pointer', userSelect: 'none' }} onClick={(e) => e.stopPropagation()}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={el.data?.executeOnLoad !== false}
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked;
                                                                        setElements(prev =>
                                                                            prev.map(elem =>
                                                                                elem.id === el.id
                                                                                    ? { ...elem, data: { ...elem.data, executeOnLoad: checked } }
                                                                                    : elem
                                                                            )
                                                                        );
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{ cursor: 'pointer' }}
                                                                />
                                                                Execute on page load
                                                            </label>
                                                        </>
                                                    )}
                                                    {customNodeMode && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }} onClick={(e) => e.stopPropagation()}>
                                                            {outputInputLabels.map((defaultLabel, i) => (
                                                                <input
                                                                    key={i}
                                                                    type="text"
                                                                    className="input-control"
                                                                    value={(el.data?.outputLabels?.[i] ?? defaultLabel)}
                                                                    placeholder={defaultLabel}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        setElements(prev => prev.map(elem => {
                                                                            if (elem.id !== el.id) return elem;
                                                                            const labels = [...(elem.data?.outputLabels || outputInputLabels)];
                                                                            labels[i] = val;
                                                                            return { ...elem, data: { ...elem.data, outputLabels: labels } };
                                                                        }));
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{ fontSize: '10px' }}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : el.type === 'string-split' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }} onClick={(e) => e.stopPropagation()}>
                                                    <input type="text" className="input-control" value={el.data?.splitDelimiter ?? ','} placeholder="Delimiter" onChange={(e) => { const v = e.target.value; setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, splitDelimiter: v } } : em)); }} onClick={(e) => e.stopPropagation()} />
                                                    <input type="number" className="input-control" value={String(el.data?.splitIndex ?? 0)} placeholder="Index" min={0} onChange={(e) => { const v = parseInt(e.target.value, 10); setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, splitIndex: Number.isFinite(v) ? v : 0 } } : em)); }} onClick={(e) => e.stopPropagation()} />
                                                </div>
                                            ) : el.type === 'string-replace' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }} onClick={(e) => e.stopPropagation()}>
                                                    <input type="text" className="input-control" value={el.data?.replaceFind ?? ''} placeholder="Find" onChange={(e) => { const v = e.target.value; setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, replaceFind: v } } : em)); }} onClick={(e) => e.stopPropagation()} />
                                                    <input type="text" className="input-control" value={el.data?.replaceWith ?? ''} placeholder="Replace with" onChange={(e) => { const v = e.target.value; setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, replaceWith: v } } : em)); }} onClick={(e) => e.stopPropagation()} />
                                                </div>
                                            ) : el.type === 'number-parse' ? (
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <select className="input-control" value={String(el.data?.parseRadix ?? 10)} onChange={(e) => { const v = parseInt(e.target.value, 10); setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, parseRadix: v } } : em)); }} onClick={(e) => e.stopPropagation()}>
                                                        <option value="10">Base 10</option>
                                                        <option value="16">Base 16 (hex)</option>
                                                        <option value="2">Base 2 (binary)</option>
                                                        <option value="8">Base 8 (octal)</option>
                                                    </select>
                                                </div>
                                            ) : el.type === 'number-to-base' ? (
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <select className="input-control" value={String(el.data?.parseRadix ?? 16)} onChange={(e) => { const v = parseInt(e.target.value, 10); setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, parseRadix: v } } : em)); }} onClick={(e) => e.stopPropagation()}>
                                                        <option value="10">Base 10 (decimal)</option>
                                                        <option value="16">Base 16 (hex)</option>
                                                        <option value="2">Base 2 (binary)</option>
                                                        <option value="8">Base 8 (octal)</option>
                                                    </select>
                                                    <input type="number" className="input-control" min={0} max={16} value={String(el.data?.minLength ?? 0)} placeholder="Min length (pad)" onChange={(e) => { const v = parseInt(e.target.value, 10); setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, minLength: Number.isFinite(v) ? v : 0 } } : em)); }} onClick={(e) => e.stopPropagation()} style={{ marginTop: '3px' }} />
                                                </div>
                                            ) : el.type === 'multi-concat' ? (
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <select className="input-control" value={String(el.data?.inputCount ?? 3)} onChange={(e) => { const v = parseInt(e.target.value, 10); setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, inputCount: v } } : em)); }} onClick={(e) => e.stopPropagation()}>
                                                        <option value="2">2 inputs</option>
                                                        <option value="3">3 inputs</option>
                                                        <option value="4">4 inputs</option>
                                                        <option value="5">5 inputs</option>
                                                        <option value="6">6 inputs</option>
                                                        <option value="7">7 inputs</option>
                                                        <option value="8">8 inputs</option>
                                                    </select>
                                                </div>
                                            ) : el.type === 'css-join' ? (
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="number"
                                                        className="input-control"
                                                        min={2}
                                                        max={8}
                                                        step={1}
                                                        value={String(el.data?.inputCount ?? 3)}
                                                        onChange={(e) => {
                                                            const raw = parseInt(e.target.value, 10);
                                                            const next = Number.isFinite(raw) ? Math.max(2, Math.min(8, raw)) : 3;
                                                            setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, inputCount: next } } : em));
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        placeholder="2-8"
                                                    />
                                                </div>
                                            ) : el.type === 'css-unit' ? (
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="number"
                                                        className="input-control"
                                                        value={String(el.data?.cssUnitValue ?? '0')}
                                                        onChange={(e) => {
                                                            const next = e.target.value;
                                                            setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, cssUnitValue: next } } : em));
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        placeholder="Value"
                                                        style={{ marginBottom: '4px' }}
                                                    />
                                                    <select className="input-control" value={el.data?.cssUnit ?? 'px'} onChange={(e) => { const v = e.target.value; setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, cssUnit: v } } : em)); }} onClick={(e) => e.stopPropagation()}>
                                                        <option value="px">px</option>
                                                        <option value="%">%</option>
                                                        <option value="em">em</option>
                                                        <option value="rem">rem</option>
                                                        <option value="vw">vw</option>
                                                        <option value="vh">vh</option>
                                                        <option value="pt">pt</option>
                                                        <option value="cm">cm</option>
                                                    </select>
                                                </div>
                                            ) : el.type === 'css-display' ? (
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <select className="input-control" value={el.data?.cssDisplay ?? 'block'} onChange={(e) => { const v = e.target.value; setElements(prev => prev.map(em => em.id === el.id ? { ...em, data: { ...em.data, cssDisplay: v } } : em)); }} onClick={(e) => e.stopPropagation()}>
                                                        <option value="block">block</option>
                                                        <option value="none">none</option>
                                                        <option value="flex">flex</option>
                                                        <option value="inline-flex">inline-flex</option>
                                                        <option value="grid">grid</option>
                                                        <option value="inline">inline</option>
                                                        <option value="inline-block">inline-block</option>
                                                        <option value="contents">contents</option>
                                                        <option value="hidden">hidden</option>
                                                    </select>
                                                </div>
                                            ) : el.type === 'css-text' ? (
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        style={{ width: '100%', padding: '4px 8px', fontSize: '11px', background: '#4a1d96', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
                                                        onClick={(e) => { e.stopPropagation(); setCssEditorNodeId(el.id); }}
                                                    >
                                                        {el.data?.cssText ? 'Edit CSS [saved]' : 'Edit CSS...'}
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>

                                        {outputCount > 0 && (
                                            <div className="outputs-column-special">
                                                {/* Output pins */}
                                                {Array.from({ length: outputCount }).map((_, i) => (
                                                    <div key={`output-row-${i}`} className="output-row-special">
                                                        <div className="output-control-container">
                                                            {renderOutputControl(el, i)}
                                                        </div>
                                                        <div
                                                            className={`pin output type-${getOutputPinType(el, i) || 'number'}`}
                                                            data-pin-id={`output-${i}`}
                                                            data-element-id={el.id}
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                const pinPos = getPinPosition(el, 'output', i);
                                                                setConnectionInProgress({
                                                                    elementId: el.id,
                                                                    pinType: 'output',
                                                                    pinIndex: i,
                                                                    x: pinPos.x,
                                                                    y: pinPos.y
                                                                });
                                                            }}
                                                            title={`Output ${i + 1}`}
                                                        />
                                                        <div className="output-label">
                                                            {getOutputLabel(el, i)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    // Standard layout
                                    <>
                                        {inputCount > 0 && (
                                            <div className="inputs-column">
                                                {/* Input pins and controls */}
                                                {Array.from({ length: inputCount }).map((_, i) => {
                                                    const types = getAcceptedTypesForPin(el, i);
                                                    return (
                                                    <div key={`input-row-${i}`} className="input-row">
                                                        <div className="input-label">
                                                            {getInputLabel(el, i)}
                                                        </div>
                                                        <div className="input-control-container">
                                                            {renderInputControl(el, i)}
                                                        </div>
                                                        <div
                                                            className={
                                                                `pin input ` +
                                                                types
                                                                    .map(t => `type-${t}`)
                                                                    .join(' ')
                                                            }
                                                            style={getPinStyleByTypes(types) as PinStyle}
                                                            data-pin-id={`input-${i}`}
                                                            data-element-id={el.id}
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                const pinPos = getPinPosition(el, 'input', i);

                                                                const existingConnection = connectionsByTargetInput.get(getConnectionLookupKey(el.id, `input${i}`));

                                                                if (existingConnection) {
                                                                    const fromElement = elementsById.get(existingConnection.fromId);
                                                                    if (fromElement) {
                                                                        const fromPinIndex = parseInt(existingConnection.fromOutput.replace('output', ''), 10) || 0;
                                                                        const fromPinPos = getPinPosition(fromElement, 'output', fromPinIndex);
                                                                        setConnectionInProgress({
                                                                            elementId: existingConnection.fromId,
                                                                            pinType: 'output',
                                                                            pinIndex: fromPinIndex,
                                                                            x: fromPinPos.x,
                                                                            y: fromPinPos.y
                                                                        });
                                                                        setConnections(prev => {
                                                                            const next = prev.filter(conn => conn.id !== existingConnection.id);
                                                                            connectionsRef.current = next;
                                                                            return next;
                                                                        });
                                                                    }
                                                                } else {
                                                                    setConnectionInProgress({
                                                                        elementId: el.id,
                                                                        pinType: 'input',
                                                                        pinIndex: i,
                                                                        x: pinPos.x,
                                                                        y: pinPos.y
                                                                    });
                                                                }
                                                            }}
                                                            title={`Input ${i + 1}`}
                                                        />
                                                    </div>
                                                );})}
                                            </div>
                                        )}

                                        {outputCount > 0 && (
                                            <div className="outputs-column">
                                                {/* Output pins */}
                                                {Array.from({ length: outputCount }).map((_, i) => (
                                                    <div key={`output-row-${i}`} className="output-row">
                                                        <div className="output-control-container">
                                                            {renderOutputControl(el, i)}
                                                        </div>
                                                        <div
                                                            className={`pin output type-${getOutputPinType(el, i) || 'number'}`}
                                                            data-pin-id={`output-${i}`}
                                                            data-element-id={el.id}
                                                            onMouseDown={(e) => {
                                                                e.stopPropagation();
                                                                const pinPos = getPinPosition(el, 'output', i);
                                                                setConnectionInProgress({
                                                                    elementId: el.id,
                                                                    pinType: 'output',
                                                                    pinIndex: i,
                                                                    x: pinPos.x,
                                                                    y: pinPos.y
                                                                });
                                                            }}
                                                            title={`Output ${i + 1}`}
                                                        />
                                                        <div className="output-label">
                                                            {getOutputLabel(el, i)}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                                
                                {selected === el.id && (el.id !== 'main-block' || mainElementType === 'logic' || templateMode) && (
                                    <button
                                        className="delete-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(el.id);
                                        }}
                                    >
                                        ? Delete
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {cssEditorNodeId && (() => {
                const cssNode = elements.find(e => e.id === cssEditorNodeId);
                if (!cssNode) return null;
                return (
                    <div
                        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6000 }}
                        onClick={() => setCssEditorNodeId(null)}
                    >
                        <div
                            style={{ width: '480px', background: '#1e1e2e', border: '1px solid #4a1d96', borderRadius: '10px', padding: '16px', color: '#e2e8f0' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px', color: '#c4b5fd' }}>CSS Editor</div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px' }}>
                                Write CSS property declarations (e.g. <code style={{ background: '#2d2d3f', padding: '1px 4px', borderRadius: '3px' }}>border: 1px solid red; transform: rotate(5deg)</code>).
                                These will be applied to the target element at runtime.
                            </div>
                            <textarea
                                style={{ width: '100%', minHeight: '160px', background: '#0f0f1a', color: '#c4b5fd', border: '1px solid #4a1d96', borderRadius: '6px', padding: '10px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical', boxSizing: 'border-box' }}
                                value={cssNode.data?.cssText ?? ''}
                                placeholder={'border: 1px solid red;\ntransform: rotate(5deg);\nbox-shadow: 0 4px 12px rgba(0,0,0,0.3);'}
                                onChange={(e) => {
                                    const cssText = e.target.value;
                                    setElements(prev => prev.map(em =>
                                        em.id === cssEditorNodeId ? { ...em, data: { ...em.data, cssText } } : em
                                    ));
                                }}
                                spellCheck={false}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                                <button
                                    style={{ padding: '6px 14px', background: '#374151', color: '#e2e8f0', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}
                                    onClick={() => {
                                        setElements(prev => prev.map(em =>
                                            em.id === cssEditorNodeId ? { ...em, data: { ...em.data, cssText: '' } } : em
                                        ));
                                    }}
                                >Clear</button>
                                <button
                                    style={{ padding: '6px 14px', background: '#4a1d96', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}
                                    onClick={() => setCssEditorNodeId(null)}
                                >Done</button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default GraphEditor;
