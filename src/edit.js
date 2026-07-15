import { useState, useEffect, useCallback } from '@wordpress/element';
import { useBlockProps, InspectorControls, PanelColorSettings } from '@wordpress/block-editor';
import { PanelBody, TextControl, SelectControl, Button } from '@wordpress/components';
import { v4 as uuid } from 'uuid';

// Short unique suffix — 6 chars, alphanumeric lowercase
const shortId = () => uuid().replace(/-/g, '').slice(0, 6);

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
        sliderId,
        min = 1, max = 10, value = 5,
        trackBackgroundColor = '#ffffff',
        trackProgressColor = '#2563eb',
        thumbValueColor = '#111827',
        thumbBackgroundColor = '#2563eb',
    } = attributes;

    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `slider_${shortId()}` }); }, [sliderId, setAttributes]);

    const setNum = (k, v) => { const n = Number(v); setAttributes({ [k]: Number.isFinite(n) ? n : 0 }); };
    const safeMin = Number.isFinite(min) ? min : 1;
    const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 1;
    const numVal = Number.isFinite(Number(value)) ? Number(value) : safeMin;
    const pct = Math.round(((numVal - safeMin) / (safeMax - safeMin || 1)) * 100);
    const id = sliderId || '';

    return (
        <>
            <InspectorControls>
                <PanelBody title="Slider Settings" initialOpen>
                    <IdField sliderId={id} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Min" type="number" value={safeMin} onChange={(v) => setNum('min', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Max" type="number" value={safeMax} onChange={(v) => setNum('max', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Value" type="number" value={numVal} onChange={(v) => setNum('value', v)} />
                    <PanelColorSettings title="Colors" initialOpen={false} colorSettings={[
                        { value: trackBackgroundColor, onChange: (c) => setAttributes({ trackBackgroundColor: c }), label: 'Track background' },
                        { value: trackProgressColor, onChange: (c) => setAttributes({ trackProgressColor: c, thumbBackgroundColor: c }), label: 'Track color' },
                        { value: thumbValueColor, onChange: (c) => setAttributes({ thumbValueColor: c }), label: 'Value color' },
                    ]} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'slider-container slider-container--seekbar' })}>
                <div className="slider-track" style={{ background: trackBackgroundColor }}>
                    <div className="slider-progress" style={{ width: `${pct}%`, background: trackProgressColor }} />
                </div>
                <input type="range" id={id || undefined} data-slider-id={id || undefined}
                    min={safeMin} max={safeMax} value={numVal} className="slider" step={1} />
                <div className="slider-thumb-value" style={{ color: thumbValueColor, background: thumbBackgroundColor, left: `calc(22px + (${pct / 100}) * (100% - 44px))`, top: '24px' }}>{numVal}</div>
            </div>
        </>
    );
}

// ─── NUMBER INPUT ─────────────────────────────────────────────────────────────
export function NumberInputEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId, min = 0, max = 100, value = 0 } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `number_${shortId()}` }); }, [sliderId, setAttributes]);
    const setNum = (k, v) => { const n = Number(v); setAttributes({ [k]: Number.isFinite(n) ? n : 0 }); };
    const safeMin = Number.isFinite(min) ? min : 0;
    const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 100;
    const numVal = Number.isFinite(Number(value)) ? Number(value) : safeMin;
    const id = sliderId || '';

    return (
        <>
            <InspectorControls>
                <PanelBody title="Number Input Settings" initialOpen>
                    <IdField sliderId={id} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Min" type="number" value={safeMin} onChange={(v) => setNum('min', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Max" type="number" value={safeMax} onChange={(v) => setNum('max', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Value" type="number" value={numVal} onChange={(v) => setNum('value', v)} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'slider-container slider-container--field' })}>
                <input id={id || undefined} type="number" min={safeMin} max={safeMax} value={numVal} className="slider-number" step={1} readOnly />
            </div>
        </>
    );
}

// ─── TEXT INPUT ───────────────────────────────────────────────────────────────
export function TextInputEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId, value = '' } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `text_${shortId()}` }); }, [sliderId, setAttributes]);
    const id = sliderId || '';

    return (
        <>
            <InspectorControls>
                <PanelBody title="Text Input Settings" initialOpen>
                    <IdField sliderId={id} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Default Value" value={String(value)} onChange={(v) => setAttributes({ value: v })} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'slider-container slider-container--field' })}>
                <input id={id || undefined} type="text" value={String(value)} className="slider-string" readOnly />
            </div>
        </>
    );
}

// ─── SEEKBAR ──────────────────────────────────────────────────────────────────
export function SeekbarEdit({ attributes = {}, setAttributes }) {
    const {
        editorId, sliderId,
        min = 1, max = 10, value = 5,
        trackBackgroundColor = '#ffffff',
        trackProgressColor = '#2563eb',
        thumbValueColor = '#111827',
        thumbBackgroundColor = '#2563eb',
    } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `seekbar_${shortId()}` }); }, [sliderId, setAttributes]);
    const setNum = (k, v) => { const n = Number(v); setAttributes({ [k]: Number.isFinite(n) ? n : 0 }); };
    const safeMin = Number.isFinite(min) ? min : 1;
    const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 1;
    const numVal = Number.isFinite(Number(value)) ? Number(value) : safeMin;
    const pct = Math.round(((numVal - safeMin) / (safeMax - safeMin || 1)) * 100);
    const id = sliderId || '';

    return (
        <>
            <InspectorControls>
                <PanelBody title="Seekbar Settings" initialOpen>
                    <IdField sliderId={id} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Min" type="number" value={safeMin} onChange={(v) => setNum('min', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Max" type="number" value={safeMax} onChange={(v) => setNum('max', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Value" type="number" value={numVal} onChange={(v) => setNum('value', v)} />
                    <PanelColorSettings title="Colors" initialOpen={false} colorSettings={[
                        { value: trackBackgroundColor, onChange: (c) => setAttributes({ trackBackgroundColor: c }), label: 'Track background' },
                        { value: trackProgressColor, onChange: (c) => setAttributes({ trackProgressColor: c, thumbBackgroundColor: c }), label: 'Track color' },
                        { value: thumbValueColor, onChange: (c) => setAttributes({ thumbValueColor: c }), label: 'Value color' },
                    ]} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'slider-container slider-container--seekbar' })}>
                <div className="slider-track" style={{ background: trackBackgroundColor }}>
                    <div className="slider-progress" style={{ width: `${pct}%`, background: trackProgressColor }} />
                </div>
                <input type="range" id={id || undefined} data-slider-id={id || undefined}
                    min={safeMin} max={safeMax} value={numVal} className="slider" step={1} />
                <div className="slider-thumb-value" style={{ color: thumbValueColor, background: thumbBackgroundColor, left: `calc(22px + (${pct / 100}) * (100% - 44px))`, top: '24px' }}>{numVal}</div>
            </div>
        </>
    );
}

// ─── RADIO GROUP ──────────────────────────────────────────────────────────────
export function RadioEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId, value = '', options = [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }] } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `radio_${shortId()}` }); }, [sliderId, setAttributes]);
    const updateOption = (i, k, v) => { const next = [...options]; next[i] = { ...next[i], [k]: v }; setAttributes({ options: next }); };
    const addOption = () => setAttributes({ options: [...options, { label: 'New', value: 'new' + Date.now() }] });
    const removeOption = (i) => setAttributes({ options: options.filter((_, idx) => idx !== i) });
    const id = sliderId || '';

    return (
        <>
            <InspectorControls>
                <PanelBody title="Radio Group Settings" initialOpen>
                    <IdField sliderId={id} setAttributes={setAttributes} />
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
            <div {...useBlockProps({ className: 'nodelogic-radio-group' })}>
                {options.map((opt, i) => (
                    <label key={i} className="nodelogic-choice-option">
                        <input type="radio" name={id} value={opt.value} readOnly /> {opt.label}
                    </label>
                ))}
            </div>
        </>
    );
}

// ─── SELECT (dropdown) ────────────────────────────────────────────────────────
export function SelectInputEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId, value = '', options = [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }] } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `select_${shortId()}` }); }, [sliderId, setAttributes]);
    const updateOption = (i, k, v) => { const next = [...options]; next[i] = { ...next[i], [k]: v }; setAttributes({ options: next }); };
    const addOption = () => setAttributes({ options: [...options, { label: 'New', value: 'new' + Date.now() }] });
    const removeOption = (i) => setAttributes({ options: options.filter((_, idx) => idx !== i) });
    const id = sliderId || '';

    return (
        <>
            <InspectorControls>
                <PanelBody title="Select Settings" initialOpen>
                    <IdField sliderId={id} setAttributes={setAttributes} />
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
            <div {...useBlockProps({ className: 'nodelogic-select-group' })}>
                <select id={id || undefined} value={value} readOnly>
                    {options.map((opt, i) => <option key={i} value={opt.value}>{opt.label}</option>)}
                </select>
            </div>
        </>
    );
}

// ─── CHECKBOX ─────────────────────────────────────────────────────────────────
export function CheckboxEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId, checkboxOnValue = '1', checkboxOffValue = '0', value = '0' } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `checkbox_${shortId()}` }); }, [sliderId, setAttributes]);
    const id = sliderId || '';

    return (
        <>
            <InspectorControls>
                <PanelBody title="Checkbox Settings" initialOpen>
                    <IdField sliderId={id} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Checked Value" value={checkboxOnValue} onChange={(v) => setAttributes({ checkboxOnValue: v })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Unchecked Value" value={checkboxOffValue} onChange={(v) => setAttributes({ checkboxOffValue: v })} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'nodelogic-checkbox-group' })}>
                <label className="nodelogic-choice-option">
                    <input type="checkbox" id={id || undefined}
                        checked={String(value) === String(checkboxOnValue)}
                        data-checked-value={checkboxOnValue}
                        data-unchecked-value={checkboxOffValue}
                        readOnly
                    /> {id}
                </label>
            </div>
        </>
    );
}

// ─── LABEL (static text output) ───────────────────────────────────────────────
export function LabelEdit({ attributes = {}, setAttributes }) {
    const { editorId, sliderId, nodelogicLabel = '' } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `label_${shortId()}` }); }, [sliderId, setAttributes]);
    const id = sliderId || '';

    return (
        <>
            <InspectorControls>
                <PanelBody title="Label Settings" initialOpen>
                    <IdField sliderId={id} setAttributes={setAttributes} />
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
            <div {...useBlockProps({ className: 'nodelogic-label-block' })}>
                <span id={id || undefined} data-nodelogic-id={id || undefined} className="nodelogic-label">
                    {nodelogicLabel || id}
                </span>
            </div>
        </>
    );
}

// ─── DEFAULT EXPORT (backward compat — legacy "Element" block) ────────────────
export default SliderEdit;
