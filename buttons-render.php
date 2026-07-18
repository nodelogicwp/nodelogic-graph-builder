<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_title            = isset($attributes['title']) ? $attributes['title'] : 'Choose option';
$nodelogic_graph_builder_show_title       = !isset($attributes['showTitle']) || $attributes['showTitle'];
$nodelogic_graph_builder_buttons          = isset($attributes['buttons']) && is_array($attributes['buttons']) ? $attributes['buttons'] : array();
$nodelogic_graph_builder_group_id         = isset($attributes['groupId']) && $attributes['groupId'] !== '' ? $attributes['groupId'] : wp_unique_id( 'btn_group_' );
$nodelogic_graph_builder_btn_bg           = isset($attributes['buttonBackground']) ? $attributes['buttonBackground'] : '#1d4ed8';
$nodelogic_graph_builder_btn_hover        = isset($attributes['buttonHover']) ? $attributes['buttonHover'] : '#2563eb';
$nodelogic_graph_builder_btn_text         = isset($attributes['buttonText']) ? $attributes['buttonText'] : '#ffffff';
$nodelogic_graph_builder_btn_gap          = isset($attributes['buttonGap']) ? (int) $attributes['buttonGap'] : 8;
$nodelogic_graph_builder_btn_layout       = isset($attributes['buttonLayout']) ? (string) $attributes['buttonLayout'] : '';
$nodelogic_graph_builder_btn_justify      = isset($attributes['buttonJustify']) ? (string) $attributes['buttonJustify'] : 'center';
$nodelogic_graph_builder_btn_align        = isset($attributes['buttonAlign']) ? (string) $attributes['buttonAlign'] : 'center';
$nodelogic_graph_builder_container_gap    = isset($attributes['containerGap']) ? (int) $attributes['containerGap'] : 10;
$nodelogic_graph_builder_container_layout = isset($attributes['containerLayout']) ? (string) $attributes['containerLayout'] : '';
$nodelogic_graph_builder_container_justify= isset($attributes['containerJustify']) ? (string) $attributes['containerJustify'] : 'start';
$nodelogic_graph_builder_container_align  = isset($attributes['containerAlign']) ? (string) $attributes['containerAlign'] : 'start';
$padding_top = isset($attributes['paddingTop']) ? (int) $attributes['paddingTop'] : 12;
$padding_right = isset($attributes['paddingRight']) ? (int) $attributes['paddingRight'] : 12;
$padding_bottom = isset($attributes['paddingBottom']) ? (int) $attributes['paddingBottom'] : 12;
$padding_left = isset($attributes['paddingLeft']) ? (int) $attributes['paddingLeft'] : 12;
$margin_top = isset($attributes['marginTop']) ? (int) $attributes['marginTop'] : 0;
$margin_right = isset($attributes['marginRight']) ? (int) $attributes['marginRight'] : 0;
$margin_bottom = isset($attributes['marginBottom']) ? (int) $attributes['marginBottom'] : 14;
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
$wrapper_styles = [];
if ($padding_top > 0) { $wrapper_styles[] = 'padding-top:' . $padding_top . 'px'; }
if ($padding_right > 0) { $wrapper_styles[] = 'padding-right:' . $padding_right . 'px'; }
if ($padding_bottom > 0) { $wrapper_styles[] = 'padding-bottom:' . $padding_bottom . 'px'; }
if ($padding_left > 0) { $wrapper_styles[] = 'padding-left:' . $padding_left . 'px'; }
if ($margin_top >= 0) { $wrapper_styles[] = 'margin-top:' . $margin_top . 'px'; }
if ($margin_right >= 0) { $wrapper_styles[] = 'margin-right:' . $margin_right . 'px'; }
if ($margin_bottom >= 0) { $wrapper_styles[] = 'margin-bottom:' . $margin_bottom . 'px'; }
if ($margin_left >= 0) { $wrapper_styles[] = 'margin-left:' . $margin_left . 'px'; }
if ($background_mode === 'custom' && $background_color !== '') { $wrapper_styles[] = 'background-color:' . $background_color; }
if ($background_mode === 'default') { $wrapper_styles[] = 'background:linear-gradient(135deg, rgba(14, 116, 144, 0.16), rgba(37, 99, 235, 0.12))'; $wrapper_styles[] = 'border:1px solid rgba(148, 163, 184, 0.22)'; $wrapper_styles[] = 'border-radius:12px'; }
if ($border_width > 0) { $wrapper_styles[] = 'border-width:' . $border_width . 'px'; $wrapper_styles[] = 'border-style:' . $border_style; if ($border_color !== '') { $wrapper_styles[] = 'border-color:' . $border_color; } }
if ($border_radius > 0) { $wrapper_styles[] = 'border-radius:' . $border_radius . 'px'; }
if ($width !== '') { $wrapper_styles[] = 'width:' . $width; }
if ($height !== '') { $wrapper_styles[] = 'height:' . $height; }
if ($min_height !== '') { $wrapper_styles[] = 'min-height:' . $min_height; }
$wrapper_style_attr = implode(';', array_filter($wrapper_styles));
?>
<div class="button-group-block nodelogic-button-group"<?php echo $wrapper_style_attr !== '' ? ' style="' . esc_attr($wrapper_style_attr) . '"' : ''; ?>>
    <?php if ($nodelogic_graph_builder_show_title) : ?>
        <h3 style="margin:0 0 10px;width:100%;"><?php echo esc_html($nodelogic_graph_builder_title); ?></h3>
    <?php endif; ?>
    <div id="<?php echo esc_attr($nodelogic_graph_builder_group_id); ?>" class="button-group btn_container" style="display:flex; flex-wrap:wrap; gap:<?php echo (int)$nodelogic_graph_builder_btn_gap; ?>px; justify-content:<?php echo esc_attr($nodelogic_graph_builder_btn_justify); ?>; align-items:<?php echo esc_attr($nodelogic_graph_builder_btn_align); ?>; padding:0; background:transparent; border:none;">
        <?php foreach ($nodelogic_graph_builder_buttons as $nodelogic_graph_builder_btn) : ?>
            <span
                <?php if (!empty($nodelogic_graph_builder_btn['id'])) : ?>id="<?php echo esc_attr($nodelogic_graph_builder_btn['id']); ?>"<?php endif; ?>
                class="kb-button kt-button button btn_toggle"
                data-value="<?php echo esc_attr(isset($nodelogic_graph_builder_btn['value']) ? $nodelogic_graph_builder_btn['value'] : (isset($nodelogic_graph_builder_btn['multiplier']) ? $nodelogic_graph_builder_btn['multiplier'] : '')); ?>"
                style="flex:1 1 130px; min-width:110px; background:<?php echo esc_attr($nodelogic_graph_builder_btn_bg); ?>; color:<?php echo esc_attr($nodelogic_graph_builder_btn_text); ?>; border-radius:999px; padding:10px 16px; min-height:40px; border:1px solid rgba(255, 255, 255, 0.08); box-shadow:0 8px 18px rgba(2, 6, 23, 0.12); text-align:center; cursor:pointer; display:inline-flex; justify-content:center; align-items:center; transition:background .15s ease; font-weight:600;"
                onmouseover="this.style.background='<?php echo esc_attr($nodelogic_graph_builder_btn_hover); ?>';"
                onmouseout="this.style.background='<?php echo esc_attr($nodelogic_graph_builder_btn_bg); ?>';"
            >
                <span class="kt-btn__text"><?php echo esc_html($nodelogic_graph_builder_btn['label']); ?></span>
            </span>
        <?php endforeach; ?>
    </div>
</div>
<?php
})($attributes);
