import * as React from 'react';
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
// @ts-ignore: allow importing CSS in this environment without type declarations
// import './graphEditor.css';
import { TREE_DATA } from './graphEditor/treeData';
import {
    normalizeSnapshot,
    normalizeCustomNodeUiState,
    resolveInitialSnapshot,
    type CustomNodeUiSharedVariable,
    type CustomNodeUiState,
} from './graphEditor/persistence';
import {
    migrateElementPropertyNodeData,
    isInternalResolutionAttr,
    elementPropertyOrderedKeys,
    elementPropertyOutputCount,
    genericElementProperties,
    type ElementPropertyMode,
    type ElementPropertySelectedEntry,
    type DetectedElementProperty,
} from './graphEditor/elementPropertyModel';
import {
    detectElementProperties,
    detectElementChildren,
    getPreviewChildAt,
    observePreviewDomChanges,
    resolvePreviewElement,
    type DetectedChild,
} from './graphEditor/previewResolver';
import {
    migrateGetChildrenNodeData,
    readGetChildrenMode,
    readGetChildrenReturnAs,
    readGetChildrenSingleIndex,
    readGetChildrenSelectedIndices,
    getChildrenOutputsArray,
    getChildrenPinChildIndex,
    getChildrenOutputCount,
    type GetChildrenMode,
    type GetChildrenReturnAs,
} from './graphEditor/getChildrenModel';

interface PinStyle extends React.CSSProperties {
    '--pin-gradient'?: string;
}

type ArrayItemType = 'number' | 'string' | 'boolean' | 'color' | 'zip' | 'element';

// Canonical clamp for an array's element type. Accepts every supported element
// type (incl. 'element' for arrays of DOM element references); anything else /
// missing falls back to 'number'. Used everywhere an array's item type is read
// so a typed array (e.g. Array<element> from Get Children) is never silently
// downgraded to Array<number>.
const normalizeArrayItemType = (value: unknown): ArrayItemType =>
    value === 'string' || value === 'boolean' || value === 'color' || value === 'zip' || value === 'element'
        ? value
        : 'number';
type ArrayItemSchemaField = {
    id: string;
    label: string;
    type: 'number' | 'string' | 'boolean' | 'color' | 'zip' | 'case';
    sourceNodeId?: string;
    sourcePin?: string;
    // Custom-node input schema pins carry a default value; read at runtime,
    // was missing from the type.
    defaultValue?: string;
};

interface TreeItem {
    id: string;
    name: string;
    type:
        | 'folder'
        | 'main'
        | 'output'
        | 'element'
        | 'element-id'
        | 'element-ref'
        | 'element-property'
        | 'get-children'
        | 'number'
        | 'constant-boolean'
        | 'constant-string'
        | 'calculation'
        | 'node'
        | 'node-branch'
        | 'case-range'
        | 'case-value'
        | 'case-default'
        | 'switch'
        | 'switch-branch'
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
        | 'chart-data'
        | 'unzip'
        | 'memory-read-number'
        | 'memory-read-string'
        | 'memory-read-boolean'
        | 'memory-write-number'
        | 'memory-write-string'
        | 'memory-write-boolean'
        | 'memory-has'
        | 'memory-delete'
        | 'memory-increment'
        | 'memory-array-append'
        | 'memory-array-remove'
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
        | 'array'
        | 'array-push'
        | 'array-pop'
        | 'array-sort'
        | 'array-remove-index'
        | 'array-replace-index'
        | 'image-from-link'
        | 'image-from-element'
        | 'api-request'
        | 'api-status'
        | 'api-field'
        | 'api-list-mapper'
        | 'action-event'
        | 'action-block'
        | 'action-if'
        | 'action-required'
        | 'action-min'
        | 'action-max'
        | 'action-length'
        | 'action-regex'
        | 'action-add-class'
        | 'action-remove-class'
        | 'action-toggle-class'
        | 'event-element'
        | 'event-id'
        | 'event-processor'
        // New action nodes
        | 'action-set-text'
        | 'action-set-html'
        | 'action-set-value'
        | 'action-set-attr'
        | 'action-set-style'
        | 'action-set-visibility'
        | 'action-enable'
        | 'action-disable'
        | 'action-focus'
        | 'action-scroll-to'
        | 'action-notify'
        | 'action-redirect'
        | 'action-trigger-event'
        // New event nodes
        | 'event-hover'
        | 'event-scroll'
        | 'event-page-load'
        | 'event-timer'
        | 'event-custom'
        // New array nodes
        | 'array-map'
        | 'array-filter'
        | 'array-reduce'
        | 'array-find'
        | 'array-for-each'
        | 'array-collect'
        | 'array-contains'
        | 'array-length'
        | 'array-merge'
        | 'array-unique';
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
        | 'element-ref'
        | 'element-property'
        | 'get-children'
        | 'number'
        | 'constant-boolean'
        | 'constant-string'
        | 'calculation'
        | 'node'
        | 'node-branch'
        | 'case-range'
        | 'case-value'
        | 'case-default'
        | 'switch'
        | 'switch-branch'
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
        | 'chart-data'
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
        | 'array'
        | 'array-push'
        | 'array-pop'
        | 'array-sort'
        | 'array-remove-index'
        | 'array-replace-index'
        | 'image-from-link'
        | 'image-from-element'
        | 'api-request'
        | 'api-status'
        | 'api-field'
        | 'api-list-mapper'
        | 'action-event'
        | 'action-block'
        | 'action-if'
        | 'action-required'
        | 'action-min'
        | 'action-max'
        | 'action-length'
        | 'action-regex'
        | 'action-add-class'
        | 'action-remove-class'
        | 'action-toggle-class'
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
        | 'memory-has'
        | 'memory-delete'
        | 'memory-increment'
        | 'memory-array-append'
        | 'memory-array-remove'
        | 'event-element'
        | 'event-id'
        | 'event-processor'
        | 'fallback'
        // New action nodes
        | 'action-set-text'
        | 'action-set-html'
        | 'action-set-value'
        | 'action-set-attr'
        | 'action-set-style'
        | 'action-set-visibility'
        | 'action-enable'
        | 'action-disable'
        | 'action-focus'
        | 'action-scroll-to'
        | 'action-notify'
        | 'action-redirect'
        | 'action-trigger-event'
        // New event nodes
        | 'event-hover'
        | 'event-scroll'
        | 'event-page-load'
        | 'event-timer'
        | 'event-custom'
        // New array nodes
        | 'array-map'
        | 'array-filter'
        | 'array-reduce'
        | 'array-find'
        | 'array-for-each'
        | 'array-collect'
        | 'array-contains'
        | 'array-length'
        | 'array-merge'
        | 'array-unique';
    x: number;
    y: number;
    data?: {
        formula?: string;
        inputCount?: number;
        operation?: string;
        value?: number | string | boolean;
        valueText?: string;
        selectedElement?: string;
        elementUseManualId?: boolean;
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
        customSharedVariables?: CustomNodeUiSharedVariable[];
        unzipIndex?: number;
        outputMode?: 'zipped' | 'unzipped';
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
        // For output node: marks that the leading "Element" target input pin has
        // been added. Absent on pre-existing graphs -> a one-time connection
        // reindex (input0..N -> input1..N+1) migrates them.
        outputTargetElementPin?: boolean;
        useIdInput?: boolean;
        executeOnLoad?: boolean;
        // For main-block (Zip Output) in customNodeMode: editable output labels
        zipOutputLabels?: string[];
        // For Element ID node
        elementId?: string;
        elementProperty?: string;
        elementPropertyUseManual?: boolean;
        elementPropertyType?: 'number' | 'string' | 'boolean';
        // Stage 2A: three-mode Element Property model. `single` reproduces the
        // legacy behaviour and keeps using `elementProperty` / `elementPropertyType`.
        // Legacy fields above are retained for read compatibility / migration.
        elementPropertyMode?: ElementPropertyMode;
        // Authoritative ordered selection for `custom` mode; `origin: 'custom'`
        // marks manually added keys. Not used by `single` / `all`.
        elementPropertySelected?: ElementPropertySelectedEntry[];
        // Get Children modes (see getChildrenModel). Legacy nodes have none and
        // are migrated to all/children (the original "one array of all children").
        getChildrenMode?: GetChildrenMode;
        getChildrenReturnAs?: GetChildrenReturnAs;
        getChildrenSingleIndex?: number;
        getChildrenSelected?: number[];
        // For Memory nodes
        variableKey?: string;
        defaultValue?: number | string | boolean;
        persistVariable?: boolean;
        // 'widget' (default): scoped to this logic block, so two duplicated
        // Elementor widget instances never collide on the same variable name.
        // 'page': unscoped, for intentional cross-widget sharing on one page.
        memoryScope?: 'widget' | 'page';
        incrementStep?: number;
        // For Event nodes
        eventElement?: string;
        eventId?: string;
        eventOption?: string;
        eventUseManualId?: boolean; // true = manual text input, false = dropdown from detectedElements
        eventType?: string;
        // For Action nodes
        actionEventType?: string;
        actionTargetId?: string;
        actionTargetManualId?: string;
        actionUseManualId?: boolean;
        actionRequired?: boolean;
        actionMin?: number;
        actionMax?: number;
        actionMinLength?: number;
        actionMaxLength?: number;
        actionRegexPattern?: string;
        actionClassName?: string;
        // For custom-node: true = single zip output (legacy), false/undefined = individual output pins
        zipOutput?: boolean;
        // For custom-node/constant carriers: no editable inputs, output carries type only
        customNodeTypeCarrier?: boolean;
        constantTypeCarrier?: boolean;
        // For string-split: delimiter and index
        splitDelimiter?: string;
        splitIndex?: number;
        // For string-replace: find and replace strings
        replaceFind?: string;
        replaceWith?: string;
        // For number-parse: radix (10, 16, 2, 8)
        parseRadix?: number;
        // For number-to-base: zero-pad width
        minLength?: number;
        // For output node: extended CSS properties
        outputCssProperty?: string;
        // For css-unit node: unit selector
        cssUnit?: string;
        cssUnitValue?: string;
        // For css-display node: display value
        cssDisplay?: string;
        // For css-text node: raw CSS text
        cssText?: string;
        // Array nodes
        arrayItemType?: ArrayItemType;
        arrayTypeCarrier?: boolean;
        // Chart Data node
        chartDataLabel?: string;
        chartDataValue?: number | string;
        chartDataValueText?: string;
        chartDataTypeCarrier?: boolean;
        // Event Element node: only propagate on the bound event, not on every recalc
        passOnlyOnEvent?: boolean;
        arrayItemSchema?: ArrayItemSchemaField[];
        sortMode?: 'number-asc' | 'number-desc' | 'string-asc' | 'string-desc' | 'custom-asc' | 'custom-desc';
        arraySortField?: string;
        // Image nodes
        imageUrl?: string;
        elementSelector?: string;
        // API nodes
        apiUrl?: string;
        apiMethod?: string;
        // JSON object string, e.g. '{"Authorization":"Bearer xyz"}'
        apiHeaders?: string;
        apiTimeout?: number;
        apiFieldPath?: string;
        apiFieldType?: 'number' | 'string' | 'boolean' | 'color' | 'zip' | 'case';
        apiFieldFallback?: string;
        apiListPath?: string;
        apiListLabelField?: string;
        apiListValueField?: string;
        apiListMatchMode?: 'auto' | 'names' | 'types';
        apiListItemType?: ArrayItemType | 'case' | 'chart-data';
        apiListCustomNodeId?: string;
        apiListFieldMappings?: Array<{
            fieldId: string;
            path: string;
        }>;
        // Custom object splitter nodes
        sharedVariables?: CustomNodeUiSharedVariable[];
        // New action nodes data
        actionTargetSelector?: string;
        actionTargetUseManual?: boolean;
        actionAttrName?: string;
        actionStyleProperty?: string;
        actionVisibility?: 'show' | 'hide' | 'toggle';
        actionNotifyMessage?: string;
        actionNotifyDuration?: number;
        actionRedirectTarget?: '_self' | '_blank';
        actionEventName?: string;
        actionIfCondition?: boolean;
        // New event nodes data
        eventTimerInterval?: number;
        eventTimerMode?: 'interval' | 'timeout';
        eventCustomName?: string;
        eventHoverMode?: 'enter' | 'leave' | 'both';
        // For-each / collect loop
        forEachArraySchemaItem?: ArrayItemSchemaField[];
        // array-reduce
        arrayReduceOperation?: 'sum' | 'product' | 'min' | 'max' | 'concat' | 'count';
        arrayReduceInitial?: string;
        // array-contains / array-find
        arraySearchField?: string;
        // array-merge
        arrayMergeMode?: 'concat' | 'union';
    };
    valueType?: 'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event' | 'array' | 'action' | 'element';
    connections?: Connection[];
}

const MEMORY_NODE_TYPES = new Set<CanvasElement['type']>([
    'memory-read-number', 'memory-read-string', 'memory-read-boolean',
    'memory-write-number', 'memory-write-string', 'memory-write-boolean',
    'memory-has', 'memory-delete', 'memory-increment', 'memory-array-append', 'memory-array-remove',
]);
const isMemoryNodeType = (type: CanvasElement['type']): boolean => MEMORY_NODE_TYPES.has(type);

interface Connection {
    id: string;
    fromId: string;
    fromOutput: string;
    toId: string;
    toInput: string;
    operation?: '+' | '-' | '*' | '/' | '**' | '%' | '===' | '!==' | '>' | '<' | '>=' | '<=';
    valueType?: 'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event' | 'array' | 'action' | 'element';
    connectionType?: 'normal' | 'case'; // New type for case connections
}

interface CalcFlowSegment {
    key: string;
    d: string;
    step: number;
    badgeX: number;
    badgeY: number;
    ghost?: boolean;
}

interface DetectedElement {
    id: string;
    type: 'slider' | 'input-number' | 'input-string' | 'checkbox' | 'radio' | 'select' | 'button-group' | 'image' | 'array-list' | 'chart' | 'custom-element' | 'trigger';
    name: string;
    outputs?: { name: string; type: 'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'array' }[];
}

interface SavedState {
    elements: CanvasElement[];
    connections: Connection[];
    formula: string;
    // Per-event formulas for the calculator/formula block; always {} for a
    // logic-mode graph but persisted for round-trip fidelity.
    eventFormulas?: Record<string, string>;
    customNodeUi?: CustomNodeUiState | null;
    updatedAt?: number;
}

interface GraphTemplateItem {
    id: string;
    name: string;
    state: SavedState | null;
    updatedAt: number;
}

interface GraphEditorRuntimeWindow extends Window {
    nodelogicGraphBuilderBaseTreeData?: TreeItem[];
    nodelogicGraphBuilderConfig?: {
        enableTemplates?: boolean;
        enableCustomNodes?: boolean;
        treeData?: TreeItem[];
        extraTreeData?: TreeItem[];
        customNodes?: Array<Record<string, unknown>>;
    };
}

if (typeof window !== 'undefined') {
    const runtimeWindow = window as GraphEditorRuntimeWindow;
    if (!Array.isArray(runtimeWindow.nodelogicGraphBuilderBaseTreeData) || runtimeWindow.nodelogicGraphBuilderBaseTreeData.length === 0) {
        runtimeWindow.nodelogicGraphBuilderBaseTreeData = TREE_DATA as TreeItem[];
    }
}

const cloneTreeData = (items: TreeItem[]): TreeItem[] => {
    try {
        return JSON.parse(JSON.stringify(Array.isArray(items) ? items : []));
    } catch {
        return Array.isArray(items)
            ? items.map((item) => ({
                  ...item,
                  children: Array.isArray(item.children) ? cloneTreeData(item.children as TreeItem[]) : []
              }))
            : [];
    }
};

const mergeTreeData = (baseItems: TreeItem[] = [], extraItems: TreeItem[] = []): TreeItem[] => {
    const base = cloneTreeData(baseItems);
    const extra = cloneTreeData(extraItems);
    const extraById = new Map(extra.map((item) => [item.id, item]));
    const merged = base.map((baseItem) => {
        const extraItem = extraById.get(baseItem.id);
        if (!extraItem) {
            return {
                ...baseItem,
                children: Array.isArray(baseItem.children) ? mergeTreeData(baseItem.children as TreeItem[], []) : []
            };
        }

        return {
            ...extraItem,
            ...baseItem,
            children: mergeTreeData(
                Array.isArray(baseItem.children) ? (baseItem.children as TreeItem[]) : [],
                Array.isArray(extraItem.children) ? (extraItem.children as TreeItem[]) : []
            )
        };
    });

    extra.forEach((extraItem) => {
        if (!base.some((baseItem) => baseItem.id === extraItem.id)) {
            merged.push(extraItem);
        }
    });

    return merged;
};

const normalizeDetectedOutputType = (
    value: unknown,
    fallback: NonNullable<DetectedElement['outputs']>[number]['type'] = 'string'
): NonNullable<DetectedElement['outputs']>[number]['type'] => {
    const normalized = String(value ?? '').trim().toLowerCase();
    switch (normalized) {
        case 'number':
        case 'string':
        case 'boolean':
        case 'case':
        case 'color':
        case 'zip':
        case 'array':
            return normalized;
        default:
            return fallback;
    }
};

const escapeRegExp = (value: unknown): string => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const detectElementOutputsFromCustomUi = (customNodeUi: unknown): NonNullable<DetectedElement['outputs']> => {
    const normalizedUi = normalizeCustomNodeUiState(customNodeUi);
    return (Array.isArray(normalizedUi?.sharedVariables) ? normalizedUi.sharedVariables : [])
        .map((item) => ({
            name: String(item?.label || item?.path || item?.id || '').trim(),
            type: normalizeDetectedOutputType(item?.type, 'string'),
        }))
        .filter((item) => item.name.length > 0);
};

const detectElementFromBlock = (block: any): DetectedElement | null => {
    if (!block || typeof block !== 'object') {
        return null;
    }

    const blockName = String(block.name || '').trim().toLowerCase();
    const attrs = block.attributes || {};
    const readId = (...values: unknown[]): string => {
        for (const value of values) {
            const candidate = String(value ?? '').trim();
            if (candidate.length > 0) {
                return candidate;
            }
        }
        return '';
    };

    const outputsForValue = (type: NonNullable<DetectedElement['outputs']>[number]['type']): NonNullable<DetectedElement['outputs']> => [
        { name: 'value', type },
    ];

    switch (blockName) {
        case 'custom/element-seekbar':
            return {
                id: readId(attrs.sliderId),
                type: 'slider',
                name: String(attrs.title || 'Seekbar'),
                outputs: outputsForValue('number'),
            };
        case 'custom/element-number':
            return {
                id: readId(attrs.sliderId),
                type: 'input-number',
                name: String(attrs.title || 'Number Input'),
                outputs: outputsForValue('number'),
            };
        case 'custom/element-text':
            return {
                id: readId(attrs.sliderId),
                type: 'input-string',
                name: String(attrs.title || 'Text Input'),
                outputs: outputsForValue('string'),
            };
        case 'custom/element-radio':
            return {
                id: readId(attrs.sliderId),
                type: 'radio',
                name: String(attrs.title || 'Radio Group'),
                outputs: outputsForValue('string'),
            };
        case 'custom/element-select':
            return {
                id: readId(attrs.sliderId),
                type: 'select',
                name: String(attrs.title || 'Select'),
                outputs: outputsForValue('string'),
            };
        case 'custom/element-checkbox':
            return {
                id: readId(attrs.sliderId),
                type: 'checkbox',
                name: String(attrs.title || 'Checkbox'),
                outputs: outputsForValue('boolean'),
            };
        case 'custom/element-label':
            return {
                id: readId(attrs.sliderId),
                type: 'input-string',
                name: String(attrs.nodelogicLabel || attrs.title || 'Label'),
                outputs: outputsForValue('string'),
            };
        case 'custom/button-group':
            return {
                id: readId(attrs.groupId),
                type: 'button-group',
                name: String(attrs.title || 'Button Group'),
                outputs: outputsForValue('string'),
            };
        case 'custom/nodelogic-image':
        case 'nodelogic/image':
            return {
                id: readId(attrs.imageId),
                type: 'image',
                name: String(attrs.title || 'Image'),
                outputs: outputsForValue('string'),
            };
        case 'custom/nodelogic-array-list':
        case 'nodelogic/array-list':
            return {
                id: readId(attrs.listId),
                type: 'array-list',
                name: String(attrs.title || 'Array List'),
                outputs: outputsForValue('array'),
            };
        case 'custom/nodelogic-trigger-group': {
            // Each item in the trigger group is a separate detectable element (event-only, no value output)
            // We return null here — individual items are collected in collectDetectedElementsFromBlocks
            return null;
        }
        case 'nodelogic/chart':
            return {
                id: readId(attrs.chartId),
                type: 'chart',
                name: String(attrs.title || 'Chart'),
                outputs: outputsForValue('array'),
            };
        case 'nodelogic/custom-element': {
            const customOutputs = detectElementOutputsFromCustomUi(attrs.customNodeUi);
            return {
                id: readId(attrs.elementId),
                type: 'custom-element',
                name: String(attrs.title || attrs.customNodeName || 'Custom Element'),
                outputs: customOutputs.length > 0 ? customOutputs : outputsForValue('zip'),
            };
        }
        default:
            return null;
    }
};

const collectDetectedElementsFromBlocks = (blocks: any[]): DetectedElement[] => {
    const results: DetectedElement[] = [];
    const seen = new Set<string>();

    const walk = (items: any[]): void => {
        items.forEach((block) => {
            const blockName = String(block?.name || '').trim().toLowerCase();

            // Trigger Group: each item with an id is a separate detectable trigger element
            if (blockName === 'custom/nodelogic-trigger-group') {
                const attrs = block?.attributes || {};
                const triggerItems = Array.isArray(attrs.items) ? attrs.items : [];
                triggerItems.forEach((item: any) => {
                    const itemId = String(item?.id || '').trim();
                    if (itemId && !seen.has(itemId)) {
                        seen.add(itemId);
                        results.push({
                            id: itemId,
                            type: 'trigger',
                            name: String(item?.label || itemId),
                            outputs: [], // triggers emit events, not values
                        });
                    }
                });
                return;
            }

            const detected = detectElementFromBlock(block);
            if (detected && detected.id && !seen.has(detected.id)) {
                seen.add(detected.id);
                results.push(detected);
            }

            if (Array.isArray(block?.innerBlocks) && block.innerBlocks.length > 0) {
                walk(block.innerBlocks);
            }
        });
    };

    walk(Array.isArray(blocks) ? blocks : []);
    return results;
};


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
    const hasChildren = Array.isArray(item.children) && item.children.length > 0;

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
                    if (hasChildren) {
                        e.stopPropagation();
                        onToggleFolder(item.id);
                    }
                }}
            >
                {hasChildren && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFolder(item.id);
                        }}
                        style={{
                            pointerEvents: 'auto',
                            fontSize: '32px',
                            width: '16px',
                            height: '16px',
                            minWidth: '16px',
                            minHeight: '16px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            lineHeight: 1,
                            padding: 0,
                        }}
                    >
                        {isExpanded ? '\u25BE' : '\u25B8'}
                    </button>
                )}
                {item.type === 'folder' ? '\u{1F4C1}' : '\u{1F527}'} {item.name}{isLocked ? ' (Locked)' : ''}
            </div>
            {isExpanded && hasChildren && (
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
    templateMode?: boolean;
    customNodeMode?: boolean;
    showTemplateTools?: boolean;
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
    action: '#a855f7',
    array: '#10b981',
    event: '#dc2626',
    element: '#38bdf8',
    'chart-data': '#f59e0b',
};

const outputPropertyNames = ['value', 'background', 'color', 'disabled', 'custom-css'];
const outputInputLabels = ['Value', 'Background', 'Color', 'Disabled', 'CSS'];

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

const getPinStyleByTypes = (types: string[]): PinStyle => buildPinStyle(types);

const GraphEditor: React.FC<GraphEditorProps> = ({
    editorId,
    onFormulaChange,
    initialState = null,
    onStateChange,
    onUnsavedChange,
    forceInitialState = false,
    templateMode = false,
    customNodeMode = false,
    showTemplateTools = false,
    editingNodeId = '',
    liveStateSync = true,
    mainElementType = 'info',
}) => {
    const SAVE_KEY = `formulaEditor.save.${editorId}`;
    const AUTOSAVE_KEY = `formulaEditor.autosave.${editorId}`;

    const [savedState, setSavedState] = useState<SavedState | null>(null);
    const [autosaveState, setAutosaveState] = useState<SavedState | null>(null);
    const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isStateLoaded, setIsStateLoaded] = useState(false);
    const [runtimeConfigState, setRuntimeConfigState] = useState<NonNullable<GraphEditorRuntimeWindow['nodelogicGraphBuilderConfig']>>({});

    const [unsavedChanges, setUnsavedChanges] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sidebarSearch, setSidebarSearch] = useState('');
    const [zoom, setZoom] = useState(1);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);
    useEffect(() => {
        const syncRuntimeConfig = () => {
            if (typeof window === 'undefined') {
                return;
            }
            const nextConfig = (window as GraphEditorRuntimeWindow).nodelogicGraphBuilderConfig || {};
            const proConfig = (window as GraphEditorRuntimeWindow & {
                calcgraphProEditorConfig?: Record<string, unknown>;
            }).calcgraphProEditorConfig || {};
            const nextTreeData = Array.isArray((nextConfig as any).treeData) ? (nextConfig as any).treeData : [];
            const nextExtraTreeData = Array.isArray((nextConfig as any).extraTreeData) ? (nextConfig as any).extraTreeData : [];
            const proTreeData = Array.isArray((proConfig as any).treeData) ? (proConfig as any).treeData : [];
            const proExtraTreeData = Array.isArray((proConfig as any).extraTreeData) ? (proConfig as any).extraTreeData : [];
            const nextCustomNodes = Array.isArray((nextConfig as any).customNodes) && (nextConfig as any).customNodes.length > 0
                ? (nextConfig as any).customNodes
                : (Array.isArray((proConfig as any).customNodes) ? (proConfig as any).customNodes : []);
            const mergedTreeData = mergeTreeData(nextTreeData, nextExtraTreeData);
            const mergedProTreeData = mergeTreeData(proTreeData, proExtraTreeData);
            setRuntimeConfigState({
                ...nextConfig,
                ...(mergedTreeData.length > 0 ? { treeData: mergedTreeData } : {}),
                ...((mergedTreeData.length === 0 && mergedProTreeData.length > 0) ? { treeData: mergedProTreeData } : {}),
                ...(Array.isArray(nextCustomNodes) ? { customNodes: nextCustomNodes } : {}),
                ...(typeof (proConfig as any).hasAccess === 'boolean' && (proConfig as any).hasAccess
                    ? {
                        enableCustomNodes: Boolean((nextConfig as any).enableCustomNodes || (proConfig as any).enableCustomNodes),
                        enableTemplates: Boolean((nextConfig as any).enableTemplates || (proConfig as any).enableTemplates),
                    }
                    : {}),
            });
        };

        syncRuntimeConfig();

        if (typeof window === 'undefined') {
            return;
        }

        const handleRuntimeConfigUpdate = () => syncRuntimeConfig();
        window.addEventListener('nodelogic-graph-builder-config-updated', handleRuntimeConfigUpdate as EventListener);
        return () => {
            window.removeEventListener('nodelogic-graph-builder-config-updated', handleRuntimeConfigUpdate as EventListener);
        };
    }, []);

    useEffect(() => {
        const canvasEl = canvasRef.current;
        if (!canvasEl) {
            return;
        }

        const onWheel = (event: WheelEvent) => handleWheel(event);
        canvasEl.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            canvasEl.removeEventListener('wheel', onWheel);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const wpAny = (window as any).wp;
        const dataApi = wpAny?.data;
        const selectStore = dataApi?.select?.('core/block-editor');
        if (!selectStore?.getBlocks || !dataApi?.subscribe) {
            return;
        }

        const syncDetectedElements = () => {
            const nextDetectedElements = collectDetectedElementsFromBlocks(selectStore.getBlocks());
            const nextSignature = nextDetectedElements
                .map((item) => `${item.id}:${item.type}:${item.name}:${(item.outputs || []).map((output) => `${output.name}:${output.type}`).join(',')}`)
                .join('|');
            if (nextSignature !== detectedElementsSignatureRef.current) {
                detectedElementsSignatureRef.current = nextSignature;
                setDetectedElements(nextDetectedElements);
            }
        };

        syncDetectedElements();
        const unsubscribe = dataApi.subscribe(syncDetectedElements);

        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, []);

    const runtimeConfig = runtimeConfigState || {};
    const templateToolsEnabled = Boolean(showTemplateTools && Boolean(runtimeConfig.enableTemplates));
    // Logic graphs use explicit Output nodes. The legacy main block remains only
    // for template and custom-node editors where it still represents their root.
    const shouldRenderMainBlock = customNodeMode || templateMode;
    const configuredCustomNodes = React.useMemo(
        () => (Array.isArray((runtimeConfig as any).customNodes) ? (runtimeConfig as any).customNodes : []),
        [runtimeConfigState]
    );
    const customNodeLibraryEnabled = Boolean(customNodeMode || runtimeConfig.enableCustomNodes || configuredCustomNodes.length > 0);
    const getCustomNodeRecordById = React.useCallback(
        (customNodeId?: string) => {
            const id = String(customNodeId || '').trim();
            if (!id) return null;
            return configuredCustomNodes.find((node: any) => String(node?.id || '').trim() === id) || null;
        },
        [configuredCustomNodes]
    );
    const getCustomNodeUiFieldSchema = React.useCallback((customNodeId?: string): ArrayItemSchemaField[] => {
        const record = getCustomNodeRecordById(customNodeId);
        const customUi = normalizeCustomNodeUiState(record?.state?.customNodeUi || record?.customNodeUi || null);
        const sharedVariables = Array.isArray(customUi?.sharedVariables) ? customUi.sharedVariables : [];
        return sharedVariables
            .map((item, index) => {
                const fieldLabel = String(item?.label || item?.path || item?.id || '').trim();
                if (!fieldLabel) {
                    return null;
                }
                return normalizeArraySchemaItem(
                    {
                        id: String(item?.id || '').trim() || `field-${index + 1}`,
                        label: fieldLabel,
                        type: item?.type === 'number' || item?.type === 'string' || item?.type === 'boolean' || item?.type === 'color' || item?.type === 'zip' || item?.type === 'case' ? item.type : 'string',
                        sourceNodeId: String(item?.sourceNodeId || '').trim() || undefined,
                        sourcePin: String(item?.path || '').trim() || undefined,
                    },
                    index,
                    fieldLabel
                );
            })
            .filter(Boolean) as ArrayItemSchemaField[];
    }, [getCustomNodeRecordById]);
    const getCustomNodeInputSchema = React.useCallback((customNodeId?: string): ArrayItemSchemaField[] => {
        const record = getCustomNodeRecordById(customNodeId);
        const inputSchema = Array.isArray(record?.inputSchema) ? record.inputSchema : [];
        return inputSchema
            .map((entry: any, index: number) => normalizeArraySchemaItem(
                entry,
                index,
                String(entry?.label || entry?.id || `Input ${index + 1}`)
            ))
            .filter(Boolean) as ArrayItemSchemaField[];
    }, [getCustomNodeRecordById]);
    const getCustomNodeOutputSchema = React.useCallback((customNodeId?: string): ArrayItemSchemaField[] => {
        const record = getCustomNodeRecordById(customNodeId);
        const explicitOutputSchema = Array.isArray(record?.outputSchema) ? record.outputSchema : [];
        if (explicitOutputSchema.length > 0) {
            return explicitOutputSchema
                .map((entry: any, index: number) => normalizeArraySchemaItem(
                    entry,
                    index,
                    String(entry?.label || entry?.id || `Output ${index + 1}`)
                ))
                .filter(Boolean) as ArrayItemSchemaField[];
        }
        return getCustomNodeUiFieldSchema(customNodeId);
    }, [getCustomNodeRecordById, getCustomNodeUiFieldSchema]);
    const getApiListMapperSchema = React.useCallback((element: CanvasElement): ArrayItemSchemaField[] => {
        const rawItemType = String(element.data?.apiListItemType || 'string').trim().toLowerCase();
        const itemType = rawItemType === 'case'
            ? 'zip'
            : rawItemType;

        if (itemType === 'zip') {
            const customNodeFields = getCustomNodeInputSchema(element.data?.apiListCustomNodeId);
            if (customNodeFields.length > 0) {
                return customNodeFields;
            }
            const storedMappings = Array.isArray(element.data?.apiListFieldMappings)
                ? element.data.apiListFieldMappings
                : [];
            return storedMappings
                .map((mapping, index) => normalizeArraySchemaItem(
                    {
                        id: String(mapping?.fieldId || '').trim() || `field-${index + 1}`,
                        label: String(mapping?.fieldId || '').trim() || `Field ${index + 1}`,
                        type: 'string',
                        sourceNodeId: element.id,
                        sourcePin: String(mapping?.path || '').trim() || undefined,
                    },
                    index,
                    String(mapping?.fieldId || '').trim() || `Field ${index + 1}`
                ))
                .filter(Boolean) as ArrayItemSchemaField[];
        }

        if (itemType === 'chart-data') {
            const labelField = String(element.data?.apiListLabelField || 'label').trim() || 'label';
            const valueField = String(element.data?.apiListValueField || 'value').trim() || 'value';
            return [
                normalizeArraySchemaItem(
                    {
                        id: labelField,
                        label: labelField,
                        type: 'string',
                        sourceNodeId: element.id,
                        sourcePin: labelField,
                    },
                    0,
                    labelField
                ),
                normalizeArraySchemaItem(
                    {
                        id: valueField,
                        label: valueField,
                        type: 'number',
                        sourceNodeId: element.id,
                        sourcePin: valueField,
                    },
                    1,
                    valueField
                ),
            ].filter(Boolean) as ArrayItemSchemaField[];
        }

        const valueField = String(element.data?.apiListValueField || '').trim() || 'value';
        return [
            normalizeArraySchemaItem(
                {
                    id: valueField,
                    label: valueField,
                    type: itemType as ArrayItemType,
                    sourceNodeId: element.id,
                    sourcePin: valueField,
                },
                0,
                valueField
            ),
        ];
    }, [getCustomNodeUiFieldSchema, getCustomNodeInputSchema]);
    const sidebarTreeData = React.useMemo(() => {
        const runtimeWindow = typeof window !== 'undefined' ? (window as GraphEditorRuntimeWindow) : undefined;
        const baseTreeData = Array.isArray(runtimeWindow?.nodelogicGraphBuilderBaseTreeData) && runtimeWindow.nodelogicGraphBuilderBaseTreeData.length > 0
            ? runtimeWindow.nodelogicGraphBuilderBaseTreeData
            : TREE_DATA;
        const runtimeTreeData = Array.isArray(runtimeConfigState.treeData) && runtimeConfigState.treeData.length > 0
            ? runtimeConfigState.treeData
            : Array.isArray(runtimeConfigState.extraTreeData) && runtimeConfigState.extraTreeData.length > 0
                ? runtimeConfigState.extraTreeData
                : [];
        const mergedTree = mergeTreeData(baseTreeData as TreeItem[], runtimeTreeData as TreeItem[]);
        const customNodeFolderChildren: TreeItem[] = configuredCustomNodes
            .map((node: any) => {
                const nodeId = String(node?.id || '').trim();
                if (!nodeId) {
                    return null;
                }
                return {
                    id: `custom-node-${nodeId}`,
                    name: String(node?.name || nodeId || 'Custom Node').trim() || 'Custom Node',
                    type: 'custom-node',
                    customNodeId: nodeId,
                } as TreeItem;
            })
            .filter(Boolean) as TreeItem[];
        if (!customNodeLibraryEnabled || customNodeFolderChildren.length === 0) {
            return mergedTree;
        }
        return [
            ...mergedTree,
            {
                id: 'custom-node-folder',
                name: 'Custom Nodes',
                type: 'folder',
                children: customNodeFolderChildren,
            } as TreeItem,
        ];
    }, [configuredCustomNodes, customNodeLibraryEnabled, runtimeConfigState]);

    const visibleSidebarTreeData = React.useMemo(() => {
        const query = sidebarSearch.trim().toLowerCase();
        if (!query) {
            return sidebarTreeData;
        }

        const filterTree = (items: TreeItem[]): TreeItem[] => items
            .map((item) => {
                const matchesName = item.name.toLowerCase().includes(query);
                const filteredChildren = Array.isArray(item.children) ? filterTree(item.children) : [];
                if (matchesName || filteredChildren.length > 0) {
                    return {
                        ...item,
                        children: filteredChildren,
                    };
                }
                return null;
            })
            .filter(Boolean) as TreeItem[];

        return filterTree(sidebarTreeData);
    }, [sidebarSearch, sidebarTreeData]);
    const createDefaultMainBlock = (): CanvasElement => ({
        id: 'main-block',
        name: 'Html Element',
        type: 'main',
        x: 0,
        y: 0,
        data: { formula: '' },
        connections: []
    });
    const [elements, setElements] = useState<CanvasElement[]>(() => (
        shouldRenderMainBlock ? [createDefaultMainBlock()] : []
    ));

    // ── Undo / Redo ────────────────────────────────────────────────────────────
    type HistoryEntry = { elements: CanvasElement[]; connections: Connection[] };
    const undoStackRef = useRef<HistoryEntry[]>([]);
    const redoStackRef = useRef<HistoryEntry[]>([]);
    const MAX_HISTORY = 50;

    const pushHistory = (els: CanvasElement[], conns: Connection[]) => {
        undoStackRef.current = [
            ...undoStackRef.current.slice(-MAX_HISTORY + 1),
            { elements: JSON.parse(JSON.stringify(els)), connections: JSON.parse(JSON.stringify(conns)) },
        ];
        redoStackRef.current = [];
    };

    const handleUndo = () => {
        if (undoStackRef.current.length === 0) return;
        const current: HistoryEntry = {
            elements: JSON.parse(JSON.stringify(elementsRef.current)),
            connections: JSON.parse(JSON.stringify(connectionsRef.current)),
        };
        redoStackRef.current = [...redoStackRef.current, current];
        const prev = undoStackRef.current[undoStackRef.current.length - 1];
        undoStackRef.current = undoStackRef.current.slice(0, -1);
        const restored = updateElementValueTypes(prev.elements, prev.connections);
        setElements(restored);
        elementsRef.current = restored;
        setConnections(prev.connections);
        connectionsRef.current = prev.connections;
        markGraphDirty();
    };

    const handleRedo = () => {
        if (redoStackRef.current.length === 0) return;
        const current: HistoryEntry = {
            elements: JSON.parse(JSON.stringify(elementsRef.current)),
            connections: JSON.parse(JSON.stringify(connectionsRef.current)),
        };
        undoStackRef.current = [...undoStackRef.current, current];
        const next = redoStackRef.current[redoStackRef.current.length - 1];
        redoStackRef.current = redoStackRef.current.slice(0, -1);
        const restored = updateElementValueTypes(next.elements, next.connections);
        setElements(restored);
        elementsRef.current = restored;
        setConnections(next.connections);
        connectionsRef.current = next.connections;
        markGraphDirty();
    };
    // ───────────────────────────────────────────────────────────────────────────
    const [selected, setSelected] = useState<string | null>(shouldRenderMainBlock ? 'main-block' : null);
    const [draggedItem, setDraggedItem] = useState<TreeItem | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [isDraggingFromSidebar, setIsDraggingFromSidebar] = useState(false);
    const [isDraggingElement, setIsDraggingElement] = useState(false);
    const [draggedElementId, setDraggedElementId] = useState<string | null>(null);
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
        reconnectingConnection?: Connection | null;
    } | null>(null);
    const [isDraggingCanvasElement, setIsDraggingCanvasElement] = useState(false);
    const [dragPreview, setDragPreview] = useState<{ x: number; y: number; name: string } | null>(null);
    // Predictive delta tracking for smooth pin positions during drag/pan/zoom
    const [dragElementDelta, setDragElementDelta] = useState<{elementId: string; deltaX: number; deltaY: number} | null>(null);
    const [zoomDelta, setZoomDelta] = useState(1);
    const [offsetDelta, setOffsetDelta] = useState({ x: 0, y: 0 });
    const [canvasViewport, setCanvasViewport] = useState({ width: 0, height: 0 });

    const [formula, setFormula] = useState<string>("");
    const [customNodeUi, setCustomNodeUi] = useState<CustomNodeUiState | null>(null);
    const [cssEditorNodeId, setCssEditorNodeId] = useState<string | null>(null);
    const [templates, setTemplates] = useState<GraphTemplateItem[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [templateInfo, setTemplateInfo] = useState('');
    const [floatingNotice, setFloatingNotice] = useState('');
    const [isTemplateBusy, setIsTemplateBusy] = useState(false);
    const [recoverableDraftState, setRecoverableDraftState] = useState<SavedState | null>(null);
    const [pendingDraftRecovery, setPendingDraftRecovery] = useState<SavedState | null>(null);
    const [showDraftRecoveryNotice, setShowDraftRecoveryNotice] = useState(false);
    const [calcFlowByNode, setCalcFlowByNode] = useState<Record<string, CalcFlowSegment[]>>({});
    // Element Property: live-detected properties per element-property node id.
    // Serializable only (no DOM refs). Populated by an effect from previewResolver.
    const [elementPropertyDetections, setElementPropertyDetections] = useState<Record<string, DetectedElementProperty[]>>({});
    // Bumped when the editor preview DOM mutates, to re-run detection.
    const [previewDomVersion, setPreviewDomVersion] = useState(0);
    // UI-only (never persisted): which custom property lists are expanded.
    const [customPropertyListExpanded, setCustomPropertyListExpanded] = useState<Set<string>>(new Set());
    // UI-only: in-progress "add custom property" text per node id.
    const [customPropertyDraft, setCustomPropertyDraft] = useState<Record<string, string>>({});
    // Get Children: live-detected direct children per get-children node id.
    const [elementChildrenDetections, setElementChildrenDetections] = useState<Record<string, DetectedChild[]>>({});

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
    const floatingNoticeTimeoutRef = useRef<number | null>(null);
    const lastPanPointRef = useRef({ x: 0, y: 0 });
    const draggedItemRef = useRef<TreeItem | null>(draggedItem);
    const canvasMouseMoveRafRef = useRef<number | null>(null);
    const pendingCanvasMouseRef = useRef<{ x: number; y: number } | null>(null);
    const detectedElementsSignatureRef = useRef('');
    const calculationOperatorCountRef = useRef<Record<string, number>>({});
    const elementPropertyDetectionsRef = useRef<Record<string, DetectedElementProperty[]>>({});
    const elementPropertyDetectionSignatureRef = useRef('');
    const customPropertyListExpandedRef = useRef<Set<string>>(customPropertyListExpanded);
    const elementChildrenDetectionsRef = useRef<Record<string, DetectedChild[]>>({});
    const elementChildrenDetectionSignatureRef = useRef('');

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
    const apiListMapperScrollLockRef = useRef(false);
    const connectionInProgressRef = useRef<typeof connectionInProgress>(null);
    const elementsRef = useRef(elements);
    const selectedRef = useRef(selected);
    const detectedElementsRef = useRef(detectedElements);
    const zoomRef = useRef(zoom);
    const offsetXRef = useRef(offsetX);
    const offsetYRef = useRef(offsetY);
    const connectionsRef = useRef(connections);
    const formulaRef = useRef(formula);
    const customNodeUiRef = useRef(customNodeUi);
    const hasInitializedRef = useRef(false);
    const onStateChangeRef = useRef<GraphEditorProps['onStateChange']>(onStateChange);
    const isStateLoadedRef = useRef(isStateLoaded);
    const draftRecoveryCheckedRef = useRef(false);
    const previousElementsCountRef = useRef(elements.length);
    // Previous values for delta calculation
    const prevZoomRef = useRef(zoom);
    const prevOffsetXRef = useRef(offsetX);
    const prevOffsetYRef = useRef(offsetY);
    // Refs for delta state to use in pin calculations
    const dragElementDeltaRef = useRef<{elementId: string; deltaX: number; deltaY: number} | null>(null);
    const zoomDeltaRef = useRef(1);
    const offsetDeltaRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const updateViewport = () => {
            setCanvasViewport({ width: canvas.clientWidth, height: canvas.clientHeight });
        };

        updateViewport();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(updateViewport);
            observer.observe(canvas);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', updateViewport);
        return () => window.removeEventListener('resize', updateViewport);
    }, []);

    const handleTreeToggleFolder = (itemId: string) => {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    const handleTreeStartDrag = (event: React.MouseEvent, item: TreeItem) => {
        if (item.type === 'folder') {
            handleTreeToggleFolder(item.id);
            return;
        }

        setDraggedItem(item);
        draggedItemRef.current = item;
        setIsDraggingFromSidebar(true);
        isDraggingFromSidebarRef.current = true;
        setDragPreview(null);
        sidebarDragRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            item,
        };
        event.preventDefault();
        event.stopPropagation();
    };

    const isNodeLockedForCurrentPlan = (_item: TreeItem) => false;

    const syncConnectionsAndTypes = (nextConnections: Connection[], pushUndo = true) => {
        if (pushUndo) pushHistory(elementsRef.current, connectionsRef.current);
        setConnections(nextConnections);
        connectionsRef.current = nextConnections;
        setElements((prev) => updateElementValueTypes(prev, nextConnections));
    };

    const arePinTypesCompatible = (
        sourceType: CanvasElement['valueType'] | undefined,
        targetAcceptedTypes: Array<'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event' | 'array' | 'action' | 'element'>
    ): boolean => {
        if (!sourceType) {
            return false;
        }

        if (targetAcceptedTypes.includes(sourceType as any)) {
            return true;
        }

        if (sourceType === 'css-unit' && (targetAcceptedTypes.includes('css') || targetAcceptedTypes.includes('string'))) {
            return true;
        }

        if (sourceType === 'zip' && (targetAcceptedTypes.includes('number') || targetAcceptedTypes.includes('string') || targetAcceptedTypes.includes('array'))) {
            return true;
        }

        if (sourceType === 'action' && targetAcceptedTypes.includes('action')) {
            return true;
        }

        if (sourceType === 'case' && (targetAcceptedTypes.includes('number') || targetAcceptedTypes.includes('string') || targetAcceptedTypes.includes('boolean') || targetAcceptedTypes.includes('color'))) {
            return true;
        }

        if (sourceType === 'color' && targetAcceptedTypes.includes('string')) {
            return true;
        }

        return false;
    };

    const clearConnectionDrag = (restoreReconnectedConnection: boolean) => {
        const dragState = connectionInProgressRef.current;
        if (restoreReconnectedConnection && dragState?.reconnectingConnection) {
            const restored = dragState.reconnectingConnection;
            const nextConnections = connectionsRef.current.some((connection) => connection.id === restored.id)
                ? connectionsRef.current
                : [...connectionsRef.current, restored];
            syncConnectionsAndTypes(nextConnections);
        }

        setConnectionInProgress(null);
        connectionInProgressRef.current = null;
    };

    elementsRef.current = elements;
    selectedRef.current = selected;
    detectedElementsRef.current = detectedElements;
    elementPropertyDetectionsRef.current = elementPropertyDetections;
    customPropertyListExpandedRef.current = customPropertyListExpanded;
    elementChildrenDetectionsRef.current = elementChildrenDetections;
    zoomRef.current = zoom;
    offsetXRef.current = offsetX;
    offsetYRef.current = offsetY;
    connectionsRef.current = connections;
    formulaRef.current = formula;
    customNodeUiRef.current = customNodeUi;
    draggedItemRef.current = draggedItem;
    isDraggingFromSidebarRef.current = isDraggingFromSidebar;
    isDraggingCanvasElementRef.current = isDraggingCanvasElement;
    isPanningRef.current = isPanning;
    connectionInProgressRef.current = connectionInProgress;
    dragElementDeltaRef.current = dragElementDelta;
    zoomDeltaRef.current = zoomDelta;
    offsetDeltaRef.current = offsetDelta;

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

    const connectionsByTargetElement = React.useMemo(() => {
        const map = new Map<string, Connection[]>();
        connections.forEach((connection) => {
            const current = map.get(connection.toId) || [];
            current.push(connection);
            map.set(connection.toId, current);
        });
        return map;
    }, [connections]);

    const normalizeArraySchemaItem = (
        field: unknown,
        index: number,
        fallbackLabel: string
    ): ArrayItemSchemaField | null => {
        if (!field || typeof field !== 'object') return null;
        const item = field as Partial<ArrayItemSchemaField>;
        const normalizedType = item.type === 'number'
            || item.type === 'string'
            || item.type === 'boolean'
            || item.type === 'color'
            || item.type === 'zip'
            || item.type === 'case'
            ? item.type
            : 'string';
        const label = typeof item.label === 'string' && item.label.trim().length > 0
            ? item.label.trim()
            : fallbackLabel;
        const id = typeof item.id === 'string' && item.id.trim().length > 0
            ? item.id.trim()
            : label || `field-${index + 1}`;
        return {
            id,
            label,
            type: normalizedType,
            sourceNodeId: typeof item.sourceNodeId === 'string' && item.sourceNodeId.trim().length > 0 ? item.sourceNodeId.trim() : undefined,
            sourcePin: typeof item.sourcePin === 'string' && item.sourcePin.trim().length > 0 ? item.sourcePin.trim() : undefined,
        };
    };

    const normalizeChartDataNodeData = (data: CanvasElement['data'] | undefined) => {
        const chartDataTypeCarrier = !!data?.chartDataTypeCarrier;
        const chartDataLabel = String(data?.chartDataLabel ?? 'label');
        const chartDataValueText = String(data?.chartDataValueText ?? data?.chartDataValue ?? '0');
        const chartDataValueNumber = Number(data?.chartDataValue ?? 0);
        const chartDataValue = Number.isFinite(chartDataValueNumber) ? chartDataValueNumber : 0;

        return {
            chartDataTypeCarrier,
            chartDataLabel,
            chartDataValueText,
            chartDataValue,
        };
    };

    const getArrayItemSchemaFromElement = (element?: CanvasElement | null): ArrayItemSchemaField[] => {
        if (!element) return [];
        if (element.type === 'array' && Array.isArray(element.data?.arrayItemSchema)) {
            return element.data.arrayItemSchema
                .map((item, index) => normalizeArraySchemaItem(item, index, `Field ${index + 1}`))
                .filter(Boolean) as ArrayItemSchemaField[];
        }

        if (element.type === 'custom-node') {
            const schema = Array.isArray(element.data?.customOutputSchema) && element.data.customOutputSchema.length > 0
                ? element.data.customOutputSchema
                : getCustomNodeOutputSchema(element.data?.customNodeId);
            return schema
                .map((item, index) => normalizeArraySchemaItem(item, index, item?.label || `Output ${index + 1}`))
                .filter(Boolean) as ArrayItemSchemaField[];
        }

        if (element.type === 'chart-data') {
            return [
                { id: 'label', label: 'label', type: 'string', sourceNodeId: element.id, sourcePin: 'label' },
                { id: 'value', label: 'value', type: 'number', sourceNodeId: element.id, sourcePin: 'value' },
            ];
        }

        if (element.type === 'unzip') {
            const schema = Array.isArray(element.data?.customOutputSchema) && element.data.customOutputSchema.length > 0
                ? element.data.customOutputSchema
                : getCustomNodeOutputSchema(element.data?.customNodeId);
            return schema
                .map((item, index) => normalizeArraySchemaItem(item, index, item?.label || `Output ${index + 1}`))
                .filter(Boolean) as ArrayItemSchemaField[];
        }

        if (element.type === 'api-list-mapper') {
            return getApiListMapperSchema(element);
        }

        return Array.isArray(element.data?.arrayItemSchema)
            ? element.data.arrayItemSchema
                .map((item, index) => normalizeArraySchemaItem(item, index, `Field ${index + 1}`))
                .filter(Boolean) as ArrayItemSchemaField[]
            : [];
    };

    const getArraySortFieldOptions = (element: CanvasElement): ArrayItemSchemaField[] => {
        const sourceConnection = connectionsByTargetInput.get(getConnectionLookupKey(element.id, 'input0'));
        if (!sourceConnection) return [];
        const sourceElement = elementsById.get(sourceConnection.fromId);
        const schema = getArrayItemSchemaFromElement(sourceElement);
        if (schema.length > 0) return schema;
        if (sourceElement?.type === 'array' && sourceElement.data?.arrayItemType === 'zip') {
            return [
                { id: 'label', label: 'label', type: 'string', sourceNodeId: sourceElement.id, sourcePin: 'label' },
                { id: 'value', label: 'value', type: 'zip', sourceNodeId: sourceElement.id, sourcePin: 'value' },
            ];
        }
        return [];
    };

    const pendingDraftLabel = React.useMemo(() => {
        const draft = pendingDraftRecovery || recoverableDraftState || autosaveState || savedState;
        if (!draft?.updatedAt) {
            return '';
        }
        try {
            return new Date(draft.updatedAt).toLocaleString();
        } catch {
            return '';
        }
    }, [pendingDraftRecovery, recoverableDraftState, autosaveState, savedState]);

    const getInputIndex = (inputName: string): number => {
        const match = /input(\d+)/.exec(String(inputName || ''));
        return match ? Number(match[1]) : -1;
    };

    const getMainValueAcceptedTypes = (): Array<'number' | 'string' | 'boolean'> => {
        if (mainElementType === 'range' || mainElementType === 'seekbar' || mainElementType === 'number') {
            return ['number'];
        }
        if (mainElementType === 'checkbox') {
            return ['boolean'];
        }
        return ['number', 'string', 'boolean'];
    };

    const normalizeGradientColorCount = (
        rawCount: unknown,
        fallback: number = GRADIENT_DEFAULT_COLORS.length
    ): number => {
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

        if (rawArray.length > 0) {
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
    ): Array<'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event' | 'array' | 'action' | 'element'> => {
        if (element.type === 'event-processor' && inputIndex === 0) {
            return ['event'];
        }
        if (
            (element.type === 'event-element' || element.type === 'event-id' || element.type === 'event-hover' || element.type === 'event-scroll')
            && inputIndex === 0
        ) {
            return ['element'];
        }
        if (
            element.type === 'action-event'
            || element.type === 'action-block'
            || element.type === 'action-if'
            || element.type === 'action-required'
            || element.type === 'action-min'
            || element.type === 'action-max'
            || element.type === 'action-length'
            || element.type === 'action-regex'
            || element.type === 'action-add-class'
            || element.type === 'action-remove-class'
            || element.type === 'action-toggle-class'
        ) {
            if (inputIndex === 0) return ['action'];
            // Element input pin: an optional, additive 2nd pin so the node can
            // operate on a dynamically wired live reference instead of only
            // its own Element ID control -- never conflicts with pin 0, which
            // stays the existing 'action' attach-to-parent slot.
            if (element.type === 'action-event' && inputIndex === 1) return ['element'];
            if (element.type === 'action-required') return ['boolean'];
            if (element.type === 'action-min' || element.type === 'action-max' || element.type === 'action-length') return ['number'];
            return ['string'];
        }

        if (element.type === 'custom-node') {
            const schema = Array.isArray(element.data?.customInputSchema) ? element.data?.customInputSchema : [];
            const schemaPin = schema[inputIndex];
            if (!schemaPin) return ['number'];
            const pinType = schemaPin.type;
            return (pinType === 'string' || pinType === 'boolean' || pinType === 'color' || pinType === 'zip' || pinType === 'case')
                ? [pinType]
                : ['number'];
        }

        if (element.type === 'unzip') {
            if (inputIndex === 0) return ['zip'];
            return ['number'];
        }

        if (element.type === 'output') {
            // Pin 0 is the new "Element" target input (except in custom-node mode,
            // where Output pins are label slots). Value pins follow, shifted by 1.
            if (!customNodeMode && inputIndex === 0) {
                return ['element'];
            }
            const valueIndex = customNodeMode ? inputIndex : inputIndex - 1;
            const outputAccepted: Array<Array<'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'array' | 'action'>> = [
                ['number', 'string', 'boolean', 'color', 'zip', 'array'],
                ['color', 'string'],
                ['color', 'string'],
                ['boolean'],
                ['css', 'string'],
            ];
            return (outputAccepted[valueIndex] || ['number']) as Array<'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event' | 'array' | 'action' | 'element'>;
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
            return ['number'];
        }

        if (element.type === 'array') {
            if (customNodeLibraryEnabled) {
                return inputIndex === 0
                    ? ['number', 'string', 'boolean', 'color', 'zip', 'element']
                    : ['zip'];
            }
            return ['number', 'string', 'boolean', 'color', 'zip', 'case', 'array', 'element'];
        }
        if (element.type === 'array-push') {
            return inputIndex === 0 ? ['array'] : ['number', 'string', 'boolean', 'color', 'zip', 'case', 'array', 'element'];
        }
        if (element.type === 'array-pop' || element.type === 'array-sort') {
            return ['array'];
        }
        if (element.type === 'array-remove-index') {
            return inputIndex === 0 ? ['array'] : ['number'];
        }
        if (element.type === 'array-replace-index') {
            if (inputIndex === 0) return ['array'];
            if (inputIndex === 1) return ['number'];
            return ['number', 'string', 'boolean', 'color', 'zip', 'case', 'array', 'element'];
        }
        if (element.type === 'image-from-link') {
            return ['string'];
        }
        if (element.type === 'image-from-element') {
            return ['string', 'zip'];
        }
        if (element.type === 'api-request' || element.type === 'api-status') {
            return inputIndex === 0 ? ['string'] : ['zip'];
        }
        if (element.type === 'api-field') {
            if (inputIndex === 0) return ['zip'];
            if (inputIndex === 1) return ['string'];
            return ['string'];
        }
        if (element.type === 'api-list-mapper') {
            return ['zip'];
        }

        if (element.type === 'chart-data') {
            return inputIndex === 0 ? ['string'] : ['number'];
        }
        if (element.type === 'element-property') {
            return ['element'];
        }
        if (element.type === 'get-children') {
            return ['element'];
        }

        const acceptedByIndex: Record<string, Array<Array<'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event' | 'array' | 'action' | 'element'>>> = {
            calculation: [['number']],
            element: [],
            condition: [
                ['number', 'string', 'boolean'],
                ['number', 'string', 'boolean'],
            ],
            case: [
                ['number', 'string', 'boolean'],
                ['number', 'string', 'boolean', 'color'],
            ],
            'case-range': [
                ['number'],
                ['number'],
                ['number', 'string', 'boolean', 'color', 'zip', 'css'],
            ],
            'case-value': [
                ['number', 'string', 'boolean'],
                ['number', 'string', 'boolean', 'color', 'zip', 'css'],
            ],
            'case-default': [
                ['number', 'string', 'boolean', 'color', 'zip', 'css'],
            ],
            switch: [
                ['number', 'string', 'boolean'],
                ['case'],
            ],
            node: [
                ['boolean'],
                ['number', 'string', 'boolean', 'color', 'zip', 'css'],
                ['number', 'string', 'boolean', 'color', 'zip', 'css'],
            ],
            regex: [['string']],
            concat: [['string'], ['string']],
            'cut-a': [['string'], ['string']],
            'cut-b': [['string'], ['number']],
            'cut-c': [['string'], ['number'], ['number']],
            'string-count-chars': [['string']],
            'string-count-words': [['string']],
            'string-find-start': [['string'], ['string']],
            'string-find-end': [['string'], ['string']],
            'string-to-number': [['string']],
            'number-to-string': [['number']],
            'bool-count': [['boolean']],
            color: [],
            gradient: [
                ['color', 'string'],
                ['color', 'string'],
                ['color', 'string'],
                ['number'],
            ],
            'string-split': [['string']],
            'string-replace': [['string']],
            'string-trim': [['string']],
            'string-upper': [['string']],
            'string-lower': [['string']],
            'string-includes': [['string'], ['string']],
            'number-parse': [['string']],
            'number-to-base': [['number']],
            'multi-concat': [['string']],
            'css-unit': [['number', 'string']],
            'css-margin': [['number', 'string'], ['number', 'string'], ['number', 'string'], ['number', 'string']],
            'css-padding': [['number', 'string'], ['number', 'string'], ['number', 'string'], ['number', 'string']],
            'css-width': [['number', 'string']],
            'css-height': [['number', 'string']],
            'css-font-size': [['number', 'string']],
            'css-display': [],
            'css-color': [['color', 'string']],
            'css-text': [],
            'css-join': [['css', 'string']],
            not: [['boolean']],
            and: [['boolean'], ['boolean']],
            or: [['boolean'], ['boolean']],
            fallback: [['number', 'string', 'boolean', 'color', 'zip', 'css', 'array'], ['number', 'string', 'boolean', 'color', 'zip', 'css', 'array']],
            clamp: [['number'], ['number'], ['number']],
            'min-val': [['number'], ['number']],
            'max-val': [['number'], ['number']],
            math: [['number']],
            operator: [['number'], ['number']],
            comparison: [['number'], ['number']],
            logic: [['boolean'], ['number', 'string', 'boolean', 'color', 'zip', 'css'], ['number', 'string', 'boolean', 'color', 'zip', 'css']],
            'memory-write-number': [['number'], ['boolean']],
            'memory-write-string': [['string'], ['boolean']],
            'memory-write-boolean': [['boolean'], ['boolean']],
            'memory-read-number': [],
            'memory-read-string': [],
            'memory-read-boolean': [],
            'memory-has': [],
            'memory-delete': [['boolean']],
            'memory-increment': [['boolean']],
            'memory-array-append': [['number', 'string', 'boolean', 'color', 'zip', 'css'], ['boolean']],
            'memory-array-remove': [['number', 'string', 'boolean', 'color', 'zip', 'css'], ['boolean']],
            'event-element': [],
            'event-id': [],
            'event-processor': [['event'], ['string', 'number', 'boolean', 'color', 'zip', 'array']],
            'action-required': [['action'], ['boolean']],
            'action-min': [['action'], ['number']],
            'action-max': [['action'], ['number']],
            'action-length': [['action'], ['number'], ['number']],
            'action-regex': [['action'], ['string']],
            'action-add-class': [['action'], ['string']],
            'action-remove-class': [['action'], ['string']],
            'action-toggle-class': [['action'], ['string']],
            // New action nodes — input0 = action chain, input1 = value
            'action-set-text': [['action'], ['string']],
            'action-set-html': [['action'], ['string']],
            'action-set-value': [['action'], ['number', 'string', 'boolean']],
            'action-set-attr': [['action'], ['string', 'number', 'boolean']],
            'action-set-style': [['action'], ['string', 'css', 'css-unit']],
            'action-set-visibility': [['action']],
            'action-enable': [['action']],
            'action-disable': [['action']],
            'action-focus': [['action']],
            'action-scroll-to': [['action']],
            'action-notify': [['action'], ['string']],
            'action-redirect': [['action'], ['string']],
            'action-trigger-event': [['action'], ['string']],
            'action-if': [['action'], ['boolean']],
            // New event nodes — no inputs
            'event-hover': [],
            'event-scroll': [],
            'event-page-load': [],
            'event-timer': [],
            'event-custom': [],
            'node-branch': [['boolean'], ['number', 'string', 'boolean', 'color', 'zip', 'array'], ['number', 'string', 'boolean', 'color', 'zip', 'array']],
            'switch-branch': [['number', 'string', 'boolean', 'color', 'zip', 'array'], ['number', 'string', 'boolean', 'color', 'zip', 'array'], ['case']],
            // New array nodes. `element` is a first-class array item type
            // (Array<element> from Get Children), so every pin that carries an
            // array *item* accepts it alongside the primitive item types.
            'array-map': [['array'], ['number', 'string', 'boolean', 'color', 'zip', 'element']],
            'array-filter': [['array'], ['boolean']],
            'array-reduce': [['array']],
            'array-find': [['array'], ['number', 'string', 'boolean', 'element']],
            'array-for-each': [['array']],
            'array-collect': [['number', 'string', 'boolean', 'color', 'zip', 'element']],
            'array-contains': [['array'], ['number', 'string', 'boolean', 'element']],
            'array-length': [['array']],
            'array-merge': [['array'], ['array']],
            'array-unique': [['array']],
        };

        const accepted = acceptedByIndex[element.type] || [];
        const resolved = accepted[inputIndex] || accepted[accepted.length - 1] || ['number'];
        return resolved as Array<'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event' | 'array' | 'action' | 'element'>;
    };

    const getInputCount = (element: CanvasElement): number => {
        const incomingConnections = connectionsByTargetElement.get(element.id) || [];
        if (element.type === 'number') return 0;
        if (element.type === 'constant-boolean') return 0;
        if (element.type === 'constant-string') return 0;
        if (element.type === 'element') return 0;
        if (element.type === 'element-id') return 0;
        if (element.type === 'element-ref') return 0;
        if (element.type === 'element-property') return 1;
        if (element.type === 'get-children') return 1;
        if (element.type === 'memory-read-number') return 0;
        if (element.type === 'memory-read-string') return 0;
        if (element.type === 'memory-read-boolean') return 0;
        if (element.type === 'memory-write-number') return 2;
        if (element.type === 'memory-write-string') return 2;
        if (element.type === 'memory-write-boolean') return 2;
        if (element.type === 'memory-has') return 0;
        if (element.type === 'memory-delete') return 1; // optional Trigger input pin
        if (element.type === 'memory-increment') return 1; // optional Trigger input pin
        if (element.type === 'memory-array-append') return 2; // Item, optional Trigger
        if (element.type === 'memory-array-remove') return 2; // Item, optional Trigger
        if (element.type === 'event-element') return 1; // optional Element input pin
        if (element.type === 'event-id') return 1; // optional Element input pin
        if (element.type === 'event-processor') return 2;
        if (element.type === 'not') return 1;
        if (element.type === 'and') return 2;
        if (element.type === 'or') return 2;
        if (element.type === 'fallback') return 2;
        if (element.type === 'condition') return 2;
        if (element.type === 'regex') return 1;
        if (element.type === 'concat') return 2;
        if (element.type === 'cut-a') return 2;
        if (element.type === 'cut-b') return 2;
        if (element.type === 'cut-c') return 3;
        if (element.type === 'string-count-chars') return 1;
        if (element.type === 'string-count-words') return 1;
        if (element.type === 'string-find-start') return 2;
        if (element.type === 'string-find-end') return 2;
        if (element.type === 'string-to-number') return 1;
        if (element.type === 'number-to-string') return 1;
        if (element.type === 'bool-count') {
            const connectedInputIndexes = Array.from(new Set(incomingConnections
                .filter(c => c.toInput.startsWith('input'))
                .map(c => getInputIndex(c.toInput))
                .filter(i => !Number.isNaN(i))
            ));
            const highestConnectedIndex = connectedInputIndexes.length > 0 ? Math.max(...connectedInputIndexes) : -1;
            return Math.max(1, highestConnectedIndex + 1);
        }
        if (element.type === 'color') return 0;
        if (element.type === 'gradient') return getGradientColorCount(element) + 1;
        if (element.type === 'custom-node') {
            if (element.data?.customNodeTypeCarrier) return 0;
            const schema = Array.isArray(element.data?.customInputSchema) && element.data.customInputSchema.length > 0
                ? element.data.customInputSchema
                : getCustomNodeInputSchema(element.data?.customNodeId);
            return schema.length;
        }
        if (element.type === 'unzip') return 1;
        if (element.type === 'math') return 1;
        if (element.type === 'case-range') return connections.some(c => c.fromId === element.id && elements.find(candidate => candidate.id === c.toId)?.type === 'switch-branch') ? 2 : 3;
        if (element.type === 'case-value') return connections.some(c => c.fromId === element.id && elements.find(candidate => candidate.id === c.toId)?.type === 'switch-branch') ? 1 : 2;
        if (element.type === 'case-default') return 1;
        if (element.type === 'switch') {
            const defaultCaseConnection = incomingConnections.find((connection) => {
                if (getInputIndex(connection.toInput) <= 0) {
                    return false;
                }
                return elements.find((candidate) => candidate.id === connection.fromId)?.type === 'case-default';
            });
            if (defaultCaseConnection) {
                return getInputIndex(defaultCaseConnection.toInput) + 1;
            }
            const connectedCaseIndexes = Array.from(new Set(incomingConnections
                .filter(c => c.toInput.startsWith('input') && getInputIndex(c.toInput) > 0)
                .map(c => getInputIndex(c.toInput))
                .filter(i => !Number.isNaN(i))
            ));
            const highestConnectedIndex = connectedCaseIndexes.length > 0 ? Math.max(...connectedCaseIndexes) : 0;
            // Keep one empty Case pin after the last connected case so users can
            // continue branching without changing a setting first.
            return Math.max(2, highestConnectedIndex + 2);
        }
        if (element.type === 'switch-branch') {
            const caseConnections = incomingConnections.filter(c => c.toInput.startsWith('input') && getInputIndex(c.toInput) >= 2);
            const defaultConnection = caseConnections.find(c => elements.find(candidate => candidate.id === c.fromId)?.type === 'case-default');
            if (defaultConnection) return Math.max(3, getInputIndex(defaultConnection.toInput) + 1);
            const highestCaseIndex = caseConnections.reduce((max, connection) => Math.max(max, getInputIndex(connection.toInput)), 2);
            return Math.max(3, highestCaseIndex + 2);
        }
        if (element.type === 'node') return 3;
        if (element.type === 'node-branch') return 2;
        if (element.type === 'calculation') {
            const connectedInputIndexes = Array.from(new Set(connections
                .filter(c => c.toId === element.id && c.toInput.startsWith('input'))
                .map(c => getInputIndex(c.toInput))
                .filter(i => !Number.isNaN(i))
            ));
            const highestConnectedIndex = connectedInputIndexes.length > 0 ? Math.max(...connectedInputIndexes) : -1;
            return Math.max(1, highestConnectedIndex + 2);
        }
        if (element.type === 'main') {
            if (customNodeMode) {
                const connectedInputIndexes = Array.from(new Set(connections
                    .filter(c => c.toId === element.id && c.toInput.startsWith('input'))
                    .map(c => getInputIndex(c.toInput))
                    .filter(i => !Number.isNaN(i))
                ));
                const highestConnectedIndex = connectedInputIndexes.length > 0 ? Math.max(...connectedInputIndexes) : -1;
                return Math.max(1, highestConnectedIndex + 1);
            }
            if (mainElementType === 'logic') {
                const targets = Array.isArray(element.data?.logicTargets) ? element.data.logicTargets : [''];
                return Math.max(1, targets.length) * 4;
            }
            return isMainInputType ? 4 : 3;
        }
        if (element.type === 'constant' || element.type === 'variable') return 0;
        if (element.type === 'output') return outputPropertyNames.length + (customNodeMode ? 0 : 1);
        if (element.type === 'clamp') return 3;
        if (element.type === 'min-val' || element.type === 'max-val') return 2;
        if (element.type === 'string-split') return 1;
        if (element.type === 'string-replace') return 1;
        if (element.type === 'string-trim' || element.type === 'string-upper' || element.type === 'string-lower') return 1;
        if (element.type === 'string-includes') return 2;
        if (element.type === 'number-parse') return 1;
        if (element.type === 'number-to-base') return 1;
        if (element.type === 'multi-concat') {
            return Number.isFinite(Number(element.data?.inputCount)) ? Math.max(2, Math.min(8, Number(element.data.inputCount))) : 3;
        }
        if (element.type === 'css-join') {
            return Number.isFinite(Number(element.data?.inputCount)) ? Math.max(2, Math.min(8, Number(element.data.inputCount))) : 3;
        }
        if (element.type === 'css-unit') return 1;
        if (element.type === 'css-margin') return 4;
        if (element.type === 'css-padding') return 4;
        if (element.type === 'css-width') return 1;
        if (element.type === 'css-height') return 1;
        if (element.type === 'css-font-size') return 1;
        if (element.type === 'css-display') return 0;
        if (element.type === 'css-color') return 1;
        if (element.type === 'css-text') return 0;
        if (element.type === 'array') return 0;
        if (element.type === 'array-push') return 2;
        if (element.type === 'array-pop') return 1;
        if (element.type === 'array-sort') return 1;
        if (element.type === 'array-remove-index') return 2;
        if (element.type === 'array-replace-index') return 3;
        if (element.type === 'action-event') return 2; // input0: attach-to-parent ('action'); input1: optional Element pin
        if (element.type === 'action-block') return 1;
        if (element.type === 'action-if') return 2;
        if (element.type === 'action-required') return 2;
        if (element.type === 'action-min' || element.type === 'action-max') return 2;
        if (element.type === 'action-length') return 3;
        if (element.type === 'action-regex') return 2;
        if (element.type === 'action-add-class' || element.type === 'action-remove-class' || element.type === 'action-toggle-class') return 2;
        // New action nodes — all accept 1 action input + optional value inputs
        if (element.type === 'action-set-text') return 2;      // action + text value
        if (element.type === 'action-set-html') return 2;      // action + html value
        if (element.type === 'action-set-value') return 2;     // action + value
        if (element.type === 'action-set-attr') return 2;      // action + attr value
        if (element.type === 'action-set-style') return 2;     // action + style value
        if (element.type === 'action-set-visibility') return 1; // action only
        if (element.type === 'action-enable') return 1;
        if (element.type === 'action-disable') return 1;
        if (element.type === 'action-focus') return 1;
        if (element.type === 'action-scroll-to') return 1;
        if (element.type === 'action-notify') return 2;
        if (element.type === 'action-redirect') return 2;
        if (element.type === 'action-trigger-event') return 2;
        // New event nodes
        if (element.type === 'event-hover') return 1; // optional Element input pin
        if (element.type === 'event-scroll') return 1; // optional Element input pin
        if (element.type === 'event-page-load') return 0;
        if (element.type === 'event-timer') return 0;
        if (element.type === 'event-custom') return 0;
        // New array nodes
        if (element.type === 'array-map') return 2;        // array + formula/value
        if (element.type === 'array-filter') return 2;     // array + condition
        if (element.type === 'array-reduce') return 1;     // array
        if (element.type === 'array-find') return 2;       // array + condition value
        if (element.type === 'array-for-each') return 1;   // array
        if (element.type === 'array-collect') return 1;    // single item to collect
        if (element.type === 'array-contains') return 2;   // array + search value
        if (element.type === 'array-length') return 1;     // array
        if (element.type === 'array-merge') return 2;      // array a + array b
        if (element.type === 'array-unique') return 1;     // array
        if (element.type === 'image-from-link') return 1;
        if (element.type === 'image-from-element') return 1;
        if (element.type === 'api-request') return 2; // URL, optional Body
        if (element.type === 'api-status') return 2; // URL, optional Body
        if (element.type === 'api-field') return 2;
        if (element.type === 'api-list-mapper') return 1;
        if (element.type === 'chart-data') return 2;
        if (element.type === 'operator' || element.type === 'comparison' || element.type === 'logic') return 2;
        return 1;
    };

    // ── Element Property helpers (Single / All / Custom) ───────────────────────
    const getElementPropertyMode = (element: CanvasElement): ElementPropertyMode => {
        const mode = element.data?.elementPropertyMode;
        return mode === 'all' || mode === 'custom' ? mode : 'single';
    };

    // Live-detected properties for a node, minus NodeLogic's internal resolution
    // attributes (kept out of the automatic "All" list).
    const getAutoDetectedProperties = (nodeId: string): DetectedElementProperty[] =>
        (elementPropertyDetectionsRef.current[nodeId] || []).filter(
            (property) => !isInternalResolutionAttr(property.key)
        );

    const getAutoDetectedPropertyKeys = (nodeId: string): string[] =>
        getAutoDetectedProperties(nodeId).map((property) => property.key);

    // Ordered list of property keys, one per output pin (see
    // elementPropertyOrderedKeys in elementPropertyModel for the mode rules).
    const resolveElementPropertyOrderedKeys = (element: CanvasElement): string[] =>
        elementPropertyOrderedKeys(element.data, getAutoDetectedPropertyKeys(element.id));

    const getElementPropertyKeyType = (
        element: CanvasElement,
        key: string
    ): 'number' | 'string' | 'boolean' => {
        if (!key) return 'string';
        const detected = (elementPropertyDetectionsRef.current[element.id] || []).find(
            (property) => property.key === key
        );
        if (detected) return detected.type;
        if (getElementPropertyMode(element) === 'single') {
            const legacyType = element.data?.elementPropertyType;
            return legacyType === 'string' || legacyType === 'boolean' || legacyType === 'number'
                ? legacyType
                : 'number';
        }
        return 'string';
    };

    // ── Get Children helpers (Single / All / Custom + Child / Children) ────────
    const getGetChildrenDetectedChildren = (nodeId: string): DetectedChild[] =>
        elementChildrenDetectionsRef.current[nodeId] || [];

    const getGetChildrenDetectedCount = (nodeId: string): number =>
        getGetChildrenDetectedChildren(nodeId).length;

    // Nodes whose output pin count is dynamic (mode / selection / live detection).
    const DYNAMIC_OUTPUT_NODE_TYPES: ReadonlySet<CanvasElement['type']> = new Set([
        'element-property',
        'get-children',
    ] as CanvasElement['type'][]);

    // Nodes whose output pin *type* (array vs element) can flip on a config
    // change and must invalidate now-incompatible connections. element-property
    // keeps count-only pruning (its scalar type is lenient by design).
    const TYPE_FLIP_OUTPUT_NODE_TYPES: ReadonlySet<CanvasElement['type']> = new Set([
        'get-children',
    ] as CanvasElement['type'][]);

    // Drop connections that originate from a dynamic-output node when, after a
    // mode / selection / detection change, the source pin no longer exists (all
    // dynamic nodes) OR — for type-flip nodes — its type is no longer compatible
    // with the target input (e.g. Get Children switched from Children/array to
    // Single/element while wired to For Each). Valid connections and every
    // non-dynamic node are preserved.
    const pruneStaleDynamicOutputConnections = (
        nextElements: CanvasElement[],
        nextConnections: Connection[]
    ): Connection[] => {
        const dynamicById = new Map<string, CanvasElement>();
        nextElements.forEach((element) => {
            if (DYNAMIC_OUTPUT_NODE_TYPES.has(element.type)) {
                dynamicById.set(element.id, element);
            }
        });
        if (dynamicById.size === 0) return nextConnections;
        const byId = new Map(nextElements.map((element) => [element.id, element]));
        return nextConnections.filter((connection) => {
            const sourceElement = dynamicById.get(connection.fromId);
            if (!sourceElement) return true;
            const outputIndex = Number.parseInt(
                String(connection.fromOutput || '').replace(/^output/i, ''),
                10
            );
            if (!Number.isFinite(outputIndex) || outputIndex < 0) return true;
            if (outputIndex >= getOutputCount(sourceElement)) return false;
            if (!TYPE_FLIP_OUTPUT_NODE_TYPES.has(sourceElement.type)) return true;
            const targetElement = byId.get(connection.toId);
            if (!targetElement) return true;
            const targetInputIndex = getInputIndex(connection.toInput);
            if (!Number.isFinite(targetInputIndex) || targetInputIndex < 0) return true;
            return arePinTypesCompatible(
                getOutputPinType(sourceElement, outputIndex),
                getAcceptedTypesForPin(targetElement, targetInputIndex)
            );
        });
    };

    // Highest output-pin index a node still has a live outgoing connection on,
    // + 1 (0 when it has none).
    const connectedOutputPinFloor = (elementId: string): number => {
        let floor = 0;
        (connectionsRef.current || []).forEach((connection) => {
            if (connection.fromId !== elementId) return;
            const match = /output(\d+)/i.exec(String(connection.fromOutput || ''));
            if (match) floor = Math.max(floor, Number(match[1]) + 1);
        });
        return floor;
    };

    // A dynamic-output node's pin count is normally exact (Single = 1; Custom =
    // the persisted selection length). Only the "All" modes derive it from live
    // preview-DOM detection, which is 0 on a headless save (no Elementor preview
    // iframe) and would otherwise make pruneStaleDynamicOutputConnections delete
    // every wire out of the node. For those — and ONLY those — clamp the count
    // up to the wiring that already exists, so a connected pin survives a
    // transient loss of detection. Config-driven shrinks (Single/Custom) are
    // left exact so their now-orphaned wires still prune.
    const isDetectionDrivenOutputCount = (element: CanvasElement): boolean => {
        if (element.type === 'element-property') {
            return getElementPropertyMode(element) === 'all';
        }
        if (element.type === 'get-children') {
            return (
                readGetChildrenMode(element.data) === 'all' &&
                readGetChildrenReturnAs(element.data) === 'child'
            );
        }
        return false;
    };

    const getOutputCount = (element: CanvasElement): number => {
        if (element.type === 'element-property') {
            const base = elementPropertyOutputCount(element.data, getAutoDetectedPropertyKeys(element.id));
            return isDetectionDrivenOutputCount(element)
                ? Math.max(base, connectedOutputPinFloor(element.id))
                : base;
        }
        if (element.type === 'get-children') {
            const base = getChildrenOutputCount(element.data, getGetChildrenDetectedCount(element.id));
            return isDetectionDrivenOutputCount(element)
                ? Math.max(base, connectedOutputPinFloor(element.id))
                : base;
        }
        switch (element.type) {
            case 'case-range':
            case 'case-value':
            case 'case-default':
            case 'switch':
            case 'node':
            case 'operator':
            case 'math':
            case 'comparison':
            case 'logic':
            case 'element':
            case 'element-id':
            case 'element-ref':
            case 'memory-read-number':
            case 'memory-read-string':
            case 'memory-read-boolean':
            case 'memory-write-number':
            case 'memory-write-string':
            case 'memory-write-boolean':
            case 'memory-has':
            case 'memory-delete':
            case 'memory-increment':
            case 'memory-array-append':
            case 'memory-array-remove':
            case 'event-element':
            case 'event-id':
            case 'event-processor':
            case 'number':
            case 'constant-boolean':
            case 'constant-string':
            case 'regex':
            case 'concat':
            case 'cut-a':
            case 'cut-b':
            case 'cut-c':
            case 'string-count-chars':
            case 'string-count-words':
            case 'string-find-start':
            case 'string-find-end':
            case 'string-to-number':
            case 'number-to-string':
            case 'bool-count':
            case 'color':
            case 'gradient':
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
            case 'custom-node': {
                if (!element.data?.zipOutput && !element.data?.customNodeTypeCarrier) {
                    const schema = Array.isArray(element.data?.customOutputSchema) && element.data.customOutputSchema.length > 0
                        ? element.data.customOutputSchema
                        : getCustomNodeOutputSchema(element.data?.customNodeId);
                    return Math.max(1, schema.length);
                }
                return 1;
            }
            case 'unzip': {
                const schema = Array.isArray(element.data?.customOutputSchema) && element.data.customOutputSchema.length > 0
                    ? element.data.customOutputSchema
                    : getCustomNodeOutputSchema(element.data?.customNodeId);
                return Math.max(1, schema.length);
            }
            case 'array':
                return 1;
            case 'array-push':
            case 'array-pop':
            case 'array-sort':
            case 'array-remove-index':
            case 'array-replace-index':
            case 'array-map':
            case 'array-filter':
            case 'array-for-each':
            case 'array-collect':
            case 'array-merge':
            case 'array-unique':
                return element.type === 'array-for-each' ? 2 : 1;
            case 'node-branch':
                return 2;
            case 'switch-branch': {
                const caseConnections = connections
                    .filter(c => c.toId === element.id && c.toInput.startsWith('input') && getInputIndex(c.toInput) >= 2)
                    .sort((a, b) => getInputIndex(a.toInput) - getInputIndex(b.toInput));
                return caseConnections.length;
            }
            case 'array-find':
                return 2;       // found item + boolean (found/not found)
            case 'array-contains':
                return 1;       // boolean
            case 'array-length':
                return 1;       // number
            case 'array-reduce':
                return 1;       // reduced value
            case 'event-hover':
            case 'event-scroll':
            case 'event-page-load':
            case 'event-timer':
            case 'event-custom':
                return 1;       // event output
            case 'image-from-link':
            case 'image-from-element':
            case 'api-request':
            case 'api-status':
            case 'api-field':
            case 'api-list-mapper':
            case 'chart-data':
                return 1;
            case 'action-event':
            case 'action-block':
                return 1;
            case 'action-if':
                return 2;
            case 'action-required':
            case 'action-min':
            case 'action-max':
            case 'action-length':
            case 'action-regex':
            case 'action-add-class':
            case 'action-remove-class':
            case 'action-toggle-class':
            case 'action-set-text':
            case 'action-set-html':
            case 'action-set-value':
            case 'action-set-attr':
            case 'action-set-style':
            case 'action-set-visibility':
            case 'action-enable':
            case 'action-disable':
            case 'action-focus':
            case 'action-scroll-to':
            case 'action-notify':
            case 'action-redirect':
            case 'action-trigger-event':
                return 0;
            case 'main':
                return 0;
            case 'output':
                return 1;
            default:
                return 1;
        }
    };

    const getOutputPinType = (element: CanvasElement, index: number): CanvasElement['valueType'] => {
        if (element.type === 'unzip' || (element.type === 'custom-node' && !element.data?.zipOutput && !element.data?.customNodeTypeCarrier)) {
            const schema = Array.isArray(element.data?.customOutputSchema) && element.data.customOutputSchema.length > 0
                ? element.data.customOutputSchema
                : getCustomNodeOutputSchema(element.data?.customNodeId);
            const pinType = schema[index]?.type;
            if (pinType === 'string' || pinType === 'boolean' || pinType === 'color' || pinType === 'case') {
                return pinType;
            }
            return 'number';
        }
        if (element.type === 'custom-node' && element.data?.customNodeTypeCarrier) return 'zip';
        if (element.type === 'array') return 'array';
        if (element.type === 'array-push' || element.type === 'array-pop' || element.type === 'array-sort' || element.type === 'array-remove-index' || element.type === 'array-replace-index') return 'array';
        if (element.type === 'array-for-each') {
            if (index === 1) return 'number';
            // Loop item type = the array's element type (e.g. 'element' for
            // Array<element> from Get Children). No longer clamped to 'number'.
            return normalizeArrayItemType(element.data?.arrayItemType);
        }
        if (element.type === 'array-map' || element.type === 'array-filter' || element.type === 'array-collect' || element.type === 'array-merge' || element.type === 'array-unique') return 'array';
        if (element.type === 'array-find') return index === 0 ? 'array' : 'number';
        if (element.type === 'array-contains') return 'boolean';
        if (element.type === 'array-length') return 'number';
        if (element.type === 'get-children') {
            // Single, or Child return-as -> individual element pin(s).
            // Children return-as -> one array pin.
            return getChildrenOutputsArray(element.data) ? 'array' : 'element';
        }
        if (element.type === 'array-reduce') return element.valueType || 'number';
        if (element.type === 'node-branch') {
            return element.valueType || 'number';
        }
        if (element.type === 'switch-branch') {
            return element.valueType || 'number';
        }
        if (element.type === 'event-hover' || element.type === 'event-scroll' || element.type === 'event-page-load' || element.type === 'event-timer' || element.type === 'event-custom') return 'event';
        if (element.type === 'case-range' || element.type === 'case-value' || element.type === 'case-default') return 'case';
        if (element.type === 'element-ref') return 'element';
        if (element.type === 'element-property') {
            const mode = getElementPropertyMode(element);
            if (mode === 'single') {
                return element.data?.elementPropertyType || element.valueType || 'number';
            }
            const key = resolveElementPropertyOrderedKeys(element)[index];
            return getElementPropertyKeyType(element, key || '');
        }
        if (element.type === 'image-from-link' || element.type === 'image-from-element') return 'string';
        if (element.type === 'api-request') return 'zip';
        if (element.type === 'api-status') return 'zip';
        if (element.type === 'api-field') {
            const apiFieldType = element.data?.apiFieldType;
            if (apiFieldType === 'string' || apiFieldType === 'boolean' || apiFieldType === 'color' || apiFieldType === 'case' || apiFieldType === 'zip' || apiFieldType === 'number') {
                return apiFieldType;
            }
            return 'string';
        }
        if (element.type === 'api-list-mapper') return 'array';
        if (element.type === 'chart-data') return 'zip';
        if (element.type === 'action-event'
            || element.type === 'action-block'
            || element.type === 'action-if'
            || element.type === 'action-required'
            || element.type === 'action-min'
            || element.type === 'action-max'
            || element.type === 'action-length'
            || element.type === 'action-regex'
            || element.type === 'action-add-class'
            || element.type === 'action-remove-class'
            || element.type === 'action-toggle-class'
            || element.type === 'action-set-text'
            || element.type === 'action-set-html'
            || element.type === 'action-set-value'
            || element.type === 'action-set-attr'
            || element.type === 'action-set-style'
            || element.type === 'action-set-visibility'
            || element.type === 'action-enable'
            || element.type === 'action-disable'
            || element.type === 'action-focus'
            || element.type === 'action-scroll-to'
            || element.type === 'action-notify'
            || element.type === 'action-redirect'
            || element.type === 'action-trigger-event'
            || element.type === 'action-if') return 'action';
        if (element.type === 'output') return 'action';
        return element.valueType || 'number';
    };

    const getNodeHeight = (element: CanvasElement): number => {
        if (element.type === 'api-request') return 220;
        if (element.type === 'api-status') return 220;
        if (element.type === 'api-field') return 180;
        if (element.type === 'api-list-mapper') return 216;
        if (element.type === 'array-sort') return element.data?.sortMode?.startsWith('custom') ? 120 : 86;
        // action-event: ID select(32) + event-type select(32) + separator + checkbox — z paddinigiem
        if (element.type === 'action-event') return 168;
        if (element.type === 'action-length') return 168;
        if (element.type === 'action-block') return 118;
        if (element.type === 'action-if') return 150;
        // event-element / event-id: dropdown/input(32) + event-type(32) + separator + checkbox(20)
        if (element.type === 'event-element') return 168;
        if (element.type === 'event-id') return 168;
        // css-unit: value input(32) + unit select(32) + gaps
        if (element.type === 'css-unit') return 120;
        // element-ref: dropdown/input(32) + separator + checkbox(20)
        if (element.type === 'element-ref') return 128;
        // element: dropdown/input(32) + separator(8) + checkbox(22) + gaps
        if (element.type === 'element') return 174;
        // element-property: Single keeps the original fixed height; All / Custom
        // grow with the number of output pins and the config UI.
        if (element.type === 'element-property') {
            if (getElementPropertyMode(element) === 'single') return 144;
            const outCount = getOutputCount(element);
            const outputsHeight = outCount > 0 ? outCount * 34 + (outCount - 1) * 8 : 22;
            let configHeight = 12 + 32 + 8; // padding + mode select + gap
            if (getElementPropertyMode(element) === 'all') {
                configHeight += outCount > 0 ? Math.min(outCount, 5) * 16 + 22 : 34;
            } else {
                configHeight += 26; // "Properties" toggle row
                if (customPropertyListExpandedRef.current.has(element.id)) {
                    const selectedCount = (element.data?.elementPropertySelected || []).length;
                    const detectedCount = getAutoDetectedPropertyKeys(element.id).length;
                    const rows = Math.max(1, Math.min(8, Math.max(selectedCount, detectedCount)));
                    configHeight += rows * 24 + 8;
                }
                configHeight += 34; // add-custom input
            }
            return 2 + 2 + 16 + 8 + Math.max(outputsHeight, configHeight, 34) + 16;
        }
        if (element.type === 'get-children') {
            const outCount = getOutputCount(element);
            const outputsHeight = outCount > 0 ? outCount * 34 + (outCount - 1) * 8 : 22;
            const mode = readGetChildrenMode(element.data);
            let configHeight = 12 + 32 + 8; // padding + mode select + gap
            if (mode === 'single') {
                configHeight += 34; // child <select> / index input
            } else {
                configHeight += 18; // "N children detected" line
                if (mode === 'custom') {
                    configHeight += 26; // "Children ▸" toggle
                    if (customPropertyListExpandedRef.current.has(element.id)) {
                        const rows = Math.max(
                            1,
                            Math.min(8, Math.max(
                                readGetChildrenSelectedIndices(element.data).length,
                                getGetChildrenDetectedCount(element.id)
                            ))
                        );
                        configHeight += rows * 24 + 8;
                    }
                }
                configHeight += 22; // "Return as: Child / Children" row
            }
            return 2 + 2 + 16 + 8 + Math.max(outputsHeight, configHeight, 34) + 16;
        }
        if (element.type === 'action-required'
            || element.type === 'action-min'
            || element.type === 'action-max'
            || element.type === 'action-regex'
            || element.type === 'action-add-class'
            || element.type === 'action-remove-class'
            || element.type === 'action-toggle-class') return 144;
        // New action nodes with 2 inputs (action + value)
        if (element.type === 'action-set-text'
            || element.type === 'action-set-html'
            || element.type === 'action-set-value'
            || element.type === 'action-set-attr'
            || element.type === 'action-set-style') return 166;
        // New action nodes with 1 input + selector UI
        if (element.type === 'action-set-visibility') return 118;
        if (element.type === 'action-enable'
            || element.type === 'action-disable'
            || element.type === 'action-focus'
            || element.type === 'action-scroll-to') return 104;
        if (element.type === 'action-trigger-event') return 136;
        if (element.type === 'action-notify') return 136;
        if (element.type === 'action-redirect') return 136;
        // New event nodes
        if (element.type === 'event-hover'
            || element.type === 'event-scroll') return 164;
        if (element.type === 'event-page-load') return 90;
        if (element.type === 'event-timer') return 144;
        if (element.type === 'event-custom') return 112;
        const inputCount = getInputCount(element);
        const outputCount = getOutputCount(element);
        const maxRows = Math.max(inputCount, outputCount);
        // border(2*2) + paddingTop(16) + header(~8) + rows*(rowHeight+gap) + paddingBottom(16)
        return 2 + 2 + 16 + 8 + (maxRows * 34) + ((maxRows - 1) * 8) + 16;
    };

    const getNodeWidth = (element: CanvasElement): number => {
        const explicitWidth = Number(element.data?.nodeWidth);
        if (Number.isFinite(explicitWidth)) {
            return Math.max(120, Math.min(800, explicitWidth));
        }
        if (element.type === 'css-text') return 240;
        if (element.type === 'array' || element.type.startsWith('array-')) return 220;
        if (element.type === 'chart-data' && element.data?.chartDataTypeCarrier) return 160;
        if (element.type === 'action-event') return 280;
        if (element.type === 'action-length') return 240;
        if (element.type === 'event-element') return 220;
        if (element.type === 'event-id') return 220;
        if (element.type === 'element-ref') return 220;
        if (element.type === 'element-property') {
            return getElementPropertyMode(element) === 'single' ? 220 : 250;
        }
        if (element.type === 'get-children') {
            return readGetChildrenMode(element.data) === 'single' ? 220 : 240;
        }
        if (element.type === 'action-block') return 220;
        if (element.type === 'action-required'
            || element.type === 'action-min'
            || element.type === 'action-max'
            || element.type === 'action-regex'
            || element.type === 'action-add-class'
            || element.type === 'action-remove-class'
            || element.type === 'action-toggle-class') return 220;
        if (element.type === 'image-from-link' || element.type === 'image-from-element') return 220;
        return 200;
    };

    const visibleElements = React.useMemo(() => {
        if (canvasViewport.width <= 0 || canvasViewport.height <= 0 || zoom <= 0) {
            return elements;
        }

        const margin = 360;
        const worldLeft = (-offsetX / zoom) - margin;
        const worldTop = (-offsetY / zoom) - margin;
        const worldRight = ((canvasViewport.width - offsetX) / zoom) + margin;
        const worldBottom = ((canvasViewport.height - offsetY) / zoom) + margin;

        return elements.filter((element) => {
            if (element.id === selected) return true;
            const width = getNodeWidth(element);
            const height = getNodeHeight(element);
            return element.x + width >= worldLeft
                && element.x <= worldRight
                && element.y + height >= worldTop
                && element.y <= worldBottom;
        });
    }, [canvasViewport.height, canvasViewport.width, elements, offsetX, offsetY, selected, zoom]);

    const visibleElementIds = React.useMemo(
        () => new Set(visibleElements.map((element) => element.id)),
        [visibleElements]
    );

    const calculatePinPosition = (
        element: CanvasElement,
        type: 'input' | 'output',
        index: number
    ): { x: number; y: number } => {
        const currentZoom = zoomRef.current * zoomDeltaRef.current;
        const currentOffsetX = offsetXRef.current + offsetDeltaRef.current.x;
        const currentOffsetY = offsetYRef.current + offsetDeltaRef.current.y;
        const nodeX = (element.x * currentZoom) + currentOffsetX;
        const nodeY = (element.y * currentZoom) + currentOffsetY;
        const nodeWidth = getNodeWidth(element) * currentZoom;
        const pinGap = 1 * currentZoom;

        // rowHeight: actual rendered height of the output row (event-element/event-id have no inputs)
        // For action-length input (index 0): 2 controls × 32px + 1 gap × 4px = 68px
        // For event-element body (output side): output row is standard 34px
        // All other rows: CSS min-height 34px
        const isTallActionInput = type === 'input' && index === 0 && (
            element.type === 'action-length'
        );
        const rowHeight = isTallActionInput
            ? ((32 * 2) + 4)
            : 34;

        // Y = border(2) + padding(16) + rowHeight/2 + index * (rowHeight + gap(8))
        const rowGap = 8;
        const usesActionRowLayout = element.type === 'output' || element.type.startsWith('action-');
        const topOffset = 2 + 16 + (usesActionRowLayout ? 10 : 0); // border, padding, and action layout margin
        const rowY = nodeY + ((topOffset + (rowHeight / 2) + (index * (rowHeight + rowGap))) * currentZoom);

        if (type === 'input') {
            return { x: nodeX - pinGap, y: rowY };
        }

        return { x: nodeX + nodeWidth + pinGap, y: rowY };
    };

    const calculatePinPositionWithDelta = (
        element: CanvasElement,
        type: 'input' | 'output',
        index: number,
        applyDelta: boolean = true
    ): { x: number; y: number } => {
        let elementX = element.x;
        let elementY = element.y;

        if (applyDelta && dragElementDeltaRef.current && dragElementDeltaRef.current.elementId === element.id) {
            elementX += dragElementDeltaRef.current.deltaX;
            elementY += dragElementDeltaRef.current.deltaY;
        }

        const currentZoom = zoomRef.current * zoomDeltaRef.current;
        const currentOffsetX = offsetXRef.current + offsetDeltaRef.current.x;
        const currentOffsetY = offsetYRef.current + offsetDeltaRef.current.y;

        const nodeX = (elementX * currentZoom) + currentOffsetX;
        const nodeY = (elementY * currentZoom) + currentOffsetY;
        const nodeWidth = getNodeWidth(element) * currentZoom;
        const pinGap = 1 * currentZoom;

        // rowHeight: actual rendered height of the output row
        // For action-length input (index 0): 2 controls × 32px + 1 gap × 4px = 68px
        // All other rows: CSS min-height 34px
        const isTallActionInput = type === 'input' && index === 0 && (
            element.type === 'action-length'
        );
        const rowHeight = isTallActionInput
            ? ((32 * 2) + 4)
            : 34;

        // Y = border(2) + padding(16) + rowHeight/2 + index * (rowHeight + gap(8))
        const rowGap = 8;
        const usesActionRowLayout = element.type === 'output' || element.type.startsWith('action-');
        const topOffset = 2 + 16 + (usesActionRowLayout ? 10 : 0); // border, padding, and action layout margin
        const rowY = nodeY + ((topOffset + (rowHeight / 2) + (index * (rowHeight + rowGap))) * currentZoom);

        if (type === 'input') {
            return { x: nodeX - pinGap, y: rowY };
        }

        return { x: nodeX + nodeWidth + pinGap, y: rowY };
    };

    const getPinPosition = (
        element: CanvasElement,
        type: 'input' | 'output',
        index: number
    ): { x: number; y: number } => calculatePinPositionWithDelta(element, type, index, true);

    const getBezierPath = (
        fromPos: { x: number; y: number },
        toPos: { x: number; y: number }
    ): string => {
        const distance = Math.abs(fromPos.x - toPos.x);
        const controlPointDistance = Math.min(distance / 2, 100);
        return `M ${fromPos.x} ${fromPos.y} C ${fromPos.x + controlPointDistance} ${fromPos.y}, ${toPos.x - controlPointDistance} ${toPos.y}, ${toPos.x} ${toPos.y}`;
    };

    // Returns known DOM properties for a detected element type — used by Element Property node
    const getElementTypeProps = (
        detEl: DetectedElement | null | undefined
    ): Array<{ key: string; type: 'number' | 'string' | 'boolean' }> => {
        if (!detEl) return [];

        // Common HTML element properties by element type
        const commonProps: Array<{ key: string; type: 'number' | 'string' | 'boolean' }> = [
            { key: 'value', type: 'string' },
            { key: 'id', type: 'string' },
            { key: 'className', type: 'string' },
            { key: 'textContent', type: 'string' },
            { key: 'innerHTML', type: 'string' },
            { key: 'disabled', type: 'boolean' },
            { key: 'hidden', type: 'boolean' },
            { key: 'checked', type: 'boolean' },
        ];

        const typeSpecificProps: Record<string, Array<{ key: string; type: 'number' | 'string' | 'boolean' }>> = {
            'slider': [
                { key: 'value', type: 'number' },
                { key: 'min', type: 'number' },
                { key: 'max', type: 'number' },
                { key: 'step', type: 'number' },
                { key: 'disabled', type: 'boolean' },
            ],
            'input-number': [
                { key: 'value', type: 'number' },
                { key: 'min', type: 'number' },
                { key: 'max', type: 'number' },
                { key: 'step', type: 'number' },
                { key: 'disabled', type: 'boolean' },
                { key: 'placeholder', type: 'string' },
            ],
            'input-string': [
                { key: 'value', type: 'string' },
                { key: 'placeholder', type: 'string' },
                { key: 'disabled', type: 'boolean' },
                { key: 'maxLength', type: 'number' },
                { key: 'minLength', type: 'number' },
                { key: 'textContent', type: 'string' },
                { key: 'innerHTML', type: 'string' },
            ],
            'checkbox': [
                { key: 'checked', type: 'boolean' },
                { key: 'disabled', type: 'boolean' },
                { key: 'value', type: 'string' },
            ],
            'radio': [
                { key: 'value', type: 'string' },
                { key: 'checked', type: 'boolean' },
                { key: 'disabled', type: 'boolean' },
            ],
            'select': [
                { key: 'value', type: 'string' },
                { key: 'disabled', type: 'boolean' },
                { key: 'selectedIndex', type: 'number' },
            ],
            'button-group': [
                { key: 'value', type: 'string' },
                { key: 'disabled', type: 'boolean' },
            ],
            'image': [
                { key: 'src', type: 'string' },
                { key: 'alt', type: 'string' },
                { key: 'width', type: 'number' },
                { key: 'height', type: 'number' },
                { key: 'hidden', type: 'boolean' },
            ],
        };

        const specific = typeSpecificProps[detEl.type] || commonProps;

        // Also include any outputs from the detected element (in case of custom elements)
        const outputProps: Array<{ key: string; type: 'number' | 'string' | 'boolean' }> = (detEl.outputs || [])
            .filter(o => !specific.some(s => s.key === o.name))
            .map(o => ({
                key: o.name,
                type: (o.type === 'number' || o.type === 'boolean') ? o.type : 'string' as 'string',
            }));

        return [...specific, ...outputProps];
    };

    const renderInputControl = (element: CanvasElement, index: number): React.ReactNode => {
        const valuePinConnected = connections.some((connection) => connection.toId === element.id && connection.toInput === `input${index}`);
        const valuePinNode = element.type === 'action-required'
            || element.type === 'action-min'
            || element.type === 'action-max'
            || element.type === 'action-length'
            || element.type === 'action-regex'
            || element.type === 'action-add-class'
            || element.type === 'action-remove-class'
            || element.type === 'action-toggle-class'
            || element.type === 'action-set-text'
            || element.type === 'action-set-html'
            || element.type === 'action-set-value'
            || element.type === 'action-set-attr'
            || element.type === 'action-set-style'
            || element.type === 'action-notify'
            || element.type === 'action-redirect'
            || element.type === 'action-trigger-event'
            || element.type === 'action-if';
            
        if (element.type === 'action-if' && index === 1 && !valuePinConnected) {
            return <label className="reverse-toggle" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={element.data?.actionIfCondition === true} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionIfCondition: e.target.checked } } : elem)))} /> Condition</label>;
        }
        if (valuePinNode && index > 0 && valuePinConnected) return null;
        switch (element.type) {
            case 'output':
                // The Output node uses the special layout; its target controls
                // live in the config column (Element pin / ID select / Use ID
                // Input). Nothing to render per input row here.
                return null;
            case 'action-set-text':
            case 'action-set-html':
            case 'action-set-value':
            case 'action-set-attr':
            case 'action-set-style':
            case 'action-set-visibility':
            case 'action-enable':
            case 'action-disable':
            case 'action-focus':
            case 'action-scroll-to':
            case 'action-notify':
            case 'action-redirect':
            case 'action-trigger-event': {
                if (index === 0 && element.type === 'action-set-visibility') return <select className="input-control" value={String(element.data?.actionVisibility || 'toggle')} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionVisibility: e.target.value as 'show' | 'hide' | 'toggle' } } : elem)))}><option value="show">Show</option><option value="hide">Hide</option><option value="toggle">Toggle</option></select>;
                if (index === 0) return null;
                if (element.type === 'action-set-visibility') return <select className="input-control" value={String(element.data?.actionVisibility || 'toggle')} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionVisibility: e.target.value as 'show' | 'hide' | 'toggle' } } : elem)))}><option value="show">Show</option><option value="hide">Hide</option><option value="toggle">Toggle</option></select>;
                if (element.type === 'action-notify') return <input className="input-control" value={String(element.data?.actionNotifyMessage || '')} placeholder="Notification" onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionNotifyMessage: e.target.value } } : elem)))} />;
                if (element.type === 'action-trigger-event') return <input className="input-control" value={String(element.data?.actionEventName || '')} placeholder="Event name" onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionEventName: e.target.value } } : elem)))} />;
                if (element.type === 'action-redirect') return <input className="input-control" value={String(element.data?.valueText || '')} placeholder="URL" onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, valueText: e.target.value } } : elem)))} />;
                if (element.type === 'action-set-attr') return <input className="input-control" value={String(element.data?.actionAttrName || '')} placeholder="Attribute name" onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionAttrName: e.target.value } } : elem)))} />;
                if (element.type === 'action-set-style') return <input className="input-control" value={String(element.data?.actionStyleProperty || '')} placeholder="CSS property" onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionStyleProperty: e.target.value } } : elem)))} />;
                return <input className="input-control" value={String(element.data?.valueText ?? element.data?.value ?? '')} placeholder="Value" onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, valueText: e.target.value } } : elem)))} />;
            }
            case 'action-event': {
                if (index !== 0) return null;
                // input1 is the optional Element pin (input0 stays the
                // existing 'action' attach-to-parent slot rendered below).
                const elementPinConnected = connections.some((connection) => connection.toId === element.id && connection.toInput === 'input1');
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontSize: '10px', color: elementPinConnected ? '#86efac' : '#94a3b8' }}>
                            {elementPinConnected
                                ? 'Element: from connected pin (overrides the ID below)'
                                : 'Element: connect a pin, or use the ID below'}
                        </div>
                        {element.data?.actionUseManualId ? (
                            <input
                                type="text"
                                className="input-control"
                                value={String(element.data?.actionTargetManualId || '')}
                                placeholder="Element ID"
                                onChange={(e) => {
                                    const actionTargetManualId = e.target.value;
                                    setElements((prev) =>
                                        updateElementValueTypes(
                                            prev.map((elem) =>
                                                elem.id === element.id
                                                    ? { ...elem, data: { ...elem.data, actionTargetManualId } }
                                                    : elem
                                            )
                                        )
                                    );
                                }}
                            />
                        ) : (
                            <select
                                className="input-control"
                                value={String(element.data?.actionTargetId || '')}
                                onChange={(e) => {
                                    const actionTargetId = e.target.value;
                                    setElements((prev) =>
                                        updateElementValueTypes(
                                            prev.map((elem) =>
                                                elem.id === element.id
                                                    ? { ...elem, data: { ...elem.data, actionTargetId } }
                                                    : elem
                                            )
                                        )
                                    );
                                }}
                            >
                                <option value="">-- Element ID --</option>
                                {detectedElements.map((detectedEl) => (
                                    <option key={detectedEl.id} value={detectedEl.id}>
                                        {detectedEl.name} ({detectedEl.id})
                                    </option>
                                ))}
                            </select>
                        )}
                        <select
                            className="input-control"
                            value={String(element.data?.actionEventType || 'change')}
                            onChange={(e) => {
                                const actionEventType = e.target.value;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, actionEventType } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                        >
                            <option value="change">change</option>
                            <option value="input">input</option>
                            <option value="click">click</option>
                            <option value="focus">focus</option>
                            <option value="blur">blur</option>
                            <option value="keydown">keydown</option>
                            <option value="keyup">keyup</option>
                        </select>
                        <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '4px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                    type="checkbox"
                                    checked={!!element.data?.actionUseManualId}
                                    onChange={(e) => {
                                        const actionUseManualId = e.target.checked;
                                        setElements((prev) =>
                                            updateElementValueTypes(
                                                prev.map((elem) =>
                                                    elem.id === element.id
                                                        ? { ...elem, data: { ...elem.data, actionUseManualId } }
                                                        : elem
                                                )
                                            )
                                        );
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ cursor: 'pointer' }}
                                />
                                Manual ID
                            </label>
                        </div>
                    </div>
                );
            }
            case 'action-required':
                if (index === 1) return <label className="reverse-toggle" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={element.data?.actionRequired !== false} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionRequired: e.target.checked } } : elem)))} /> Required</label>;
                return null;
            case 'action-min':
                if (index === 1) return <input type="number" className="input-control" value={String(element.data?.actionMin ?? 0)} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionMin: Number(e.target.value) || 0 } } : elem)))} placeholder="Min" onClick={(e) => e.stopPropagation()} />;
                return null;
            case 'action-max':
                if (index === 1) return <input type="number" className="input-control" value={String(element.data?.actionMax ?? 100)} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionMax: Number(e.target.value) || 0 } } : elem)))} placeholder="Max" onClick={(e) => e.stopPropagation()} />;
                return null;
            case 'action-length':
                if (index === 1 || index === 2) return <input type="number" className="input-control" value={String(index === 1 ? (element.data?.actionMinLength ?? 0) : (element.data?.actionMaxLength ?? 0))} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, [index === 1 ? 'actionMinLength' : 'actionMaxLength']: Number(e.target.value) || 0 } } : elem)))} placeholder={index === 1 ? 'Min length' : 'Max length'} onClick={(e) => e.stopPropagation()} />;
                return null;
            case 'action-regex':
                if (index === 1) return <input type="text" className="input-control" value={String(element.data?.actionRegexPattern || '')} placeholder="Pattern" onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionRegexPattern: e.target.value } } : elem)))} onClick={(e) => e.stopPropagation()} />;
                return null;
            case 'action-add-class':
            case 'action-remove-class':
            case 'action-toggle-class':
                if (index === 1) return <input type="text" className="input-control" value={String(element.data?.actionClassName || '')} placeholder="CSS class" onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === element.id ? { ...elem, data: { ...elem.data, actionClassName: e.target.value } } : elem)))} onClick={(e) => e.stopPropagation()} />;
                return null;
            case 'action-block':
                if (index !== 0) return null;
                return (
                    <div className="input-control" style={{ padding: '10px', cursor: 'default' }}>
                        Action chain extender
                    </div>
                );
            case 'calculation': {
                const connected = connections.some((connection) => connection.toId === element.id && connection.toInput === `input${index}`);
                const inputValue = element.data?.inputValues?.[index] ?? 0;
                if (!connected) {
                    return (
                        <input
                            type="number"
                            className="input-control"
                            value={String(inputValue)}
                            onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) => {
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
            }
            case 'case-range': {
                const hasMinConnection = connections.some((connection) => connection.toId === element.id && connection.toInput === 'input0');
                const hasMaxConnection = connections.some((connection) => connection.toId === element.id && connection.toInput === 'input1');
                const hasOutConnection = connections.some((connection) => connection.toId === element.id && connection.toInput === 'input2');
                if (index === 0) {
                    return !hasMinConnection ? (
                        <input
                            type="number"
                            className="input-control"
                            value={element.data?.min || 0}
                            onChange={(e) => {
                                const min = parseFloat(e.target.value) || 0;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
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
                    ) : <div className="input-placeholder" />;
                }
                if (index === 1) {
                    return !hasMaxConnection ? (
                        <input
                            type="number"
                            className="input-control"
                            value={element.data?.max || 100}
                            onChange={(e) => {
                                const max = parseFloat(e.target.value) || 100;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
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
                    ) : <div className="input-placeholder" />;
                }
                if (index === 2) {
                    return !hasOutConnection ? (
                        <input
                            type="text"
                            className="input-control"
                            value={element.data?.out || ''}
                            onChange={(e) => {
                                const out = e.target.value;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
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
                    ) : <div className="input-placeholder" />;
                }
                return null;
            }
            case 'case-value': {
                const hasValueConnection = connections.some((connection) => connection.toId === element.id && connection.toInput === 'input0');
                const hasOutConnection = connections.some((connection) => connection.toId === element.id && connection.toInput === 'input1');
                if (index === 0) {
                    return !hasValueConnection ? (
                        <input
                            type="text"
                            className="input-control"
                            value={String(element.data?.caseValue ?? '')}
                            onChange={(e) => {
                                const caseValue = e.target.value;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
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
                    ) : <div className="input-placeholder" />;
                }
                if (index === 1) {
                    return !hasOutConnection ? (
                        <input
                            type="text"
                            className="input-control"
                            value={element.data?.out || ''}
                            onChange={(e) => {
                                const out = e.target.value;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
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
                    ) : <div className="input-placeholder" />;
                }
                return null;
            }
            case 'case-default': {
                const hasOutConnection = connections.some((c) => c.toId === element.id && c.toInput === 'input0');
                if (index !== 0) return null;
                return !hasOutConnection ? (
                    <input
                        type="text"
                        className="input-control"
                        value={element.data?.out || ''}
                        onChange={(e) => {
                            const out = e.target.value;
                            setElements((prev) =>
                                updateElementValueTypes(
                                    prev.map((elem) =>
                                        elem.id === element.id
                                            ? { ...elem, data: { ...elem.data, out } }
                                            : elem
                                    )
                                )
                            );
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Default value"
                    />
                ) : <div className="input-placeholder" />;
            }
            case 'regex':
                if (index !== 0) return null;
                return (
                    <input
                        type="text"
                        className="input-control"
                        value={element.data?.regexPattern || ''}
                        onChange={(e) => {
                            const regexPattern = e.target.value;
                            setElements((prev) =>
                                updateElementValueTypes(
                                    prev.map((elem) =>
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
                    <label className="reverse-toggle" onClick={(e) => e.stopPropagation()}>
                        <input
                            type="checkbox"
                            checked={Boolean(element.data?.reverse)}
                            onChange={(e) => {
                                const reverse = e.target.checked;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
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
                    const hasColorConnection = connections.some((connection) => connection.toId === element.id && connection.toInput === `input${index}`);
                    const colorValue = getGradientColorByIndex(element, index);
                    return !hasColorConnection ? (
                        <input
                            type="text"
                            className="input-control"
                            value={colorValue}
                            onChange={(e) => {
                                const nextValue = e.target.value;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) => {
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
                            placeholder={`Color ${index + 1}`}
                        />
                    ) : <div className="input-placeholder" />;
                }
                if (index === angleIndex) {
                    return (
                        <input
                            type="number"
                            className="input-control"
                            value={String(element.data?.gradientAngle ?? 0)}
                            onChange={(e) => {
                                const gradientAngle = Number(e.target.value) || 0;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, gradientAngle } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Angle"
                        />
                    );
                }
                return null;
            }
            case 'math':
                if (index !== 0) return null;
                return (
                    <select
                        className="input-control"
                        value={String(element.data?.mathFunction || 'sin')}
                        onChange={(e) => {
                            const mathFunction = e.target.value;
                            setElements((prev) =>
                                updateElementValueTypes(
                                    prev.map((elem) =>
                                        elem.id === element.id
                                            ? { ...elem, data: { ...elem.data, mathFunction } }
                                            : elem
                                    )
                                )
                            );
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'abs', 'log', 'exp', 'floor', 'ceil', 'round'].map((name) => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                );
            case 'array-sort':
                if (index !== 0) return null;
                const sortMode = String(element.data?.sortMode || 'number-asc');
                const arraySortFieldOptions = getArraySortFieldOptions(element);
                const showArraySortField = sortMode.startsWith('custom');
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <select
                            className="input-control"
                            value={sortMode}
                            onChange={(e) => {
                                const nextSortMode = e.target.value as NonNullable<CanvasElement['data']>['sortMode'];
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, sortMode: nextSortMode } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <option value="number-asc">Number asc</option>
                            <option value="number-desc">Number desc</option>
                            <option value="string-asc">String A-Z</option>
                            <option value="string-desc">String Z-A</option>
                            <option value="custom-asc">Custom field asc</option>
                            <option value="custom-desc">Custom field desc</option>
                        </select>
                        {showArraySortField ? (
                            arraySortFieldOptions.length > 0 ? (
                                <select
                                    className="input-control"
                                    value={String(element.data?.arraySortField || arraySortFieldOptions[0]?.id || '')}
                                    onChange={(e) => {
                                        const arraySortField = e.target.value;
                                        setElements((prev) =>
                                            updateElementValueTypes(
                                                prev.map((elem) =>
                                                    elem.id === element.id
                                                        ? { ...elem, data: { ...elem.data, arraySortField } }
                                                        : elem
                                                )
                                            )
                                        );
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <option value="">-- Field --</option>
                                    {arraySortFieldOptions.map((field) => (
                                        <option key={field.id} value={field.id}>
                                            {field.label} ({field.type})
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    className="input-control"
                                    value={String(element.data?.arraySortField || '')}
                                    placeholder="Field path"
                                    onChange={(e) => {
                                        const arraySortField = e.target.value;
                                        setElements((prev) =>
                                            updateElementValueTypes(
                                                prev.map((elem) =>
                                                    elem.id === element.id
                                                        ? { ...elem, data: { ...elem.data, arraySortField } }
                                                        : elem
                                                )
                                            )
                                        );
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            )
                        ) : null}
                    </div>
                );
            case 'array': {
                if (index !== 0) return null;
                return (
                    <select
                        className="input-control"
                        value={String(element.data?.arrayItemType || 'number')}
                        onChange={(e) => {
                            const arrayItemType = e.target.value as ArrayItemType;
                            setElements((prev) =>
                                updateElementValueTypes(
                                    prev.map((elem) =>
                                        elem.id === element.id
                                            ? { ...elem, data: { ...elem.data, arrayItemType } }
                                            : elem
                                    )
                                )
                            );
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <option value="number">Number</option>
                        <option value="string">String</option>
                        <option value="boolean">Boolean</option>
                        <option value="color">Color</option>
                        <option value="zip">Zip</option>
                        <option value="element">Element</option>
                    </select>
                );
            }
            case 'chart-data': {
                if (element.data?.chartDataTypeCarrier) return null;
                if (index === 0) {
                    return (
                        <input
                            type="text"
                            className="input-control"
                            value={String(element.data?.chartDataLabel ?? 'label')}
                            placeholder="Label"
                            onChange={(e) => {
                                const chartDataLabel = e.target.value;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, chartDataLabel } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    );
                }
                if (index === 1) {
                    return (
                        <input
                            type="number"
                            className="input-control"
                            value={String(element.data?.chartDataValueText ?? element.data?.chartDataValue ?? '')}
                            placeholder="Value"
                            onChange={(e) => {
                                const chartDataValueText = e.target.value;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, chartDataValueText } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onBlur={(e) => {
                                const raw = e.target.value.replace(',', '.');
                                const parsed = Number(raw);
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) => {
                                            if (elem.id !== element.id) return elem;
                                            const nextValue = Number.isFinite(parsed) ? parsed : Number(elem.data?.chartDataValue ?? 0);
                                            return {
                                                ...elem,
                                                data: {
                                                    ...elem.data,
                                                    chartDataValue: nextValue,
                                                    chartDataValueText: String(nextValue),
                                                }
                                            };
                                        })
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    );
                }
                return null;
            }
            case 'api-request':
            case 'api-status': {
                if (index !== 0) return null;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <input
                            type="text"
                            className="input-control"
                            value={String(element.data?.apiUrl || '')}
                            placeholder="API URL"
                            onChange={(e) => {
                                const apiUrl = e.target.value;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, apiUrl } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <select
                            className="input-control"
                            value={String(element.data?.apiMethod || 'GET').toUpperCase()}
                            onChange={(e) => {
                                const apiMethod = e.target.value;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, apiMethod } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => (
                                <option key={method} value={method}>{method}</option>
                            ))}
                        </select>
                    </div>
                );
            }
            case 'api-field': {
                if (index !== 0) return null;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <select
                            className="input-control"
                            value={String(element.data?.apiFieldType || 'string')}
                            onChange={(e) => {
                                const apiFieldType = e.target.value as NonNullable<CanvasElement['data']>['apiFieldType'];
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, apiFieldType } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {['number', 'string', 'boolean', 'color', 'zip', 'case'].map((fieldType) => (
                                <option key={fieldType} value={fieldType}>{fieldType}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            className="input-control"
                            value={String(element.data?.apiFieldPath || '')}
                            placeholder="Field path"
                            onChange={(e) => {
                                const apiFieldPath = e.target.value;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, apiFieldPath } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <input
                            type="text"
                            className="input-control"
                            value={String(element.data?.apiFieldFallback || '')}
                            placeholder="Fallback"
                            onChange={(e) => {
                                const apiFieldFallback = e.target.value;
                                setElements((prev) =>
                                    updateElementValueTypes(
                                        prev.map((elem) =>
                                            elem.id === element.id
                                                ? { ...elem, data: { ...elem.data, apiFieldFallback } }
                                                : elem
                                        )
                                    )
                                );
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                );
            }
            case 'api-list-mapper': {
                if (index !== 0) return null;
                return renderApiListMapperControls(element, (patch) => {
                    setElements((prev) =>
                        updateElementValueTypes(
                            prev.map((elem) =>
                                elem.id === element.id
                                    ? { ...elem, data: { ...elem.data, ...patch } }
                                    : elem
                            )
                        )
                    );
                });
            }
            case 'image-from-link':
                if (index !== 0) return null;
                return (
                    <input
                        type="text"
                        className="input-control"
                        value={String(element.data?.imageUrl || '')}
                        onChange={(e) => {
                            const imageUrl = e.target.value;
                            setElements((prev) =>
                                updateElementValueTypes(
                                    prev.map((elem) =>
                                        elem.id === element.id
                                            ? { ...elem, data: { ...elem.data, imageUrl } }
                                            : elem
                                    )
                                )
                            );
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Image URL"
                    />
                );
            case 'image-from-element':
                if (index !== 0) return null;
                return (
                    <input
                        type="text"
                        className="input-control"
                        value={String(element.data?.elementSelector || '')}
                        onChange={(e) => {
                            const elementSelector = e.target.value;
                            setElements((prev) =>
                                updateElementValueTypes(
                                    prev.map((elem) =>
                                        elem.id === element.id
                                            ? { ...elem, data: { ...elem.data, elementSelector } }
                                            : elem
                                    )
                                )
                            );
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Element selector"
                    />
                );
            default:
                return null;
        }
    };

    const renderOutputControl = (element: CanvasElement, index: number): React.ReactNode => {
        if (element.type === 'output' && customNodeMode) {
            return (
                <input
                    type="text"
                    className="input-control"
                    value={String((element.data?.outputLabels || outputInputLabels)[index] || '')}
                    onChange={(e) => {
                        const nextValue = e.target.value;
                        setElements((prev) =>
                            updateElementValueTypes(
                                prev.map((elem) => {
                                    if (elem.id !== element.id) return elem;
                                    const labels = [...(elem.data?.outputLabels || outputInputLabels)];
                                    labels[index] = nextValue;
                                    return { ...elem, data: { ...elem.data, outputLabels: labels } };
                                })
                            )
                        );
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={`Output ${index + 1}`}
                />
            );
        }

        if (element.type === 'custom-node' && !element.data?.zipOutput && !element.data?.customNodeTypeCarrier) {
            return null;
        }

        if (element.type === 'array' || element.type.startsWith('array-') || element.type.startsWith('image-')) {
            return null;
        }

        return null;
    };

    const renderApiListMapperControls = (element: CanvasElement, updateApiNode: (patch: Record<string, unknown>) => void): React.ReactNode => {
        const itemType = String(element.data?.apiListItemType || 'string').trim().toLowerCase();
        const isZipMode = itemType === 'zip' || itemType === 'case';
        const isChartDataMode = itemType === 'chart-data';
        const customNodeId = String(element.data?.apiListCustomNodeId || '').trim();
        const customNodeFields = isZipMode ? getCustomNodeInputSchema(customNodeId) : [];
        const fieldMappings = Array.isArray(element.data?.apiListFieldMappings)
            ? element.data.apiListFieldMappings
            : [];

        const syncMappingsForFields = (nextCustomNodeId: string) => {
            const nextFields = getCustomNodeInputSchema(nextCustomNodeId);
            const nextMappings = nextFields.map((field, index) => {
                const existing = fieldMappings.find((mapping) => String(mapping?.fieldId || '').trim() === String(field.id || '').trim())
                    || fieldMappings[index]
                    || null;
                return {
                    fieldId: String(field.id || '').trim() || `field-${index + 1}`,
                    path: String(existing?.path || '').trim(),
                };
            });
            updateApiNode({
                        apiListCustomNodeId: nextCustomNodeId,
                        apiListFieldMappings: nextMappings,
                    });
                };

        return (
            <div
                className="api-list-mapper-scroll"
                style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '132px', overflowY: 'auto', paddingRight: '4px' }}
                onMouseEnter={() => { apiListMapperScrollLockRef.current = true; }}
                onMouseLeave={() => { apiListMapperScrollLockRef.current = false; }}
                onWheelCapture={(e) => e.stopPropagation()}
                onMouseDownCapture={(e) => e.stopPropagation()}
                onPointerDownCapture={(e) => e.stopPropagation()}
            >
                <select
                    className="input-control"
                    value={String(element.data?.apiListMatchMode || 'auto')}
                    onChange={(e) => updateApiNode({ apiListMatchMode: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                >
                    <option value="auto">Auto</option>
                    <option value="names">Field names</option>
                    <option value="types">Field types</option>
                </select>

                <input
                    type="text"
                    className="input-control"
                    value={String(element.data?.apiListPath || '')}
                    placeholder="Array path"
                    onChange={(e) => updateApiNode({ apiListPath: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                />

                <select
                    className="input-control"
                    value={String(element.data?.apiListItemType || 'string')}
                    onChange={(e) => {
                        const nextType = e.target.value;
                        updateApiNode({
                            apiListItemType: nextType,
                            ...(nextType === 'zip' || nextType === 'case'
                                ? { apiListValueField: '' }
                                : nextType === 'chart-data'
                                    ? { apiListCustomNodeId: '', apiListFieldMappings: [], apiListLabelField: String(element.data?.apiListLabelField || 'label'), apiListValueField: String(element.data?.apiListValueField || 'value') }
                                    : { apiListCustomNodeId: '', apiListFieldMappings: [] }),
                        });
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <option value="number">number</option>
                    <option value="string">string</option>
                    <option value="boolean">boolean</option>
                    <option value="color">color</option>
                    <option value="zip">zip</option>
                    <option value="chart-data">chart data</option>
                    <option value="case">case</option>
                </select>

                {isZipMode ? (
                    <>
                        <select
                            className="input-control"
                            value={customNodeId}
                            onChange={(e) => syncMappingsForFields(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <option value="">Select custom node</option>
                            {configuredCustomNodes.map((node: any) => {
                                const nodeId = String(node?.id || '').trim();
                                if (!nodeId) {
                                    return null;
                                }
                                const nodeName = String(node?.name || nodeId).trim();
                                return (
                                    <option key={nodeId} value={nodeId}>{nodeName}</option>
                                );
                            })}
                        </select>
                        {customNodeFields.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                {customNodeFields.map((field, index) => {
                                    const mapping = fieldMappings.find((item) => String(item?.fieldId || '').trim() === String(field.id || '').trim())
                                        || fieldMappings[index]
                                        || null;
                                    return (
                                        <div
                                            key={`${field.id}-${index}`}
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.35fr)',
                                                gap: '6px',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <div style={{
                                                fontSize: '11px',
                                                color: '#e5eef9',
                                                opacity: 1,
                                                lineHeight: 1.2,
                                                background: 'rgba(15, 23, 42, 0.55)',
                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                borderRadius: '6px',
                                                padding: '2px 6px',
                                            }}>
                                                {field.label}
                                                <span style={{ opacity: 0.72 }}> ({field.type})</span>
                                            </div>
                                            <input
                                                type="text"
                                                className="input-control"
                                                value={String(mapping?.path || '')}
                                                placeholder={`Path for ${field.label}`}
                                                onChange={(e) => {
                                                    const nextPath = e.target.value;
                                                    const nextMappings = [...fieldMappings];
                                                    nextMappings[index] = {
                                                        fieldId: String(field.id || '').trim() || `field-${index + 1}`,
                                                        path: nextPath,
                                                    };
                                                    updateApiNode({
                                                        apiListCustomNodeId: customNodeId,
                                                        apiListFieldMappings: nextMappings,
                                                    });
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ fontSize: '11px', opacity: 0.75, lineHeight: 1.4 }}>
                                Select a custom node to map its input fields.
                            </div>
                        )}
                    </>
                ) : isChartDataMode ? (
                    <>
                        <input
                            type="text"
                            className="input-control"
                            value={String(element.data?.apiListLabelField || 'label')}
                            placeholder="Label field path"
                            onChange={(e) => updateApiNode({ apiListLabelField: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                        />
                        <input
                            type="text"
                            className="input-control"
                            value={String(element.data?.apiListValueField || 'value')}
                            placeholder="Value field path"
                            onChange={(e) => updateApiNode({ apiListValueField: e.target.value })}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </>
                ) : (
                    <input
                        type="text"
                        className="input-control"
                        value={String(element.data?.apiListValueField || '')}
                        placeholder="Field path"
                        onChange={(e) => {
                            const nextPath = e.target.value;
                            updateApiNode({
                                apiListValueField: nextPath,
                                apiListLabelField: nextPath,
                            });
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                )}
            </div>
        );
    };

    const renderApiNodeControls = (el: CanvasElement): React.ReactNode => {
        const updateApiNode = (patch: Record<string, unknown>) => {
            setElements((prev) =>
                updateElementValueTypes(
                    prev.map((elem) => (elem.id === el.id ? { ...elem, data: { ...elem.data, ...patch } } : elem))
                )
            );
        };

        if (el.type === 'api-request' || el.type === 'api-status') {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <input
                        type="text"
                        className="input-control"
                        value={String(el.data?.apiUrl || '')}
                        placeholder="API URL"
                        onChange={(e) => updateApiNode({ apiUrl: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <select
                        className="input-control"
                        value={String(el.data?.apiMethod || 'GET').toUpperCase()}
                        onChange={(e) => updateApiNode({ apiMethod: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((method) => (
                            <option key={method} value={method}>{method}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        className="input-control"
                        value={String(el.data?.apiHeaders || '')}
                        placeholder='Headers JSON, e.g. {"Authorization":"Bearer ..."}'
                        onChange={(e) => updateApiNode({ apiHeaders: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <input
                        type="number"
                        className="input-control"
                        value={String(el.data?.apiTimeout ?? 15000)}
                        placeholder="Timeout (ms)"
                        min={0}
                        onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            updateApiNode({ apiTimeout: Number.isFinite(v) && v > 0 ? v : 15000 });
                        }}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            );
        }

        if (el.type === 'api-field') {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <select
                        className="input-control"
                        value={String(el.data?.apiFieldType || 'string')}
                        onChange={(e) => updateApiNode({ apiFieldType: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {['number', 'string', 'boolean', 'color', 'zip', 'case'].map((fieldType) => (
                            <option key={fieldType} value={fieldType}>{fieldType}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        className="input-control"
                        value={String(el.data?.apiFieldPath || '')}
                        placeholder="Field path"
                        onChange={(e) => updateApiNode({ apiFieldPath: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                    />
                    <input
                        type="text"
                        className="input-control"
                        value={String(el.data?.apiFieldFallback || '')}
                        placeholder="Fallback"
                        onChange={(e) => updateApiNode({ apiFieldFallback: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            );
        }

        if (el.type === 'api-list-mapper') {
            return renderApiListMapperControls(el, updateApiNode);
        }

        return null;
    };

    const getInputLabel = (element: CanvasElement, index: number): string => {
        switch (element.type) {
            case 'calculation':
                return `Input ${index + 1}`;
            case 'condition':
                if (index === 0) return 'Left';
                if (index === 1) return 'Right';
                return '';
            case 'switch': {
                if (index === 0) return 'Value';
                // Check if a case-default is connected to this exact pin index
                const defaultConn = connections.find((c) => {
                    if (c.toId !== element.id || getInputIndex(c.toInput) !== index) return false;
                    return elements.find((el) => el.id === c.fromId)?.type === 'case-default';
                });
                if (defaultConn) return 'Default';
                return `Case ${index}`;
            }
            case 'case-range':
                if (index === 0) return 'Min';
                if (index === 1) return 'Max';
                if (index === 2) return 'Out';
                return '';
            case 'case-value':
                if (index === 0) return 'Value';
                if (index === 1) return 'Out';
                return '';
            case 'case-default':
                if (index === 0) return 'Out';
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
            case 'string-count-words':
            case 'string-to-number':
                return 'Text';
            case 'string-find-start':
            case 'string-find-end':
                return index === 0 ? 'Text' : 'Find';
            case 'number-to-string':
                return 'Value';
            case 'memory-write-number':
            case 'memory-write-string':
            case 'memory-write-boolean':
                return index === 0 ? 'Value' : 'Reset';
            case 'memory-delete':
            case 'memory-increment':
                return 'Trigger';
            case 'memory-array-append':
            case 'memory-array-remove':
                return index === 0 ? 'Item' : 'Trigger';
            case 'event-processor':
                return index === 0 ? 'Event' : 'Payload';
            case 'bool-count':
                return `Bool ${index + 1}`;
            case 'color':
                return '';
            case 'gradient': {
                const colorCount = getGradientColorCount(element);
                if (index < colorCount) {
                    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                    const suffix = index < alphabet.length ? alphabet[index] : String(index + 1);
                    return `Color ${suffix}`;
                }
                if (index === colorCount) return 'Angle';
                return '';
            }
            case 'custom-node': {
                const schema = Array.isArray(element.data?.customInputSchema) ? element.data?.customInputSchema : [];
                return schema[index]?.label || `Input ${index + 1}`;
            }
            case 'unzip':
                return 'Zip';
            case 'math':
                return 'Value';
            case 'number':
                return 'Value';
            case 'constant-boolean':
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
                if (!customNodeMode && index === 0) return 'Element';
                const valueIndex = customNodeMode ? index : index - 1;
                if (customNodeMode && element.data?.outputLabels) {
                    return element.data.outputLabels[valueIndex] || outputInputLabels[valueIndex] || '';
                }
                return outputInputLabels[valueIndex] || '';
            }
            case 'node':
                if (index === 0) return 'Condition';
                if (index === 1) return 'True';
                if (index === 2) return 'False';
                return '';
            case 'node-branch':
                if (index === 0) return 'Condition';
                return 'Value';
            case 'switch-branch':
                if (index === 0) return 'Value';
                if (index === 1) return 'Compare';
                return `Case ${index - 2}`;
            case 'css-unit':
                return 'Number';
            case 'css-margin':
            case 'css-padding':
                if (index === 0) return 'Top';
                if (index === 1) return 'Right';
                if (index === 2) return 'Bottom';
                return 'Left';
            case 'css-width':
            case 'css-height':
            case 'css-font-size':
                return 'Value';
            case 'css-color':
                return 'Color';
            case 'css-text':
            case 'css-display':
                return '';
            case 'and':
            case 'or':
                return index === 0 ? 'A' : 'B';
            case 'fallback':
                return index === 0 ? 'Primary' : 'Fallback';
            case 'clamp':
                if (index === 0) return 'Value';
                if (index === 1) return 'Min';
                return 'Max';
            case 'min-val':
            case 'max-val':
                return index === 0 ? 'A' : 'B';
            case 'string-split':
            case 'string-replace':
            case 'string-trim':
            case 'string-upper':
            case 'string-lower':
                return 'Text';
            case 'string-includes':
                return index === 0 ? 'Text' : 'Find';
            case 'number-parse':
                return 'Text';
            case 'number-to-base':
                return 'Number';
            case 'multi-concat':
                return `Text ${index + 1}`;
            case 'css-join':
                return `CSS ${index + 1}`;
            case 'array':
                return 'Type';
            case 'array-push':
                return index === 0 ? 'Array' : 'Value';
            case 'array-pop':
            case 'array-sort':
                return 'Array';
            case 'array-remove-index':
                return index === 0 ? 'Array' : 'Index';
            case 'array-replace-index':
                if (index === 0) return 'Array';
                if (index === 1) return 'Index';
                return 'Value';
            case 'image-from-link':
                return 'URL';
            case 'image-from-element':
                return 'Element';
            case 'get-children':
                return 'Element';
            case 'api-request':
            case 'api-status':
                return index === 0 ? 'URL' : 'Body';
            case 'api-field':
                return index === 0 ? 'Source' : 'Path';
            case 'api-list-mapper':
                return index === 0 ? 'Request Data' : `Input ${index + 1}`;
            case 'action-event':
                // input0 stays the existing 'action' attach-to-parent slot;
                // input1 is the Element pin, not a generic 'Value' pin.
                return index === 0 ? 'Action' : 'Element';
            case 'action-block':
            case 'action-required':
            case 'action-min':
            case 'action-max':
            case 'action-length':
            case 'action-regex':
            case 'action-add-class':
            case 'action-remove-class':
            case 'action-toggle-class':
                if (index === 0) return 'Action';
                if (element.type === 'action-if') return 'Condition';
                if (element.type === 'action-length') return index === 1 ? 'Min' : 'Max';
                return 'Value';
            case 'event-element':
            case 'event-id':
            case 'event-hover':
            case 'event-scroll':
                return 'Element';
            case 'chart-data':
                return index === 0 ? 'Label' : 'Value';
            case 'element-property':
                return 'Element';
            // New action nodes
            case 'action-set-text':
            case 'action-set-html':
            case 'action-set-value':
            case 'action-set-attr':
            case 'action-set-style':
            case 'action-set-visibility':
            case 'action-enable':
            case 'action-disable':
            case 'action-focus':
            case 'action-scroll-to':
            case 'action-notify':
            case 'action-redirect':
            case 'action-trigger-event':
                if (index === 0) return 'Action';
                if (index === 1) return 'Value';
                return '';
            // New event nodes — no inputs
            // New array nodes
            case 'array-map':
                return index === 0 ? 'Array' : 'Value';
            case 'array-filter':
                return index === 0 ? 'Array' : 'Condition';
            case 'array-reduce':
                return 'Array';
            case 'array-find':
                return index === 0 ? 'Array' : 'Value';
            case 'array-for-each':
                return index === 0 ? 'Array' : 'Index';
            case 'array-collect':
                return 'Item';
            case 'array-contains':
                return index === 0 ? 'Array' : 'Value';
            case 'array-length':
                return 'Array';
            case 'array-merge':
                return index === 0 ? 'Array A' : 'Array B';
            case 'array-unique':
                return 'Array';
            default:
                return `Input ${index + 1}`;
        }
    };

    const getOutputLabel = (element: CanvasElement, index: number): string => {
        switch (element.type) {
            case 'case-range':
            case 'case-value':
            case 'case-default':
            case 'switch':
            case 'node':
            case 'calculation':
            case 'condition':
                return 'Result';
            case 'node-branch':
                return index === 0 ? 'True' : 'False';
            case 'switch-branch':
                {
                    const caseConnections = connections
                        .filter(c => c.toId === element.id && c.toInput.startsWith('input') && getInputIndex(c.toInput) >= 2)
                        .sort((a, b) => getInputIndex(a.toInput) - getInputIndex(b.toInput));
                    const source = caseConnections[index] ? elementsById.get(caseConnections[index].fromId) : null;
                    return source?.type === 'case-default' ? 'Default' : `Case ${index}`;
                }
            case 'element-id':
            case 'memory-read-number':
            case 'memory-read-string':
            case 'memory-read-boolean':
            case 'memory-write-number':
            case 'memory-write-string':
            case 'memory-write-boolean':
            case 'memory-has':
            case 'memory-delete':
            case 'memory-increment':
            case 'memory-array-append':
            case 'memory-array-remove':
            case 'event-element':
            case 'event-id':
            case 'event-processor':
            case 'element':
            case 'number':
            case 'constant-boolean':
            case 'constant-string':
            case 'operator':
            case 'math':
            case 'comparison':
            case 'logic':
            case 'constant':
            case 'variable':
            case 'not':
            case 'and':
            case 'or':
            case 'fallback':
            case 'clamp':
                return 'Value';
            case 'element-property': {
                const keys = resolveElementPropertyOrderedKeys(element);
                if (getElementPropertyMode(element) === 'single') {
                    return keys[0] || 'Value';
                }
                return keys[index] || `Output ${index + 1}`;
            }
            case 'element-ref':
                return 'Element';
            // New event nodes
            case 'event-hover':
            case 'event-scroll':
            case 'event-page-load':
            case 'event-timer':
            case 'event-custom':
                return 'Event';
            // New array nodes
            case 'array-map':
            case 'array-filter':
            case 'array-collect':
            case 'array-merge':
            case 'array-unique':
                return 'Array';
            case 'array-for-each':
                return index === 0 ? 'Item' : 'Index';
            case 'array-find':
                return index === 0 ? 'Indexes' : 'Count';
            case 'array-contains':
                return 'Result';
            case 'array-length':
                return 'Length';
            case 'get-children': {
                const mode = readGetChildrenMode(element.data);
                if (mode === 'single') return 'Child';
                if (readGetChildrenReturnAs(element.data) === 'children') return 'Children';
                // Child return-as: one pin per selected/all child, labelled by its
                // live descriptor when known.
                const childIndex = getChildrenPinChildIndex(element.data, index);
                if (childIndex === null) return `Child ${index}`;
                const detected = getGetChildrenDetectedChildren(element.id).find(
                    (child) => child.index === childIndex
                );
                return detected ? detected.label : `Child ${childIndex}`;
            }
            case 'array-reduce':
                return 'Value';
            case 'regex':
                return 'Match';
            case 'concat':
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
            case 'string-trim':
            case 'string-upper':
            case 'string-lower':
                return 'Value';
            case 'string-includes':
                return 'Result';
            case 'color':
            case 'gradient':
                return 'Color';
            case 'custom-node':
                return element.data?.zipOutput || element.data?.customNodeTypeCarrier
                    ? 'Zip'
                    : (
                        (Array.isArray(element.data?.customOutputSchema) && element.data.customOutputSchema.length > 0)
                            ? (element.data.customOutputSchema[index]?.label || `Output ${index + 1}`)
                            : (getCustomNodeOutputSchema(element.data?.customNodeId)[index]?.label || `Output ${index + 1}`)
                    );
            case 'unzip': {
                const schema = Array.isArray(element.data?.customOutputSchema) && element.data.customOutputSchema.length > 0
                    ? element.data.customOutputSchema
                    : getCustomNodeOutputSchema(element.data?.customNodeId);
                return schema[index]?.label || `Output ${index + 1}`;
            }
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
            case 'array':
            case 'array-push':
            case 'array-pop':
            case 'array-sort':
            case 'array-remove-index':
            case 'array-replace-index':
                return 'Array';
            case 'image-from-link':
            case 'image-from-element':
                return 'Image';
            case 'api-request':
                return 'Data';
            case 'api-status':
                return 'Status';
            case 'api-field':
                return 'Value';
            case 'api-list-mapper':
                return 'Array';
            case 'output':
                return 'Action';
            case 'action-if':
                return index === 0 ? 'True' : 'False';
            case 'action-event':
            case 'action-block':
            case 'action-required':
            case 'action-min':
            case 'action-max':
            case 'action-length':
            case 'action-regex':
            case 'action-add-class':
            case 'action-remove-class':
            case 'action-toggle-class':
                return 'Action';
            case 'chart-data':
                return 'Zip';
            default:
                return `Output-${index + 1}`;
        }
    };

    const getConnectedInputIndexesForElement = (
        elementId: string,
        sourceConnections: Connection[] = connectionsRef.current
    ): number[] => {
        return Array.from(new Set(sourceConnections
            .filter((connection) => connection.toId === elementId && connection.toInput.startsWith('input'))
            .map((connection) => getInputIndex(connection.toInput))
            .filter((index) => Number.isFinite(index) && index >= 0)))
            .sort((a, b) => a - b);
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
                if (element.type === 'switch-branch') {
                    return { startIndex: 2, label: 'Case' };
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
                    const labelNumber = dynamicConfig.label === 'Case' ? index : index + 1;
                    errors[element.id] = `${dynamicConfig.label} ${labelNumber} is missing while lower pins are connected.`;
                    break;
                }
            }
        });

        return errors;
    };

    const resolveZipSchema = (
        elementId: string,
        allElements: CanvasElement[],
        allConnections: Connection[],
        depth = 0
    ): Array<{ id: string; label: string; type: string }> => {
        if (depth > 20) return [];
        const el = allElements.find((item) => item.id === elementId);
        if (!el) return [];

        if (el.type === 'custom-node') {
            return Array.isArray(el.data?.customOutputSchema) ? el.data.customOutputSchema : [];
        }

        if (el.type === 'chart-data') {
            return [
                { id: 'label', label: 'label', type: 'string' },
                { id: 'value', label: 'value', type: 'number' },
            ];
        }

        const traceInputs: string[] = [];
        if (el.type === 'switch') {
            traceInputs.push('input0');
            const caseConns = allConnections.filter((connection) => connection.toId === el.id && getInputIndex(connection.toInput) > 0);
            caseConns.forEach((connection) => traceInputs.push(connection.toInput));
        } else if (el.type === 'node') {
            traceInputs.push('input1', 'input2');
        } else if (el.type === 'case-range' || el.type === 'case-value') {
            traceInputs.push(el.type === 'case-range' ? 'input2' : 'input1');
        } else {
            const inConns = allConnections.filter((connection) => connection.toId === el.id);
            inConns.forEach((connection) => traceInputs.push(connection.toInput));
        }

        for (const inputName of traceInputs) {
            const conn = allConnections.find((connection) => connection.toId === el.id && connection.toInput === inputName);
            if (!conn) continue;
            const schema = resolveZipSchema(conn.fromId, allElements, allConnections, depth + 1);
            if (schema.length > 0) return schema;
        }

        return [];
    };

    const dynamicInputGapErrors = React.useMemo(
        () => getDynamicInputGapErrors(elements, connections),
        [elements, connections, customNodeMode]
    );
    const hasDynamicInputGapErrors = Object.keys(dynamicInputGapErrors).length > 0;

    const serializeGraphFormulaLiteral = (value: unknown): string => {
        if (value === null || value === undefined) {
            return '0';
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            return String(value);
        }

        if (typeof value === 'boolean') {
            return value ? 'true' : 'false';
        }

        if (typeof value === 'string') {
            return JSON.stringify(value);
        }

        if (Array.isArray(value)) {
            return `[${value.map((entry) => serializeGraphFormulaLiteral(entry)).join(', ')}]`;
        }

        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch {
                return JSON.stringify(String(value));
            }
        }

        return JSON.stringify(String(value));
    };

    const buildGraphFormulaFromState = (
        allElements: CanvasElement[],
        allConnections: Connection[],
        depth = 0
    ): string => {
        if (depth > 20) {
            return '';
        }

        const elementMap = new Map(allElements.map((item) => [item.id, item]));
        const getConnectionForInput = (elementId: string, inputName: string): Connection | undefined => (
            allConnections.find((connection) => connection.toId === elementId && connection.toInput === inputName)
        );
        const getConnectedExpression = (elementId: string, inputName: string): string | null => {
            const connection = getConnectionForInput(elementId, inputName);
            if (!connection) {
                return null;
            }

            const sourceElement = elementMap.get(connection.fromId);
            if (!sourceElement) {
                return null;
            }

            const outputIndex = Number.parseInt(String(connection.fromOutput || '').replace(/^output/i, ''), 10);
            return buildNodeExpression(sourceElement, Number.isFinite(outputIndex) && outputIndex >= 0 ? outputIndex : 0, depth + 1);
        };
        const getOutgoingConnections = (elementId: string, outputName: string = 'output0'): Connection[] => (
            allConnections.filter((connection) => connection.fromId === elementId && connection.fromOutput === outputName)
        );
        const buildActionPlanExpression = (element: CanvasElement, currentDepth = 0): string | null => {
            if (!element || currentDepth > 24) {
                return null;
            }

            const childExpressions = getOutgoingConnections(element.id)
                .map((connection) => elementMap.get(connection.toId))
                .filter((child): child is CanvasElement => Boolean(child))
                .map((child) => buildActionPlanExpression(child, currentDepth + 1))
                .filter((entry): entry is string => Boolean(entry));

            switch (element.type) {
                case 'action-block':
                    return childExpressions.length > 0 ? `[${childExpressions.join(', ')}]` : null;
                case 'action-if': {
                    const falseChildExpressions = getOutgoingConnections(element.id, 'output1')
                        .map((connection) => elementMap.get(connection.toId))
                        .filter((child): child is CanvasElement => Boolean(child))
                        .map((child) => buildActionPlanExpression(child, currentDepth + 1))
                        .filter((entry): entry is string => Boolean(entry));
                    return `({ type: "actionIf", condition: ${getConnectedExpression(element.id, 'input1') || (element.data?.actionIfCondition ? 'true' : 'false')}, trueActions: [${childExpressions.join(', ')}], falseActions: [${falseChildExpressions.join(', ')}] })`;
                }
                case 'action-event': {
                    // Element input pin (input1 -- input0 stays the existing
                    // 'action' attach-to-parent slot, untouched) wins when
                    // wired -- a live reference, resolved fresh every
                    // execution, exactly like Output's Element pin. Falls back
                    // to the existing sourceId ID control (dropdown/manual)
                    // when unconnected; that fallback is untouched from before
                    // this change.
                    const elementExpr = buildElementInstanceExpr(element, 1);
                    const sourceId = String(element.data?.actionTargetManualId || element.data?.actionTargetId || '').trim();
                    if (!elementExpr && !sourceId) {
                        return null;
                    }
                    const eventType = String(element.data?.actionEventType || 'change');
                    const actionsExpr = childExpressions.length > 0 ? `[${childExpressions.join(', ')}]` : '[]';
                    if (elementExpr) {
                        // __nodeId disambiguates wired action-event nodes for
                        // listener dedup (sourceId is empty in this branch, so
                        // it alone can't distinguish two different wired nodes).
                        // Keys are quoted (matches Output's __element/__executeOnLoad
                        // convention) so the safety-checker's identifier scan, which
                        // only inspects bare/unquoted identifiers, never sees them.
                        return `({ ${JSON.stringify('type')}: "event", ${JSON.stringify('__element')}: ${elementExpr}, ${JSON.stringify('__nodeId')}: ${JSON.stringify(element.id)}, ${JSON.stringify('eventType')}: ${serializeGraphFormulaLiteral(eventType)}, ${JSON.stringify('actions')}: ${actionsExpr} })`;
                    }
                    return `({ type: "event", sourceId: ${serializeGraphFormulaLiteral(sourceId)}, eventType: ${serializeGraphFormulaLiteral(eventType)}, actions: ${actionsExpr} })`;
                }
                case 'action-required':
                    return `({ type: "required", value: ${getConnectedExpression(element.id, 'input1') || (element.data?.actionRequired !== false ? 'true' : 'false')} })`;
                case 'action-min':
                    return `({ type: "min", value: ${getConnectedExpression(element.id, 'input1') || serializeGraphFormulaLiteral(Number(element.data?.actionMin ?? 0))} })`;
                case 'action-max':
                    return `({ type: "max", value: ${getConnectedExpression(element.id, 'input1') || serializeGraphFormulaLiteral(Number(element.data?.actionMax ?? 100))} })`;
                case 'action-length':
                    return `({ type: "length", min: ${getConnectedExpression(element.id, 'input1') || serializeGraphFormulaLiteral(Number(element.data?.actionMinLength ?? 0))}, max: ${getConnectedExpression(element.id, 'input2') || serializeGraphFormulaLiteral(Number(element.data?.actionMaxLength ?? 0))} })`;
                case 'action-regex':
                    return `({ type: "regex", pattern: ${getConnectedExpression(element.id, 'input1') || serializeGraphFormulaLiteral(String(element.data?.actionRegexPattern || ''))} })`;
                case 'action-add-class':
                    return `({ type: "addClass", className: ${getConnectedExpression(element.id, 'input1') || serializeGraphFormulaLiteral(String(element.data?.actionClassName || ''))} })`;
                case 'action-remove-class':
                    return `({ type: "removeClass", className: ${getConnectedExpression(element.id, 'input1') || serializeGraphFormulaLiteral(String(element.data?.actionClassName || ''))} })`;
                case 'action-toggle-class':
                    return `({ type: "toggleClass", className: ${getConnectedExpression(element.id, 'input1') || serializeGraphFormulaLiteral(String(element.data?.actionClassName || ''))} })`;
                case 'action-set-text':
                case 'action-set-html':
                case 'action-set-value':
                case 'action-set-attr':
                case 'action-set-style':
                case 'action-set-visibility':
                case 'action-enable':
                case 'action-disable':
                case 'action-focus':
                case 'action-scroll-to':
                case 'action-notify':
                case 'action-redirect':
                case 'action-trigger-event': {
                    const valueExpression = getConnectedExpression(element.id, 'input1') || serializeGraphFormulaLiteral(element.data?.valueText ?? element.data?.value ?? '');
                    switch (element.type) {
                        case 'action-set-text': return `({ type: "setText", value: ${valueExpression} })`;
                        case 'action-set-html': return `({ type: "setHtml", value: ${valueExpression} })`;
                        case 'action-set-value': return `({ type: "setValue", value: ${valueExpression} })`;
                        case 'action-set-attr': return `({ type: "setAttribute", name: ${serializeGraphFormulaLiteral(String(element.data?.actionAttrName || ''))}, value: ${valueExpression} })`;
                        case 'action-set-style': return `({ type: "setStyle", property: ${serializeGraphFormulaLiteral(String(element.data?.actionStyleProperty || ''))}, value: ${valueExpression} })`;
                        case 'action-set-visibility': return `({ type: "visibility", mode: ${serializeGraphFormulaLiteral(element.data?.actionVisibility || 'toggle')} })`;
                        case 'action-enable': return `({ type: "enable" })`;
                        case 'action-disable': return `({ type: "disable" })`;
                        case 'action-focus': return `({ type: "focus" })`;
                        case 'action-scroll-to': return `({ type: "scrollTo" })`;
                        case 'action-notify': return `({ type: "notify", message: ${serializeGraphFormulaLiteral(String(element.data?.actionNotifyMessage || ''))}, duration: ${serializeGraphFormulaLiteral(Number(element.data?.actionNotifyDuration || 3000))} })`;
                        case 'action-redirect': return `({ type: "redirect", target: ${serializeGraphFormulaLiteral(element.data?.actionRedirectTarget || '_self')}, url: ${valueExpression} })`;
                        case 'action-trigger-event': return `({ type: "triggerEvent", name: ${serializeGraphFormulaLiteral(String(element.data?.actionEventName || ''))} })`;
                        default: return null;
                    }
                }
                default:
                    return null;
            }
        };
        let buildingLoopBody = false;
        const findLoopStart = (elementId: string, visited = new Set<string>()): CanvasElement | null => {
            if (visited.has(elementId)) return null;
            visited.add(elementId);
            const incoming = allConnections.filter((connection) => connection.toId === elementId);
            for (const connection of incoming) {
                const source = elementMap.get(connection.fromId);
                if (!source) continue;
                if (source.type === 'array-for-each') return source;
                const loopStart = findLoopStart(source.id, visited);
                if (loopStart) return loopStart;
            }
            return null;
        };
        const connectedInputExpressionFor = (
            targetElement: CanvasElement,
            inputIndex: number,
            fallback?: unknown
        ): string => {
            const connection = getConnectionForInput(targetElement.id, `input${inputIndex}`);
            if (connection) {
                const sourceElement = elementMap.get(connection.fromId);
                if (sourceElement) {
                    const sourceOutputIndex = Number.parseInt(String(connection.fromOutput || '').replace(/^output/i, ''), 10);
                    return buildNodeExpression(
                        sourceElement,
                        Number.isFinite(sourceOutputIndex) && sourceOutputIndex >= 0 ? sourceOutputIndex : 0,
                        depth + 1
                    );
                }
            }
            return fallback !== undefined ? serializeGraphFormulaLiteral(fallback) : '0';
        };
        // Shared Element-target resolution for every node that has an "Element
        // ID" selector control (mirrors Output's existing Element pin / ID
        // dropdown pattern, generalized): a connected Element input pin always
        // wins; when nothing is wired there, fall back to the node's own ID
        // control resolved through the SAME live element lookup used
        // everywhere else (__nodeGetElement). Both branches yield a live
        // reference expression, evaluated fresh every execution — never a
        // static id/value baked into the compiled formula. One resolution
        // model, reused, rather than a second concept of "target element".
        const resolveElementIdControl = (element: CanvasElement): string =>
            String(
                element.data?.elementUseManualId
                    ? (element.data?.customElementId || '')
                    : (element.data?.selectedElement || '')
            ).trim();
        const buildElementIdLookupExpr = (element: CanvasElement): string => {
            const id = resolveElementIdControl(element);
            return id ? `__nodeGetElement(${serializeGraphFormulaLiteral(id)})` : 'null';
        };
        // `fallbackId`, when passed, overrides which data field is treated as
        // the ID control (e.g. image-from-element's single `elementSelector`
        // text field instead of the standard selectedElement/customElementId
        // pair) — everything else about the resolution order is identical.
        const buildElementSourceExpr = (element: CanvasElement, inputIndex = 0, fallbackId?: string): string => {
            if (!customNodeMode) {
                const connection = getConnectionForInput(element.id, `input${inputIndex}`);
                if (connection) {
                    const sourceElement = elementMap.get(connection.fromId);
                    if (sourceElement) {
                        const sourceOutputIndex = Number.parseInt(String(connection.fromOutput || '').replace(/^output/i, ''), 10);
                        return buildNodeExpression(
                            sourceElement,
                            Number.isFinite(sourceOutputIndex) && sourceOutputIndex >= 0 ? sourceOutputIndex : 0,
                            depth + 1
                        );
                    }
                }
            }
            const id = fallbackId !== undefined ? fallbackId : resolveElementIdControl(element);
            return id ? `__nodeGetElement(${serializeGraphFormulaLiteral(id)})` : 'null';
        };
        const buildNodeExpression = (element: CanvasElement, outputIndex = 0, currentDepth = 0): string => {
            if (!element || currentDepth > 24) {
                return '0';
            }

            const connectedInputExpression = (inputIndex: number, fallback?: unknown): string => {
                const connExpr = getConnectedExpression(element.id, `input${inputIndex}`);
                if (connExpr !== null && connExpr !== undefined) {
                    return connExpr;
                }
                return fallback !== undefined ? serializeGraphFormulaLiteral(fallback) : '0';
            };

            switch (element.type) {
                case 'number': {
                    // `arrayTypeCarrier` is a removed feature; updateElementValueTypes
                    // strips it on load, so a plain scalar is the current contract.
                    const value = element.data?.valueText ?? element.data?.value ?? 0;
                    const parsed = Number(String(value).replace(',', '.'));
                    return Number.isFinite(parsed) ? String(parsed) : '0';
                }
                case 'constant-boolean':
                    return Boolean(element.data?.value) ? 'true' : 'false';
                case 'constant-string':
                    return serializeGraphFormulaLiteral(String(element.data?.value ?? ''));
                case 'color':
                    return serializeGraphFormulaLiteral(String(element.data?.colorValue || '#2563eb'));
                case 'element': {
                    const useManual = !!element.data?.elementUseManualId;
                    const selectedElement = useManual
                        ? String(element.data?.customElementId || '').trim()
                        : String(element.data?.selectedElement || '').trim();
                    const eventType = String(element.data?.eventType || '').trim();
                    return selectedElement && eventType
                        ? `__nodeEvent(${serializeGraphFormulaLiteral(selectedElement)}, ${serializeGraphFormulaLiteral(eventType)})`
                        : selectedElement ? `[${selectedElement}]` : '0';
                }
                case 'element-id':
                    return serializeGraphFormulaLiteral(String(element.data?.elementId || ''));
                case 'element-ref': {
                    // Returns a DOM element reference
                    const useManual = !!element.data?.elementUseManualId;
                    const elId = useManual
                        ? String(element.data?.customElementId || '').trim()
                        : String(element.data?.selectedElement || '').trim();
                    return elId ? `__nodeGetElement(${serializeGraphFormulaLiteral(elId)})` : 'null';
                }
                case 'element-property': {
                    // Extract a property/attribute from the Element input pin
                    // when wired, else the node's own Element ID control.
                    // outputIndex selects which key when the node has several pins
                    // (All / Custom); Single keeps its original single-value behaviour.
                    const sourceExpr = buildElementSourceExpr(element);
                    const propKeys = resolveElementPropertyOrderedKeys(element);
                    const propKey = getElementPropertyMode(element) === 'single'
                        ? (propKeys[0] || '')
                        : (propKeys[outputIndex] || '');
                    if (!propKey) return '0';
                    return `__nodeGetElementProp(${sourceExpr}, ${serializeGraphFormulaLiteral(propKey)})`;
                }
                case 'get-children': {
                    // Direct child elements of the connected element reference.
                    //   single ............. one child at a fixed index -> element
                    //   all + children ..... every child -> one array (legacy default)
                    //   custom + children .. selected children -> one array subset
                    //   all/custom + child . one child per output pin -> element pins
                    // Element input pin when wired, else the node's own Element ID control.
                    const ref = buildElementSourceExpr(element);
                    const mode = readGetChildrenMode(element.data);
                    if (mode === 'single') {
                        return `__nodeGetChildAt(${ref}, ${readGetChildrenSingleIndex(element.data)})`;
                    }
                    if (readGetChildrenReturnAs(element.data) === 'children') {
                        if (mode === 'all') {
                            return `__nodeGetChildren(${ref})`;
                        }
                        const indices = readGetChildrenSelectedIndices(element.data);
                        // Pass the index list as a JSON string, not a bare array
                        // literal: a single-element numeric literal like `[3]`
                        // collides with the `[id]` dynamic-variable syntax and
                        // would be substituted away. __nodeGetChildrenSubset
                        // parses a JSON string of numbers.
                        return `__nodeGetChildrenSubset(${ref}, ${JSON.stringify(`[${indices.join(',')}]`)})`;
                    }
                    // Child return-as: the pin maps to a concrete child index
                    // that does NOT depend on live preview detection, so a wired
                    // pin still resolves on the frontend (all -> pin k = child k;
                    // custom -> the k-th selected index).
                    const childIndex = getChildrenPinChildIndex(element.data, outputIndex);
                    if (childIndex === null) return 'null';
                    return `__nodeGetChildAt(${ref}, ${childIndex})`;
                }
                case 'event-element': {
                    // Element input pin wins when wired -- __nodeEvent accepts a
                    // live reference directly (no id needed, works even when the
                    // element has none, e.g. a For Each item). Falls back to the
                    // existing ID control (manual input or dropdown selection).
                    const elementExpr = buildElementInstanceExpr(element);
                    const targetId = String(
                        element.data?.eventUseManualId
                            ? (element.data?.eventId || '')
                            : (element.data?.eventElement || element.data?.eventId || '')
                    ).trim();
                    const evType = String(element.data?.eventType || 'click');
                    if (elementExpr) {
                        return `__nodeEvent(${elementExpr}, ${serializeGraphFormulaLiteral(evType)})`;
                    }
                    return targetId
                        ? `__nodeEvent(${serializeGraphFormulaLiteral(targetId)}, ${serializeGraphFormulaLiteral(evType)})`
                        : 'null';
                }
                case 'event-id': {
                    // Element input pin wins when wired, else the existing ID control.
                    const elementExpr = buildElementInstanceExpr(element);
                    const useManual = !!element.data?.eventUseManualId;
                    const targetId = useManual
                        ? String(element.data?.eventId || '').trim()
                        : String(element.data?.eventElement || '').trim();
                    const evType = String(element.data?.eventType || 'click');
                    if (elementExpr) {
                        return `__nodeEvent(${elementExpr}, ${serializeGraphFormulaLiteral(evType)})`;
                    }
                    return targetId
                        ? `__nodeEvent(${serializeGraphFormulaLiteral(targetId)}, ${serializeGraphFormulaLiteral(evType)})`
                        : 'null';
                }
                case 'event-hover': {
                    // Element input pin wins when wired, else the existing ID control.
                    const elementExpr = buildElementInstanceExpr(element);
                    const targetId = String(element.data?.eventUseManualId ? (element.data?.eventId || '') : (element.data?.eventElement || element.data?.selectedElement || '')).trim();
                    const hoverModeExpr = serializeGraphFormulaLiteral(element.data?.eventHoverMode || 'enter');
                    if (elementExpr) {
                        return `__nodeHoverEvent(${elementExpr}, ${hoverModeExpr})`;
                    }
                    return targetId ? `__nodeHoverEvent(${serializeGraphFormulaLiteral(targetId)}, ${hoverModeExpr})` : 'null';
                }
                case 'event-scroll': {
                    // Element input pin wins when wired, else the existing ID control.
                    const elementExpr = buildElementInstanceExpr(element);
                    const targetId = String(element.data?.eventUseManualId ? (element.data?.eventId || '') : (element.data?.eventElement || element.data?.selectedElement || '')).trim();
                    if (elementExpr) {
                        return `__nodeEvent(${elementExpr}, "scroll")`;
                    }
                    return targetId ? `__nodeEvent(${serializeGraphFormulaLiteral(targetId)}, "scroll")` : 'null';
                }
                case 'event-page-load': return '__nodePageLoadEvent()';
                case 'event-timer': return `__nodeTimerEvent(${serializeGraphFormulaLiteral(Number(element.data?.eventTimerInterval || 1000))}, ${serializeGraphFormulaLiteral(element.data?.eventTimerMode || 'interval')})`;
                case 'event-custom': return `__nodeCustomEvent(${serializeGraphFormulaLiteral(String(element.data?.eventCustomName || ''))})`;
                case 'fallback':
                    return `__nodeFallback(${connectedInputExpression(0)}, ${connectedInputExpression(1)})`;
                case 'concat':
                case 'multi-concat': {
                    const inputCount = Math.max(2, getInputCount(element));
                    const parts = Array.from({ length: inputCount }, (_, index) => connectedInputExpression(index));
                    return `__nodeConcat(${parts.join(', ')})`;
                }
                case 'cut-a':
                    return `__nodeCutA(${connectedInputExpression(0)}, ${connectedInputExpression(1)}, ${connectedInputExpression(2)})`;
                case 'cut-b':
                    return `__nodeCutB(${connectedInputExpression(0)}, ${connectedInputExpression(1)}, ${connectedInputExpression(2)})`;
                case 'cut-c':
                    return `__nodeCutC(${connectedInputExpression(0)}, ${connectedInputExpression(1)}, ${connectedInputExpression(2)})`;
                case 'string-trim':
                    return `${connectedInputExpression(0)}.trim()`;
                case 'string-upper':
                    return `${connectedInputExpression(0)}.toUpperCase()`;
                case 'string-lower':
                    return `${connectedInputExpression(0)}.toLowerCase()`;
                case 'string-to-number':
                    return `__nodeToNumber(${connectedInputExpression(0)})`;
                case 'number-to-string':
                    return `__nodeToString(${connectedInputExpression(0)})`;
                case 'number-parse':
                    return `__nodeParseRadix(${connectedInputExpression(0)}, ${serializeGraphFormulaLiteral(Number(element.data?.parseRadix ?? 10))})`;
                case 'number-to-base':
                    return `__nodeToBase(${connectedInputExpression(0)}, ${serializeGraphFormulaLiteral(Number(element.data?.parseRadix ?? 16))}, ${serializeGraphFormulaLiteral(Number(element.data?.minLength ?? 0))})`;
                case 'math':
                    return connectedInputExpression(0);
                case 'calculation': {
                    const defaultOperation = String(element.data?.operation || '+');
                    const operations = element.data?.inputOperations || {};
                    // getInputCount() keeps one extra empty slot for the "add
                    // input" affordance. Including it in the formula appends a
                    // spurious `OP 0` operand — harmless for +/- but it zeroes a
                    // `*`, and breaks `/` `%` `**`. Count only slots that are
                    // wired or carry an explicit manual value.
                    const wiredIdx = allConnections
                        .filter((c) => c.toId === element.id && /^input\d+$/i.test(String(c.toInput || '')))
                        .map((c) => getInputIndex(c.toInput));
                    const manualIdx = Array.isArray(element.data?.inputValues)
                        ? element.data.inputValues
                            .map((v, i) => (v !== undefined && v !== null && String(v).trim() !== '' ? i : -1))
                            .filter((i) => i >= 0)
                        : [];
                    const maxIdx = Math.max(-1, ...wiredIdx, ...manualIdx);
                    const inputCount = Math.max(1, maxIdx + 1);
                    const values = Array.from({ length: inputCount }, (_, index) => (
                        connectedInputExpression(index, element.data?.inputValues?.[index] ?? 0)
                    ));

                    if (values.length === 0) {
                        return '0';
                    }

                    if (values.length === 1) {
                        return values[0];
                    }

                    const allowedOperations = new Set(['+', '-', '*', '/', '**', '%', '===', '!==', '>', '<', '>=', '<=']);
                    let expression = values[0] || '0';
                    for (let i = 1; i < values.length; i += 1) {
                        const opKey = `input${i - 1}`;
                        const op = String(operations[opKey] || defaultOperation || '+').trim();
                        const safeOp = allowedOperations.has(op) ? op : '+';
                        expression = `(${expression} ${safeOp} ${values[i] || '0'})`;
                    }

                    return expression;
                }
                case 'condition': {
                    const requestedOperation = String(element.data?.operation || '===').trim();
                    const allowedOperations = new Set(['===', '!==', '>', '<', '>=', '<=']);
                    const operation = allowedOperations.has(requestedOperation) ? requestedOperation : '===';
                    return `(${connectedInputExpression(0)} ${operation} ${connectedInputExpression(1)})`;
                }
                case 'regex':
                    return `__nodeRegex(${connectedInputExpression(0)}, ${serializeGraphFormulaLiteral(String(element.data?.regexPattern || ''))})`;
                // Boolean-logic / math / string nodes that previously fell through
                // to `default` (a silent input0 pass-through). These use only
                // operators / members the evaluator already whitelists — no new
                // runtime helper, allow-list, or eval-context entry.
                case 'not':
                    return `(!(${connectedInputExpression(0, false)}))`;
                case 'and':
                    return `((${connectedInputExpression(0, false)}) && (${connectedInputExpression(1, false)}))`;
                case 'or':
                    return `((${connectedInputExpression(0, false)}) || (${connectedInputExpression(1, false)}))`;
                case 'clamp':
                    return `Math.min(Math.max(Number(${connectedInputExpression(0, 0)}), Number(${connectedInputExpression(1, 0)})), Number(${connectedInputExpression(2, 0)}))`;
                case 'min-val':
                    return `Math.min(Number(${connectedInputExpression(0, 0)}), Number(${connectedInputExpression(1, 0)}))`;
                case 'max-val':
                    return `Math.max(Number(${connectedInputExpression(0, 0)}), Number(${connectedInputExpression(1, 0)}))`;
                case 'string-includes':
                    return `String(${connectedInputExpression(0, '')}).includes(String(${connectedInputExpression(1, '')}))`;
                case 'string-count-chars':
                    return `String(${connectedInputExpression(0, '')}).length`;
                case 'string-count-words':
                    return `__nodeCountWords(${connectedInputExpression(0, '')})`;
                case 'string-find-start':
                    return `__nodeFindStart(${connectedInputExpression(0, '')}, ${connectedInputExpression(1, '')})`;
                case 'string-find-end':
                    return `__nodeFindEnd(${connectedInputExpression(0, '')}, ${connectedInputExpression(1, '')})`;
                case 'bool-count': {
                    const inputCount = Math.max(1, getInputCount(element));
                    const parts = Array.from({ length: inputCount }, (_, index) => connectedInputExpression(index));
                    return `__nodeCountTrue(${parts.join(', ')})`;
                }
                case 'string-split': {
                    const delimiter = String(element.data?.splitDelimiter ?? ',');
                    const index = Number(element.data?.splitIndex ?? 0);
                    return `(String(${connectedInputExpression(0, '')}).split(${serializeGraphFormulaLiteral(delimiter)})[${serializeGraphFormulaLiteral(index)}] ?? '')`;
                }
                case 'string-replace': {
                    const find = String(element.data?.replaceFind ?? '');
                    const replaceWith = String(element.data?.replaceWith ?? '');
                    return `String(${connectedInputExpression(0, '')}).split(${serializeGraphFormulaLiteral(find)}).join(${serializeGraphFormulaLiteral(replaceWith)})`;
                }
                // Memory nodes: runtime helpers (__nodeMemoryGet/Set/Has/Delete/
                // Increment/ArrayAppend/ArrayRemove) already exist in frontend.js;
                // these cases were entirely missing (silent input0 pass-through).
                // `memoryScope` ('widget' default | 'page') is a compile-time
                // literal baked into the call; the runtime combines it with the
                // per-logic-block blockScope so duplicated Elementor widgets never
                // collide on the same variable name -- see __nodeMemoryResolveKey.
                case 'memory-read-number':
                case 'memory-read-string':
                case 'memory-read-boolean': {
                    const key = serializeGraphFormulaLiteral(String(element.data?.variableKey || ''));
                    const persistExpr = element.data?.persistVariable ? 'true' : 'false';
                    const scope = serializeGraphFormulaLiteral(String(element.data?.memoryScope || 'widget'));
                    if (element.type === 'memory-read-number') {
                        const defaultExpr = serializeGraphFormulaLiteral(Number(element.data?.defaultValue ?? 0));
                        return `Number(__nodeMemoryGet(${key}, ${defaultExpr}, ${persistExpr}, ${scope}))`;
                    }
                    if (element.type === 'memory-read-boolean') {
                        const defaultExpr = serializeGraphFormulaLiteral(Boolean(element.data?.defaultValue ?? false));
                        return `!!(__nodeMemoryGet(${key}, ${defaultExpr}, ${persistExpr}, ${scope}))`;
                    }
                    const defaultExpr = serializeGraphFormulaLiteral(String(element.data?.defaultValue ?? ''));
                    return `__nodeToString(__nodeMemoryGet(${key}, ${defaultExpr}, ${persistExpr}, ${scope}))`;
                }
                case 'memory-write-number':
                case 'memory-write-string':
                case 'memory-write-boolean': {
                    const key = serializeGraphFormulaLiteral(String(element.data?.variableKey || ''));
                    const fallbackValue = element.type === 'memory-write-boolean' ? false : element.type === 'memory-write-string' ? '' : 0;
                    const valueExpr = connectedInputExpression(0, fallbackValue);
                    const resetExpr = connectedInputExpression(1, false);
                    const scope = serializeGraphFormulaLiteral(String(element.data?.memoryScope || 'widget'));
                    return `__nodeMemorySet(${key}, ${valueExpr}, ${resetExpr}, ${scope})`;
                }
                case 'memory-has': {
                    const key = serializeGraphFormulaLiteral(String(element.data?.variableKey || ''));
                    const scope = serializeGraphFormulaLiteral(String(element.data?.memoryScope || 'widget'));
                    return `__nodeMemoryHas(${key}, ${scope})`;
                }
                case 'memory-delete': {
                    const key = serializeGraphFormulaLiteral(String(element.data?.variableKey || ''));
                    // Unwired Trigger compiles to the literal `true`, so
                    // __nodeMemoryConsumeTrigger fires on every evaluation --
                    // matching plain memory-write's "apply every pass" default.
                    const triggerExpr = connectedInputExpression(0, true);
                    const scope = serializeGraphFormulaLiteral(String(element.data?.memoryScope || 'widget'));
                    return `__nodeMemoryDelete(${key}, ${triggerExpr}, ${scope})`;
                }
                case 'memory-increment': {
                    const key = serializeGraphFormulaLiteral(String(element.data?.variableKey || ''));
                    const stepExpr = serializeGraphFormulaLiteral(Number(element.data?.incrementStep ?? 1));
                    const triggerExpr = connectedInputExpression(0, true);
                    const persistExpr = element.data?.persistVariable ? 'true' : 'false';
                    const scope = serializeGraphFormulaLiteral(String(element.data?.memoryScope || 'widget'));
                    return `__nodeMemoryIncrement(${key}, ${stepExpr}, ${triggerExpr}, ${persistExpr}, ${scope})`;
                }
                case 'memory-array-append':
                case 'memory-array-remove': {
                    const key = serializeGraphFormulaLiteral(String(element.data?.variableKey || ''));
                    const itemExpr = connectedInputExpression(0, '');
                    const triggerExpr = connectedInputExpression(1, true);
                    const persistExpr = element.data?.persistVariable ? 'true' : 'false';
                    const scope = serializeGraphFormulaLiteral(String(element.data?.memoryScope || 'widget'));
                    const fn = element.type === 'memory-array-append' ? '__nodeMemoryArrayAppend' : '__nodeMemoryArrayRemove';
                    return `${fn}(${key}, ${itemExpr}, ${triggerExpr}, ${persistExpr}, ${scope})`;
                }
                // CSS / gradient / event-processor: the runtime helpers
                // (__nodeCssJoin, __nodeGradient, __nodeEventProcessor) and the
                // node config UIs already exist; the formula-gen cases were lost
                // in a generator rewrite. Restored here — no new runtime code.
                case 'css-unit':
                    return `(__nodeToString(${connectedInputExpression(0, 0)}) + ${serializeGraphFormulaLiteral(String(element.data?.cssUnit || 'px'))})`;
                case 'css-display':
                    return serializeGraphFormulaLiteral(String(element.data?.cssDisplay || 'block'));
                case 'css-text':
                    return serializeGraphFormulaLiteral(String(element.data?.cssText || ''));
                case 'css-color':
                case 'css-width':
                case 'css-height':
                case 'css-font-size':
                    // Relay the value; the concrete CSS property is applied by
                    // the Output node's dedicated pin.
                    return `__nodeToString(${connectedInputExpression(0, '')})`;
                case 'css-margin':
                case 'css-padding': {
                    // Top / Right / Bottom / Left -> space-separated shorthand
                    // value, built from the wired sides only.
                    const wired = [0, 1, 2, 3].filter((i) => getConnectionForInput(element.id, `input${i}`));
                    if (wired.length === 0) return serializeGraphFormulaLiteral('');
                    const args: string[] = [];
                    wired.forEach((i, idx) => {
                        if (idx > 0) args.push('" "');
                        args.push(connectedInputExpression(i, ''));
                    });
                    return `__nodeConcat(${args.join(', ')})`;
                }
                case 'css-join': {
                    const inputCount = Math.max(2, getInputCount(element));
                    const parts = Array.from({ length: inputCount }, (_, i) => connectedInputExpression(i, ''));
                    return `__nodeCssJoin(${parts.join(', ')})`;
                }
                case 'gradient': {
                    const colorCount = getGradientColorCount(element);
                    const colorExprs = Array.from({ length: colorCount }, (_, i) => {
                        const conn = getConnectionForInput(element.id, `input${i}`);
                        const src = conn ? elementMap.get(conn.fromId) : null;
                        return src
                            ? buildNodeExpression(src, Number.parseInt(String(conn!.fromOutput || '').replace(/^output/i, ''), 10) || 0, currentDepth + 1)
                            : serializeGraphFormulaLiteral(getGradientColorByIndex(element, i));
                    });
                    const angleConn = getConnectionForInput(element.id, `input${colorCount}`);
                    const angleSrc = angleConn ? elementMap.get(angleConn.fromId) : null;
                    const angleExpr = angleSrc
                        ? buildNodeExpression(angleSrc, Number.parseInt(String(angleConn!.fromOutput || '').replace(/^output/i, ''), 10) || 0, currentDepth + 1)
                        : String(Number(element.data?.gradientAngle ?? 90) || 90);
                    return `__nodeGradient(${angleExpr}, ${colorExprs.join(', ')})`;
                }
                case 'event-processor': {
                    const eventExpr = getConnectedExpression(element.id, 'input0') || 'undefined';
                    const payloadExpr = getConnectedExpression(element.id, 'input1') || 'undefined';
                    return `__nodeEventProcessor(${eventExpr}, ${payloadExpr}, ${element.data?.passOnlyOnEvent === true ? 'true' : 'false'})`;
                }
                case 'node': {
                    const condition = connectedInputExpression(0, true);
                    const whenTrue = getConnectedExpression(element.id, 'input1') || 'undefined';
                    const whenFalse = getConnectedExpression(element.id, 'input2') || 'undefined';
                    return `((${condition}) ? (${whenTrue}) : (${whenFalse}))`;
                }
                case 'node-branch': {
                    const condition = connectedInputExpression(0, false);
                    const value = connectedInputExpression(1, undefined);
                    return `((${condition}) ? (${outputIndex === 0 ? value : 'undefined'}) : (${outputIndex === 1 ? value : 'undefined'}))`;
                }
                case 'case-value':
                    return connectedInputExpression(1, element.data?.out ?? 0);
                case 'case-range':
                    return connectedInputExpression(2, element.data?.out ?? 0);
                case 'switch': {
                    const switchValue = connectedInputExpression(0, undefined);
                    const caseConnections = allConnections
                        .filter((connection) => (
                            connection.toId === element.id
                            && connection.toInput.startsWith('input')
                            && getInputIndex(connection.toInput) > 0
                        ))
                        .sort((a, b) => getInputIndex(a.toInput) - getInputIndex(b.toInput));

                    const caseClauses: Array<{ condition: string; result: string }> = [];
                    let defaultResult: string | null = null;

                    caseConnections.forEach((connection) => {
                        const caseElement = elementMap.get(connection.fromId);
                        if (!caseElement) return;

                        if (caseElement.type === 'case-default') {
                            defaultResult = connectedInputExpressionFor(caseElement, 0, caseElement.data?.out ?? 0);
                            return;
                        }

                        if (caseElement.type === 'case-value') {
                            caseClauses.push({
                                condition: `__nodeCaseEquals(${switchValue}, ${connectedInputExpressionFor(caseElement, 0, caseElement.data?.caseValue ?? 0)})`,
                                result: connectedInputExpressionFor(caseElement, 1, caseElement.data?.out ?? 0),
                            });
                            return;
                        }

                        if (caseElement.type === 'case-range') {
                            const min = connectedInputExpressionFor(caseElement, 0, caseElement.data?.min ?? 0);
                            const max = connectedInputExpressionFor(caseElement, 1, caseElement.data?.max ?? 0);
                            caseClauses.push({
                                condition: `(Number(${switchValue}) >= Math.min(Number(${min}), Number(${max})) && Number(${switchValue}) <= Math.max(Number(${min}), Number(${max})))`,
                                result: connectedInputExpressionFor(caseElement, 2, caseElement.data?.out ?? 0),
                            });
                        }
                    });

                    const ultimateFallback = defaultResult ?? '0';

                    return caseClauses.reduceRight(
                        (fallback, clause) => `((${clause.condition}) ? (${clause.result}) : (${fallback}))`,
                        ultimateFallback
                    );
                }
                case 'switch-branch': {
                    const branchValue = connectedInputExpression(0, undefined);
                    const compareValue = connectedInputExpression(1, undefined);
                    const cases = allConnections
                        .filter(connection => connection.toId === element.id && getInputIndex(connection.toInput) > 0)
                        .sort((a, b) => getInputIndex(a.toInput) - getInputIndex(b.toInput));
                    const selected = cases[outputIndex];
                    if (!selected) return 'undefined';
                    const caseElement = elementMap.get(selected.fromId);
                    if (!caseElement) return 'undefined';
                    const caseValue = caseElement.type === 'case-default'
                        ? 'true'
                        : caseElement.type === 'case-range'
                        ? `(${compareValue} >= Math.min(${connectedInputExpressionFor(caseElement, 0, 0)}, ${connectedInputExpressionFor(caseElement, 1, 0)}) && ${compareValue} <= Math.max(${connectedInputExpressionFor(caseElement, 0, 0)}, ${connectedInputExpressionFor(caseElement, 1, 0)}))`
                        : `__nodeCaseEquals(${compareValue}, ${connectedInputExpressionFor(caseElement, 0, caseElement.data?.caseValue ?? 0)})`;
                    return `((${caseValue}) ? (${branchValue}) : undefined)`;
                }
                case 'array': {
                    return '[]';
                }
                case 'array-push':
                    return `__nodeArrayPush(${connectedInputExpression(0)}, ${connectedInputExpression(1)})`;
                case 'array-pop':
                    return `__nodeArrayPop(${connectedInputExpression(0)})`;
                case 'array-sort':
                    return `__nodeArraySort(${connectedInputExpression(0)}, ${serializeGraphFormulaLiteral(element.data?.sortMode || 'number-asc')}, ${serializeGraphFormulaLiteral(element.data?.arraySortField || '')})`;
                case 'array-remove-index':
                    return `__nodeArrayRemove(${connectedInputExpression(0)}, ${connectedInputExpression(1)})`;
                case 'array-replace-index':
                    return `__nodeArrayReplace(${connectedInputExpression(0)}, ${connectedInputExpression(1)}, ${connectedInputExpression(2)})`;
                case 'array-map': {
                    const previousLoopMode = buildingLoopBody;
                    buildingLoopBody = true;
                    const mappedExpression = connectedInputExpression(1);
                    buildingLoopBody = previousLoopMode;
                    return `__nodeArrayMapGraph(${connectedInputExpression(0)}, ${serializeGraphFormulaLiteral(mappedExpression)})`;
                }
                case 'array-filter': {
                    const previousLoopMode = buildingLoopBody;
                    buildingLoopBody = true;
                    const predicateExpression = connectedInputExpression(1);
                    buildingLoopBody = previousLoopMode;
                    return `__nodeArrayFilterGraph(${connectedInputExpression(0)}, ${serializeGraphFormulaLiteral(predicateExpression)})`;
                }
                case 'array-reduce': return `__nodeArrayReduce(${connectedInputExpression(0)}, ${serializeGraphFormulaLiteral(element.data?.arrayReduceOperation || 'sum')}, ${serializeGraphFormulaLiteral(element.data?.arrayReduceInitial || '0')})`;
                case 'array-find': return `__nodeUnzip(__nodeArrayFind(${connectedInputExpression(0)}, ${connectedInputExpression(1)}, ${serializeGraphFormulaLiteral(element.data?.arraySearchField || '')}), ${outputIndex})`;
                case 'array-for-each':
                    if (buildingLoopBody) return outputIndex === 1 ? '__nodeLoopIndex' : '__nodeLoopItem';
                    return `__nodeArrayForEach(${connectedInputExpression(0)})`;
                case 'array-collect': {
                    const sourceConnection = getConnectionForInput(element.id, 'input0');
                    const sourceElement = sourceConnection ? elementMap.get(sourceConnection.fromId) : null;
                    const loopStart = sourceElement?.type === 'array-for-each'
                        ? sourceElement
                        : sourceElement
                            ? findLoopStart(sourceElement.id)
                            : null;
                    if (!loopStart || !sourceElement) return `__nodeArrayCollect(${connectedInputExpression(0)})`;

                    const arrayExpression = connectedInputExpressionFor(loopStart, 0, []);
                    const previousLoopMode = buildingLoopBody;
                    buildingLoopBody = true;
                    const sourceOutputIndex = Number.parseInt(String(sourceConnection?.fromOutput || '').replace(/^output/i, ''), 10);
                    const bodyExpression = buildNodeExpression(sourceElement, Number.isFinite(sourceOutputIndex) ? sourceOutputIndex : 0, currentDepth + 1);
                    buildingLoopBody = previousLoopMode;
                    return `__nodeArrayMapGraph(${arrayExpression}, ${serializeGraphFormulaLiteral(bodyExpression)})`;
                }
                case 'array-contains': return `__nodeArrayContains(${connectedInputExpression(0)}, ${connectedInputExpression(1)})`;
                case 'array-length': return `__nodeArrayLength(${connectedInputExpression(0)})`;
                case 'array-merge': return `__nodeArrayMerge(${connectedInputExpression(0)}, ${connectedInputExpression(1)}, ${serializeGraphFormulaLiteral(element.data?.arrayMergeMode || 'concat')})`;
                case 'array-unique': return `__nodeArrayUnique(${connectedInputExpression(0)})`;
                case 'image-from-link':
                    return `__nodeImageFromLink(${connectedInputExpression(0)})`;
                case 'image-from-element':
                    // Element input pin when wired, else its own elementSelector
                    // text field (previously ignored whenever nothing was wired).
                    return `__nodeImageFromElement(${buildElementSourceExpr(element, 0, String(element.data?.elementSelector || '').trim())})`;
                case 'api-request':
                case 'api-status': {
                    const urlExpr = connectedInputExpression(0, element.data?.apiUrl || '');
                    const methodExpr = serializeGraphFormulaLiteral(String(element.data?.apiMethod || 'GET').toUpperCase());
                    const bodyExpr = connectedInputExpression(1, '');
                    const headersExpr = serializeGraphFormulaLiteral(String(element.data?.apiHeaders || ''));
                    const timeoutExpr = serializeGraphFormulaLiteral(Number(element.data?.apiTimeout ?? 15000));
                    const fn = element.type === 'api-status' ? '__nodeApiStatus' : '__nodeApiRequest';
                    return `${fn}(${urlExpr}, ${methodExpr}, ${bodyExpr}, ${headersExpr}, ${timeoutExpr})`;
                }
                case 'api-field': {
                    const sourceExpr = connectedInputExpression(0);
                    const pathExpr = connectedInputExpression(1, element.data?.apiFieldPath || '');
                    const fallbackExpr = serializeGraphFormulaLiteral(element.data?.apiFieldFallback || '');
                    const baseExpr = `__nodeGetPath(${sourceExpr}, ${pathExpr}, ${fallbackExpr})`;
                    const fieldType = String(element.data?.apiFieldType || 'string');
                    switch (fieldType) {
                        case 'number':
                            return `__nodeToNumber(${baseExpr})`;
                        case 'boolean':
                            return `!!(${baseExpr})`;
                        case 'string':
                            return `__nodeToString(${baseExpr})`;
                        case 'color':
                        case 'zip':
                        case 'case':
                        default:
                            return baseExpr;
                    }
                }
                case 'api-list-mapper':
                    return `__nodeApiListMapper(${connectedInputExpression(0)}, ${serializeGraphFormulaLiteral(String(element.data?.apiListPath || ''))}, ${serializeGraphFormulaLiteral(String(element.data?.apiListLabelField || 'label'))}, ${serializeGraphFormulaLiteral(String(element.data?.apiListValueField || 'value'))}, ${serializeGraphFormulaLiteral(String(element.data?.apiListMatchMode || 'auto'))}, ${serializeGraphFormulaLiteral(String(element.data?.apiListItemType || 'string'))}, ${serializeGraphFormulaLiteral(String(element.data?.apiListCustomNodeId || ''))}, ${serializeGraphFormulaLiteral(Array.isArray(element.data?.apiListFieldMappings) ? element.data.apiListFieldMappings : [])})`;
                case 'chart-data':
                    return `({ label: ${connectedInputExpression(0, element.data?.chartDataLabel ?? '')}, value: ${connectedInputExpression(1, element.data?.chartDataValue ?? 0)} })`;
                case 'action-event':
                case 'action-block':
                case 'action-if':
                case 'action-required':
                case 'action-min':
                case 'action-max':
                case 'action-length':
                case 'action-regex':
                case 'action-add-class':
                case 'action-remove-class':
                case 'action-toggle-class': {
                    const actionExpression = buildActionPlanExpression(element, currentDepth + 1);
                    return actionExpression || 'null';
                }
                case 'custom-node': {
                    const inputSchema = Array.isArray(element.data?.customInputSchema) && element.data.customInputSchema.length > 0
                        ? element.data.customInputSchema
                        : getCustomNodeInputSchema(element.data?.customNodeId);
                    const outputSchema = Array.isArray(element.data?.customOutputSchema) && element.data.customOutputSchema.length > 0
                        ? element.data.customOutputSchema
                        : getCustomNodeOutputSchema(element.data?.customNodeId);
                    const rawTemplate = String(element.data?.customTemplateFormula || '').trim();
                    const isTypeCarrier = !!element.data?.customNodeTypeCarrier;
                    const shouldZipOutput = !!element.data?.zipOutput || isTypeCarrier;
                    const buildZipExpression = (): string => {
                        if (rawTemplate) {
                            let expression = rawTemplate;
                            const ownSourceIds = new Set<string>();

                            inputSchema.forEach((schemaPin, inputIndex) => {
                                const inputConn = getConnectionForInput(element.id, `input${inputIndex}`);
                                const sourceExpr = inputConn
                                    ? buildNodeExpression(
                                        elementMap.get(inputConn.fromId) || element,
                                        Number.parseInt(String(inputConn.fromOutput || '').replace(/^output/i, ''), 10) || 0,
                                        currentDepth + 1
                                    )
                                    : serializeGraphFormulaLiteral(
                                        Array.isArray(element.data?.customInputValues)
                                            ? element.data.customInputValues[inputIndex] ?? schemaPin?.defaultValue ?? ''
                                            : schemaPin?.defaultValue ?? ''
                                    );
                                const sourceNodeId = String(schemaPin?.sourceNodeId || schemaPin?.id || '').trim();
                                if (!sourceNodeId) {
                                    return;
                                }
                                ownSourceIds.add(sourceNodeId);
                                const pattern = new RegExp(`__customIn\\(("|')${escapeRegExp(sourceNodeId)}\\1\\)`, 'g');
                                expression = expression.replace(pattern, `(${sourceExpr})`);
                            });

                            ownSourceIds.forEach((id) => {
                                const pattern = new RegExp(`__customIn\\(("|')${escapeRegExp(id)}\\1\\)`, 'g');
                                expression = expression.replace(pattern, '0');
                            });

                            return `(${expression || '0'})`;
                        }

                        const schema = outputSchema.length > 0 ? outputSchema : inputSchema;
                        const entries = schema
                            .map((outputField, index) => {
                                const inputExpr = connectedInputExpression(index);
                                if (!inputExpr) return null;
                                const key = serializeGraphFormulaLiteral(String(outputField?.id || outputField?.label || `output-${index + 1}`));
                                return `${key}: ${inputExpr}`;
                            })
                            .filter(Boolean);

                        return entries.length > 0 ? `({ ${entries.join(', ')} })` : '({})';
                    };

                    const zipExpr = buildZipExpression();

                    if (shouldZipOutput) {
                        return zipExpr;
                    }
                    return `__nodeUnzip(${zipExpr}, ${outputIndex})`;
                }
                case 'unzip': {
                    const sourceExpr = connectedInputExpression(0);
                    const indexExpr = connectedInputExpression(1, element.data?.unzipIndex ?? 0);
                    return `__nodeUnzip(${sourceExpr}, ${indexExpr})`;
                }
                default: {
                    const fallbackConnection = getConnectionForInput(element.id, `input${outputIndex}`);
                    if (fallbackConnection) {
                        const sourceElement = elementMap.get(fallbackConnection.fromId);
                        if (sourceElement) {
                            const sourceOutputIndex = Number.parseInt(String(fallbackConnection.fromOutput || '').replace(/^output/i, ''), 10);
                            return buildNodeExpression(sourceElement, Number.isFinite(sourceOutputIndex) && sourceOutputIndex >= 0 ? sourceOutputIndex : 0, currentDepth + 1);
                        }
                    }
                    return serializeGraphFormulaLiteral(element.data?.value ?? element.data?.valueText ?? 0);
                }
            }
        };

        // Value pins are shifted by 1 because of the leading "Element" target pin.
        const outputValueOffset = customNodeMode ? 0 : 1;
        const buildElementInstanceExpr = (element: CanvasElement, inputIndex = 0): string | null => {
            if (customNodeMode) return null;
            const connection = getConnectionForInput(element.id, `input${inputIndex}`);
            if (!connection) return null;
            const sourceElement = elementMap.get(connection.fromId);
            if (!sourceElement) return null;
            const outputIndex = Number.parseInt(String(connection.fromOutput || '').replace(/^output/i, ''), 10);
            return buildNodeExpression(
                sourceElement,
                Number.isFinite(outputIndex) && outputIndex >= 0 ? outputIndex : 0,
                depth + 1
            );
        };

        const outputElements = allElements.filter((element) =>
            element.type === 'output'
            && (
                String(element.data?.selectedElement || '').trim()
                || (!customNodeMode && Boolean(getConnectionForInput(element.id, 'input0')))
            )
        );
        // The Output node's Element pin (or any value pin / action source) can be
        // driven by a `For Each` loop. When it is, the whole payload is a
        // per-item body evaluated once per array element: the entry value is
        // `__nodeArrayMapGraph(<array>, "<body>")`, an array of per-item payload
        // objects that applyLogicBlocks expands. Detected generically from any
        // input to the Output node — not special-cased to Get Children.
        const findOutputLoopStart = (outNode: CanvasElement): CanvasElement | null => {
            if (customNodeMode) return null;
            // Iterate the whole Output payload only when its *Element target* is
            // per-iteration — i.e. the Element pin (input0) is fed by a For Each.
            // A value pin that folds a loop into an array (Collect / Map /
            // Filter) is self-contained and must NOT trigger this.
            const elConn = allConnections.find((c) => c.toId === outNode.id && c.toInput === 'input0');
            const src = elConn ? elementMap.get(elConn.fromId) : null;
            if (!src) return null;
            return src.type === 'array-for-each' ? src : findLoopStart(src.id);
        };

        const payloadEntries = outputElements
            .map((element) => {
                const loopStart = findOutputLoopStart(element);
                const prevLoopMode = buildingLoopBody;
                if (loopStart) buildingLoopBody = true;

                const elementInstanceExpr = buildElementInstanceExpr(element);
                const targetId = String(element.data?.selectedElement || '').trim();

                const valuePairs = outputPropertyNames
                    .map((propName, index) => {
                        const connection = getConnectionForInput(element.id, `input${index + outputValueOffset}`);
                        if (!connection) return null;
                        const sourceElement = elementMap.get(connection.fromId);
                        if (!sourceElement) return null;
                        const outputIndex = Number.parseInt(String(connection.fromOutput || '').replace(/^output/i, ''), 10);
                        const expr = buildNodeExpression(
                            sourceElement,
                            Number.isFinite(outputIndex) && outputIndex >= 0 ? outputIndex : 0,
                            depth + 1
                        );
                        return `${JSON.stringify(propName)}: ${expr}`;
                    })
                    .filter(Boolean);

                const actionPairs = getOutgoingConnections(element.id)
                    .map((connection) => elementMap.get(connection.toId))
                    .filter((child): child is CanvasElement => Boolean(child))
                    .map((child) => buildActionPlanExpression(child, depth + 1))
                    .filter((entry): entry is string => Boolean(entry));

                buildingLoopBody = prevLoopMode;

                // A connected Element pin is the authoritative target; the ID is
                // only used when nothing is wired to the Element pin.
                if (!elementInstanceExpr && !targetId) return null;
                if (valuePairs.length === 0 && actionPairs.length === 0) {
                    return null;
                }

                const payloadParts = [...valuePairs];
                if (actionPairs.length > 0) {
                    payloadParts.push(`actions: [${actionPairs.join(', ')}]`);
                }
                if (elementInstanceExpr) {
                    payloadParts.unshift(
                        `${JSON.stringify('__element')}: ${elementInstanceExpr}`,
                        `${JSON.stringify('__executeOnLoad')}: ${element.data?.executeOnLoad !== false ? 'true' : 'false'}`
                    );
                } else if (targetId) {
                    // Carry the configured target id INSIDE the payload (the
                    // runtime reads it back via __targetId) instead of using it
                    // as the entry's object key below. Two different Output
                    // nodes pointing at the same target id would otherwise
                    // collide on an identical key in the payload object
                    // literal -- by JS object-literal semantics only the LAST
                    // one written survives, silently discarding the other
                    // Output's entire payload (value AND actions), not merely
                    // going stale. See entryKey.
                    payloadParts.unshift(`${JSON.stringify('__targetId')}: ${JSON.stringify(targetId)}`);
                }

                // Every entry key is unique PER OUTPUT NODE, never derived from
                // the target id/element identity: a live DOM node can't be an
                // object key at all (elementInstanceExpr case, pre-existing),
                // and reusing the plain target-id string as the key let two
                // Output nodes targeting the same element collide (see above).
                // The runtime resolves the actual target from __element /
                // __targetId inside the payload, not from this key.
                const entryKey = elementInstanceExpr ? ` nlOutEl:${element.id}` : ` nlOutTarget:${element.id}`;
                const bodyObject = `{ ${payloadParts.join(', ')} }`;

                if (loopStart && elementInstanceExpr) {
                    const arrayExpr = connectedInputExpressionFor(loopStart, 0, []);
                    return `${JSON.stringify(entryKey)}: __nodeArrayMapGraph(${arrayExpr}, ${serializeGraphFormulaLiteral(`(${bodyObject})`)})`;
                }
                return `${JSON.stringify(entryKey)}: ${bodyObject}`;
            })
            .filter(Boolean);

        if (payloadEntries.length === 0) {
            return '';
        }

        return `({ ${payloadEntries.join(', ')} })`;
    };

    const updateElementValueTypes = (
        nextElements: CanvasElement[],
        nextConnections: Connection[] = connectionsRef.current
    ): CanvasElement[] => {
        const elementMap = new Map(nextElements.map((el) => [el.id, el]));

        const getConnectedType = (
            toId: string,
            toInput: string
        ): 'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event' | 'array' | 'action' | 'element' | null => {
            const conn = nextConnections.find((connection) => connection.toId === toId && connection.toInput === toInput);
            if (!conn) return null;
            const fromElement = elementMap.get(conn.fromId);
            return fromElement?.valueType || null;
        };

        // Effective array *item* type of a source node, resolved from its
        // original data so it does not depend on this pass's element ordering
        // (elementMap holds pre-pass nodes). Teaches the one derived case that is
        // never persisted: a Get Children node emitting an array yields
        // Array<element>. Recurses through the array transform / For Each chain
        // (bounded) so e.g. Get Children -> Filter -> For Each keeps 'element'.
        // Returns undefined when there is nothing more specific than the source's
        // own valueType — callers keep their existing fallback for that.
        const ARRAY_ITEM_INHERITING_TYPES: ReadonlySet<string> = new Set([
            'array-push', 'array-pop', 'array-sort', 'array-remove-index',
            'array-replace-index', 'array-map', 'array-filter', 'array-collect',
            'array-merge', 'array-unique', 'array-for-each',
        ]);
        const resolveSourceArrayItemType = (
            node: CanvasElement | null | undefined,
            seen: Set<string> = new Set<string>()
        ): ArrayItemType | undefined => {
            if (!node || seen.has(node.id)) return undefined;
            seen.add(node.id);
            if (node.type === 'get-children') {
                return getChildrenOutputsArray(node.data) ? 'element' : undefined;
            }
            if (node.data?.arrayItemType !== undefined) {
                return normalizeArrayItemType(node.data.arrayItemType);
            }
            if (ARRAY_ITEM_INHERITING_TYPES.has(node.type)) {
                const upstream = nextConnections.find(
                    (connection) => connection.toId === node.id && connection.toInput === 'input0'
                );
                return upstream
                    ? resolveSourceArrayItemType(elementMap.get(upstream.fromId), seen)
                    : undefined;
            }
            return undefined;
        };

        return nextElements.map((el) => {
            let valueType: 'number' | 'string' | 'boolean' | 'case' | 'color' | 'zip' | 'css' | 'css-unit' | 'event' | 'array' | 'action' | 'element' = 'number';
            let nextData: CanvasElement['data'] | undefined;

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
                    if (el.data?.elementUseManualId) {
                        // Manual ID: type is unknown at edit time, default to number
                        valueType = 'number';
                    } else {
                        const selectedElement = detectedElementsRef.current.find((detected) => detected.id === el.data?.selectedElement);
                        valueType = selectedElement?.outputs?.[0]?.type || 'number';
                    }
                    break;
                }
                case 'node-branch': {
                    valueType = getConnectedType(el.id, 'input1') || getConnectedType(el.id, 'input2') || el.valueType || 'number';
                    break;
                }
                case 'switch-branch': {
                    valueType = getConnectedType(el.id, 'input0') || el.valueType || 'number';
                    break;
                }
                case 'calculation':
                    valueType = ['===', '!==', '>', '<', '>=', '<='].includes(String(el.data?.operation || ''))
                        ? 'boolean'
                        : 'number';
                    break;
                case 'condition':
                case 'regex':
                    valueType = 'boolean';
                    break;
                case 'concat':
                case 'cut-a':
                case 'cut-b':
                case 'cut-c':
                case 'string-split':
                case 'string-replace':
                case 'string-trim':
                case 'string-upper':
                case 'string-lower':
                    valueType = 'string';
                    break;
                case 'string-count-chars':
                case 'string-count-words':
                case 'string-find-start':
                case 'string-find-end':
                case 'string-to-number':
                case 'math':
                case 'bool-count':
                case 'number-parse':
                    valueType = 'number';
                    break;
                case 'number-to-string':
                    valueType = 'string';
                    break;
                case 'color':
                case 'gradient':
                    valueType = 'color';
                    break;
                case 'custom-node': {
                    const customInputSchema = Array.isArray(el.data?.customInputSchema) && el.data.customInputSchema.length > 0
                        ? el.data.customInputSchema
                        : getCustomNodeInputSchema(el.data?.customNodeId);
                    const customOutputSchema = Array.isArray(el.data?.customOutputSchema) && el.data.customOutputSchema.length > 0
                        ? el.data.customOutputSchema
                        : getCustomNodeOutputSchema(el.data?.customNodeId);
                    const isTypeCarrier = !!el.data?.customNodeTypeCarrier;
                    const shouldZipOutput = !!el.data?.zipOutput || isTypeCarrier;
                    if (!Array.isArray(el.data?.customInputSchema) || el.data.customInputSchema.length === 0) {
                        nextData = { ...(nextData || el.data), customInputSchema };
                    }
                    if (!shouldZipOutput) {
                        const firstOutputType = customOutputSchema[0]?.type;
                        valueType = firstOutputType === 'string'
                            || firstOutputType === 'boolean'
                            || firstOutputType === 'color'
                            || firstOutputType === 'case'
                                ? firstOutputType
                                : (firstOutputType === 'zip' ? 'zip' : 'number');
                        if (customOutputSchema.length > 0 && (!Array.isArray(el.data?.customOutputSchema) || el.data.customOutputSchema.length === 0)) {
                            nextData = { ...(nextData || el.data), customOutputSchema };
                        }
                    } else {
                        valueType = 'zip';
                        if (customOutputSchema.length > 0 && (!Array.isArray(el.data?.customOutputSchema) || el.data.customOutputSchema.length === 0)) {
                            nextData = { ...(nextData || el.data), customOutputSchema };
                        }
                        if (isTypeCarrier && !el.data?.zipOutput) {
                            nextData = { ...(nextData || el.data), zipOutput: true };
                        }
                    }
                    break;
                }
                case 'element-id':
                    valueType = el.data?.customOutputType || 'string';
                    break;
                case 'element-ref':
                    valueType = 'element';
                    break;
                case 'element-property': {
                    // Scalar node valueType stays as pin 0's type (per the agreed
                    // decision to keep getConnectedType scalar). Single keeps the
                    // legacy elementPropertyType path for backward compatibility.
                    if (getElementPropertyMode(el) === 'single') {
                        const propType = el.data?.elementPropertyType;
                        valueType = (propType === 'string' || propType === 'boolean') ? propType : 'number';
                    } else {
                        const firstKey = resolveElementPropertyOrderedKeys(el)[0] || '';
                        valueType = getElementPropertyKeyType(el, firstKey);
                    }
                    break;
                }
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
                case 'memory-has':
                case 'memory-delete':
                    valueType = 'boolean';
                    break;
                case 'memory-increment':
                    valueType = 'number';
                    break;
                case 'memory-array-append':
                case 'memory-array-remove':
                    valueType = 'array';
                    break;
                case 'event-element':
                case 'event-id':
                    valueType = 'event';
                    break;
                case 'event-processor': {
                    const payloadType = getConnectedType(el.id, 'input1');
                    valueType = payloadType || 'string';
                    break;
                }
                case 'unzip':
                    valueType = 'number';
                    break;
                case 'case-range':
                case 'case-value':
                case 'case-default':
                    valueType = 'case';
                    break;
                case 'switch': {
                    const switchCaseConnections = nextConnections
                        .filter((connection) => connection.toId === el.id && getInputIndex(connection.toInput) > 0)
                        .sort((a, b) => getInputIndex(a.toInput) - getInputIndex(b.toInput));
                    const firstCase = switchCaseConnections[0];
                    const firstCaseElement = firstCase ? elementMap.get(firstCase.fromId) : null;
                    if (firstCaseElement?.type === 'case-range' || firstCaseElement?.type === 'case-value') {
                        const resultInputIndex = firstCaseElement.type === 'case-range' ? 2 : 1;
                        const connectedResultType = getConnectedType(firstCaseElement.id, `input${resultInputIndex}`);
                        if (connectedResultType) {
                            valueType = connectedResultType;
                        } else {
                            const literalResult = firstCaseElement.data?.out;
                            if (typeof literalResult === 'boolean') {
                                valueType = 'boolean';
                            } else if (typeof literalResult === 'number') {
                                valueType = 'number';
                            } else {
                                const textResult = String(literalResult ?? '').trim();
                                valueType = textResult !== '' && Number.isFinite(Number(textResult)) ? 'number' : 'string';
                            }
                        }
                    } else {
                        valueType = 'number';
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
                    const primaryType = getConnectedType(el.id, 'input0');
                    const fallbackType = getConnectedType(el.id, 'input1');
                    valueType = primaryType || fallbackType || el.valueType || 'number';
                    break;
                }
                case 'clamp':
                case 'min-val':
                case 'max-val':
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
                case 'get-children': {
                    // Single / Child return-as -> element output(s); Children
                    // return-as -> one Array<element>. The array carries its
                    // element type so downstream For Each / consumers pick it up.
                    if (getChildrenOutputsArray(el.data)) {
                        valueType = 'array';
                        nextData = { ...el.data, arrayItemType: 'element', arrayItemSchema: [] };
                    } else {
                        valueType = 'element';
                    }
                    break;
                }
                case 'array':
                case 'array-push':
                case 'array-pop':
                case 'array-sort':
                case 'array-remove-index':
                case 'array-replace-index':
                case 'array-map':
                case 'array-filter':
                case 'array-collect':
                case 'array-merge':
                case 'array-unique': {
                    valueType = 'array';
                    if (el.type === 'array') {
                        const typeConn = nextConnections.find((connection) => connection.toId === el.id && connection.toInput === 'input0');
                        const candidateElement = typeConn ? elementMap.get(typeConn.fromId) : null;
                        const candidateArrayType = normalizeArrayItemType(candidateElement?.data?.arrayItemType);
                        const candidateItemType = candidateElement?.data?.arrayItemType !== undefined
                            ? candidateArrayType
                            : candidateElement?.valueType;
                        const candidateArraySchema = getArrayItemSchemaFromElement(candidateElement);
                        if (
                            candidateItemType === 'number' || candidateItemType === 'string'
                            || candidateItemType === 'boolean' || candidateItemType === 'color'
                            || candidateItemType === 'zip' || candidateItemType === 'element'
                        ) {
                            nextData = { ...el.data, arrayItemType: candidateItemType, arrayItemSchema: candidateArraySchema };
                        }
                    } else {
                        // Pass-through / transform array nodes: inherit the element
                        // type of the incoming array so it survives the chain
                        // (e.g. Get Children -> Filter -> For Each stays Array<element>).
                        const sourceConnection = nextConnections.find((connection) => connection.toId === el.id && connection.toInput === 'input0');
                        const sourceElement = sourceConnection ? elementMap.get(sourceConnection.fromId) : null;
                        const inheritedType = normalizeArrayItemType(
                            resolveSourceArrayItemType(sourceElement)
                            ?? sourceElement?.data?.arrayItemType
                            ?? sourceElement?.valueType
                        );
                        const sourceSchema = getArrayItemSchemaFromElement(sourceElement);
                        // Only rewrite data when the inherited element type actually
                        // changed, so just loading a graph never marks it dirty.
                        if (el.data?.arrayItemType !== inheritedType) {
                            nextData = { ...el.data, arrayItemType: inheritedType };
                        }
                        if (el.type === 'array-sort') {
                            const currentField = String(el.data?.arraySortField || '').trim();
                            const hasField = sourceSchema.some((field) => field.id === currentField || field.label === currentField);
                            if (sourceSchema.length > 0 && (!currentField || !hasField)) {
                                nextData = { ...(nextData || el.data), arraySortField: sourceSchema[0].id };
                            }
                        }
                    }
                    break;
                }
                case 'array-for-each': {
                    const sourceConnection = nextConnections.find((connection) => connection.toId === el.id && connection.toInput === 'input0');
                    const sourceElement = sourceConnection ? elementMap.get(sourceConnection.fromId) : null;
                    // Loop item type = the incoming array's element type. Preserves
                    // 'element' (and every other type) instead of clamping to 'number'.
                    // resolveSourceArrayItemType is order-independent, so a Get
                    // Children (Array<element>) source is seen even when it is
                    // processed after this node in the same pass.
                    const normalizedItemType = normalizeArrayItemType(
                        resolveSourceArrayItemType(sourceElement)
                        ?? sourceElement?.data?.arrayItemType
                        ?? el.data?.arrayItemType
                    );
                    valueType = normalizedItemType;
                    nextData = {
                        ...el.data,
                        arrayItemType: normalizedItemType,
                        arrayItemSchema: getArrayItemSchemaFromElement(sourceElement),
                    };
                    break;
                }
                case 'image-from-link':
                case 'image-from-element':
                    valueType = 'string';
                    break;
                // New event nodes
                case 'event-hover':
                case 'event-scroll':
                case 'event-page-load':
                case 'event-timer':
                case 'event-custom':
                    valueType = 'event';
                    break;
                // New array nodes with non-array output
                case 'array-find':
                case 'array-reduce':
                    valueType = el.valueType || 'number';
                    break;
                case 'array-contains':
                    valueType = 'boolean';
                    break;
                case 'array-length':
                    valueType = 'number';
                    break;
                case 'api-request':
                case 'api-status':
                    valueType = 'zip';
                    break;
                case 'api-field': {
                    const apiFieldType = el.data?.apiFieldType;
                    valueType = apiFieldType === 'string' || apiFieldType === 'boolean' || apiFieldType === 'color' || apiFieldType === 'case' || apiFieldType === 'zip' || apiFieldType === 'number'
                        ? apiFieldType
                        : 'string';
                    break;
                }
                case 'api-list-mapper': {
                    valueType = 'array';
                    const normalizedApiListItemType = el.data?.apiListItemType === 'number'
                        || el.data?.apiListItemType === 'string'
                        || el.data?.apiListItemType === 'boolean'
                        || el.data?.apiListItemType === 'color'
                        || el.data?.apiListItemType === 'zip'
                        || el.data?.apiListItemType === 'chart-data'
                        || el.data?.apiListItemType === 'case'
                        ? el.data.apiListItemType
                        : 'string';
                    const normalizedScalarType = normalizedApiListItemType === 'case'
                        ? 'zip'
                        : normalizedApiListItemType === 'chart-data'
                            ? 'zip'
                        : normalizedApiListItemType;
                    const mapperSchema = normalizedApiListItemType === 'zip'
                        ? getApiListMapperSchema(el)
                        : normalizedApiListItemType === 'chart-data'
                            ? getApiListMapperSchema(el)
                        : [
                            normalizeArraySchemaItem(
                                {
                                    id: String(el.data?.apiListValueField || 'value').trim() || 'value',
                                    label: String(el.data?.apiListValueField || 'value').trim() || 'value',
                                    type: normalizedScalarType,
                                    sourceNodeId: el.id,
                                    sourcePin: String(el.data?.apiListValueField || 'value').trim() || 'value',
                                },
                                0,
                                String(el.data?.apiListValueField || 'value').trim() || 'value'
                            ),
                        ];
                    nextData = {
                        ...el.data,
                        apiListItemType: normalizedApiListItemType,
                        arrayItemType: normalizedScalarType,
                        arrayItemSchema: mapperSchema,
                    };
                    break;
                }
                case 'action-event':
                case 'action-block':
                case 'action-if':
                case 'action-required':
                case 'action-min':
                case 'action-max':
                case 'action-length':
                case 'action-regex':
                case 'action-add-class':
                case 'action-remove-class':
                case 'action-toggle-class':
                    valueType = 'action';
                    break;
                case 'chart-data':
                    valueType = 'zip';
                    (() => {
                        const normalizedChartData = normalizeChartDataNodeData(el.data);
                        const currentChartData = {
                            chartDataTypeCarrier: !!el.data?.chartDataTypeCarrier,
                            chartDataLabel: String(el.data?.chartDataLabel ?? 'label'),
                            chartDataValueText: String(el.data?.chartDataValueText ?? el.data?.chartDataValue ?? '0'),
                            chartDataValue: Number.isFinite(Number(el.data?.chartDataValue ?? 0)) ? Number(el.data?.chartDataValue ?? 0) : 0,
                        };

                        const chartDataChanged =
                            currentChartData.chartDataTypeCarrier !== normalizedChartData.chartDataTypeCarrier
                            || currentChartData.chartDataLabel !== normalizedChartData.chartDataLabel
                            || currentChartData.chartDataValueText !== normalizedChartData.chartDataValueText
                            || currentChartData.chartDataValue !== normalizedChartData.chartDataValue;

                        if (chartDataChanged) {
                            nextData = {
                                ...el.data,
                                ...normalizedChartData,
                            };
                        }
                    })();
                    break;
                default:
                    valueType = el.valueType || 'number';
                    break;
            }

            // `arrayTypeCarrier` is a removed feature (the "Array type carrier"
            // toggle no longer exists). A legacy saved graph can still carry it,
            // and buildNodeExpression would then emit a bare `[5]` / `[true]`
            // literal that collides with the `[id]` formula-variable syntax and
            // gets substituted away. Always rebuild the node when the flag is
            // present so the `arrayTypeCarrier: undefined` strip below runs.
            if (el.valueType === valueType && !nextData && el.data?.arrayTypeCarrier === undefined) {
                return el;
            }
            return {
                ...el,
                valueType,
                data: {
                    ...el.data,
                    ...(nextData || {}),
                    arrayTypeCarrier: undefined,
                }
            };
        });
    };

    const showInfoNotice = (reason: string) => {
        if (floatingNoticeTimeoutRef.current) {
            window.clearTimeout(floatingNoticeTimeoutRef.current);
        }
        setFloatingNotice(reason);
        floatingNoticeTimeoutRef.current = window.setTimeout(() => {
            setFloatingNotice('');
            floatingNoticeTimeoutRef.current = null;
        }, 3500);
    };

    const cloneCanvasElements = (items: CanvasElement[]): CanvasElement[] => {
        let cloned: CanvasElement[];
        try {
            cloned = JSON.parse(JSON.stringify(Array.isArray(items) ? items : []));
        } catch {
            cloned = Array.isArray(items) ? [...items] : [];
        }
        // Structural sanitisation for corrupted / hand-edited saved graphs: a
        // node with no id (or non-object data, non-finite x/y) would crash the
        // canvas render and break elementMap / connection lookups. Repair rather
        // than drop, so no user work is silently lost.
        const sanitised = (Array.isArray(cloned) ? cloned : [])
            .filter((element): element is CanvasElement => Boolean(element) && typeof element === 'object')
            .map((element, index) => {
                // Deterministic id (no Math.random): cloneCanvasElements runs
                // twice inside areSnapshotsEquivalent, and a non-stable id there
                // would make two normalisations of the same graph compare unequal.
                const id = typeof element.id === 'string' && element.id.trim() !== ''
                    ? element.id
                    : `recovered-node-${index}`;
                const type = typeof element.type === 'string' && element.type.trim() !== ''
                    ? element.type
                    : 'number';
                return {
                    ...element,
                    id,
                    type: type as CanvasElement['type'],
                    name: typeof element.name === 'string' ? element.name : type,
                    x: Number.isFinite(Number(element.x)) ? Number(element.x) : 0,
                    y: Number.isFinite(Number(element.y)) ? Number(element.y) : 0,
                    data: element.data && typeof element.data === 'object' ? element.data : {},
                };
            });
        // Legacy normalization: element-property -> single; get-children -> all/children
        // (the original "one array of all children"). Both are idempotent and a
        // no-op for every other node, so running them on every clone/save keeps
        // loaded, saved and equivalence-checked state consistent.
        return sanitised.map((element) =>
            migrateGetChildrenNodeData(migrateElementPropertyNodeData(element))
        );
    };

    const cloneConnections = (items: Connection[]): Connection[] => {
        let raw: Connection[];
        try {
            raw = JSON.parse(JSON.stringify(Array.isArray(items) ? items : []));
        } catch {
            raw = Array.isArray(items) ? [...items] : [];
        }
        // Drop connections that can't be resolved (no endpoints) and coerce the
        // pin fields to safe strings so `.replace(/^output/…)` etc. never throw
        // on malformed saved data.
        return (Array.isArray(raw) ? raw : [])
            .filter((connection): connection is Connection =>
                Boolean(connection) && typeof connection === 'object'
                && typeof connection.fromId === 'string' && connection.fromId !== ''
                && typeof connection.toId === 'string' && connection.toId !== '')
            .map((connection, index) => ({
                ...connection,
                id: typeof connection.id === 'string' && connection.id !== '' ? connection.id : `conn-recovered-${index}`,
                fromOutput: typeof connection.fromOutput === 'string' && connection.fromOutput !== '' ? connection.fromOutput : 'output0',
                toInput: typeof connection.toInput === 'string' && connection.toInput !== '' ? connection.toInput : 'input0',
            }));
    };

    const areSnapshotsEquivalent = (
        firstSnapshot: Partial<SavedState> | null | undefined,
        secondSnapshot: Partial<SavedState> | null | undefined
    ): boolean => {
        const first = normalizeSnapshotState(firstSnapshot);
        const second = normalizeSnapshotState(secondSnapshot);

        if (!first || !second) {
            return false;
        }

        const firstComparable = {
            elements: first.elements,
            connections: first.connections,
            formula: first.formula,
            customNodeUi: first.customNodeUi,
        };
        const secondComparable = {
            elements: second.elements,
            connections: second.connections,
            formula: second.formula,
            customNodeUi: second.customNodeUi,
        };

        try {
            return JSON.stringify(firstComparable) === JSON.stringify(secondComparable);
        } catch {
            return false;
        }
    };

    const buildSavedState = (): SavedState => ({
        elements: cloneCanvasElements(elementsRef.current || elements),
        connections: cloneConnections(connectionsRef.current || connections),
        formula: buildGraphFormulaFromState(
            elementsRef.current || elements,
            connectionsRef.current || connections
        ) || (typeof formulaRef.current === 'string' ? formulaRef.current : formula),
        customNodeUi: customNodeUiRef.current ? normalizeCustomNodeUiState(customNodeUiRef.current) : null,
        updatedAt: Date.now(),
    });

    const persistSavedSnapshot = (snapshot: SavedState) => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
                window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
            }
        } catch {
            // Ignore storage failures and keep the editor usable.
        }
    };

    const persistAutosaveSnapshot = (snapshot: SavedState) => {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
            }
        } catch {
            // Ignore storage failures and keep the editor usable.
        }
    };

    // One-time migration: the Output node gained a leading "Element" target
    // input pin, so every pre-existing Output value connection (input0..N) must
    // shift to (input1..N+1). Marked per node via data.outputTargetElementPin so
    // it never runs twice. No-op in custom-node mode (Output pins are label
    // slots there, not element targets) and for every non-Output node.
    const migrateOutputTargetElementPin = (
        els: CanvasElement[],
        conns: Connection[]
    ): { elements: CanvasElement[]; connections: Connection[] } => {
        if (customNodeMode) return { elements: els, connections: conns };
        const shiftNodeIds = new Set<string>();
        const nextEls = els.map((el) => {
            if (el.type !== 'output' || el.data?.outputTargetElementPin === true) return el;
            shiftNodeIds.add(el.id);
            return { ...el, data: { ...el.data, outputTargetElementPin: true } };
        });
        if (shiftNodeIds.size === 0) return { elements: nextEls, connections: conns };
        const nextConns = conns.map((connection) => {
            if (!shiftNodeIds.has(connection.toId)) return connection;
            const match = /^input(\d+)$/i.exec(String(connection.toInput || ''));
            if (!match) return connection;
            return { ...connection, toInput: `input${Number(match[1]) + 1}` };
        });
        return { elements: nextEls, connections: nextConns };
    };

    const normalizeSnapshotState = (snapshot: Partial<SavedState> | null | undefined): SavedState | null => {
        if (!snapshot || typeof snapshot !== 'object') {
            return null;
        }

        const migrated = migrateOutputTargetElementPin(
            cloneCanvasElements(Array.isArray(snapshot.elements) ? snapshot.elements : []),
            cloneConnections(Array.isArray(snapshot.connections) ? snapshot.connections : [])
        );
        return {
            elements: migrated.elements,
            connections: migrated.connections,
            formula: typeof snapshot.formula === 'string' ? snapshot.formula : '',
            customNodeUi: snapshot.customNodeUi ? normalizeCustomNodeUiState(snapshot.customNodeUi) : null,
            updatedAt: Number.isFinite(Number(snapshot.updatedAt)) ? Number(snapshot.updatedAt) : Date.now(),
        };
    };

    const readStoredSnapshot = (storageKey: string): SavedState | null => {
        if (typeof window === 'undefined' || !window.localStorage) {
            return null;
        }

        try {
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) {
                return null;
            }
            return normalizeSnapshotState(JSON.parse(raw));
        } catch {
            return null;
        }
    };

    const applySnapshot = (snapshot: SavedState | null) => {
        if (!snapshot) {
            return;
        }

        const migratedSnapshot = migrateOutputTargetElementPin(
            cloneCanvasElements(Array.isArray(snapshot.elements) ? snapshot.elements : []),
            cloneConnections(Array.isArray(snapshot.connections) ? snapshot.connections : [])
        );
        const nextElements = migratedSnapshot.elements;
        const nextConnections = migratedSnapshot.connections;
        const nextFormula = typeof snapshot.formula === 'string' ? snapshot.formula : '';
        const nextCustomNodeUi = snapshot.customNodeUi ? normalizeCustomNodeUiState(snapshot.customNodeUi) : null;
        const normalizedElements = updateElementValueTypes(
            nextElements.length > 0 ? nextElements : [{
                id: 'main-block',
                name: 'Html Element',
                type: 'main',
                x: 0,
                y: 0,
                data: { formula: '' },
                connections: []
            }],
            nextConnections
        );

        setElements(normalizedElements);
        setConnections(nextConnections);
        setFormula(nextFormula);
        setCustomNodeUi(nextCustomNodeUi);
        setSavedState({
            ...snapshot,
            elements: normalizedElements,
            connections: nextConnections,
            formula: nextFormula,
            customNodeUi: nextCustomNodeUi,
            updatedAt: snapshot.updatedAt || Date.now(),
        });
        setAutosaveState({
            ...snapshot,
            elements: normalizedElements,
            connections: nextConnections,
            formula: nextFormula,
            customNodeUi: nextCustomNodeUi,
            updatedAt: snapshot.updatedAt || Date.now(),
        });
        setRecoverableDraftState({
            ...snapshot,
            elements: normalizedElements,
            connections: nextConnections,
            formula: nextFormula,
            customNodeUi: nextCustomNodeUi,
            updatedAt: snapshot.updatedAt || Date.now(),
        });
        setUnsavedChanges(false);
        setPendingDraftRecovery(null);
        setShowDraftRecoveryNotice(false);
        setSelected(normalizedElements.some((element) => element.id === selected) ? selected : (
            shouldRenderMainBlock
                ? 'main-block'
                : (normalizedElements.find((element) => element.id !== 'main-block')?.id || null)
        ));
        onUnsavedChange?.(false);
        onFormulaChange?.(nextFormula);
        onStateChangeRef.current?.({
            ...snapshot,
            elements: normalizedElements,
            connections: nextConnections,
            formula: nextFormula,
            customNodeUi: nextCustomNodeUi,
            updatedAt: snapshot.updatedAt || Date.now(),
        });
    };

    const markGraphDirty = () => {
        setUnsavedChanges(true);
        onUnsavedChange?.(true);
    };

    const createElementFromTreeItem = (item: TreeItem, x: number, y: number): CanvasElement => ({
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: item.name,
        type: item.type as CanvasElement['type'],
        x,
        y,
        data: (() => {
            const baseData = getDefaultNodeDataForTreeItem(item.type);
            if (!item.customNodeId) {
                return {
                    ...baseData,
                };
            }

            const customNodeRecord = getCustomNodeRecordById(item.customNodeId);
            const customNodeUi = normalizeCustomNodeUiState(customNodeRecord?.state?.customNodeUi || customNodeRecord?.customNodeUi || null);
            const customInputSchema = Array.isArray(customNodeRecord?.inputSchema)
                ? customNodeRecord.inputSchema
                    .map((entry: any, index: number) => normalizeArraySchemaItem(entry, index, String(entry?.label || entry?.id || `Input ${index + 1}`)))
                    .filter(Boolean)
                : [];
            const customTemplateFormula = String(customNodeRecord?.state?.mainFormula || customNodeRecord?.state?.formula || '').trim();
            const customOutputSchema = Array.isArray(customNodeRecord?.outputSchema) && customNodeRecord.outputSchema.length > 0
                ? customNodeRecord.outputSchema
                    .map((entry: any, index: number) => normalizeArraySchemaItem(entry, index, String(entry?.label || entry?.id || `Output ${index + 1}`)))
                    .filter(Boolean)
                : detectElementOutputsFromCustomUi(customNodeUi).map((entry, index) => ({
                    id: String(entry?.name || '').trim() || `output-${index + 1}`,
                    label: String(entry?.name || '').trim() || `Output ${index + 1}`,
                    type: entry?.type || 'string',
                    sourceNodeId: item.customNodeId,
                }));

            return {
                ...baseData,
                customNodeId: item.customNodeId,
                customNodeName: item.name,
                customInputSchema,
                customOutputSchema,
                customTemplateFormula,
                zipOutput: Boolean(customNodeRecord?.state?.zipOutput),
            };
        })(),
        connections: []
    });

    const finishSidebarDrag = (clientX: number, clientY: number) => {
        const drag = sidebarDragRef.current;
        const item = draggedItemRef.current;
        const canvasEl = canvasRef.current;

        if (!drag || !item || !canvasEl) {
            setIsDraggingFromSidebar(false);
            isDraggingFromSidebarRef.current = false;
            setDraggedItem(null);
            draggedItemRef.current = null;
            setDragPreview(null);
            sidebarDragRef.current = null;
            return;
        }

        const movedDistance = Math.hypot(clientX - drag.startX, clientY - drag.startY);
        const movedEnough = movedDistance >= 5;
        const rect = canvasEl.getBoundingClientRect();
        const insideCanvas =
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom;

        if (movedEnough && insideCanvas) {
            const dropX = (clientX - rect.left - offsetXRef.current) / zoomRef.current;
            const dropY = (clientY - rect.top - offsetYRef.current) / zoomRef.current;
            const nextElement = createElementFromTreeItem(
                item,
                Math.round(dropX - 90),
                Math.round(dropY - 30)
            );
            pushHistory(elementsRef.current, connectionsRef.current);
            setElements((prev) => updateElementValueTypes([...prev, nextElement], connectionsRef.current));
            setSelected(nextElement.id);
            markGraphDirty();
        }

        setIsDraggingFromSidebar(false);
        isDraggingFromSidebarRef.current = false;
        setDraggedItem(null);
        draggedItemRef.current = null;
        setDragPreview(null);
        sidebarDragRef.current = null;
    };

    const handleSaveFormula = () => {
        const nextFormula = buildGraphFormulaFromState(
            elementsRef.current || elements,
            connectionsRef.current || connections
        ) || (typeof formulaRef.current === 'string' ? formulaRef.current : formula);
        setFormula(nextFormula);
        onFormulaChange?.(nextFormula);
    };

    const fetchJson = React.useCallback(async (path: string) => {
        const win = typeof window !== 'undefined'
            ? window as typeof window & {
                wp?: { apiFetch?: (args: { path: string; method?: string; data?: unknown }) => Promise<unknown> };
                wpApiSettings?: { nonce?: string };
            }
            : undefined;

        if (win?.wp?.apiFetch) {
            return win.wp.apiFetch({ path });
        }

        const response = await fetch(`/wp-json${path}`, {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                ...(win?.wpApiSettings?.nonce ? { 'X-WP-Nonce': win.wpApiSettings.nonce } : {}),
            },
        });

        if (!response.ok) {
            throw new Error(`Request failed (${response.status})`);
        }

        return response.json();
    }, []);

    const refreshTemplates = React.useCallback(async () => {
        if (!templateToolsEnabled) {
            setTemplates([]);
            setSelectedTemplateId('');
            return;
        }

        try {
            const response = await fetchJson(`/calcgraph/v1/templates?_t=${Date.now()}`);
            const rawItems = Array.isArray(response)
                ? response
                : Array.isArray((response as { items?: unknown }).items)
                    ? (response as { items?: unknown[] }).items || []
                    : [];

            const nextTemplates = rawItems
                .map((item) => {
                    if (!item || typeof item !== 'object') {
                        return null;
                    }

                    const record = item as Record<string, unknown>;
                    const id = typeof record.id === 'string' ? record.id.trim() : '';
                    const name = typeof record.name === 'string' ? record.name.trim() : '';
                    const state = normalizeSnapshot(record.state);
                    const updatedAt = Number.isFinite(Number(record.updatedAt)) ? Number(record.updatedAt) : 0;

                    if (!id || !name) {
                        return null;
                    }

                    return {
                        id,
                        name,
                        state,
                        updatedAt,
                    };
                })
                .filter((item): item is GraphTemplateItem => Boolean(item));

            setTemplates(nextTemplates);
            setSelectedTemplateId((prev) => prev || nextTemplates[0]?.id || '');
            setTemplateInfo('');
        } catch {
            setTemplates([]);
            setTemplateInfo('Unable to load templates.');
        }
    }, [fetchJson, templateToolsEnabled]);

    const handleImportTemplate = React.useCallback(() => {
        setIsTemplateBusy(true);
        try {
            const template = templates.find((item) => item.id === selectedTemplateId);
            const state = normalizeSnapshot(template?.state);

            if (!template || !state) {
                setTemplateInfo('Select a valid template.');
                return;
            }

            applySnapshot({
                elements: state.elements as CanvasElement[],
                connections: state.connections as Connection[],
                formula: state.mainFormula,
                eventFormulas: state.eventFormulas,
                customNodeUi: state.customNodeUi,
                updatedAt: state.updatedAt,
            });

            persistSavedSnapshot({
                elements: cloneCanvasElements(state.elements as CanvasElement[]),
                connections: cloneConnections(state.connections as Connection[]),
                formula: state.mainFormula,
                customNodeUi: state.customNodeUi,
                updatedAt: Date.now(),
            });

            setTemplateInfo('Template imported.');
        } finally {
            setIsTemplateBusy(false);
        }
    }, [applySnapshot, persistSavedSnapshot, selectedTemplateId, templates]);

    useEffect(() => {
        if (hasInitializedRef.current) {
            return;
        }

        hasInitializedRef.current = true;
        draftRecoveryCheckedRef.current = false;

        const normalizedInitial = normalizeSnapshotState(initialState);
        const savedFromStorage = readStoredSnapshot(SAVE_KEY);
        const autosaveFromStorage = readStoredSnapshot(AUTOSAVE_KEY);
        const activeSnapshot = forceInitialState
            ? (normalizedInitial || savedFromStorage || autosaveFromStorage)
            : (savedFromStorage || normalizedInitial || autosaveFromStorage);

        const defaultMainBlock: CanvasElement = {
            id: 'main-block',
            name: 'Html Element',
            type: 'main',
            x: 0,
            y: 0,
            data: { formula: '' },
            connections: []
        };

        if (activeSnapshot) {
            const migratedActive = migrateOutputTargetElementPin(
                cloneCanvasElements(Array.isArray(activeSnapshot.elements) ? activeSnapshot.elements : []),
                cloneConnections(Array.isArray(activeSnapshot.connections) ? activeSnapshot.connections : [])
            );
            const nextElements = migratedActive.elements;
            const nextConnections = migratedActive.connections;
            const nextFormula = typeof activeSnapshot.formula === 'string' ? activeSnapshot.formula : '';
            const nextCustomNodeUi = activeSnapshot.customNodeUi ? normalizeCustomNodeUiState(activeSnapshot.customNodeUi) : null;
            const normalizedElements = updateElementValueTypes(
                nextElements.length > 0 ? nextElements : (shouldRenderMainBlock ? [defaultMainBlock] : []),
                nextConnections
            );
            const nextSavedState = normalizedInitial || savedFromStorage || activeSnapshot;
            const nextAutosaveState = autosaveFromStorage || nextSavedState;
            const hasRecoverableDraft = Boolean(
                autosaveFromStorage
                && nextSavedState
                && !areSnapshotsEquivalent(autosaveFromStorage, nextSavedState)
            );

            setElements(normalizedElements);
            setConnections(nextConnections);
            setFormula(nextFormula);
            setCustomNodeUi(nextCustomNodeUi);
            setSavedState(nextSavedState);
            setAutosaveState(nextAutosaveState);
            setRecoverableDraftState(hasRecoverableDraft ? autosaveFromStorage : nextAutosaveState);
            setPendingDraftRecovery(hasRecoverableDraft && !templateMode && !customNodeMode ? autosaveFromStorage : null);
            setShowDraftRecoveryNotice(hasRecoverableDraft && !templateMode && !customNodeMode);
            setUnsavedChanges(false);
            setSelected(
                normalizedElements.some((element) => element.id === 'main-block')
                    ? (shouldRenderMainBlock ? 'main-block' : (normalizedElements.find((element) => element.id !== 'main-block')?.id || null))
                    : (normalizedElements.find((element) => element.id !== 'main-block')?.id || (shouldRenderMainBlock ? 'main-block' : null))
            );
            onUnsavedChange?.(false);
            onFormulaChange?.(nextFormula);
            setIsStateLoaded(true);
            isStateLoadedRef.current = true;
            return;
        }

        setElements(shouldRenderMainBlock ? [defaultMainBlock] : []);
        setConnections([]);
        setFormula('');
        setCustomNodeUi(null);
        setSavedState(null);
        setAutosaveState(null);
        setRecoverableDraftState(null);
        setPendingDraftRecovery(null);
        setShowDraftRecoveryNotice(false);
        setUnsavedChanges(false);
        setSelected(shouldRenderMainBlock ? 'main-block' : null);
        onUnsavedChange?.(false);
        setIsStateLoaded(true);
        isStateLoadedRef.current = true;
    }, [AUTOSAVE_KEY, SAVE_KEY, customNodeMode, forceInitialState, initialState, onFormulaChange, onUnsavedChange, shouldRenderMainBlock, templateMode]);

    useEffect(() => {
        if (!isStateLoaded || templateMode || customNodeMode || !unsavedChanges) {
            if (autosaveTimeoutRef.current) {
                clearTimeout(autosaveTimeoutRef.current);
                autosaveTimeoutRef.current = null;
            }
            return;
        }

        // Debounce autosave to at most once per 5 seconds to reduce performance impact
        if (autosaveTimeoutRef.current) {
            clearTimeout(autosaveTimeoutRef.current);
        }
        
        autosaveTimeoutRef.current = setTimeout(() => {
            const snapshot = buildSavedState();
            setAutosaveState(snapshot);
            persistAutosaveSnapshot(snapshot);
            autosaveTimeoutRef.current = null;
        }, 5000);
        
        return () => {
            if (autosaveTimeoutRef.current) {
                clearTimeout(autosaveTimeoutRef.current);
            }
        };
    }, [connections, customNodeMode, elements, isStateLoaded, persistAutosaveSnapshot, templateMode, customNodeUi, unsavedChanges]);

    useLayoutEffect(() => {
        const rafId = window.requestAnimationFrame(() => {
            const next: Record<string, CalcFlowSegment[]> = {};
            const calcNodes = elements.filter((el) => el.type === 'calculation');

            calcNodes.forEach((node) => {
                const connectedCalcInputs = getConnectedInputIndexesForElement(node.id, connections);
                const nodeInputCount = Math.max(0, getInputCount(node));
                const highestConnectedIndex = connectedCalcInputs.length > 0 ? connectedCalcInputs[connectedCalcInputs.length - 1] : -1;
                const hasGapError = Boolean(dynamicInputGapErrors[node.id]);

                if (connectedCalcInputs.length === 0 || (connectedCalcInputs.length < 2 && !hasGapError)) {
                    next[node.id] = [];
                    return;
                }

                const nodeEl = canvasRef.current?.querySelector(`.canvas-element[data-element-id="${node.id}"]`) as HTMLElement | null;
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
                const operatorPoints = Array.from({ length: Math.max(0, nodeInputCount - 1) }, (_, operatorIndex) => getOperatorPoints(operatorIndex))
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

                for (let sourceInputIndex = 0; sourceInputIndex < nodeInputCount; sourceInputIndex += 1) {
                    const inputPoint = getInputPinPoint(sourceInputIndex);
                    if (!inputPoint) {
                        continue;
                    }

                    const isConnected = connectedCalcInputs.includes(sourceInputIndex);
                    if (!isConnected && !hasGapError) {
                        continue;
                    }
                    if (!isConnected && sourceInputIndex > highestConnectedIndex) {
                        continue;
                    }

                    const targetOperatorIndex = Math.min(operatorPoints.length - 1, Math.max(0, sourceInputIndex - 1));
                    const targetOperator = operatorPoints[targetOperatorIndex];
                    const badgeX = targetOperator?.left.x ?? fallbackOperatorX;
                    const badgeY = sourceInputIndex === 0
                        ? (targetOperator?.top.y ?? fallbackTopY)
                        : (targetOperator?.bottom.y ?? fallbackBottomY);
                    const leftToRight = inputPoint.x <= badgeX;
                    const lineEndX = badgeX + (leftToRight ? -8 : 8);
                    const lineEndY = badgeY;
                    const spanX = Math.max(14, Math.abs(lineEndX - inputPoint.x));
                    const spanY = lineEndY - inputPoint.y;
                    const wobble = sourceInputIndex % 2 === 0 ? -12 : 12;
                    const c1x = inputPoint.x + ((leftToRight ? 1 : -1) * Math.max(12, spanX * 0.4));
                    const c1y = inputPoint.y + (spanY * 0.2) + wobble;
                    const c2x = lineEndX - ((leftToRight ? 1 : -1) * Math.max(10, spanX * 0.2));
                    const c2y = lineEndY - (spanY * 0.15) - wobble;

                    segments.push({
                        key: `input-flow-${sourceInputIndex}`,
                        d: `M ${inputPoint.x} ${inputPoint.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${lineEndX} ${lineEndY}`,
                        step: sourceInputIndex + 1,
                        badgeX,
                        badgeY,
                        ghost: !isConnected,
                    });
                }

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

    useEffect(() => {
        if (!templateToolsEnabled) {
            setTemplates([]);
            setSelectedTemplateId('');
            setTemplateInfo('');
            return;
        }

        refreshTemplates();
    }, [refreshTemplates, templateToolsEnabled]);

    // ── Element Property: apply a config change + prune now-invalid connections ─
    const applyNodeDataChange = (nodeId: string, dataPatch: Record<string, unknown>) => {
        const patchedElements = (elementsRef.current || []).map((element) =>
            element.id === nodeId
                ? { ...element, data: { ...element.data, ...dataPatch } }
                : element
        );
        const nextElements = updateElementValueTypes(patchedElements, connectionsRef.current);
        const nextConnections = pruneStaleDynamicOutputConnections(nextElements, connectionsRef.current);
        const connectionsChanged = nextConnections.length !== (connectionsRef.current || []).length;

        elementsRef.current = nextElements;
        setElements(nextElements);

        if (connectionsChanged) {
            syncConnectionsAndTypes(nextConnections);
        }
    };

    // Resolve the manual / dropdown target id a connected element-ref points at.
    const resolveElementRefTargetId = (refNode: CanvasElement | null | undefined): string =>
        refNode
            ? String(
                refNode.data?.elementUseManualId
                    ? (refNode.data?.customElementId || '')
                    : (refNode.data?.selectedElement || '')
            ).trim()
            : '';

    const parsePinIndex = (pinName: string | undefined): number => {
        const n = Number.parseInt(String(pinName || '').replace(/^(?:output|input)/i, ''), 10);
        return Number.isFinite(n) && n >= 0 ? n : 0;
    };

    // Editor-side mirror of the runtime element-resolution chain: given a node
    // and one of its output pins, return the concrete live preview Element that
    // pin represents (or null). Per-node-type dispatch, exactly like
    // buildNodeExpression / getOutputPinType — extensible by adding a case, not a
    // special-case at the call site. Used so any element-producing node feeding
    // an `element` pin is inspected for its real properties, not just element-ref.
    const resolveNodeOutputPreviewElement = (
        node: CanvasElement | null | undefined,
        outputIndex: number,
        depth = 0
    ): Element | null => {
        if (!node || depth > 12) return null;

        const resolveInput0Element = (): Element | null => {
            const conn = connectionsRef.current.find(
                (candidate) => candidate.toId === node.id && candidate.toInput === 'input0'
            );
            if (!conn) return null;
            const source = elementsRef.current.find((element) => element.id === conn.fromId);
            return resolveNodeOutputPreviewElement(source, parsePinIndex(conn.fromOutput), depth + 1);
        };

        switch (node.type) {
            case 'element-ref': {
                const id = resolveElementRefTargetId(node);
                return id ? resolvePreviewElement(id, { unwrapControl: false }) : null;
            }
            case 'get-children': {
                const mode = readGetChildrenMode(node.data);
                // The "Children" array output is not a single element.
                if (mode !== 'single' && readGetChildrenReturnAs(node.data) === 'children') {
                    return null;
                }
                // Same detection-independent pin -> child-index mapping the
                // formula uses, so the editor preview and the frontend resolve
                // the identical child.
                const childIndex = getChildrenPinChildIndex(node.data, outputIndex);
                if (childIndex === null) return null;
                return getPreviewChildAt(resolveInput0Element(), childIndex);
            }
            case 'array-for-each': {
                // Editor-time representative for the loop item: the first element
                // of the source array (best effort — runtime iterates all).
                if (outputIndex !== 0) return null;
                const conn = connectionsRef.current.find(
                    (candidate) => candidate.toId === node.id && candidate.toInput === 'input0'
                );
                const source = conn ? elementsRef.current.find((element) => element.id === conn.fromId) : null;
                if (!source) return null;
                if (source.type === 'get-children') {
                    const first = getChildrenPinChildIndex(source.data, 0) ?? 0;
                    const parentConn = connectionsRef.current.find(
                        (candidate) => candidate.toId === source.id && candidate.toInput === 'input0'
                    );
                    const parentSource = parentConn ? elementsRef.current.find((element) => element.id === parentConn.fromId) : null;
                    return getPreviewChildAt(
                        resolveNodeOutputPreviewElement(parentSource, parsePinIndex(parentConn?.fromOutput), depth + 1),
                        first
                    );
                }
                return null;
            }
            case 'fallback':
            case 'node-branch':
            case 'switch-branch': {
                // Pass-through nodes that can carry an element value: follow input0.
                return resolveInput0Element();
            }
            default:
                return null;
        }
    };

    // Refresh detection when the editor preview DOM mutates (Gutenberg / Elementor).
    const hasElementPropertyNode = elements.some((element) => element.type === 'element-property');
    const hasGetChildrenNode = elements.some((element) => element.type === 'get-children');
    const needsPreviewDetection = hasElementPropertyNode || hasGetChildrenNode;
    useEffect(() => {
        if (!needsPreviewDetection) return undefined;
        const dispose = observePreviewDomChanges(
            () => setPreviewDomVersion((version) => version + 1),
            { debounceMs: 150 }
        );
        return dispose;
    }, [needsPreviewDetection]);

    // Recompute detected properties for every element-property node.
    useEffect(() => {
        const propertyNodes = elementsRef.current.filter((element) => element.type === 'element-property');
        const nextDetections: Record<string, DetectedElementProperty[]> = {};

        propertyNodes.forEach((node) => {
            const connection = connectionsRef.current.find(
                (candidate) => candidate.toId === node.id && candidate.toInput === 'input0'
            );
            const sourceNode = connection
                ? elementsRef.current.find((element) => element.id === connection.fromId)
                : null;

            // Resolve the concrete live element this node's Element input points
            // at, whatever produced it (element-ref by id, Get Children child,
            // a pass-through node, ...). Falls back to null when nothing is
            // connected or the source can't be resolved in the current preview.
            const liveElement = connection
                ? resolveNodeOutputPreviewElement(sourceNode, parsePinIndex(connection.fromOutput))
                : null;

            // Legacy static supplement: only when the source is an element-ref
            // whose id maps to a known NodeLogic block (DetectedElement).
            const staticId = sourceNode?.type === 'element-ref' ? resolveElementRefTargetId(sourceNode) : '';

            // The Element input is a *generic* element (no concrete preview node
            // to sniff) when the wired source pin is element-typed — e.g. an
            // Array<element> loop item from For Each. O(1): a pin-type lookup,
            // never any iteration over the runtime array. Drives only which
            // fallback property list the editor offers; runtime is untouched.
            const sourceIsElementTyped = !!sourceNode
                && getOutputPinType(sourceNode, parsePinIndex(connection?.fromOutput ?? 'output0')) === 'element';

            if (!liveElement && !staticId) {
                nextDetections[node.id] = sourceIsElementTyped ? genericElementProperties() : [];
                return;
            }

            let live: DetectedElementProperty[] = [];
            if (liveElement) {
                try {
                    live = detectElementProperties('', { element: liveElement }).properties;
                } catch {
                    live = [];
                }
            }

            const detectedElement = staticId
                ? detectedElementsRef.current.find((entry) => entry.id === staticId)
                : null;
            const staticProps: DetectedElementProperty[] = detectedElement
                ? getElementTypeProps(detectedElement).map((property) => ({
                    key: property.key,
                    type: property.type,
                    source: 'dom-property' as const,
                }))
                : [];

            const seenKeys = new Set(live.map((property) => property.key.toLowerCase()));
            const merged = [...live];
            staticProps.forEach((property) => {
                if (!seenKeys.has(property.key.toLowerCase())) {
                    seenKeys.add(property.key.toLowerCase());
                    merged.push(property);
                }
            });

            nextDetections[node.id] = merged;
        });

        const signature = JSON.stringify(nextDetections);
        if (signature === elementPropertyDetectionSignatureRef.current) {
            return;
        }
        elementPropertyDetectionSignatureRef.current = signature;
        elementPropertyDetectionsRef.current = nextDetections;
        setElementPropertyDetections(nextDetections);

        const prunedConnections = pruneStaleDynamicOutputConnections(
            elementsRef.current,
            connectionsRef.current
        );
        if (prunedConnections.length !== connectionsRef.current.length) {
            syncConnectionsAndTypes(prunedConnections);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [elements, connections, detectedElements, previewDomVersion]);

    // Recompute detected direct children for every get-children node.
    useEffect(() => {
        const childNodes = elementsRef.current.filter((element) => element.type === 'get-children');
        const nextDetections: Record<string, DetectedChild[]> = {};

        childNodes.forEach((node) => {
            const connection = connectionsRef.current.find(
                (candidate) => candidate.toId === node.id && candidate.toInput === 'input0'
            );
            const refNode = connection
                ? elementsRef.current.find((element) => element.id === connection.fromId)
                : null;
            const targetId = resolveElementRefTargetId(refNode);
            if (!targetId) {
                nextDetections[node.id] = [];
                return;
            }
            try {
                nextDetections[node.id] = detectElementChildren(targetId).children;
            } catch {
                nextDetections[node.id] = [];
            }
        });

        const signature = JSON.stringify(nextDetections);
        if (signature === elementChildrenDetectionSignatureRef.current) {
            return;
        }
        elementChildrenDetectionSignatureRef.current = signature;
        elementChildrenDetectionsRef.current = nextDetections;
        setElementChildrenDetections(nextDetections);

        const prunedConnections = pruneStaleDynamicOutputConnections(
            elementsRef.current,
            connectionsRef.current
        );
        if (prunedConnections.length !== connectionsRef.current.length) {
            syncConnectionsAndTypes(prunedConnections);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [elements, connections, detectedElements, previewDomVersion]);

    useEffect(() => {
        if (!isStateLoaded || templateMode || customNodeMode || draftRecoveryCheckedRef.current) {
            return;
        }

        draftRecoveryCheckedRef.current = true;

        if (autosaveState && (!savedState || !areSnapshotsEquivalent(autosaveState, savedState))) {
            setRecoverableDraftState(autosaveState);
            setPendingDraftRecovery(autosaveState);
            setShowDraftRecoveryNotice(true);
            return;
        }

        setRecoverableDraftState(null);
        setPendingDraftRecovery(null);
        setShowDraftRecoveryNotice(false);
    }, [autosaveState, customNodeMode, isStateLoaded, savedState, templateMode]);

    useEffect(() => {
        const handleWindowMouseUp = (event: MouseEvent) => {
            if (!isDraggingFromSidebarRef.current || !draggedItemRef.current) {
                return;
            }
            finishSidebarDrag(event.clientX, event.clientY);
        };

        window.addEventListener('mouseup', handleWindowMouseUp);
        return () => {
            window.removeEventListener('mouseup', handleWindowMouseUp);
            if (floatingNoticeTimeoutRef.current) {
                window.clearTimeout(floatingNoticeTimeoutRef.current);
                floatingNoticeTimeoutRef.current = null;
            }
        };
    }, []);

    // ── Keyboard shortcuts (Undo / Redo / Delete) ──────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore when focus is inside an input / textarea / select
            const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            const ctrl = e.ctrlKey || e.metaKey;

            if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                handleUndo();
                return;
            }
            if (ctrl && (e.shiftKey && e.key.toLowerCase() === 'z') || (ctrl && e.key.toLowerCase() === 'y')) {
                e.preventDefault();
                handleRedo();
                return;
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current && selectedRef.current !== 'main-block') {
                e.preventDefault();
                handleDelete(selectedRef.current);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    // ───────────────────────────────────────────────────────────────────────

    const handleSave = () => {
        const snapshot = buildSavedState();
        setSavedState(snapshot);
        setAutosaveState(snapshot);
        setRecoverableDraftState(snapshot);
        setUnsavedChanges(false);
        setPendingDraftRecovery(null);
        setShowDraftRecoveryNotice(false);
        onUnsavedChange?.(false);
        onStateChangeRef.current?.(snapshot);
        persistSavedSnapshot(snapshot);
    };

    const handleRestore = () => {
        const snapshot = savedState || autosaveState || recoverableDraftState;
        applySnapshot(snapshot);
        if (snapshot) {
            persistSavedSnapshot(snapshot);
        }
    };

    const handleRestoreUnsaved = () => {
        const previousSavedState = savedState;
        applySnapshot(pendingDraftRecovery || recoverableDraftState || autosaveState || savedState);
        setSavedState(previousSavedState);
        setUnsavedChanges(true);
        onUnsavedChange?.(true);
    };

    const handleDismissDraftRecovery = () => {
        setShowDraftRecoveryNotice(false);
        setPendingDraftRecovery(null);
    };

    const getDefaultNodeDataForTreeItem = (type: TreeItem['type']): CanvasElement['data'] => {
        switch (type) {
            case 'output':
                // New Output nodes already have the leading Element pin, so they
                // must not be reindexed by the migration.
                return { outputTargetElementPin: true };
            case 'array':
                return { arrayItemType: 'number', arrayItemSchema: [] };
            case 'chart-data':
                return { chartDataLabel: 'label', chartDataValue: 0, chartDataValueText: '0', chartDataTypeCarrier: false };
            case 'array-push':
            case 'array-pop':
            case 'array-remove-index':
            case 'array-replace-index':
                return { arrayItemType: 'number', arrayItemSchema: [] };
            case 'array-sort':
                return { arrayItemType: 'number', sortMode: 'number-asc', arraySortField: '' };
            case 'image-from-link':
                return { imageUrl: '' };
            case 'image-from-element':
                return { elementSelector: '' };
            case 'api-request':
                return { apiUrl: '', apiMethod: 'GET', apiHeaders: '', apiTimeout: 15000 };
            case 'api-status':
                return { apiUrl: '', apiMethod: 'GET', apiHeaders: '', apiTimeout: 15000 };
            case 'api-field':
                return { apiFieldPath: '', apiFieldType: 'string', apiFieldFallback: '' };
            case 'api-list-mapper':
                return {
                    apiListPath: '',
                    apiListValueField: 'value',
                    apiListMatchMode: 'auto',
                    apiListItemType: 'string',
                    apiListCustomNodeId: '',
                    apiListFieldMappings: [],
                    arrayItemType: 'string',
                    arrayItemSchema: [
                        {
                            id: 'value',
                            label: 'value',
                            type: 'string',
                        },
                    ],
                };
            case 'action-event':
                return { actionEventType: 'change', actionTargetId: '', actionTargetManualId: '', actionUseManualId: false };
            case 'action-block':
                return {};
            case 'action-required':
                return { actionRequired: true };
            case 'action-min':
                return { actionMin: 0 };
            case 'action-max':
                return { actionMax: 100 };
            case 'action-length':
                return { actionMinLength: 0, actionMaxLength: 0 };
            case 'action-regex':
                return { actionRegexPattern: '' };
            case 'action-add-class':
            case 'action-remove-class':
            case 'action-toggle-class':
                return { actionClassName: '' };
            case 'element-ref':
                return { selectedElement: '', elementUseManualId: false, customElementId: '' };
            case 'element-property':
                return {
                    elementProperty: '', elementPropertyUseManual: false, elementPropertyType: 'number', elementPropertyMode: 'single' as const,
                    selectedElement: '', elementUseManualId: false, customElementId: '',
                };
            case 'get-children':
                return {
                    getChildrenMode: 'all' as const, getChildrenReturnAs: 'children' as const,
                    selectedElement: '', elementUseManualId: false, customElementId: '',
                };
            case 'element-id':
                return { elementId: '', customOutputType: 'string' as const };
            // New action nodes
            case 'action-set-text':
            case 'action-set-html':
            case 'action-set-value':
                return { actionTargetId: '', actionTargetUseManual: false, actionTargetManualId: '' };
            case 'action-set-attr':
                return { actionTargetId: '', actionTargetUseManual: false, actionTargetManualId: '', actionAttrName: '' };
            case 'action-set-style':
                return { actionTargetId: '', actionTargetUseManual: false, actionTargetManualId: '', actionStyleProperty: '' };
            case 'action-set-visibility':
                return { actionTargetId: '', actionTargetUseManual: false, actionTargetManualId: '', actionVisibility: 'toggle' as const };
            case 'action-enable':
            case 'action-disable':
            case 'action-focus':
            case 'action-scroll-to':
                return { actionTargetId: '', actionTargetUseManual: false, actionTargetManualId: '' };
            case 'action-notify':
                return { actionNotifyMessage: '', actionNotifyDuration: 3000 };
            case 'action-redirect':
                return { actionTargetManualId: '', actionRedirectTarget: '_self' as const };
            case 'action-trigger-event':
                return { actionTargetId: '', actionTargetUseManual: false, actionTargetManualId: '', actionEventName: '' };
            case 'action-if':
                return { actionIfCondition: false, valueText: '' };
            // New event nodes
            case 'event-hover':
                return { selectedElement: '', elementUseManualId: false, customElementId: '', eventHoverMode: 'enter' as const };
            case 'event-scroll':
                return { selectedElement: '', elementUseManualId: false, customElementId: '' };
            case 'event-page-load':
                return {};
            case 'event-timer':
                return { eventTimerInterval: 1000, eventTimerMode: 'interval' as const };
            case 'event-custom':
                return { eventCustomName: '' };
            // New array nodes
            case 'array-map':
            case 'array-filter':
            case 'array-for-each':
            case 'array-collect':
            case 'array-merge':
            case 'array-unique':
            case 'array-find':
            case 'array-contains':
            case 'array-length':
                return { arrayItemType: 'number', arrayItemSchema: [] };
            case 'array-reduce':
                return { arrayItemType: 'number', arrayItemSchema: [], arrayReduceOperation: 'sum' as const, arrayReduceInitial: '0' };
            default:
                return {};
        }
    };

    const handleDelete = (elementId: string) => {
        if (elementId === 'main-block') {
            return;
        }
        pushHistory(elementsRef.current, connectionsRef.current);
        // Drop the node's wires first, then recompute downstream value types
        // against the post-delete connection set — matching every other mutation
        // path so a node that fed a now-deleted source doesn't keep a stale type.
        const nextConnections = (connectionsRef.current || []).filter(
            (connection) => connection.fromId !== elementId && connection.toId !== elementId
        );
        setConnections(nextConnections);
        setElements((prev) =>
            updateElementValueTypes(prev.filter((element) => element.id !== elementId), nextConnections)
        );
        if (selectedRef.current === elementId) {
            const fallback = (elementsRef.current || []).find(
                (element) => element.id !== elementId && element.id !== 'main-block'
            );
            setSelected(fallback ? fallback.id : null);
        }
        markGraphDirty();
    };

    const handleMouseDown = (event: React.MouseEvent<HTMLElement>) => {
        if (event.button !== 0) {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (
            target?.closest('.pin')
            || target?.closest('.input-control')
            || target?.closest('.delete-btn')
            || target?.closest('.api-list-mapper-scroll')
            || target?.closest('.nl-scroll-guard')
        ) {
            return;
        }

        if (isDraggingFromSidebarRef.current && draggedItemRef.current) {
            return;
        }

        const currentTarget = event.currentTarget as HTMLElement;
        const elementId = currentTarget?.dataset?.elementId;
        if (elementId) {
            const element = elementsRef.current.find((item) => item.id === elementId);
            if (!element) {
                return;
            }

            setSelected(elementId);
            setIsClick(true);
            setIsDraggingCanvasElement(true);
            isDraggingCanvasElementRef.current = true;
            setDraggedElementId(elementId);
            elementDragRef.current = {
                elementId,
                startX: event.clientX,
                startY: event.clientY,
                elementX: element.x,
                elementY: element.y
            };
            const nextDragDelta = { elementId, deltaX: 0, deltaY: 0 };
            dragElementDeltaRef.current = nextDragDelta;
            setDragElementDelta(nextDragDelta);
            return;
        }

        setIsPanning(true);
        isPanningRef.current = true;
        setIsClick(true);
        setSelected(null);
        lastPanPointRef.current = { x: event.clientX, y: event.clientY };
    };

    const handleMouseMove = (event: React.MouseEvent<HTMLElement>) => {
        const nextPoint = { x: event.clientX, y: event.clientY };
        pendingCanvasMouseRef.current = nextPoint;

        if (draggedItemRef.current && isDraggingFromSidebarRef.current) {
            const drag = sidebarDragRef.current;
            if (drag) {
                const movedDistance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
                if (movedDistance >= 5) {
                    setDragPreview({ x: event.clientX, y: event.clientY, name: draggedItemRef.current.name });
                }
            }
        }

        if (isPanningRef.current) {
            const dx = event.clientX - lastPanPointRef.current.x;
            const dy = event.clientY - lastPanPointRef.current.y;
            if (dx !== 0 || dy !== 0) {
                setOffsetX((prev) => prev + dx);
                setOffsetY((prev) => prev + dy);
                setIsClick(false);
            }
            lastPanPointRef.current = nextPoint;
        }

        if (isDraggingCanvasElementRef.current && elementDragRef.current) {
            const drag = elementDragRef.current;
            const dx = (event.clientX - drag.startX) / zoomRef.current;
            const dy = (event.clientY - drag.startY) / zoomRef.current;
            if (dx !== 0 || dy !== 0) {
                const nextDragDelta = { elementId: drag.elementId, deltaX: dx, deltaY: dy };
                dragElementDeltaRef.current = nextDragDelta;
                setDragElementDelta(nextDragDelta);
                setIsClick(false);
            }
        }

        if (connectionInProgressRef.current) {
            const canvasEl = canvasRef.current;
            if (canvasEl) {
                const rect = canvasEl.getBoundingClientRect();
                const canvasPoint = {
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top,
                };
                setConnectionInProgress((prev) => prev ? { ...prev, x: canvasPoint.x, y: canvasPoint.y } : prev);
            }
        }
    };

    const handleWheel = (event: WheelEvent | React.WheelEvent<HTMLElement>) => {
        const target = event.target as HTMLElement | null;
        if (
            apiListMapperScrollLockRef.current
            || target?.closest('.api-list-mapper-scroll')
            || target?.closest('.nl-scroll-guard')
        ) {
            // Wheel started inside a scrollable node sub-panel (property list,
            // child list, ...). Let the browser scroll that element natively —
            // do not preventDefault and do not zoom the canvas.
            return;
        }

        event.preventDefault();

        if (isDraggingCanvasElementRef.current || isDraggingFromSidebarRef.current || connectionInProgressRef.current) {
            return;
        }

        const canvasEl = canvasRef.current;
        if (!canvasEl) {
            return;
        }

        const rect = canvasEl.getBoundingClientRect();
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;
        const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92;
        const nextZoom = Math.min(2.5, Math.max(0.35, zoomRef.current * zoomFactor));

        const worldX = (cursorX - offsetXRef.current) / zoomRef.current;
        const worldY = (cursorY - offsetYRef.current) / zoomRef.current;

        const nextOffsetX = cursorX - (worldX * nextZoom);
        const nextOffsetY = cursorY - (worldY * nextZoom);

        setZoom(nextZoom);
        setOffsetX(nextOffsetX);
        setOffsetY(nextOffsetY);
    };

    const handleMouseUp = (event: React.MouseEvent<HTMLElement>) => {
        const nextPoint = { x: event.clientX, y: event.clientY };

        if (isDraggingCanvasElementRef.current && elementDragRef.current) {
            const drag = elementDragRef.current;
            const dx = (event.clientX - drag.startX) / zoomRef.current;
            const dy = (event.clientY - drag.startY) / zoomRef.current;
            if (dx !== 0 || dy !== 0) {
                pushHistory(elementsRef.current, connectionsRef.current);
                setElements((prev) => prev.map((element) => (
                    element.id === drag.elementId
                        ? { ...element, x: drag.elementX + dx, y: drag.elementY + dy }
                        : element
                )));
                markGraphDirty();
            }
            setDragElementDelta(null);
            dragElementDeltaRef.current = null;
            setIsDraggingCanvasElement(false);
            isDraggingCanvasElementRef.current = false;
            setDraggedElementId(null);
            elementDragRef.current = null;
        }

        if (connectionInProgressRef.current) {
            const connectionState = connectionInProgressRef.current;
            const pointerTarget = canvasRef.current?.ownerDocument.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
            const targetPinEl = pointerTarget?.closest('.pin') as HTMLElement | null;
            const targetElementId = targetPinEl?.dataset?.elementId || '';
            const targetPinId = targetPinEl?.dataset?.pinId || '';
            const targetPinType = targetPinId.startsWith('input-')
                ? 'input'
                : targetPinId.startsWith('output-')
                    ? 'output'
                    : null;
            const targetPinIndex = targetPinType
                ? Number.parseInt(targetPinId.replace(/^(input|output)-/, ''), 10)
                : -1;

            let sourceElementId = connectionState.elementId;
            let sourcePinIndex = connectionState.pinIndex;
            let destinationElementId = '';
            let destinationPinIndex = -1;

            if (targetPinType === 'input' && connectionState.pinType === 'output') {
                destinationElementId = targetElementId;
                destinationPinIndex = targetPinIndex;
            } else if (targetPinType === 'output' && connectionState.pinType === 'input') {
                sourceElementId = targetElementId;
                sourcePinIndex = targetPinIndex;
                destinationElementId = connectionState.elementId;
                destinationPinIndex = connectionState.pinIndex;
            }

            const sourceElement = elementsRef.current.find((element) => element.id === sourceElementId) || null;
            const destinationElement = elementsRef.current.find((element) => element.id === destinationElementId) || null;

            const canCompleteConnection =
                Boolean(targetPinEl)
                && Boolean(targetPinType)
                && Boolean(sourceElement)
                && Boolean(destinationElement)
                && sourceElementId !== destinationElementId
                && sourcePinIndex >= 0
                && destinationPinIndex >= 0;

            if (canCompleteConnection && sourceElement && destinationElement) {
                const sourceValueType = getOutputPinType(sourceElement, sourcePinIndex);
                const targetAcceptedTypes = getAcceptedTypesForPin(destinationElement, destinationPinIndex);

                if (arePinTypesCompatible(sourceValueType, targetAcceptedTypes)) {
                    const nextConnections = connectionsRef.current.filter((connection) => (
                        connection.toId !== destinationElementId || connection.toInput !== `input${destinationPinIndex}`
                    ));

                    nextConnections.push({
                        id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                        fromId: sourceElementId,
                        fromOutput: `output${sourcePinIndex}`,
                        toId: destinationElementId,
                        toInput: `input${destinationPinIndex}`,
                        valueType: sourceValueType || 'number',
                        connectionType: 'normal',
                    });

                    syncConnectionsAndTypes(nextConnections);
                    markGraphDirty();
                    clearConnectionDrag(false);
                } else {
                    showInfoNotice(`Cannot connect ${sourceValueType || 'unknown'} output to this pin.`);
                    clearConnectionDrag(false);
                }
            } else {
                clearConnectionDrag(false);
            }
        }

        if (isPanningRef.current) {
            setIsPanning(false);
            isPanningRef.current = false;
        }

        finishSidebarDrag(event.clientX, event.clientY);
        pendingCanvasMouseRef.current = nextPoint;
    };

    const isMainInputType = INPUT_MAIN_TYPES.has(mainElementType);
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
            {floatingNotice && (
                <div
                    style={{
                        position: 'fixed',
                        top: '12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 7000,
                        width: 'min(760px, calc(100vw - 32px))',
                        pointerEvents: 'none',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: '#1f2937',
                        color: '#fbbf24',
                        border: '1px solid #374151',
                        fontSize: '12px',
                        lineHeight: '1.4',
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
                    }}
                >
                    {floatingNotice}
                </div>
            )}
            <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
                <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    {sidebarOpen ? '\u25C0' : '\u25B6'}
                </button>
                {sidebarOpen && (
                    <div className="tree-container">
                        <div style={{ padding: '10px 14px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <input
                                type="text"
                                className="input-control"
                                value={sidebarSearch}
                                onChange={(e) => setSidebarSearch(e.target.value)}
                                placeholder="Search nodes..."
                                style={{ width: '100%', boxSizing: 'border-box' }}
                            />
                        </div>
                        {visibleSidebarTreeData.map((item) => (
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

                            {/* Undo / Redo */}
                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                <button
                                    onClick={handleUndo}
                                    disabled={undoStackRef.current.length === 0}
                                    style={{ ...buttonStyle, marginTop: 0, flex: 1, backgroundColor: undoStackRef.current.length === 0 ? '#1e293b' : '#334155', color: undoStackRef.current.length === 0 ? '#64748b' : '#f8fafc', cursor: undoStackRef.current.length === 0 ? 'not-allowed' : 'pointer', opacity: undoStackRef.current.length === 0 ? 0.7 : 1 }}
                                    title="Undo (Ctrl+Z)"
                                >
                                    ↩ Undo
                                </button>
                                <button
                                    onClick={handleRedo}
                                    disabled={redoStackRef.current.length === 0}
                                    style={{ ...buttonStyle, marginTop: 0, flex: 1, backgroundColor: redoStackRef.current.length === 0 ? '#1e293b' : '#334155', color: redoStackRef.current.length === 0 ? '#64748b' : '#f8fafc', cursor: redoStackRef.current.length === 0 ? 'not-allowed' : 'pointer', opacity: redoStackRef.current.length === 0 ? 0.7 : 1 }}
                                    title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                                >
                                    ↪ Redo
                                </button>
                            </div>

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

                            {templateToolsEnabled && !templateMode && !customNodeMode && (
                                <div style={{ marginTop: '12px', borderTop: '1px solid #555', paddingTop: '12px' }}>
                                    <div style={{ color: '#ddd', fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>Graph Templates</div>
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
                                        disabled={isTemplateBusy || !selectedTemplateId}
                                        style={{
                                            ...buttonStyle,
                                            backgroundColor: '#8e24aa',
                                            opacity: isTemplateBusy || !selectedTemplateId ? 0.75 : 1,
                                            cursor: isTemplateBusy || !selectedTemplateId ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        {isTemplateBusy ? 'Importing...' : 'Import Template'}
                                    </button>
                                    {templateInfo && (
                                        <div style={{ color: '#cfd8dc', fontSize: '11px', marginTop: '6px', lineHeight: '1.3' }}>
                                            {templateInfo}
                                        </div>
                                    )}
                                </div>
                            )}

                            {selected && (() => {
                                const selEl = elements.find(e => e.id === selected);
                                if (!selEl) return null;
                                const isConstantInput = customNodeMode && (
                                    selEl.type === 'number' || selEl.type === 'constant-boolean'
                                    || selEl.type === 'constant-string' || selEl.type === 'color'
                                );
                                const isConstantCarrier = customNodeMode && (
                                    selEl.type === 'number' || selEl.type === 'constant-boolean'
                                    || selEl.type === 'constant-string' || selEl.type === 'color'
                                ) && !!selEl.data?.constantTypeCarrier;
                                const isArrayCarrierConstant = (
                                    selEl.type === 'number'
                                    || selEl.type === 'constant-boolean'
                                    || selEl.type === 'constant-string'
                                    || selEl.type === 'color'
                                );
                                const isZipOutput = customNodeMode && selEl.type === 'main';
                                return (
                                    <div style={{ marginTop: '10px', borderTop: '1px solid #555', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                                        {isConstantInput && (
                                            <>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa', cursor: 'pointer', userSelect: 'none' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={!!selEl.data?.constantTypeCarrier}
                                                        onChange={(e) => {
                                                            const constantTypeCarrier = e.target.checked;
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === selected
                                                                            ? { ...elem, data: { ...elem.data, constantTypeCarrier } }
                                                                            : elem
                                                                    ),
                                                                    connectionsRef.current
                                                                )
                                                            );
                                                        }}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    Constant type carrier
                                                </label>
                                                {!isConstantCarrier && (
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

                                        {selEl.type === 'chart-data' && (
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa', cursor: 'pointer', userSelect: 'none' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!selEl.data?.chartDataTypeCarrier}
                                                    onChange={(e) => {
                                                        const chartDataTypeCarrier = e.target.checked;
                                                        setElements(prev =>
                                                            updateElementValueTypes(
                                                                prev.map(elem =>
                                                                    elem.id === selected
                                                                        ? { ...elem, data: { ...elem.data, chartDataTypeCarrier } }
                                                                        : elem
                                                                ),
                                                                connectionsRef.current
                                                            )
                                                        );
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                Chart data type carrier
                                            </label>
                                        )}

                                        {selEl.type === 'custom-node' && (
                                            <>
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
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#aaa', cursor: 'pointer', userSelect: 'none' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={!!selEl.data?.customNodeTypeCarrier}
                                                        onChange={(e) => {
                                                            const customNodeTypeCarrier = e.target.checked;
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === selected
                                                                            ? {
                                                                                ...elem,
                                                                                data: {
                                                                                    ...elem.data,
                                                                                    customNodeTypeCarrier,
                                                                                    zipOutput: customNodeTypeCarrier ? true : !!elem.data?.zipOutput,
                                                                                },
                                                                                valueType: customNodeTypeCarrier ? 'zip' : 'number',
                                                                            }
                                                                            : elem
                                                                    ),
                                                                    connectionsRef.current
                                                                )
                                                            );
                                                            setConnections(prev => {
                                                                const next = customNodeTypeCarrier
                                                                    ? prev.filter(c => c.fromId !== selected && c.toId !== selected)
                                                                    : prev;
                                                                connectionsRef.current = next;
                                                                return next;
                                                            });
                                                        }}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    Type carrier
                                                </label>
                                            </>
                                        )}

                                        {selEl.type === 'element-id' && (
                                            <div style={{ color: '#aaa', fontSize: '11px', lineHeight: '1.4' }}>
                                                Configure element ID and output type directly in the node body.
                                            </div>
                                        )}

                                        {selEl.type === 'event-element' && (
                                            <div style={{ color: '#aaa', fontSize: '11px', lineHeight: '1.4' }}>
                                                Configure target element and event type directly in the node body.
                                            </div>
                                        )}

                                        {selEl.type === 'event-id' && (
                                            <div style={{ color: '#aaa', fontSize: '11px', lineHeight: '1.4' }}>
                                                Configure element and event type directly in the node body.
                                            </div>
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

                                        {(selEl.type === 'memory-has' || selEl.type === 'memory-delete') && (
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
                                                {selEl.type === 'memory-delete' && (
                                                    <div style={{ color: '#888', fontSize: '10px', marginTop: '4px' }}>
                                                        Deletes on every wired Trigger occurrence. Unwired: deletes every evaluation.
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {selEl.type === 'memory-increment' && (
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
                                                    <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Step</div>
                                                    <input
                                                        type="number"
                                                        className="input-control"
                                                        value={String(selEl.data?.incrementStep ?? 1)}
                                                        onChange={(e) => {
                                                            const incrementStep = parseFloat(e.target.value);
                                                            setElements(prev =>
                                                                updateElementValueTypes(
                                                                    prev.map(elem =>
                                                                        elem.id === selected
                                                                            ? { ...elem, data: { ...elem.data, incrementStep: Number.isFinite(incrementStep) ? incrementStep : 1 } }
                                                                            : elem
                                                                    )
                                                                )
                                                            );
                                                        }}
                                                        placeholder="1"
                                                        style={{ width: '100%' }}
                                                    />
                                                    <div style={{ color: '#888', fontSize: '10px', marginTop: '4px' }}>
                                                        Negative to decrement. Applies on every wired Trigger occurrence; unwired: every evaluation.
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        {(selEl.type === 'memory-array-append' || selEl.type === 'memory-array-remove') && (
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
                                                <div style={{ color: '#888', fontSize: '10px', marginTop: '4px' }}>
                                                    Item pin (input0) sets the value. Applies on every wired Trigger occurrence; unwired: every evaluation.
                                                </div>
                                            </div>
                                        )}

                                        {isMemoryNodeType(selEl.type) && (
                                            <div>
                                                <div style={{ color: '#aaa', fontSize: '11px', marginBottom: '3px' }}>Scope</div>
                                                <select
                                                    className="input-control"
                                                    value={String(selEl.data?.memoryScope || 'widget')}
                                                    onChange={(e) => {
                                                        const memoryScope = e.target.value === 'page' ? 'page' : 'widget';
                                                        setElements(prev =>
                                                            updateElementValueTypes(
                                                                prev.map(elem =>
                                                                    elem.id === selected
                                                                        ? { ...elem, data: { ...elem.data, memoryScope } }
                                                                        : elem
                                                                )
                                                            )
                                                        );
                                                    }}
                                                    style={{ width: '100%' }}
                                                >
                                                    <option value="widget">This widget only (default, avoids collisions)</option>
                                                    <option value="page">Shared across widgets on this page</option>
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

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
                            if (!visibleElementIds.has(conn.fromId) || !visibleElementIds.has(conn.toId)) return null;
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
                                position: 'fixed',
                                left: `${dragPreview.x}px`,
                                top: `${dragPreview.y}px`,
                                transform: 'translate(-50%, -50%)',
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
                    
                    {visibleElements.map((el) => {
                        if (el.id === 'main-block' && !shouldRenderMainBlock) {
                            return null;
                        }
                        const inputCount = getInputCount(el);
                        const outputCount = getOutputCount(el);
                        const nodeHeight = getNodeHeight(el);
                        const nodeWidth = getNodeWidth(el);
                        const noInputPins = inputCount === 0;
                        const noOutputPins = outputCount === 0;
                        const isChartDataCarrier = el.type === 'chart-data' && !!el.data?.chartDataTypeCarrier;
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
                            || el.type === 'element-ref'
                            || el.type === 'element-property'
                            || el.type === 'get-children'
                            || el.type === 'output'
                            || el.type === 'constant-boolean'
                            || el.type === 'constant-string'
                            || el.type === 'color'
                            || el.type === 'math'
                            || el.type === 'event-element'
                            || el.type === 'event-id'
                            || el.type === 'event-hover'
                            || el.type === 'event-scroll'
                            || el.type === 'event-page-load'
                            || el.type === 'event-timer'
                            || el.type === 'event-custom'
                            || el.type === 'action-event'
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
                            || el.type === 'css-text'
                            || el.type === 'array'
                            || el.type === 'array-push'
                            || el.type === 'array-pop'
                            || el.type === 'array-remove-index'
                            || el.type === 'array-replace-index'
                            || el.type === 'image-from-link'
                            || el.type === 'image-from-element'
                            || el.type === 'api-request'
                            || el.type === 'api-status'
                            || el.type === 'api-field'
                            || el.type === 'api-list-mapper'
                            || isMemoryNodeType(el.type);
                        const calcSegments = el.type === 'calculation' ? (calcFlowByNode[el.id] || []) : [];
                        const calcMarkerId = `calc-flow-arrow-${el.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                        const activeDragDelta = dragElementDelta?.elementId === el.id ? dragElementDelta : null;
                        const visualX = el.x + (activeDragDelta?.deltaX || 0);
                        const visualY = el.y + (activeDragDelta?.deltaY || 0);


                        return (
                            <div
                                key={el.id}
                                className={`canvas-element type-${el.type} ${nodePinClass} ${isChartDataCarrier ? 'chart-data-carrier' : ''} ${selected === el.id ? 'selected' : ''} ${dynamicInputGapErrors[el.id] ? 'node-error' : ''}`}
                                data-element-id={el.id}
                                style={{ 
                                    left: `${Math.round(visualX * zoom + offsetX)}px`, 
                                    top: `${Math.round(visualY * zoom + offsetY)}px`,
                                    width: `${nodeWidth}px`,
                                    height: `${nodeHeight}px`,
                                    transform: `scale(${zoom})`,
                                    transformOrigin: '0 0',
                                    cursor: isDraggingCanvasElement && draggedElementId === el.id ? 'grabbing' : 'grab'
                                }}
                                title={dynamicInputGapErrors[el.id] || ''}
                                onMouseDown={(e) => {
                                    // Don't start a node drag from a pin, a form
                                    // control, or a scrollable config sub-panel
                                    // (its scrollbar included) — just consume it.
                                    const target = e.target as HTMLElement;
                                    if (
                                        target.classList.contains('pin')
                                        || target.classList.contains('input-control')
                                        || target.closest('.nl-scroll-guard')
                                    ) {
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
                                                    className={`calc-flow-path ${segment.ghost ? 'calc-flow-path--ghost' : ''}`}
                                                    d={segment.d}
                                                    markerEnd={`url(#${calcMarkerId})`}
                                                />
                                                <g transform={`translate(${segment.badgeX}, ${segment.badgeY})`} className={`calc-flow-badge ${segment.ghost ? 'calc-flow-badge--ghost' : ''}`}>
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
                                                                                y: fromPinPos.y,
                                                                                reconnectingConnection: existingConnection
                                                                            });
                                                                            const next = connectionsRef.current.filter((conn) => conn.id !== existingConnection.id);
                                                                            syncConnectionsAndTypes(next);
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
                                                                title={getInputLabel(el, i) || `Input ${i + 1}`}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <div className="inputs-column-special">
                                            {el.type === 'array' ? (
                                                <select
                                                    className="input-control"
                                                    value={String(el.data?.arrayItemType || 'number')}
                                                    onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === el.id ? { ...elem, data: { ...elem.data, arrayItemType: e.target.value as ArrayItemType } } : elem)))}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <option value="number">Number</option>
                                                    <option value="string">String</option>
                                                    <option value="boolean">Boolean</option>
                                                    <option value="color">Color</option>
                                                    <option value="zip">Object</option>
                                                    <option value="element">Element</option>
                                                </select>
                                            ) : el.type === 'condition' ? (
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
            const stableOperatorRowCount = Math.max(0, connectedCalcInputs.length - 1);
            if (!dynamicInputGapErrors[el.id]) {
                calculationOperatorCountRef.current[el.id] = stableOperatorRowCount;
            }
            const operatorRowCount = dynamicInputGapErrors[el.id]
                ? (calculationOperatorCountRef.current[el.id] ?? stableOperatorRowCount)
                : stableOperatorRowCount;
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
                                                    if (el.data?.constantTypeCarrier) {
                                                        return <div style={{ minHeight: '32px' }} />;
                                                    }
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
                                                    if (el.data?.constantTypeCarrier) {
                                                        return <div style={{ minHeight: '32px' }} />;
                                                    }
                                                    return (
                                                        <div>
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
                                                        </div>
                                                    );
                                                })()
                                            ) : el.type === 'constant-string' ? (
                                                (() => {
                                                    if (el.data?.constantTypeCarrier) {
                                                        return <div style={{ minHeight: '32px' }} />;
                                                    }
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
                                                    if (el.data?.constantTypeCarrier) {
                                                        return <div style={{ minHeight: '32px' }} />;
                                                    }
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
                                              ) : el.type === 'api-request' || el.type === 'api-status' || el.type === 'api-field' || el.type === 'api-list-mapper' ? (
                                                  renderApiNodeControls(el)
                                              ) : el.type === 'element-id' ? (
                                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                                      <input
                                                          type="text"
                                                          className="input-control"
                                                          value={el.data?.elementId || ''}
                                                          placeholder="Element ID"
                                                          onChange={(e) => {
                                                              const elementId = e.target.value;
                                                              setElements(prev =>
                                                                  updateElementValueTypes(
                                                                      prev.map(elem =>
                                                                          elem.id === el.id
                                                                              ? { ...elem, data: { ...elem.data, elementId } }
                                                                              : elem
                                                                      )
                                                                  )
                                                              );
                                                          }}
                                                      />
                                                      <select
                                                          className="input-control"
                                                          value={el.data?.customOutputType || 'string'}
                                                          onChange={(e) => {
                                                              const customOutputType = e.target.value as 'number' | 'string' | 'boolean';
                                                              setElements(prev =>
                                                                  updateElementValueTypes(
                                                                      prev.map(elem =>
                                                                          elem.id === el.id
                                                                              ? { ...elem, data: { ...elem.data, customOutputType } }
                                                                              : elem
                                                                      )
                                                                  )
                                                              );
                                                          }}
                                                          onClick={(e) => e.stopPropagation()}
                                                      >
                                                          <option value="string">String</option>
                                                          <option value="number">Number</option>
                                                          <option value="boolean">Boolean</option>
                                                      </select>
                                                  </div>
                                            ) : el.type === 'element-ref' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                                    {el.data?.elementUseManualId ? (
                                                        <input
                                                            type="text"
                                                            className="input-control"
                                                            value={el.data?.customElementId || ''}
                                                            placeholder="Element ID"
                                                            onChange={(e) => {
                                                                const customElementId = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, customElementId } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    ) : (
                                                        <select
                                                            className="input-control"
                                                            value={el.data?.selectedElement || ''}
                                                            onChange={(e) => {
                                                                const selectedElement = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, selectedElement } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <option value="">-- Element --</option>
                                                            {detectedElements.map(d => (
                                                                <option key={d.id} value={d.id}>{d.id}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    <div style={{ marginTop: '6px', paddingTop: '6px', paddingBottom: '4px', borderTop: '1px solid rgba(255,255,255,0.28)' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#cbd5e1', cursor: 'pointer', userSelect: 'none' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={!!el.data?.elementUseManualId}
                                                            onChange={(e) => {
                                                                const elementUseManualId = e.target.checked;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, elementUseManualId } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            style={{ cursor: 'pointer' }}
                                                        />
                                                        Manual ID
                                                    </label>
                                                    </div>
                                                </div>
                                            ) : el.type === 'event-hover' || el.type === 'event-scroll' || el.type === 'event-page-load' || el.type === 'event-timer' || el.type === 'event-custom' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                                    {(el.type === 'event-hover' || el.type === 'event-scroll') && (
                                                        <>
                                                            {el.data?.eventUseManualId ? (
                                                                <input className="input-control" value={String(el.data?.eventId || '')} placeholder="Target ID" onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === el.id ? { ...elem, data: { ...elem.data, eventId: e.target.value } } : elem)))} />
                                                            ) : (
                                                                <select className="input-control" value={String(el.data?.selectedElement || '')} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === el.id ? { ...elem, data: { ...elem.data, selectedElement: e.target.value } } : elem)))}>
                                                                    <option value="">-- Target element --</option>
                                                                    {detectedElements.map(d => <option key={d.id} value={d.id}>{d.name || d.id} ({d.id})</option>)}
                                                                </select>
                                                            )}
                                                            {el.type === 'event-hover' && (
                                                                <select className="input-control" value={String(el.data?.eventHoverMode || 'enter')} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === el.id ? { ...elem, data: { ...elem.data, eventHoverMode: e.target.value as 'enter' | 'leave' | 'both' } } : elem)))}>
                                                                    <option value="enter">Mouse enter</option><option value="leave">Mouse leave</option><option value="both">Both</option>
                                                                </select>
                                                            )}
                                                            <div style={{ marginTop: '6px', paddingTop: '6px', paddingBottom: '4px', borderTop: '1px solid rgba(255,255,255,0.28)' }}>
                                                                <label className="reverse-toggle">
                                                                    <input type="checkbox" checked={!!el.data?.eventUseManualId} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === el.id ? { ...elem, data: { ...elem.data, eventUseManualId: e.target.checked } } : elem)))} />
                                                                    Manual target ID
                                                                </label>
                                                            </div>
                                                        </>
                                                    )}
                                                    {el.type === 'event-timer' && (
                                                        <>
                                                            <input className="input-control" type="number" min="50" value={String(el.data?.eventTimerInterval || 1000)} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === el.id ? { ...elem, data: { ...elem.data, eventTimerInterval: Number(e.target.value) || 1000 } } : elem)))} placeholder="Interval (ms)" />
                                                            <select className="input-control" value={String(el.data?.eventTimerMode || 'interval')} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === el.id ? { ...elem, data: { ...elem.data, eventTimerMode: e.target.value as 'interval' | 'timeout' } } : elem)))}><option value="interval">Interval</option><option value="timeout">Timeout</option></select>
                                                        </>
                                                    )}
                                                    {el.type === 'event-custom' && <input className="input-control" type="text" value={String(el.data?.eventCustomName || '')} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === el.id ? { ...elem, data: { ...elem.data, eventCustomName: e.target.value } } : elem)))} placeholder="Custom event name" />}
                                                    {el.type === 'event-page-load' && <div className="input-control" style={{ padding: '8px' }}>Runs on page load</div>}
                                                </div>
                                            ) : el.type === 'element-property' ? (
                                                (() => {
                                                    const nodeId = el.id;
                                                    const data = el.data || {};
                                                    const mode = getElementPropertyMode(el);
                                                    const detected = getAutoDetectedProperties(nodeId);
                                                    const elementInputConnection = connections.find((c) => c.toId === nodeId && c.toInput === 'input0');
                                                    const elementInputSource = elementInputConnection
                                                        ? elements.find((e) => e.id === elementInputConnection.fromId)
                                                        : null;
                                                    const selected = Array.isArray(data.elementPropertySelected)
                                                        ? data.elementPropertySelected
                                                        : [];
                                                    const selectedKeys = new Set(selected.map((entry) => entry.key));
                                                    const currentSingle = String(data.elementProperty || '');
                                                    const listExpanded = customPropertyListExpanded.has(nodeId);
                                                    const draft = customPropertyDraft[nodeId] || '';

                                                    // Single dropdown: detected props + the current key even when it
                                                    // is not (currently) detected, so a migrated legacy manual
                                                    // property is never silently dropped.
                                                    const singleOptions: Array<{ key: string; type: string }> = detected.map((p) => ({ key: p.key, type: p.type }));
                                                    if (currentSingle && !singleOptions.some((option) => option.key === currentSingle)) {
                                                        singleOptions.unshift({ key: currentSingle, type: getElementPropertyKeyType(el, currentSingle) });
                                                    }
                                                    const singleType = currentSingle ? getElementPropertyKeyType(el, currentSingle) : '';

                                                    // Custom-mode clickable list: every detected prop + any selected
                                                    // key not currently detected (kept so a temporarily missing DOM
                                                    // property does not destroy the saved selection).
                                                    const itemByKey = new Map<string, { key: string; type: string; origin: 'detected' | 'custom'; selected: boolean }>();
                                                    detected.forEach((p) => {
                                                        itemByKey.set(p.key, { key: p.key, type: p.type, origin: 'detected', selected: selectedKeys.has(p.key) });
                                                    });
                                                    selected.forEach((entry) => {
                                                        const existing = itemByKey.get(entry.key);
                                                        if (existing) {
                                                            existing.selected = true;
                                                            if (entry.origin === 'custom') existing.origin = 'custom';
                                                        } else {
                                                            itemByKey.set(entry.key, {
                                                                key: entry.key,
                                                                type: getElementPropertyKeyType(el, entry.key),
                                                                origin: entry.origin === 'custom' ? 'custom' : 'detected',
                                                                selected: true,
                                                            });
                                                        }
                                                    });
                                                    const customItems = Array.from(itemByKey.values());

                                                    const setMode = (nextMode: ElementPropertyMode) => {
                                                        if (nextMode === mode) return;
                                                        const patch: Record<string, unknown> = { elementPropertyMode: nextMode };
                                                        if (nextMode === 'custom' && !Array.isArray(data.elementPropertySelected)) {
                                                            patch.elementPropertySelected = currentSingle
                                                                ? [{ key: currentSingle, origin: detected.some((p) => p.key === currentSingle) ? 'detected' : 'custom' }]
                                                                : [];
                                                        }
                                                        applyNodeDataChange(nodeId, patch);
                                                    };
                                                    const setSingle = (key: string) => {
                                                        applyNodeDataChange(nodeId, {
                                                            elementProperty: key,
                                                            elementPropertyType: key ? getElementPropertyKeyType(el, key) : undefined,
                                                        });
                                                    };
                                                    const commitSelected = (nextSelected: ElementPropertySelectedEntry[]) => {
                                                        applyNodeDataChange(nodeId, { elementPropertySelected: nextSelected });
                                                    };
                                                    const toggleDetected = (key: string) => {
                                                        commitSelected(
                                                            selectedKeys.has(key)
                                                                ? selected.filter((entry) => entry.key !== key)
                                                                : [...selected, { key, origin: 'detected' as const }]
                                                        );
                                                    };
                                                    const removeCustom = (key: string) => {
                                                        commitSelected(selected.filter((entry) => entry.key !== key));
                                                    };
                                                    const addCustom = (raw: string) => {
                                                        const key = raw.trim();
                                                        if (!key || selected.some((entry) => entry.key === key)) {
                                                            setCustomPropertyDraft((prev) => ({ ...prev, [nodeId]: '' }));
                                                            return;
                                                        }
                                                        const origin: 'detected' | 'custom' = detected.some((p) => p.key === key) ? 'detected' : 'custom';
                                                        commitSelected([...selected, { key, origin }]);
                                                        setCustomPropertyDraft((prev) => ({ ...prev, [nodeId]: '' }));
                                                    };
                                                    const toggleExpanded = () => {
                                                        setCustomPropertyListExpanded((prev) => {
                                                            const next = new Set(prev);
                                                            if (next.has(nodeId)) next.delete(nodeId);
                                                            else next.add(nodeId);
                                                            return next;
                                                        });
                                                    };

                                                    return (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }} onClick={(e) => e.stopPropagation()}>
                                                            <div style={{ fontSize: '10px', color: elementInputSource ? '#86efac' : '#94a3b8' }}>
                                                                {elementInputSource
                                                                    ? `Element: from ${elementInputSource.name || elementInputSource.type} pin`
                                                                    : 'Element: connect the Element pin, or pick an ID below'}
                                                            </div>
                                                            {!elementInputSource && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    {data.elementUseManualId ? (
                                                                        <input
                                                                            type="text"
                                                                            className="input-control"
                                                                            value={String(data.customElementId || '')}
                                                                            placeholder="Element ID"
                                                                            onChange={(e) => applyNodeDataChange(nodeId, { customElementId: e.target.value })}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        />
                                                                    ) : (
                                                                        <select
                                                                            className="input-control"
                                                                            value={String(data.selectedElement || '')}
                                                                            onChange={(e) => applyNodeDataChange(nodeId, { selectedElement: e.target.value })}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <option value="">-- Element --</option>
                                                                            {detectedElements.map((d) => (
                                                                                <option key={d.id} value={d.id}>{d.id}</option>
                                                                            ))}
                                                                        </select>
                                                                    )}
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#cbd5e1', cursor: 'pointer', userSelect: 'none' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!data.elementUseManualId}
                                                                            onChange={(e) => applyNodeDataChange(nodeId, { elementUseManualId: e.target.checked })}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            style={{ cursor: 'pointer' }}
                                                                        />
                                                                        Manual ID
                                                                    </label>
                                                                </div>
                                                            )}
                                                            <select
                                                                className="input-control"
                                                                value={mode}
                                                                onChange={(e) => setMode(e.target.value as ElementPropertyMode)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <option value="single">Single</option>
                                                                <option value="all">All</option>
                                                                <option value="custom">Custom</option>
                                                            </select>

                                                            {mode === 'single' && (
                                                                <>
                                                                    <select
                                                                        className="input-control"
                                                                        value={currentSingle}
                                                                        onChange={(e) => setSingle(e.target.value)}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        <option value="">-- Property --</option>
                                                                        {singleOptions.map((option) => (
                                                                            <option key={option.key} value={option.key}>
                                                                                {option.key}{option.type ? ` (${option.type})` : ''}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                    {currentSingle && singleType && (
                                                                        <div style={{ fontSize: '10px', color: '#64748b' }}>Type: {singleType}</div>
                                                                    )}
                                                                    {detected.length === 0 && (
                                                                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                                                            No live preview element — type a property name above.
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}

                                                            {mode === 'all' && (
                                                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                                                    {detected.length > 0 ? (
                                                                        <>
                                                                            <div>{detected.length} propert{detected.length === 1 ? 'y' : 'ies'} &rarr; {detected.length} output{detected.length === 1 ? '' : 's'}</div>
                                                                            <div className="nl-scroll-guard" style={{ marginTop: '3px', maxHeight: '92px', overflowY: 'auto' }}>
                                                                                {detected.map((p) => (
                                                                                    <div key={p.key}>&#9679; {p.key} <span style={{ opacity: 0.6 }}>({p.type})</span></div>
                                                                                ))}
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <span>No properties detected. Connect an Element Reference to an element that exists in the preview.</span>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {mode === 'custom' && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    <button
                                                                        type="button"
                                                                        className="input-control"
                                                                        style={{ textAlign: 'left', cursor: 'pointer' }}
                                                                        onClick={(e) => { e.stopPropagation(); toggleExpanded(); }}
                                                                    >
                                                                        Properties {listExpanded ? '▾' : '▸'} ({selected.length} selected)
                                                                    </button>
                                                                    {listExpanded && (
                                                                        <div className="nl-scroll-guard" style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                            {customItems.length === 0 && (
                                                                                <div style={{ fontSize: '10px', color: '#94a3b8', padding: '2px 4px' }}>
                                                                                    No detected properties. Add a custom property below.
                                                                                </div>
                                                                            )}
                                                                            {customItems.map((item) => (
                                                                                <div
                                                                                    key={item.key}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        if (item.origin === 'custom') removeCustom(item.key);
                                                                                        else toggleDetected(item.key);
                                                                                    }}
                                                                                    title={item.origin === 'custom'
                                                                                        ? 'Custom property — click to remove'
                                                                                        : (item.selected ? 'Click to deselect' : 'Click to select')}
                                                                                    style={{
                                                                                        cursor: 'pointer',
                                                                                        userSelect: 'none',
                                                                                        fontSize: '11px',
                                                                                        padding: '3px 6px',
                                                                                        borderRadius: '3px',
                                                                                        display: 'flex',
                                                                                        justifyContent: 'space-between',
                                                                                        alignItems: 'center',
                                                                                        background: item.selected ? 'rgba(34,197,94,0.20)' : 'rgba(239,68,68,0.12)',
                                                                                        color: item.selected ? '#86efac' : '#fca5a5',
                                                                                    }}
                                                                                >
                                                                                    <span>{item.origin === 'custom' ? '★ ' : ''}{item.key}</span>
                                                                                    <span style={{ opacity: 0.6 }}>{item.type}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    <input
                                                                        type="text"
                                                                        className="input-control"
                                                                        placeholder="Add custom property, press Enter"
                                                                        value={draft}
                                                                        onChange={(e) => {
                                                                            const value = e.target.value;
                                                                            setCustomPropertyDraft((prev) => ({ ...prev, [nodeId]: value }));
                                                                        }}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                e.preventDefault();
                                                                                addCustom(e.currentTarget.value);
                                                                            }
                                                                        }}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()
                                            ) : el.type === 'get-children' ? (
                                                (() => {
                                                    const nodeId = el.id;
                                                    const data = el.data || {};
                                                    const mode = readGetChildrenMode(data);
                                                    const returnAs = readGetChildrenReturnAs(data);
                                                    const detected = getGetChildrenDetectedChildren(nodeId);
                                                    const singleIndex = readGetChildrenSingleIndex(data);
                                                    const selected = readGetChildrenSelectedIndices(data);
                                                    const selectedSet = new Set(selected);
                                                    const listExpanded = customPropertyListExpanded.has(nodeId);

                                                    const setMode = (nextMode: GetChildrenMode) => {
                                                        if (nextMode !== mode) applyNodeDataChange(nodeId, { getChildrenMode: nextMode });
                                                    };
                                                    const setReturnAs = (nextReturnAs: GetChildrenReturnAs) => {
                                                        if (nextReturnAs !== returnAs) applyNodeDataChange(nodeId, { getChildrenReturnAs: nextReturnAs });
                                                    };
                                                    const setSingle = (index: number) => {
                                                        applyNodeDataChange(nodeId, { getChildrenSingleIndex: Math.max(0, Math.trunc(index) || 0) });
                                                    };
                                                    const toggleChild = (index: number) => {
                                                        applyNodeDataChange(nodeId, {
                                                            getChildrenSelected: selectedSet.has(index)
                                                                ? selected.filter((value) => value !== index)
                                                                : [...selected, index],
                                                        });
                                                    };
                                                    const toggleExpanded = () => {
                                                        setCustomPropertyListExpanded((prev) => {
                                                            const next = new Set(prev);
                                                            if (next.has(nodeId)) next.delete(nodeId);
                                                            else next.add(nodeId);
                                                            return next;
                                                        });
                                                    };

                                                    const singleOptions: Array<{ value: number; label: string }> =
                                                        detected.map((child) => ({ value: child.index, label: child.label }));
                                                    if (singleIndex >= detected.length) {
                                                        singleOptions.push({ value: singleIndex, label: `${singleIndex}: (not in preview)` });
                                                    }

                                                    const itemByIndex = new Map<number, { index: number; label: string; selected: boolean; missing: boolean }>();
                                                    detected.forEach((child) => {
                                                        itemByIndex.set(child.index, { index: child.index, label: child.label, selected: selectedSet.has(child.index), missing: false });
                                                    });
                                                    selected.forEach((index) => {
                                                        const existing = itemByIndex.get(index);
                                                        if (existing) existing.selected = true;
                                                        else itemByIndex.set(index, { index, label: `${index}: (not in preview)`, selected: true, missing: true });
                                                    });
                                                    const customItems = Array.from(itemByIndex.values()).sort((a, b) => a.index - b.index);

                                                    const returnAsControl = (
                                                        <div style={{ display: 'flex', gap: '10px', fontSize: '11px', color: '#94a3b8', alignItems: 'center' }}>
                                                            <span>Return as:</span>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                                                                <input type="radio" checked={returnAs === 'child'} onChange={() => setReturnAs('child')} onClick={(e) => e.stopPropagation()} /> Child
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                                                                <input type="radio" checked={returnAs === 'children'} onChange={() => setReturnAs('children')} onClick={(e) => e.stopPropagation()} /> Children
                                                            </label>
                                                        </div>
                                                    );

                                                    const elementInputConnection = connections.find((c) => c.toId === nodeId && c.toInput === 'input0');
                                                    const elementInputSource = elementInputConnection
                                                        ? elements.find((e) => e.id === elementInputConnection.fromId)
                                                        : null;

                                                    return (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }} onClick={(e) => e.stopPropagation()}>
                                                            <div style={{ fontSize: '10px', color: elementInputSource ? '#86efac' : '#94a3b8' }}>
                                                                {elementInputSource
                                                                    ? `Element: from ${elementInputSource.name || elementInputSource.type} pin`
                                                                    : 'Element: connect the Element pin, or pick an ID below'}
                                                            </div>
                                                            {!elementInputSource && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    {data.elementUseManualId ? (
                                                                        <input
                                                                            type="text"
                                                                            className="input-control"
                                                                            value={String(data.customElementId || '')}
                                                                            placeholder="Element ID"
                                                                            onChange={(e) => applyNodeDataChange(nodeId, { customElementId: e.target.value })}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        />
                                                                    ) : (
                                                                        <select
                                                                            className="input-control"
                                                                            value={String(data.selectedElement || '')}
                                                                            onChange={(e) => applyNodeDataChange(nodeId, { selectedElement: e.target.value })}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            <option value="">-- Element --</option>
                                                                            {detectedElements.map((d) => (
                                                                                <option key={d.id} value={d.id}>{d.id}</option>
                                                                            ))}
                                                                        </select>
                                                                    )}
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#cbd5e1', cursor: 'pointer', userSelect: 'none' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!data.elementUseManualId}
                                                                            onChange={(e) => applyNodeDataChange(nodeId, { elementUseManualId: e.target.checked })}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            style={{ cursor: 'pointer' }}
                                                                        />
                                                                        Manual ID
                                                                    </label>
                                                                </div>
                                                            )}
                                                            <select
                                                                className="input-control"
                                                                value={mode}
                                                                onChange={(e) => setMode(e.target.value as GetChildrenMode)}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <option value="single">Single</option>
                                                                <option value="all">All</option>
                                                                <option value="custom">Custom</option>
                                                            </select>

                                                            {mode === 'single' && (
                                                                detected.length > 0 ? (
                                                                    <select
                                                                        className="input-control"
                                                                        value={String(singleIndex)}
                                                                        onChange={(e) => setSingle(Number(e.target.value))}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        {singleOptions.map((option) => (
                                                                            <option key={option.value} value={String(option.value)}>{option.label}</option>
                                                                        ))}
                                                                    </select>
                                                                ) : (
                                                                    <input
                                                                        className="input-control"
                                                                        type="number"
                                                                        min={0}
                                                                        value={String(singleIndex)}
                                                                        placeholder="Child index (no preview)"
                                                                        onChange={(e) => setSingle(Number(e.target.value))}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    />
                                                                )
                                                            )}

                                                            {mode === 'all' && (
                                                                <>
                                                                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                                                                        {detected.length > 0
                                                                            ? `${detected.length} child${detected.length === 1 ? '' : 'ren'} detected`
                                                                            : 'No children detected. Connect an Element Reference to an element in the preview.'}
                                                                    </div>
                                                                    {returnAsControl}
                                                                </>
                                                            )}

                                                            {mode === 'custom' && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        className="input-control"
                                                                        style={{ textAlign: 'left', cursor: 'pointer' }}
                                                                        onClick={(e) => { e.stopPropagation(); toggleExpanded(); }}
                                                                    >
                                                                        Children {listExpanded ? '▾' : '▸'} ({selected.length} selected)
                                                                    </button>
                                                                    {listExpanded && (
                                                                        <div className="nl-scroll-guard" style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                            {customItems.length === 0 && (
                                                                                <div style={{ fontSize: '10px', color: '#94a3b8', padding: '2px 4px' }}>No children detected.</div>
                                                                            )}
                                                                            {customItems.map((item) => (
                                                                                <div
                                                                                    key={item.index}
                                                                                    onClick={(e) => { e.stopPropagation(); toggleChild(item.index); }}
                                                                                    title={item.selected ? 'Click to deselect' : 'Click to select'}
                                                                                    style={{
                                                                                        cursor: 'pointer',
                                                                                        userSelect: 'none',
                                                                                        fontSize: '11px',
                                                                                        padding: '3px 6px',
                                                                                        borderRadius: '3px',
                                                                                        display: 'flex',
                                                                                        justifyContent: 'space-between',
                                                                                        alignItems: 'center',
                                                                                        background: item.selected ? 'rgba(34,197,94,0.20)' : 'rgba(239,68,68,0.12)',
                                                                                        color: item.selected ? '#86efac' : '#fca5a5',
                                                                                    }}
                                                                                >
                                                                                    <span>{item.missing ? '⚠ ' : ''}{item.label}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {returnAsControl}
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })()
                                            ) : isMemoryNodeType(el.type) ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center', justifyContent: 'center', minHeight: '40px', color: '#aaa', fontSize: '11px' }}>
                                                    Configure in sidebar
                                                </div>
                                            ) : el.type === 'event-element' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                                    {el.data?.eventUseManualId ? (
                                                        <input
                                                            type="text"
                                                            className="input-control"
                                                            value={el.data?.eventId || ''}
                                                            placeholder="Element ID"
                                                            onChange={(e) => {
                                                                const eventId = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, eventId } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    ) : (
                                                        <select
                                                            className="input-control"
                                                            value={el.data?.eventElement || ''}
                                                            onChange={(e) => {
                                                                const eventElement = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, eventElement } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <option value="">-- Target --</option>
                                                            {detectedElements.map(d => (
                                                                <option key={d.id} value={d.id}>{d.name || d.id} ({d.id})</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    <select
                                                        className="input-control"
                                                        value={el.data?.eventType || 'click'}
                                                        onChange={(e) => {
                                                            const eventType = e.target.value;
                                                            setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                elem.id === el.id ? { ...elem, data: { ...elem.data, eventType } } : elem
                                                            )));
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <option value="click">click</option>
                                                        <option value="change">change</option>
                                                        <option value="input">input</option>
                                                        <option value="focus">focus</option>
                                                        <option value="blur">blur</option>
                                                        <option value="keyup">keyup</option>
                                                        <option value="keydown">keydown</option>
                                                    </select>
                                                    <div style={{ marginTop: '8px', paddingTop: '8px', paddingBottom: '6px', borderTop: '1px solid rgba(255,255,255,0.28)', minHeight: '26px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!el.data?.eventUseManualId}
                                                                onChange={(e) => {
                                                                    const eventUseManualId = e.target.checked;
                                                                    setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                        elem.id === el.id ? { ...elem, data: { ...elem.data, eventUseManualId } } : elem
                                                                    )));
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            Manual ID
                                                        </label>
                                                    </div>
                                                </div>
                                            ) : el.type === 'event-id' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                                    {el.data?.eventUseManualId ? (
                                                        <input
                                                            type="text"
                                                            className="input-control"
                                                            value={el.data?.eventId || ''}
                                                            placeholder="Element ID"
                                                            onChange={(e) => {
                                                                const eventId = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, eventId } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    ) : (
                                                        <select
                                                            className="input-control"
                                                            value={el.data?.eventElement || ''}
                                                            onChange={(e) => {
                                                                const eventElement = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, eventElement } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <option value="">-- Target --</option>
                                                            {detectedElements.map(d => (
                                                                <option key={d.id} value={d.id}>{d.name || d.id} ({d.id})</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    <select
                                                        className="input-control"
                                                        value={el.data?.eventType || 'click'}
                                                        onChange={(e) => {
                                                            const eventType = e.target.value;
                                                            setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                elem.id === el.id ? { ...elem, data: { ...elem.data, eventType } } : elem
                                                            )));
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <option value="click">click</option>
                                                        <option value="change">change</option>
                                                        <option value="input">input</option>
                                                        <option value="focus">focus</option>
                                                        <option value="blur">blur</option>
                                                        <option value="keyup">keyup</option>
                                                        <option value="keydown">keydown</option>
                                                    </select>
                                                    <div style={{ marginTop: '8px', paddingTop: '8px', paddingBottom: '6px', borderTop: '1px solid rgba(255,255,255,0.28)', minHeight: '26px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!el.data?.eventUseManualId}
                                                                onChange={(e) => {
                                                                    const eventUseManualId = e.target.checked;
                                                                    setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                        elem.id === el.id ? { ...elem, data: { ...elem.data, eventUseManualId } } : elem
                                                                    )));
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            Manual ID
                                                        </label>
                                                    </div>
                                                </div>
                                            ) : el.type === 'event-processor' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    <div className="input-control" style={{ padding: '10px', cursor: 'default' }}>
                                                        Connect event input and payload input on the node canvas.
                                                    </div>
                                                </div>
                                            ) : el.type === 'element' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                                    {el.data?.elementUseManualId ? (
                                                        <input
                                                            type="text"
                                                            className="input-control"
                                                            value={el.data?.customElementId || ''}
                                                            placeholder="Element ID"
                                                            onChange={(e) => {
                                                                const customElementId = e.target.value;
                                                                setElements(prev =>
                                                                    updateElementValueTypes(
                                                                        prev.map(elem =>
                                                                            elem.id === el.id
                                                                                ? { ...elem, data: { ...elem.data, customElementId, outputs: [] } }
                                                                                : elem
                                                                        )
                                                                    )
                                                                );
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    ) : (
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
                                                    )}
                                                    <select className="input-control" value={String(el.data?.eventType || 'click')} onChange={(e) => setElements(prev => updateElementValueTypes(prev.map(elem => elem.id === el.id ? { ...elem, data: { ...elem.data, eventType: e.target.value } } : elem)))} onClick={(e) => e.stopPropagation()}>
                                                            <option value="click">Click</option><option value="change">Change</option><option value="input">Input</option><option value="focus">Focus</option><option value="blur">Blur</option><option value="mouseenter">Hover enter</option><option value="scroll">Scroll</option>
                                                    </select>
                                                    <div style={{ marginTop: '6px', borderTop: '1px solid rgba(255,255,255,0.28)', paddingTop: '6px', paddingBottom: '4px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!el.data?.elementUseManualId}
                                                                onChange={(e) => {
                                                                    const elementUseManualId = e.target.checked;
                                                                    setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                        elem.id === el.id ? { ...elem, data: { ...elem.data, elementUseManualId } } : elem
                                                                    )));
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            Manual ID
                                                        </label>
                                                    </div>
                                                </div>
                                            ) : el.type === 'output' ? (
                                                (() => {
                                                const outputElementConnection = connections.find((c) => c.toId === el.id && c.toInput === 'input0');
                                                const outputElementSource = outputElementConnection
                                                    ? elements.find((e) => e.id === outputElementConnection.fromId)
                                                    : null;
                                                return (
                                                <div className="node-output-controls" style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                    {!customNodeMode && (
                                                        <>
                                                            {outputElementSource ? (
                                                                <div style={{ fontSize: '10px', color: '#86efac' }}>
                                                                    Target: {outputElementSource.name || outputElementSource.type} pin (ID controls disabled)
                                                                </div>
                                                            ) : el.data?.useIdInput ? (
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
                                                            <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                            {!outputElementSource && (
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
                                                            </div>
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
                                                );
                                                })()
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
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
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
                                            ) : (el.type === 'event-element' || el.type === 'event-id') ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                                    {el.data?.eventUseManualId ? (
                                                        <input
                                                            type="text"
                                                            className="input-control"
                                                            value={el.data?.eventId || ''}
                                                            placeholder="Element ID"
                                                            onChange={(e) => {
                                                                const eventId = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, eventId } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    ) : (
                                                        <select
                                                            className="input-control"
                                                            value={el.data?.eventElement || ''}
                                                            onChange={(e) => {
                                                                const eventElement = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, eventElement } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <option value="">-- Target --</option>
                                                            {detectedElements.map(d => (
                                                                <option key={d.id} value={d.id}>{d.name || d.id} ({d.id})</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    <select
                                                        className="input-control"
                                                        value={el.data?.eventType || 'click'}
                                                        onChange={(e) => {
                                                            const eventType = e.target.value;
                                                            setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                elem.id === el.id ? { ...elem, data: { ...elem.data, eventType } } : elem
                                                            )));
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <option value="click">click</option>
                                                        <option value="change">change</option>
                                                        <option value="input">input</option>
                                                        <option value="focus">focus</option>
                                                        <option value="blur">blur</option>
                                                        <option value="keyup">keyup</option>
                                                        <option value="keydown">keydown</option>
                                                    </select>
                                                    <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '4px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!el.data?.eventUseManualId}
                                                                onChange={(e) => {
                                                                    const eventUseManualId = e.target.checked;
                                                                    setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                        elem.id === el.id ? { ...elem, data: { ...elem.data, eventUseManualId } } : elem
                                                                    )));
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            Manual ID
                                                        </label>
                                                    </div>
                                                </div>
                                            ) : el.type === 'element-ref' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                                    {el.data?.elementUseManualId ? (
                                                        <input
                                                            type="text"
                                                            className="input-control"
                                                            value={el.data?.customElementId || ''}
                                                            placeholder="Element ID"
                                                            onChange={(e) => {
                                                                const customElementId = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, customElementId } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    ) : (
                                                        <select
                                                            className="input-control"
                                                            value={el.data?.selectedElement || ''}
                                                            onChange={(e) => {
                                                                const selectedElement = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, selectedElement } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <option value="">-- Element --</option>
                                                            {detectedElements.map(d => (
                                                                <option key={d.id} value={d.id}>{d.id}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '4px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!el.data?.elementUseManualId}
                                                                onChange={(e) => {
                                                                    const elementUseManualId = e.target.checked;
                                                                    setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                        elem.id === el.id ? { ...elem, data: { ...elem.data, elementUseManualId } } : elem
                                                                    )));
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            Manual ID
                                                        </label>
                                                    </div>
                                                </div>
                                            ) : el.type === 'element-property' ? (
                                                (() => {
                                                    const connId = connections.find(c => c.toId === el.id && c.toInput === 'input0')?.fromId;
                                                    const connRef = connId ? elements.find(e => e.id === connId) : null;
                                                    const refElId = connRef?.data?.elementUseManualId
                                                        ? String(connRef?.data?.customElementId || '')
                                                        : String(connRef?.data?.selectedElement || '');
                                                    const detEl = refElId ? detectedElements.find(d => d.id === refElId) : null;
                                                    const knownProps: Array<{ key: string; type: 'number' | 'string' | 'boolean' }> = getElementTypeProps(detEl);
                                                    const currentProp = el.data?.elementProperty || '';
                                                    const useManual = !!el.data?.elementPropertyUseManual;
                                                    const inferredType = knownProps.find(p => p.key === currentProp)?.type;
                                                    return (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                                            {useManual ? (
                                                                <input
                                                                    type="text"
                                                                    className="input-control"
                                                                    value={currentProp}
                                                                    placeholder="e.g. value, max, data-x"
                                                                    onChange={(e) => {
                                                                        const elementProperty = e.target.value;
                                                                        setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                            elem.id === el.id ? { ...elem, data: { ...elem.data, elementProperty, elementPropertyType: undefined } } : elem
                                                                        )));
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            ) : knownProps.length > 0 ? (
                                                                <select
                                                                    className="input-control"
                                                                    value={currentProp}
                                                                    onChange={(e) => {
                                                                        const elementProperty = e.target.value;
                                                                        const propType = knownProps.find(p => p.key === elementProperty)?.type;
                                                                        setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                            elem.id === el.id ? { ...elem, data: { ...elem.data, elementProperty, elementPropertyType: propType } } : elem
                                                                        )));
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                >
                                                                    <option value="">-- Property --</option>
                                                                    {knownProps.map(p => (
                                                                        <option key={p.key} value={p.key}>{p.key} ({p.type})</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <input
                                                                    type="text"
                                                                    className="input-control"
                                                                    value={currentProp}
                                                                    placeholder="Connect element first"
                                                                    onChange={(e) => {
                                                                        const elementProperty = e.target.value;
                                                                        setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                            elem.id === el.id ? { ...elem, data: { ...elem.data, elementProperty } } : elem
                                                                        )));
                                                                    }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            )}
                                                            {!useManual && inferredType && (
                                                                <div style={{ fontSize: '10px', color: '#64748b' }}>Type: {inferredType}</div>
                                                            )}
                                                            <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '4px' }}>
                                                                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={useManual}
                                                                        onChange={(e) => {
                                                                            const elementPropertyUseManual = e.target.checked;
                                                                            setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                                elem.id === el.id ? { ...elem, data: { ...elem.data, elementPropertyUseManual } } : elem
                                                                            )));
                                                                        }}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        style={{ cursor: 'pointer' }}
                                                                    />
                                                                    Manual property
                                                                </label>
                                                            </div>
                                                        </div>
                                                    );
                                                })()
                                            ) : el.type === 'action-event' ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                                                    {el.data?.actionUseManualId ? (
                                                        <input
                                                            type="text"
                                                            className="input-control"
                                                            value={String(el.data?.actionTargetManualId || '')}
                                                            placeholder="Element ID"
                                                            onChange={(e) => {
                                                                const actionTargetManualId = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, actionTargetManualId } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    ) : (
                                                        <select
                                                            className="input-control"
                                                            value={String(el.data?.actionTargetId || '')}
                                                            onChange={(e) => {
                                                                const actionTargetId = e.target.value;
                                                                setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                    elem.id === el.id ? { ...elem, data: { ...elem.data, actionTargetId } } : elem
                                                                )));
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <option value="">-- Element ID --</option>
                                                            {detectedElements.map(d => (
                                                                <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    <select
                                                        className="input-control"
                                                        value={String(el.data?.actionEventType || 'change')}
                                                        onChange={(e) => {
                                                            const actionEventType = e.target.value;
                                                            setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                elem.id === el.id ? { ...elem, data: { ...elem.data, actionEventType } } : elem
                                                            )));
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <option value="change">change</option>
                                                        <option value="input">input</option>
                                                        <option value="click">click</option>
                                                        <option value="focus">focus</option>
                                                        <option value="blur">blur</option>
                                                        <option value="keydown">keydown</option>
                                                        <option value="keyup">keyup</option>
                                                    </select>
                                                    <div style={{ marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '4px' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!el.data?.actionUseManualId}
                                                                onChange={(e) => {
                                                                    const actionUseManualId = e.target.checked;
                                                                    setElements(prev => updateElementValueTypes(prev.map(elem =>
                                                                        elem.id === el.id ? { ...elem, data: { ...elem.data, actionUseManualId } } : elem
                                                                    )));
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ cursor: 'pointer' }}
                                                            />
                                                            Manual ID
                                                        </label>
                                                    </div>
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
                                                            title={el.type === 'output' ? 'Action' : `Output ${i + 1}`}
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
                                        {(inputCount > 0 || isChartDataCarrier) && (
                                            <div className="inputs-column">
                                                {/* Input pins and controls */}
                                                {inputCount > 0 ? (
                                                    Array.from({ length: inputCount }).map((_, i) => {
                                                        const types = getAcceptedTypesForPin(el, i);
                                                        return (
                                                        <div
                                                            key={`input-row-${i}`}
                                                            className="input-row"
                                                            style={
                                                                isChartDataCarrier
                                                                    ? { visibility: 'hidden', pointerEvents: 'none' }
                                                                    : undefined
                                                            }
                                                        >
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
                                                                                y: fromPinPos.y,
                                                                                reconnectingConnection: existingConnection
                                                                            });
                                                                            const next = connectionsRef.current.filter((conn) => conn.id !== existingConnection.id);
                                                                            syncConnectionsAndTypes(next);
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
                                                                title={getInputLabel(el, i) || `Input ${i + 1}`}
                                                            />
                                                        </div>
                                                    );})
                                                ) : (
                                                    <div className="chart-data-carrier-spacer" aria-hidden="true" />
                                                )}
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
                                                            title={el.type === 'output' ? 'Action' : `Output ${i + 1}`}
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
                                
                                {selected === el.id && el.id !== 'main-block' && (
                                    <button
                                        className="delete-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(el.id);
                                        }}
                                    >
                                        Delete
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
