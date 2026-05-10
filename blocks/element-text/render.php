<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_slider_id = $attributes['sliderId'] ?? 'text_1';
$nodelogic_graph_builder_value     = $attributes['value'] ?? '';
$nodelogic_graph_builder_use_val   = is_scalar($nodelogic_graph_builder_value) ? (string) $nodelogic_graph_builder_value : '';
?>
<div class="slider-container" id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>" data-slider-id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>">
    <input
        id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"
        type="text"
        value="<?php echo esc_attr($nodelogic_graph_builder_use_val); ?>"
        class="slider-string"
        data-value="<?php echo esc_attr($nodelogic_graph_builder_use_val); ?>"
    />
</div>
<?php
})($attributes);
