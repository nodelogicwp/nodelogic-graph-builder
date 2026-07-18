<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_slider_id = isset($attributes['sliderId']) && $attributes['sliderId'] !== '' ? $attributes['sliderId'] : '';
$nodelogic_graph_builder_value     = $attributes['value'] ?? '';
$nodelogic_graph_builder_options   = $attributes['options'] ?? [];
$nodelogic_graph_builder_use_val   = is_scalar($nodelogic_graph_builder_value) ? (string) $nodelogic_graph_builder_value : '';
?>
<?php $has_id = $nodelogic_graph_builder_slider_id !== ''; ?>
<div class="slider-container nodelogic-select-group"<?php echo $has_id ? ' id="' . esc_attr($nodelogic_graph_builder_slider_id) . '" data-slider-id="' . esc_attr($nodelogic_graph_builder_slider_id) . '"' : ''; ?> >
    <select<?php echo $has_id ? ' id="' . esc_attr($nodelogic_graph_builder_slider_id) . '_select" name="' . esc_attr($nodelogic_graph_builder_slider_id) . '"' : ''; ?> class="input-control nodelogic-select-field">
        <?php foreach ($nodelogic_graph_builder_options as $nodelogic_graph_builder_opt) : ?>
            <option value="<?php echo esc_attr($nodelogic_graph_builder_opt['value']); ?>" <?php selected($nodelogic_graph_builder_use_val, $nodelogic_graph_builder_opt['value']); ?>>
                <?php echo esc_html($nodelogic_graph_builder_opt['label']); ?>
            </option>
        <?php endforeach; ?>
    </select>
</div>
<?php
})($attributes);
