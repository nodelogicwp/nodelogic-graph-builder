<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
$nodelogic_graph_builder_title            = isset($attributes['title']) ? $attributes['title'] : 'Choose option';
$nodelogic_graph_builder_buttons          = isset($attributes['buttons']) && is_array($attributes['buttons']) ? $attributes['buttons'] : array();
$nodelogic_graph_builder_group_id         = isset($attributes['groupId']) ? $attributes['groupId'] : 'button-group';
$nodelogic_graph_builder_btn_bg           = isset($attributes['buttonBackground']) ? $attributes['buttonBackground'] : '#1d4ed8';
$nodelogic_graph_builder_btn_hover        = isset($attributes['buttonHover']) ? $attributes['buttonHover'] : '#2563eb';
$nodelogic_graph_builder_btn_text         = isset($attributes['buttonText']) ? $attributes['buttonText'] : '#ffffff';
$nodelogic_graph_builder_btn_spacing      = isset($attributes['buttonSpacing']) ? (int) $attributes['buttonSpacing'] : 8;
?>
<div class="button-group-block">
    <h3><?php echo esc_html($nodelogic_graph_builder_title); ?></h3>
    <div id="<?php echo esc_attr($nodelogic_graph_builder_group_id); ?>" class="button-group btn_container" style="display:flex; flex-wrap:wrap; justify-content:center; gap: <?php echo esc_attr($nodelogic_graph_builder_btn_spacing); ?>px;">
        <?php foreach ($nodelogic_graph_builder_buttons as $nodelogic_graph_builder_btn) : ?>
            <span
                <?php if (!empty($nodelogic_graph_builder_btn['id'])) : ?>id="<?php echo esc_attr($nodelogic_graph_builder_btn['id']); ?>"<?php endif; ?>
                class="kb-button kt-button button btn_toggle"
                data-value="<?php echo esc_attr(isset($nodelogic_graph_builder_btn['value']) ? $nodelogic_graph_builder_btn['value'] : (isset($nodelogic_graph_builder_btn['multiplier']) ? $nodelogic_graph_builder_btn['multiplier'] : '')); ?>"
                style="flex:1 1 130px; min-width:110px; background:<?php echo esc_attr($nodelogic_graph_builder_btn_bg); ?>; color:<?php echo esc_attr($nodelogic_graph_builder_btn_text); ?>; border-radius:6px; padding:12px 18px; min-height:46px; text-align:center; cursor:pointer; display:inline-flex; justify-content:center; align-items:center; transition:background .15s ease;"
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
