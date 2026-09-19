// The full-screen QR view: the surface the whole product exists for.
//
// Deliberately not one of the `surface` states in ui.js -- it is an overlay with
// its own history entry that can sit on top of any of them.
//
// Governing constraint: for the seconds that matter the phone faces AWAY from
// its owner, who cannot see this screen. Hence no swipe navigation, grip
// margins with no targets, a caption aimed at the recipient, and a labelled
// rescue ladder rather than silent changes.

import { TYPES, buildUrl, labelFor, isRenderableUrl, withMessage, renderGreeting } from './rows.js';
import { buildVCard } from './vcard.js';
import { renderQr, toMeCard, ECC } from './qr.js';
import { iconSvg } from './icons.js';
import { activeCard, cardLabel } from './store.js';
import { $ } from './dom.js';
import { toast } from './ui.js';

const RESCUE_LABELS = {
  contact: ["Doesn't scan?", 'Make it brighter (1 of 3)', 'Make it bigger (2 of 3)', 'Try a different code (3 of 3)'],
  item:    ["Doesn't scan?", 'Make it brighter (1 of 3)', 'Make it bigger (2 of 3)', 'Try a different code (3 of 3)'],
};

function firstName(profile) {
  const c = profile.cards ? activeCard(profile) : profile;
  const full = c.contact?.fullName || c.name || '';
  return full.trim().split(/\s+/)[0] || 'me';
}

let current = null;        // { kind: 'contact' | 'item', item }
let rescueStep = 0;        // 0 none, 1 brighter, 2 bigger, 3 alternate encoding
let textMode = false;      // universal fallback: show the details to be read/typed
let lastFocused = null;
let wakeLock = null;
let wakeLockWarned = false;


function payloadFor(target, profile) {
  if (target.kind === 'contact') {
    const card = activeCard(profile);
    if (rescueStep === 3) return { text: toMeCard(card), kind: 'mecard', ecc: ECC.L };
    return { text: buildVCard(card).text, kind: 'vcard', ecc: ECC.L };
  }
  const card = activeCard(profile);
  const url = withMessage(buildUrl(target.item), target.item.type, {
    greeting: renderGreeting(card.greeting, card.contact?.fullName),
    subject: card.subject,
  });
  // ECC is never lowered -- L is the floor -- but the last rung may raise it.
  return { text: url, kind: 'url', ecc: rescueStep === 3 ? ECC.Q : ECC.L };
}

export function openQr(target, profile) {
  if (target.kind === 'item') {
    const url = buildUrl(target.item);
    // A crafted or malformed entry must never become a live link.
    if (!url || !isRenderableUrl(url)) {
      toast('That link looks wrong and was not shown.');
      return;
    }
  }

  current = { ...target, profile };
  rescueStep = 0;
  textMode = false;
  lastFocused = document.activeElement;

  const view = $('qrview');
  view.hidden = false;
  document.body.style.overflow = 'hidden';

  // Back gesture / hardware back closes the QR rather than leaving the app.
  history.pushState({ qr: true }, '');

  paintQr();
  requestWakeLock();

  view.addEventListener('keydown', trapFocus);
  $('qrClose').focus();
}

function paintQr() {
  const { profile } = current;
  const view = $('qrview');
  const { text, kind, ecc } = payloadFor(current, profile);

  view.classList.toggle('is-bright', rescueStep >= 1);

  // Rescue ladder. Step 1 strips every non-code pixel to white and grows the
  // code, because auto-brightness in a dim room is the failure the wake lock
  // does not solve. ECC is never lowered -- L is already the floor.
  // Fill the screen. On a phone this is the whole reason the view exists, and
  // every pixel of module size is a scan that works first time in bad light.
  const fraction = rescueStep >= 2 ? 1 : rescueStep >= 1 ? 0.99 : 0.97;

  // Measure the stage rather than the viewport: on a wide screen they are
  // nothing alike, and the code has to sit between caption and buttons.
  const stage = $('qrview').querySelector('.qrview__stage');
  const rect = stage.getBoundingClientRect();
  const chrome = rescueStep >= 1 ? 16 : 96;   // caption + destination + mark
  const wide = window.matchMedia('(min-width: 46rem)').matches;

  // On a phone the stage is a fixed grid row, so measuring it is right. On a
  // desktop the card is centred and sized to its own content, so measuring its
  // height would feed the canvas back its own size and collapse it -- budget
  // from the viewport there instead.
  const box = {
    w: Math.max(200, rect.width),
    h: wide
      ? Math.max(240, window.innerHeight * 0.62)
      : Math.max(200, rect.height - chrome),
  };
  const info = renderQr($('qrCanvas'), text, {
    fraction, ecc, box,
    maxCss: wide ? (rescueStep >= 1 ? 620 : 460) : Infinity,
  });

  const name = firstName(profile);
  const isContact = current.kind === 'contact';
  const multi = (profile.cards?.length || 1) > 1;
  const which = multi ? ` \u00b7 ${cardLabel(activeCard(profile))}` : '';
  const instruct = isContact
    ? `Scan to add ${name} to contacts${which}`
    : `Scan for ${labelFor(current.item)}${which}`;

  const mark = $('qrMark');
  mark.textContent = '';
  // Beside the code, never on it: at error correction L there is no redundancy
  // to spare for a logo punched through the middle.
  const markGlyph = iconSvg(isContact ? 'card' : current.item.type, { size: 30 });
  if (markGlyph) mark.appendChild(markGlyph);
  mark.hidden = !markGlyph;

  $('qrTitle').textContent = instruct;
  $('qrCanvas').setAttribute('aria-label', `${instruct}. ${shortDest(text, kind)}`);
  $('qrDest').textContent = kind === 'url' ? shortDest(text, kind) : '';

  const notes = [];
  if (kind === 'mecard') notes.push('Smaller code. Organisation and job title are not included.');
  if (kind === 'url' && rescueStep === 3) notes.push('Sturdier code, better in glare.');
  if (info.tooDense) notes.push('This code is dense. Hold it closer.');
  if (isContact) {
    // Discovering a missing number from their face, after they have added you,
    // is the failure this prevents.
    const card = buildVCard(activeCard(profile));
    if (card.dropped.length) notes.push(`Not included: ${card.dropped.join(', ')}.`);
  } else {
    const t = TYPES[current.item.type];
    // You are holding this away from you and cannot see it, so say whether a
    // greeting is riding along.
    const greeting = renderGreeting(activeCard(profile).greeting, activeCard(profile).contact?.fullName);
    if (t?.prefill && greeting) notes.push('Your greeting is ready for them to send.');
    if (t?.caution) notes.push(t.caution);
    else if (t?.note) notes.push(t.note);
  }
  $('qrNote').textContent = notes.join(' ');

  $('rescueBtn').textContent = RESCUE_LABELS[isContact ? 'contact' : 'item'][rescueStep];
  $('qrText').textContent = textMode ? 'Show the QR code' : 'Show as text';
  paintTextPanel(isContact, text, kind);

  const primary = $('qrPrimary');
  if (isContact) {
    primary.textContent = 'Send contact';
    primary.hidden = false;
  } else {
    primary.textContent = 'Open link';
    primary.hidden = false;
  }
  $('qrCopy').hidden = isContact;
}

// One fallback for every cause of a failed scan. For a contact card the raw
// vCard is useless to read aloud, so this shows the fields themselves.
function paintTextPanel(isContact, text, kind) {
  const panel = $('qrTextPanel');
  panel.textContent = '';
  panel.hidden = !textMode;
  $('qrCanvas').hidden = textMode;
  if (!textMode) return;

  const add = (tag, value) => {
    if (!value) return;
    const el = document.createElement(tag);
    el.textContent = value;
    panel.appendChild(el);
  };

  if (isContact) {
    const card = activeCard(current.profile);
    const c = card.contact || {};
    add('i', 'Type these in:');
    add('b', c.fullName);
    add('span', c.phone);
    add('span', c.email);
    add('span', c.url);
  } else {
    add('i', 'Type this in:');
    add('b', text);
  }
}

function shortDest(text, kind) {
  if (kind !== 'url') return '';
  try {
    const u = new URL(text);
    const tail = (u.pathname + u.search).replace(/\/$/, '');
    return u.host + (tail.length > 28 ? tail.slice(0, 27) + '…' : tail);
  } catch {
    return text.slice(0, 40);
  }
}

export function closeQr() {
  const view = $('qrview');
  if (view.hidden) return;
  view.hidden = true;
  view.classList.remove('is-bright');
  view.removeEventListener('keydown', trapFocus);
  document.body.style.overflow = '';
  releaseWakeLock();
  // Return focus to the row that opened it, not the top of the list.
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  current = null;
}

function trapFocus(e) {
  if (e.key === 'Escape') { e.preventDefault(); history.back(); return; }
  if (e.key !== 'Tab') return;
  const focusable = [...$('qrview').querySelectorAll('button:not([hidden])')];
  if (!focusable.length) return;
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}


export function wireQrView(profile) {

  $('rescueBtn').onclick = () => {
    rescueStep = (rescueStep + 1) % 4;   // wraps back to normal
    paintQr();
  };

  $('qrText').onclick = () => { textMode = !textMode; paintQr(); };

  $('qrClose').onclick = () => history.back();

  $('qrCopy').onclick = async () => {
    const { text, kind } = payloadFor(current, current.profile);
    if (kind !== 'url') return;
    try {
      await navigator.clipboard.writeText(text);
      toast('Link copied');
    } catch {
      toast('Could not copy on this browser');
    }
  };

  $('qrPrimary').onclick = () => {
    if (current.kind === 'contact') return shareContact();
    const { text } = payloadFor(current, current.profile);
    window.open(text, '_blank', 'noopener,noreferrer');
  };

  // Swallow edge swipes so a grip on the bezel cannot dismiss the view. On a
  // phone these are dead zones on purpose -- fingers wrap the sides of a handset
  // held outward. With a mouse there is no such hazard, so a click on the
  // backdrop closes, which is what a desktop overlay is expected to do.
  for (const grip of document.querySelectorAll('.qrview__grip')) {
    grip.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    grip.addEventListener('click', (e) => {
      if (e.pointerType === 'touch' || !matchMedia('(pointer: fine)').matches) return;
      history.back();
    });
  }

  window.addEventListener('popstate', () => closeQr());

  // Re-render on rotation/resize so the module scale stays an integer.
  window.addEventListener('resize', () => { if (current) paintQr(); });
}

// iOS standalone silently ignores blob downloads, so the File goes through Web
// Share. It must be constructed BEFORE navigator.share in the same gesture --
// Safari drops transient activation across an await.
function shareContact() {
  const { profile } = current;
  let file;
  try {
    const ac = activeCard(profile);
    const { text } = buildVCard(ac);
    const safe = (ac.contact?.fullName || 'contact').replace(/[^\w.-]+/g, '_');
    file = new File([text], `${safe}.vcf`, { type: 'text/vcard' });
  } catch {
    toast('Could not build the contact file');
    return;
  }

  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file] }).catch(() => { /* user cancelled */ });
    return;
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Saved contact file');
}

let wakeGeneration = 0;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) { warnWakeLock(); return; }
  const mine = ++wakeGeneration;
  try {
    const lock = await navigator.wakeLock.request('screen');
    // The view may have closed while this was in flight.
    if (mine !== wakeGeneration || !current) { lock.release().catch(() => {}); return; }
    wakeLock = lock;
  } catch {
    warnWakeLock();
  }
}

// Platforms drop the lock when the page is hidden; coming back from a
// notification would otherwise leave the screen dimming mid-handover.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && current && !wakeLock) requestWakeLock();
});

// A dimming screen is the one failure invisible to the person who could fix it,
// so it is surfaced once rather than failing silently forever.
function warnWakeLock() {
  if (wakeLockWarned) return;
  wakeLockWarned = true;
  toast('Your screen may dim. Turn brightness up before showing a code.', 3600);
}

function releaseWakeLock() {
  wakeGeneration++;                 // invalidate any request still in flight
  try { wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
}

