import React from 'react';
import { createRoot } from 'react-dom/client';
import GraphEditor from '../components/graphEditor';

export function mountElementorLogicEditor(
    element,
    {
        editorId,
        graphState,
        graphHistory,
        historyLimit,
        onStateChange,
        onPublish,
        onHistoryLimitChange,
        onFormulaChange,
        onUnsavedChange,
    }
) {

    const root =
        createRoot(element);

    root.render(
        <GraphEditor
            editorId={editorId}
            initialState={graphState}
            initialHistory={graphHistory}
            historyLimit={historyLimit}
            forceInitialState
            liveStateSync={false}
            showTemplateTools={true}
            mainElementType="logic"
            onStateChange={onStateChange}
            onPublish={onPublish}
            onHistoryLimitChange={onHistoryLimitChange}
            onFormulaChange={onFormulaChange}
            onUnsavedChange={onUnsavedChange}
        />
    );


    element.__nodelogicReactRoot =
        root;

    return root;
}


window.mountElementorLogicEditor =
    mountElementorLogicEditor;
