import { useState, useEffect, useCallback } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, Button } from '@wordpress/components';
import GraphEditor from './components/graphEditor';
import { v4 as uuid } from 'uuid';

export default function Edit({ attributes, setAttributes }) {
    const { editorId, formula = '', mainFormula = '', eventFormulas = {}, label = 'Result:', resultUnit = '', graphState = null } = attributes;
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        if (!isModalOpen) return;
        try {
            const dispatch = window.wp?.data?.dispatch?.('core/block-editor');
            if (typeof dispatch?.clearSelectedBlock === 'function') dispatch.clearSelectedBlock();
            else if (typeof dispatch?.selectBlock === 'function') dispatch.selectBlock(null);
            document.activeElement?.blur?.();
        } catch { /* Gutenberg versions differ in their selection API. */ }
    }, [isModalOpen]);

    useEffect(() => {
        if (!editorId) {
            setAttributes({ editorId: uuid() });
        }
    }, [editorId, setAttributes]);

    const handleGraphStateChange = useCallback((state) => {
        setAttributes({ 
            graphState: state, 
            formula: state.mainFormula, // Backward compatibility
            mainFormula: state.mainFormula,
            eventFormulas: state.eventFormulas || {}
        });
    }, [setAttributes]);

    const handleFormulaChange = useCallback((nextFormula) => {
        setAttributes({ 
            formula: nextFormula,
            mainFormula: nextFormula
        });
    }, [setAttributes]);

    return (
        <>
            <InspectorControls>
                <PanelBody title="Formula Settings">
                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Result Label"
                        value={label}
                        onChange={(v) => setAttributes({ label: v })}
                    />

                    <TextControl
                        __next40pxDefaultSize
                        __nextHasNoMarginBottom
                        label="Result Unit"
                        help="Example: USD, m2, pcs, kg"
                        value={resultUnit}
                        onChange={(v) => setAttributes({ resultUnit: v })}
                    />

                    <Button
                        variant="primary"
                        onClick={() => setIsModalOpen(true)}
                        style={{ marginTop: '10px' }}
                    >
                        Edit Formula
                    </Button>
                </PanelBody>
            </InspectorControls>

            <div {...useBlockProps()}>
                <strong>{label}</strong>
            </div>
            {isModalOpen && editorId && (
                <div className="nodelogic-gutenberg-overlay">
                    <div className="nodelogic-gutenberg-shell">
                    <GraphEditor
                        editorId={editorId}
                        initialState={graphState}
                        forceInitialState
                        liveStateSync={false}
                        showTemplateTools={false}
                        mainElementType="info"
                        onFormulaChange={handleFormulaChange}
                        onStateChange={handleGraphStateChange}
                        onRequestClose={() => setIsModalOpen(false)}
                    />
                    </div>
                </div>
            )}
        </>
    );
}
