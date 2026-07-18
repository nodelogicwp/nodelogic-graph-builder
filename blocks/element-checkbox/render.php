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
<div class="slider-container slider-container--field" id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>" data-slider-id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>">
    <?php $checkbox_label = isset($attributes['checkboxLabel']) && $attributes['checkboxLabel'] !== '' ? (string) $attributes['checkboxLabel'] : $nodelogic_graph_builder_slider_id; ?>
    <label class="nodelogic-choice-option" for="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>_input">
        <input
            id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>_input"
            type="checkbox"
            class="nodelogic-checkbox-field"
            <?php echo ($nodelogic_graph_builder_use_val === (string) $nodelogic_graph_builder_on_val) ? 'checked' : ''; ?>
            data-checked-value="<?php echo esc_attr($nodelogic_graph_builder_on_val); ?>"
            data-unchecked-value="<?php echo esc_attr($nodelogic_graph_builder_off_val); ?>"
            data-value="<?php echo esc_attr($nodelogic_graph_builder_use_val); ?>"
        />
        <span class="nodelogic-label-text"><?php echo esc_html($checkbox_label); ?></span>
    </label>
</div>
<?php
})($attributes);
