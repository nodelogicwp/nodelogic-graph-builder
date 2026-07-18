import { useEffect } from '@wordpress/element';
import { InnerBlocks, InspectorControls, useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';
import { PanelBody, RangeControl, TextControl, SelectControl, Button } from '@wordpress/components';

export const PRESET_CONTAINER_ALLOWED_BLOCKS = [
    'custom/nodelogic-preset-container',
    'custom/element-number',
    'custom/element-seekbar',
    'custom/element-text',
    'custom/element-label',
    'custom/element-radio',
    'custom/element-select',
    'custom/element-checkbox',
    'custom/button-group',
    'custom/nodelogic-logic',
    'custom/nodelogic-image',
    'custom/nodelogic-array-list',
    'custom/nodelogic-trigger-group',
];

const clampGridValue = (value, fallback) => {
    const next = Number(value);
    if (!Number.isFinite(next)) {
        return fallback;
    }
    return Math.max(1, Math.min(6, Math.round(next)));
};

const normalizeGridTemplate = (template = '', gapValue = 0) => {
    const trimmed = String(template || '').trim();
    if (!trimmed) {
        return '';
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
        return trimmed;
    }

    const gap = Math.max(0, Number(gapValue) || 0);
    const halfGap = gap / 2;

    return parts.map((part) => {
        const percentMatch = /^(\d+(?:\.\d+)?)%$/.exec(part);
        if (percentMatch) {
            return `minmax(0, calc(${percentMatch[1]}% - ${halfGap}px))`;
        }
        return `minmax(0, ${part})`;
    }).join(' ');
};

const buildGridStyle = (rows, columns, columnTemplate = '', rowTemplate = '', gapColumns = 16, gapRows = 16) => {
    const columnsCss = columnTemplate && String(columnTemplate).trim() !== ''
        ? normalizeGridTemplate(String(columnTemplate).trim(), gapColumns)
        : `repeat(${columns}, minmax(0, 1fr))`;
    const rowsCss = rowTemplate && String(rowTemplate).trim() !== ''
        ? normalizeGridTemplate(String(rowTemplate).trim(), gapRows)
        : `repeat(${rows}, minmax(0, auto))`;

    return {
        display: 'grid',
        gridTemplateColumns: columnsCss,
        gridTemplateRows: rowsCss,
        gap: `${Number(gapRows) || 0}px ${Number(gapColumns) || 0}px`,
    };
};

const getSpacingValue = (value, fallback = 0) => {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
};

const buildBoxStyle = ({
    paddingTop = 0,
    paddingRight = 0,
    paddingBottom = 0,
    paddingLeft = 0,
    marginTop = 0,
    marginRight = 0,
    marginBottom = 0,
    marginLeft = 0,
    backgroundColor = '',
    backgroundMode = 'default',
    borderWidth = 0,
    borderStyle = 'solid',
    borderColor = '',
    borderRadius = 0,
    width = '',
    height = '',
    minHeight = '',
}) => {
    const style = { boxSizing: 'border-box' };
    const topPadding = getSpacingValue(paddingTop);
    const rightPadding = getSpacingValue(paddingRight);
    const bottomPadding = getSpacingValue(paddingBottom);
    const leftPadding = getSpacingValue(paddingLeft);
    const topMargin = getSpacingValue(marginTop);
    const rightMargin = getSpacingValue(marginRight);
    const bottomMargin = getSpacingValue(marginBottom);
    const leftMargin = getSpacingValue(marginLeft);

    if (topPadding > 0 || rightPadding > 0 || bottomPadding > 0 || leftPadding > 0) {
        if (topPadding > 0) { style.paddingTop = `${topPadding}px`; }
        if (rightPadding > 0) { style.paddingRight = `${rightPadding}px`; }
        if (bottomPadding > 0) { style.paddingBottom = `${bottomPadding}px`; }
        if (leftPadding > 0) { style.paddingLeft = `${leftPadding}px`; }
    }
    if (topMargin > 0 || rightMargin > 0 || bottomMargin > 0 || leftMargin > 0) {
        if (topMargin > 0) { style.marginTop = `${topMargin}px`; }
        if (rightMargin > 0) { style.marginRight = `${rightMargin}px`; }
        if (bottomMargin > 0) { style.marginBottom = `${bottomMargin}px`; }
        if (leftMargin > 0) { style.marginLeft = `${leftMargin}px`; }
    }
    if (backgroundMode === 'custom' && backgroundColor) {
        style.backgroundColor = backgroundColor;
    } else if (backgroundMode === 'default') {
        style.background = 'linear-gradient(135deg, rgba(14, 116, 144, 0.16), rgba(37, 99, 235, 0.12))';
        style.border = '1px solid rgba(148, 163, 184, 0.22)';
        style.borderRadius = '16px';
    }
    if (Number.isFinite(Number(borderWidth)) && Number(borderWidth) > 0) {
        style.borderWidth = `${Number(borderWidth)}px`;
        style.borderStyle = borderStyle || 'solid';
        if (borderColor) {
            style.borderColor = borderColor;
        }
    }
    if (Number.isFinite(Number(borderRadius)) && Number(borderRadius) > 0) {
        style.borderRadius = `${Number(borderRadius)}px`;
    }
    if (width) {
        style.width = width;
    }
    if (height) {
        style.height = height;
    }
    if (minHeight) {
        style.minHeight = minHeight;
    }
    return style;
};

export function PresetContainerEdit({ attributes = {}, setAttributes, clientId }) {
    const {
        rows = 4,
        columns = 1,
        presetId = 'custom',
        containerId,
        columnTemplate = '',
        rowTemplate = '',
        gapColumns = 16,
        gapRows = 16,
        justifyItems = 'stretch',
        alignItems = 'stretch',
        justifyContent = 'start',
        alignContent = 'start',
        heightMode = 'auto',
        heightPx = 0,
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        backgroundEnabled = false,
        backgroundColor = '',
        backgroundMode,
        borderWidth = 0,
        borderStyle = 'solid',
        borderColor = '',
        borderRadius = 0,
        width = '',
        height = '',
        minHeight = '',
    } = attributes;
    const resolvedPaddingTop = paddingTop ?? attributes.padding ?? 18;
    const resolvedPaddingRight = paddingRight ?? attributes.padding ?? 18;
    const resolvedPaddingBottom = paddingBottom ?? attributes.padding ?? 18;
    const resolvedPaddingLeft = paddingLeft ?? attributes.padding ?? 18;
    const resolvedMarginTop = marginTop ?? attributes.margin ?? 0;
    const resolvedMarginRight = marginRight ?? attributes.margin ?? 0;
    const resolvedMarginBottom = marginBottom ?? attributes.margin ?? 0;
    const resolvedMarginLeft = marginLeft ?? attributes.margin ?? 0;
    const resolvedBackgroundMode = backgroundMode || (backgroundEnabled ? 'custom' : 'default');

    useEffect(() => {
        if (!containerId) {
            setAttributes({ containerId: `container_${String(clientId || '').slice(0, 8)}` });
        }
    }, [containerId, clientId, setAttributes]);

    const safeRows = clampGridValue(rows, 4);
    const safeColumns = clampGridValue(columns, 1);

    const gridStyle = buildGridStyle(safeRows, safeColumns, columnTemplate, rowTemplate, gapColumns, gapRows);
    const finalStyle = {
        ...gridStyle,
        justifyItems: justifyItems || 'stretch',
        alignItems: alignItems || 'stretch',
        justifyContent: justifyContent || 'start',
        alignContent: alignContent || 'start',
        height: heightMode === 'fixed' ? `${Number(heightPx) || 0}px` : undefined,
    };

    const containerStyle = buildBoxStyle({
        paddingTop: resolvedPaddingTop,
        paddingRight: resolvedPaddingRight,
        paddingBottom: resolvedPaddingBottom,
        paddingLeft: resolvedPaddingLeft,
        marginTop: resolvedMarginTop,
        marginRight: resolvedMarginRight,
        marginBottom: resolvedMarginBottom,
        marginLeft: resolvedMarginLeft,
        backgroundColor,
        backgroundMode: resolvedBackgroundMode,
        borderWidth,
        borderStyle,
        borderColor,
        borderRadius,
        width,
        height,
        minHeight,
    });

    const blockProps = useBlockProps({
        className: 'nodelogic-preset-container nodelogic-preset-container__grid',
        'data-preset-id': presetId,
        'data-nodelogic-id': containerId,
        'data-nodelogic-container': '1',
        style: { ...containerStyle, ...finalStyle },
    });

    const innerBlocksProps = useInnerBlocksProps(blockProps, {
        allowedBlocks: PRESET_CONTAINER_ALLOWED_BLOCKS,
        renderAppender: InnerBlocks.ButtonBlockAppender,
        templateLock: false,
    });

    return (
        <>
            <InspectorControls>
                <PanelBody title="Container" initialOpen>
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Preset ID"
                        value={presetId}
                        onChange={(value) => setAttributes({ presetId: value })}
                        help="Used by starter presets and future preset libraries."
                    />
                    <RangeControl
                        label="Rows"
                        value={safeRows}
                        onChange={(value) => setAttributes({ rows: clampGridValue(value, safeRows) })}
                        min={1}
                        max={12}
                    />
                    <RangeControl
                        label="Columns"
                        value={safeColumns}
                        onChange={(value) => setAttributes({ columns: clampGridValue(value, safeColumns) })}
                        min={1}
                        max={12}
                    />

                    <TextControl
                        label="Columns template (CSS)"
                        help="Optional CSS grid-template-columns value, e.g. '75% 25%' or '2fr 1fr'. Leave empty to use equal columns."
                        value={columnTemplate}
                        onChange={(value) => setAttributes({ columnTemplate: value })}
                    />
                    <SelectControl
                        label="Columns preset"
                        help="Quick presets for column widths"
                        value={columnTemplate || 'none'}
                        options={[
                            { label: 'None (equal columns)', value: 'none' },
                            { label: '50 / 50', value: '50% 50%' },
                            { label: '66 / 33', value: '66% 34%' },
                            { label: '75 / 25', value: '75% 25%' },
                            { label: '33 / 33 / 33', value: '33% 33% 33%' },
                            { label: '25 / 25 / 25 / 25', value: '25% 25% 25% 25%' },
                        ]}
                        onChange={(v) => setAttributes({ columnTemplate: v === 'none' ? '' : v })}
                    />
                    <TextControl
                        label="Rows template (CSS)"
                        help="Optional CSS grid-template-rows value, e.g. '60% 40%' or '2fr 1fr'. Leave empty for automatic rows."
                        value={rowTemplate}
                        onChange={(value) => setAttributes({ rowTemplate: value })}
                    />
                    <SelectControl
                        label="Rows preset"
                        help="Quick presets for row heights"
                        value={rowTemplate || 'none'}
                        options={[
                            { label: 'None (auto rows)', value: 'none' },
                            { label: '50 / 50', value: '50% 50%' },
                            { label: '60 / 40', value: '60% 40%' },
                            { label: '66 / 33', value: '66% 34%' },
                            { label: '33 / 33 / 33', value: '33% 33% 33%' },
                            { label: '25 / 25 / 25 / 25', value: '25% 25% 25% 25%' },
                        ]}
                        onChange={(v) => setAttributes({ rowTemplate: v === 'none' ? '' : v })}
                    />

                    <TextControl
                        label="Gap columns (px)"
                        type="number"
                        value={String(gapColumns)}
                        onChange={(value) => setAttributes({ gapColumns: Number(value) || 0 })}
                    />
                    <TextControl
                        label="Gap rows (px)"
                        type="number"
                        value={String(gapRows)}
                        onChange={(value) => setAttributes({ gapRows: Number(value) || 0 })}
                    />

                    <SelectControl
                        label="Justify items"
                        value={justifyItems}
                        options={[{ label: 'Start', value: 'start' }, { label: 'Center', value: 'center' }, { label: 'End', value: 'end' }, { label: 'Stretch', value: 'stretch' }]}
                        onChange={(v) => setAttributes({ justifyItems: v })}
                    />
                    <SelectControl
                        label="Align items"
                        value={alignItems}
                        options={[{ label: 'Start', value: 'start' }, { label: 'Center', value: 'center' }, { label: 'End', value: 'end' }, { label: 'Stretch', value: 'stretch' }]}
                        onChange={(v) => setAttributes({ alignItems: v })}
                    />
                    <SelectControl
                        label="Justify content"
                        value={justifyContent}
                        options={[{ label: 'Start', value: 'start' }, { label: 'Center', value: 'center' }, { label: 'End', value: 'end' }, { label: 'Space between', value: 'space-between' }, { label: 'Space around', value: 'space-around' }]}
                        onChange={(v) => setAttributes({ justifyContent: v })}
                    />
                    <SelectControl
                        label="Align content"
                        value={alignContent}
                        options={[{ label: 'Start', value: 'start' }, { label: 'Center', value: 'center' }, { label: 'End', value: 'end' }, { label: 'Stretch', value: 'stretch' }]}
                        onChange={(v) => setAttributes({ alignContent: v })}
                    />

                    <SelectControl
                        label="Height mode"
                        value={heightMode}
                        options={[{ label: 'Auto (based on rows)', value: 'auto' }, { label: 'Fixed (px)', value: 'fixed' }]}
                        onChange={(v) => setAttributes({ heightMode: v })}
                    />
                    {heightMode === 'fixed' && (
                        <TextControl
                            label="Height (px)"
                            type="number"
                            value={String(heightPx || 0)}
                            onChange={(value) => setAttributes({ heightPx: Number(value) || 0 })}
                        />
                    )}

                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>Padding</div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                        <TextControl label="Top" type="number" value={String(resolvedPaddingTop || 0)} onChange={(value) => setAttributes({ paddingTop: Number(value) || 0 })} />
                        <TextControl label="Right" type="number" value={String(resolvedPaddingRight || 0)} onChange={(value) => setAttributes({ paddingRight: Number(value) || 0 })} />
                        <TextControl label="Bottom" type="number" value={String(resolvedPaddingBottom || 0)} onChange={(value) => setAttributes({ paddingBottom: Number(value) || 0 })} />
                        <TextControl label="Left" type="number" value={String(resolvedPaddingLeft || 0)} onChange={(value) => setAttributes({ paddingLeft: Number(value) || 0 })} />
                    </div>
                    <Button variant="secondary" onClick={() => setAttributes({ paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0 })}>Reset padding</Button>
                    <div style={{ fontWeight: 600, margin: '12px 0 6px' }}>Margin</div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                        <TextControl label="Top" type="number" value={String(resolvedMarginTop || 0)} onChange={(value) => setAttributes({ marginTop: Number(value) || 0 })} />
                        <TextControl label="Right" type="number" value={String(resolvedMarginRight || 0)} onChange={(value) => setAttributes({ marginRight: Number(value) || 0 })} />
                        <TextControl label="Bottom" type="number" value={String(resolvedMarginBottom || 0)} onChange={(value) => setAttributes({ marginBottom: Number(value) || 0 })} />
                        <TextControl label="Left" type="number" value={String(resolvedMarginLeft || 0)} onChange={(value) => setAttributes({ marginLeft: Number(value) || 0 })} />
                    </div>
                    <Button variant="secondary" onClick={() => setAttributes({ marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0 })}>Reset margin</Button>
                    <TextControl
                        label="Width"
                        value={String(width || '')}
                        onChange={(value) => setAttributes({ width: value })}
                        help="Example: 100%, 320px, auto"
                    />
                    <TextControl
                        label="Height"
                        value={String(height || '')}
                        onChange={(value) => setAttributes({ height: value })}
                        help="Example: 240px, auto"
                    />
                    <TextControl
                        label="Minimum height"
                        value={String(minHeight || '')}
                        onChange={(value) => setAttributes({ minHeight: value })}
                    />
                    <TextControl
                        label="Background color"
                        value={String(backgroundColor || '')}
                        onChange={(value) => setAttributes({ backgroundColor: value })}
                    />
                    <SelectControl
                        label="Background mode"
                        value={resolvedBackgroundMode}
                        options={[{ label: 'Default container background', value: 'default' }, { label: 'No background', value: 'none' }, { label: 'Use custom background', value: 'custom' }]}
                        onChange={(value) => setAttributes({ backgroundMode: value, backgroundEnabled: value === 'custom' })}
                    />
                    <TextControl
                        label="Border width (px)"
                        type="number"
                        value={String(borderWidth || 0)}
                        onChange={(value) => setAttributes({ borderWidth: Number(value) || 0 })}
                    />
                    <SelectControl
                        label="Border style"
                        value={borderStyle}
                        options={[{ label: 'Solid', value: 'solid' }, { label: 'Dotted', value: 'dotted' }, { label: 'Dashed', value: 'dashed' }, { label: 'Double', value: 'double' }]}
                        onChange={(value) => setAttributes({ borderStyle: value })}
                    />
                    <TextControl
                        label="Border color"
                        value={String(borderColor || '')}
                        onChange={(value) => setAttributes({ borderColor: value })}
                    />
                    <TextControl
                        label="Border radius (px)"
                        type="number"
                        value={String(borderRadius || 0)}
                        onChange={(value) => setAttributes({ borderRadius: Number(value) || 0 })}
                    />
                </PanelBody>
            </InspectorControls>

            <div {...innerBlocksProps} />
        </>
    );
}

export function PresetContainerDynamicSave() {
    return <InnerBlocks.Content />;
}

export function PresetContainerSave({ attributes = {} }) {
    const {
        rows = 4,
        columns = 1,
        presetId = 'custom',
        containerId,
        columnTemplate = '',
        rowTemplate = '',
        gapColumns = 16,
        gapRows = 16,
        justifyItems = 'stretch',
        alignItems = 'stretch',
        justifyContent = 'start',
        alignContent = 'start',
        heightMode = 'auto',
        heightPx = 0,
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        backgroundEnabled = false,
        backgroundColor = '',
        backgroundMode,
        borderWidth = 0,
        borderStyle = 'solid',
        borderColor = '',
        borderRadius = 0,
        width = '',
        height = '',
        minHeight = '',
    } = attributes;
    const resolvedPaddingTop = paddingTop ?? attributes.padding ?? 18;
    const resolvedPaddingRight = paddingRight ?? attributes.padding ?? 18;
    const resolvedPaddingBottom = paddingBottom ?? attributes.padding ?? 18;
    const resolvedPaddingLeft = paddingLeft ?? attributes.padding ?? 18;
    const resolvedMarginTop = marginTop ?? attributes.margin ?? 0;
    const resolvedMarginRight = marginRight ?? attributes.margin ?? 0;
    const resolvedMarginBottom = marginBottom ?? attributes.margin ?? 0;
    const resolvedMarginLeft = marginLeft ?? attributes.margin ?? 0;
    const resolvedBackgroundMode = backgroundMode || (backgroundEnabled ? 'custom' : 'default');

    const safeRows = clampGridValue(rows, 4);
    const safeColumns = clampGridValue(columns, 1);
    const gridStyle = buildGridStyle(safeRows, safeColumns, columnTemplate, rowTemplate, gapColumns, gapRows);
    const finalStyle = {
        ...gridStyle,
        justifyItems: justifyItems || 'stretch',
        alignItems: alignItems || 'stretch',
        justifyContent: justifyContent || 'start',
        alignContent: alignContent || 'start',
        height: heightMode === 'fixed' ? `${Number(heightPx) || 0}px` : undefined,
    };

    const containerStyle = buildBoxStyle({
        paddingTop: resolvedPaddingTop,
        paddingRight: resolvedPaddingRight,
        paddingBottom: resolvedPaddingBottom,
        paddingLeft: resolvedPaddingLeft,
        marginTop: resolvedMarginTop,
        marginRight: resolvedMarginRight,
        marginBottom: resolvedMarginBottom,
        marginLeft: resolvedMarginLeft,
        backgroundColor,
        backgroundMode: resolvedBackgroundMode,
        borderWidth,
        borderStyle,
        borderColor,
        borderRadius,
        width,
        height,
        minHeight,
    });

    const blockProps = useBlockProps.save({
        className: 'nodelogic-preset-container nodelogic-preset-container__grid',
        'data-preset-id': presetId,
        'data-nodelogic-id': containerId || 'nodelogic-container',
        'data-nodelogic-container': '1',
        style: { ...containerStyle, ...finalStyle },
    });

    return (
        <div {...blockProps}>
            <InnerBlocks.Content />
        </div>
    );
}

export function LegacyPresetContainerSave({ attributes = {} }) {
    const {
        rows = 4,
        columns = 1,
        containerId,
    } = attributes;

    const safeRows = clampGridValue(rows, 4);
    const safeColumns = clampGridValue(columns, 1);

    const blockProps = useBlockProps.save({
        className: 'nodelogic-preset-container',
        'data-nodelogic-id': containerId || 'nodelogic-container',
        'data-nodelogic-container': '1',
    });

    return (
        <div {...blockProps}>
            <div
                className="nodelogic-preset-container__grid"
                style={buildGridStyle(safeRows, safeColumns)}
            >
                <InnerBlocks.Content />
            </div>
        </div>
    );
}

export function LegacyPresetContainerSavePlain({ attributes = {} }) {
    const {
        rows = 4,
        columns = 1,
        containerId,
    } = attributes;

    const safeRows = clampGridValue(rows, 4);
    const safeColumns = clampGridValue(columns, 1);

    return (
        <div className="nodelogic-preset-container" data-nodelogic-id={containerId || 'nodelogic-container'} data-nodelogic-container="1">
            <div
                className="nodelogic-preset-container__grid"
                style={buildGridStyle(safeRows, safeColumns)}
            >
                <InnerBlocks.Content />
            </div>
        </div>
    );
}
