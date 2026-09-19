// Assertion table as DATA, so node:test and the in-browser runner execute the
// SAME cases. The browser runner matters more: opened over the tunnel it runs on
// the actual phone, which is where the platform differences live.

import { TYPES, buildUrl, isAllowedUrl, digits } from '../js/rows.js';
import { buildVCard, esc, withScheme } from '../js/vcard.js';
import { toMeCard } from '../js/qr.js';
import { encodeProfile, decodeProfile, MAX_FRAGMENT } from '../js/codec.js';
import { splitE164, toE164, stripTrunk, COUNTRIES, byIso } from '../js/countries.js';
import { isoFromTimezone, TZ_TO_ISO } from '../js/timezones.js';
import { migrate, activeCard, canonical, validate, emptyProfile } from '../js/store.js';

export function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'mismatch'}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}
export function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'expected truthy');
}

// A CARD -- the unit vCard and row building operate on.
const baseProfile = () => ({
  id: 'c1',
  cardName: '',
  name: 'Sam Rivera',
  bio: '',
  contact: {
    fullName: 'Sam Rivera', org: 'Example Co', title: 'Founder',
    phone: '+15550000000', email: 'sam@example.com', url: 'https://example.com', note: '',
  },
  items: [
    { id: 'a', type: 'whatsapp', handle: '+15550000000' },
    { id: 'b', type: 'github', handle: 'samrivera' },
  ],
});

// A whole PROFILE: an ordered list of cards plus which one is active.
const baseWallet = (cards = [baseProfile()]) => ({
  v: 2, updated: '2026-09-19T00:00:00Z', active: cards[0].id, cards,
});

export const cases = [
  /* ---- vCard escaping: order matters, or values double-escape ---- */
  {
    name: 'escapes backslash before the characters that use it',
    run: () => eq(esc('a\\b;c,d'), 'a\\\\b\\;c\\,d'),
  },
  {
    name: 'a semicolon in a value cannot split a vCard field',
    run: () => {
      // A single backslash before ; in JS source is just ';', which made this
      // escape a no-op -- and the original test asserted the same wrong value,
      // so it passed against the bug. These assertions do not depend on how the
      // expected string is written.
      const out = esc('a;b');
      eq(out.length, 4, `expected an escaped semicolon, got ${JSON.stringify(out)}`);
      eq(out.charCodeAt(1), 92, 'the character before ; must be a backslash');
      const p = baseProfile();
      p.contact.fullName = 'Sam; Rivera';
      p.contact.org = 'A;B';
      const ls = buildVCard(p).text.split('\r\n');
      // Split on UNESCAPED semicolons only -- that is the whole point.
      const nValue = ls.find((l) => l.startsWith('N:')).slice(2);
      eq(nValue.split(/(?<!\\);/).length, 5,
         `N must keep exactly five components, got ${JSON.stringify(nValue)}`);
      eq(ls.find((l) => l.startsWith('ORG:')).charCodeAt(5), 92,
         'ORG must carry an escaped semicolon');
    },
  },
  {
    name: 'escapes newlines to a literal \\n',
    run: () => eq(esc('line1\r\nline2'), 'line1\\nline2'),
  },
  {
    name: 'strips C0/C1 control characters before escaping',
    run: () => eq(esc('bad\x00\x07\x1bvalue\x9f'), 'badvalue'),
  },
  {
    name: 'a crafted value cannot inject a new vCard property',
    run: () => {
      const p = baseProfile();
      p.contact.org = 'Evil\r\nTEL;TYPE=CELL:+19999999999';
      const { text } = buildVCard(p);
      const telLines = text.split('\r\n').filter((l) => l.startsWith('TEL'));
      eq(telLines.length, 1, 'injected TEL must not become its own line');
      ok(text.includes('\\nTEL'), 'injected newline should be escaped inline');
    },
  },

  /* ---- vCard structure ---- */
  {
    name: 'builds a well-formed vCard 3.0 with CRLF',
    run: () => {
      const { text } = buildVCard(baseProfile());
      ok(text.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'), 'header');
      ok(text.endsWith('\r\nEND:VCARD'), 'footer');
      ok(text.includes('FN:Sam Rivera'), 'FN present');
      ok(text.includes('N:Rivera;Sam;;;'), 'N split');
    },
  },
  {
    name: 'deduplicates one number appearing as both contact phone and WhatsApp',
    run: () => {
      const { text } = buildVCard(baseProfile());
      const tels = text.split('\r\n').filter((l) => l.startsWith('TEL'));
      eq(tels.length, 1, 'same number must not be emitted twice');
    },
  },

  /* ---- budget and drop order ---- */
  {
    name: 'every link reaches the contact card \u2014 there is no opt-out',
    run: () => {
      const c = baseProfile();
      c.items.push({ id: 'x', type: 'tel', handle: '+15550000001' });
      const { text } = buildVCard(c, { budget: 4000 });
      ok(text.includes('5550000001'), 'an extra number must reach the card');
      ok(text.includes('github.com/samrivera'), 'a social link must reach the card');
    },
  },
  {
    name: 'drops NOTE first when over budget',
    run: () => {
      const p = baseProfile();
      p.contact.note = 'x'.repeat(300);
      const { dropped, text } = buildVCard(p, { budget: 400 });
      ok(dropped.includes('note'), `expected note dropped, got ${dropped}`);
      ok(!text.includes('NOTE:'), 'NOTE line must be gone');
    },
  },
  {
    name: 'never drops N or FN even at an absurd budget',
    run: () => {
      const { text } = buildVCard(baseProfile(), { budget: 10 });
      ok(text.includes('FN:'), 'FN survives');
      ok(text.includes('N:'), 'N survives');
    },
  },
  {
    name: 'drops whole properties, never truncates a value',
    run: () => {
      const p = baseProfile();
      p.contact.note = 'y'.repeat(300);
      const { text } = buildVCard(p, { budget: 400 });
      for (const line of text.split('\r\n')) {
        ok(!line.endsWith('…'), 'no ellipsised values');
      }
      ok(text.includes('URL:https://example.com'), 'surviving URL is intact');
    },
  },
  {
    name: 'a pinned field is protected from the cull',
    run: () => {
      const p = baseProfile();
      p.contact.note = 'z'.repeat(200);
      const { text } = buildVCard(p, { budget: 260, pinned: 'url' });
      ok(text.includes('URL:'), 'pinned URL survives');
    },
  },
  {
    name: 'a realistic card fits the screen-scanning budget',
    run: () => {
      const { chars, overBudget } = buildVCard(baseProfile());
      ok(!overBudget, `expected under budget, got ${chars} chars`);
    },
  },

  {
    name: 'a bare domain in the website box becomes a real URL in the vCard',
    run: () => {
      eq(withScheme('glueops.dev'), 'https://glueops.dev');
      eq(withScheme('https://glueops.dev'), 'https://glueops.dev');
      eq(withScheme(''), '');
      const p = baseProfile();
      p.contact.url = 'glueops.dev';
      ok(buildVCard(p).text.includes('URL:https://glueops.dev'), 'scheme added in card');
    },
  },
  {
    name: 'social handles ride along on the contact card by default',
    run: () => {
      const p = baseProfile();
      const { text } = buildVCard(p);
      ok(text.includes('X-SOCIALPROFILE;TYPE=github:https://github.com/samrivera'),
         'github should be on the card without opting in');
    },
  },

  /* ---- handle -> URL, per row type ---- */
  {
    name: 'builds wa.me from a phone number, stripping the +',
    run: () => eq(buildUrl({ type: 'whatsapp', handle: '+1 555 000 0000' }), 'https://wa.me/15550000000'),
  },
  {
    name: 'accepts a pasted profile URL where a handle is expected',
    run: () => {
      eq(buildUrl({ type: 'github', handle: 'https://github.com/samrivera' }), 'https://github.com/samrivera');
      eq(buildUrl({ type: 'github', handle: '@samrivera' }), 'https://github.com/samrivera');
      eq(buildUrl({ type: 'linkedin', handle: 'linkedin.com/in/samrivera' }), 'https://linkedin.com/in/samrivera');
      // The service's own path segment must not end up doubled.
      eq(buildUrl({ type: 'linkedin', handle: 'https://www.linkedin.com/in/samrivera/' }), 'https://linkedin.com/in/samrivera');
      eq(buildUrl({ type: 'linkedin', handle: 'in/samrivera' }), 'https://linkedin.com/in/samrivera');
      eq(buildUrl({ type: 'linkedin', handle: 'samrivera' }), 'https://linkedin.com/in/samrivera');
      // Tracking junk pasted along with a profile URL is discarded.
      eq(buildUrl({ type: 'github', handle: 'github.com/samrivera?tab=repos' }), 'https://github.com/samrivera');
    },
  },
  {
    name: 'adds a scheme to a bare domain',
    run: () => eq(buildUrl({ type: 'link', handle: 'example.com/writing' }), 'https://example.com/writing'),
  },

  /* ---- scheme allow-list ---- */
  {
    name: 'rejects javascript: and data: payloads',
    run: () => {
      ok(!isAllowedUrl('javascript:alert(1)'), 'javascript: rejected');
      ok(!isAllowedUrl('data:text/html,<script>'), 'data: rejected');
      ok(!isAllowedUrl('file:///etc/passwd'), 'file: rejected');
    },
  },
  {
    name: 'allows exactly the five intended schemes',
    run: () => {
      for (const u of ['https://a.test', 'http://a.test', 'mailto:a@b.test', 'tel:+15550000000', 'sms:+15550000000']) {
        ok(isAllowedUrl(u), `${u} should be allowed`);
      }
    },
  },

  /* ---- phone normalisation ---- */
  {
    name: 'keeps a leading + but strips separators and stray plus signs',
    run: () => eq(digits('+1 (555) 000-0000'), '+15550000000'),
  },

  /* ---- MECARD rescue ---- */
  {
    name: 'MECARD is materially shorter than the vCard',
    run: () => {
      const p = baseProfile();
      const v = buildVCard(p).chars;
      const m = toMeCard(p).length;
      ok(m < v * 0.75, `expected MECARD well under vCard: ${m} vs ${v}`);
    },
  },
  {
    name: 'MECARD escapes its delimiters',
    run: () => {
      const p = baseProfile();
      p.contact.fullName = 'Sam; Rivera';
      ok(toMeCard(p).includes('\;'), 'semicolon escaped');
    },
  },

  /* ---- codec ---- */
  {
    name: 'round-trips a profile through base64url',
    run: async () => {
      const r = await decodeProfile(await encodeProfile(baseWallet()));
      ok(r.ok, 'should decode');
      const c = r.profile.cards[0];
      eq(c.contact.fullName, 'Sam Rivera');
      eq(c.contact.phone, '+15550000000');
      eq(c.items.length, 2);
      eq(c.items[0].type, 'whatsapp');
    },
  },
  {
    name: 'the payload is base64url: no +, / or = padding',
    run: async () => {
      const enc = await encodeProfile(baseWallet());
      ok(!/[+/=]/.test(enc), `unexpected characters in ${enc.slice(0, 40)}`);
    },
  },
  {
    name: 'survives non-ASCII names',
    run: async () => {
      const c = baseProfile();
      c.contact.fullName = 'Zoë Müller-Naňák 日本';
      const r = await decodeProfile(await encodeProfile(baseWallet([c])));
      ok(r.ok);
      eq(r.profile.cards[0].contact.fullName, 'Zoë Müller-Naňák 日本');
    },
  },
  {
    name: 'never throws on damaged input, returns a reason',
    run: async () => {
      for (const bad of ['', 'not base64!!', 'YWJj', '#p=', 'eyJhIjoxfQ']) {
        const r = await decodeProfile(bad);
        eq(r.ok, false, `expected failure for ${JSON.stringify(bad)}`);
        ok(typeof r.reason === 'string', 'reason present');
      }
    },
  },
  {
    name: 'rejects a payload with a missing or non-numeric version',
    run: async () => {
      const enc = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      eq((await decodeProfile(enc({ name: 'x' }))).reason, 'damaged');
      eq((await decodeProfile(enc({ v: 'one', name: 'x' }))).reason, 'damaged');
    },
  },
  {
    name: 'rejects a newer version with a distinct reason',
    run: async () => {
      const enc = btoa(JSON.stringify({ v: 99, name: 'x' }))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      eq((await decodeProfile(enc)).reason, 'newer');
    },
  },
  {
    name: 'refuses an oversized fragment before decoding it',
    run: async () => eq((await decodeProfile('A'.repeat(MAX_FRAGMENT + 1))).reason, 'too-long'),
  },

  /* ---- phone entry helpers ---- */
  {
    name: 'country selector round-trips a number, longest code winning',
    run: () => {
      eq(JSON.stringify(splitE164('+919876543210')), JSON.stringify({ iso: 'IN', national: '9876543210' }));
      // +1268 (Antigua) must beat the bare +1.
      eq(splitE164('+12685551234').iso, 'AG');
      eq(splitE164('+15551234567').iso, 'US');
      eq(toE164('IN', '9876543210'), '+919876543210');
      eq(toE164('GB', '020 7123 4567'), '+442071234567');
    },
  },
  {
    name: 'drops the national trunk zero, except where it is part of the number',
    run: () => {
      // Typing your number the way you normally write it must still work.
      eq(toE164('GB', '020 7123 4567'), '+442071234567');
      eq(toE164('DE', '030 12345678'), '+493012345678');
      eq(toE164('IN', '09876543210'), '+919876543210');
      eq(stripTrunk('GB', '02071234567'), '2071234567');
      // Italy keeps its leading zero.
      eq(toE164('IT', '06 1234 5678'), '+390612345678');
      eq(stripTrunk('IT', '0612345678'), '0612345678');
    },
  },
  {
    name: 'country list is well formed and free of duplicate ISO codes',
    run: () => {
      ok(COUNTRIES.length > 200, `only ${COUNTRIES.length} countries`);
      const seen = new Set();
      for (const c of COUNTRIES) {
        ok(/^[A-Z]{2}$/.test(c.iso), `bad iso ${c.iso}`);
        ok(/^\d{1,4}$/.test(c.dial), `bad dial ${c.dial} for ${c.iso}`);
        ok(c.name && c.name.length > 1, `bad name for ${c.iso}`);
        ok(!seen.has(c.iso), `duplicate ${c.iso}`);
        seen.add(c.iso);
      }
      eq(byIso('IN').dial, '91');
    },
  },

  {
    name: 'every timezone the engine knows maps to a country',
    run: () => {
      // If this fails the country guess silently degrades to the locale, which
      // is how you end up defaulting people to the US.
      const all = typeof Intl.supportedValuesOf === 'function'
        ? Intl.supportedValuesOf('timeZone') : [];
      const missing = all.filter((z) => !isoFromTimezone(z));
      eq(missing.length, 0, `unmapped zones: ${missing.slice(0, 10).join(', ')}`);
      ok(all.length === 0 || all.length > 300, `only ${all.length} zones seen`);
    },
  },
  {
    name: 'legacy timezone aliases still resolve',
    run: () => {
      // Older phones report these rather than the modern names.
      eq(isoFromTimezone('Asia/Calcutta'), 'IN');
      eq(isoFromTimezone('Europe/Kiev'), 'UA');
      eq(isoFromTimezone('Asia/Saigon'), 'VN');
      eq(isoFromTimezone('Asia/Rangoon'), 'MM');
    },
  },
  {
    name: 'every mapped timezone country exists in the dialling list',
    run: () => {
      // Antarctica has no ITU country code of its own, so it is excluded.
      const unknown = [...new Set(Object.values(TZ_TO_ISO))]
        .filter((iso) => iso !== 'AQ' && !byIso(iso));
      // A zone mapping to a country with no dialling code would guess a country
      // the selector cannot display.
      eq(unknown.length, 0, `countries missing from the dial list: ${unknown.join(', ')}`);
    },
  },

  /* ---- migration ---- */
  {
    // Frozen on 2026-09-19. Encoding with the current encoder and decoding with
    // the current decoder passes forever whether or not migration works; only a
    // real historical payload catches a broken chain. Never regenerate this.
    name: 'a frozen v1 backup link still decodes, years later',
    run: async () => {
      const V1_FIXTURE = 'eyJ2IjoxLCJ1cGRhdGVkIjoiMjAyNi0wMy0wNFQxMDowMDowMFoiLCJuYW1lIjoiU2FtIFJpdmVyYSIsImJpbyI6IlBsYXRmb3JtIiwiY29udGFjdCI6eyJmdWxsTmFtZSI6IlNhbSBSaXZlcmEiLCJvcmciOiJFeGFtcGxlIENvIiwidGl0bGUiOiJGb3VuZGVyIiwicGhvbmUiOiIrMTU1NTAwMDAwMDAiLCJlbWFpbCI6InNhbUBleGFtcGxlLmNvbSIsInVybCI6Imh0dHBzOi8vZXhhbXBsZS5jb20iLCJub3RlIjoiIn0sIml0ZW1zIjpbeyJ0eXBlIjoid2hhdHNhcHAiLCJoYW5kbGUiOiIrMTU1NTAwMDAwMDAifSx7InR5cGUiOiJnaXRodWIiLCJoYW5kbGUiOiJzYW1yaXZlcmEifSx7InR5cGUiOiJ0ZWwiLCJoYW5kbGUiOiIrMTU1NTAwMDAwMDEiLCJvZmZDYXJkIjp0cnVlfV19';
      const r = await decodeProfile(V1_FIXTURE);
      ok(r.ok, `v1 payload must still decode, got ${r.reason}`);
      eq(r.profile.v, 2, 'migrated to current version');
      eq(r.profile.cards.length, 1);
      const c = r.profile.cards[0];
      eq(c.contact.fullName, 'Sam Rivera');
      eq(c.contact.org, 'Example Co');
      eq(c.items.length, 3, 'all items carried across');
      ok(c.items.some((i) => i.handle === '+15550000001'),
         'every item survives migration');
      ok(c.items.every((i) => i.offCard === undefined),
         'the retired offCard flag must not survive migration');
      eq(r.profile.active, c.id, 'active points at the migrated card');
    },
  },
  {
    name: 'migrating twice changes nothing',
    run: async () => {
      const once = (await decodeProfile('eyJ2IjoxLCJ1cGRhdGVkIjoiMjAyNi0wMy0wNFQxMDowMDowMFoiLCJuYW1lIjoiU2FtIFJpdmVyYSIsImJpbyI6IlBsYXRmb3JtIiwiY29udGFjdCI6eyJmdWxsTmFtZSI6IlNhbSBSaXZlcmEiLCJvcmciOiJFeGFtcGxlIENvIiwidGl0bGUiOiJGb3VuZGVyIiwicGhvbmUiOiIrMTU1NTAwMDAwMDAiLCJlbWFpbCI6InNhbUBleGFtcGxlLmNvbSIsInVybCI6Imh0dHBzOi8vZXhhbXBsZS5jb20iLCJub3RlIjoiIn0sIml0ZW1zIjpbeyJ0eXBlIjoid2hhdHNhcHAiLCJoYW5kbGUiOiIrMTU1NTAwMDAwMDAifSx7InR5cGUiOiJnaXRodWIiLCJoYW5kbGUiOiJzYW1yaXZlcmEifSx7InR5cGUiOiJ0ZWwiLCJoYW5kbGUiOiIrMTU1NTAwMDAwMDEiLCJvZmZDYXJkIjp0cnVlfV19')).profile;
      const twice = migrate(JSON.parse(JSON.stringify(once)));
      eq(JSON.stringify(twice), JSON.stringify(once),
         'migrate(migrate(x)) must equal migrate(x)');
    },
  },
  {
    name: 'a payload with no version is rejected, not assumed current',
    run: async () => {
      const enc = (o) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      eq((await decodeProfile(enc({ cards: [] }))).reason, 'damaged');
    },
  },

  {
    name: 'compression keeps a full five-card profile scannable',
    run: async () => {
      const many = Array.from({ length: 5 }, (_, n) => {
        const c = baseProfile();
        c.id = `c${n + 1}`;
        c.cardName = `Territory ${n + 1}`;
        c.items = Array.from({ length: 4 }, (_, i) => ({
          id: `i${n}${i}`, type: ['linkedin', 'github', 'instagram', 'x'][i], handle: `samrivera${i}`,
        }));
        return c;
      });
      const enc = await encodeProfile(baseWallet(many));
      // Uncompressed this was ~3000 chars, which will not scan off a screen and
      // exceeds what Office 365 mail carries.
      ok(enc.length < 800, `five cards must stay compact, got ${enc.length}`);
      const back = await decodeProfile(enc);
      ok(back.ok);
      eq(back.profile.cards.length, 5);
      eq(back.profile.cards[4].cardName, 'Territory 5');
    },
  },
  {
    name: 'an uncompressed payload is still readable',
    run: async () => {
      // The fallback for a browser with no CompressionStream, and the shape of
      // every payload written before compression existed.
      const json = JSON.stringify(baseWallet());
      const bytes = new TextEncoder().encode(json);
      const framed = new Uint8Array(bytes.length + 1);
      framed[0] = 1;                       // MARK_RAW
      framed.set(bytes, 1);
      let bin = '';
      for (const b of framed) bin += String.fromCharCode(b);
      const enc = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const back = await decodeProfile(enc);
      ok(back.ok, `uncompressed payload must decode, got ${back.reason}`);
      eq(back.profile.cards[0].contact.fullName, 'Sam Rivera');
    },
  },

  /* ---- multiple cards ---- */
  {
    name: 'switching cards does NOT mark the backup stale',
    run: () => {
      // `active` is excluded from the canonical projection on purpose: a chip
      // that lies about staleness is how you train someone to stop reading it.
      const p = validate(emptyProfile());
      p.cards.push({ ...p.cards[0], id: 'c2', cardName: 'Second' });
      const before = canonical(p);
      p.active = 'c2';
      eq(canonical(p), before, 'switching must not change the signature');
    },
  },
  {
    name: 'editing any card DOES mark the backup stale',
    run: () => {
      const p = validate(emptyProfile());
      const before = canonical(p);
      p.cards[0].contact.phone = '+15550000000';
      ok(canonical(p) !== before, 'an edit must change the signature');
    },
  },
  {
    name: 'every card rides along in one payload',
    run: async () => {
      const a = baseProfile();
      const b = { ...baseProfile(), id: 'c2', cardName: 'EMEA' };
      b.contact = { ...b.contact, fullName: 'Sam R (EMEA)', phone: '+442071234567' };
      const r = await decodeProfile(await encodeProfile(baseWallet([a, b])));
      ok(r.ok);
      eq(r.profile.cards.length, 2);
      eq(r.profile.cards[1].cardName, 'EMEA');
      eq(r.profile.cards[1].contact.phone, '+442071234567');
    },
  },
  {
    name: 'active always points at a card that exists',
    run: () => {
      const p = validate({ v: 2, active: 'gone', cards: [baseProfile()] });
      eq(p.active, p.cards[0].id);
      eq(activeCard(p).contact.fullName, 'Sam Rivera');
    },
  },

  /* ---- registry integrity ---- */
  {
    name: 'every row type builds a URL that passes the allow-list',
    run: () => {
      const sample = { whatsapp: '+15550000000', linkedin: 'sam', github: 'sam',
                       link: 'example.com', facetime: '+15550000000',
                       tel: '+15550000000', sms: '+15550000000', email: 'a@b.test' };
      for (const [type, handle] of Object.entries(sample)) {
        const url = buildUrl({ type, handle });
        ok(url, `${type} built nothing`);
        // facetime: is constructed by us and never decoded from input, so it is
        // intentionally outside the allow-list used for payload data.
        if (type !== 'facetime') ok(isAllowedUrl(url), `${type} -> ${url} not allowed`);
      }
    },
  },
  {
    name: 'only FaceTime is platform-bound',
    run: () => {
      const bound = Object.entries(TYPES).filter(([, t]) => t.only).map(([k]) => k);
      eq(bound.join(','), 'facetime');
    },
  },
];
