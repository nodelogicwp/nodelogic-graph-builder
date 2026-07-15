import { useEffect } from '@wordpress/element';
import { useBlockProps, InspectorControls, PanelColorSettings } from '@wordpress/block-editor';
import { PanelBody, TextControl, Button, ToggleControl } from '@wordpress/components';
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
        buttonSpacing = 8,
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
                        label="Button spacing (px)"
                        type="number"
                        value={buttonSpacing}
                        onChange={(v) => setAttributes({ buttonSpacing: Number(v) || 0 })}
                    />
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

            <div {...useBlockProps({ className: 'nodelogic-trigger-group' })}>
                {showTitle && title && (
                    <h3 style={{ marginBottom: '10px', color: '#e2e8f0', fontSize: '15px', fontWeight: 700 }}>{title}</h3>
                )}
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: `${buttonSpacing}px`,
                        justifyContent: 'center',
                        padding: '12px',
                        borderRadius: '16px',
                        background: 'rgba(15, 23, 42, 0.82)',
                        border: '1px solid rgba(148, 163, 184, 0.18)',
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
