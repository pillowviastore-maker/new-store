/* Scroll reveal: content below the first screen fades and slides in as it scrolls into view.
 * Only opacity/transform are animated (styles in sb-brand.css). Nothing is hidden without JS,
 * above-the-fold content is never hidden, and reduced-motion users see everything at once. */
(function () {
  if (window.sbRevealReady) return;
  window.sbRevealReady = true;
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Whole blocks, plus cards inside them so a row of cards arrives one after another.
  var BLOCKS = [
    'main .shopify-section > *:not(.product-information)',
    '.product-details > .group-block > *',
    '.product-details > *:not(.group-block)'
  ].join(',');
  var CARDS = '.sb-f3-row, .sb-cmp-card, .sb-wear-item, .sbhb-item, .sbhb-card, .sbG-inner > *, .sbcs-inner > *, .sbFaq2 details';

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.classList.add('sb-rv-in');
      observer.unobserve(el);
      // Hand the element back to its own styles (hover lifts etc.) once it has arrived.
      var delay = parseInt(el.style.getPropertyValue('--sb-rv-delay'), 10) || 0;
      setTimeout(function () { el.classList.remove('sb-rv', 'sb-rv-in'); el.style.removeProperty('--sb-rv-delay'); }, 800 + delay);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

  function eligible(el) {
    if (el.classList.contains('sb-rv') || el.closest('dialog, theme-drawer, .sbb-sticky, [data-sbb-toast]')) return false;
    // A transform would re-anchor fixed-position children (sticky buy bar, size finder overlay).
    return !el.querySelector('.sbb-sticky, .sbz-overlay, dialog, [popover]');
  }

  function scan() {
    var picks = [], cardHosts = new Set();
    document.querySelectorAll(CARDS).forEach(function (card) {
      var parent = card.parentElement;
      if (!parent || !eligible(card)) return;
      cardHosts.add(parent);
      picks.push([card, Math.min(Array.prototype.indexOf.call(parent.children, card), 4) * 90]);
    });
    document.querySelectorAll(BLOCKS).forEach(function (el) {
      // A block whose own cards animate stays put; its cards do the moving.
      if (cardHosts.has(el) || !eligible(el)) return;
      for (var i = 0; i < picks.length; i++) if (el.contains(picks[i][0])) return;
      picks.push([el, 0]);
    });
    // Read every position first, then write, so the page is laid out only once.
    var fold = window.innerHeight;
    var below = picks.filter(function (pick) { var r = pick[0].getBoundingClientRect(); return r.height > 0 && r.top >= fold; });
    below.forEach(function (pick) {
      pick[0].classList.add('sb-rv');
      if (pick[1]) pick[0].style.setProperty('--sb-rv-delay', pick[1] + 'ms');
      observer.observe(pick[0]);
    });
  }

  // Prepared once the browser is idle after loading: only below-the-fold content is affected, so nothing visibly changes.
  function schedule() {
    if ('requestIdleCallback' in window) window.requestIdleCallback(scan, { timeout: 1500 });
    else setTimeout(scan, 300);
  }

  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
})();
