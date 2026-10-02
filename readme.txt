=== NodeLogic Graph Builder ===
Contributors: nodelogicwp
Tags: calculator, gutenberg, no-code, conditional logic, workflow builder
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.6.0
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

= 1.6.0 =
* New: version history for every logic graph. Save Graph keeps 0-10 previous versions (set per block / widget) that you can preview, compare and restore.
* New: automatic working copy. Your edits are stored in the browser while you work; the page keeps its current graph until you click Save Graph, and unsaved work survives closing the editor or a browser crash (recovery is offered only when the content really differs).
* New: export and import graphs as JSON files, with validation and a summary of the changes before anything is replaced.
* New nodes: Raw HTML Element, Set Parent, Clone Element and Elements by Class (create and arrange page elements), Event OR, Event AND, Fallback Event and Event Trigger Action, and Debug nodes (Console Log, Console Warning, Message Log, Message Warning).
* Improved: Undo / Redo works per action (typing a word is one step) and keyboard shortcuts only affect the active editor.
* Improved: Set Parent, Clone Element and Debug nodes fed by a For Each item run once per item (e.g. one element per database row).
* Improved: a part of a graph that fails is skipped and reported in the browser console instead of stopping the whole logic block.
* Improved: several logic blocks on one page no longer take over each other's events, and elements without an HTML ID can be used as event targets.
* Fixed: two Output nodes targeting the same element no longer cancel each other.
* Fixed: Get Element Property and live values used by actions now always read the current state of the page.
* Fixed: Math Function now applies the selected function, Cut A / B / C respect Reverse, CSS Unit uses the value typed in the node, Image From Link uses the typed URL, and Show Notification / Trigger Event use a connected Value.
* Fixed: changing node settings was not saved unless a node was also moved; an emptied graph kept the previous logic running after Save Graph; restoring a draft could overwrite work without asking.
* Fixed: accidental text selection while dragging nodes, drags released outside the canvas, long node titles, CSS Join property fields overflowing the node, and node controls without a visible label or cut off.
* Fixed: the Elementor Logic Editor failing to open ("mountElementorLogicEditor() is unavailable") and not releasing its resources when closed.
* Fixed: PRO nodes (including Memory and API Status) missing in the Elementor graph editor.
* Changed: the CSS Text node is now called CSS Custom.

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

= 1.6.0 =
Adds version history, an automatic working copy with crash recovery, and JSON import / export to the graph editor, plus new element, event and debug nodes and fixes for nodes that ignored their settings. Existing graphs keep working.

= 1.4.3 =
This release adds the Actions system to the graph editor and fixes several runtime issues related to action nodes, formula evaluation, and connection line alignment.

= 1.4.2 =
This release adds Array List height control, refines pie/donut percentages, and removes leftover debug output.

= 1.4.1 =
This release improves graph editor flow clarity and adds stronger validation for dynamic input chains.
