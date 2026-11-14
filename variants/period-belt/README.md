# Period Belt version of the store (draft theme "Lithella — Period Belt (draft)")

These files replace the normal ones only in the draft theme, so the live Sculpt Brief store is unchanged:
- templates/index.json: home page for the belt
- sections/header-group.json: announcement bar and links point to /products/period-belt
- blocks/_header-logo.liquid: logo links to the belt

Shared new files live in the normal folders (sections/lt-*.liquid, blocks/lt-*.liquid, templates/product.belt.json).
They are not used by the Sculpt Brief pages.

## Already set up in Shopify
- Products (status DRAFT, hidden from customers):
  - Lithella Period Belt, handle `period-belt`, template `belt`, Pink / White, €69.95 (compare €119.90)
  - Lithella Comfort Blanket, handle `comfort-blanket`, Pink / White × Single / Medium / Double / King Size
- Files: all section images (prefix `lt-`) and 3 videos, uploaded to Shopify Files.
- Automatic discounts (no effect while the products are drafts):
  - "Free blanket with every Lithella belt" (buy 1 belt, get 1 blanket 100% off)
  - "Double Kit: 2 Lithella belts" (14% off belts, minimum 2)
- Theme "Lithella — Period Belt (draft)" (209798463822) holds every file above.

## Launch checklist
1. Products → Period Belt and Comfort Blanket → status Active, sales channel Online Store.
2. Discounts → turn off the three Sculpt Brief UK discounts ("Buy 1 Get 1 Free", "Buy 2 Get 2 Free", "Buy 3 Get 3 Free"),
   otherwise belt + blanket counts as 2 items and gets 56% off on top.
3. Online Store → Navigation → main menu: replace "The Sculpt Brief" with the belt.
4. Settings → Policies → refund policy: the belt pages promise a 30-day money-back guarantee (the brief had 90 days).
5. Online Store → Themes → publish "Lithella — Period Belt (draft)".
6. Place one real test order (Kit with a blanket) and check: blanket is £0, Double Kit total is right.
7. Sculpt Brief: set to Draft or keep it, as you prefer.

## Not done yet / needs your input
- 6 product gallery images and the blanket size chart still have Italian text and the Lenivea name.
- The 3 videos have Italian captions burned in.
- Reviews: Lenivea's reviews, ratings and "2,800+ customers" claims were not copied (they belong to another store).
