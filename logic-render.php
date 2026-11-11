<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_editor_id     = $attributes['editorId'] ?? '';
?>
<div
    class="nodelogic-logic-block"
    data-nodelogic-logic="1"
    data-editor-id="<?php echo esc_attr($nodelogic_graph_builder_editor_id); ?>"
    data-graph-id="<?php echo esc_attr(sanitize_key($nodelogic_graph_builder_editor_id)); ?>"
    data-post-id="<?php echo esc_attr((string) (get_the_ID() ?: get_queried_object_id() ?: 0)); ?>"
    style="display:none;"
></div>
<?php
})($attributes);
