#!/bin/sh
# Regenerates js/timezones.js from the IANA tz database.
# Run when the tz database gains or moves zones; not part of any build.
set -e
cd "$(dirname "$0")/.."
curl -sSf -o /tmp/zone1970.tab https://raw.githubusercontent.com/eggert/tz/main/zone1970.tab
curl -sSf -o /tmp/backward     https://raw.githubusercontent.com/eggert/tz/main/backward
python3 tools/gen-timezones.py
