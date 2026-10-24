/* Cart helpers for Sculpt Brief bundles:
 * - [data-sbcu-add]: adds the missing briefs for the next bundle tier (snippets/sb-cart-upsell.liquid),
 *   tagged with the same `_bundle` property so they join the existing bundle row.
 * - [data-sbcb-remove]: removes every line of a bundle row (snippets/sb-cart-bundle.liquid). */
(function () {
  if (window.sbcuReady) return;
  window.sbcuReady = true;
  var root = (window.Shopify && Shopify.routes ? Shopify.routes.root : '/');

  function update(lines, fallback) {
    var actions = window.Shopify && window.Shopify.actions;
    if (actions && actions.updateCart) {
      return actions.updateCart({ lines: lines }, { event: { context: 'cart' } }).then(function (result) {
        if (result && result.userErrors && result.userErrors.length) throw new Error(result.userErrors[0].message);
      });
    }
    return fallback().then(function () {
      try { sessionStorage.setItem('lithella-open-cart', '1'); } catch (e) {}
      window.location.reload();
    });
  }

  // After a fallback reload, slide the cart open on the same page instead of sending shoppers to /cart.
  try {
    if (sessionStorage.getItem('lithella-open-cart') === '1') {
      sessionStorage.removeItem('lithella-open-cart');
      customElements.whenDefined('theme-drawer').then(function () {
        var drawer = document.querySelector('theme-drawer#cart-drawer');
        if (drawer && typeof drawer.open === 'function') drawer.open();
      });
    }
  } catch (e) {}

  document.addEventListener('click', function (event) {
    var add = event.target.closest('[data-sbcu-add]');
    var remove = event.target.closest('[data-sbcb-remove]');
    if (!add && !remove) return;
    var button = add || remove;
    button.disabled = true;
    var request;

    if (add) {
      var bundle = add.dataset.bundle;
      var line = { merchandiseId: String(add.dataset.variant), quantity: +add.dataset.qty };
      if (bundle) line.attributes = [{ key: '_bundle', value: bundle }];
      request = update([line], function () {
        var item = { id: +add.dataset.variant, quantity: +add.dataset.qty };
        if (bundle) item.properties = { _bundle: bundle };
        return fetch(root + 'cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [item] })
        });
      });
    } else {
      var keys = remove.dataset.sbcbRemove.split(',').filter(Boolean);
      var row = remove.closest('tr');
      if (row) row.style.opacity = '.4';
      request = update(keys.map(function (key) { return { id: key, quantity: 0 }; }), function () {
        var updates = {};
        keys.forEach(function (key) { updates[key] = 0; });
        return fetch(root + 'cart/update.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: updates })
        });
      });
    }

    Promise.resolve(request).catch(function () {
      button.disabled = false;
      var row = button.closest('tr');
      if (row) row.style.opacity = '';
      if (add) button.textContent = "Couldn't add, tap to try again";
    });
  });
})();
