<?php

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('nodelogic_render_logic_element')) {

    function nodelogic_render_logic_element(array $settings, string $widget_id)
    {
        // Editor ID
        $editor_id = sanitize_key(
            isset($settings['editor_id']) && $settings['editor_id'] !== ''
                ? (string) $settings['editor_id']
                : ('elementor-' . $widget_id)
        );

        // Graph state
        $graph_state_raw = isset($settings['graph_state'])
            ? (string) $settings['graph_state']
            : '{}';

        $graph_state = json_decode($graph_state_raw, true);

        if (!is_array($graph_state)) {
            $graph_state = [];
        }

        // React mount point
        printf(
            '<div
                class="nodelogic-logic-editor-root"
                data-nodelogic-logic="1"
                data-editor-id="%1$s"
                data-graph-state="%2$s"
            ></div>',
            esc_attr($editor_id),
            esc_attr(wp_json_encode($graph_state))
        );
    }
}
