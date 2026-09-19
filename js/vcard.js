// vCard 3.0 builder.
//
// This is the only QR in the app that works with zero network on BOTH phones and
// needs no app installed on theirs, so it is the thing that must not break.
// CRLF, UTF-8, no line folding (mobile parsers are lenient and folding bugs are
// not worth the risk), no PHOTO.

import { TYPES, digits, isAllowedUrl } from './rows.js';

// Comfortable ceiling for scanning off a screen at arm's length. Above this the
// module count climbs and the code gets fussy in poor light.
export const VCARD_BUDGET = 400;

// Order matters: backslash first, or everything after it double-escapes.
// Applied to every VALUE. Never to property names or parameters -- those come
// from the registry, never from user input, so injecting a line is structurally
// impossible.
export function esc(value) {
  return String(value ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// A bare "example.com" typed into the website box must become a real URL, or
// scanners treat it as plain text rather than something tappable.
export function withScheme(u) {
  const v = String(u ?? '').trim();
  if (!v) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) return `https://${v.replace(/^\/+/, '')}`;
  // Everything else in the app is allow-listed; this reaches other people's
  // address books, so it must be too.
  return isAllowedUrl(v) ? v : '';
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length < 2) return { first: parts[0] || '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

// Fields are dropped whole, never truncated -- half a URL is worse than none.
// Lower rank leaves first. `pinned` protects exactly one field from the cull.
const DROP_RANK = {
  note: 1,
  socialExtra: 2,   // social profiles beyond the first two
  contactExtra: 3,  // second and later TEL/EMAIL
  url: 4,
  title: 5,
  org: 6,
};

export function buildVCard(profile, opts = {}) {
  const budget = opts.budget ?? VCARD_BUDGET;
  const pinned = opts.pinned ?? null;
  const c = profile.contact || {};
  const fullName = c.fullName || '';
  const { first, last } = splitName(fullName);

  const items = profile.items || [];

  const fields = [];
  const add = (key, line, rank, human) => fields.push({ key, line, rank, human });

  add('n', `N:${esc(last)};${esc(first)};;;`, null, 'name');
  add('fn', `FN:${esc(fullName)}`, null, 'name');
  if (c.org) add('org', `ORG:${esc(c.org)}`, DROP_RANK.org, 'organisation');
  if (c.title) add('title', `TITLE:${esc(c.title)}`, DROP_RANK.title, 'job title');

  // Telephones: contact card first, then item-derived, deduped by digits so one
  // number does not appear three times because it is also a WhatsApp row.
  const seenTel = new Set();
  const tels = [];
  if (c.phone) tels.push(c.phone);
  for (const i of items) {
    if (TYPES[i.type]?.vcard === 'TEL;TYPE=CELL' && i.handle) tels.push(i.handle);
  }
  let telIdx = 0;
  for (const t of tels) {
    const norm = digits(t).replace(/\D/g, '');
    if (!norm || seenTel.has(norm)) continue;
    seenTel.add(norm);
    add(`tel${telIdx}`, `TEL;TYPE=CELL:${esc(digits(t))}`,
        telIdx === 0 ? null : DROP_RANK.contactExtra, 'extra phone number');
    telIdx++;
  }

  const seenEmail = new Set();
  const emails = [];
  if (c.email) emails.push(c.email);
  for (const i of items) {
    if (TYPES[i.type]?.vcard === 'EMAIL;TYPE=INTERNET' && i.handle) emails.push(i.handle);
  }
  let emailIdx = 0;
  for (const e of emails) {
    const norm = String(e).trim().toLowerCase();
    if (!norm || seenEmail.has(norm)) continue;
    seenEmail.add(norm);
    add(`email${emailIdx}`, `EMAIL;TYPE=INTERNET:${esc(String(e).trim())}`,
        emailIdx === 0 ? null : DROP_RANK.contactExtra, 'extra email');
    emailIdx++;
  }

  const siteUrl = withScheme(c.url);
  if (siteUrl) add('url', `URL:${esc(siteUrl)}`, DROP_RANK.url, 'website');

  // X-SOCIALPROFILE is unreliable -- plenty of Android importers drop or bury
  // X- properties. That is precisely why the per-row social QRs still earn
  // their place alongside this card.
  let socialIdx = 0;
  for (const i of items) {
    const t = TYPES[i.type];
    if (!t?.vcard || !t.vcard.startsWith('X-SOCIALPROFILE')) continue;
    const built = t.url(i.handle);
    add(`social${socialIdx}`, `${t.vcard}:${esc(built)}`,
        socialIdx < 2 ? null : DROP_RANK.socialExtra,
        `${t.label} link`);
    socialIdx++;
  }

  if (c.note) add('note', `NOTE:${esc(c.note)}`, DROP_RANK.note, 'note');

  const assemble = (list) =>
    ['BEGIN:VCARD', 'VERSION:3.0', ...list.map((f) => f.line), 'END:VCARD'].join('\r\n');

  // Cull from the lowest rank upward until we fit.
  let kept = fields.slice();
  const dropped = [];
  const cullable = () =>
    kept
      .filter((f) => f.rank !== null && f.key !== pinned)
      .sort((a, b) => a.rank - b.rank);

  while (assemble(kept).length > budget) {
    const next = cullable()[0];
    if (!next) break;   // everything left is non-droppable; over budget but valid
    kept = kept.filter((f) => f !== next);
    if (!dropped.includes(next.human)) dropped.push(next.human);
  }

  const text = assemble(kept);
  return {
    text,
    chars: text.length,
    dropped,
    overBudget: text.length > budget,
  };
}
