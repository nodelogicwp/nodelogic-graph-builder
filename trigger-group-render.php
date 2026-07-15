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
    $btn_spacing       = intval($attributes['buttonSpacing'] ?? 8);
    ?>
<div class="nodelogic-trigger-group"
     data-nodelogic-trigger-group="1"
     data-button-bg="<?php echo esc_attr($btn_bg); ?>"
     data-button-hover="<?php echo esc_attr($btn_hover); ?>"
>
    <?php if ($show_title && $title): ?>
    <h3 style="margin-bottom:10px;color:#1e293b;font-size:15px;font-weight:700;"><?php echo esc_html($title); ?></h3>
    <?php endif; ?>
    <div class="nodelogic-trigger-group__buttons" style="display:flex;flex-wrap:wrap;gap:<?php echo esc_attr($btn_spacing); ?>px;justify-content:center;padding:12px;border-radius:16px;background:rgba(15,23,42,0.82);border:1px solid rgba(148,163,184,0.18);">
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
