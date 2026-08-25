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
  local public_pdf_path="$repo_dir/public/$pdf_name"
  local reader_html="$repo_dir/posts/post11/read/$slug/index.html"
  local source_dir="$repo_dir/posts/post11/read/$slug/pages"
  local public_dir="$repo_dir/public/posts/post11/read/$slug/pages"
  local page_count

  page_count=$(pdfinfo "$pdf_path" | awk -F: '/^Pages:/{gsub(/[[:space:]]/, "", $2); print $2; exit}')
  if [[ ! "$page_count" =~ ^[1-9][0-9]*$ ]]; then
    echo "Could not determine a page count for $pdf_name" >&2
    exit 1
  fi

  cp -- "$pdf_path" "$public_pdf_path"
  if ! cmp -s -- "$pdf_path" "$public_pdf_path"; then
    echo "The source/public PDF copies differ for $pdf_name." >&2
    exit 1
  fi

  mkdir -p "$source_dir" "$public_dir"

  remove_stale_pages() {
    local page_dir=$1
    local image_path

    for image_path in "$page_dir"/page-*.jpg; do
      [[ -e "$image_path" ]] || continue
      if [[ $(basename -- "$image_path") =~ ^page-([0-9]+)\.jpg$ ]]; then
        local existing_page=$((10#${BASH_REMATCH[1]}))
        if ((existing_page > page_count)); then
          rm -f -- "$image_path"
        fi
      fi
    done

  }

  remove_stale_pages "$source_dir"
  remove_stale_pages "$public_dir"

  local page
  for ((page = 1; page <= page_count; page += 1)); do
    local page_label
    local source_image
    local public_image

    printf -v page_label '%02d' "$page"
    source_image="$source_dir/page-$page_label.jpg"
    public_image="$public_dir/page-$page_label.jpg"

    pdftocairo \
      -f "$page" \
      -l "$page" \
      -singlefile \
      -jpeg \
      -r 144 \
      -jpegopt quality=92,progressive=y,optimize=y \
      "$pdf_path" \
      "${source_image%.jpg}"
    cp -- "$source_image" "$public_image"

    if ! cmp -s -- "$source_image" "$public_image"; then
      echo "The source/public copies differ for $slug page $page." >&2
      exit 1
    fi
  done

  local markup_count
  local image_markup_count
  markup_count=$(grep -Eo 'data-note-page="[0-9]+"' "$reader_html" | wc -l)
  if ((markup_count != page_count)); then
    echo "$reader_html contains $markup_count page entries, but $pdf_name contains $page_count pages." >&2
    echo "Update the reader markup before publishing the regenerated page images." >&2
    exit 1
  fi

  image_markup_count=$(
    awk -v prefix="/posts/post11/read/$slug/pages/page-" '
      index($0, "src=\"" prefix) && index($0, ".jpg\"") { count += 1 }
      END { print count + 0 }
    ' "$reader_html"
  )
  if ((image_markup_count != page_count)); then
    echo "$reader_html must reference one JPEG image for each of its $page_count pages." >&2
    exit 1
  fi

  # PDF-generated SVGs use filters that are unreliable in some browsers.
  # Only remove those superseded assets after all JPEG pages have rendered.
  local legacy_svg
  for legacy_svg in "$source_dir"/page-*.svg "$public_dir"/page-*.svg; do
    [[ -e "$legacy_svg" ]] || continue
    rm -f -- "$legacy_svg"
  done

  echo "Rendered $page_count browser-safe JPEG pages for $slug."
}

render_note "smolensky" "AC.pdf"
render_note "rowland" "Carolin Rowland.pdf"
render_note "biehl" "Biehl.pdf"
render_note "summerfield" "Chris Sommerfield.pdf"
render_note "misra" "Misra.pdf"
