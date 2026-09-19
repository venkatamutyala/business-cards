// Install prompt and service-worker lifecycle.
//
// Android and desktop Chrome fire beforeinstallprompt, which we capture and
// replay from our own button. iOS fires nothing and has no programmatic install
// at all, so there the button explains the Share -> Add to Home Screen route
// instead of pretending it can do it for you.

const $ = (id) => document.getElementById(id);

let deferredPrompt = null;
import { registerKey } from './store.js';
const DISMISS_KEY = registerKey('q4m.installDismissed');

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua)
    // iPadOS 13+ reports as a Mac, but a Mac has no touch.
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// Dismissal expires rather than being permanent: a button whose only effect is
// to make another button reappear is not worth its space, and a silent forever
// dismissal means the offer can never come back.
const DISMISS_DAYS = 30;

function dismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (!at) return false;
    return (Date.now() - at) < DISMISS_DAYS * 864e5;
  } catch { return false; }
}

function show(title, hint, canPrompt) {
  const bar = $('installBar');
  $('installBarTitle').textContent = title;
  $('installBarHint').textContent = hint;
  $('installNow').hidden = !canPrompt;
  bar.hidden = false;
}

// Exposed so the "Open on your phone" panel can report status and undo a
// dismissal. Without this, tapping the x once hid the offer permanently with no
// way back -- and the browser will not re-offer on its own.
export function installState() {
  return {
    standalone: isStandalone(),
    ios: isIos(),
    dismissed: dismissed(),
    canPrompt: !!deferredPrompt,
  };
}

export function wireInstallPrompt() {
  // Already installed: there is nothing to offer, and the bar would just be
  // clutter at the top of the app you are already running.
  if (isStandalone()) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!dismissed()) {
      show('Add to your home screen', 'Works offline once installed.', true);
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    $('installBar').hidden = true;
  });

  $('installNow').onclick = async () => {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();
    try { await prompt.userChoice; } catch { /* dismissed */ }
    $('installBar').hidden = true;
  };

  $('installDismiss').onclick = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    $('installBar').hidden = true;
  };

  if (isIos() && !dismissed()) {
    // No install API on iOS, so say the steps rather than show a dead button.
    show('Add to your home screen', 'Tap Share, then Add to Home Screen.', false);
  }
}

export function wireOfflineNote() {
  const note = $('offlineNote');
  const paint = () => {
    if (navigator.onLine) {
      note.hidden = true;
    } else {
      note.textContent = 'Offline. Your card still works.';
      note.hidden = false;
    }
  };
  window.addEventListener('online', paint);
  window.addEventListener('offline', paint);
  paint();
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  // Captured before registering: after it, the answer is no longer meaningful.
  const hadController = !!navigator.serviceWorker.controller;

  window.addEventListener('load', async () => {
    let reg;
    try {
      // Relative, so the app still works from a subfolder and from an
      // ephemeral tunnel origin.
      reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch {
      return;   // http origins and private modes: nothing to do
    }

    const offerUpdate = (worker) => {
      $('updateBar').hidden = false;
      $('updateNow').onclick = () => {
        worker.postMessage('skip-waiting');
      };
    };

    if (reg.waiting) offerUpdate(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const next = reg.installing;
      if (!next) return;
      next.addEventListener('statechange', () => {
        // A waiting worker with a controller present means this is an update,
        // not the very first install.
        if (next.state === 'installed' && navigator.serviceWorker.controller) {
          offerUpdate(next);
        }
      });
    });

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Only reload when replacing an EXISTING controller. On a first load the
      // worker claims an uncontrolled page and this fires from null, which
      // would reload the first-run editor out from under someone typing.
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
  });
}
