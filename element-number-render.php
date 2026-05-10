<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_slider_id = $attributes['sliderId'] ?? 'number_1';
$nodelogic_graph_builder_min       = $attributes['min'] ?? 0;
$nodelogic_graph_builder_max       = $attributes['max'] ?? 100;
$nodelogic_graph_builder_value     = $attributes['value'] ?? 0;
$nodelogic_graph_builder_num_val   = is_numeric($nodelogic_graph_builder_value) ? (float) $nodelogic_graph_builder_value : 0;
?>
<div class="slider-container" id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>" data-slider-id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>">
    <input
        id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"
        type="number"
        min="<?php echo esc_attr($nodelogic_graph_builder_min); ?>"
        max="<?php echo esc_attr($nodelogic_graph_builder_max); ?>"
        value="<?php echo esc_attr($nodelogic_graph_builder_num_val); ?>"
        class="slider-number"
        data-value="<?php echo esc_attr($nodelogic_graph_builder_num_val); ?>"
    />
</div>
<?php
})($attributes);
