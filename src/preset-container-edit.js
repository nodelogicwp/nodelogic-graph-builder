import { InnerBlocks, InspectorControls, useBlockProps, useInnerBlocksProps } from '@wordpress/block-editor';
import { PanelBody, RangeControl, TextControl } from '@wordpress/components';

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
];

const clampGridValue = (value, fallback) => {
    const next = Number(value);
    if (!Number.isFinite(next)) {
        return fallback;
    }
    return Math.max(1, Math.min(6, Math.round(next)));
};

const buildGridStyle = (rows, columns) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${rows}, minmax(0, auto))`,
    gap: '16px',
});

export function PresetContainerEdit({ attributes = {}, setAttributes }) {
    const {
        rows = 4,
        columns = 1,
        presetId = 'custom',
    } = attributes;

    const safeRows = clampGridValue(rows, 4);
    const safeColumns = clampGridValue(columns, 1);
    const gridStyle = buildGridStyle(safeRows, safeColumns);

    const blockProps = useBlockProps({
        className: 'nodelogic-preset-container',
        'data-preset-id': presetId,
        style: gridStyle,
    });

    const innerBlocksProps = useInnerBlocksProps(blockProps, {
        allowedBlocks: PRESET_CONTAINER_ALLOWED_BLOCKS,
        renderAppender: InnerBlocks.ButtonBlockAppender,
        templateLock: false,
    });

    return (
        <>
            <InspectorControls>
                <PanelBody title="Preset Container" initialOpen>
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
                        max={6}
                    />
                    <RangeControl
                        label="Columns"
                        value={safeColumns}
                        onChange={(value) => setAttributes({ columns: clampGridValue(value, safeColumns) })}
                        min={1}
                        max={6}
                    />
                </PanelBody>
            </InspectorControls>

            <div {...innerBlocksProps} />
        </>
    );
}

export function PresetContainerSave({ attributes = {} }) {
    const {
        rows = 4,
        columns = 1,
        presetId = 'custom',
    } = attributes;

    const safeRows = clampGridValue(rows, 4);
    const safeColumns = clampGridValue(columns, 1);
    const blockProps = useBlockProps.save({
        className: 'nodelogic-preset-container',
        'data-preset-id': presetId,
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

export function LegacyPresetContainerSave({ attributes = {} }) {
    const {
        rows = 4,
        columns = 1,
    } = attributes;

    const safeRows = clampGridValue(rows, 4);
    const safeColumns = clampGridValue(columns, 1);

    const blockProps = useBlockProps.save({
        className: 'nodelogic-preset-container',
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
    } = attributes;

    const safeRows = clampGridValue(rows, 4);
    const safeColumns = clampGridValue(columns, 1);

    return (
        <div className="nodelogic-preset-container">
            <div
                className="nodelogic-preset-container__grid"
                style={buildGridStyle(safeRows, safeColumns)}
            >
                <InnerBlocks.Content />
            </div>
        </div>
    );
}
