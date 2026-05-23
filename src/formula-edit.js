import { useState, useEffect, useCallback } from '@wordpress/element';
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, TextControl, Button, Modal } from '@wordpress/components';
import GraphEditor from './components/graphEditor';
import { v4 as uuid } from 'uuid';

export default function Edit({ attributes, setAttributes }) {
    const { editorId, formula = '', mainFormula = '', eventFormulas = {}, label = 'Result:', resultUnit = '', graphState = null } = attributes;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const runtimeConfig = (typeof window !== 'undefined' && window.nodelogicGraphBuilderConfig && typeof window.nodelogicGraphBuilderConfig === 'object')
        ? window.nodelogicGraphBuilderConfig
        : {};
    const templatesEnabled = Boolean(runtimeConfig.enableTemplates);
    const customNodesEnabled = Boolean(runtimeConfig.enableCustomNodes);

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
                <Modal
                    title="Formula Editor"
                    onRequestClose={() => setIsModalOpen(false)}
                    shouldCloseOnClickOutside={false}
                    style={{ width: '100vw', height: '100vh', 'max-height': 'calc(100vh - 16px)', 'max-width': 'calc(100vw - 12px)' }}
                >
                    <GraphEditor
                        editorId={editorId}
                        initialState={graphState}
                        forceInitialState
                        liveStateSync={false}
                        mainElementType="info"
                        showTemplateTools={templatesEnabled}
                        enableCustomNodes={customNodesEnabled}
                        onFormulaChange={handleFormulaChange}
                        onStateChange={handleGraphStateChange}
                    />
                </Modal>
            )}
        </>
    );
}
