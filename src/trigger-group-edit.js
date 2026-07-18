import { useEffect } from '@wordpress/element';
import { useBlockProps, InspectorControls, PanelColorSettings } from '@wordpress/block-editor';
import { PanelBody, TextControl, Button, ToggleControl, SelectControl } from '@wordpress/components';
import { v4 as uuid } from 'uuid';

const shortId = () => uuid().replace(/-/g, '').slice(0, 6);

export default function TriggerGroupEdit({ attributes = {}, setAttributes, clientId }) {
    const {
        groupId,
        title = '',
        showTitle = false,
        items = [],
        buttonBackground = '#7c3aed',
        buttonHover = '#6d28d9',
        buttonText = '#ffffff',
        buttonGap = 8,
        buttonLayout = '',
        buttonJustify = 'center',
        buttonAlign = 'center',
        containerGap = 10,
        containerLayout = '',
        containerJustify = 'start',
        containerAlign = 'start',
        paddingTop = 0,
        paddingRight = 0,
        paddingBottom = 0,
        paddingLeft = 0,
        marginTop = 0,
        marginRight = 0,
        marginBottom = 0,
        marginLeft = 0,
        backgroundMode = 'default',
        backgroundColor = '',
        borderWidth = 0,
        borderStyle = 'solid',
        borderColor = '',
        borderRadius = 0,
        width = '',
        height = '',
        minHeight = '',
    } = attributes;

    // Generate unique groupId on first render
    useEffect(() => {
        if (!groupId) {
            setAttributes({ groupId: `trigger_grp_${clientId.slice(0, 8)}` });
        }
    }, [groupId, clientId, setAttributes]);

    // Ensure each item has a unique ID on first render
    useEffect(() => {
        const needsUpdate = items.some((item) => !item.id);
        if (needsUpdate) {
            setAttributes({
                items: items.map((item) =>
                    item.id ? item : { ...item, id: `trigger_${shortId()}` }
                ),
            });
        }
    }, []); // run only once on mount

    const updateItem = (index, field, val) => {
        const next = [...items];
        next[index] = { ...next[index], [field]: val };
        setAttributes({ items: next });
    };

    const addItem = () => {
        setAttributes({
            items: [...items, { id: `trigger_${shortId()}`, label: `Trigger ${items.length + 1}` }],
        });
    };

    const removeItem = (index) => {
        setAttributes({ items: items.filter((_, i) => i !== index) });
    };

    const btnStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: buttonBackground,
        color: buttonText,
        borderRadius: '999px',
        padding: '10px 16px',
        minHeight: '40px',
        border: '1px solid rgba(255,255,255,0.12)',
        cursor: 'pointer',
        flex: '1 1 120px',
        minWidth: '110px',
        textAlign: 'center',
        fontWeight: 600,
        fontSize: '14px',
    };
    const wrapperStyle = {
        boxSizing: 'border-box',
        width: width || '100%',
        height: height || undefined,
        minHeight: minHeight || undefined,
        paddingTop: paddingTop ? `${paddingTop}px` : undefined,
        paddingRight: paddingRight ? `${paddingRight}px` : undefined,
        paddingBottom: paddingBottom ? `${paddingBottom}px` : undefined,
        paddingLeft: paddingLeft ? `${paddingLeft}px` : undefined,
        marginTop: marginTop ? `${marginTop}px` : undefined,
        marginRight: marginRight ? `${marginRight}px` : undefined,
        marginBottom: marginBottom ? `${marginBottom}px` : undefined,
        marginLeft: marginLeft ? `${marginLeft}px` : undefined,
        backgroundColor: backgroundMode === 'custom' && backgroundColor ? backgroundColor : undefined,
        border: borderWidth ? `${borderWidth}px ${borderStyle} ${borderColor || 'rgba(148, 163, 184, 0.22)'}` : undefined,
        borderRadius: borderRadius ? `${borderRadius}px` : undefined,
    };

    return (
        <>
            <InspectorControls>
                <PanelBody title="Trigger Group Settings" initialOpen>
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Group ID"
                        value={groupId || ''}
                        onChange={(v) => setAttributes({ groupId: v })}
                        help="Used to identify this trigger group."
                    />
                    <ToggleControl
                        label="Show heading"
                        checked={showTitle}
                        onChange={(v) => setAttributes({ showTitle: v })}
                    />
                    {showTitle && (
                        <TextControl
                            __next40pxDefaultSize
                            __nextHasNoMarginBottom
                            label="Heading"
                            value={title}
                            onChange={(v) => setAttributes({ title: v })}
                        />
                    )}
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Button gap (px)"
                        type="number"
                        value={buttonGap}
                        onChange={(v) => setAttributes({ buttonGap: Number(v) || 0 })}
                    />
                    <SelectControl
                        label="Button justify"
                        value={buttonJustify}
                        options={[
                            { label: 'Center', value: 'center' },
                            { label: 'Start', value: 'flex-start' },
                            { label: 'End', value: 'flex-end' },
                            { label: 'Space Between', value: 'space-between' },
                        ]}
                        onChange={(v) => setAttributes({ buttonJustify: v })}
                    />
                    <TextControl label="Button layout (grid-template-columns)" value={buttonLayout} onChange={(v) => setAttributes({ buttonLayout: v })} />
                    <div style={{ height: 8 }} />
                    <div style={{ fontWeight: 600, marginTop: '6px', marginBottom: '6px' }}>Container</div>
                    <TextControl label="Container gap (px)" type="number" value={containerGap} onChange={(v) => setAttributes({ containerGap: Number(v) || 0 })} />
                    <TextControl label="Container layout (grid-template-columns)" value={containerLayout} onChange={(v) => setAttributes({ containerLayout: v })} />
                    <SelectControl label="Container justify" value={containerJustify} options={[{ label: 'Start', value: 'flex-start' }, { label: 'Center', value: 'center' }, { label: 'End', value: 'flex-end' }]} onChange={(v) => setAttributes({ containerJustify: v })} />
                    <div style={{ fontWeight: 600, marginTop: '10px', marginBottom: '6px' }}>Spacing</div>
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Padding top" type="number" value={paddingTop} onChange={(v) => setAttributes({ paddingTop: Number(v) || 0 })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Padding right" type="number" value={paddingRight} onChange={(v) => setAttributes({ paddingRight: Number(v) || 0 })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Padding bottom" type="number" value={paddingBottom} onChange={(v) => setAttributes({ paddingBottom: Number(v) || 0 })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Padding left" type="number" value={paddingLeft} onChange={(v) => setAttributes({ paddingLeft: Number(v) || 0 })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Margin top" type="number" value={marginTop} onChange={(v) => setAttributes({ marginTop: Number(v) || 0 })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Margin right" type="number" value={marginRight} onChange={(v) => setAttributes({ marginRight: Number(v) || 0 })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Margin bottom" type="number" value={marginBottom} onChange={(v) => setAttributes({ marginBottom: Number(v) || 0 })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Margin left" type="number" value={marginLeft} onChange={(v) => setAttributes({ marginLeft: Number(v) || 0 })} />
                    <SelectControl __next40pxDefaultSize label="Background mode" value={backgroundMode || 'default'} options={[{ label: 'Default', value: 'default' }, { label: 'Custom', value: 'custom' }, { label: 'None', value: 'none' }]} onChange={(v) => setAttributes({ backgroundMode: v })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Background color" value={backgroundColor} onChange={(v) => setAttributes({ backgroundColor: v })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Border width" type="number" value={borderWidth} onChange={(v) => setAttributes({ borderWidth: Number(v) || 0 })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Border radius" type="number" value={borderRadius} onChange={(v) => setAttributes({ borderRadius: Number(v) || 0 })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Width" value={width} onChange={(v) => setAttributes({ width: v })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Height" value={height} onChange={(v) => setAttributes({ height: v })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Minimum height" value={minHeight} onChange={(v) => setAttributes({ minHeight: v })} />
                    <PanelColorSettings
                        title="Button colors"
                        initialOpen={false}
                        colorSettings={[
                            { value: buttonBackground, onChange: (c) => setAttributes({ buttonBackground: c }), label: 'Background' },
                            { value: buttonHover, onChange: (c) => setAttributes({ buttonHover: c }), label: 'Hover' },
                            { value: buttonText, onChange: (c) => setAttributes({ buttonText: c }), label: 'Text' },
                        ]}
                    />
                </PanelBody>
                <PanelBody title="Trigger Items" initialOpen>
                    {items.map((item, index) => (
                        <div key={index} style={{ marginBottom: '12px', padding: '10px', border: '1px solid #ddd', borderRadius: '6px' }}>
                            <TextControl
                                __next40pxDefaultSize
                                __nextHasNoMarginBottom
                                label="ID"
                                value={item.id || ''}
                                onChange={(v) => updateItem(index, 'id', v)}
                                help="Unique ID — detectable by Event Element Node"
                            />
                            <TextControl
                                __next40pxDefaultSize
                                __nextHasNoMarginBottom
                                label="Label"
                                value={item.label || ''}
                                onChange={(v) => updateItem(index, 'label', v)}
                            />
                            <Button isDestructive onClick={() => removeItem(index)} style={{ marginTop: '4px' }}>
                                Remove
                            </Button>
                        </div>
                    ))}
                    <Button variant="primary" onClick={addItem}>Add Trigger</Button>
                </PanelBody>
            </InspectorControls>

            <div {...useBlockProps({ className: 'nodelogic-trigger-group', style: wrapperStyle })}>
                {showTitle && title && (
                    <h3 style={{ marginBottom: '10px', color: '#e2e8f0', fontSize: '15px', fontWeight: 700 }}>{title}</h3>
                )}
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: `${buttonGap}px`,
                        justifyContent: buttonJustify || 'center',
                        alignItems: buttonAlign || 'center',
                        padding: '12px',
                        borderRadius: '16px',
                        background: 'rgba(15, 23, 42, 0.82)',
                        border: '1px solid rgba(148, 163, 184, 0.18)',
                        gridTemplateColumns: buttonLayout || undefined,
                    }}
                >
                    {items.map((item, index) => (
                        <button
                            key={index}
                            id={item.id || undefined}
                            data-nodelogic-trigger-id={item.id || undefined}
                            style={btnStyle}
                            type="button"
                        >
                            {item.label || item.id || `Trigger ${index + 1}`}
                        </button>
                    ))}
                </div>
            </div>
        </>
    );
}
