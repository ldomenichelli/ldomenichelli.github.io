#!/usr/bin/env bash

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)
pdf_path="$repo_dir/tdafull.pdf"
public_pdf_path="$repo_dir/public/tdafull.pdf"
reader_html="$repo_dir/posts/post4/index.html"
public_reader_html="$repo_dir/public/posts/post4/index.html"
source_dir="$repo_dir/posts/post4/pages"
public_dir="$repo_dir/public/posts/post4/pages"

for command_name in pdfinfo pdftocairo cmp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

page_count=$(pdfinfo "$pdf_path" | awk -F: '/^Pages:/{gsub(/[[:space:]]/, "", $2); print $2; exit}')
if [[ ! "$page_count" =~ ^[1-9][0-9]*$ ]]; then
  echo "Could not determine a page count for tdafull.pdf." >&2
  exit 1
fi

for html_path in "$reader_html" "$public_reader_html"; do
  markup_count=$(grep -Eo 'data-note-page="[0-9]+"' "$html_path" | wc -l)
  image_markup_count=$(grep -Eo '/posts/post4/pages/page-[0-9]+\.jpg' "$html_path" | wc -l)

  if ((markup_count != page_count || image_markup_count != page_count)); then
    echo "$html_path must contain one reader entry and JPEG reference for each of the $page_count PDF pages." >&2
    exit 1
  fi
done

if ! cmp -s -- "$reader_html" "$public_reader_html"; then
  echo "The source/public TDA reader pages differ." >&2
  exit 1
fi

cp -- "$pdf_path" "$public_pdf_path"
if ! cmp -s -- "$pdf_path" "$public_pdf_path"; then
  echo "The source/public TDA PDF copies differ." >&2
  exit 1
fi

mkdir -p "$source_dir" "$public_dir"

remove_stale_pages() {
  local page_dir=$1
  local image_path

  for image_path in "$page_dir"/page-*.jpg; do
    [[ -e "$image_path" ]] || continue
    if [[ $(basename -- "$image_path") =~ ^page-([0-9]+)\.jpg$ ]]; then
      existing_page=$((10#${BASH_REMATCH[1]}))
      if ((existing_page > page_count)); then
        rm -f -- "$image_path"
      fi
    fi
  done
}

remove_stale_pages "$source_dir"
remove_stale_pages "$public_dir"

for ((page = 1; page <= page_count; page += 1)); do
  printf -v page_label '%02d' "$page"
  source_image="$source_dir/page-$page_label.jpg"
  public_image="$public_dir/page-$page_label.jpg"

  pdftocairo \
    -f "$page" \
    -l "$page" \
    -singlefile \
    -jpeg \
    -r 144 \
    -jpegopt quality=90,progressive=y,optimize=y \
    "$pdf_path" \
    "${source_image%.jpg}"

  cp -- "$source_image" "$public_image"
  if ! cmp -s -- "$source_image" "$public_image"; then
    echo "The source/public copies differ for TDA page $page." >&2
    exit 1
  fi
done

source_count=$(find "$source_dir" -maxdepth 1 -type f -name 'page-*.jpg' | wc -l)
public_count=$(find "$public_dir" -maxdepth 1 -type f -name 'page-*.jpg' | wc -l)
if ((source_count != page_count || public_count != page_count)); then
  echo "Expected $page_count rendered pages, found $source_count source and $public_count public pages." >&2
  exit 1
fi

echo "Rendered $page_count browser-safe JPEG pages for the TDA reader."
