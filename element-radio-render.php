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
<div class="slider-container nodelogic-radio-group"<?php echo $has_id ? ' id="' . esc_attr($nodelogic_graph_builder_slider_id) . '" data-slider-id="' . esc_attr($nodelogic_graph_builder_slider_id) . '"' : ''; ?>>
    <?php foreach ($nodelogic_graph_builder_options as $nodelogic_graph_builder_opt) : ?>
        <?php $opt_val = (string) ($nodelogic_graph_builder_opt['value'] ?? ''); $opt_id = $has_id ? esc_attr($nodelogic_graph_builder_slider_id . '_' . preg_replace('/[^a-z0-9_-]+/i', '_', $opt_val)) : ''; ?>
        <label class="nodelogic-choice-option"<?php echo $opt_id !== '' ? ' for="' . $opt_id . '"' : ''; ?> >
            <input
                <?php echo $opt_id !== '' ? 'id="' . $opt_id . '"' : ''; ?>
                type="radio"
                <?php echo $has_id ? 'name="' . esc_attr($nodelogic_graph_builder_slider_id) . '"' : ''; ?>
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
