/**
 * fx.js — runtime 3D motion.
 *
 * CSS handles all the ambient animation (mesh, drift, lift, sheen). This file
 * adds the parts that need real values from the browser:
 *
 *   1. Pointer-driven card tilt (rotateX/rotateY + holo sheen tracking)
 *   2. A parallax response on the ambient stage
 *   3. A staggered entrance for dynamically inserted cards
 *   4. A 3D press/ripple on primary buttons
 *
 * Everything degrades gracefully: if the user prefers reduced motion, or the
 * device has no hover (touch), each effect simply does not attach.
 */

const REDUCED = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

const HOVERABLE = typeof matchMedia !== 'function'
  || matchMedia('(hover: hover) and (pointer: fine)').matches;

const MAX_TILT = 7;      // degrees — enough to feel 3D, not enough to be dizzy
const MAX_SHIFT = 3;

/* ---------------- 1. card tilt + holo sheen ---------------- */

function attachTilt(card) {
  if (REDUCED || !HOVERABLE) return;

  let raf = 0;
  let targetX = 0;
  let targetY = 0;

  const apply = () => {
    raf = 0;
    card.style.setProperty('--tilt-x', `${targetX.toFixed(2)}deg`);
    card.style.setProperty('--tilt-y', `${targetY.toFixed(2)}deg`);
  };

  const onMove = (e) => {
    const r = card.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // -0.5..0.5 from the card's centre
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    targetY = px * MAX_TILT * 2;
    targetX = -py * MAX_TILT * 2;
    // sheen follows the pointer
    card.style.setProperty(
      '--holo-pos',
      `${((px + 0.5) * 100).toFixed(1)}% ${((py + 0.5) * 100).toFixed(1)}%`,
    );
    if (!raf) raf = requestAnimationFrame(apply);
  };

  const onLeave = () => {
    targetX = 0;
    targetY = 0;
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
  };

  card.addEventListener('pointermove', onMove);
  card.addEventListener('pointerleave', onLeave);
}

/* ---------------- 2. ambient parallax ---------------- */

let stageBound = false;

function bindStageParallax() {
  if (REDUCED || !HOVERABLE || stageBound) return;
  stageBound = true;
  let raf = 0;
  let tx = 0;
  let ty = 0;

  const apply = () => {
    raf = 0;
    document.body.style.setProperty('--px', tx.toFixed(2));
    document.body.style.setProperty('--py', ty.toFixed(2));
  };

  window.addEventListener('pointermove', (e) => {
    tx = ((e.clientX / window.innerWidth) - 0.5) * 2;
    ty = ((e.clientY / window.innerHeight) - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(apply);
  }, { passive: true });
}

/* ---------------- 3. staggered entrance ---------------- */

/**
 * Give newly rendered cards an incremental delay so a list cascades in.
 * @param {ParentNode} root
 * @param {string} selector
 */
export function stagger(root, selector = '.card, .stat', step = 55, max = 12) {
  if (REDUCED) return;
  const items = [...root.querySelectorAll(selector)];
  items.slice(0, max).forEach((el, i) => {
    el.style.animation = 'rise3d .5s var(--ease-out) backwards';
    el.style.animationDelay = `${i * step}ms`;
    attachTilt(el);
  });
}

/* ---------------- 4. button press depth ---------------- */

function bindPresses(root = document) {
  if (REDUCED) return;
  for (const btn of root.querySelectorAll('.btn-primary')) {
    if (btn.dataset.pressBound) continue;
    btn.dataset.pressBound = '1';
    btn.addEventListener('pointerdown', () => {
      btn.style.transform = 'perspective(600px) translate3d(0, 2px, -6px) scale(.97)';
    });
    const release = () => { btn.style.transform = ''; };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
  }
}

/* ---------------- boot ---------------- */

export function initFX() {
  if (REDUCED) {
    document.documentElement.classList.add('reduced-motion');
    return;
  }
  document.documentElement.classList.add('fx-3d');
  bindStageParallax();

  // Enhance whatever is already on screen.
  stagger(document);
  bindPresses();

  // Re-scan whenever the SPA swaps a page.
  const observer = new MutationObserver(() => {
    stagger(document);
    bindPresses();
  });
  observer.observe(document.getElementById('page-root') || document.body, {
    childList: true,
    subtree: true,
  });
}

export const prefersReducedMotion = REDUCED;
export const hoverable = HOVERABLE;
export { attachTilt, MAX_TILT, MAX_SHIFT };
