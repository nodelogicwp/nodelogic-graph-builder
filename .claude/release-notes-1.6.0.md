## NodeLogic Graph Builder 1.6.0

### New
- **Version history** for every logic graph: Save Graph keeps 0-10 previous versions (set per block / widget) that you can preview, compare and restore.
- **Automatic working copy**: edits are stored in the browser while you work; the page keeps its current graph until you click Save Graph. Unsaved work survives closing the editor or a browser crash (recovery is offered only when the content really differs).
- **JSON export / import** of graphs, with validation and a summary of the changes before anything is replaced.
- **New nodes**: Raw HTML Element, Set Parent, Clone Element, Elements by Class; Event OR, Event AND, Fallback Event, Event Trigger Action; Debug nodes (Console Log, Console Warning, Message Log, Message Warning).

### Improved
- Undo / Redo works per action; keyboard shortcuts only affect the active editor.
- Set Parent, Clone Element and Debug nodes fed by a For Each item run once per item.
- A failing part of a graph is skipped and reported in the console instead of stopping the whole logic block.
- Several logic blocks on one page no longer take over each other's events; elements without an HTML ID can be event targets.

### Fixed
- Two Output nodes targeting the same element no longer cancel each other.
- Get Element Property and live values used by actions always read the current page state.
- Math Function applies the selected function; Cut A / B / C respect Reverse; CSS Unit and Image From Link use the values typed in the node; Show Notification / Trigger Event use a connected Value.
- Node setting changes are always saved; an emptied graph no longer keeps the old logic running; restoring a draft no longer overwrites work without asking.
- Editor UI: accidental text selection while dragging, drags released outside the canvas, long node titles, CSS Join fields overflowing the node, unlabeled / cut-off controls.
- Elementor: the Logic Editor failing to open and not releasing resources when closed; PRO nodes missing in the Elementor graph editor.

### Changed
- The CSS Text node is now called CSS Custom.

Requires WordPress 6.0+ and PHP 7.4+. Existing graphs keep working.
