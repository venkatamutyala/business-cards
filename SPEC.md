> **Superseded.** This was the original brief. The product changed substantially
> during build — it is now a personal, offline, multi-card contact sharer with no
> link-page or multi-user story. Kept for history. See README.md for what exists.

# SPEC: offline, no-backend contact and link page (PWA)

Save this as `SPEC.md` in an empty repo and tell Claude Code: "Read SPEC.md and build it."

---

## What we're building

A personal contact and link page, in the space between Linktree and digital business cards like Popl or Blinq. The main use is **in person**: I meet someone, open the app, and they scan a QR code from my screen to get my WhatsApp, my contact card or any of my links. It also works as a normal link-in-bio page. Three properties set it apart:

1. **No backend and no user data.** A person's whole page (name, bio, links, theme, small images) is encoded into the URL fragment (`#...`). Fragments are never sent to a server, so the host only ever serves static files and I, the operator, can't see anyone's page.
2. **Installable and fully offline.** It's a PWA. After one visit the app shell works with no connection, and every page a person opens is saved on their device automatically.
3. **Editable on-device.** People build and edit their page in the app, then share a link or QR code. The link is also their backup.

Similar prior art: JustALink and OneLink (data in URL). Neither does offline caching, a saved-pages library or in-person QR sharing; that's our difference.

**The name and domain aren't decided.** Keep the app name, short name, domain and abuse contact email in one `app.config.js` and read them from there everywhere, including the manifest build step if one is needed. Use "Linkpage" as the placeholder.

## Hard constraints

- Static files only. Must work on GitHub Pages, Netlify or any static host, **including from a subfolder**, so use relative paths everywhere (`./`), including the manifest `start_url`, `scope` and service worker registration.
- **Zero external requests at runtime.** No CDNs, no web fonts, no analytics. Any library (for example a QR generator) is vendored into the repo. Use system font stacks. Enforce with a CSP meta tag: `default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'`.
- Vanilla JS with ES modules, no framework and no build step. Dev dependencies (Playwright, a static server) are fine.
- Mobile first. Respect safe-area insets, dark mode (`prefers-color-scheme`), reduced motion, visible keyboard focus, labelled form fields, 44px touch targets.

## Payload format (get this right first)

Images make URLs long, and link length is the main risk in this design, so the format must be compact.

- Build a **binary container**, then base64url-encode it **once**: `[1 byte format version][uint32 length of JSON block][deflate-raw compressed compact JSON][image blobs back to back]`. The JSON references images by index plus byte length and MIME type. Do **not** put base64 image strings inside the JSON; that base64-encodes the image twice and wastes about a third of the space.
- Compress with `CompressionStream('deflate-raw')`. If unavailable, fall back to uncompressed and mark it with a different version byte.
- Compact JSON uses short keys and arrays, and omits defaults.
- Each page carries a random `id` (created once, kept across edits), a `rev` counter and an `updated` timestamp. These let a saved copy be replaced when a newer link for the same page is opened.
- Fragment looks like `#p=<base64url>`.

**Images**

- Avatar and optional per-link thumbnails are chosen from the device, then processed on a canvas: centre-crop square, downscale (avatar 128px, thumbnails 64px), encode as WebP with JPEG fallback, stepping quality down until under a byte budget (avatar about 4 KB, thumbnail about 1.5 KB). Strip all metadata (canvas re-encode does this).
- Accept only raster types. Never accept or render SVG from a payload.

**Link length meter** (always visible in the editor and share sheet)

- Under about 2,000 characters: "Fits in a QR code and any app".
- Up to about 8,000: "Fine for messages and email. Too long for a QR code".
- Above that: "Some apps will cut this link. Remove images to shorten it".
- Offer a one-tap **Lite link** that leaves out all images.
- Also show which NFC tag the Lite link fits on. Usable URL space is roughly 130 characters on NTAG213, 480 on NTAG215 and 850 on NTAG216. Say "Fits an NTAG215 tag" or "Too long for an NFC tag".

## Treat every payload as hostile

Anyone can craft a link, so decoding is a security boundary.

- Cap fragment length before decoding, cap decompressed size while streaming (stop a decompression bomb), cap counts and string lengths (for example 60 links, 80-character titles, 300-character bio).
- URLs: allow only `https:`, `http:`, `mailto:`, `tel:`, `sms:`. Reject everything else, especially `javascript:` and `data:`. External links get `rel="noopener noreferrer"` and open in a new tab.
- Render text with `textContent` only. Never `innerHTML` with payload data.
- Colours must match a strict hex pattern. Theme values come from an allow-list.
- Images: check MIME type and magic bytes, build a `Blob`, render with an object URL, and revoke it when done.
- A damaged link shows a plain message ("This link is damaged or incomplete. Ask for it to be sent again.") and never throws to a blank screen.

## Features

**Viewing**

- Opening a link renders the page and saves it to the device library automatically, with a quiet "Saved on this device" confirmation.
- If a saved page with the same `id` exists and the new `rev` is higher, replace it. If lower, keep the saved one and offer "Open this older version anyway".
- "Make your own" entry point from any viewed page.

**Editor**

- Profile: name, bio, avatar (image or initials).
- **Contact card** (optional): full name, organisation, job title, phone numbers, emails, website, short note. This feeds the vCard features below.
- Blocks: link (title, note, URL, optional emoji or thumbnail, colour), section heading, text note, and a row of social icons (a vendored inline SVG set for common platforms, picked by URL host).
- **Messaging and social blocks that ask for a number or handle, never a URL.** The app builds the link: WhatsApp (`https://wa.me/<digits>` with an optional pre-filled greeting in `?text=`), Telegram, Signal, SMS, phone call, email (optional subject), and handle-based Instagram, TikTok, X, LinkedIn, YouTube, GitHub, Snapchat. Phone numbers must be international format; if the `+` and country code are missing, say so and show an example. In the payload, store only the block type and the handle, which is also shorter than a full URL.
- Reorder by drag and also by Move up / Move down buttons (drag alone isn't accessible). Duplicate. Delete with undo.
- **Only on this device** toggle for any block or contact-card field. These are never written into the share link or the contact QR, but they stay on my device and work in Show mode. This lets someone keep their phone number off their public link and still share it face to face. Mark them clearly in the editor, and show a count in the share sheet ("2 items stay on this device").
- Typing `instagram.com/me` becomes `https://instagram.com/me`. Invalid URLs get an inline message that says what to fix.
- Themes: about 8 presets plus custom background, surface, text and accent colours, button shape (rounded, pill, square), and font choice from system stacks (sans, rounded, serif, mono). Check text contrast and warn when it's too low.
- Live preview. Autosave the draft locally on every change. Multiple own pages are supported.

**Sharing and backup**

- Share sheet: Web Share API where available, Copy link, QR code rendered locally to canvas with Save image, and the Lite link toggle.
- **Open from link**: a paste field on the home screen. This matters on iOS, where the Home Screen app can have separate storage from Safari, so people need a way to bring their page into the installed app.
- Export and import a JSON backup file of all own pages and the library.
- Export a page as a single standalone `.html` file for people who'd rather self-host a normal short URL.

**Per-link QR codes (show mode)**

- Every link can show its own QR code so someone standing next to me can scan it from my screen. This is for the link's destination URL, not the page link, so these codes are short and scan easily.
- Two ways in: a small QR button on every link row, and a **Show mode** toggle on my own pages where tapping a link shows its QR code instead of opening it. Don't use long-press, because it collides with the browser's own link menu on iOS. Remember the toggle per device.
- The QR view is full screen: always pure black on white whatever the theme, a 4-module quiet zone, sized to the shorter screen edge, error correction level M. Show the link title and a shortened URL underneath, with "Open link" and "Copy link" buttons.
- Swipe or use Previous / Next buttons to move between links without closing. Close with a button, Escape, or the back gesture (push a history entry so Back closes the QR view and doesn't leave the app).
- Hold a Screen Wake Lock while the QR view is open so the screen doesn't dim, and release it on close. Fail silently where unsupported.
- Generate codes on demand with the vendored QR library. Never store them in the payload, so they add nothing to the link length, and they work offline.
- Works for `mailto:`, `tel:`, `sms:` and all messaging blocks. "Only on this device" blocks are included, since this is exactly what they're for.
- Available on saved pages from other people as well, through the QR button only.

**Contact card (vCard)**

- **Contact QR**: a QR code that holds the vCard itself (vCard 3.0, UTF-8, no photo), so scanning it offers "Add to contacts" on the other phone with no internet and no website. It's the first item in Show mode when a contact card exists. Keep it compact and warn if it grows past about 1,000 characters.
- **Save contact** button on every viewed page that has a contact card. It builds a `.vcf` file on the device. Test this on iOS Safari and in the installed app, where blob downloads behave differently, and fall back to the Web Share API with a File when needed. A small avatar may be included in the file, never in the QR.
- Escape commas, semicolons, backslashes and newlines in every vCard value, and strip control characters, so a crafted payload can't inject extra fields.

**NFC tags**

- A web app can't make the phone act as an NFC tag, and Web NFC only exists in Chrome on Android. So this is limited to writing my link onto a physical tag or sticker that other people tap.
- Where `NDEFReader` exists, show **Write to NFC tag**: it writes the Lite link as a URL record, reads it back to confirm, and says plainly when the link is too long for the tag. Everywhere else, hide the button and show a short note on using a tag-writing app with Copy link.
- Remind the user that editing the page changes the link, so the tag needs rewriting.

**Pages made by other people**

- Every viewed page that isn't mine carries a quiet footer line: "This page was made by the person who shared it. [App name] doesn't host or check pages." with a "Report a problem" `mailto:` to the abuse contact from `app.config.js`.
- Before opening any external link from someone else's page for the first time, no interstitial is needed, but always show the real destination host under the link title so a misleading title is easy to spot.

**Library (home screen of the installed app)**

- "My pages" and "Saved pages", each with avatar, name and saved date. Search, remove, share again.
- Store everything in IndexedDB (images as Blobs). Call `navigator.storage.persist()` after the first save and show storage use in settings, with "Delete everything on this device".

**PWA behaviour**

- Service worker precaches the shell with a versioned cache, serves cache first, revalidates in the background, and falls back to the cached `index.html` for navigations. Old caches are deleted on activate.
- When a new version is waiting, show "Update ready" with a Reload button. Don't reload on its own.
- Install: a custom Install button driven by `beforeinstallprompt` on Android and desktop. On iOS, show short "Share, then Add to Home Screen" instructions, and hide them when already running standalone.
- Manifest with 192, 512 and maskable icons, plus an apple-touch-icon. Generate simple placeholder icons.
- A status line that reads "Saved for offline use", or "Offline. Showing your saved copy".

**Stretch (only after everything above passes)**

- Signed updates: generate an ECDSA P-256 key on the device with WebCrypto, keep the private key in IndexedDB as non-extractable, include the public key and a signature in the payload, and have saved copies accept a higher `rev` only when the signature matches the pinned key. Show the length cost in the meter and make it optional per page.

## Copy and design

- Plain, specific wording from the user's side: "Save changes", "Copy link", "Remove from this device". Sentence case. Errors say what happened and how to fix it.
- The public page should look good with zero customisation. Avoid the generic look of identical rounded cards with soft grey shadows. Pick one distinctive idea for the default theme and keep the rest quiet.
- The editor is a tool, so favour clarity and density over decoration.

## Testing

- Unit tests with `node:test` for the codec: round trip with and without images, version fallback, every rejection rule in the security section, size caps, URL normalisation, handle-to-link building for each messaging block, phone number validation, vCard escaping, and that "Only on this device" items never appear in an encoded payload or contact QR.
- Playwright end to end: create a page, share, open the link in a fresh context and see it render; go offline and reload; launch with no fragment and find the page in the library; open a higher `rev` and see it replace the saved copy; open a `javascript:` link payload and confirm it's dropped; turn on Show mode, tap a link, and confirm the QR view opens, decodes to the link's URL, and closes with Back; mark a WhatsApp block as only on this device and confirm it's missing from the shared link but present in Show mode; decode the contact QR and confirm it's a valid vCard.
- A Lighthouse PWA and accessibility pass, with the fixes applied.

## How to work

1. Start by writing a short plan and the payload format spec as `docs/format.md`. Flag anything in this brief you think is wrong before coding.
2. Build in phases, committing after each with tests passing: codec and security, viewer, service worker and install, library, editor, messaging blocks, sharing and QR, Show mode, contact card and vCard, images, themes, NFC tag writing, backup and export, then polish and tests.
3. Add a `README.md` covering local dev (`npx serve` or similar, since service workers need localhost or https), deploy steps, and how the no-data model works so I can explain it to users.
4. Add a GitHub Actions workflow that runs the tests and deploys to GitHub Pages.