<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
    $nodelogic_graph_builder_image_url          = $attributes['imageUrl'] ?? '';
    $nodelogic_graph_builder_alt_text           = $attributes['altText'] ?? '';
    $nodelogic_graph_builder_wrapper_attributes = get_block_wrapper_attributes();
    ?>
    <div <?php echo $nodelogic_graph_builder_wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
        <?php if (!empty($nodelogic_graph_builder_image_url)) : ?>
            <img src="<?php echo esc_url($nodelogic_graph_builder_image_url); ?>" alt="<?php echo esc_attr($nodelogic_graph_builder_alt_text); ?>" />
        <?php else : ?>
            <p>Image block front-end view. Please select an image.</p>
        <?php endif; ?>
    </div>
    <?php
})($attributes);
