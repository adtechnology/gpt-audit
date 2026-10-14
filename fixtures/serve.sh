#!/usr/bin/env bash
# Serves the fixture pages at http://localhost:8787/broken-page.html and /broken-page-hb.html
cd "$(dirname "$0")" && exec python3 -m http.server 8787
