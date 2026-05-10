<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_slider_id  = $attributes['sliderId'] ?? 'checkbox_1';
$nodelogic_graph_builder_on_val     = $attributes['checkboxOnValue'] ?? '1';
$nodelogic_graph_builder_off_val    = $attributes['checkboxOffValue'] ?? '0';
$nodelogic_graph_builder_value      = $attributes['value'] ?? '0';
$nodelogic_graph_builder_use_val    = is_scalar($nodelogic_graph_builder_value) ? (string) $nodelogic_graph_builder_value : '0';
?>
<div class="slider-container" id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>" data-slider-id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>">
    <label>
        <input
            id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"
            type="checkbox"
            <?php echo ($nodelogic_graph_builder_use_val === (string) $nodelogic_graph_builder_on_val) ? 'checked' : ''; ?>
            data-checked-value="<?php echo esc_attr($nodelogic_graph_builder_on_val); ?>"
            data-unchecked-value="<?php echo esc_attr($nodelogic_graph_builder_off_val); ?>"
            data-value="<?php echo esc_attr($nodelogic_graph_builder_use_val); ?>"
        />
        <?php echo esc_html($nodelogic_graph_builder_slider_id); ?>
    </label>
</div>
<?php
})($attributes);
