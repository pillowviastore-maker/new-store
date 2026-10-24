/* Cart upsell: adds the missing briefs for the next bundle tier (button rendered by snippets/sb-cart-upsell.liquid). */
(function () {
    if (window.sbcuReady) return;
    window.sbcuReady = true;
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-sbcu-add]');
      if (!button) return;
      button.disabled = true;
      var line = { merchandiseId: String(button.dataset.variant), quantity: +button.dataset.qty };
      var actions = window.Shopify && window.Shopify.actions;
      var request = actions && actions.updateCart
        ? actions.updateCart({ lines: [line] }, { event: { context: 'cart' } })
        : fetch((window.Shopify && Shopify.routes ? Shopify.routes.root : '/') + 'cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [{ id: +button.dataset.variant, quantity: +button.dataset.qty }] })
          }).then(function () { window.location.reload(); });
      Promise.resolve(request).catch(function () {
        button.disabled = false;
        button.textContent = "Couldn't add, tap to try again";
      });
    });
  })();
