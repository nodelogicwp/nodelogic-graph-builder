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
        onCompile,
        initialCompileStatus,
        onHistoryLimitChange,
        onFormulaChange,
        onUnsavedChange,
        onRequestClose,
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
            onCompile={onCompile}
            initialCompileStatus={initialCompileStatus}
            onHistoryLimitChange={onHistoryLimitChange}
            onFormulaChange={onFormulaChange}
            onUnsavedChange={onUnsavedChange}
            onRequestClose={onRequestClose}
        />
    );


    element.__nodelogicReactRoot =
        root;

    return root;
}


window.mountElementorLogicEditor =
    mountElementorLogicEditor;
