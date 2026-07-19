<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes, string $content): void {
    $nodelogic_graph_builder_wrapper_attributes = get_block_wrapper_attributes();
    ?>
    <div <?php echo $nodelogic_graph_builder_wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
        <?php echo $content; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
    </div>
    <?php
})($attributes, $content);
