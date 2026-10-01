import { useState, useEffect, useCallback, useRef } from '@wordpress/element';
import { useBlockProps } from '@wordpress/block-editor';
import { Button, Modal } from '@wordpress/components';
import { select } from '@wordpress/data';
import GraphEditor from './components/graphEditor';
import { v4 as uuid } from 'uuid';

// editorId -> clientId of the logic block that owns it in this editor
// session. A block that shows up later with an id another LIVE block already
// owns is a copy (Duplicate, copy/paste, pattern insert): it gets its own id,
// so the two never share a runtime scope, server-side lookup or working copy.
const editorIdOwners = new Map();
// Each block regenerates at most once: a pathological setup can never loop.
const regeneratedClients = new Set();

const isInsideSyncedPattern = (clientId) => {
    try {
        const parents = select('core/block-editor').getBlockParentsByBlockName(clientId, 'core/block');
        return Array.isArray(parents) && parents.length > 0;
    } catch (error) {
        return false;
    }
};

const blockExists = (clientId) => {
    try {
        return Boolean(select('core/block-editor').getBlock(clientId));
    } catch (error) {
        return false;
    }
};

const extractOutputConfigs = (state) => {
    const outputConfigs = {};
    if (state && Array.isArray(state.elements)) {
        state.elements.forEach((el) => {
            if (el && el.type === 'output' && el.data?.selectedElement) {
                outputConfigs[el.data.selectedElement] = {
                    executeOnLoad: el.data.executeOnLoad !== false,
                };
            }
        });
    }
    return outputConfigs;
};

export default function LogicEdit({ attributes = {}, setAttributes, clientId }) {
    const { editorId, graphState, graphHistory, graphHistoryLimit } = attributes;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const hasUnpublishedRef = useRef(false);

    useEffect(() => {
        if (!editorId) {
            setAttributes({ editorId: uuid() });
            return;
        }
        const owner = editorIdOwners.get(editorId);
        if (
            owner
            && owner !== clientId
            && blockExists(owner)
            && !isInsideSyncedPattern(clientId)
            && !regeneratedClients.has(clientId)
        ) {
            regeneratedClients.add(clientId);
            setAttributes({ editorId: uuid() });
            return;
        }
        if (!owner || !blockExists(owner)) {
            editorIdOwners.set(editorId, clientId);
        }
    }, [editorId, clientId, setAttributes]);

    // Save Graph: MAIN (graphState + compiled formula) and its version
    // history change in ONE attribute update, so they can never disagree.
    const handlePublish = useCallback(({ state, history, historyLimit }) => {
        setAttributes({
            graphState: state,
            formula: state.formula,
            outputConfigs: extractOutputConfigs(state),
            graphHistory: history,
            graphHistoryLimit: historyLimit,
        });
        return true;
    }, [setAttributes]);

    const handleHistoryLimitChange = useCallback((limit) => {
        setAttributes({ graphHistoryLimit: limit });
    }, [setAttributes]);

    const handleUnsavedChange = useCallback((hasUnpublished) => {
        hasUnpublishedRef.current = hasUnpublished;
    }, []);

    const requestClose = () => {
        if (
            hasUnpublishedRef.current
            && !window.confirm(
                'Close the graph editor?\n\n'
                + 'Your changes are not saved to the page yet. They stay in this browser\'s working copy '
                + 'and reopen the next time you edit this graph, but the page keeps using the last saved graph '
                + 'until you click "Save Graph" (and update the page).'
            )
        ) {
            return;
        }
        setIsModalOpen(false);
    };

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
                    onRequestClose={requestClose}
                    shouldCloseOnClickOutside={false}
                    style={{ width: '100vw', height: '100vh', maxHeight: 'calc(100vh - 16px)', maxWidth: 'calc(100vw - 12px)' }}
                >
                    <GraphEditor
                        editorId={editorId}
                        initialState={graphState}
                        initialHistory={graphHistory}
                        historyLimit={graphHistoryLimit}
                        forceInitialState
                        liveStateSync={false}
                        showTemplateTools={true}
                        mainElementType="logic"
                        onPublish={handlePublish}
                        onHistoryLimitChange={handleHistoryLimitChange}
                        onUnsavedChange={handleUnsavedChange}
                    />
                </Modal>
            )}
        </>
    );
}
