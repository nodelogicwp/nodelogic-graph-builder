<?php
/**
 * Plugin Name: NodeLogic Graph Builder
 * Description: Visual no-code calculator and workflow builder for Gutenberg blocks with conditional logic, dynamic content, and reusable presets.
 * Plugin URI: https://nodelogicwp.com
 * Version: 1.6.1
 * Author: Volodymyr Diadiunov
 * Author URI: https://nodelogicwp.com
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: nodelogic-graph-builder
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('NODELOGIC_VERSION')) {
    define('NODELOGIC_VERSION', '1.6.1');
}

/**
 * Return the persisted logic for a rendered block/widget.
 *
 * The DOM is deliberately not used as the authority for the runtime formula:
 * it is user-editable in DevTools. This endpoint reads the saved post data.
 */
if (!function_exists('nodelogic_find_gutenberg_logic_block')) {
    function nodelogic_find_gutenberg_logic_block(array $blocks, string $editor_id): ?array
    {
        foreach ($blocks as $block) {
            if (($block['blockName'] ?? '') === 'custom/nodelogic-logic') {
                $attributes = is_array($block['attrs'] ?? null) ? $block['attrs'] : [];
                if ((string) ($attributes['editorId'] ?? '') === $editor_id) {
                    return [
                        'formula' => is_string($attributes['formula'] ?? null) ? $attributes['formula'] : '',
                        'outputConfigs' => is_array($attributes['outputConfigs'] ?? null) ? $attributes['outputConfigs'] : [],
                    ];
                }
            }

            $inner = is_array($block['innerBlocks'] ?? null) ? $block['innerBlocks'] : [];
            $found = nodelogic_find_gutenberg_logic_block($inner, $editor_id);
            if ($found !== null) {
                return $found;
            }
        }

        return null;
    }
}

if (!function_exists('nodelogic_find_elementor_logic_widget')) {
    function nodelogic_find_elementor_logic_widget($nodes, string $editor_id): ?array
    {
        if (!is_array($nodes)) {
            return null;
        }

        foreach ($nodes as $node) {
            if (!is_array($node)) {
                continue;
            }

            if (($node['widgetType'] ?? '') === 'nodelogic_logic_widget') {
                $settings = is_array($node['settings'] ?? null) ? $node['settings'] : [];
                if ((string) ($settings['editor_id'] ?? '') === $editor_id) {
                    $output_configs = $settings['output_configs'] ?? [];
                    if (is_string($output_configs)) {
                        $output_configs = json_decode($output_configs, true);
                    }
                    return [
                        'formula' => is_string($settings['formula'] ?? null) ? $settings['formula'] : '',
                        'outputConfigs' => is_array($output_configs) ? $output_configs : [],
                    ];
                }
            }

            $found = nodelogic_find_elementor_logic_widget($node['elements'] ?? [], $editor_id);
            if ($found !== null) {
                return $found;
            }
        }

        return null;
    }
}

if (!function_exists('nodelogic_compiled_graphs')) {
    function nodelogic_compiled_graphs(int $post_id): array
    {
        $stored = get_post_meta($post_id, '_nodelogic_compiled_graphs', true);
        return is_array($stored) ? $stored : [];
    }
}

if (!function_exists('nodelogic_compiled_graph_registry')) {
    function nodelogic_compiled_graph_registry(): array
    {
        $stored = get_option('_nodelogic_compiled_graph_registry', []);
        return is_array($stored) ? $stored : [];
    }
}

if (!function_exists('nodelogic_compile_graph_payload')) {
    function nodelogic_compile_graph_payload(array $payload)
    {
        $formula = is_string($payload['formula'] ?? null) ? trim($payload['formula']) : '';
        $graph_state = is_array($payload['graphState'] ?? null) ? $payload['graphState'] : [];
        $output_configs = is_array($payload['outputConfigs'] ?? null) ? $payload['outputConfigs'] : [];

        if ($formula === '' || strlen($formula) > 262144) {
            return new WP_Error('nodelogic_invalid_formula', 'The graph formula is empty or too large.', ['status' => 400]);
        }
        if (count($graph_state) > 10000 || count($output_configs) > 10000) {
            return new WP_Error('nodelogic_graph_too_large', 'The graph is too large.', ['status' => 400]);
        }

        $canonical = wp_json_encode([
            'formula' => $formula,
            'graphState' => $graph_state,
            'outputConfigs' => $output_configs,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return [
            'formula' => $formula,
            'graphState' => $graph_state,
            'outputConfigs' => $output_configs,
            'hash' => hash('sha256', (string) $canonical),
            'compiledAt' => time(),
            'version' => 1,
        ];
    }
}

add_action('rest_api_init', function () {
    register_rest_route('nodelogic/v1', '/logic', [
        [
        'methods' => 'GET',
        'permission_callback' => '__return_true',
        'args' => [
            'post_id' => [
                'required' => true,
                'sanitize_callback' => 'absint',
                'validate_callback' => static function ($value): bool {
                    return (int) $value > 0;
                },
            ],
            'editor_id' => [
                'required' => false,
                'sanitize_callback' => 'sanitize_text_field',
                'validate_callback' => static function ($value): bool {
                    return is_string($value) && $value !== '' && strlen($value) <= 190;
                },
            ],
            'graph_id' => [
                'required' => false,
                'sanitize_callback' => 'sanitize_key',
            ],
        ],
        'callback' => static function (WP_REST_Request $request) {
            $post_id = (int) $request->get_param('post_id');
            $graph_id = sanitize_key((string) $request->get_param('graph_id'));
            $editor_id = (string) $request->get_param('editor_id');
            $post = get_post($post_id);

            $can_read_unpublished = $post && current_user_can('read_post', $post_id);
            if (
                !$post
                || !is_post_type_viewable($post->post_type)
                || ($post->post_status !== 'publish' && !$can_read_unpublished)
            ) {
                return new WP_Error('nodelogic_not_found', 'Logic source not found.', ['status' => 404]);
            }

            if ($graph_id !== '') {
                $compiled = nodelogic_compiled_graphs($post_id);
                $artifact = isset($compiled[$graph_id]) && is_array($compiled[$graph_id])
                    ? $compiled[$graph_id]
                    : null;
                if ($artifact === null) {
                    $registry = nodelogic_compiled_graph_registry();
                    $artifact = isset($registry[$graph_id]) && is_array($registry[$graph_id])
                        ? $registry[$graph_id]
                        : null;
                }
                if ($artifact === null) {
                    return new WP_Error('nodelogic_not_compiled', 'This graph has not been compiled.', ['status' => 404]);
                }
                $owner_id = (int) ($artifact['postId'] ?? $post_id);
                $owner = get_post($owner_id);
                $owner_readable = $owner && is_post_type_viewable($owner->post_type)
                    && ($owner->post_status === 'publish' || current_user_can('read_post', $owner_id));
                if (!$owner_readable) {
                    return new WP_Error('nodelogic_not_found', 'Logic source not found.', ['status' => 404]);
                }
                return rest_ensure_response([
                    'graphId' => $graph_id,
                    'formula' => (string) ($artifact['formula'] ?? ''),
                    'outputConfigs' => is_array($artifact['outputConfigs'] ?? null) ? $artifact['outputConfigs'] : [],
                    'hash' => (string) ($artifact['hash'] ?? ''),
                    'version' => (int) ($artifact['version'] ?? 1),
                ]);
            }

            $result = null;
            $blocks = parse_blocks((string) $post->post_content);
            $result = nodelogic_find_gutenberg_logic_block($blocks, $editor_id);

            if ($result === null) {
                $elementor_data = get_post_meta($post_id, '_elementor_data', true);
                $decoded = is_string($elementor_data) ? json_decode($elementor_data, true) : null;
                $result = nodelogic_find_elementor_logic_widget($decoded, $editor_id);
            }

            if ($result === null) {
                return new WP_Error('nodelogic_not_found', 'Logic source not found.', ['status' => 404]);
            }

            return rest_ensure_response([
                'formula' => $result['formula'],
                'outputConfigs' => $result['outputConfigs'],
            ]);
        },
        ],
        [
            'methods' => 'POST',
            'permission_callback' => static function (WP_REST_Request $request): bool {
                return current_user_can('edit_post', (int) $request->get_param('post_id'));
            },
            'args' => [
                'post_id' => ['required' => true, 'sanitize_callback' => 'absint'],
                'graph_id' => ['required' => true, 'sanitize_callback' => 'sanitize_key'],
                'formula' => ['required' => true],
                'graphState' => ['required' => false],
                'outputConfigs' => ['required' => false],
            ],
            'callback' => static function (WP_REST_Request $request) {
                $post_id = (int) $request->get_param('post_id');
                $graph_id = sanitize_key((string) $request->get_param('graph_id'));
                if ($post_id <= 0 || $graph_id === '' || strlen($graph_id) > 190) {
                    return new WP_Error('nodelogic_invalid_compile_target', 'Invalid compile target.', ['status' => 400]);
                }

                $artifact = nodelogic_compile_graph_payload([
                    'formula' => $request->get_param('formula'),
                    'graphState' => $request->get_param('graphState'),
                    'outputConfigs' => $request->get_param('outputConfigs'),
                ]);
                if (is_wp_error($artifact)) {
                    return $artifact;
                }

                $compiled = nodelogic_compiled_graphs($post_id);
                $artifact['postId'] = $post_id;
                $compiled[$graph_id] = $artifact;
                update_post_meta($post_id, '_nodelogic_compiled_graphs', $compiled);
                $registry = nodelogic_compiled_graph_registry();
                $registry[$graph_id] = $artifact;
                update_option('_nodelogic_compiled_graph_registry', $registry, false);

                return rest_ensure_response([
                    'graphId' => $graph_id,
                    'formula' => $artifact['formula'],
                    'outputConfigs' => $artifact['outputConfigs'],
                    'hash' => $artifact['hash'],
                    'version' => $artifact['version'],
                ]);
            },
        ],
    ]);
});

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

// FRONTEND — działa tylko na stronie, NIE w Elementorze
add_action('wp_enqueue_scripts', function () {

    // Elementor is an optional integration — this plugin is Gutenberg-first.
    // Guard the class reference so the site frontend does not fatal when
    // Elementor is inactive. is_edit_mode() is only ever true in the Elementor
    // editor, so "Elementor missing" always means "not the editor".
    if (
        class_exists('\Elementor\Plugin')
        && isset(\Elementor\Plugin::$instance->editor)
        && \Elementor\Plugin::$instance->editor
        && \Elementor\Plugin::$instance->editor->is_edit_mode()
    ) {
        return; // nie ładujemy runtime w edytorze
    }

    wp_enqueue_script(
        'nodelogic-frontend',
        plugins_url('frontend.js', __FILE__),
        [],
        filemtime(__DIR__ . '/frontend.js'),
        true
    );
    // Debug nodes show their output only to people who can edit content
    // (unless a node is set to "Everyone"). A page cached for visitors
    // carries false -- the safe direction.
    wp_add_inline_script(
        'nodelogic-frontend',
        'window.nodelogicFrontendConfig = ' . wp_json_encode([
            'logicEndpoint' => rest_url('nodelogic/v1/logic'),
        ]) . ';' .
        'window.nodelogicFrontendDebug = ' . wp_json_encode(['canDebug' => is_user_logged_in() && current_user_can('edit_posts')]) . ';',
        'before'
    );

    wp_enqueue_style(
        'nodelogic-frontend-style',
        plugins_url('style.css', __FILE__),
        [],
        filemtime(__DIR__ . '/style.css')
    );
});

// 1. Ładujesz integracje
require_once __DIR__ . '/integrations.php';

// 2. DOPIERO TERAZ enqueue panelu
add_action('elementor/editor/before_enqueue_scripts', function () {
    // PRO (if active) hooks its own callback on this same action to localize
    // window.calcgraphProEditorConfig. Deliberately NOT declared as a WP
    // script dependency here: this bundle's GraphEditor reads that global
    // lazily inside a useEffect and also listens for the
    // 'nodelogic-graph-builder-config-updated' DOM event PRO's config script
    // dispatches, so exact <script> print order between the two plugins'
    // independent enqueue calls never mattered functionally. A prior attempt
    // to list PRO's script handle as an explicit dependency of this one
    // caused this script to stop being enqueued entirely on sites where the
    // PRO handle's own registration wasn't resolved in time by WordPress'
    // dependency graph -- breaking the Elementor Logic Editor outright
    // (window.mountElementorLogicEditor never defined). MAIN must not
    // hard-depend on a PRO-owned script handle across plugin boundaries.
    wp_enqueue_script(
        'nodelogic-elementor-react',
        plugins_url('/dist/build/elementor.js', __FILE__),
        [ 'jquery',
        'elementor-common',
        'elementor-editor' ],
        filemtime(__DIR__ . '/dist/build/elementor.js'),
        true
    );

    wp_enqueue_script(
        'nodelogic-elementor-logic',
        plugins_url('/assets/elementor/elementor-logic.js', __FILE__),
        [ 'jquery',
        'elementor-common',
        'elementor-editor' ],
        filemtime(__DIR__ . '/assets/elementor/elementor-logic.js'),
        true
    );

    wp_enqueue_style(
        'nodelogic-elementor-style',
        plugins_url('/assets/elementor/elementor-style.css', __FILE__),
        [],
        filemtime(__DIR__ . '/assets/elementor/elementor-style.css')
    );

    wp_enqueue_style(
        'nodelogic-graph-editor-style',
        plugins_url('/style.css', __FILE__),
        [],
        filemtime(__DIR__ . '/style.css')
    );
});

// 3. CSS podglądu (iframe)
add_action('elementor/frontend/after_enqueue_styles', function () {
    wp_enqueue_style(
        'nodelogic-elementor-style-preview',
        plugins_url('/assets/elementor/elementor-style-preview.css', __FILE__),
        [],
        filemtime(__DIR__ . '/assets/elementor/elementor-style-preview.css')
    );
});
