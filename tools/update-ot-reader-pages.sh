#!/usr/bin/env bash

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
pdf_path="$repo_dir/ot.pdf"
public_pdf_path="$repo_dir/public/ot.pdf"
reader_html="$repo_dir/posts/optimal-transport-and-wasserstein-distance/index.html"
public_reader_html="$repo_dir/public/posts/optimal-transport-and-wasserstein-distance/index.html"
source_dir="$repo_dir/posts/optimal-transport-and-wasserstein-distance/pages"
public_dir="$repo_dir/public/posts/optimal-transport-and-wasserstein-distance/pages"

for command_name in pdfinfo pdftocairo cmp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

page_count=$(pdfinfo "$pdf_path" | awk -F: '/^Pages:/{gsub(/[[:space:]]/, "", $2); print $2; exit}')
if [[ "$page_count" != "1" ]]; then
  echo "Expected ot.pdf to contain one page; found ${page_count:-an unknown number}." >&2
  exit 1
fi

for html_path in "$reader_html" "$public_reader_html"; do
  markup_count=$(grep -Eo 'data-note-page="[0-9]+"' "$html_path" | wc -l)
  image_markup_count=$(grep -Eo 'src="/posts/optimal-transport-and-wasserstein-distance/pages/page-[0-9]+\.jpg"' "$html_path" | wc -l)
  if ((markup_count != 1 || image_markup_count != 1)); then
    echo "$html_path must contain exactly one OT reader entry and JPEG reference." >&2
    exit 1
  fi
done

if ! cmp -s -- "$reader_html" "$public_reader_html"; then
  echo "The source/public OT reader pages differ." >&2
  exit 1
fi

cp -- "$pdf_path" "$public_pdf_path"
if ! cmp -s -- "$pdf_path" "$public_pdf_path"; then
  echo "The source/public OT PDF copies differ." >&2
  exit 1
fi

mkdir -p "$source_dir" "$public_dir"
source_image="$source_dir/page-001.jpg"
public_image="$public_dir/page-001.jpg"

pdftocairo \
  -f 1 \
  -l 1 \
  -singlefile \
  -jpeg \
  -r 144 \
  -jpegopt quality=90,progressive=y,optimize=y \
  "$pdf_path" \
  "${source_image%.jpg}"

cp -- "$source_image" "$public_image"
if ! cmp -s -- "$source_image" "$public_image"; then
  echo "The source/public OT page images differ." >&2
  exit 1
fi

for page_dir in "$source_dir" "$public_dir"; do
  for old_page in "$page_dir"/page-*.jpg; do
    [[ -e "$old_page" ]] || continue
    if [[ $(basename -- "$old_page") != "page-001.jpg" ]]; then
      rm -f -- "$old_page"
    fi
  done
done

echo "Rendered the browser-safe JPEG sheet for the Optimal Transport reader."
