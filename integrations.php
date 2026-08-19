<?php
/**
 * Builder integrations for NodeLogic Graph Builder.
 */

if (!defined('ABSPATH')) {
    exit;
}

function nodelogic_get_registered_presets(): array
{
    return [
        'price-calculator' => __('Price Calculator Starter', 'nodelogic-graph-builder'),
        'estimate-calculator' => __('Estimate Calculator Starter', 'nodelogic-graph-builder'),
    ];
}

function nodelogic_render_preset_shortcode(array $attributes = []): string
{
    $preset_id = sanitize_key($attributes['id'] ?? $attributes['preset'] ?? 'price-calculator');
    $presets = nodelogic_get_registered_presets();
    if (!isset($presets[$preset_id])) {
        return '';
    }

    $content = '';
    if ($preset_id === 'price-calculator') {
        $content = nodelogic_graph_builder_build_preset_pattern_content([
            'presetId' => 'price-calculator',
            'rows' => 4,
            'columns' => 1,
            'children' => [
                ['name' => 'custom/element-label', 'attrs' => ['sliderId' => 'nodelogic_price_title', 'nodelogicLabel' => __('Price Calculator', 'nodelogic-graph-builder')]],
                ['name' => 'custom/element-number', 'attrs' => ['sliderId' => 'nodelogic_price_base', 'min' => 0, 'max' => 9999, 'value' => 29]],
                ['name' => 'custom/element-number', 'attrs' => ['sliderId' => 'nodelogic_price_qty', 'min' => 1, 'max' => 100, 'value' => 1]],
                ['name' => 'custom/element-number', 'attrs' => ['sliderId' => 'nodelogic_price_total', 'min' => 0, 'max' => 999999, 'value' => 29]],
            ],
            'graphState' => nodelogic_graph_builder_build_calculator_graph_state('price-calculator', 'nodelogic_price_base', 'nodelogic_price_qty', 'nodelogic_price_total', __('Unit Price', 'nodelogic-graph-builder'), __('Quantity', 'nodelogic-graph-builder')),
            'formula' => sprintf('({ %s: { "value": ([%s] * [%s]) } })', wp_json_encode('nodelogic_price_total'), 'nodelogic_price_base', 'nodelogic_price_qty'),
        ]);
    } elseif ($preset_id === 'estimate-calculator') {
        $content = nodelogic_graph_builder_build_preset_pattern_content([
            'presetId' => 'estimate-calculator',
            'rows' => 4,
            'columns' => 1,
            'children' => [
                ['name' => 'custom/element-label', 'attrs' => ['sliderId' => 'nodelogic_estimate_title', 'nodelogicLabel' => __('Estimate Calculator', 'nodelogic-graph-builder')]],
                ['name' => 'custom/element-seekbar', 'attrs' => ['sliderId' => 'nodelogic_estimate_hours', 'min' => 1, 'max' => 12, 'value' => 3]],
                ['name' => 'custom/element-number', 'attrs' => ['sliderId' => 'nodelogic_estimate_rate', 'min' => 0, 'max' => 9999, 'value' => 120]],
                ['name' => 'custom/element-number', 'attrs' => ['sliderId' => 'nodelogic_estimate_total', 'min' => 0, 'max' => 999999, 'value' => 360]],
            ],
            'graphState' => nodelogic_graph_builder_build_calculator_graph_state('estimate-calculator', 'nodelogic_estimate_hours', 'nodelogic_estimate_rate', 'nodelogic_estimate_total', __('Hours', 'nodelogic-graph-builder'), __('Rate', 'nodelogic-graph-builder')),
            'formula' => sprintf('({ %s: { "value": ([%s] * [%s]) } })', wp_json_encode('nodelogic_estimate_total'), 'nodelogic_estimate_hours', 'nodelogic_estimate_rate'),
        ]);
    }

    return $content !== '' ? do_blocks($content) : '';
}

add_shortcode('nodelogic_preset', 'nodelogic_render_preset_shortcode');

add_action('rest_api_init', function () {
    register_rest_route('nodelogic/v1', '/presets', [
        'methods' => WP_REST_Server::READABLE,
        'permission_callback' => '__return_true',
        'callback' => static function () {
            $items = [];
            foreach (nodelogic_get_registered_presets() as $id => $label) {
                $items[] = ['id' => $id, 'label' => $label, 'shortcode' => '[nodelogic_preset id="' . $id . '"]'];
            }
            return rest_ensure_response($items);
        },
    ]);
});

add_action('elementor/widgets/register', static function ($widgets_manager) {
    if (!class_exists('Elementor\\Widget_Base')) {
        return;
    }

        if (!class_exists('NodeLogic_Elementor_Preset_Widget')) {
            class NodeLogic_Elementor_Preset_Widget extends Elementor\Widget_Base
            {
                public function get_name() { return 'nodelogic-preset'; }
                public function get_title() { return __('NodeLogic Preset', 'nodelogic-graph-builder'); }
                public function get_icon() { return 'eicon-calculator'; }
                public function get_categories() { return ['general']; }

                protected function register_controls()
                {
                    $options = [];
                    foreach (nodelogic_get_registered_presets() as $id => $label) {
                        $options[$id] = $label;
                    }
                    $this->start_controls_section('nodelogic_section', ['label' => __('NodeLogic', 'nodelogic-graph-builder')]);
                    $this->add_control('preset_id', ['label' => __('Preset', 'nodelogic-graph-builder'), 'type' => \Elementor\Controls_Manager::SELECT, 'options' => $options, 'default' => 'price-calculator']);
                    $this->end_controls_section();
                }

                protected function render()
                {
                    echo nodelogic_render_preset_shortcode(['id' => $this->get_settings_for_display('preset_id')]);
                }
            }
        }

    $widgets_manager->register(new NodeLogic_Elementor_Preset_Widget());
});

// Blocksy and other builders can consume this shortcode. When Blocksy exposes its
// optional shortcode registry, add NodeLogic there without requiring Blocksy.
add_filter('blocksy:shortcodes', static function ($shortcodes) {
    if (!is_array($shortcodes)) {
        $shortcodes = [];
    }
    $shortcodes['nodelogic_preset'] = [
        'label' => __('NodeLogic Preset', 'nodelogic-graph-builder'),
        'shortcode' => 'nodelogic_preset',
        'attributes' => ['id' => array_keys(nodelogic_get_registered_presets())],
    ];
    return $shortcodes;
});
