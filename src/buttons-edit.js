import { useEffect } from '@wordpress/element';
import { useBlockProps, InspectorControls, PanelColorSettings } from '@wordpress/block-editor';
import { PanelBody, TextControl, Button } from '@wordpress/components';

export default function Edit({ attributes = {}, setAttributes, clientId }) {
    const {
        title = 'Choose option',
        buttons = [],
        groupId = '',
        buttonBackground = '#1d4ed8',
        buttonHover = '#2563eb',
        buttonText = '#ffffff',
        buttonSpacing = 8,
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

    return (
        <>
            <InspectorControls>
                <PanelBody title="Group Settings">
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Group ID" value={groupId} onChange={(v) => setAttributes({ groupId: v })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Heading" value={title} onChange={(v) => setAttributes({ title: v })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Button spacing (px)" type="number" value={buttonSpacing} onChange={(v) => setAttributes({ buttonSpacing: Number(v) || 0 })} />
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

            <div {...useBlockProps()}>
                <h3 style={{ marginBottom: '8px' }}>{title}</h3>
                <div id={groupId} style={{ display: 'flex', flexWrap: 'wrap', gap: `${buttonSpacing}px`, justifyContent: 'center' }} className="wp-block-kadence-advancedbtn kb-buttons-wrap btn_container">
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
                                borderRadius: '6px',
                                padding: '12px 18px',
                                minHeight: '46px',
                                cursor: 'pointer',
                                flex: '1 1 120px',
                                minWidth: '110px',
                                textAlign: 'center',
                                transition: 'background .15s ease',
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
