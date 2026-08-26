<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Integracja z Elementorem – kategoria, widget, renderer, assets.
 */
add_action('elementor/init', function () {

    // Renderer dla Elementora (mount point dla Reacta)
    require_once __DIR__ . '/logic-render-elementor.php';

    /**
     * Rejestracja kategorii "NodeLogic"
     */
    add_action('elementor/elements/categories_registered', function ($elements_manager) {

        if (!is_object($elements_manager)) {
            return;
        }

        $elements_manager->add_category(
            'nodelogic',
            [
                'title' => 'NodeLogic Graph Builder',
                'icon'  => 'fa fa-project-diagram',
            ]
        );
    });

    /**
     * Rejestracja widgetu "NodeLogic Graph Builder"
     */
    add_action('elementor/widgets/register', function ($widgets_manager) {

        if (!class_exists('\Elementor\Widget_Base')) {
            return;
        }

        class NodeLogic_Elementor_Logic_Widget extends \Elementor\Widget_Base
        {
            public function get_name() {
                return 'nodelogic_logic_widget';
            }

            public function get_title() {
                return 'NodeLogic Graph Builder';
            }

            public function get_icon() {
                return 'eicon-flow';
            }

            public function get_categories() {
                return [ 'nodelogic' ];
            }

            public function get_keywords() {
                return [ 'logic', 'graph', 'nodelogic' ];
            }

            /**
             * Dzięki temu Elementor nie traktuje widgetu jak Container.
             */
            public function get_html_wrapper_class() {
                return 'nodelogic-logic-wrapper';
            }

            public function get_script_depends() {
                return [ 'nodelogic-elementor-logic' ];
            }

            public function get_style_depends() {
                return [ 'nodelogic-elementor-logic-css' ];
            }

            protected function content_template() {}

            public function render_plain_content() {}

            /**
             * Kontrolki – trzymamy pełny stan logiki jak w Gutenbergu.
             */
            protected function register_controls() {

                $this->start_controls_section(
                    'nodelogic_logic_section',
                    [ 'label' => 'NodeLogic Graph Builder' ]
                );

                // Editor ID – generowany automatycznie, użytkownik go nie ustawia
                $this->add_control(
                    'editor_id',
                    [
                        'label' => 'Editor ID',
                        'type' => \Elementor\Controls_Manager::HIDDEN,
                        'default' => '',
                    ]
                );

                // Graph state – pełny stan grafu
                $this->add_control(
                    'graph_state',
                    [
                        'label' => 'Graph State',
                        'type' => \Elementor\Controls_Manager::HIDDEN,
                        'default' => wp_json_encode([
                            'elements'    => [],
                            'connections' => [],
                            'formula'     => '',
                            'updatedAt'   => 0,
                        ]),
                    ]
                );

                // Formula – tekstowa formuła logiki
                $this->add_control(
                    'formula',
                    [
                        'label'   => 'Formula',
                        'type'    => \Elementor\Controls_Manager::HIDDEN,
                        'default' => '',
                    ]
                );

                // Output configs – konfiguracje outputów
                $this->add_control(
                    'output_configs',
                    [
                        'label'   => 'Output Configs',
                        'type'    => \Elementor\Controls_Manager::HIDDEN,
                        'default' => '{}',
                    ]
                );

                $this->add_control(
                    'open_editor_button',
                    [
                        'label' => 'Logic Graph Editor',
                        'type' => \Elementor\Controls_Manager::RAW_HTML,
                        'raw' => '<button class="nodelogic-open-logic-editor">Open Logic Editor</button>',
                        'content_classes' => 'nodelogic-logic-editor-button-wrapper',
                    ]
                );


                $this->end_controls_section();
            }

            /**
             * Renderowanie widgetu – UI jak w Gutenbergu + mount point dla Reacta.
             */
            protected function render() {

                $settings = $this->get_settings_for_display();

                $editor_id = $settings['editor_id'] ?? '';

                if (!$editor_id) {
                    $editor_id = 'elementor-' . $this->get_id();
                }

                $graph_state = $settings['graph_state'] ?? '{}';
                $formula = $settings['formula'] ?? '';
                $output_configs = $settings['output_configs'] ?? '{}';

                if (\Elementor\Plugin::$instance->editor->is_edit_mode()) {
                    ?>
                    <div class="nodelogic-logic-elementor-ui">
                        <strong>NodeLogic Graph Builder - Logic Block</strong>

                        <p>
                            This block holds the node-based logic graph for the whole page.
                            Connect element nodes to target HTML elements.
                        </p>
                    </div>
                    <?php
                }
                ?>

                <div
                    class="nodelogic-logic-block"
                    data-editor-id="<?php echo esc_attr($editor_id); ?>"
                    data-graph-state="<?php echo esc_attr($graph_state); ?>"
                    data-formula="<?php echo esc_attr($formula); ?>"
                    data-output-configs="<?php echo esc_attr($output_configs); ?>"
                    style="display:none;"
                ></div>

                <?php
            }

        }

        $widgets_manager->register(new NodeLogic_Elementor_Logic_Widget());
    });
});

