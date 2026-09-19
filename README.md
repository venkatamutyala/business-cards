# qrcodes4.me — Social Handle Sharer

Only works on your phone. Install it as an app and cache it.

A personal PWA for handing over your details in person. Tap a row, a QR code
fills the screen, they scan it with their camera. No backend, no accounts, and
nothing to install on their phone.

The hero is the **contact QR**: it carries a vCard inside the code itself, so it
works with **zero network on both phones** and their camera offers "Add to
contacts" directly. That is the one mechanism that solves both halves of the
problem — no internet, or they don't have WhatsApp/LinkedIn installed.

## Status

**Working: editor, local storage, backup and transfer, installable PWA.**

Install it from the banner on the main page — a real install prompt on Android
and desktop Chrome, and Share → Add to Home Screen instructions on iPhone, which
has no install API. Once installed it runs with no connection.

Your cards are saved in this browser's `localStorage` on this device. The
backup is a single link: a compressed base64url payload in the URL fragment
carrying every card. Opening it on another device restores all of them.

## Hosted

<https://venkatamutyala.github.io/business-cards/>

All paths are relative, so it works from a subpath without configuration.

## Running it

Everything runs in Docker; nothing is installed on the host.

```sh
docker compose up -d
docker compose logs tunnel | grep trycloudflare
```

That prints an HTTPS URL to open on your phone. The tunnel matters because
service workers and PWA install both require HTTPS, and `localhost` is
unreachable from a handset. `http://localhost:8080` is there for desktop
debugging only.

```sh
docker compose down          # stop
```

### Tests

```sh
docker run --rm -v "$PWD":/app -w /app node:22-alpine \
  node --experimental-default-type=module --test tests/unit.test.js
```

The same assertion table also runs in a browser at `/tests/test.html`. That
runner matters more — opened over the tunnel it executes on the actual phone,
which is where the platform differences live.

## While testing over a tunnel

- **Use fake contact details.** A `trycloudflare.com` URL is public and
  unauthenticated. Real details go in once the app is on its final origin.
- **Every run is a new origin.** Fresh storage, fresh service worker, fresh
  install. Dead home-screen icons accumulate — delete them as you go.
- **Never send anyone a tunnel URL with a payload attached.**

## How the no-data model works

Your card lives in your browser's storage on your own device. Nothing is
uploaded, because there is no server to upload it to — the app is static files.
The trade is that **your device holds the only copy**, which is why backup is a
first-class feature rather than a footnote.

The backup link puts your whole card into the URL **fragment** (`#p=...`).
Fragments are never sent to the server, so your details stay in the browser even
though the app is served from somewhere. But the payload is **base64, which is
encoding and not encryption** — anyone holding that link can read your name,
number and email. Treat it like the contact details it contains.

## Layout

```
index.html            single page; screens are sections
css/app.css
js/rows.js            row type registry — adding a service is one entry
js/vcard.js           vCard 3.0 builder, escaping, budget drop-order
js/qr.js              canvas rendering; ECC L is the floor
js/ui.js              home list + full-screen QR view
js/store.js           localStorage, validation, backup signature
js/codec.js           base64url JSON payload for #p= links
js/install.js         install prompt + service worker lifecycle
js/countries.js       dialling codes for the phone selector
js/timezones.js       generated: IANA zone -> country
sw.js                 precache shell, cache-first, offline fallback
app.webmanifest       relative start_url/scope, icons, shortcuts
tools/                one-off generators (icons, timezone table)
                      gen-icons.py takes a design: finder | card | scan
js/editor.js          in-place editor
js/profile.js         sample data, loadable from the console only
js/main.js            boot
vendor/qrcodegen.js   nayuki QR-Code-generator (MIT) + ESM shim
tests/cases.js        assertion table, shared by both runners
```

`vendor/qrcodegen.js` was compiled once from the upstream TypeScript source and
committed. There is no build step.
