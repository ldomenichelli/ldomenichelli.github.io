#!/usr/bin/env bash

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH= cd -- "$script_dir/.." && pwd)

for command_name in pdfinfo pdftocairo cmp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
done

render_note() {
  local slug=$1
  local pdf_name=$2
  local pdf_path="$repo_dir/$pdf_name"
  local reader_html="$repo_dir/posts/post11/read/$slug/index.html"
  local source_dir="$repo_dir/posts/post11/read/$slug/pages"
  local public_dir="$repo_dir/public/posts/post11/read/$slug/pages"
  local page_count

  page_count=$(pdfinfo "$pdf_path" | awk -F: '/^Pages:/{gsub(/[[:space:]]/, "", $2); print $2; exit}')
  if [[ ! "$page_count" =~ ^[1-9][0-9]*$ ]]; then
    echo "Could not determine a page count for $pdf_name" >&2
    exit 1
  fi

  mkdir -p "$source_dir" "$public_dir"

  remove_stale_pages() {
    local page_dir=$1
    local svg_path

    for svg_path in "$page_dir"/page-*.svg; do
      [[ -e "$svg_path" ]] || continue
      if [[ $(basename -- "$svg_path") =~ ^page-([0-9]+)\.svg$ ]]; then
        local existing_page=$((10#${BASH_REMATCH[1]}))
        if ((existing_page > page_count)); then
          rm -f -- "$svg_path"
        fi
      fi
    done
  }

  remove_stale_pages "$source_dir"
  remove_stale_pages "$public_dir"

  local page
  for ((page = 1; page <= page_count; page += 1)); do
    local page_label
    local source_svg
    local public_svg

    printf -v page_label '%02d' "$page"
    source_svg="$source_dir/page-$page_label.svg"
    public_svg="$public_dir/page-$page_label.svg"

    pdftocairo -f "$page" -l "$page" -svg "$pdf_path" "$source_svg"
    cp -- "$source_svg" "$public_svg"

    if ! cmp -s -- "$source_svg" "$public_svg"; then
      echo "The source/public copies differ for $slug page $page." >&2
      exit 1
    fi
  done

  local markup_count
  markup_count=$(grep -Eo 'data-note-page="[0-9]+"' "$reader_html" | wc -l)
  if ((markup_count != page_count)); then
    echo "$reader_html contains $markup_count page entries, but $pdf_name contains $page_count pages." >&2
    echo "Update the reader markup before publishing the regenerated SVGs." >&2
    exit 1
  fi

  echo "Rendered $page_count SVG pages for $slug."
}

render_note "smolensky" "AC.pdf"
render_note "rowland" "Carolin Rowland.pdf"
render_note "biehl" "Biehl.pdf"
