import { useEffect } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, SelectControl } from '@wordpress/components';
import { v4 as uuid } from 'uuid';

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
    if (Number.isFinite(Number(paddingTop)) && Number(paddingTop) > 0) { style.paddingTop = `${Number(paddingTop)}px`; }
    if (Number.isFinite(Number(paddingRight)) && Number(paddingRight) > 0) { style.paddingRight = `${Number(paddingRight)}px`; }
    if (Number.isFinite(Number(paddingBottom)) && Number(paddingBottom) > 0) { style.paddingBottom = `${Number(paddingBottom)}px`; }
    if (Number.isFinite(Number(paddingLeft)) && Number(paddingLeft) > 0) { style.paddingLeft = `${Number(paddingLeft)}px`; }
    if (Number.isFinite(Number(marginTop)) && Number(marginTop) > 0) { style.marginTop = `${Number(marginTop)}px`; }
    if (Number.isFinite(Number(marginRight)) && Number(marginRight) > 0) { style.marginRight = `${Number(marginRight)}px`; }
    if (Number.isFinite(Number(marginBottom)) && Number(marginBottom) > 0) { style.marginBottom = `${Number(marginBottom)}px`; }
    if (Number.isFinite(Number(marginLeft)) && Number(marginLeft) > 0) { style.marginLeft = `${Number(marginLeft)}px`; }
    if (backgroundMode === 'custom' && backgroundColor) {
        style.backgroundColor = backgroundColor;
    } else if (backgroundMode === 'default') {
        style.background = 'linear-gradient(135deg, rgba(14, 116, 144, 0.12), rgba(37, 99, 235, 0.08))';
        style.border = '1px solid rgba(148, 163, 184, 0.22)';
        style.borderRadius = '14px';
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

const makeSampleItems = (rows, columns) => {
    const count = Math.max(1, rows * columns);
    return Array.from({ length: count }, (_, index) => `Item ${index + 1}`);
};

export function ArrayListEdit({ attributes = {}, setAttributes, clientId }) {
    const {
        listId,
        rows = 3,
        columns = 2,
        listHeight = 0,
        emptyText = 'Array output will appear here.',
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

    useEffect(() => {
        if (!listId) {
            setAttributes({ listId: `nodelogic_list_${String(clientId || uuid()).slice(0, 8)}` });
        }
    }, [listId, clientId, setAttributes]);

    const safeRows = Number.isFinite(Number(rows)) ? Math.max(1, Math.min(12, Number(rows))) : 3;
    const safeColumns = Number.isFinite(Number(columns)) ? Math.max(1, Math.min(12, Number(columns))) : 2;
    const safeListHeight = Number.isFinite(Number(listHeight)) ? Math.max(0, Math.min(3000, Number(listHeight))) : 0;
    const previewItems = makeSampleItems(safeRows, safeColumns);
    const resolvedBackgroundMode = backgroundMode || (backgroundEnabled ? 'custom' : 'default');
    const wrapperStyle = buildBoxStyle({
        paddingTop: paddingTop ?? attributes.padding ?? 0,
        paddingRight: paddingRight ?? attributes.padding ?? 0,
        paddingBottom: paddingBottom ?? attributes.padding ?? 0,
        paddingLeft: paddingLeft ?? attributes.padding ?? 0,
        marginTop: marginTop ?? attributes.margin ?? 0,
        marginRight: marginRight ?? attributes.margin ?? 0,
        marginBottom: marginBottom ?? attributes.margin ?? 0,
        marginLeft: marginLeft ?? attributes.margin ?? 0,
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
    return (
        <>
            <InspectorControls>
                <PanelBody title="Array List Settings" initialOpen>
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="ID"
                        value={listId}
                        onChange={(value) => setAttributes({ listId: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Rows"
                        type="number"
                        value={String(safeRows)}
                        onChange={(value) => {
                            const next = Number(value);
                            setAttributes({ rows: Number.isFinite(next) ? Math.max(1, Math.min(12, next)) : 3 });
                        }}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Columns"
                        type="number"
                        value={String(safeColumns)}
                        onChange={(value) => {
                            const next = Number(value);
                            setAttributes({ columns: Number.isFinite(next) ? Math.max(1, Math.min(12, next)) : 2 });
                        }}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Height (px)"
                        help="Set to 0 to auto-size based on rows."
                        type="number"
                        min="0"
                        value={String(safeListHeight)}
                        onChange={(value) => {
                            const next = Number(value);
                            setAttributes({ listHeight: Number.isFinite(next) ? Math.max(0, Math.min(3000, next)) : 0 });
                        }}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Empty text"
                        value={emptyText}
                        onChange={(value) => setAttributes({ emptyText: value })}
                    />
                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>Padding</div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Top" type="number" value={String(paddingTop ?? attributes.padding ?? 0)} onChange={(value) => setAttributes({ paddingTop: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Right" type="number" value={String(paddingRight ?? attributes.padding ?? 0)} onChange={(value) => setAttributes({ paddingRight: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Bottom" type="number" value={String(paddingBottom ?? attributes.padding ?? 0)} onChange={(value) => setAttributes({ paddingBottom: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Left" type="number" value={String(paddingLeft ?? attributes.padding ?? 0)} onChange={(value) => setAttributes({ paddingLeft: Number(value) || 0 })} />
                    </div>
                    <SelectControl
                        __next40pxDefaultSize
                        label="Background mode"
                        value={resolvedBackgroundMode}
                        options={[{ label: 'Default background', value: 'default' }, { label: 'No background', value: 'none' }, { label: 'Use custom background', value: 'custom' }]}
                        onChange={(value) => setAttributes({ backgroundMode: value, backgroundEnabled: value === 'custom' })}
                    />
                    <div style={{ fontWeight: 600, margin: '12px 0 6px' }}>Margin</div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Top" type="number" value={String(marginTop ?? attributes.margin ?? 0)} onChange={(value) => setAttributes({ marginTop: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Right" type="number" value={String(marginRight ?? attributes.margin ?? 0)} onChange={(value) => setAttributes({ marginRight: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Bottom" type="number" value={String(marginBottom ?? attributes.margin ?? 0)} onChange={(value) => setAttributes({ marginBottom: Number(value) || 0 })} />
                        <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Left" type="number" value={String(marginLeft ?? attributes.margin ?? 0)} onChange={(value) => setAttributes({ marginLeft: Number(value) || 0 })} />
                    </div>
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Width"
                        value={String(width || '')}
                        onChange={(value) => setAttributes({ width: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Height"
                        value={String(height || '')}
                        onChange={(value) => setAttributes({ height: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Minimum height"
                        value={String(minHeight || '')}
                        onChange={(value) => setAttributes({ minHeight: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Background color"
                        value={String(backgroundColor || '')}
                        onChange={(value) => setAttributes({ backgroundColor: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Border width (px)"
                        type="number"
                        value={String(borderWidth || 0)}
                        onChange={(value) => setAttributes({ borderWidth: Number(value) || 0 })}
                    />
                    <SelectControl
                        __next40pxDefaultSize
                        label="Border style"
                        value={borderStyle}
                        options={[{ label: 'Solid', value: 'solid' }, { label: 'Dotted', value: 'dotted' }, { label: 'Dashed', value: 'dashed' }, { label: 'Double', value: 'double' }]}
                        onChange={(value) => setAttributes({ borderStyle: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Border color"
                        value={String(borderColor || '')}
                        onChange={(value) => setAttributes({ borderColor: value })}
                    />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Border radius (px)"
                        type="number"
                        value={String(borderRadius || 0)}
                        onChange={(value) => setAttributes({ borderRadius: Number(value) || 0 })}
                    />
                </PanelBody>
            </InspectorControls>
            <div
                {...useBlockProps({ className: 'nodelogic-array-list' })}
                style={wrapperStyle}
                data-nodelogic-id={listId}
                data-nodelogic-array-list="1"
                data-nodelogic-rows={safeRows}
                data-nodelogic-columns={safeColumns}
                data-nodelogic-list-height={safeListHeight || undefined}
            >
            <div
                className="nodelogic-array-list__items"
                data-nodelogic-array-list-items="1"
                style={{
                    gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
                    height: safeListHeight > 0 ? `${safeListHeight}px` : undefined,
                    maxHeight: safeListHeight > 0 ? `${safeListHeight}px` : undefined,
                    overflowY: safeListHeight > 0 ? 'auto' : undefined,
                }}
            >
                {previewItems.map((item, index) => (
                    <section key={index} className="nodelogic-array-list__item nodelogic-custom-element__item nodelogic-array-list__item--primitive">
                        <div className="nodelogic-array-list__primitive-value">{String(item ?? '')}</div>
                    </section>
                ))}
            </div>
            <div className="nodelogic-array-list__empty" data-nodelogic-array-list-empty="1">{emptyText}</div>
            </div>
        </>
    );
}

export function ArrayListSave({ attributes = {} }) {
    const {
        listId,
        rows = 3,
        columns = 2,
        listHeight = 0,
        emptyText = 'Array output will appear here.',
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

    const safeRows = Number.isFinite(Number(rows)) ? Math.max(1, Math.min(12, Number(rows))) : 3;
    const safeColumns = Number.isFinite(Number(columns)) ? Math.max(1, Math.min(12, Number(columns))) : 2;
    const safeListHeight = Number.isFinite(Number(listHeight)) ? Math.max(0, Math.min(3000, Number(listHeight))) : 0;
    const resolvedBackgroundMode = backgroundMode || (backgroundEnabled ? 'custom' : 'default');
    const wrapperStyle = buildBoxStyle({
        paddingTop: paddingTop ?? attributes.padding ?? 0,
        paddingRight: paddingRight ?? attributes.padding ?? 0,
        paddingBottom: paddingBottom ?? attributes.padding ?? 0,
        paddingLeft: paddingLeft ?? attributes.padding ?? 0,
        marginTop: marginTop ?? attributes.margin ?? 0,
        marginRight: marginRight ?? attributes.margin ?? 0,
        marginBottom: marginBottom ?? attributes.margin ?? 0,
        marginLeft: marginLeft ?? attributes.margin ?? 0,
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

    return (
        <div
            {...useBlockProps.save({ className: 'nodelogic-array-list' })}
            style={wrapperStyle}
            data-nodelogic-id={listId || 'nodelogic-array-list'}
            data-nodelogic-array-list="1"
            data-nodelogic-rows={safeRows}
            data-nodelogic-columns={safeColumns}
            data-nodelogic-list-height={safeListHeight || undefined}
        >
            <div
                className="nodelogic-array-list__items"
                data-nodelogic-array-list-items="1"
                style={{
                    gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
                    height: safeListHeight > 0 ? `${safeListHeight}px` : undefined,
                    maxHeight: safeListHeight > 0 ? `${safeListHeight}px` : undefined,
                    overflowY: safeListHeight > 0 ? 'auto' : undefined,
                }}
            />
            <div className="nodelogic-array-list__empty" data-nodelogic-array-list-empty="1">{emptyText}</div>
        </div>
    );
}

export function LegacyArrayListSave({ attributes = {} }) {
    const {
        listId,
        rows = 3,
        columns = 2,
        emptyText = 'Array output will appear here.',
    } = attributes;

    const safeRows = Number.isFinite(Number(rows)) ? Math.max(1, Math.min(12, Number(rows))) : 3;
    const safeColumns = Number.isFinite(Number(columns)) ? Math.max(1, Math.min(12, Number(columns))) : 2;

    return (
        <div {...useBlockProps.save({ className: 'nodelogic-array-list' })} data-nodelogic-id={listId || 'nodelogic-array-list'} data-nodelogic-array-list="1" data-nodelogic-rows={safeRows} data-nodelogic-columns={safeColumns}>
            <div
                className="nodelogic-array-list__items"
                data-nodelogic-array-list-items="1"
                style={{
                    gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
                }}
            />
            <div className="nodelogic-array-list__empty" data-nodelogic-array-list-empty="1">{emptyText}</div>
        </div>
    );
}

export function LegacyArrayListSavePlain({ attributes = {} }) {
    const {
        listId,
        rows = 3,
        columns = 2,
        listHeight = 0,
        emptyText = 'Array output will appear here.',
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

    const safeRows = Number.isFinite(Number(rows)) ? Math.max(1, Math.min(12, Number(rows))) : 3;
    const safeColumns = Number.isFinite(Number(columns)) ? Math.max(1, Math.min(12, Number(columns))) : 2;
    const safeListHeight = Number.isFinite(Number(listHeight)) ? Math.max(0, Math.min(3000, Number(listHeight))) : 0;
    const resolvedBackgroundMode = backgroundMode || (backgroundEnabled ? 'custom' : 'default');
    const wrapperStyle = buildBoxStyle({
        paddingTop: paddingTop ?? attributes.padding ?? 0,
        paddingRight: paddingRight ?? attributes.padding ?? 0,
        paddingBottom: paddingBottom ?? attributes.padding ?? 0,
        paddingLeft: paddingLeft ?? attributes.padding ?? 0,
        marginTop: marginTop ?? attributes.margin ?? 0,
        marginRight: marginRight ?? attributes.margin ?? 0,
        marginBottom: marginBottom ?? attributes.margin ?? 0,
        marginLeft: marginLeft ?? attributes.margin ?? 0,
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

    return (
        <div className="nodelogic-array-list" data-nodelogic-id={listId || 'nodelogic-array-list'} data-nodelogic-array-list="1" data-nodelogic-rows={safeRows} data-nodelogic-columns={safeColumns} data-nodelogic-list-height={safeListHeight || undefined}>
            <div
                className="nodelogic-array-list__items"
                data-nodelogic-array-list-items="1"
                style={{
                    gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))`,
                    height: safeListHeight > 0 ? `${safeListHeight}px` : undefined,
                    maxHeight: safeListHeight > 0 ? `${safeListHeight}px` : undefined,
                    overflowY: safeListHeight > 0 ? 'auto' : undefined,
                }}
            />
            <div className="nodelogic-array-list__empty" data-nodelogic-array-list-empty="1">{emptyText}</div>
        </div>
    );
}
