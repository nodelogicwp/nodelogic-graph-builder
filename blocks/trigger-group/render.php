<?php
if (!defined('ABSPATH')) {
    exit;
}

(static function (array $attributes): void {
    $nodelogic_graph_builder_triggers           = $attributes['triggers'] ?? [];
    $nodelogic_graph_builder_wrapper_attributes = get_block_wrapper_attributes();
    ?>
    <div <?php echo $nodelogic_graph_builder_wrapper_attributes; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
        <p>Trigger Group block front-end view.</p>
        <?php if (!empty($nodelogic_graph_builder_triggers) && is_array($nodelogic_graph_builder_triggers)) : ?>
            <?php foreach ($nodelogic_graph_builder_triggers as $nodelogic_graph_builder_trigger) :
                $nodelogic_graph_builder_id    = $nodelogic_graph_builder_trigger['id'] ?? '';
                $nodelogic_graph_builder_label = $nodelogic_graph_builder_trigger['label'] ?? '';
                ?>
                <button id="<?php echo esc_attr($nodelogic_graph_builder_id); ?>">
                    <?php echo esc_html($nodelogic_graph_builder_label); ?>
                </button>
            <?php endforeach; ?>
        <?php endif; ?>
    </div>
    <?php
})($attributes);
