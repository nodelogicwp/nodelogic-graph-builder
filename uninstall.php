<?php
/**
 * NodeLogic Graph Builder - Uninstall
 *
 * Runs when the plugin is deleted (not just deactivated).
 * Removes all plugin data from the database.
 */

if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Remove plugin options
delete_option('calcgraph_graph_templates');
delete_option('calcgraph_custom_nodes');
