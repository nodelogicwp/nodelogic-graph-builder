<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_slider_id = $attributes['sliderId'] ?? 'label_1';
$nodelogic_graph_builder_label     = $attributes['nodelogicLabel'] ?? '';
$nodelogic_graph_builder_label_txt = $nodelogic_graph_builder_label !== '' ? $nodelogic_graph_builder_label : $nodelogic_graph_builder_slider_id;
?>
<span
    id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"
    data-nodelogic-id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"
    data-nodelogic-label="<?php echo esc_attr($nodelogic_graph_builder_label_txt); ?>"
    class="nodelogic-label"
><?php echo esc_html($nodelogic_graph_builder_label_txt); ?></span>
<?php
})($attributes);
