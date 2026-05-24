=== NodeLogic Graph Builder ===
Contributors: nodelogicwp
Tags: calculator, logic, no-code, graph, blocks
Requires at least: 6.0
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 1.4.1
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Visual no-code graph editor for building dynamic page logic with Gutenberg blocks.

== Description ==

NodeLogic Graph Builder lets you build dynamic logic for WordPress pages without writing code.

You create your setup directly in Gutenberg:

1. Add input/output blocks from this plugin to your page.
2. Add the **NodeLogic Graph Builder Logic** block.
3. Open the graph editor and connect nodes to control values, conditions, styles, and behavior.
4. Save and publish.

**Key Features:**

* Visual drag-and-drop node graph editor
* Gutenberg blocks for inputs/outputs and page logic
* Supports number, string, boolean, color, and basic CSS logic flows in the free version
* Logic Block for page-level runtime behavior
* Additional advanced node packs (events, memory, advanced string/math helpers, templates, and custom nodes) are available in a separate Pro extension
* Works locally inside WordPress (no license endpoint required)

**Node Types Included:**

* Element blocks: Seekbar, Number Input, Text Input, Radio Group, Select, Checkbox, Label, Button Group
* Graph nodes (free): Calculation, Condition, Switch/If, Boolean Logic, Math helpers, core String Logic, Colors, CSS, Outputs

Source: https://github.com/nodelogicwp/nodelogic-graph-builder

== Installation ==

1. Upload the plugin files to `/wp-content/plugins/nodelogic-graph-builder/`
2. Activate the plugin through the **Plugins** screen in WordPress
3. Open any page/post in Gutenberg
4. Add input/output blocks from **NodeLogic Graph Builder**
5. Add the **NodeLogic Graph Builder Logic** block and open the graph editor
6. Connect nodes, save, and publish

== Frequently Asked Questions ==

= Where do I start in the free version? =

Open Gutenberg, add the plugin input/output blocks to your page, then add the **NodeLogic Graph Builder Logic** block. Build your graph there and publish.

= Does this plugin make external HTTP requests? =

No. This plugin works locally in WordPress and does not require a license activation endpoint.

= Where can I find optional Pro plans? =

Optional Pro plan details are available at https://nodelogicwp.com.

= Where is the JavaScript source code? =

The source is included in the `src/` directory. Build artifacts are in `build/`.

= What browsers are supported? =

All modern browsers (Chrome, Firefox, Safari, Edge). The graph editor is optimized for desktop editing.

== Changelog ==

= 1.4.1 =
* Improved calculation flow visualization with clearer numbered markers and curved input mapping arrows
* Added dynamic input-gap validation with node error highlighting and save blocking for invalid graphs
* Fixed sidebar icon/text rendering issues and general graph editor UI polish

= 1.4.0 =
* Renamed plugin to NodeLogic Graph Builder
* Updated slug/text domain and main plugin file naming
* Updated WordPress.org free build content and naming consistency
* Added/kept readable source files in `src/` and documented source location

== Upgrade Notice ==

= 1.4.1 =
This release improves graph editor flow clarity and adds stronger validation for dynamic input chains.
