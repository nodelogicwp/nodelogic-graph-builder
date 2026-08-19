# NodeLogic Graph Builder
Author: Volodymyr Diadiunov

## Builder integrations

NodeLogic blocks and presets remain available in Gutenberg. When Elementor is active,
the **NodeLogic Preset** widget is registered in the Elementor widget panel. Blocksy
and other builders can insert the same presets through the shortcode:

```
[nodelogic_preset id="price-calculator"]
[nodelogic_preset id="estimate-calculator"]
```

The preset list is also available to integrations through `GET /wp-json/nodelogic/v1/presets`.

## WordPress 7.1 compatibility

The editor canvas scopes DOM queries to its own mounted document, which keeps the graph
editor compatible with the iframe-based post editor. The frontend runtime remains loaded
on the public page, while editor CSS is loaded through `enqueue_block_assets` so it can be
available inside the editor iframe.
