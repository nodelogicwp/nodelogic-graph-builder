<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
    $nodelogic_graph_builder_heading            = $attributes['heading'] ?? 'Choose an option';
    $nodelogic_graph_builder_wrapper_attributes = get_block_wrapper_attributes();
    ?>
    <div <?php echo $nodelogic_graph_builder_wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
        <?php if (!empty($nodelogic_graph_builder_heading)) : ?>
            <h3><?php echo esc_html($nodelogic_graph_builder_heading); ?></h3>
        <?php endif; ?>
        <!-- Your button group HTML will go here -->
        <p>Button Group block front-end view.</p>
    </div>
    <?php
})($attributes);
