<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_slider_id = $attributes['sliderId'] ?? 'radio_1';
$nodelogic_graph_builder_value     = $attributes['value'] ?? '';
$nodelogic_graph_builder_options   = $attributes['options'] ?? [];
$nodelogic_graph_builder_use_val   = is_scalar($nodelogic_graph_builder_value) ? (string) $nodelogic_graph_builder_value : '';
?>
<div class="slider-container" id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>" data-slider-id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>">
    <?php foreach ($nodelogic_graph_builder_options as $nodelogic_graph_builder_opt) : ?>
        <label style="margin-right:10px;">
            <input
                type="radio"
                name="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"
                value="<?php echo esc_attr($nodelogic_graph_builder_opt['value']); ?>"
                <?php echo ($nodelogic_graph_builder_use_val === (string) $nodelogic_graph_builder_opt['value']) ? 'checked' : ''; ?>
                data-value="<?php echo esc_attr($nodelogic_graph_builder_opt['value']); ?>"
            />
            <?php echo esc_html($nodelogic_graph_builder_opt['label']); ?>
        </label>
    <?php endforeach; ?>
</div>
<?php
})($attributes);
