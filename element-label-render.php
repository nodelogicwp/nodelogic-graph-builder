<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_slider_id = $attributes['sliderId'] ?? '';
if ( $nodelogic_graph_builder_slider_id === '' ) {
    $nodelogic_graph_builder_slider_id = wp_unique_id( 'label_' );
}
$nodelogic_graph_builder_label     = $attributes['nodelogicLabel'] ?? '';
$nodelogic_graph_builder_label_txt = $nodelogic_graph_builder_label !== '' ? $nodelogic_graph_builder_label : $nodelogic_graph_builder_slider_id;
$padding_top = isset($attributes['paddingTop']) ? (int) $attributes['paddingTop'] : 0;
$padding_right = isset($attributes['paddingRight']) ? (int) $attributes['paddingRight'] : 0;
$padding_bottom = isset($attributes['paddingBottom']) ? (int) $attributes['paddingBottom'] : 0;
$padding_left = isset($attributes['paddingLeft']) ? (int) $attributes['paddingLeft'] : 0;
$margin_top = isset($attributes['marginTop']) ? (int) $attributes['marginTop'] : 0;
$margin_right = isset($attributes['marginRight']) ? (int) $attributes['marginRight'] : 0;
$margin_bottom = isset($attributes['marginBottom']) ? (int) $attributes['marginBottom'] : 0;
$margin_left = isset($attributes['marginLeft']) ? (int) $attributes['marginLeft'] : 0;
$background_mode = isset($attributes['backgroundMode']) ? (string) $attributes['backgroundMode'] : 'default';
$background_color = isset($attributes['backgroundColor']) ? (string) $attributes['backgroundColor'] : '';
$border_width = isset($attributes['borderWidth']) ? (int) $attributes['borderWidth'] : 0;
$border_style = isset($attributes['borderStyle']) ? (string) $attributes['borderStyle'] : 'solid';
$border_color = isset($attributes['borderColor']) ? (string) $attributes['borderColor'] : '';
$border_radius = isset($attributes['borderRadius']) ? (int) $attributes['borderRadius'] : 0;
$width = isset($attributes['width']) ? (string) $attributes['width'] : '';
$height = isset($attributes['height']) ? (string) $attributes['height'] : '';
$min_height = isset($attributes['minHeight']) ? (string) $attributes['minHeight'] : '';
$style_parts = [];
if ($padding_top > 0) { $style_parts[] = 'padding-top:' . $padding_top . 'px'; }
if ($padding_right > 0) { $style_parts[] = 'padding-right:' . $padding_right . 'px'; }
if ($padding_bottom > 0) { $style_parts[] = 'padding-bottom:' . $padding_bottom . 'px'; }
if ($padding_left > 0) { $style_parts[] = 'padding-left:' . $padding_left . 'px'; }
if ($margin_top > 0) { $style_parts[] = 'margin-top:' . $margin_top . 'px'; }
if ($margin_right > 0) { $style_parts[] = 'margin-right:' . $margin_right . 'px'; }
if ($margin_bottom > 0) { $style_parts[] = 'margin-bottom:' . $margin_bottom . 'px'; }
if ($margin_left > 0) { $style_parts[] = 'margin-left:' . $margin_left . 'px'; }
if ($background_mode === 'custom' && $background_color !== '') { $style_parts[] = 'background-color:' . $background_color; }
if ($background_mode === 'default') { $style_parts[] = 'background:linear-gradient(135deg, rgba(14, 116, 144, 0.16), rgba(37, 99, 235, 0.12))'; $style_parts[] = 'border:1px solid rgba(148, 163, 184, 0.22)'; $style_parts[] = 'border-radius:12px'; }
if ($border_width > 0) { $style_parts[] = 'border-width:' . $border_width . 'px'; $style_parts[] = 'border-style:' . $border_style; if ($border_color !== '') { $style_parts[] = 'border-color:' . $border_color; } }
if ($border_radius > 0) { $style_parts[] = 'border-radius:' . $border_radius . 'px'; }
if ($width !== '') { $style_parts[] = 'width:' . $width; }
if ($height !== '') { $style_parts[] = 'height:' . $height; }
if ($min_height !== '') { $style_parts[] = 'min-height:' . $min_height; }
$style_attr = implode(';', array_filter($style_parts));
?>
<span
    id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"
    data-nodelogic-id="<?php echo esc_attr($nodelogic_graph_builder_slider_id); ?>"
    data-nodelogic-label="<?php echo esc_attr($nodelogic_graph_builder_label_txt); ?>"
    class="nodelogic-label"
    <?php echo $style_attr !== '' ? 'style="' . esc_attr($style_attr) . '"' : ''; ?>
><?php echo esc_html($nodelogic_graph_builder_label_txt); ?></span>
<?php
})($attributes);
