/* ═══════════════════════════════════════════════════════════════
   MWB MICRO-INTERACTIONS — assets/js/micro-interactions.js
   Loaded at end of <body>, after the main inline <script>.
   Overrides the inline showToast(); all other features are
   self-contained IIFEs that observe the DOM.
   ═══════════════════════════════════════════════════════════════ */

/* ── 3. TOAST QUEUE ──────────────────────────────────────────────
   Replaces the bare #toast div with a #toast-container that
   supports stacked, typed, auto-dismissing toasts.
   The global showToast() is redefined here, overriding the
   inline version.
   ─────────────────────────────────────────────────────────────── */
(function setupToastContainer() {
  const old = document.getElementById('toast');
  if (!old) return;
  const container = document.createElement('div');
  container.id = 'toast-container';
  old.replaceWith(container);
})();

function showToast(msg, type) {
  type = type || 'info';
  const container = document.getElementById('toast-container');
  if (!container) return;

  const iconMap = { ok: 'check', err: 'x-circle', warn: 'alert-triangle', info: 'info' };
  const iconName = iconMap[type] || 'info';

  const el = document.createElement('div');
  el.className = 'toast-item toast-' + type;

  const icon = document.createElement('i');
  icon.setAttribute('data-lucide', iconName);
  icon.style.cssText = 'width:14px;height:14px;flex-shrink:0;';
  const span = document.createElement('span');
  span.textContent = msg;
  el.appendChild(icon);
  el.appendChild(span);

  container.appendChild(el);

  if (typeof lucide !== 'undefined') {
    lucide.createIcons({ nodes: [el] });
  }

  /* Double rAF ensures the browser has painted the initial state
     before the transition fires, giving us the slide-up effect. */
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      el.classList.add('toast-show');
    });
  });

  var timer = setTimeout(function() { dismissToast(el); }, 3000);

  /* Tap to dismiss early */
  el.addEventListener('click', function() {
    clearTimeout(timer);
    dismissToast(el);
  });
}

function dismissToast(el) {
  if (!el || !el.parentNode) return;
  el.classList.add('toast-hide');
  el.addEventListener('transitionend', function() {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, { once: true });
}


/* ── 5. HOME CTA SHIMMER (one-shot) ──────────────────────────────
   Adds .shimmer-once to the CTA button once after the page
   settles, then removes it after the animation ends.
   ─────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  var cta = document.querySelector('.home-cta');
  if (!cta) return;

  /* Only run if the user hasn't expressed a motion preference */
  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  setTimeout(function() {
    cta.classList.add('shimmer-once');
    cta.addEventListener('animationend', function() {
      cta.classList.remove('shimmer-once');
    }, { once: true });
  }, 700);
});


/* ── 6. TOOLTIP — long-press on touch ───────────────────────────
   On desktop, CSS handles the 1s hover delay.
   On touch, a 500ms press triggers .tooltip-visible which CSS
   uses to show the tooltip immediately.
   ─────────────────────────────────────────────────────────────── */
(function setupTooltips() {
  var longPressTimer = null;
  var activeTooltip  = null;

  function showTip(el) {
    if (activeTooltip && activeTooltip !== el) hideTip(activeTooltip);
    el.classList.add('tooltip-visible');
    activeTooltip = el;
  }

  function hideTip(el) {
    if (!el) return;
    el.classList.remove('tooltip-visible');
    if (activeTooltip === el) activeTooltip = null;
  }

  document.addEventListener('touchstart', function(e) {
    var target = e.target.closest('[data-tooltip]');
    if (!target) {
      hideTip(activeTooltip);
      return;
    }
    longPressTimer = setTimeout(function() { showTip(target); }, 500);
  }, { passive: true });

  document.addEventListener('touchend', function() {
    clearTimeout(longPressTimer);
    if (activeTooltip) {
      var tip = activeTooltip;
      setTimeout(function() { hideTip(tip); }, 1400);
    }
  }, { passive: true });

  document.addEventListener('touchmove', function() {
    clearTimeout(longPressTimer);
  }, { passive: true });
})();


/* ── STAGGER FADE-IN — home inzendingen list ─────────────────────
   Watches #home-inzendingen for new cards and assigns
   incrementing animation-delay values (max 5 items × 50ms).
   ─────────────────────────────────────────────────────────────── */
(function setupStagger() {
  var container = document.getElementById('home-inzendingen');
  if (!container) return;

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) return;

  function staggerCards() {
    var cards = container.querySelectorAll('.home-inz-card:not(.stagger-in)');
    cards.forEach(function(card, i) {
      card.style.animationDelay = (Math.min(i, 4) * 50) + 'ms';
      card.classList.add('stagger-in');
    });
  }

  var observer = new MutationObserver(staggerCards);
  observer.observe(container, { childList: true });
})();


/* ── PULL-TO-REFRESH — home view ─────────────────────────────────
   iOS-style pull indicator on #view-home.
   Calls laadMijnInzendingen() when pull exceeds THRESHOLD px.
   Uses passive touch listeners throughout (no scroll jank).
   ─────────────────────────────────────────────────────────────── */
(function setupPullToRefresh() {
  var view = document.getElementById('view-home');
  if (!view) return;

  /* Build the indicator element */
  var ptr = document.createElement('div');
  ptr.id = 'ptr-indicator';
  ptr.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round">' +
    '<polyline points="1 4 1 10 7 10"></polyline>' +
    '<path d="M3.51 15a9 9 0 1 0 .49-3.5"></path>' +
    '</svg>';

  view.style.position = 'relative';
  view.insertBefore(ptr, view.firstChild);

  var THRESHOLD = 65;
  var MAX_PULL  = 90;
  var startY    = 0;
  var pulling   = false;
  var pullDist  = 0;
  var canPull   = false;
  var refreshing = false;

  function getScrollTop() {
    return document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  view.addEventListener('touchstart', function(e) {
    if (refreshing) return;
    canPull  = getScrollTop() === 0;
    startY   = e.touches[0].clientY;
    pulling  = false;
    pullDist = 0;
  }, { passive: true });

  view.addEventListener('touchmove', function(e) {
    if (!canPull || refreshing) return;
    var dy = e.touches[0].clientY - startY;
    if (dy <= 0) { canPull = false; return; }
    pulling  = true;
    /* Apply damping so the indicator doesn't overshoot */
    pullDist = Math.min(dy * 0.42, MAX_PULL);

    var progress = Math.min(pullDist / THRESHOLD, 1);
    var yOffset  = pullDist - 56;
    var rotation = progress * 200;

    ptr.style.transform =
      'translateX(-50%) translateY(' + yOffset + 'px) rotate(' + rotation + 'deg)';
    ptr.classList.toggle('ptr-pulling', pullDist > 10);
  }, { passive: true });

  view.addEventListener('touchend', function() {
    if (!pulling) return;

    if (pullDist >= THRESHOLD) {
      refreshing = true;
      ptr.classList.add('ptr-loading');
      /* Snap to visible resting position */
      ptr.style.transform = 'translateX(-50%) translateY(0px) rotate(0deg)';
      ptr.style.opacity   = '1';

      var done = function() {
        refreshing = false;
        ptr.classList.remove('ptr-loading', 'ptr-pulling');
        ptr.style.transform = '';
        ptr.style.opacity   = '';
        pullDist = 0;
      };

      if (typeof laadMijnInzendingen === 'function') {
        laadMijnInzendingen().then(done).catch(done);
      } else {
        setTimeout(done, 1000);
      }
    } else {
      /* Not enough pull — snap back */
      ptr.classList.remove('ptr-pulling');
      ptr.style.transform = '';
      pullDist = 0;
    }

    pulling = false;
  }, { passive: true });
})();
