<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_formula       = $attributes['formula'] ?? '';
$nodelogic_graph_builder_editor_id     = $attributes['editorId'] ?? '';
$nodelogic_graph_builder_output_configs = $attributes['outputConfigs'] ?? array();
?>
<div
    class="nodelogic-logic-block"
    data-nodelogic-logic="1"
    data-editor-id="<?php echo esc_attr($nodelogic_graph_builder_editor_id); ?>"
    data-formula="<?php echo esc_attr($nodelogic_graph_builder_formula); ?>"
    data-output-configs="<?php echo esc_attr(wp_json_encode($nodelogic_graph_builder_output_configs)); ?>"
    style="display:none;"
></div>
<?php
})($attributes);
