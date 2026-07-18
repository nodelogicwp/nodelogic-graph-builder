import { useState, useEffect, useCallback } from '@wordpress/element';
import { useBlockProps, InspectorControls, PanelColorSettings } from '@wordpress/block-editor';
import { PanelBody, TextControl, SelectControl, Button } from '@wordpress/components';
import { v4 as uuid } from 'uuid';

// Short unique suffix — 6 chars, alphanumeric lowercase
const shortId = () => uuid().replace(/-/g, '').slice(0, 6);

function getNumericValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function buildBoxStyle({
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
}) {
    const style = { boxSizing: 'border-box' };
    const topPadding = getNumericValue(paddingTop);
    const rightPadding = getNumericValue(paddingRight);
    const bottomPadding = getNumericValue(paddingBottom);
    const leftPadding = getNumericValue(paddingLeft);
    const topMargin = getNumericValue(marginTop);
    const rightMargin = getNumericValue(marginRight);
    const bottomMargin = getNumericValue(marginBottom);
    const leftMargin = getNumericValue(marginLeft);

    if (topPadding > 0) style.paddingTop = `${topPadding}px`;
    if (rightPadding > 0) style.paddingRight = `${rightPadding}px`;
    if (bottomPadding > 0) style.paddingBottom = `${bottomPadding}px`;
    if (leftPadding > 0) style.paddingLeft = `${leftPadding}px`;
    if (topMargin > 0) style.marginTop = `${topMargin}px`;
    if (rightMargin > 0) style.marginRight = `${rightMargin}px`;
    if (bottomMargin > 0) style.marginBottom = `${bottomMargin}px`;
    if (leftMargin > 0) style.marginLeft = `${leftMargin}px`;

    if (backgroundMode === 'custom' && backgroundColor) {
        style.backgroundColor = backgroundColor;
    } else if (backgroundMode === 'default') {
        style.background = 'linear-gradient(135deg, rgba(14, 116, 144, 0.16), rgba(37, 99, 235, 0.12))';
        style.border = '1px solid rgba(148, 163, 184, 0.22)';
        style.borderRadius = '12px';
    }

    if (getNumericValue(borderWidth) > 0) {
        style.borderWidth = `${getNumericValue(borderWidth)}px`;
        style.borderStyle = borderStyle || 'solid';
        if (borderColor) {
            style.borderColor = borderColor;
        }
    }
    if (getNumericValue(borderRadius) > 0) {
        style.borderRadius = `${getNumericValue(borderRadius)}px`;
    }
    if (width) style.width = width;
    if (height) style.height = height;
    if (minHeight) style.minHeight = minHeight;

    return style;
}

function BoxStyleControls({ attributes = {}, setAttributes }) {
    const {
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
    } = attributes;

    return (
        <>
            <div style={{ fontWeight: 600, marginTop: '10px', marginBottom: '6px' }}>Padding</div>
            <div style={{ display: 'grid', gap: '8px' }}>
                <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Top" type="number" value={String(paddingTop ?? 0)} onChange={(value) => setAttributes({ paddingTop: Number(value) || 0 })} />
                <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Right" type="number" value={String(paddingRight ?? 0)} onChange={(value) => setAttributes({ paddingRight: Number(value) || 0 })} />
                <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Bottom" type="number" value={String(paddingBottom ?? 0)} onChange={(value) => setAttributes({ paddingBottom: Number(value) || 0 })} />
                <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Left" type="number" value={String(paddingLeft ?? 0)} onChange={(value) => setAttributes({ paddingLeft: Number(value) || 0 })} />
            </div>
            <div style={{ fontWeight: 600, marginTop: '10px', marginBottom: '6px' }}>Margin</div>
            <div style={{ display: 'grid', gap: '8px' }}>
                <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Top" type="number" value={String(marginTop ?? 0)} onChange={(value) => setAttributes({ marginTop: Number(value) || 0 })} />
                <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Right" type="number" value={String(marginRight ?? 0)} onChange={(value) => setAttributes({ marginRight: Number(value) || 0 })} />
                <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Bottom" type="number" value={String(marginBottom ?? 0)} onChange={(value) => setAttributes({ marginBottom: Number(value) || 0 })} />
                <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Left" type="number" value={String(marginLeft ?? 0)} onChange={(value) => setAttributes({ marginLeft: Number(value) || 0 })} />
            </div>
            <SelectControl
                __next40pxDefaultSize
                label="Background mode"
                value={backgroundMode || 'default'}
                options={[{ label: 'Default background', value: 'default' }, { label: 'No background', value: 'none' }, { label: 'Use custom background', value: 'custom' }]}
                onChange={(value) => setAttributes({ backgroundMode: value })}
            />
            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Background color" value={String(backgroundColor || '')} onChange={(value) => setAttributes({ backgroundColor: value })} />
            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Border width (px)" type="number" value={String(borderWidth || 0)} onChange={(value) => setAttributes({ borderWidth: Number(value) || 0 })} />
            <SelectControl __next40pxDefaultSize label="Border style" value={borderStyle || 'solid'} options={[{ label: 'Solid', value: 'solid' }, { label: 'Dotted', value: 'dotted' }, { label: 'Dashed', value: 'dashed' }, { label: 'Double', value: 'double' }]} onChange={(value) => setAttributes({ borderStyle: value })} />
            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Border color" value={String(borderColor || '')} onChange={(value) => setAttributes({ borderColor: value })} />
            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Border radius (px)" type="number" value={String(borderRadius || 0)} onChange={(value) => setAttributes({ borderRadius: Number(value) || 0 })} />
            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Width" value={String(width || '')} onChange={(value) => setAttributes({ width: value })} />
            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Height" value={String(height || '')} onChange={(value) => setAttributes({ height: value })} />
            <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Minimum height" value={String(minHeight || '')} onChange={(value) => setAttributes({ minHeight: value })} />
        </>
    );
}

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
    const boxStyle = buildBoxStyle({
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        backgroundColor,
        backgroundMode,
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
    const {
        editorId,
        sliderId,
        min = 0,
        max = 100,
        value = 0,
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
    } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `number_${shortId()}` }); }, [sliderId, setAttributes]);
    const setNum = (k, v) => { const n = Number(v); setAttributes({ [k]: Number.isFinite(n) ? n : 0 }); };
    const safeMin = Number.isFinite(min) ? min : 0;
    const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 100;
    const numVal = Number.isFinite(Number(value)) ? Number(value) : safeMin;
    const id = sliderId || '';
    const boxStyle = buildBoxStyle({
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        backgroundColor,
        backgroundMode,
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
                <PanelBody title="Number Input Settings" initialOpen>
                    <IdField sliderId={id} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Min" type="number" value={safeMin} onChange={(v) => setNum('min', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Max" type="number" value={safeMax} onChange={(v) => setNum('max', v)} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Value" type="number" value={numVal} onChange={(v) => setNum('value', v)} />
                    <BoxStyleControls attributes={attributes} setAttributes={setAttributes} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'slider-container slider-container--field', style: boxStyle })}>
                <input id={id || undefined} type="number" min={safeMin} max={safeMax} value={numVal} className="slider-number" step={1} readOnly />
            </div>
        </>
    );
}

// ─── TEXT INPUT ───────────────────────────────────────────────────────────────
export function TextInputEdit({ attributes = {}, setAttributes }) {
    const {
        editorId,
        sliderId,
        value = '',
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
    } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `text_${shortId()}` }); }, [sliderId, setAttributes]);
    const id = sliderId || '';
    const boxStyle = buildBoxStyle({
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        backgroundColor,
        backgroundMode,
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
                <PanelBody title="Text Input Settings" initialOpen>
                    <IdField sliderId={id} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Default Value" value={String(value)} onChange={(v) => setAttributes({ value: v })} />
                    <BoxStyleControls attributes={attributes} setAttributes={setAttributes} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'slider-container slider-container--field', style: boxStyle })}>
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
    const {
        editorId,
        sliderId,
        value = '',
        options = [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }],
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
    } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `radio_${shortId()}` }); }, [sliderId, setAttributes]);
    const updateOption = (i, k, v) => { const next = [...options]; next[i] = { ...next[i], [k]: v }; setAttributes({ options: next }); };
    const addOption = () => setAttributes({ options: [...options, { label: 'New', value: 'new' + Date.now() }] });
    const removeOption = (i) => setAttributes({ options: options.filter((_, idx) => idx !== i) });
    const id = sliderId || '';
    const boxStyle = buildBoxStyle({
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        backgroundColor,
        backgroundMode,
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
            <div {...useBlockProps({ className: 'nodelogic-radio-group', style: boxStyle })}>
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
    const {
        editorId,
        sliderId,
        value = '',
        options = [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }],
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
    } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `select_${shortId()}` }); }, [sliderId, setAttributes]);
    const updateOption = (i, k, v) => { const next = [...options]; next[i] = { ...next[i], [k]: v }; setAttributes({ options: next }); };
    const addOption = () => setAttributes({ options: [...options, { label: 'New', value: 'new' + Date.now() }] });
    const removeOption = (i) => setAttributes({ options: options.filter((_, idx) => idx !== i) });
    const id = sliderId || '';
    const boxStyle = buildBoxStyle({
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        backgroundColor,
        backgroundMode,
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
            <select
                {...useBlockProps({ className: 'input-control nodelogic-select-field', style: boxStyle })}
                id={id || undefined}
                value={value || ''}
                readOnly
            >
                {options.map((opt, i) => <option key={i} value={opt.value}>{opt.label}</option>)}
            </select>
        </>
    );
}

// ─── CHECKBOX ─────────────────────────────────────────────────────────────────
export function CheckboxEdit({ attributes = {}, setAttributes }) {
    const {
        editorId,
        sliderId,
        checkboxOnValue = '1',
        checkboxOffValue = '0',
        checkboxLabel = '',
        value = '0',
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
    } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `checkbox_${shortId()}` }); }, [sliderId, setAttributes]);
    const id = sliderId || '';
    const boxStyle = buildBoxStyle({
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        backgroundColor,
        backgroundMode,
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
                <PanelBody title="Checkbox Settings" initialOpen>
                    <IdField sliderId={id} setAttributes={setAttributes} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Checked Value" value={checkboxOnValue} onChange={(v) => setAttributes({ checkboxOnValue: v })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Unchecked Value" value={checkboxOffValue} onChange={(v) => setAttributes({ checkboxOffValue: v })} />
                    <TextControl __next40pxDefaultSize __nextHasNoMarginBottom label="Label Text" value={checkboxLabel} onChange={(v) => setAttributes({ checkboxLabel: v })} />
                    <BoxStyleControls attributes={attributes} setAttributes={setAttributes} />
                </PanelBody>
            </InspectorControls>
            <div {...useBlockProps({ className: 'nodelogic-checkbox-group', style: boxStyle })}>
                <label className="nodelogic-choice-option" htmlFor={id || undefined}>
                    <input
                        type="checkbox"
                        id={id || undefined}
                        checked={String(value) === String(checkboxOnValue)}
                        data-checked-value={checkboxOnValue}
                        data-unchecked-value={checkboxOffValue}
                        readOnly
                    />
                    <span className="nodelogic-label-text">{checkboxLabel || id}</span>
                </label>
            </div>
        </>
    );
}

// ─── LABEL (static text output) ───────────────────────────────────────────────
export function LabelEdit({ attributes = {}, setAttributes }) {
    const {
        editorId,
        sliderId,
        nodelogicLabel = '',
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
    } = attributes;
    useEffect(() => { if (!editorId) setAttributes({ editorId: uuid() }); }, [editorId, setAttributes]);
    useEffect(() => { if (!sliderId) setAttributes({ sliderId: `label_${shortId()}` }); }, [sliderId, setAttributes]);
    const id = sliderId || '';
    const boxStyle = buildBoxStyle({
        paddingTop,
        paddingRight,
        paddingBottom,
        paddingLeft,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        backgroundColor,
        backgroundMode,
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
                    <BoxStyleControls attributes={attributes} setAttributes={setAttributes} />
                </PanelBody>
            </InspectorControls>
            <span {...useBlockProps({ className: 'nodelogic-label', style: boxStyle })} id={id || undefined} data-nodelogic-id={id || undefined}>
                {nodelogicLabel || id}
            </span>
        </>
    );
}

// ─── DEFAULT EXPORT (backward compat — legacy "Element" block) ────────────────
export default SliderEdit;
