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

        // React mount point
        printf(
            '<div
                class="nodelogic-logic-editor-root"
                data-nodelogic-logic="1"
                data-editor-id="%1$s"
                data-graph-id="%2$s"
            ></div>',
            esc_attr($editor_id),
            esc_attr(sanitize_key($editor_id))
        );
    }
}
