import React from 'react';
import { createRoot } from 'react-dom/client';
import GraphEditor from '../components/graphEditor';

export function mountElementorLogicEditor(
    element,
    {
        editorId,
        graphState,
        onStateChange,
        onFormulaChange,
    }
) {

    const root =
        createRoot(element);

    root.render(
        <GraphEditor
            editorId={editorId}
            initialState={graphState}
            forceInitialState
            liveStateSync={false}
            showTemplateTools={true}
            mainElementType="logic"
            onStateChange={onStateChange}
            onFormulaChange={onFormulaChange}
        />
    );


    element.__nodelogicReactRoot =
        root;
}


window.mountElementorLogicEditor =
    mountElementorLogicEditor;