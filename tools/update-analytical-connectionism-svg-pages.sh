#!/usr/bin/env bash

# Backward-compatible entry point. The reader now uses browser-safe JPEG pages
# because PDF-generated SVG filters do not render consistently across browsers.
set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$script_dir/update-analytical-connectionism-reader-pages.sh" "$@"
