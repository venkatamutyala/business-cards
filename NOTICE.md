# Third-party notices

This project is MIT licensed (see `LICENSE`). It vendors the following, with no
package manager and no build step — the files are committed as they ship.

## vendor/qrcodegen.js

QR Code generator library — © Project Nayuki, **MIT License**.
<https://www.nayuki.io/page/qr-code-generator-library>

Compiled once from the upstream TypeScript source and committed. The original
copyright header is intact at the top of the file; a three-line ESM export shim
is appended at the bottom and marked as such.

## js/icons.js

Brand marks from **simple-icons**, released under **CC0 1.0** (public domain).
<https://github.com/simple-icons/simple-icons>

The LinkedIn mark is the exception: simple-icons withdrew it on request, so it
is included here directly. The generic glyphs — phone, email, link, contact
card, copy — are not anyone's logo.

These marks identify *where a link goes*. That is nominative use: no affiliation
with or endorsement by any of these services is claimed or implied. If you fork
this and your use is different in kind — for example putting a mark on your own
branding rather than on a link to that service — that is your call to make.

## js/timezones.js

Generated from the **IANA Time Zone Database** (`zone1970.tab` and `backward`),
which is in the public domain. <https://www.iana.org/time-zones>

Regenerate with `tools/gen-timezones.sh` when the database gains or moves zones.

## Everything else

Written for this project and covered by `LICENSE`. No runtime dependencies, no
external requests, no analytics.
