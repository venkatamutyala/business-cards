#!/usr/bin/env python3
"""Regenerate js/timezones.js from the IANA tz database.

Reads /tmp/zone1970.tab and /tmp/backward (fetched by gen-timezones.sh) and
writes a complete timezone -> ISO2 country map. Not part of any build; run it
only when the tz database changes.
"""
import re

canon = {}
for line in open('/tmp/zone1970.tab', encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    parts = line.rstrip('\n').split('\t')
    if len(parts) < 3:
        continue
    # A zone shared by several countries lists them comma separated, primary first.
    canon[parts[2]] = parts[0].split(',')[0]

alias = {}
for line in open('/tmp/backward', encoding='utf-8'):
    m = re.match(r'^Link\s+(\S+)\s+(\S+)', line)
    if m:
        alias[m.group(2)] = m.group(1)

full = dict(canon)
for name, target in alias.items():
    if target in canon and name not in full:
        full[name] = canon[target]
full = {z: c for z, c in full.items() if re.fullmatch(r'[A-Z]{2}', c)}

by_country = {}
for zone, iso in sorted(full.items()):
    by_country.setdefault(iso, []).append(zone)
data = ';'.join(f"{iso}:{','.join(z)}" for iso, z in sorted(by_country.items()))

HEADER = '''// IANA timezone -> ISO2 country, generated from the tz database.
//
// The device timezone reflects where the phone actually is, which is a far
// better signal than navigator.language: a browser set to plain "en" or "en-US"
// reports the United States regardless of where you are standing.
//
// Generated from zone1970.tab (canonical zones) plus backward (legacy aliases
// such as Asia/Calcutta, which older phones still report). Covers every zone
// the tz database defines, so "timezone not recognised" is effectively not a
// case any more. Regenerate with tools/gen-timezones.sh.
'''

body = HEADER + f'''
const DATA = '{data}';

export const TZ_TO_ISO = (() => {{
  const out = {{}};
  for (const group of DATA.split(';')) {{
    const [iso, zones] = group.split(':');
    for (const z of zones.split(',')) out[z] = iso;
  }}
  return out;
}})();

export function isoFromTimezone(zone) {{
  if (!zone) return null;
  return TZ_TO_ISO[zone] || null;
}}
'''

open('js/timezones.js', 'w').write(body)
print(f'js/timezones.js: {len(full)} zones, {len(by_country)} countries')
