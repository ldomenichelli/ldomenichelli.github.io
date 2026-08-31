#!/usr/bin/env python3
"""Build the continuous image reader for the SLLD course PDF."""

from __future__ import annotations

import argparse
import html
import json
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path


REPO_DIR = Path(__file__).resolve().parent.parent
PDF_NAME = "SLLD_new.pdf"
TITLE = "Statistical Learning and Large Data"
PAGE_TITLE = f"{TITLE} 📊 | Original Course Notes"
SPEAKER = "Prof. Chiaromonte"
MODIFIED_DATE = "2026-08-27"
SUMMARY = (
    "Original annotated lecture slides for the Statistical Learning and Large Data "
    "course at Sant’Anna School of Advanced Studies in Pisa, presented as a "
    "continuous 172-page reader with the source PDF available to download."
)
TOPICS = (
    "Cluster analysis and principal components",
    "Supervised classification and smoothing",
    "Cross-validation, bootstrap, and permutation methods",
    "Penalization, dimension reduction, and feature screening",
)
KEYWORDS = (
    "statistical learning",
    "large data",
    "cluster analysis",
    "principal component analysis",
    "classification",
    "regularization",
    "feature selection",
)


def command_output(*args: str) -> str:
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout


def pdf_page_count(pdf_path: Path) -> int:
    for line in command_output("pdfinfo", str(pdf_path)).splitlines():
        if line.startswith("Pages:"):
            return int(line.split(":", 1)[1].strip())
    raise RuntimeError(f"Could not determine a page count for {pdf_path.name}")


def jpeg_dimensions(path: Path) -> tuple[int, int]:
    """Read JPEG dimensions without requiring Pillow or ImageMagick."""
    with path.open("rb") as image_file:
        if image_file.read(2) != b"\xff\xd8":
            raise RuntimeError(f"{path} is not a JPEG")

        while True:
            marker_start = image_file.read(1)
            if not marker_start:
                break
            if marker_start != b"\xff":
                continue

            marker = image_file.read(1)
            while marker == b"\xff":
                marker = image_file.read(1)
            if not marker or marker in (b"\xd8", b"\xd9"):
                continue

            length_bytes = image_file.read(2)
            if len(length_bytes) != 2:
                break
            segment_length = struct.unpack(">H", length_bytes)[0]
            if marker[0] in {
                0xC0,
                0xC1,
                0xC2,
                0xC3,
                0xC5,
                0xC6,
                0xC7,
                0xC9,
                0xCA,
                0xCB,
                0xCD,
                0xCE,
                0xCF,
            }:
                precision_and_size = image_file.read(5)
                if len(precision_and_size) != 5:
                    break
                _, height, width = struct.unpack(">BHH", precision_and_size)
                return width, height

            image_file.seek(segment_length - 2, 1)

    raise RuntimeError(f"Could not read JPEG dimensions from {path}")


def numbered_page(path: Path) -> int:
    try:
        return int(path.stem.rsplit("-", 1)[1])
    except (IndexError, ValueError) as error:
        raise RuntimeError(f"Unexpected rendered page name: {path.name}") from error


def render_pages(pdf_path: Path, page_count: int) -> list[tuple[Path, int, int]]:
    pages_dir = REPO_DIR / "posts" / "statistical-learning-and-large-data" / "pages"
    public_pages_dir = REPO_DIR / "public" / "posts" / "statistical-learning-and-large-data" / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    public_pages_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="slld-reader-") as temp_name:
        temp_dir = Path(temp_name)
        subprocess.run(
            (
                "pdftocairo",
                "-jpeg",
                "-r",
                "120",
                "-jpegopt",
                "quality=84,progressive=y,optimize=y",
                str(pdf_path),
                str(temp_dir / "render"),
            ),
            check=True,
        )
        rendered = sorted(temp_dir.glob("render-*.jpg"), key=numbered_page)
        if len(rendered) != page_count:
            raise RuntimeError(
                f"Rendered {len(rendered)} pages for {pdf_path.name}; expected {page_count}"
            )
        if [numbered_page(path) for path in rendered] != list(range(1, page_count + 1)):
            raise RuntimeError("The rendered SLLD pages are not a complete ordered sequence")

        for page_dir in (pages_dir, public_pages_dir):
            for old_page in page_dir.glob("page-*.jpg"):
                old_page.unlink()

        digits = len(str(page_count))
        pages: list[tuple[Path, int, int]] = []
        for page_number, rendered_page in enumerate(rendered, start=1):
            target = pages_dir / f"page-{page_number:0{digits}d}.jpg"
            public_target = public_pages_dir / target.name
            shutil.copy2(rendered_page, target)
            shutil.copy2(rendered_page, public_target)
            if target.read_bytes() != public_target.read_bytes():
                raise RuntimeError(f"Root/public images differ for SLLD page {page_number}")
            width, height = jpeg_dimensions(target)
            pages.append((target, width, height))

    return pages


def existing_pages(page_count: int) -> list[tuple[Path, int, int]]:
    pages_dir = REPO_DIR / "posts" / "statistical-learning-and-large-data" / "pages"
    public_pages_dir = REPO_DIR / "public" / "posts" / "statistical-learning-and-large-data" / "pages"
    rendered = sorted(pages_dir.glob("page-*.jpg"), key=numbered_page)
    public_rendered = sorted(public_pages_dir.glob("page-*.jpg"), key=numbered_page)

    if len(rendered) != page_count or len(public_rendered) != page_count:
        raise RuntimeError(
            f"Expected {page_count} existing SLLD page images in both output trees"
        )

    pages: list[tuple[Path, int, int]] = []
    for page_number, (source, public) in enumerate(
        zip(rendered, public_rendered, strict=True), start=1
    ):
        if numbered_page(source) != page_number or source.name != public.name:
            raise RuntimeError("The existing SLLD page images are not in order")
        if source.read_bytes() != public.read_bytes():
            raise RuntimeError(f"Root/public images differ for SLLD page {page_number}")
        pages.append((source, *jpeg_dimensions(source)))
    return pages


def page_markup(pages: list[tuple[Path, int, int]]) -> str:
    total = len(pages)
    items = []
    for page_number, (page_path, width, height) in enumerate(pages, start=1):
        loading = (
            'loading="eager" fetchpriority="high" decoding="async"'
            if page_number == 1
            else 'loading="lazy" decoding="async"'
        )
        alt = html.escape(
            f"Original annotated Statistical Learning and Large Data course material, "
            f"page {page_number} of {total}.",
            quote=True,
        )
        items.append(
            f'''      <li class="ws-reader-page-item" id="page-{page_number}" data-note-page="{page_number}">
        <figure class="ws-reader-sheet" aria-labelledby="page-{page_number}-caption">
          <img src="/posts/statistical-learning-and-large-data/pages/{page_path.name}" width="{width}" height="{height}" alt="{alt}" {loading}>
          <figcaption id="page-{page_number}-caption">Page {page_number} of {total}</figcaption>
        </figure>
      </li>'''
        )
    return "\n".join(items)


def reader_html(pages: list[tuple[Path, int, int]]) -> str:
    total = len(pages)
    canonical = "https://ldomenichelli.github.io/posts/statistical-learning-and-large-data/"
    pdf_url = f"/{PDF_NAME}"
    absolute_pdf_url = f"https://ldomenichelli.github.io/{PDF_NAME}"
    social_image = "https://ldomenichelli.github.io/posts/statistical-learning-and-large-data/pages/page-001.jpg"
    topics = "\n".join(f"        <li>{html.escape(topic)}</li>" for topic in TOPICS)
    structured_data = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "@id": f"{canonical}#breadcrumb",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": 1,
                        "name": "Home",
                        "item": "https://ldomenichelli.github.io/",
                    },
                    {
                        "@type": "ListItem",
                        "position": 2,
                        "name": "Notes",
                        "item": "https://ldomenichelli.github.io/posts/",
                    },
                    {
                        "@type": "ListItem",
                        "position": 3,
                        "name": TITLE,
                        "item": canonical,
                    },
                ],
            },
            {
                "@type": "Article",
                "@id": f"{canonical}#article",
                "url": canonical,
                "headline": PAGE_TITLE,
                "description": SUMMARY,
                "inLanguage": "en",
                "dateModified": MODIFIED_DATE,
                "author": {
                    "@type": "Person",
                    "name": "Lucia Domenichelli",
                    "url": "https://ldomenichelli.github.io/about/",
                },
                "contributor": {"@type": "Person", "name": SPEAKER},
                "keywords": list(KEYWORDS),
                "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
                "image": {"@type": "ImageObject", "url": social_image},
                "encoding": {
                    "@type": "MediaObject",
                    "contentUrl": absolute_pdf_url,
                    "encodingFormat": "application/pdf",
                    "name": f"{TITLE} original course notes",
                },
            },
        ],
    }
    json_ld = json.dumps(structured_data, ensure_ascii=False, indent=2)
    escaped_page_title = html.escape(PAGE_TITLE)
    escaped_summary = html.escape(SUMMARY, quote=True)
    download_name = "lucia-domenichelli-statistical-learning-large-data-notes.pdf"

    return f'''<!doctype html>
<html lang="en" dir="auto">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
  <meta name="robots" content="index, follow">
  <title>{escaped_page_title}</title>
  <meta name="description" content="{escaped_summary}">
  <meta name="keywords" content="{html.escape(', '.join(KEYWORDS), quote=True)}">
  <meta name="author" content="Lucia Domenichelli">
  <link crossorigin="anonymous" href="/assets/css/stylesheet.5ad9b1caa92e4cea83ebcd3088e97362f239b07d8144490aaf0bc1d6bd89cd17.css" integrity="sha256-WtmxyqkuTOqD680wiOlzYvI5sH2BREkKrwvB1r2JzRc=" rel="preload stylesheet" as="style">
  <link rel="stylesheet" href="/assets/css/site-theme.css">
  <link rel="stylesheet" href="/assets/css/winter-school-reader.css">
  <link rel="canonical" href="{canonical}">
  <link rel="icon" href="/favicon-dithered.ico">
  <meta name="theme-color" content="#edf2f5">
  <meta property="og:title" content="{escaped_page_title}">
  <meta property="og:description" content="{escaped_summary}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{canonical}">
  <meta property="og:image" content="{social_image}">
  <meta property="og:site_name" content="lucia's room">
  <meta property="article:modified_time" content="{MODIFIED_DATE}T00:00:00+02:00">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{escaped_page_title}">
  <meta name="twitter:description" content="{escaped_summary}">
  <meta name="twitter:image" content="{social_image}">
  <script type="application/ld+json">
{json_ld}
  </script>
  <script src="/assets/js/analytics.js" async></script>
  <script src="/assets/js/winter-school-reader.js" defer></script>
</head>
<body class="dark ws-reader-page slld-reader-page" id="top">
  <a class="ws-skip-link" href="#note-pages">Skip to the notes</a>

  <header class="ws-reader-bar">
    <div class="ws-reader-bar-inner">
      <a class="ws-reader-back" href="/posts/" aria-label="Back to all notes">← <span>All notes</span></a>
      <div class="ws-reader-heading">
        <p class="ws-reader-speaker">{html.escape(SPEAKER)}</p>
        <h1>{html.escape(TITLE)}</h1>
      </div>
      <div class="ws-reader-tools">
        <span class="ws-reader-progress" aria-hidden="true"><span data-current-page>1</span> / <span data-total-pages>{total}</span></span>
        <a class="ws-reader-download" data-note-download="slld" href="{pdf_url}" download="{download_name}">Download PDF ↓</a>
      </div>
    </div>
  </header>

  <main class="ws-reader-main" id="note-pages">
    <p class="ws-reader-intro"><a href="/posts/">Sant’Anna School of Advanced Studies, Pisa</a> · Scroll to read</p>
    <section class="ws-reader-summary" aria-labelledby="reader-summary-title">
      <h2 id="reader-summary-title">About these notes</h2>
      <p>{html.escape(SUMMARY)}</p>
      <ul aria-label="Topics covered">
{topics}
      </ul>
    </section>

    <ol class="ws-reader-pages" aria-label="{total} pages from {html.escape(TITLE, quote=True)}">
{page_markup(pages)}
    </ol>

    <nav class="ws-reader-end" aria-label="Reader actions">
      <a href="/posts/">← Back to all notes</a>
      <a href="{pdf_url}" download="{download_name}">Download the original PDF ↓</a>
      <a href="#top">Back to top ↑</a>
    </nav>
  </main>
</body>
</html>
'''


def build(skip_images: bool) -> None:
    pdf_path = REPO_DIR / PDF_NAME
    public_pdf_path = REPO_DIR / "public" / PDF_NAME
    if not pdf_path.is_file():
        raise FileNotFoundError(pdf_path)

    page_count = pdf_page_count(pdf_path)
    pages = existing_pages(page_count) if skip_images else render_pages(pdf_path, page_count)

    shutil.copy2(pdf_path, public_pdf_path)
    if pdf_path.read_bytes() != public_pdf_path.read_bytes():
        raise RuntimeError("Root/public copies differ for SLLD_new.pdf")

    markup = reader_html(pages)
    reader_path = REPO_DIR / "posts" / "statistical-learning-and-large-data" / "index.html"
    public_reader_path = REPO_DIR / "public" / "posts" / "statistical-learning-and-large-data" / "index.html"
    reader_path.write_text(markup, encoding="utf-8")
    public_reader_path.write_text(markup, encoding="utf-8")
    if reader_path.read_bytes() != public_reader_path.read_bytes():
        raise RuntimeError("Root/public SLLD reader pages differ")

    total_bytes = sum(page.stat().st_size for page, _, _ in pages)
    print(
        f"Built the SLLD reader with {page_count} pages "
        f"({total_bytes / 1024 / 1024:.1f} MiB of lazy-loaded JPEGs)."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-images",
        action="store_true",
        help="Regenerate HTML from the existing JPEG pages without rerendering the PDF.",
    )
    args = parser.parse_args()

    for command_name in ("pdfinfo", "pdftocairo"):
        if shutil.which(command_name) is None:
            raise RuntimeError(f"Missing required command: {command_name}")

    build(args.skip_images)


if __name__ == "__main__":
    main()
