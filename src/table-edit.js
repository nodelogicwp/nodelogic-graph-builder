import { useEffect } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, Button } from '@wordpress/components';

export default function Edit({ attributes = {}, setAttributes }) {
    const {
        title = 'Calculation table',
        rows = [],
        colMultiplier = 'Rate',
        colCount = 'Quantity',
        colPrice = 'Price',
    } = attributes;

    useEffect(() => {
        if (rows.length === 0) {
            const sliderIds = Array.from(document.querySelectorAll('.slider-container'))
                .map((el) => el.id || el.dataset.sliderId || el.querySelector('.slider')?.dataset?.sliderId || '')
                .filter(Boolean);
            const buttonGroupIds = Array.from(document.querySelectorAll('.btn_container'))
                .map((el) => el.id || '')
                .filter(Boolean);

            let defaultRows = [];
            if (sliderIds.length > 0) {
                defaultRows = sliderIds.map((id, index) => ({
                    sliderId: id,
                    label: id,
                    buttonGroupIds: buttonGroupIds.slice(0, 2).join(','),
                    unit: '',
                    order: index,
                }));
            } else {
                defaultRows = [{ sliderId: 'count', label: 'count', buttonGroupIds: '', order: 0 }];
            }
            setAttributes({ rows: defaultRows });
        }
    }, [rows, setAttributes]);

    const updateRow = (index, field, value) => {
        const next = [...rows];
        next[index] = { ...next[index], [field]: value };
        setAttributes({ rows: next });
    };

    const addRow = () => {
        setAttributes({ rows: [...rows, { sliderId: '', label: '', buttonGroupIds: '', order: rows.length }] });
    };

    const deleteRow = (index) => {
        const next = rows.filter((_, i) => i !== index);
        setAttributes({ rows: next });
    };

    const moveRow = (index, direction) => {
        const next = [...rows];
        const [moved] = next.splice(index, 1);
        next.splice(index + direction, 0, moved);
        setAttributes({ rows: next });
    };

    return (
        <>
            <InspectorControls>
                <PanelBody title="Table Settings" initialOpen>
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Title" value={title} onChange={(value) => setAttributes({ title: value })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Rate Column Name" value={colMultiplier} onChange={(value) => setAttributes({ colMultiplier: value })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Quantity Column Name" value={colCount} onChange={(value) => setAttributes({ colCount: value })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Price Column Name" value={colPrice} onChange={(value) => setAttributes({ colPrice: value })} />
                    <div style={{ marginTop: '10px', fontWeight: 600 }}>Rows</div>
                    {rows.map((row, index) => (
                        <div key={index} style={{ margin: '8px 0', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Slider ID" value={row.sliderId} onChange={(value) => updateRow(index, 'sliderId', value)} />
                            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Label" value={row.label} onChange={(value) => updateRow(index, 'label', value)} />
                            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Quantity Unit (e.g. kg, m3, pcs)" value={row.unit || ''} onChange={(value) => updateRow(index, 'unit', value)} />
                            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Button Group IDs (comma-separated)" value={row.buttonGroupIds || ''} onChange={(value) => updateRow(index, 'buttonGroupIds', value)} />
                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                <Button onClick={() => moveRow(index, -1)} disabled={index === 0}>Up</Button>
                                <Button onClick={() => moveRow(index, 1)} disabled={index === rows.length - 1}>Down</Button>
                                <Button isDestructive onClick={() => deleteRow(index)}>Delete</Button>
                            </div>
                        </div>
                    ))}
                    <Button variant="primary" onClick={addRow}>Add Row</Button>
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'slider-table-block' })} style={{ padding: '12px', border: '1px dashed #ccc', borderRadius: '8px', background: '#fafafa' }}>
                <strong>{title}</strong>
                <div style={{ marginTop: '0.35rem', color: '#555' }}>{rows.length} rows</div>
            </div>
        </>
    );
}
