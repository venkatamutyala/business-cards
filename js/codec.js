// The backup / transfer payload.
//
// base64url of [1 marker byte][payload] in the URL FRAGMENT.
//
// Compression was originally rejected: with one small card it saved ~500
// characters and cost an async encoder plus a fallback path. Several cards per
// profile changed that arithmetic completely -- JSON full of repeated keys
// compresses enormously, and without it the transfer QR stops scanning at three
// cards and the link exceeds what Office 365 mail will carry:
//
//   3 cards: 1676 -> 404 chars (76% smaller)
//   5 cards: 3024 -> 472 chars (84% smaller)
//
// Compressed, a five-card profile is smaller than one uncompressed card was.
//
// The fragment matters. A query string is sent to the server and lands in access
// logs -- your phone number with it. A fragment never leaves the browser.

import { VERSION, validate, migrate } from './store.js';

export const MAX_FRAGMENT = 32 * 1024;
// A compressed payload must not be able to expand without bound.
export const MAX_DECOMPRESSED = 256 * 1024;

const b64u = {
  enc(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const norm = str.replace(/-/g, '+').replace(/_/g, '/');
    const s = atob(norm);
    const a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  },
};


// One byte in front of the payload says how to read it. Legacy payloads have no
// marker and begin with '{' (0x7B), which is why the markers start at 1 -- an
// old backup link must keep working forever.
const MARK_RAW = 1;
const MARK_DEFLATE = 2;
const LEGACY_JSON = 0x7b;

const canCompress = () =>
  typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function squeeze(bytes, Ctor, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new Ctor(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function withMarker(mark, bytes) {
  const out = new Uint8Array(bytes.length + 1);
  out[0] = mark;
  out.set(bytes, 1);
  return out;
}

// Readable key names, deliberately. This is a debugging surface now, not a byte
// budget -- the old short-key scheme existed to fit a QR ceiling that no longer
// applies, since the backup link is never rendered as a code.
//
export async function encodeProfile(profile) {
  const p = validate(profile);
  const json = JSON.stringify({
    v: p.v,
    updated: p.updated,
    active: p.active,
    cards: p.cards.map((c) => ({
      id: c.id,
      ...(c.cardName ? { cardName: c.cardName } : {}),
      ...(c.greeting ? { greeting: c.greeting } : {}),
      ...(c.subject ? { subject: c.subject } : {}),
      contact: c.contact,
      items: c.items.map((i) => ({
        type: i.type,
        handle: i.handle,
        ...(i.label ? { label: i.label } : {}),
      })),
    })),
  });
  const bytes = new TextEncoder().encode(json);
  if (!canCompress()) return b64u.enc(withMarker(MARK_RAW, bytes));
  try {
    const packed = await squeeze(bytes, CompressionStream, 'deflate-raw');
    // Only worth it if it actually helps; a tiny payload can grow.
    return packed.length < bytes.length
      ? b64u.enc(withMarker(MARK_DEFLATE, packed))
      : b64u.enc(withMarker(MARK_RAW, bytes));
  } catch {
    return b64u.enc(withMarker(MARK_RAW, bytes));
  }
}

// Never throws, and never leaves a blank screen.
export async function decodeProfile(str) {
  if (typeof str !== 'string' || !str) return { ok: false, reason: 'empty' };
  if (str.length > MAX_FRAGMENT) return { ok: false, reason: 'too-long' };
  let parsed;
  try {
    const bytes = b64u.dec(str);
    if (!bytes.length) return { ok: false, reason: 'damaged' };
    let json;
    if (bytes[0] === LEGACY_JSON) {
      json = new TextDecoder().decode(bytes);            // pre-marker payload
    } else if (bytes[0] === MARK_RAW) {
      json = new TextDecoder().decode(bytes.subarray(1));
    } else if (bytes[0] === MARK_DEFLATE) {
      if (!canCompress()) return { ok: false, reason: 'no-decompress' };
      const out = await squeeze(bytes.subarray(1), DecompressionStream, 'deflate-raw');
      if (out.length > MAX_DECOMPRESSED) return { ok: false, reason: 'too-long' };
      json = new TextDecoder().decode(out);
    } else {
      return { ok: false, reason: 'damaged' };
    }
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'damaged' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, reason: 'damaged' };
  // A missing or non-numeric version is rejected rather than assumed current:
  // reading a newer-shaped payload as latest would silently drop half its fields.
  if (typeof parsed.v !== 'number') return { ok: false, reason: 'damaged' };
  // One migration chain, shared with storage load.
  const migrated = migrate(parsed);
  if (!migrated) return { ok: false, reason: 'damaged' };
  if (migrated.newer) return { ok: false, reason: 'newer' };
  return { ok: true, profile: migrated };
}

export async function backupLink(profile, origin = location.href) {
  const base = origin.split('#')[0].split('?')[0];
  return `${base}#p=${await encodeProfile(profile)}`;
}

export function readFragment(hash = location.hash) {
  const m = /^#p=(.+)$/.exec(hash || '');
  return m ? m[1] : null;
}

export const REASONS = {
  empty:      'Nothing to read there.',
  'too-long': 'That is not a backup link from this app.',
  damaged:    'That link is damaged or incomplete. Open the whole backup link again.',
  newer:      'That link was made by a newer version of the app. Update the app, then try again.',
  'no-decompress': 'This browser is too old to open that link. Try Chrome or Safari.',
};
