// Boot.

import { load, save, emptyProfile, activeCard, ALL_KEYS, requestPersistence } from './store.js';
import { decodeProfile, readFragment, REASONS } from './codec.js';
import { renderHome, wireMove, wireCards, wireHeader, openEditor, openMove, toast } from './ui.js';
import { wireQrView, openQr } from './qrview.js';
import { registerServiceWorker, wireInstallPrompt, wireOfflineNote } from './install.js';

async function boot() {
  // A backup link opens straight into a restore prompt. This is the path that
  // carries a card from a desktop browser into the installed app, where storage
  // is a separate bucket and nothing else can reach across.
  const fragment = readFragment();
  if (fragment) {
    const result = await decodeProfile(fragment);
    history.replaceState(null, '', location.pathname);
    if (!result.ok) {
      const held = load();
      const usable = held && !held.newer ? held : emptyProfile();
      startApp(usable, !held);
      toast(REASONS[result.reason] || REASONS.damaged, 5000);
      return;
    }
    const existing = load();
    const cards = result.profile.cards || [];
    const here = existing?.cards?.length || 0;

    // Always confirm, and always say WHO is coming in. Previously an empty
    // device imported with no prompt at all -- which is the state a fresh
    // install is in, and an installed app has its own empty bucket. A swapped
    // card is worse than a wiped one: you keep handing out someone else's
    // number without noticing.
    const who = cards.map((c, i) => {
      const k = c.contact || {};
      const name = c.cardName || k.fullName || c.name || `Card ${i + 1}`;
      const detail = [k.phone, k.email].filter(Boolean).join(', ');
      return detail ? `  \u2022 ${name} \u2014 ${detail}` : `  \u2022 ${name}`;
    }).join('\n');

    const proceed = confirm(
      `This link contains ${cards.length} card${cards.length === 1 ? '' : 's'}:\n\n${who}\n\n`
      + (here
          ? `It will replace the ${here} card${here === 1 ? '' : 's'} already on this phone.\n\nContinue?`
          : 'Add them to this phone?')
    );
    if (proceed) {
      const res = save(result.profile);
      if (res.ok) {
        startApp(res.profile, false);
        toast('Restored on this device');
        return;
      }
    }
  }

  const stored = load();

  if (stored && stored.newer) {
    // Previously a dead end: a sentence and no way forward. Reloading will not
    // help, so offer the one action that can.
    document.body.textContent = '';
    const wrap = document.createElement('main');
    wrap.className = 'home';
    const p = document.createElement('p');
    p.textContent = 'This card was saved by a newer version of the app. '
      + 'Update the app to open it, or clear it from this phone and restore from your backup link.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--wide';
    btn.textContent = 'Clear it from this phone';
    btn.onclick = () => {
      if (!confirm('Remove the stored card from this phone? Your backup link still works.')) return;
      for (const k of ALL_KEYS) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
      location.href = location.pathname;
    };
    wrap.appendChild(p);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    return;
  }

  startApp(stored || emptyProfile(), !stored);
}

function startApp(profile, firstRun) {
  wireQrView(profile);
  wireHeader(profile);
  wireMove(profile);
  wireCards(profile);
  wireInstallPrompt();
  wireOfflineNote();
  renderHome(profile);

  if (firstRun) { openEditor(profile); return; }

  // ?card=<id> opens straight to that card: the home-screen icon for a card
  // points here.
  const params = new URLSearchParams(location.search);
  const wanted = params.get('card');
  if (wanted && profile.cards?.some((c) => c.id === wanted) && profile.active !== wanted) {
    profile.active = wanted;
    save(profile);
    renderHome(profile);
  }

  const target = params.get('qr');
  if (target === 'contact') {
    openQr({ kind: 'contact' }, profile);
  } else if (target === 'backup' || target === 'move' || target === 'install') {
    openMove(profile, { fromEditor: false });
  } else if (target) {
    const items = activeCard(profile).items || [];
    const item = items.find((i) => i.id === target || i.type === target);
    if (item) openQr({ kind: 'item', item }, profile);
  }
}

registerServiceWorker();
requestPersistence();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
