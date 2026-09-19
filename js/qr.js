// QR rendering to canvas.
//
// Error correction is hardcoded L and L is the FLOOR, not a default. A screen has
// no damage to correct for, and the dominant failure scanning off glass is moire
// from the camera sampling the display's pixel grid -- bigger modules prevent
// that, which beats correcting for it afterwards. (The vendored library will
// still boost ECC for free when doing so does not increase the version, i.e.
// when the module count is unchanged. Free redundancy at no size cost.)

import { QrCode } from '../vendor/qrcodegen.js';

export const ECC = {
  L: QrCode.Ecc.LOW,
  M: QrCode.Ecc.MEDIUM,
  Q: QrCode.Ecc.QUARTILE,
  H: QrCode.Ecc.HIGH,
};

// Below this a phone camera starts hunting at arm's length in imperfect light.
export const MIN_CSS_PX_PER_MODULE = 3;

export function renderQr(canvas, text, opts = {}) {
  const ecc = opts.ecc ?? ECC.L;
  const quiet = opts.quiet ?? 4;

  const qr = QrCode.encodeText(text, ecc);
  const modules = qr.size;
  const total = modules + quiet * 2;

  const dpr = window.devicePixelRatio || 1;

  // Measure the box the code actually has to live in, not the whole viewport.
  // On a desktop the window is far bigger than the space between the caption
  // and the buttons, and sizing off the viewport pushed the code off screen.
  const box = opts.box || null;
  const shortEdge = box
    ? Math.min(box.w, box.h)
    : Math.min(window.innerWidth, window.innerHeight);

  // Grow the code rather than let module size fall toward the floor. A card
  // carrying several social links is a much denser code than a bare one, and a
  // fixed size would quietly make it harder to scan the more you put on it.
  let fraction = opts.fraction ?? 0.92;
  const maxFraction = opts.maxFraction ?? fraction;
  const minPx = opts.minPxPerModule ?? 0;
  if (minPx > 0) {
    while (fraction < maxFraction &&
           Math.floor(shortEdge * fraction * dpr / total) / dpr < minPx) {
      fraction = Math.min(maxFraction, fraction + 0.02);
    }
  }

  // Past a point a bigger code scans no better -- a phone camera resolves the
  // modules long before this -- and it only makes the layout worse.
  const maxCss = opts.maxCss ?? Infinity;
  const avail = Math.floor(Math.min(shortEdge * fraction, maxCss) * dpr);

  // Integer device pixels per module is the whole trick. A fractional scale gives
  // soft, half-lit module edges, which is exactly what cameras fail on.
  const scale = Math.max(2, Math.floor(avail / total));

  canvas.width = total * scale;
  canvas.height = total * scale;
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // Quiet zone is painted INTO the canvas so it survives a screenshot or a
  // "save image" -- a code cropped to its own edge does not scan.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (qr.getModule(x, y)) {
        ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
      }
    }
  }

  const cssPxPerModule = scale / dpr;
  return {
    version: qr.version,
    modules,
    scale,
    cssPxPerModule,
    // Known at render time, so density problems are detectable in advance
    // rather than discovered in front of someone.
    tooDense: cssPxPerModule < MIN_CSS_PX_PER_MODULE,
  };
}

// MECARD: roughly half the size of the equivalent vCard. Deliberately NOT the
// default -- there is no platform where MECARD succeeds and vCard fails, iOS
// Camera's handling of it is unverified, and it carries no ORG/TITLE. It exists
// only as the last rung of the "Doesn't scan?" ladder, where a smaller, chunkier
// code is a real lever and the cost of it carrying less is acceptable.
export function toMeCard(profile) {
  const c = profile.contact || {};
  const esc = (v) => String(v ?? '').replace(/([\;:,])/g, '\\$1');
  const parts = [];
  const name = c.fullName || '';
  if (name) {
    const bits = name.trim().split(/\s+/);
    const last = bits.length > 1 ? bits[bits.length - 1] : name;
    const first = bits.length > 1 ? bits.slice(0, -1).join(' ') : '';
    parts.push(`N:${esc(last)},${esc(first)}`);
  }
  if (c.phone) parts.push(`TEL:${esc(String(c.phone).replace(/[^\d+]/g, ''))}`);
  if (c.email) parts.push(`EMAIL:${esc(c.email)}`);
  if (c.url) parts.push(`URL:${esc(c.url)}`);
  return `MECARD:${parts.join(';')};;`;
}
