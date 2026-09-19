// Home list and the full-screen QR view.
//
// Governing constraint: for the 3-8 seconds that matter the phone is facing AWAY
// from its owner. Anything on the QR surface is read by the recipient, not by the
// person holding it. Hence: no swipe navigation (an accidental swipe as you raise
// the phone silently swaps the code and they scan the wrong thing), grip margins
// with no interactive targets, edge-swipe rejection, nothing scrollable, no
// transitions, and an instruction aimed at them rather than debug text aimed at us.

import { TYPES, buildUrl, labelFor, renderGreeting } from './rows.js';
import { buildVCard, VCARD_BUDGET } from './vcard.js';
import { iconSvg } from './icons.js';
import { renderQr } from './qr.js';
import { $, el, rid } from './dom.js';
import { openQr } from './qrview.js';
import { installState } from './install.js';
import { save, backupState, markBackedUp, activeCard, cardLabel, emptyCard, CAPS } from './store.js';
import { backupLink } from './codec.js';
import { renderEditor } from './editor.js';



// Step 3 differs by payload because the useful lever differs: a contact card can
// switch to the much shorter MECARD, while a link has nothing to shorten and
// instead gets heavier error correction, which is what survives glare and smudge.

export function toast(message, ms = 2400) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

/* ---------------- Home ---------------- */

// One variable, not six booleans. Each open/close path used to re-implement the
// teardown of the others by hand, which is where the "editing the wrong card"
// and "return to the wrong screen" bugs both came from.
//
// The QR view is deliberately NOT a surface: it is an overlay with its own
// history entry, and it can sit on top of any of these.
let surface = 'home';        // 'home' | 'editor' | 'cards' | 'move'
let returnTo = 'home';       // where Move's Done goes back to

/* ---------------- Move: one transfer surface ---------------- */
//
// The Phone QR and the Backup link were the same string -- backupLink() -- shown
// as a code and as text, in two panels with two different warnings. One panel now.

let moveRevealed = false;   // move-local, not navigation: reset on every entry

export function appUrl() {
  return location.origin + location.pathname;
}

// Every transition goes through here, so hide/show, class and reset work lives
// in exactly one place.
function showSurface(next, profile, opts = {}) {
  const leaving = surface;

  // Leaving the editor commits, unless the caller is explicitly discarding.
  if (leaving === 'editor' && next !== 'editor' && opts.save !== false) {
    const res = save(profile);
    if (!res.ok) {
      toast('Could not save on this device. Check your browser storage settings.', 4200);
      return false;
    }
    Object.assign(profile, res.profile);
  }

  surface = next;
  if (next === 'move') moveRevealed = false;

  $('editor').hidden = next !== 'editor';
  $('cards').hidden = next !== 'cards';
  $('move').hidden = next !== 'move';
  if (next !== 'editor') $('editor').textContent = '';

  const home = $('home');
  home.classList.toggle('is-editing', next === 'editor');
  home.classList.toggle('is-sheet', next === 'cards' || next === 'move');
  $('editBtn').textContent = next === 'editor' ? 'Done' : 'Edit';

  if (next === 'editor') {
    renderEditor($('editor'), activeCard(profile), {
      onChange: () => renderHome(profile),
      onDone: () => showSurface('home', profile),
    });
  } else if (next === 'cards') {
    paintCards(profile);
  } else if (next === 'move') {
    paintMove(profile);
  }

  renderHome(profile);
  window.scrollTo({ top: 0 });
  if (next === 'home' && leaving === 'editor') toast('Saved on this device');
  return true;
}

export function openMove(profile, opts = {}) {
  returnTo = opts.from || 'home';
  showSurface('move', profile);
}

export function closeMove(profile) {
  showSurface(returnTo, profile);
  returnTo = 'home';
}

async function paintMove(profile) {
  const n = profile.cards?.length || 1;
  $('moveQrWrap').hidden = !moveRevealed;
  $('revealMove').hidden = moveRevealed;
  paintBackupBits(profile);          // fire and forget: paints as soon as it can
  if (!moveRevealed) return;

  // Always carries the card: a code that opens an empty app is a payload nobody
  // wants, which is why there is no longer a checkbox for it.
  const target = await backupLink(profile, appUrl());

  // This code is denser than the contact card -- it carries the whole payload
  // plus the app URL -- and it is scanned off this screen by another phone, so
  // it needs the room.
  const wide = window.matchMedia('(min-width: 46rem)').matches;
  const info = renderQr($('moveCanvas'), target, {
    fraction: 0.78,
    maxFraction: 0.94,
    minPxPerModule: 4.5,
    maxCss: wide ? 380 : Infinity,
  });
  $('moveCanvas').setAttribute('aria-label', 'QR code that opens this app on another device with your card');

  // The only device-dependent text in the app. The header label never changes,
  // or it starts to feel like two different apps.
  const st = installState();
  // "Scan this with your phone" reads as THEIR phone in a face-to-face moment.
  // Name the destination and exclude everyone else in the same breath.
  const lines = ['Point your other phone at this. Not anyone else\u2019s.'];
  if (!st.standalone && st.ios) lines.push('Then: Share \u2192 Add to Home Screen.');
  else if (!st.standalone && !st.ios) lines.push('Then use your browser menu to install it.');
  $('moveCaption').textContent = lines.join(' ');

  // Not exposure -- handover. Whoever scans this gets an editable copy of the
  // whole card, which is a different and worse thing than seeing it.
  $('moveWarn').textContent =
    (n > 1
      ? `Carries all ${n} of your cards. Anyone who scans this gets a full copy of them, not just a look.`
      : 'Anyone who scans this gets a full copy of your card, not just a look at it.');

  // Compression moved the ceiling; it did not remove it. Rather than cap what
  // someone may store, say plainly when the code has outgrown a screen and
  // point at the route that has no ceiling at all.
  const size = $('moveSize');
  if (info.tooDense) {
    size.textContent = `This code is too dense to scan off a screen (${target.length} characters). `
      + 'Copy your backup link below and send it to your other phone instead.';
    size.className = 'block__warn';
  } else {
    size.textContent = `${target.length} characters.`;
    size.className = 'block__note';
  }

  // The preview belongs where the exposure is. Seeing your own number sitting
  // there does the work a louder sentence will not.
  $('movePeek').textContent = peek(profile);

}

async function paintBackupBits(profile) {
  const state = backupState(profile);
  const chip = $('sheetChip');
  chip.hidden = !(state.stale || !state.everBackedUp);
  chip.textContent = !state.everBackedUp
    ? 'You have not copied a backup link yet. This device holds the only copy.'
    : `Your cards changed since you copied a link on ${fmtDate(state.at)}.`;
  chip.classList.toggle('is-stale', !chip.hidden);

  $('backupLink').value = await backupLink(profile);
  $('backupLink').hidden = true;
  $('linkWarn').textContent =
    'Looks scrambled, isn\u2019t encrypted. Anyone with this link can read your details.';
}

function peek(profile) {
  // Names every card, because the transfer code carries all of them.
  return (profile.cards || []).map((c, i) => {
    const k = c.contact || {};
    const head = (profile.cards.length > 1 ? `${cardLabel(c, i)}: ` : '');
    return head + [k.fullName, k.phone, k.email, k.url].filter(Boolean).join(', ');
  }).join('\n');
}

function fmtDate(iso) {
  if (!iso) return 'earlier';
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  } catch { return 'earlier'; }
}

export function wireHeader(profile) {
  $('editBtn').onclick = () =>
    (surface === 'editor' ? closeEditor(profile) : openEditor(profile));
}

export function wireMove(profile) {
  $('moveBtn').onclick = () => {
    openMove(profile, { from: surface === 'cards' ? 'cards' : 'home' });
  };

  $('revealMove').onclick = () => { moveRevealed = true; paintMove(profile); };

  $('sheetClose').onclick = () => closeMove(profile);

  $('copyLink').onclick = async () => {
    const box = $('backupLink');
    // Build it here rather than trusting whatever the async repaint has managed
    // to put in the textarea.
    const link = await backupLink(profile);
    if (!link || !link.includes('#p=')) {
      toast('Could not build your backup link. Try again.', 4000);
      return;
    }
    box.value = link;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(link);
      else { box.focus(); box.select(); if (!document.execCommand?.('copy')) throw new Error('no copy'); }
      markBackedUp(profile);
      paintMove(profile);
      toast('Link copied. Keep it somewhere private.');
    } catch {
      // Only now is the raw string useful: it has to be selectable by hand.
      box.hidden = false;
      box.focus(); box.select();
      toast('Select the link and copy it manually', 4000);
    }
  };

  window.addEventListener('resize', () => { if (surface === 'move') paintMove(profile); });
}


// Every shareable thing is a row, including the contact-card fields. Nothing is
// pinned or pre-rendered: you pick the one you want to hand over.
export function displayRows(card) {
  const c = card.contact || {};
  const rows = [];

  if (c.fullName) rows.push({ kind: 'contact' });

  // Synthesised from the contact card so each field is individually shareable.
  // Prefixed ids cannot collide with a real item id.
  if (c.phone) rows.push({ kind: 'item', item: { id: '_phone', type: 'tel', handle: c.phone, label: 'Phone' } });
  if (c.email) rows.push({ kind: 'item', item: { id: '_email', type: 'email', handle: c.email, label: 'Email' } });
  if (c.url)   rows.push({ kind: 'item', item: { id: '_web', type: 'link', handle: c.url, label: 'Website' } });

  for (const item of card.items || []) {
    if (TYPES[item.type] && (item.handle || '').trim()) rows.push({ kind: 'item', item });
  }
  return rows;
}

/* ---------------- card switcher ---------------- */


function paintSwitcher(profile) {
  const n = profile.cards?.length || 1;
  $('cardSwitch').disabled = surface === 'editor';
  const btn = $('cardSwitch');
  $('cardSwitchName').textContent = n > 1 ? cardLabel(activeCard(profile)) : 'My card';
  // The title is the only route to backup, so it has to read as a control at a
  // glance -- a bare caret next to a heading does not. Pill styling does the
  // "tappable" work; the count does the "there are others" work.
  const idx = Math.max(0, (profile.cards || []).findIndex((c) => c.id === profile.active)) + 1;
  $('cardSwitchCount').hidden = n < 2;
  $('cardSwitchCount').textContent = `${idx}/${n}`;
  $('cardSwitchStack').hidden = n < 2;
  $('cardSwitchStack').textContent = '';
  if (n > 1) {
    const g = iconSvg('copy', { size: 15, color: 'currentColor' });
    if (g) $('cardSwitchStack').appendChild(g);
  }
  btn.setAttribute('aria-label', n > 1
    ? `Card ${idx} of ${n}: ${cardLabel(activeCard(profile))}. Switch card, or back up.`
    : 'My cards and backup');
}

export function openCards(profile) {
  if (surface === 'editor') return;   // switching mid-edit rebinds the editor
  showSurface('cards', profile);
}

export function closeCards(profile) {
  showSurface('home', profile);
}

function iconBtn(content, ariaLabel, title) {
  const b = el('button', 'iconbtn');
  b.type = 'button';
  b.setAttribute('aria-label', ariaLabel);
  b.title = title;
  if (typeof content === 'string') b.textContent = content;
  else if (content) b.appendChild(content);
  return b;
}

// A copy, not a reference: every id is regenerated, so editing the duplicate
// cannot reach back into the original.
function duplicateCard(profile, card, index) {
  if (profile.cards.length >= CAPS.cards) return;
  const copy = JSON.parse(JSON.stringify(card));
  copy.id = rid('c');
  copy.items = (copy.items || []).map((it) => ({ ...it, id: rid('i') }));
  const base = (card.cardName || cardLabel(card, index)).replace(/ \(copy( \d+)?\)$/, '');
  let name = `${base} (copy)`;
  let n = 2;
  while (profile.cards.some((c) => (c.cardName || '') === name)) name = `${base} (copy ${n++})`;
  copy.cardName = name.slice(0, CAPS.label);

  // Lands next to the card it came from, not at the end of the list.
  profile.cards.splice(index + 1, 0, copy);
  profile.active = copy.id;
  save(profile);
  paintCards(profile);
  toast(`Copied to \u201c${copy.cardName}\u201d`);
}

function paintCards(profile) {
  const list = $('cardList');
  list.textContent = '';

  profile.cards.forEach((c, i) => {
    const li = el('li', 'cardrow' + (c.id === profile.active ? ' is-active' : ''));

    const pick = el('button', 'cardrow__pick');
    pick.type = 'button';
    pick.appendChild(el('span', 'cardrow__name', cardLabel(c, i)));
    const bits = [c.contact?.org, `${c.items.length} link${c.items.length === 1 ? '' : 's'}`]
      .filter(Boolean).join(' \u00b7 ');
    pick.appendChild(el('span', 'cardrow__sub', bits));
    pick.onclick = () => {
      profile.active = c.id;
      // Switching is not an edit, so it must not mark the backup stale --
      // `active` is excluded from the canonical projection for this reason.
      save(profile);
      closeCards(profile);
    };
    li.appendChild(pick);

    const ren = iconBtn('\u270e', `Rename ${cardLabel(c, i)}`, 'Rename this card');
    ren.onclick = () => {
      const next = prompt('Name this card (for you only \u2014 nobody scanning it sees this):', c.cardName || '');
      if (next === null) return;
      c.cardName = next.trim().slice(0, CAPS.label);
      save(profile);
      paintCards(profile);
    };
    li.appendChild(ren);

    const dup = iconBtn(iconSvg('copy', { size: 17 }),
      `Duplicate ${cardLabel(c, i)}`, 'Make a copy of this card');
    dup.disabled = profile.cards.length >= CAPS.cards;
    dup.onclick = () => duplicateCard(profile, c, i);
    li.appendChild(dup);

    if (profile.cards.length > 1) {
      const del = iconBtn('\u2715', `Delete ${cardLabel(c, i)}`, 'Delete this card');
      del.onclick = () => {
        if (!confirm(`Delete "${cardLabel(c, i)}"? Your other cards are untouched.`)) return;
        profile.cards = profile.cards.filter((x) => x.id !== c.id);
        if (profile.active === c.id) profile.active = profile.cards[0].id;
        save(profile);
        paintCards(profile);
      };
      li.appendChild(del);
    }

    list.appendChild(li);
  });

  const full = profile.cards.length >= CAPS.cards;
  $('addCard').disabled = full;
  $('addCard').textContent = 'Add a card';
  // One installed app, many cards: switching inside it is the supported path.
  // Browsers will not give one origin a second home-screen icon, so promising
  // an icon per card was promising something the platform does not do.
  $('cardsNote').textContent = full
    ? `You can have up to ${CAPS.cards} cards.`
    : profile.cards.length > 1
      ? 'The app opens on whichever card you used last. Your backup covers every card.'
      : 'Your backup covers every card.';
}

export function wireCards(profile) {
  $('cardSwitch').onclick = () => (surface === 'cards' ? closeCards(profile) : openCards(profile));
  $('cardsClose').onclick = () => closeCards(profile);
  $('addCard').onclick = () => {
    if (profile.cards.length >= CAPS.cards) return;
    const card = emptyCard();
    profile.cards.push(card);
    profile.active = card.id;
    save(profile);
    showSurface('editor', profile);
  };
}

/* ---------------- editor ---------------- */

export function openEditor(profile) {
  showSurface('editor', profile);
}

export function closeEditor(profile) {
  showSurface('home', profile);
}

export function renderHome(profile, opts = {}) {
  paintSwitcher(profile);
  const list = $('rows');
  list.hidden = surface === 'editor';
  list.textContent = '';
  if (surface === 'editor') return;

  const card = activeCard(profile);
  const rows = displayRows(card);

  if (!rows.length) {
    const empty = el('li', 'rows__empty');
    empty.appendChild(el('p', null, 'Nothing to share yet. Tap Edit to add your details.'));
    // Restoring is done by opening your backup link, so say that rather than
    // offering a button that leads somewhere with nothing on it.
    empty.appendChild(el('p', 'rows__hint', 'Already have a card? Open your backup link to bring it back.'));
    list.appendChild(empty);
    return;
  }

  for (const row of rows) {
    list.appendChild(row.kind === 'contact'
      ? allRowEl(profile)
      : rowEl(row.item, TYPES[row.item.type], profile));
  }
}


// The one code that carries the whole card: works with no internet on either
// phone and needs no app on theirs.
function allRowEl(profile) {
  const li = el('li', 'row row--all');
  const btn = el('button', 'row__btn');
  btn.type = 'button';

  const glyph = iconSvg('card', { size: 26 });
  if (glyph) {
    const holder = el('span', 'row__icon');
    holder.appendChild(glyph);
    btn.appendChild(holder);
  }

  const wrap = el('span');
  wrap.appendChild(el('span', 'row__label', 'My contact card'));
  wrap.appendChild(document.createElement('br'));
  wrap.appendChild(el('span', 'row__value', 'They scan it, you are in their contacts. No app, no internet.'));

  btn.appendChild(wrap);
  btn.onclick = () => openQr({ kind: 'contact' }, profile);
  li.appendChild(btn);
  return li;
}


function rowEl(item, t, profile) {
  const li = document.createElement('li');
  li.className = 'row';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'row__btn';

  const glyph = iconSvg(item.type, { size: 26 });
  if (glyph) {
    const holder = document.createElement('span');
    holder.className = 'row__icon';
    holder.appendChild(glyph);
    btn.appendChild(holder);
  }

  const wrap = document.createElement('span');

  const label = document.createElement('span');
  label.className = 'row__label';
  label.textContent = labelFor(item);
  wrap.appendChild(label);

  const value = document.createElement('span');
  value.className = 'row__value';
  value.textContent = item.handle || item.url || '';
  wrap.appendChild(document.createElement('br'));
  wrap.appendChild(value);

  // Platform-bound rows and unreliable schemes are captioned statically. This is
  // what replaced the recipient toggle: no control, no stored preference, no
  // decision to make while someone is waiting.
  const flags = [];
  const card = activeCard(profile);
  if (t.prefill && card.greeting) flags.push('Greeting attached');
  if (t.only === 'ios') flags.push('iPhone only');
  if (t.caution) flags.push(t.caution);
  if (flags.length) {
    const f = document.createElement('span');
    f.className = 'row__flags' + (t.caution ? ' is-caution' : '');
    f.textContent = flags.join(' · ');
    wrap.appendChild(document.createElement('br'));
    wrap.appendChild(f);
  }

  btn.appendChild(wrap);
  btn.onclick = () => openQr({ kind: 'item', item }, profile);
  li.appendChild(btn);
  return li;
}
