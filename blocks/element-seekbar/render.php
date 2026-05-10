<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_slider_id    = $attributes['sliderId'] ?? 'seekbar_1';
$nodelogic_graph_builder_min          = $attributes['min'] ?? 1;
$nodelogic_graph_builder_max          = $attributes['max'] ?? 10;
$nodelogic_graph_builder_value        = $attributes['value'] ?? 5;
$nodelogic_graph_builder_track_color  = $attributes['trackProgressColor'] ?? '#2563eb';
$nodelogic_graph_builder_thumb_color  = $attributes['thumbValueColor'] ?? '#111827';
$nodelogic_graph_builder_thumb_bg     = $attributes['thumbBackgroundColor'] ?? $nodelogic_graph_builder_track_color;
$nodelogic_graph_builder_num_val      = is_numeric($nodelogic_graph_builder_value) ? (float) $nodelogic_graph_builder_value : (float) $nodelogic_graph_builder_min;
$nodelogic_graph_builder_progress     = ($nodelogic_graph_builder_max > $nodelogic_graph_builder_min) ? max(0, min(100, round((($nodelogic_graph_builder_num_val - $nodelogic_graph_builder_min) / ($nodelogic_graph_builder_max - $nodelogic_graph_builder_min)) * 100, 2))) : 0;
?>
<div class="slider-container" id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>" data-slider-id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>">
    <div class="slider-track">
        <div class="slider-progress" style="width:<?php echo esc_attr($nodelogic_graph_builder_progress); ?>%; background:<?php echo esc_attr($nodelogic_graph_builder_track_color); ?>;"></div>
    </div>
    <input
        id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"
        data-slider-id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"
        type="range"
        min="<?php echo esc_attr($nodelogic_graph_builder_min); ?>"
        max="<?php echo esc_attr($nodelogic_graph_builder_max); ?>"
        value="<?php echo esc_attr($nodelogic_graph_builder_num_val); ?>"
        class="slider"
        data-value="<?php echo esc_attr($nodelogic_graph_builder_num_val); ?>"
    />
    <div class="slider-thumb-value" style="color:<?php echo esc_attr($nodelogic_graph_builder_thumb_color); ?>; background:<?php echo esc_attr($nodelogic_graph_builder_thumb_bg); ?>;">
        <?php echo esc_html($nodelogic_graph_builder_num_val); ?>
    </div>
</div>
<?php
})($attributes);
