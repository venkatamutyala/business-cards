import { rid } from './dom.js';

// Local storage. This device holds the only copy, which is why backup is a
// first-class feature rather than a footnote.
//
// v2 wraps the v1 card shape rather than replacing it: a card is still
// { name, bio, contact, items }, and a profile is now an ordered list of them
// plus which one is active. Everything downstream still takes a card.

const KEY       = 'q4m.profile';
const KEY_PREV  = 'q4m.profile.prev';
const KEY_SIG   = 'q4m.backup.sig';
const KEY_AT    = 'q4m.backup.at';

// Enumerated, never cleared by prefix, so a future key cannot be forgotten.
// Other modules register their own rather than store.js hardcoding them --
// a key that is never registered is a key the clear path would miss.
export const ALL_KEYS = [KEY, KEY_PREV, KEY_SIG, KEY_AT];

export function registerKey(name) {
  if (!ALL_KEYS.includes(name)) ALL_KEYS.push(name);
  return name;
}

export const CAPS = {
  cards: 5,          // a rep with nine personas has a different problem
  items: 60,
  label: 80,
  greeting: 240,   // long enough for a sentence, short enough to stay scannable
  handle: 256,
  name: 120,
  note: 300,
};

export const VERSION = 2;

const clamp = (v, n) => String(v ?? '').slice(0, n);


export function emptyCard(id = rid('c')) {
  return {
    id,
    cardName: '',
    greeting: '',
    subject: '',
    contact: { fullName: '', org: '', title: '', phone: '', email: '', url: '', note: '' },
    items: [],
  };
}

export function emptyProfile() {
  const card = emptyCard('c1');
  return { v: VERSION, updated: new Date().toISOString(), active: card.id, cards: [card] };
}

export function validateCard(c, n = 0) {
  const base = emptyCard(`c${n + 1}`);
  if (!c || typeof c !== 'object') return base;
  const k = c.contact || {};
  return {
    id: typeof c.id === 'string' && c.id ? c.id : base.id,
    cardName: clamp(c.cardName, CAPS.label),
    greeting: clamp(c.greeting, CAPS.greeting),
    subject: clamp(c.subject, CAPS.label),
    contact: {
      fullName: clamp(k.fullName, CAPS.name),
      org: clamp(k.org, CAPS.label),
      title: clamp(k.title, CAPS.label),
      phone: clamp(k.phone, CAPS.handle),
      email: clamp(k.email, CAPS.handle),
      url: clamp(k.url, CAPS.handle),
      note: clamp(k.note, CAPS.note),
    },
    items: (Array.isArray(c.items) ? c.items : [])
      .slice(0, CAPS.items)
      .filter((i) => i && typeof i.type === 'string')
      .map((i, m) => ({
        id: typeof i.id === 'string' && i.id ? i.id : rid('i'),
        type: i.type,
        handle: clamp(i.handle ?? i.url, CAPS.handle),
        label: i.label ? clamp(i.label, CAPS.label) : undefined,
      })),
  };
}

// Clamps in memory only. A future caps change must not silently truncate
// stored data on the next save.
export function validate(p) {
  const base = emptyProfile();
  if (!p || typeof p !== 'object') return base;
  const cards = (Array.isArray(p.cards) ? p.cards : [])
    .slice(0, CAPS.cards)
    .map(validateCard);
  if (!cards.length) cards.push(emptyCard('c1'));
  // `active` must always point at a card that exists.
  const active = cards.some((c) => c.id === p.active) ? p.active : cards[0].id;
  return {
    v: VERSION,
    updated: typeof p.updated === 'string' ? p.updated : base.updated,
    active,
    cards,
  };
}

// Forward-only. Runs on BOTH storage load and payload decode, so there is one
// chain to maintain rather than two.
export function migrate(parsed) {
  if (!parsed || typeof parsed.v !== 'number') return null;
  let p = parsed;
  if (p.v === 1) {
    // v1 was a single card at the top level.
    p = {
      v: 2,
      updated: p.updated,
      active: 'c1',
      cards: [{
        id: 'c1',
        cardName: '',
        // v1 had a top-level `name` duplicating contact.fullName, and a `bio`
        // that was never displayed or editable. Fold one in, drop the other.
        contact: { ...(p.contact || {}), fullName: (p.contact?.fullName || p.name || '') },
        items: p.items,
      }],
    };
  }
  if (p.v > VERSION) return { newer: true };
  return validate(p);
}

export function activeCard(profile) {
  if (!profile?.cards?.length) return emptyCard();
  return profile.cards.find((c) => c.id === profile.active) || profile.cards[0];
}

export function cardLabel(card, index = 0) {
  return card.cardName || card.contact?.fullName || `Card ${index + 1}`;
}

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch {
    return null;
  }
}

export function save(profile) {
  const next = validate({ ...profile, updated: new Date().toISOString() });
  try {
    const cur = localStorage.getItem(KEY);
    if (cur) localStorage.setItem(KEY_PREV, cur);   // one step of undo, from devtools
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    return { ok: false, reason: 'storage' };
  }
  persistOnce();
  return { ok: true, profile: next };
}

// Serialised from an EXPLICIT field list. JSON.stringify is insertion-ordered, so
// building this with object spread would reorder keys on a future migration and
// mark every backup stale for no reason.
//
// `updated` and `active` are both deliberately absent: including `updated` turns
// the staleness check into a dirty flag, and including `active` would mean
// merely SWITCHING cards told you your backup was out of date, which is a lie.
export function canonical(p) {
  return JSON.stringify((p.cards || []).map((c) => {
    const k = c.contact || {};
    return [
      c.cardName, c.greeting, c.subject,
      k.fullName, k.org, k.title, k.phone, k.email, k.url, k.note,
      (c.items || []).map((i) => [i.type, i.handle, i.label || '']),
    ];
  }));
}

export function backupState(profile) {
  let sig = null, at = null;
  try { sig = localStorage.getItem(KEY_SIG); at = localStorage.getItem(KEY_AT); } catch { /* ignore */ }
  if (!sig) return { everBackedUp: false, stale: true, at: null };
  return { everBackedUp: true, stale: canonical(profile) !== sig, at };
}

export function markBackedUp(profile) {
  try {
    localStorage.setItem(KEY_SIG, canonical(profile));
    localStorage.setItem(KEY_AT, new Date().toISOString());
  } catch { /* ignore */ }
}


let persisted = false;

// WebKit grants persistence heuristically and names "opened as a Home Screen
// Web App" as one of its heuristics, so asking at boot is worth more than
// asking only after an edit.
export function requestPersistence() { persistOnce(); }

function persistOnce() {
  if (persisted || !navigator.storage?.persist) return;
  persisted = true;
  navigator.storage.persist().catch(() => { /* heuristic in WebKit; ignore */ });
}
