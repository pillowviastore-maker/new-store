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

  // Green "deal unlocked" card shown in the cart after every upgrade (styles in sb-brand.css).
  function celebrate(unlock) {
    if (!unlock || !unlock.title) return;
    var old = document.querySelector('.sbcu-win');
    if (old) old.remove();
    var card = document.createElement('div');
    card.className = 'sbcu-win';
    // A popover sits in the top layer, above the open cart drawer, and the cart re-render can't remove it.
    var canPop = typeof card.showPopover === 'function';
    if (canPop) card.setAttribute('popover', 'manual');
    card.setAttribute('role', 'status');
    card.innerHTML =
      '<svg class="sbcu-win-check" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" fill="none"/><path d="M15 27l7 7 15-16" fill="none"/></svg>' +
      '<div><p class="sbcu-win-title"></p><p class="sbcu-win-text"></p></div>';
    card.querySelector('.sbcu-win-title').textContent = unlock.title + ' unlocked!';
    card.querySelector('.sbcu-win-text').textContent = unlock.count + ' briefs, just ' + unlock.each + ' each. Your discount is applied.';
    document.body.appendChild(card);
    if (canPop) card.showPopover();
    setTimeout(function () { card.classList.add('is-leaving'); }, 3200);
    setTimeout(function () { card.remove(); }, 3700);
  }

  document.addEventListener('click', function (event) {
    // "Edit" on a bundle row: on the product page, close the cart and glide to the colour and size picker.
    var edit = event.target.closest('.sbcb-edit');
    if (edit) {
      var target = new URL(edit.href, window.location.href);
      var picker = document.getElementById('sb-bundle');
      if (target.pathname !== window.location.pathname || !picker) return;
      event.preventDefault();
      var drawer = document.querySelector('theme-drawer#cart-drawer');
      if (drawer && typeof drawer.close === 'function') drawer.close();
      setTimeout(function () { picker.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 250);
      return;
    }

    var add = event.target.closest('[data-sbcu-add]');
    var remove = event.target.closest('[data-sbcb-remove]');
    if (!add && !remove) return;
    var button = add || remove;
    button.disabled = true;
    var request;

    if (add) {
      add.classList.add('is-loading');
      add.textContent = 'Adding…';
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

    if (add) {
      var unlock = { title: add.dataset.unlock, each: add.dataset.each, count: add.dataset.count };
      Promise.resolve(request).then(function () { setTimeout(function () { celebrate(unlock); }, 350); }, function () {});
    }

    Promise.resolve(request).catch(function () {
      button.disabled = false;
      var row = button.closest('tr');
      if (row) row.style.opacity = '';
      if (add) button.textContent = "Couldn't add, tap to try again";
    });
  });
})();
