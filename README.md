# new-store

Shopify theme for the store, based on [Shopify Horizon](https://github.com/Shopify/horizon) 4.3.0.

## Sculpt Brief product page

Assign the product to the `sculpt` template (`templates/product.sculpt.json`).

- `blocks/sb-*.liquid` — product column blocks: subtitle, benefits, reassurance, bundle offers, size finder, guarantee note, how it wears, product FAQ.
- `sections/sb-*.liquid` — sections below the product: video carousel, buy buttons, features, comparison, guarantee, FAQ, and the support block in the footer group.
- Images live in `assets/sb-*`; videos are in the store's Files (`sb-*.mp4`, loaded with `file_url`).
- Bundle discount percentages in the `sb-bundle` block must match the store's automatic discounts (50.01%, 70.02%, 75.42%).
