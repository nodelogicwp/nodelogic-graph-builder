=== NodeLogic Graph Builder ===
Contributors: nodelogicwp
Tags: calculator, gutenberg, no-code, conditional logic, workflow builder
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.5.2
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Visual no-code calculator and workflow builder for Gutenberg blocks with conditional logic, dynamic content, and reusable presets.

== Description ==

NodeLogic Graph Builder lets you build dynamic WordPress page logic, calculators, and reusable workflows without writing code.

You create your setup directly in Gutenberg:

1. Add input/output blocks from this plugin to your page.
2. Add the **NodeLogic Graph Builder Logic** block.
3. Open the graph editor and connect nodes to control values, conditions, styles, and behavior.
4. Save and publish.

**Key Features:**

* Visual drag-and-drop node graph editor for calculators and workflows
* Gutenberg blocks for inputs/outputs and page logic
* Supports number, string, boolean, color, and basic CSS logic flows in the free version
* Logic Block for page-level runtime behavior
* Starter preset layouts for common calculator-style setups
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

= Are there starter presets? =

Yes. The free version includes starter preset layouts built from the plugin's own blocks so you can begin with a ready-made calculator layout and then adjust it to fit your page.

= Where is the JavaScript source code? =

The source is included in the `src/` directory. Build artifacts are in `build/`.

= What browsers are supported? =

All modern browsers (Chrome, Firefox, Safari, Edge). The graph editor is optimized for desktop editing.

== Changelog ==

= 1.5.3 =
* Added Elementor preset widget and shared preset shortcode support for compatible builders.
* Added WordPress 7.1 iframe editor compatibility improvements.
* Added array operations, event nodes, action nodes, branching nodes, and viewport rendering optimizations.
* Fixed WordPress.org escaping and plugin metadata compatibility checks.

= 1.4.3 =
* Added Actions system — new Action nodes in the graph editor (Action Event, Action Block, Set Required, Set Min, Set Max, Set Length, Set Regex, Add Class, Remove Class, Toggle Class)
* Added Events nodes — Event Element Node, Event ID Node, Event Processor now available in the free version
* Fixed broken Calculation Node — formula evaluation was blocked when any action nodes were connected to an Output Node
* Fixed element freeze when actions were attached — output payload was incorrectly used as the element value, causing seekbar and other inputs to reset visually
* Fixed connection line endpoints for Action Nodes — pin positions now correctly align to the center of each pin

= 1.4.2 =
* Added manual height control for Array List blocks
* Improved pie and donut percentage rounding with configurable decimal precision
* Removed internal debug logging from the editor and runtime

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

= 1.4.3 =
This release adds the Actions system to the graph editor and fixes several runtime issues related to action nodes, formula evaluation, and connection line alignment.

= 1.4.2 =
This release adds Array List height control, refines pie/donut percentages, and removes leftover debug output.

= 1.4.1 =
This release improves graph editor flow clarity and adds stronger validation for dynamic input chains.
