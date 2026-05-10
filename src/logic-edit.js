import { useState, useEffect, useCallback, useRef } from '@wordpress/element';
import { useBlockProps } from '@wordpress/block-editor';
import { Button, Modal } from '@wordpress/components';
import GraphEditor from './components/graphEditor';
import { v4 as uuid } from 'uuid';

export default function LogicEdit({ attributes = {}, setAttributes }) {
    const { editorId, graphState } = attributes;
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

    const handleStateChange = useCallback((state) => {
        // Extract output configs from output nodes
        const outputConfigs = {};
        if (state.elements && Array.isArray(state.elements)) {
            state.elements.forEach(el => {
                if (el.type === 'output' && el.data?.selectedElement) {
                    outputConfigs[el.data.selectedElement] = {
                        executeOnLoad: el.data.executeOnLoad !== false
                    };
                }
            });
        }
        setAttributes({ graphState: state, formula: state.formula, outputConfigs });
    }, [setAttributes]);

    const handleFormulaChange = useCallback((formula) => {
        setAttributes({ formula });
    }, [setAttributes]);

    return (
        <>
            <div {...useBlockProps({ className: 'nodelogic-logic-editor-block' })}>
                <div style={{ padding: '12px', background: '#1e293b', borderRadius: '6px', color: '#e2e8f0', fontSize: '13px' }}>
                    <strong>NodeLogic Graph Builder - Logic Block</strong>
                    <p style={{ margin: '6px 0 10px', color: '#94a3b8', fontSize: '12px' }}>
                        This block holds the node-based logic graph for the whole page. Connect element nodes to target HTML elements.
                    </p>
                    <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                        Edit Logic Graph
                    </Button>
                </div>
            </div>

            {isModalOpen && editorId && (
                <Modal
                    title="Logic Graph Editor"
                    onRequestClose={() => setIsModalOpen(false)}
                    style={{ width: '100vw', height: '100vh', maxHeight: 'calc(100vh - 16px)', maxWidth: 'calc(100vw - 12px)' }}
                >
                    <GraphEditor
                        editorId={editorId}
                        initialState={graphState}
                        forceInitialState
                        mainElementType="logic"
                        showTemplateTools={templatesEnabled}
                        enableCustomNodes={customNodesEnabled}
                        onFormulaChange={handleFormulaChange}
                        onStateChange={handleStateChange}
                    />
                </Modal>
            )}
        </>
    );
}


