# Business Cards

An offline contact card you hand over by QR code. Tap a row, a code fills the
screen, they scan it with their camera. No backend, no accounts, and nothing to
install on their phone.

**<https://venkatamutyala.github.io/business-cards/>**

The one that matters is **My contact card**: it carries a vCard inside the code
itself, so it works with **no network on either phone** and their camera offers
"Add to contacts" directly. That solves both halves of the problem — you have no
signal, or they don't have WhatsApp/LinkedIn installed.

Everything else is a row: phone, email, website, and any handles you add. Each
gets its own code, so you can share just one thing.

## What it does

- **Up to 5 cards** — one per product, territory or role. Switch from the title
  in the header; the app reopens on whichever you used last.
- **vCard 3.0** with proper escaping and a length budget, so the code stays
  scannable off a screen rather than growing until it doesn't.
- **A rescue ladder.** If a code won't scan, "Doesn't scan?" steps through
  brighter, bigger, and a different encoding — each labelled before you tap it.
  "Show as text" falls back to plain details they can type.
- **Phone entry by country selector**, with trunk-zero handling, so you type
  your number the way you normally write it.
- **Installable and fully offline** once added to your home screen.

## Your data

Your cards live in this browser's `localStorage`, on this device. Nothing is
uploaded, because there is no server to upload to — the app is static files.

The trade is that **your device holds the only copy**, which is why the backup
is a first-class feature rather than a footnote. It is a single link: a
compressed payload in the URL **fragment** (`#p=...`), carrying every card.
Fragments are never sent to a server, so your details stay in the browser.
Opening that link on another device restores all of your cards.

One thing to be clear about: the payload is **compressed and base64-encoded,
which is not encryption**. Anyone holding that link can read your name, number
and email. Treat it like the contact details it contains.

## Developing

Everything runs in Docker; nothing is installed on the host.

```sh
docker compose up -d                              # nginx on :8080 + a tunnel
docker compose logs tunnel | grep trycloudflare   # an HTTPS URL for your phone
docker compose down
```

The tunnel exists because service workers and PWA install both require HTTPS,
and `localhost` is unreachable from a handset. `http://localhost:8080` is for
desktop debugging only.

While testing over a tunnel: **use fake contact details** — a
`trycloudflare.com` URL is public and unauthenticated. Every run is a new
origin, so storage, the service worker and any install start fresh each time.

### Tests

```sh
docker run --rm -v "$PWD":/app -w /app node:22-alpine \
  node --experimental-default-type=module --test tests/unit.test.js
```

The same assertion table also runs in a browser at `/tests/test.html`. That
runner matters more: opened on a phone it executes where the platform
differences actually are.

`tests/cases.js` includes a **frozen v1 payload string**. Never regenerate it —
encoding and decoding with current code passes whether or not migration works,
so only a real historical payload proves the chain still holds.

## Layout

```
index.html            single page; screens are sections
css/app.css
js/main.js            boot, deep links, restore-from-fragment
js/ui.js              home list, card switcher, backup & transfer sheet
js/qrview.js          the full-screen QR overlay
js/editor.js          in-place editor
js/rows.js            service registry — adding a service is ONE entry
js/vcard.js           vCard 3.0 builder, escaping, budget drop-order
js/qr.js              canvas rendering; ECC L is a floor, not a default
js/codec.js           compressed base64url payload for #p= links
js/store.js           localStorage, validation, migration, backup signature
js/install.js         install prompt + service worker lifecycle
js/countries.js       dialling codes and country detection
js/timezones.js       generated: IANA zone -> country
js/icons.js           inline SVG glyphs (simple-icons, CC0)
js/dom.js             shared $, el, rid
sw.js                 versioned shell, cache-first, explicit update prompt
app.webmanifest       relative start_url/scope, icons, shortcuts
tools/                one-off generators; gen-icons.py takes: finder|card|scan
vendor/qrcodegen.js   nayuki QR-Code-generator (MIT) + ESM shim
```

No build step and no dependencies. `vendor/qrcodegen.js` was compiled once from
the upstream TypeScript and committed; `js/timezones.js` is generated from the
IANA tz database by `tools/gen-timezones.sh`.

`SPEC.md` is the original brief, kept for history. The product changed
substantially during build — read this file, not that one.
