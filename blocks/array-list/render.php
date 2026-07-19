<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
    $nodelogic_graph_builder_items              = $attributes['items'] ?? [];
    $nodelogic_graph_builder_wrapper_attributes = get_block_wrapper_attributes();
    ?>
    <div <?php echo $nodelogic_graph_builder_wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
        <p>Array List block front-end view.</p>
        <?php if (!empty($nodelogic_graph_builder_items) && is_array($nodelogic_graph_builder_items)) : ?>
            <ul>
                <?php foreach ($nodelogic_graph_builder_items as $nodelogic_graph_builder_item) : ?>
                    <li><?php echo esc_html($nodelogic_graph_builder_item); ?></li>
                <?php endforeach; ?>
            </ul>
        <?php endif; ?>
    </div>
    <?php
})($attributes);
