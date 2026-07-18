import { useEffect } from '@wordpress/element';
import { useBlockProps, InspectorControls, PanelColorSettings } from '@wordpress/block-editor';
import { PanelBody, TextControl, Button, SelectControl } from '@wordpress/components';

export default function Edit({ attributes = {}, setAttributes, clientId }) {
    const {
        title = 'Choose option',
        showTitle = true,
        buttons = [],
        groupId = '',
        buttonBackground = '#1d4ed8',
        buttonHover = '#2563eb',
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

    useEffect(() => {
        if (!groupId) {
            setAttributes({ groupId: `btn_group_${clientId.slice(0, 8)}` });
        }
    }, [groupId, clientId, setAttributes]);

    const updateButton = (index, field, val) => {
        const newButtons = [...buttons];
        newButtons[index] = { ...newButtons[index], [field]: val };
        setAttributes({ buttons: newButtons });
    };

    const addButton = () => {
        setAttributes({
            buttons: [...buttons, { id: '', label: 'New button', value: '' }],
        });
    };

    const removeButton = (index) => {
        setAttributes({ buttons: buttons.filter((_, i) => i !== index) });
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
                <PanelBody title="Group Settings">
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Group ID" value={groupId} onChange={(v) => setAttributes({ groupId: v })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Heading" value={title} onChange={(v) => setAttributes({ title: v })} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0 0', color: '#cbd5e1' }}>
                        <input
                            type="checkbox"
                            checked={Boolean(showTitle)}
                            onChange={(e) => setAttributes({ showTitle: Boolean(e.target.checked) })}
                        />
                        <span>Show heading</span>
                    </label>
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Button gap (px)" type="number" value={buttonGap} onChange={(v) => setAttributes({ buttonGap: Number(v) || 0 })} />
                    <SelectControl __next40pxDefaultSize label="Button justify" value={buttonJustify} options={[{ label: 'Center', value: 'center' }, { label: 'Start', value: 'flex-start' }, { label: 'End', value: 'flex-end' }, { label: 'Space Between', value: 'space-between' }]} onChange={(v) => setAttributes({ buttonJustify: v })} />
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
                            { value: buttonBackground, onChange: (color) => setAttributes({ buttonBackground: color }), label: 'Background' },
                            { value: buttonHover, onChange: (color) => setAttributes({ buttonHover: color }), label: 'Hover' },
                            { value: buttonText, onChange: (color) => setAttributes({ buttonText: color }), label: 'Text' },
                        ]}
                    />
                    <div style={{ marginTop: '10px', fontWeight: 600 }}>Buttons</div>
                    {buttons.map((btn, index) => (
                        <div key={index} style={{ marginBottom: '10px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}>
                            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="ID (optional)" value={btn.id || ''} onChange={(v) => updateButton(index, 'id', v)} />
                            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Label" value={btn.label || ''} onChange={(v) => updateButton(index, 'label', v)} />
                            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Value" value={String(btn.value ?? btn.multiplier ?? '')} onChange={(v) => updateButton(index, 'value', v)} help="String value passed to Logic Block when this button is selected." />
                            <Button isDestructive onClick={() => removeButton(index)}>Delete</Button>
                        </div>
                    ))}
                    <Button variant="primary" onClick={addButton}>Add Button</Button>
                </PanelBody>
            </InspectorControls>

            <div {...useBlockProps({ className: 'nodelogic-button-group', style: wrapperStyle })}>
                {showTitle ? <h3 style={{ marginBottom: '12px', color: '#e2e8f0', fontSize: '15px', fontWeight: 700, letterSpacing: '0.01em' }}>{title}</h3> : null}
                <div
                    id={groupId}
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
                    className="wp-block-kadence-advancedbtn kb-buttons-wrap btn_container"
                >
                    {buttons.map((btn, index) => (
                        <span
                            key={index}
                            className="kb-button kt-button button btn_toggle"
                            data-value={String(btn.value ?? btn.multiplier ?? '')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: buttonBackground,
                                color: buttonText,
                                borderRadius: '999px',
                                padding: '10px 16px',
                                minHeight: '40px',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                boxShadow: '0 8px 18px rgba(2, 6, 23, 0.12)',
                                cursor: 'pointer',
                                flex: '1 1 120px',
                                minWidth: '110px',
                                textAlign: 'center',
                                transition: 'background .15s ease',
                                fontWeight: 600,
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = buttonHover; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = buttonBackground; }}
                        >
                            <span className="kt-btn-inner-text">{btn.label}</span>
                        </span>
                    ))}
                </div>
            </div>
        </>
    );
}
