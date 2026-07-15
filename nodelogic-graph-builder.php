<?php
/**
 * Plugin Name: NodeLogic Graph Builder
 * Description: Visual no-code calculator and workflow builder for Gutenberg blocks with conditional logic, dynamic content, and reusable presets.
 * Plugin URI: https://nodelogicwp.com
 * Version: 1.4.3
 * Author: Volodymyr Diadiunov
 * Author URI: https://nodelogicwp.com
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: nodelogic-graph-builder
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('NODELOGIC_VERSION')) {
    define('NODELOGIC_VERSION', '1.4.3');
}

if (!function_exists('nodelogic_graph_builder_block_comment')) {
    function nodelogic_graph_builder_block_comment(string $block_name, array $attributes = [], string $inner_content = ''): string
    {
        $attr_json = $attributes
            ? ' ' . wp_json_encode($attributes, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            : '';

        if ($inner_content === '') {
            return sprintf('<!-- wp:%s%s /-->', $block_name, $attr_json);
        }

        return sprintf("<!-- wp:%s%s -->\n%s\n<!-- /wp:%s -->", $block_name, $attr_json, $inner_content, $block_name);
    }
}

if (!function_exists('nodelogic_graph_builder_build_calculator_graph_state')) {
    function nodelogic_graph_builder_build_calculator_graph_state(
        string $preset_prefix,
        string $source_a_id,
        string $source_b_id,
        string $result_id,
        string $source_a_name,
        string $source_b_name
    ): array {
        $formula = sprintf(
            '({ %s: { "value": ([%s] * [%s]) } })',
            wp_json_encode($result_id, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            $source_a_id,
            $source_b_id
        );

        return [
            'elements' => [
                [
                    'id' => sprintf('%s-source-a', $preset_prefix),
                    'name' => $source_a_name,
                    'type' => 'element',
                    'x' => 80,
                    'y' => 90,
                    'data' => [
                        'selectedElement' => $source_a_id,
                    ],
                    'valueType' => 'number',
                ],
                [
                    'id' => sprintf('%s-source-b', $preset_prefix),
                    'name' => $source_b_name,
                    'type' => 'element',
                    'x' => 80,
                    'y' => 230,
                    'data' => [
                        'selectedElement' => $source_b_id,
                    ],
                    'valueType' => 'number',
                ],
                [
                    'id' => sprintf('%s-calc', $preset_prefix),
                    'name' => 'Multiply',
                    'type' => 'calculation',
                    'x' => 340,
                    'y' => 140,
                    'data' => [
                        'operation' => '*',
                        'inputCount' => 2,
                        'inputValues' => [0, 0],
                        'inputOperations' => [],
                    ],
                    'valueType' => 'number',
                ],
                [
                    'id' => sprintf('%s-output', $preset_prefix),
                    'name' => 'Result',
                    'type' => 'output',
                    'x' => 600,
                    'y' => 160,
                    'data' => [
                        'selectedElement' => $result_id,
                        'executeOnLoad' => true,
                        'useIdInput' => false,
                        'outputs' => [],
                    ],
                    'valueType' => 'number',
                ],
            ],
            'connections' => [
                [
                    'id' => sprintf('%s-conn-a', $preset_prefix),
                    'fromId' => sprintf('%s-source-a', $preset_prefix),
                    'fromOutput' => 'output0',
                    'toId' => sprintf('%s-calc', $preset_prefix),
                    'toInput' => 'input0',
                    'operation' => '+',
                    'valueType' => 'number',
                    'connectionType' => 'normal',
                ],
                [
                    'id' => sprintf('%s-conn-b', $preset_prefix),
                    'fromId' => sprintf('%s-source-b', $preset_prefix),
                    'fromOutput' => 'output0',
                    'toId' => sprintf('%s-calc', $preset_prefix),
                    'toInput' => 'input1',
                    'operation' => '+',
                    'valueType' => 'number',
                    'connectionType' => 'normal',
                ],
                [
                    'id' => sprintf('%s-conn-result', $preset_prefix),
                    'fromId' => sprintf('%s-calc', $preset_prefix),
                    'fromOutput' => 'output0',
                    'toId' => sprintf('%s-output', $preset_prefix),
                    'toInput' => 'input0',
                    'operation' => '+',
                    'valueType' => 'number',
                    'connectionType' => 'normal',
                ],
            ],
            'formula' => $formula,
            'updatedAt' => 0,
        ];
    }
}

if (!function_exists('nodelogic_graph_builder_build_preset_pattern_content')) {
    function nodelogic_graph_builder_build_preset_pattern_content(array $config): string
    {
        $container_attrs = [
            'rows' => isset($config['rows']) ? (int) $config['rows'] : 4,
            'columns' => isset($config['columns']) ? (int) $config['columns'] : 1,
            'presetId' => isset($config['presetId']) ? (string) $config['presetId'] : 'custom',
        ];

        $children = array_map(
            static function (array $child): string {
                return nodelogic_graph_builder_block_comment(
                    (string) ($child['name'] ?? ''),
                    is_array($child['attrs'] ?? null) ? $child['attrs'] : []
                );
            },
            is_array($config['children'] ?? null) ? $config['children'] : []
        );

        $container = nodelogic_graph_builder_block_comment(
            'custom/nodelogic-preset-container',
            $container_attrs,
            implode("\n", $children)
        );

        $logic_attrs = [
            'graphState' => $config['graphState'] ?? [],
            'formula' => $config['formula'] ?? '',
        ];

        $logic = nodelogic_graph_builder_block_comment('custom/nodelogic-logic', $logic_attrs);

        return $container . "\n" . $logic;
    }
}

add_action('init', function () {
    register_block_type(__DIR__ . '/buttons-block.json');
    register_block_type(__DIR__ . '/logic-block.json');
    register_block_type(__DIR__ . '/preset-container-block.json');
    register_block_type(__DIR__ . '/image-block.json');
    register_block_type(__DIR__ . '/array-list-block.json');
    register_block_type(__DIR__ . '/blocks/element-seekbar');
    register_block_type(__DIR__ . '/blocks/element-number');
    register_block_type(__DIR__ . '/blocks/element-text');
    register_block_type(__DIR__ . '/blocks/element-radio');
    register_block_type(__DIR__ . '/blocks/element-select');
    register_block_type(__DIR__ . '/blocks/element-checkbox');
    register_block_type(__DIR__ . '/blocks/element-label');
    register_block_type(__DIR__ . '/trigger-group-block.json');
});

add_action('init', function () {
    if (function_exists('register_block_pattern_category')) {
        register_block_pattern_category(
            'nodelogic-presets',
            [
                'label' => __('NodeLogic Presets', 'nodelogic-graph-builder'),
            ]
        );
    }

    register_block_pattern(
        'nodelogic-graph-builder/price-calculator-starter',
        [
            'title' => __('Price Calculator Starter', 'nodelogic-graph-builder'),
            'description' => __('A starter preset with unit price, quantity, and a calculated total output.', 'nodelogic-graph-builder'),
            'categories' => ['nodelogic-presets'],
            'content' => nodelogic_graph_builder_build_preset_pattern_content([
                'presetId' => 'price-calculator',
                'rows' => 4,
                'columns' => 1,
                'children' => [
                    [
                        'name' => 'custom/element-label',
                        'attrs' => [
                            'sliderId' => 'nodelogic_price_title',
                            'nodelogicLabel' => __('Price Calculator', 'nodelogic-graph-builder'),
                        ],
                    ],
                    [
                        'name' => 'custom/element-number',
                        'attrs' => [
                            'sliderId' => 'nodelogic_price_base',
                            'min' => 0,
                            'max' => 9999,
                            'value' => 29,
                        ],
                    ],
                    [
                        'name' => 'custom/element-number',
                        'attrs' => [
                            'sliderId' => 'nodelogic_price_qty',
                            'min' => 1,
                            'max' => 100,
                            'value' => 1,
                        ],
                    ],
                    [
                        'name' => 'custom/element-number',
                        'attrs' => [
                            'sliderId' => 'nodelogic_price_total',
                            'min' => 0,
                            'max' => 999999,
                            'value' => 29,
                        ],
                    ],
                ],
                'graphState' => nodelogic_graph_builder_build_calculator_graph_state(
                    'price-calculator',
                    'nodelogic_price_base',
                    'nodelogic_price_qty',
                    'nodelogic_price_total',
                    __('Unit Price', 'nodelogic-graph-builder'),
                    __('Quantity', 'nodelogic-graph-builder')
                ),
                'formula' => sprintf(
                    '({ %s: { "value": ([%s] * [%s]) } })',
                    wp_json_encode('nodelogic_price_total', JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                    'nodelogic_price_base',
                    'nodelogic_price_qty'
                ),
            ]),
        ]
    );

    register_block_pattern(
        'nodelogic-graph-builder/estimate-calculator-starter',
        [
            'title' => __('Estimate Calculator Starter', 'nodelogic-graph-builder'),
            'description' => __('A starter preset using a seekbar, a rate input, and a calculated estimate output.', 'nodelogic-graph-builder'),
            'categories' => ['nodelogic-presets'],
            'content' => nodelogic_graph_builder_build_preset_pattern_content([
                'presetId' => 'estimate-calculator',
                'rows' => 4,
                'columns' => 1,
                'children' => [
                    [
                        'name' => 'custom/element-label',
                        'attrs' => [
                            'sliderId' => 'nodelogic_estimate_title',
                            'nodelogicLabel' => __('Estimate Calculator', 'nodelogic-graph-builder'),
                        ],
                    ],
                    [
                        'name' => 'custom/element-seekbar',
                        'attrs' => [
                            'sliderId' => 'nodelogic_estimate_hours',
                            'min' => 1,
                            'max' => 12,
                            'value' => 3,
                            'trackProgressColor' => '#f97316',
                            'thumbValueColor' => '#111827',
                            'thumbBackgroundColor' => '#fb923c',
                        ],
                    ],
                    [
                        'name' => 'custom/element-number',
                        'attrs' => [
                            'sliderId' => 'nodelogic_estimate_rate',
                            'min' => 0,
                            'max' => 9999,
                            'value' => 120,
                        ],
                    ],
                    [
                        'name' => 'custom/element-number',
                        'attrs' => [
                            'sliderId' => 'nodelogic_estimate_total',
                            'min' => 0,
                            'max' => 999999,
                            'value' => 360,
                        ],
                    ],
                ],
                'graphState' => nodelogic_graph_builder_build_calculator_graph_state(
                    'estimate-calculator',
                    'nodelogic_estimate_hours',
                    'nodelogic_estimate_rate',
                    'nodelogic_estimate_total',
                    __('Hours', 'nodelogic-graph-builder'),
                    __('Rate', 'nodelogic-graph-builder')
                ),
                'formula' => sprintf(
                    '({ %s: { "value": ([%s] * [%s]) } })',
                    wp_json_encode('nodelogic_estimate_total', JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                    'nodelogic_estimate_hours',
                    'nodelogic_estimate_rate'
                ),
            ]),
        ]
    );
}, 20);

add_filter('block_categories_all', function ($categories, $blockEditorContext) {
    unset($blockEditorContext);

    foreach ($categories as $category) {
        if (($category['slug'] ?? '') === 'advanced-blocks-calculator') {
            return $categories;
        }
    }

    $categories[] = [
        'slug' => 'advanced-blocks-calculator',
        'title' => __('NodeLogic Graph Builder', 'nodelogic-graph-builder'),
        'icon' => 'calculator',
    ];

    return $categories;
}, 10, 2);

// Editor-only styles for block preview.
add_action('enqueue_block_assets', function () {
    wp_enqueue_style(
        'slider-block-frontend-style',
        plugins_url('style.css', __FILE__),
        [],
        filemtime(__DIR__ . '/style.css')
    );
    
});

// Frontend-only runtime logic engine.
add_action('wp_enqueue_scripts', function () {
    wp_enqueue_script(
        'slider-block-frontend',
        plugins_url('frontend.js', __FILE__),
        [],
        filemtime(__DIR__ . '/frontend.js'),
        true
    );

    wp_enqueue_style(
        'slider-block-frontend-style',
        plugins_url('style.css', __FILE__),
        [],
        filemtime(__DIR__ . '/style.css')
    );
    
});
