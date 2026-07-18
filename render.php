<?php
if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('nodelogic_unwrap_legacy_container_markup')) {
    /**
     * Remove saved editor wrapper divs so inner blocks become direct grid children.
     */
    function nodelogic_unwrap_legacy_container_markup(string $content): string
    {
        // ... (This function remains unchanged) ...
        $current = $content;

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $trimmed = ltrim($current);
            if ($trimmed === '' || strpos($trimmed, '<div') !== 0) {
                break;
            }

            $open_end = strpos($trimmed, '>');
            if ($open_end === false) {
                break;
            }

            $opening_tag = substr($trimmed, 0, $open_end + 1);
            $is_saved_wrapper = strpos($opening_tag, 'data-nodelogic-container="1"') !== false
                || strpos($opening_tag, 'wp-block-custom-nodelogic-preset-container') !== false
                || (
                    strpos($opening_tag, 'nodelogic-preset-container__grid') !== false
                    && strpos($opening_tag, 'display:grid') !== false
                );

            if (!$is_saved_wrapper) {
                break;
            }

            $inner = substr($trimmed, $open_end + 1);
            $depth = 1;
            $pos = 0;
            $len = strlen($inner);
            $matched_close = null;

            while ($pos < $len && $depth > 0) {
                $next_open = stripos($inner, '<div', $pos);
                $next_close = stripos($inner, '</div>', $pos);

                if ($next_close === false) {
                    break 2;
                }

                if ($next_open !== false && $next_open < $next_close) {
                    $depth++;
                    $pos = $next_open + 4;
                    continue;
                }

                $depth--;
                if ($depth === 0) {
                    $matched_close = $next_close;
                    break;
                }
                $pos = $next_close + 6;
            }

            if ($matched_close === null) {
                break;
            }

            $inside = substr($inner, 0, $matched_close);
            $after = substr($inner, $matched_close + 6);
            if (trim($after) !== '') {
                break;
            }

            $current = $inside;
        }

        return $current;
    }
}

if (!function_exists('nodelogic_normalize_grid_template')) {
    /**
     * Converts percentage-based grid templates to fr units.
     */
    function nodelogic_normalize_grid_template(string $template): string
    {
        $trimmed = trim($template);

        if (
            $trimmed === '' ||
            strpos($trimmed, 'fr') !== false ||
            strpos($trimmed, 'repeat') !== false ||
            strpos($trimmed, 'auto') !== false ||
            strpos($trimmed, 'calc') !== false
        ) {
            return $trimmed;
        }

        $parts = preg_split('/\s+/', $trimmed, -1, PREG_SPLIT_NO_EMPTY);
        if (empty($parts)) {
            return $trimmed;
        }

        $all_are_percentages = true;
        foreach ($parts as $part) {
            if (preg_match('/^(\d+(?:\.\d+)?)%$/', $part) !== 1) {
                $all_are_percentages = false;
                break;
            }
        }

        if (!$all_are_percentages) {
            return $trimmed;
        }

        if (count(array_unique($parts)) === 1 && count($parts) > 1) {
            return sprintf('repeat(%d, 1fr)', count($parts));
        }

        $fr_values = array_map(function ($part) {
            return rtrim($part, '%') . 'fr';
        }, $parts);

        return implode(' ', $fr_values);
    }
}


(static function (array $attributes, string $content): void {
    $rows = isset($attributes['rows']) ? (int) $attributes['rows'] : 4;
    $columns = isset($attributes['columns']) ? (int) $attributes['columns'] : 1;
    $preset_id = isset($attributes['presetId']) ? (string) $attributes['presetId'] : 'custom';
    $container_id = isset($attributes['containerId']) ? (string) $attributes['containerId'] : 'nodelogic-container';
    $column_template = isset($attributes['columnTemplate']) ? (string) $attributes['columnTemplate'] : '';
    $row_template = isset($attributes['rowTemplate']) ? (string) $attributes['rowTemplate'] : '';
    $gap_columns = isset($attributes['gapColumns']) ? (int) $attributes['gapColumns'] : 16;
    $gap_rows = isset($attributes['gapRows']) ? (int) $attributes['gapRows'] : 16;
    $justify_items = isset($attributes['justifyItems']) ? (string) $attributes['justifyItems'] : 'stretch';
    $align_items = isset($attributes['alignItems']) ? (string) $attributes['alignItems'] : 'stretch';
    $justify_content = isset($attributes['justifyContent']) ? (string) $attributes['justifyContent'] : 'start';
    $align_content = isset($attributes['alignContent']) ? (string) $attributes['alignContent'] : 'start';
    $height_mode = isset($attributes['heightMode']) ? (string) $attributes['heightMode'] : 'auto';
    $height_px = isset($attributes['heightPx']) ? (int) $attributes['heightPx'] : 0;
    $padding_top = isset($attributes['paddingTop']) ? (int) $attributes['paddingTop'] : (isset($attributes['padding']) ? (int) $attributes['padding'] : 18);
    $padding_right = isset($attributes['paddingRight']) ? (int) $attributes['paddingRight'] : (isset($attributes['padding']) ? (int) $attributes['padding'] : 18);
    $padding_bottom = isset($attributes['paddingBottom']) ? (int) $attributes['paddingBottom'] : (isset($attributes['padding']) ? (int) $attributes['padding'] : 18);
    $padding_left = isset($attributes['paddingLeft']) ? (int) $attributes['paddingLeft'] : (isset($attributes['padding']) ? (int) $attributes['padding'] : 18);
    $margin_top = isset($attributes['marginTop']) ? (int) $attributes['marginTop'] : (isset($attributes['margin']) ? (int) $attributes['margin'] : 0);
    $margin_right = isset($attributes['marginRight']) ? (int) $attributes['marginRight'] : (isset($attributes['margin']) ? (int) $attributes['margin'] : 0);
    $margin_bottom = isset($attributes['marginBottom']) ? (int) $attributes['marginBottom'] : (isset($attributes['margin']) ? (int) $attributes['margin'] : 0);
    $margin_left = isset($attributes['marginLeft']) ? (int) $attributes['marginLeft'] : (isset($attributes['margin']) ? (int) $attributes['margin'] : 0);
    $background_enabled = !empty($attributes['backgroundEnabled']);
    $background_mode = isset($attributes['backgroundMode']) ? (string) $attributes['backgroundMode'] : ($background_enabled ? 'custom' : 'default');
    $background_color = isset($attributes['backgroundColor']) ? (string) $attributes['backgroundColor'] : '';
    $border_width = isset($attributes['borderWidth']) ? (int) $attributes['borderWidth'] : 0;
    $border_style = isset($attributes['borderStyle']) ? (string) $attributes['borderStyle'] : 'solid';
    $border_color = isset($attributes['borderColor']) ? (string) $attributes['borderColor'] : '';
    $border_radius = isset($attributes['borderRadius']) ? (int) $attributes['borderRadius'] : 0;
    $width = isset($attributes['width']) ? (string) $attributes['width'] : '';
    $height = isset($attributes['height']) ? (string) $attributes['height'] : '';
    $min_height = isset($attributes['minHeight']) ? (string) $attributes['minHeight'] : '';

    $rows = max(1, min(6, $rows));
    $columns = max(1, min(6, $columns));

    // --- THIS IS THE CHANGED PART ---
    $columns_css = $column_template !== '' ? nodelogic_normalize_grid_template($column_template) : sprintf('repeat(%d, minmax(0, 1fr))', $columns);
    $rows_css = $row_template !== '' ? nodelogic_normalize_grid_template($row_template) : sprintf('repeat(%d, minmax(0, auto))', $rows);
    // --- END OF CHANGE ---

    $grid_style = sprintf(
        'display:grid;grid-template-columns:%s;grid-template-rows:%s;gap:%spx %spx;justify-items:%s;align-items:%s;justify-content:%s;align-content:%s%s',
        $columns_css,
        $rows_css,
        $gap_rows,
        $gap_columns,
        $justify_items,
        $align_items,
        $justify_content,
        $align_content,
        $height_mode === 'fixed' ? ';height:' . $height_px . 'px' : ''
    );
    $box_styles = [];
    if ($padding_top > 0 || $padding_right > 0 || $padding_bottom > 0 || $padding_left > 0) {
        if ($padding_top > 0) { $box_styles[] = 'padding-top:' . $padding_top . 'px'; }
        if ($padding_right > 0) { $box_styles[] = 'padding-right:' . $padding_right . 'px'; }
        if ($padding_bottom > 0) { $box_styles[] = 'padding-bottom:' . $padding_bottom . 'px'; }
        if ($padding_left > 0) { $box_styles[] = 'padding-left:' . $padding_left . 'px'; }
    }
    if ($margin_top > 0 || $margin_right > 0 || $margin_bottom > 0 || $margin_left > 0) {
        if ($margin_top > 0) { $box_styles[] = 'margin-top:' . $margin_top . 'px'; }
        if ($margin_right > 0) { $box_styles[] = 'margin-right:' . $margin_right . 'px'; }
        if ($margin_bottom > 0) { $box_styles[] = 'margin-bottom:' . $margin_bottom . 'px'; }
        if ($margin_left > 0) { $box_styles[] = 'margin-left:' . $margin_left . 'px'; }
    }
    if ($background_mode === 'custom' && $background_color !== '') { $box_styles[] = 'background-color:' . $background_color; }
    if ($background_mode === 'default') { $box_styles[] = 'background:linear-gradient(135deg, rgba(14, 116, 144, 0.16), rgba(37, 99, 235, 0.12))'; $box_styles[] = 'border:1px solid rgba(148, 163, 184, 0.22)'; $box_styles[] = 'border-radius:16px'; }
    if ($border_width > 0) { $box_styles[] = 'border-width:' . $border_width . 'px'; $box_styles[] = 'border-style:' . $border_style; if ($border_color !== '') { $box_styles[] = 'border-color:' . $border_color; } }
    if ($border_radius > 0) { $box_styles[] = 'border-radius:' . $border_radius . 'px'; }
    if ($width !== '') { $box_styles[] = 'width:' . $width; }
    if ($height !== '') { $box_styles[] = 'height:' . $height; }
    if ($min_height !== '') { $box_styles[] = 'min-height:' . $min_height; }
    $style_attr = implode(';', array_filter($box_styles));
    if ($style_attr !== '' && $grid_style !== '') { $style_attr .= ';'; }
    $style_attr .= $grid_style;
    $inner_content = nodelogic_unwrap_legacy_container_markup($content ?? '');
    $rendered_content = do_blocks($inner_content);
    if (trim($rendered_content) === '' && trim($inner_content) !== '') {
        $rendered_content = $inner_content;
    }
    ?>
    <div class="nodelogic-preset-container nodelogic-preset-container__grid" style="<?php echo esc_attr($style_attr); ?>" data-preset-id="<?php echo esc_attr($preset_id); ?>" data-nodelogic-id="<?php echo esc_attr($container_id); ?>" data-nodelogic-container="1">
        <?php
        // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- InnerBlocks content is rendered by WordPress and contains trusted block markup.
        echo $rendered_content;
        ?>
    </div>
    <?php
})($attributes, $content ?? '');
