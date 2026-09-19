// Row type registry. Adding a service is ONE entry here: the editor's add menu
// is derived from these keys, and a missing icon falls back to a generic glyph.
// Set `addable: false` to keep a type out of the menu.
//
// Each type declares how a stored handle becomes a destination URL, how it maps
// into a vCard property, and whether it is platform-bound. Nothing else in the
// app knows the difference between WhatsApp and GitHub.

export const digits = (s) => String(s || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');

// Accept what people actually paste: "instagram.com/me", "@me",
// "https://linkedin.com/in/me", or just "me".
// `prefix` is the service's own path segment (LinkedIn's "in"), stripped so a
// pasted profile URL does not end up doubled as /in/in/me.
const bareHandle = (s, prefix = '') => {
  let v = String(s || '').trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^@/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  // Strip a leading host only when it actually looks like one, so a bare
  // "in/me" is not mistaken for a domain.
  v = v.replace(/^[^/\s]*\.[^/\s]*\//, '');
  if (prefix) {
    const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/+', 'i');
    v = v.replace(re, '');
  }
  return v.replace(/^\/+/, '');
};

export const TYPES = {
  whatsapp: {
    label: 'WhatsApp',
    input: 'phone',
    url: (h) => `https://wa.me/${digits(h).replace(/^\+/, '')}`,
    vcard: 'TEL;TYPE=CELL',
    prefill: { body: 'text' },
    // Works offline via Universal/App Link when WhatsApp is installed; falls back
    // to an install page (needing data) when it is not.
    note: 'Opens a chat. Needs WhatsApp installed on their phone.',
  },
  linkedin: {
    label: 'LinkedIn',
    input: 'handle',
    url: (h) => `https://linkedin.com/in/${bareHandle(h, 'in')}`,
    vcard: 'X-SOCIALPROFILE;TYPE=linkedin',
  },
  github: {
    label: 'GitHub',
    input: 'handle',
    url: (h) => `https://github.com/${bareHandle(h)}`,
    vcard: 'X-SOCIALPROFILE;TYPE=github',
  },
  link: {
    label: 'Link',
    input: 'url',
    url: (h) => (/^https?:\/\//i.test(h) ? h : `https://${String(h).replace(/^\/+/, '')}`),
    vcard: 'URL',
  },
  instagram: {
    label: 'Instagram',
    input: 'handle',
    url: (h) => `https://instagram.com/${bareHandle(h)}`,
    vcard: 'X-SOCIALPROFILE;TYPE=instagram',
  },
  x: {
    label: 'X',
    input: 'handle',
    url: (h) => `https://x.com/${bareHandle(h)}`,
    vcard: 'X-SOCIALPROFILE;TYPE=x',
  },
  telegram: {
    label: 'Telegram',
    input: 'handle',
    url: (h) => `https://t.me/${bareHandle(h)}`,
    vcard: 'X-SOCIALPROFILE;TYPE=telegram',
  },
  signal: {
    label: 'Signal',
    input: 'phone',
    url: (h) => `https://signal.me/#p/${digits(h)}`,
    vcard: 'TEL;TYPE=CELL',
  },
  facetime: {
    label: 'FaceTime',
    input: 'phone',
    url: (h) => `facetime:${digits(h)}`,
    vcard: null,
    only: 'ios',              // resolved statically; shown as a caption, not a toggle
  },
  tel: {
    label: 'Phone',
    input: 'phone',
    url: (h) => `tel:${digits(h)}`,
    vcard: 'TEL;TYPE=CELL',
    // Some Android OEM camera apps silently ignore non-http schemes: nothing
    // happens and neither person knows why. Permanent caution, not a toggle.
    caution: 'Some Android cameras ignore this. Use My contact card instead.',
  },
  sms: {
    label: 'Text message',
    input: 'phone',
    url: (h) => `sms:${digits(h)}`,
    vcard: 'TEL;TYPE=CELL',
    prefill: { body: 'body' },
    caution: 'Some Android cameras ignore this. Use My contact card instead.',
  },
  email: {
    label: 'Email',
    input: 'email',
    url: (h) => `mailto:${String(h).trim()}`,
    vcard: 'EMAIL;TYPE=INTERNET',
    prefill: { subject: 'subject', body: 'body' },
  },
};

// `{name}` expands to the card owner's name, so duplicating a card does not
// leave a stale name baked into the text. The message is prefilled in THEIR
// app, addressed to you -- it is written in their voice and they tap send.
export function renderGreeting(text, ownerName) {
  // First name: a greeting says "Hi Venkat", not "Hi Venkat Mutyala".
  const first = String(ownerName || '').trim().split(/\s+/)[0] || '';
  return String(text || '').replace(/\{name\}/gi, first);
}

// Append a prefilled message to a destination, where the channel supports it.
// Returns the url unchanged when it does not.
export function withMessage(url, type, { greeting = '', subject = '' } = {}) {
  const t = TYPES[type];
  if (!t?.prefill || !url) return url;
  const parts = [];
  if (t.prefill.subject && subject) parts.push(`${t.prefill.subject}=${encodeURIComponent(subject)}`);
  if (t.prefill.body && greeting) parts.push(`${t.prefill.body}=${encodeURIComponent(greeting)}`);
  if (!parts.length) return url;
  return url + (url.includes('?') ? '&' : '?') + parts.join('&');
}

export const ALLOWED_SCHEMES = ['https:', 'http:', 'mailto:', 'tel:', 'sms:'];

// Additionally renderable because the app builds them itself from the registry;
// a crafted payload supplies only a handle, never a scheme.
export const RENDERABLE_SCHEMES = [...ALLOWED_SCHEMES, 'facetime:'];

// Payload data is hostile until proven otherwise; facetime: is built by us, never decoded.
export function isAllowedUrl(u) {
  try {
    return ALLOWED_SCHEMES.includes(new URL(u).protocol);
  } catch {
    return false;
  }
}

export function isRenderableUrl(u) {
  try {
    return RENDERABLE_SCHEMES.includes(new URL(u).protocol);
  } catch {
    return false;
  }
}

export function buildUrl(item) {
  const t = TYPES[item.type];
  if (!t) return null;
  const value = item.handle ?? item.url ?? '';
  if (!value) return null;
  try {
    return t.url(value);
  } catch {
    return null;
  }
}

export function labelFor(item) {
  return item.label || TYPES[item.type]?.label || item.type;
}
