<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_slider_id    = $attributes['sliderId'] ?? '';
if ( $nodelogic_graph_builder_slider_id === '' ) {
    $nodelogic_graph_builder_slider_id = wp_unique_id( 'seekbar_' );
}
$nodelogic_graph_builder_min          = $attributes['min'] ?? 1;
$nodelogic_graph_builder_max          = $attributes['max'] ?? 10;
$nodelogic_graph_builder_value        = $attributes['value'] ?? 5;
$nodelogic_graph_builder_track_bg     = $attributes['trackBackgroundColor'] ?? '#ffffff';
$nodelogic_graph_builder_track_color  = $attributes['trackProgressColor'] ?? '#2563eb';
$nodelogic_graph_builder_thumb_color  = $attributes['thumbValueColor'] ?? '#111827';
$nodelogic_graph_builder_thumb_bg     = $attributes['thumbBackgroundColor'] ?? $nodelogic_graph_builder_track_color;
$nodelogic_graph_builder_num_val      = is_numeric($nodelogic_graph_builder_value) ? (float) $nodelogic_graph_builder_value : (float) $nodelogic_graph_builder_min;
$nodelogic_graph_builder_progress     = ($nodelogic_graph_builder_max > $nodelogic_graph_builder_min) ? max(0, min(100, round((($nodelogic_graph_builder_num_val - $nodelogic_graph_builder_min) / ($nodelogic_graph_builder_max - $nodelogic_graph_builder_min)) * 100, 2))) : 0;

$padding_top = isset($attributes['paddingTop']) ? (int) $attributes['paddingTop'] : 0;
$padding_right = isset($attributes['paddingRight']) ? (int) $attributes['paddingRight'] : 0;
$padding_bottom = isset($attributes['paddingBottom']) ? (int) $attributes['paddingBottom'] : 0;
$padding_left = isset($attributes['paddingLeft']) ? (int) $attributes['paddingLeft'] : 0;
$margin_top = isset($attributes['marginTop']) ? (int) $attributes['marginTop'] : 0;
$margin_right = isset($attributes['marginRight']) ? (int) $attributes['marginRight'] : 0;
$margin_bottom = isset($attributes['marginBottom']) ? (int) $attributes['marginBottom'] : 14;
$margin_left = isset($attributes['marginLeft']) ? (int) $attributes['marginLeft'] : 0;

$style_parts = [];
if ($padding_top > 0) { $style_parts[] = 'padding-top:' . $padding_top . 'px'; }
if ($padding_right > 0) { $style_parts[] = 'padding-right:' . $padding_right . 'px'; }
if ($padding_bottom > 0) { $style_parts[] = 'padding-bottom:' . $padding_bottom . 'px'; }
if ($padding_left > 0) { $style_parts[] = 'padding-left:' . $padding_left . 'px'; }
if ($margin_top >= 0) { $style_parts[] = 'margin-top:' . $margin_top . 'px'; }
if ($margin_right >= 0) { $style_parts[] = 'margin-right:' . $margin_right . 'px'; }
if ($margin_bottom >= 0) { $style_parts[] = 'margin-bottom:' . $margin_bottom . 'px'; }
if ($margin_left >= 0) { $style_parts[] = 'margin-left:' . $margin_left . 'px'; }
$style_attr = implode(';', array_filter($style_parts));
?>
<div class="slider-container slider-container--seekbar" id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>" data-slider-id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"<?php echo $style_attr !== '' ? ' style="' . esc_attr($style_attr) . '"' : ''; ?>>
    <div class="slider-track" style="background:<?php echo esc_attr($nodelogic_graph_builder_track_bg); ?>;">
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
