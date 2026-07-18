<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
    $items             = is_array($attributes['items'] ?? null) ? $attributes['items'] : [];
    $title             = $attributes['title'] ?? '';
    $show_title        = !empty($attributes['showTitle']);
    $btn_bg            = $attributes['buttonBackground'] ?? '#7c3aed';
    $btn_hover         = $attributes['buttonHover'] ?? '#6d28d9';
    $btn_text          = $attributes['buttonText'] ?? '#ffffff';
    $btn_gap           = intval($attributes['buttonGap'] ?? 8);
    $btn_layout        = $attributes['buttonLayout'] ?? '';
    $btn_justify       = $attributes['buttonJustify'] ?? 'center';
    $btn_align         = $attributes['buttonAlign'] ?? 'center';
    $container_gap     = intval($attributes['containerGap'] ?? 10);
    $container_layout  = $attributes['containerLayout'] ?? '';
    $container_justify = $attributes['containerJustify'] ?? 'start';
    $container_align   = $attributes['containerAlign'] ?? 'start';
    
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
    
    $buttons_style_parts = ['display:flex', 'flex-wrap:wrap'];
    $buttons_style_parts[] = 'gap:' . $btn_gap . 'px';
    if ($btn_layout !== '') {
        $buttons_style_parts[] = 'grid-template-columns:' . esc_attr($btn_layout);
    }
    $buttons_style_parts[] = 'justify-content:' . $btn_justify;
    $buttons_style_parts[] = 'align-items:' . $btn_align;
    $buttons_style_parts[] = 'padding:0';
    $buttons_style_parts[] = 'background:transparent';
    $buttons_style_parts[] = 'border:none';
    $buttons_style_attr = implode(';', $buttons_style_parts);
    ?>
<div class="nodelogic-trigger-group"
     data-nodelogic-trigger-group="1"
     data-button-bg="<?php echo esc_attr($btn_bg); ?>"
     data-button-hover="<?php echo esc_attr($btn_hover); ?>"
     <?php echo $wrapper_style_attr !== '' ? 'style="' . esc_attr($wrapper_style_attr) . '"' : ''; ?>
>
    <?php if ($show_title && $title): ?>
    <h3 style="margin:0 0 10px;color:#1e293b;font-size:15px;font-weight:700;width:100%;"><?php echo esc_html($title); ?></h3>
    <?php endif; ?>
    <div class="nodelogic-trigger-group__buttons" style="<?php echo esc_attr($buttons_style_attr); ?>">
        <?php foreach ($items as $item):
            $item_id    = isset($item['id']) ? (string) $item['id'] : '';
            $item_label = isset($item['label']) ? (string) $item['label'] : $item_id;
            if (!$item_id) continue;
            ?>
        <button
            id="<?php echo esc_attr($item_id); ?>"
            data-nodelogic-trigger-id="<?php echo esc_attr($item_id); ?>"
            type="button"
            class="nodelogic-trigger-btn"
            style="display:inline-flex;align-items:center;justify-content:center;background:<?php echo esc_attr($btn_bg); ?>;color:<?php echo esc_attr($btn_text); ?>;border-radius:999px;padding:10px 16px;min-height:40px;border:1px solid rgba(255,255,255,0.12);cursor:pointer;flex:1 1 120px;min-width:110px;text-align:center;font-weight:600;font-size:14px;transition:background .15s ease;"
            onmouseenter="this.style.background='<?php echo esc_attr($btn_hover); ?>'"
            onmouseleave="this.style.background='<?php echo esc_attr($btn_bg); ?>'"
        ><?php echo esc_html($item_label); ?></button>
        <?php endforeach; ?>
    </div>
</div>
    <?php
})($attributes);
