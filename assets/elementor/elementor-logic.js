(function () {
    'use strict';

    console.log('NodeLogic: elementor-logic.js loaded');

    let initialized = false;
    let currentContainer = null;

    let modalRoot = null;
    let reactRoot = null;


    /*
     * =========================================================
     * ELEMENTOR READY
     * =========================================================
     */

    function isElementorReady() {
        return (
            typeof window.elementor !== 'undefined' &&
            window.elementor &&
            window.elementor.selection &&
            typeof window.elementor.selection.getElements === 'function' &&
            typeof window.$e !== 'undefined' &&
            window.$e &&
            typeof window.$e.run === 'function'
        );
    }


    function boot() {

        if (initialized) {
            return true;
        }

        if (!isElementorReady()) {
            return false;
        }

        initialized = true;

        console.log(
            'NodeLogic: Elementor editor ready'
        );

        document.addEventListener(
            'click',
            handleDocumentClick,
            true
        );

        return true;
    }


    /*
     * Elementor ładuje się asynchronicznie.
     */

    function waitForElementor() {

        if (boot()) {
            return;
        }

        let attempts = 0;

        const timer = setInterval(
            function () {

                attempts++;

                if (boot()) {
                    clearInterval(timer);
                    return;
                }

                if (attempts >= 150) {

                    clearInterval(timer);

                    console.error(
                        'NodeLogic: Elementor initialization timeout.'
                    );
                }

            },
            100
        );
    }


    /*
     * =========================================================
     * CURRENT ELEMENTOR CONTAINER
     * =========================================================
     */

    function getCurrentContainer() {

        if (!isElementorReady()) {
            return null;
        }

        try {

            const elements =
                window.elementor.selection.getElements();

            if (
                !elements ||
                !elements.length
            ) {
                return null;
            }

            /*
             * Backbone collection.
             */

            if (
                typeof elements.at === 'function'
            ) {
                return elements.at(0) || null;
            }

            /*
             * Fallback.
             */

            return elements[0] || null;

        } catch (error) {

            console.error(
                'NodeLogic: failed to get current Elementor container.',
                error
            );

            return null;
        }
    }


    /*
     * =========================================================
     * JSON
     * =========================================================
     */

    function parseJSON(
        value,
        fallback
    ) {

        if (
            value === null ||
            typeof value === 'undefined' ||
            value === ''
        ) {
            return fallback;
        }

        if (
            typeof value === 'object'
        ) {
            return value;
        }

        try {

            return JSON.parse(value);

        } catch (error) {

            console.warn(
                'NodeLogic: invalid JSON value.',
                value
            );

            return fallback;
        }
    }


    /*
     * =========================================================
     * GET GRAPH DATA
     * =========================================================
     */

    function getGraphData(container) {

        if (
            !container ||
            !container.settings
        ) {
            return null;
        }

        const settings =
            container.settings;


        /*
         * -----------------------------------------------------
         * Stable editor ID
         * -----------------------------------------------------
         *
         * NEVER use Date.now() here.
         *
         * One Elementor widget = one GraphEditor ID.
         */

        let editorId =
            settings.get('editor_id');


        if (!editorId) {

            editorId =
                'nodelogic-elementor-' +
                container.id;

            /*
             * editor_id jest ustawiany bezpośrednio.
             *
             * Nie wywołujemy tutaj $e.run(), ponieważ
             * inicjalizacja ID sama w sobie nie jest edycją grafu.
             */

            settings.set(
                'editor_id',
                editorId
            );
        }


        /*
         * -----------------------------------------------------
         * Graph state
         * -----------------------------------------------------
         */

        const graphState =
            parseJSON(
                settings.get('graph_state'),
                {
                    elements: [],
                    connections: [],
                    formula: '',
                    customNodeUi: null,
                    updatedAt: 0
                }
            );


        const formula =
            settings.get('formula') || '';


        const outputConfigs =
            parseJSON(
                settings.get('output_configs'),
                {}
            );


        console.log(
            'NodeLogic: Graph data before mount:',
            {
                editorId,
                graphState,
                formula,
                outputConfigs
            }
        );


        return {
            editorId,
            graphState,
            formula,
            outputConfigs
        };
    }


    /*
     * =========================================================
     * UPDATE ELEMENTOR THROUGH $e
     * =========================================================
     */

    function updateElementorSettings(
        container,
        values
    ) {

        if (!container) {

            console.error(
                'NodeLogic: no Elementor container.'
            );

            return false;
        }


        if (
            typeof window.$e === 'undefined' ||
            typeof window.$e.run !== 'function'
        ) {

            console.error(
                'NodeLogic: $e.run() is unavailable.'
            );

            return false;
        }


        const settings =
            container.settings;


        if (
            !settings ||
            typeof settings.get !== 'function'
        ) {

            console.error(
                'NodeLogic: container.settings unavailable.'
            );

            return false;
        }


        /*
         * -----------------------------------------------------
         * Remove values which didn't actually change.
         * -----------------------------------------------------
         *
         * This is important because GraphEditor may call
         * onFormulaChange('') immediately after mounting.
         */

        const changed = {};


        Object.keys(values).forEach(
            function (key) {

                const oldValue =
                    settings.get(key);

                const newValue =
                    values[key];


                if (
                    oldValue !== newValue
                ) {

                    changed[key] =
                        newValue;
                }

            }
        );


        /*
         * Nothing changed.
         */

        if (
            Object.keys(changed).length === 0
        ) {

            console.log(
                'NodeLogic: no Elementor settings changed.'
            );

            return false;
        }


        console.log(
            'NodeLogic: executing Elementor settings command:',
            changed
        );


        try {

            /*
             * -------------------------------------------------
             * THIS IS THE IMPORTANT PART.
             *
             * Do NOT use:
             *
             * container.settings.set()
             * history.addItem()
             * elementor.channels.editor.trigger()
             *
             * for graph changes.
             *
             * $e.run() goes through Elementor's command system.
             * -------------------------------------------------
             */

            window.$e.run(
                'document/elements/settings',
                {
                    container: container,
                    settings: changed
                }
            );


            console.log(
                'NodeLogic: Elementor command executed.'
            );


            /*
             * Debug.
             */

            if (
                window.elementor.saver &&
                typeof window.elementor.saver.isEditorChanged ===
                    'function'
            ) {

                console.log(
                    'NodeLogic: Elementor isEditorChanged:',
                    window.elementor.saver.isEditorChanged()
                );
            }


            return true;

        } catch (error) {

            console.error(
                'NodeLogic: Elementor settings command failed.',
                error
            );

            /*
             * Fallback.
             *
             * Jeżeli command nie zadziała, przynajmniej ustawiamy
             * model. Nie próbujemy jednak ręcznie odpalać
             * channels.editor ani history.
             */

            try {

                settings.set(changed);

                console.warn(
                    'NodeLogic: fallback settings.set() executed.'
                );

            } catch (fallbackError) {

                console.error(
                    'NodeLogic: fallback settings.set() failed.',
                    fallbackError
                );
            }

            return false;
        }
    }


    /*
     * =========================================================
     * BUILD OUTPUT CONFIGS
     * =========================================================
     */

    function extractOutputConfigs(state) {

        const outputConfigs = {};


        if (
            !state ||
            !Array.isArray(state.elements)
        ) {
            return outputConfigs;
        }


        state.elements.forEach(
            function (element) {

                if (
                    !element ||
                    element.type !== 'output' ||
                    !element.data
                ) {
                    return;
                }


                const selectedElement =
                    element.data.selectedElement;


                if (!selectedElement) {
                    return;
                }


                outputConfigs[selectedElement] = {
                    executeOnLoad:
                        element.data.executeOnLoad !== false
                };

            }
        );


        return outputConfigs;
    }


    /*
     * =========================================================
     * MODAL
     * =========================================================
     */

    function closeModal() {

        console.log(
            'NodeLogic: closing modal'
        );


        /*
         * Unmount React.
         */

        if (reactRoot) {

            try {

                reactRoot.unmount();

            } catch (error) {

                console.warn(
                    'NodeLogic: React unmount failed.',
                    error
                );
            }

            reactRoot = null;
        }


        /*
         * Remove DOM.
         */

        if (modalRoot) {

            modalRoot.remove();

            modalRoot = null;
        }


        document.body.classList.remove(
            'nodelogic-modal-open'
        );


        currentContainer = null;
    }


    function createModal() {

        /*
         * Zamknij poprzedni modal, jeśli istnieje.
         */

        if (modalRoot) {
            closeModal();
        }


        /*
         * Overlay.
         */

        modalRoot =
            document.createElement('div');

        modalRoot.className =
            'nodelogic-modal-overlay';


        /*
         * Modal.
         */

        const modal =
            document.createElement('div');

        modal.className =
            'nodelogic-modal';


        /*
         * Header.
         */

        const header =
            document.createElement('div');

        header.className =
            'nodelogic-modal-header';


        const title =
            document.createElement('h2');

        title.textContent =
            'Logic Graph Editor';


        /*
         * Close button.
         */

        const closeButton =
            document.createElement('button');

        closeButton.type =
            'button';

        closeButton.className =
            'nodelogic-modal-close';

        closeButton.innerHTML =
            '&times;';

        closeButton.setAttribute(
            'aria-label',
            'Close Logic Editor'
        );


        /*
         * Content.
         */

        const content =
            document.createElement('div');

        content.className =
            'nodelogic-modal-content';


        /*
         * Close.
         */

        closeButton.addEventListener(
            'click',
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                closeModal();
            }
        );


        /*
         * Assemble.
         */

        header.appendChild(title);
        header.appendChild(closeButton);

        modal.appendChild(header);
        modal.appendChild(content);

        modalRoot.appendChild(modal);

        document.body.appendChild(
            modalRoot
        );


        document.body.classList.add(
            'nodelogic-modal-open'
        );


        return content;
    }


    /*
     * =========================================================
     * OPEN GRAPH EDITOR
     * =========================================================
     */

    function openGraphEditor() {

        console.log(
            'NodeLogic: Open Logic Editor clicked'
        );


        /*
         * Get currently selected Elementor element.
         */

        const container =
            getCurrentContainer();


        if (!container) {

            console.error(
                'NodeLogic: cannot find current Elementor container.'
            );

            return;
        }


        currentContainer =
            container;


        console.log(
            'NodeLogic: Current Elementor container:',
            container
        );


        /*
         * Get saved GraphEditor data.
         */

        const graphData =
            getGraphData(container);


        if (!graphData) {

            console.error(
                'NodeLogic: unable to get graph data.'
            );

            return;
        }


        /*
         * Create modal.
         */

        const content =
            createModal();


        /*
         * Check React mount function.
         */

        if (
            typeof window.mountElementorLogicEditor !==
            'function'
        ) {

            console.error(
                'NodeLogic: mountElementorLogicEditor() is unavailable.'
            );

            closeModal();

            return;
        }


        /*
         * -----------------------------------------------------
         * Mount React GraphEditor.
         * -----------------------------------------------------
         */

        try {

            window.mountElementorLogicEditor(
                content,
                {

                    editorId:
                        graphData.editorId,


                    graphState:
                        graphData.graphState,


                    /*
                     * -------------------------------------------------
                     * GRAPH STATE
                     * -------------------------------------------------
                     */

                    onStateChange:
                        function (state) {

                            console.log(
                                'NodeLogic: GraphEditor state changed:',
                                state
                            );


                            if (!currentContainer) {

                                console.warn(
                                    'NodeLogic: current container disappeared.'
                                );

                                return;
                            }


                            /*
                             * Output configuration.
                             */

                            const outputConfigs =
                                extractOutputConfigs(
                                    state
                                );


                            /*
                             * Save everything as one Elementor command.
                             */

                            updateElementorSettings(
                                currentContainer,
                                {

                                    graph_state:
                                        JSON.stringify(
                                            state
                                        ),


                                    formula:
                                        state?.formula || '',


                                    output_configs:
                                        JSON.stringify(
                                            outputConfigs
                                        )

                                }
                            );

                        },


                    /*
                     * -------------------------------------------------
                     * FORMULA
                     * -------------------------------------------------
                     */

                    onFormulaChange:
                        function (formula) {

                            console.log(
                                'NodeLogic: GraphEditor formula changed:',
                                formula
                            );


                            if (!currentContainer) {
                                return;
                            }


                            updateElementorSettings(
                                currentContainer,
                                {

                                    formula:
                                        formula || ''

                                }
                            );

                        }

                }
            );


            console.log(
                'NodeLogic: Logic Editor mounted.'
            );

        } catch (error) {

            console.error(
                'NodeLogic: failed to mount GraphEditor.',
                error
            );

            closeModal();
        }
    }


    /*
     * =========================================================
     * CLICK HANDLER
     * =========================================================
     */

    function handleDocumentClick(event) {

        const button =
            event.target.closest(
                '.nodelogic-open-logic-editor'
            );


        if (!button) {
            return;
        }


        event.preventDefault();
        event.stopPropagation();


        openGraphEditor();
    }


    /*
     * =========================================================
     * START
     * =========================================================
     */

    waitForElementor();

})();