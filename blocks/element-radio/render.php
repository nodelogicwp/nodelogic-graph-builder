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
<div class="slider-container nodelogic-radio-group" id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>" data-slider-id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>">
    <?php foreach ($nodelogic_graph_builder_options as $nodelogic_graph_builder_opt) : ?>
        <?php $opt_id = $nodelogic_graph_builder_slider_id !== '' ? $nodelogic_graph_builder_slider_id . '_' . preg_replace('/[^a-z0-9_-]+/i', '_', (string) $nodelogic_graph_builder_opt['value']) : ''; ?>
        <label class="nodelogic-choice-option"<?php echo $opt_id !== '' ? ' for="' . esc_attr($opt_id) . '"' : ''; ?> >
            <input
                type="radio"
                <?php echo $opt_id !== '' ? 'id="' . esc_attr($opt_id) . '"' : ''; ?>
                name="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"
                value="<?php echo esc_attr($nodelogic_graph_builder_opt['value']); ?>"
                <?php echo ($nodelogic_graph_builder_use_val === (string) $nodelogic_graph_builder_opt['value']) ? 'checked' : ''; ?>
                data-value="<?php echo esc_attr($nodelogic_graph_builder_opt['value']); ?>"
            />
            <span class="nodelogic-label-text"><?php echo esc_html($nodelogic_graph_builder_opt['label']); ?></span>
        </label>
    <?php endforeach; ?>
</div>
<?php
})($attributes);
