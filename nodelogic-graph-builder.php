<?php
/**
 * Plugin Name: NodeLogic Graph Builder
 * Description: Visual no-code graph editor for dynamic HTML element logic.
 * Plugin URI: https://nodelogicwp.com
 * Version: 1.4.0
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
    define('NODELOGIC_VERSION', '1.4.0');
}

add_action('init', function () {
    register_block_type(__DIR__ . '/buttons-block.json');
    register_block_type(__DIR__ . '/logic-block.json');
    register_block_type(__DIR__ . '/blocks/element-seekbar');
    register_block_type(__DIR__ . '/blocks/element-number');
    register_block_type(__DIR__ . '/blocks/element-text');
    register_block_type(__DIR__ . '/blocks/element-radio');
    register_block_type(__DIR__ . '/blocks/element-select');
    register_block_type(__DIR__ . '/blocks/element-checkbox');
    register_block_type(__DIR__ . '/blocks/element-label');
});

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
