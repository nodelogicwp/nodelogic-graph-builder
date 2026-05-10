import { useState, useEffect, useCallback } from '@wordpress/element';
import { useBlockProps, InspectorControls, PanelColorSettings } from '@wordpress/block-editor';
import { PanelBody, TextControl, SelectControl, Button } from '@wordpress/components';
import { v4 as uuid } from 'uuid';

// Shared ID field used by all element types
function IdField({ sliderId, setAttributes }) {
    return (
        <TextControl
            __next40pxDefaultSize
            __nextHasNoMarginBottom
            label="ID"
            value={sliderId}
            onChange={(v) => setAttributes({ sliderId: v })}
            help="Unique identifier used by Logic Block to reference this element."
        />
    );
}

// ─── SLIDER (range) ──────────────────────────────────────────────────────────
export function SliderEdit({ attributes = {}, setAttributes }) {
    const {
        editorId,
        sliderId = 'slider_1',
        min = 1, max = 10, value = 5,
        trackProgressColor = '#2563eb',
        thumbValueColor = '#111827',
        thumbBackgroundColor = '#2563eb',
    } = attributes;

    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);

    const setNum = (k, v) => { const n = Number(v); setAttributes({ [k]: Number.isFinite(n) ? n : 0 }); };
    const safeMin = Number.isFinite(min) ? min : 1;
    const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 1;
    const numVal = Number.isFinite(Number(value)) ? Number(value) : safeMin;
    const pct = Math.round(((numVal - safeMin) / (safeMax - safeMin || 1)) * 100);

    return (
        <>
            <InspectorControls>
                <PanelBody title="Slider Settings" initialOpen>
                    <IdField sliderId={sliderId} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Min" type="number" value={safeMin} onChange={(v) => setNum('min', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Max" type="number" value={safeMax} onChange={(v) => setNum('max', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Value" type="number" value={numVal} onChange={(v) => setNum('value', v)} />
                    <PanelColorSettings title="Colors" initialOpen={false} colorSettings={[
                        { value: trackProgressColor, onChange: (c) => setAttributes({ trackProgressColor: c, thumbBackgroundColor: c }), label: 'Track color' },
                        { value: thumbValueColor, onChange: (c) => setAttributes({ thumbValueColor: c }), label: 'Value color' },
                    ]} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'slider-container' })}>
                <div className="slider-track" style={{ background: '#f1f5f9' }}>
                    <div className="slider-progress" style={{ width: `${pct}%`, background: trackProgressColor }} />
                </div>
                <input type="range" id={sliderId || undefined} data-slider-id={sliderId || undefined}
                    min={safeMin} max={safeMax} value={numVal} className="slider" step={1} />
                <div className="slider-thumb-value" style={{ color: thumbValueColor, background: thumbBackgroundColor }}>{numVal}</div>
            </div>
        </>
    );
}

// ─── NUMBER INPUT ─────────────────────────────────────────────────────────────
export function NumberInputEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId = 'number_1', min = 0, max = 100, value = 0 } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    const setNum = (k, v) => { const n = Number(v); setAttributes({ [k]: Number.isFinite(n) ? n : 0 }); };
    const safeMin = Number.isFinite(min) ? min : 0;
    const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 100;
    const numVal = Number.isFinite(Number(value)) ? Number(value) : safeMin;

    return (
        <>
            <InspectorControls>
                <PanelBody title="Number Input Settings" initialOpen>
                    <IdField sliderId={sliderId} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Min" type="number" value={safeMin} onChange={(v) => setNum('min', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Max" type="number" value={safeMax} onChange={(v) => setNum('max', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Value" type="number" value={numVal} onChange={(v) => setNum('value', v)} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'slider-container' })}>
                <input id={sliderId || undefined} type="number" min={safeMin} max={safeMax} value={numVal} className="slider-number" step={1} readOnly />
            </div>
        </>
    );
}

// ─── TEXT INPUT ───────────────────────────────────────────────────────────────
export function TextInputEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId = 'text_1', value = '' } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);

    return (
        <>
            <InspectorControls>
                <PanelBody title="Text Input Settings" initialOpen>
                    <IdField sliderId={sliderId} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Default Value" value={String(value)} onChange={(v) => setAttributes({ value: v })} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'slider-container' })}>
                <input id={sliderId || undefined} type="text" value={String(value)} className="slider-string" readOnly />
            </div>
        </>
    );
}

// ─── SEEKBAR ──────────────────────────────────────────────────────────────────
export function SeekbarEdit({ attributes = {}, setAttributes }) {
    const {
        editorId, sliderId = 'seekbar_1',
        min = 1, max = 10, value = 5,
        trackProgressColor = '#2563eb',
        thumbValueColor = '#111827',
        thumbBackgroundColor = '#2563eb',
    } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    const setNum = (k, v) => { const n = Number(v); setAttributes({ [k]: Number.isFinite(n) ? n : 0 }); };
    const safeMin = Number.isFinite(min) ? min : 1;
    const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 1;
    const numVal = Number.isFinite(Number(value)) ? Number(value) : safeMin;
    const pct = Math.round(((numVal - safeMin) / (safeMax - safeMin || 1)) * 100);

    return (
        <>
            <InspectorControls>
                <PanelBody title="Seekbar Settings" initialOpen>
                    <IdField sliderId={sliderId} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Min" type="number" value={safeMin} onChange={(v) => setNum('min', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Max" type="number" value={safeMax} onChange={(v) => setNum('max', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Value" type="number" value={numVal} onChange={(v) => setNum('value', v)} />
                    <PanelColorSettings title="Colors" initialOpen={false} colorSettings={[
                        { value: trackProgressColor, onChange: (c) => setAttributes({ trackProgressColor: c, thumbBackgroundColor: c }), label: 'Track color' },
                        { value: thumbValueColor, onChange: (c) => setAttributes({ thumbValueColor: c }), label: 'Value color' },
                    ]} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'slider-container' })}>
                <div className="slider-track" style={{ background: '#f1f5f9' }}>
                    <div className="slider-progress" style={{ width: `${pct}%`, background: trackProgressColor }} />
                </div>
                <input type="range" id={sliderId || undefined} data-slider-id={sliderId || undefined}
                    min={safeMin} max={safeMax} value={numVal} className="slider" step={1} />
                <div className="slider-thumb-value" style={{ color: thumbValueColor, background: thumbBackgroundColor }}>{numVal}</div>
            </div>
        </>
    );
}

// ─── RADIO GROUP ──────────────────────────────────────────────────────────────
export function RadioEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId = 'radio_1', value = '', options = [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }] } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    const updateOption = (i, k, v) => { const next = [...options]; next[i] = { ...next[i], [k]: v }; setAttributes({ options: next }); };
    const addOption = () => setAttributes({ options: [...options, { label: 'New', value: 'new' + Date.now() }] });
    const removeOption = (i) => setAttributes({ options: options.filter((_, idx) => idx !== i) });

    return (
        <>
            <InspectorControls>
                <PanelBody title="Radio Group Settings" initialOpen>
                    <IdField sliderId={sliderId} setAttributes={setAttributes} />
                    <div style={{ marginBottom: '8px', fontWeight: 600 }}>Options</div>
                    {options.map((opt, i) => (
                        <div key={i} style={{ marginBottom: '8px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Label" value={opt.label} onChange={(v) => updateOption(i, 'label', v)} />
                            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Value" value={opt.value} onChange={(v) => updateOption(i, 'value', v)} />
                            <Button isDestructive onClick={() => removeOption(i)}>Delete</Button>
                        </div>
                    ))}
                    <Button variant="primary" onClick={addOption}>Add Option</Button>
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps()}>
                {options.map((opt, i) => (
                    <label key={i} style={{ marginRight: '8px' }}>
                        <input type="radio" name={sliderId} value={opt.value} readOnly /> {opt.label}
                    </label>
                ))}
            </div>
        </>
    );
}

// ─── SELECT (dropdown) ────────────────────────────────────────────────────────
export function SelectInputEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId = 'select_1', value = '', options = [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }] } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    const updateOption = (i, k, v) => { const next = [...options]; next[i] = { ...next[i], [k]: v }; setAttributes({ options: next }); };
    const addOption = () => setAttributes({ options: [...options, { label: 'New', value: 'new' + Date.now() }] });
    const removeOption = (i) => setAttributes({ options: options.filter((_, idx) => idx !== i) });

    return (
        <>
            <InspectorControls>
                <PanelBody title="Select Settings" initialOpen>
                    <IdField sliderId={sliderId} setAttributes={setAttributes} />
                    <div style={{ marginBottom: '8px', fontWeight: 600 }}>Options</div>
                    {options.map((opt, i) => (
                        <div key={i} style={{ marginBottom: '8px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}>
                            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Label" value={opt.label} onChange={(v) => updateOption(i, 'label', v)} />
                            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Value" value={opt.value} onChange={(v) => updateOption(i, 'value', v)} />
                            <Button isDestructive onClick={() => removeOption(i)}>Delete</Button>
                        </div>
                    ))}
                    <Button variant="primary" onClick={addOption}>Add Option</Button>
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps()}>
                <select id={sliderId || undefined} value={value} readOnly>
                    {options.map((opt, i) => <option key={i} value={opt.value}>{opt.label}</option>)}
                </select>
            </div>
        </>
    );
}

// ─── CHECKBOX ─────────────────────────────────────────────────────────────────
export function CheckboxEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId = 'checkbox_1', checkboxOnValue = '1', checkboxOffValue = '0', value = '0' } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);

    return (
        <>
            <InspectorControls>
                <PanelBody title="Checkbox Settings" initialOpen>
                    <IdField sliderId={sliderId} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Checked Value" value={checkboxOnValue} onChange={(v) => setAttributes({ checkboxOnValue: v })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Unchecked Value" value={checkboxOffValue} onChange={(v) => setAttributes({ checkboxOffValue: v })} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps()}>
                <label>
                    <input type="checkbox" id={sliderId || undefined}
                        checked={String(value) === String(checkboxOnValue)}
                        data-checked-value={checkboxOnValue}
                        data-unchecked-value={checkboxOffValue}
                        readOnly
                    /> {sliderId}
                </label>
            </div>
        </>
    );
}

// ─── LABEL (static text output) ───────────────────────────────────────────────
export function LabelEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId = 'label_1', nodelogicLabel = '' } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);

    return (
        <>
            <InspectorControls>
                <PanelBody title="Label Settings" initialOpen>
                    <IdField sliderId={sliderId} setAttributes={setAttributes} />
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Label Text"
                        value={nodelogicLabel}
                        onChange={(v) => setAttributes({ nodelogicLabel: v })}
                        help="This label will be detectable by the NodeLogic Graph Builder editor."
                    />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps()}>
                <span id={sliderId || undefined} data-nodelogic-id={sliderId || undefined} className="nodelogic-label">
                    {nodelogicLabel || sliderId}
                </span>
            </div>
        </>
    );
}

// ─── DEFAULT EXPORT (backward compat — legacy "Element" block) ────────────────
export default SliderEdit;

