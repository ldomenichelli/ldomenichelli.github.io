#!/usr/bin/env python3
"""Build continuous HTML readers for the PDF material linked from post 5."""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import struct
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


REPO_DIR = Path(__file__).resolve().parent.parent
PUBLISHED_DATE = "2025-02-10"
MODIFIED_DATE = "2026-08-26"
SOCIAL_IMAGE = "/posts/post5/img/winter.png"


@dataclass(frozen=True)
class Note:
    slug: str
    pdf_name: str
    title: str
    speaker: str
    day: str
    section_anchor: str
    summary: str
    topics: tuple[str, ...]
    keywords: tuple[str, ...]


NOTES = (
    Note(
        slug="common-crawl",
        pdf_name="CommonCrawl.pdf",
        title="Common Crawl",
        speaker="Winter school field notes",
        day="Day 1 · 10 February 2025",
        section_anchor="-common-crawl",
        summary=(
            "A compact visual note on the open web crawl: raw HTML, cleaned text, "
            "metadata, monthly snapshots, and why the collection matters for language "
            "research and model training."
        ),
        topics=(
            "Raw HTML, cleaned text, and crawl metadata",
            "Monthly web snapshots and open research access",
            "Language change, link analysis, and training data",
        ),
        keywords=("Common Crawl", "web data", "NLP datasets", "language models"),
    ),
    Note(
        slug="factuality",
        pdf_name="fact.pdf",
        title="Large Language Models and Factuality",
        speaker="Anna Rogers",
        day="Day 1 · 10 February 2025",
        section_anchor="-factualityhallucinationsinllms",
        summary=(
            "Lecture material on what factuality means for language models, how "
            "hallucinations arise, and what retrieval, chain-of-thought prompting, and "
            "evaluation can—and cannot—fix."
        ),
        topics=(
            "Factuality and hallucination types",
            "LLMs as information sources",
            "RAG, chain of thought, and the information ecosystem",
        ),
        keywords=("LLM factuality", "hallucinations", "RAG", "chain of thought"),
    ),
    Note(
        slug="fineweb2",
        pdf_name="fine.pdf",
        title="FineWeb 2 — Multilingual Web Data at Scale",
        speaker="Guilherme Penedo",
        day="Day 2 · 11 February 2025",
        section_anchor="-fineweb2--multilingual-web-data-at-scale",
        summary=(
            "Lecture material on building a large multilingual pre-training corpus: "
            "data quality, filtering, deduplication, language identification, "
            "tokenization, experiments, and evaluation."
        ),
        topics=(
            "Multilingual data quality and filtering",
            "Deduplication and language identification",
            "FineWeb 2 construction and evaluation",
        ),
        keywords=("FineWeb 2", "multilingual data", "pre-training", "data quality"),
    ),
    Note(
        slug="scaling-laws",
        pdf_name="jenia.pdf",
        title="Open Foundation Models: Scaling Laws & Generalization",
        speaker="Jenia Jitsev & Marianna Nezhurina",
        day="Day 2 · 11 February 2025",
        section_anchor="-powerlaws--generalization",
        summary=(
            "Lecture material on open foundation models, empirical scaling laws, "
            "compute and data trade-offs, and the limits of using smooth power-law "
            "curves to predict real-world generalization."
        ),
        topics=(
            "Foundation models and transferable learning",
            "Scaling with data, parameters, and compute",
            "Generalization limits and open-model research",
        ),
        keywords=("scaling laws", "foundation models", "generalization", "open models"),
    ),
    Note(
        slug="generalization",
        pdf_name="maria.pdf",
        title="Pitfalls in Measuring Generalization",
        speaker="Marianna Nezhurina",
        day="Day 2 · 11 February 2025",
        section_anchor="-generalization",
        summary=(
            "Lecture material on evaluation leakage, benchmark contamination, "
            "contamination-resistant tests, and the methodological traps that can make "
            "language-model generalization look stronger than it is."
        ),
        topics=(
            "Training/test leakage and benchmark contamination",
            "Dynamic and contamination-resistant evaluations",
            "Reliable measurement of model generalization",
        ),
        keywords=("generalization", "data leakage", "benchmark contamination", "evaluation"),
    ),
)


def command_output(*args: str) -> str:
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout


def pdf_page_count(pdf_path: Path) -> int:
    for line in command_output("pdfinfo", str(pdf_path)).splitlines():
        if line.startswith("Pages:"):
            return int(line.split(":", 1)[1].strip())
    raise RuntimeError(f"Could not find a page count for {pdf_path.name}")


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


def render_pages(note: Note, page_count: int) -> list[tuple[Path, int, int]]:
    pdf_path = REPO_DIR / note.pdf_name
    pages_dir = REPO_DIR / "posts" / "post5" / "read" / note.slug / "pages"
    public_pages_dir = REPO_DIR / "public" / "posts" / "post5" / "read" / note.slug / "pages"
    pages_dir.mkdir(parents=True, exist_ok=True)
    public_pages_dir.mkdir(parents=True, exist_ok=True)

    for page_dir in (pages_dir, public_pages_dir):
        for old_page in page_dir.glob("page-*.jpg"):
            old_page.unlink()

    with tempfile.TemporaryDirectory(prefix=f"winter-reader-{note.slug}-") as temp_name:
        temp_dir = Path(temp_name)
        subprocess.run(
            (
                "pdftocairo",
                "-jpeg",
                "-r",
                "144",
                "-jpegopt",
                "quality=90,progressive=y,optimize=y",
                str(pdf_path),
                str(temp_dir / "render"),
            ),
            check=True,
        )
        rendered = sorted(temp_dir.glob("render-*.jpg"))
        if len(rendered) != page_count:
            raise RuntimeError(
                f"Rendered {len(rendered)} pages for {note.pdf_name}; expected {page_count}"
            )

        digits = max(2, len(str(page_count)))
        pages: list[tuple[Path, int, int]] = []
        for page_number, rendered_page in enumerate(rendered, start=1):
            target = pages_dir / f"page-{page_number:0{digits}d}.jpg"
            public_target = public_pages_dir / target.name
            shutil.copy2(rendered_page, target)
            shutil.copy2(rendered_page, public_target)
            width, height = jpeg_dimensions(target)
            pages.append((target, width, height))

    public_pdf = REPO_DIR / "public" / note.pdf_name
    shutil.copy2(pdf_path, public_pdf)
    if pdf_path.read_bytes() != public_pdf.read_bytes():
        raise RuntimeError(f"Root/public copies differ for {note.pdf_name}")

    return pages


def page_markup(note: Note, pages: list[tuple[Path, int, int]]) -> str:
    total = len(pages)
    items = []
    for page_number, (page_path, width, height) in enumerate(pages, start=1):
        loading = (
            'loading="eager" fetchpriority="high" decoding="async"'
            if page_number == 1
            else 'loading="lazy" decoding="async"'
        )
        alt = html.escape(
            f"Page {page_number} of {total} from {note.title}, included in Lucia "
            "Domenichelli's HPLT × NLPL Winter School notes.",
            quote=True,
        )
        image_url = f"/posts/post5/read/{note.slug}/pages/{page_path.name}"
        items.append(
            f'''      <li class="ws-reader-page-item" id="page-{page_number}" data-note-page="{page_number}">
        <figure class="ws-reader-sheet" aria-labelledby="page-{page_number}-caption">
          <img src="{image_url}" width="{width}" height="{height}" alt="{alt}" {loading}>
          <figcaption id="page-{page_number}-caption">Page {page_number} of {total}</figcaption>
        </figure>
      </li>'''
        )
    return "\n".join(items)


def reader_html(note: Note, pages: list[tuple[Path, int, int]]) -> str:
    total = len(pages)
    canonical = f"https://ldomenichelli.github.io/posts/post5/read/{note.slug}/"
    pdf_url = f"/{note.pdf_name}"
    absolute_pdf_url = f"https://ldomenichelli.github.io/{note.pdf_name}"
    absolute_social_image = f"https://ldomenichelli.github.io{SOCIAL_IMAGE}"
    title = f"{note.title} | HPLT × NLPL Winter School Notes"
    topics = "\n".join(f"        <li>{html.escape(topic)}</li>" for topic in note.topics)
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
                        "name": "HPLT × NLPL Winter School",
                        "item": "https://ldomenichelli.github.io/posts/post5/",
                    },
                    {
                        "@type": "ListItem",
                        "position": 4,
                        "name": note.title,
                        "item": canonical,
                    },
                ],
            },
            {
                "@type": "Article",
                "@id": f"{canonical}#article",
                "url": canonical,
                "headline": title,
                "description": note.summary,
                "inLanguage": "en",
                "datePublished": PUBLISHED_DATE,
                "dateModified": MODIFIED_DATE,
                "author": {
                    "@type": "Person",
                    "name": "Lucia Domenichelli",
                    "url": "https://ldomenichelli.github.io/about/",
                },
                "contributor": {"@type": "Person", "name": note.speaker},
                "keywords": list(note.keywords),
                "isPartOf": {
                    "@type": "BlogPosting",
                    "@id": "https://ldomenichelli.github.io/posts/post5/",
                },
                "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
                "image": {"@type": "ImageObject", "url": absolute_social_image},
                "encoding": {
                    "@type": "MediaObject",
                    "contentUrl": absolute_pdf_url,
                    "encodingFormat": "application/pdf",
                },
            },
        ],
    }
    json_ld = json.dumps(structured_data, ensure_ascii=False, indent=2)
    escaped_title = html.escape(note.title)
    escaped_full_title = html.escape(title)
    escaped_speaker = html.escape(note.speaker)
    escaped_summary = html.escape(note.summary)
    escaped_day = html.escape(note.day)
    download_name = f"hplt-nlpl-{note.slug}-notes.pdf"

    return f'''<!doctype html>
<html lang="en" dir="auto">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,shrink-to-fit=no">
  <meta name="robots" content="index, follow">
  <title>{escaped_full_title}</title>
  <meta name="description" content="{escaped_summary}">
  <meta name="author" content="Lucia Domenichelli">
  <link crossorigin="anonymous" href="/assets/css/stylesheet.5ad9b1caa92e4cea83ebcd3088e97362f239b07d8144490aaf0bc1d6bd89cd17.css" integrity="sha256-WtmxyqkuTOqD680wiOlzYvI5sH2BREkKrwvB1r2JzRc=" rel="preload stylesheet" as="style">
  <link rel="stylesheet" href="/assets/css/site-theme.css">
  <link rel="stylesheet" href="/assets/css/winter-school-reader.css">
  <link rel="canonical" href="{canonical}">
  <link rel="icon" href="/favicon-dithered.ico">
  <meta name="theme-color" content="#edf2f5">
  <meta property="og:title" content="{escaped_full_title}">
  <meta property="og:description" content="{escaped_summary}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{canonical}">
  <meta property="og:image" content="{absolute_social_image}">
  <meta property="og:site_name" content="lucia's room">
  <meta property="article:published_time" content="{PUBLISHED_DATE}T00:00:00+01:00">
  <meta property="article:modified_time" content="{MODIFIED_DATE}T00:00:00+02:00">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{escaped_full_title}">
  <meta name="twitter:description" content="{escaped_summary}">
  <meta name="twitter:image" content="{absolute_social_image}">
  <script type="application/ld+json">
{json_ld}
  </script>
  <script src="/assets/js/analytics.js" async></script>
  <script src="/assets/js/winter-school-reader.js" defer></script>
</head>
<body class="dark ws-reader-page" id="top">
  <a class="ws-skip-link" href="#note-pages">Skip to the notes</a>

  <header class="ws-reader-bar">
    <div class="ws-reader-bar-inner">
      <a class="ws-reader-back" href="/posts/post5/#{note.section_anchor}" aria-label="Back to all HPLT and NLPL Winter School notes">← <span>All winter school notes</span></a>
      <div class="ws-reader-heading">
        <p class="ws-reader-speaker">{escaped_speaker}</p>
        <h1>{escaped_title}</h1>
      </div>
      <div class="ws-reader-tools">
        <span class="ws-reader-progress" aria-hidden="true"><span data-current-page>1</span> / {total}</span>
        <a class="ws-reader-download" data-note-download="{note.slug}" href="{pdf_url}" download="{download_name}">Download PDF ↓</a>
      </div>
    </div>
  </header>

  <main class="ws-reader-main" id="note-pages">
    <p class="ws-reader-intro"><a href="/posts/post5/">HPLT × NLPL Winter School</a> · {escaped_day} · Scroll to read</p>
    <section class="ws-reader-summary" aria-labelledby="reader-summary-title">
      <h2 id="reader-summary-title">About these notes</h2>
      <p>{escaped_summary}</p>
      <ul aria-label="Topics covered">
{topics}
      </ul>
    </section>
    <ol class="ws-reader-pages" aria-label="{total} pages from {html.escape(note.title, quote=True)}">
{page_markup(note, pages)}
    </ol>
    <nav class="ws-reader-end" aria-label="End of notes actions">
      <a href="/posts/post5/#{note.section_anchor}">← All winter school notes</a>
      <a href="{pdf_url}" download="{download_name}">Download PDF ↓</a>
      <a href="#top">Back to top ↑</a>
    </nav>
  </main>
</body>
</html>
'''


def landing_card(note: Note, page_count: int) -> str:
    page_label = "page" if page_count == 1 else "pages"
    return f'''<!-- winter-reader:{note.slug}:start -->
<aside class="winter-note-reader" data-note-reader="{note.slug}" aria-label="Open {html.escape(note.title, quote=True)} as scrolling notes">
  <div class="winter-note-reader-visual" aria-hidden="true">
    <span class="winter-note-reader-sheet"></span>
    <span class="winter-note-reader-count">{page_count} {page_label}</span>
  </div>
  <div class="winter-note-reader-copy">
    <p class="winter-note-reader-kicker">Continuous reader</p>
    <p class="winter-note-reader-title">{html.escape(note.title)}</p>
    <p class="winter-note-reader-description">Read every page in the site’s native scroll, without a nested PDF viewport.</p>
    <div class="winter-note-reader-actions">
      <a class="winter-note-reader-action is-primary" data-note-open="{note.slug}" href="/posts/post5/read/{note.slug}/" target="_blank" rel="noopener">Read notes →</a>
      <a class="winter-note-reader-action" data-note-download="{note.slug}" href="/{note.pdf_name}" download="hplt-nlpl-{note.slug}-notes.pdf">Download PDF ↓</a>
    </div>
  </div>
</aside>
<!-- winter-reader:{note.slug}:end -->'''


def update_landing_page(page_counts: dict[str, int]) -> None:
    landing_path = REPO_DIR / "posts" / "post5" / "index.html"
    public_landing_path = REPO_DIR / "public" / "posts" / "post5" / "index.html"
    source = landing_path.read_text(encoding="utf-8")

    if "/assets/css/winter-school-notes.css" not in source:
        source = source.replace(
            "</head>",
            '<link rel="stylesheet" href="/assets/css/winter-school-notes.css">\n</head>',
            1,
        )

    maria = next(note for note in NOTES if note.slug == "generalization")
    maria_intro = (
        '<h2 id=-generalization>📍 Pitfalls in Measuring Generalization'
        '<a hidden class=anchor aria-hidden=true href=#-generalization>#</a></h2>'
        '<p><strong>Speaker:</strong> Marianna Nezhurina</p>'
        '<p>These slides focus on data leakage, benchmark contamination, and the '
        'evaluation choices that can make model generalization look stronger than it is.</p>'
    )
    maria_pattern = re.compile(
        r"##\s*📍\s*\*Generalization\*\s*"
        r"<embed\s+src=/maria\.pdf\s+width=100%\s+height=800px\s+type=application/pdf>"
    )
    maria_replacement = maria_intro + landing_card(maria, page_counts[maria.slug])
    source, maria_replacements = maria_pattern.subn(maria_replacement, source, count=1)
    if maria_replacements == 0 and f'data-note-reader="{maria.slug}"' not in source:
        raise RuntimeError("Could not replace the maria.pdf embed on post5")

    for note in NOTES:
        if note.slug == "generalization":
            continue
        card = landing_card(note, page_counts[note.slug])
        marker_pattern = re.compile(
            rf"<!-- winter-reader:{re.escape(note.slug)}:start -->.*?"
            rf"<!-- winter-reader:{re.escape(note.slug)}:end -->",
            re.DOTALL,
        )
        if marker_pattern.search(source):
            source = marker_pattern.sub(card, source, count=1)
            continue

        embed_pattern = re.compile(
            rf"<embed\s+src=/{re.escape(note.pdf_name)}\s+width=100%\s+"
            r"height=800px\s+type=application/pdf>"
        )
        source, replacements = embed_pattern.subn(card, source, count=1)
        if replacements != 1:
            raise RuntimeError(f"Could not replace the {note.pdf_name} embed on post5")

    toc_entry = '<li><a href=#-generalization>📍 Pitfalls in Measuring Generalization</a></li>'
    if toc_entry not in source:
        toc_tail = (
            '<li><a href=#-powerlaws--generalization>📍 Power Laws & Generalization</a></li>'
            '</ul></nav>'
        )
        if toc_tail in source:
            source = source.replace(toc_tail, toc_tail.replace('</ul></nav>', toc_entry + '</ul></nav>'), 1)

    source = source.replace("## 📍 *Generalization*", "📍 Pitfalls in Measuring Generalization")
    if re.search(r"<(?:iframe|object|embed)\b", source, re.IGNORECASE):
        raise RuntimeError("post5 still contains a nested document viewport")

    landing_path.write_text(source, encoding="utf-8")
    public_landing_path.parent.mkdir(parents=True, exist_ok=True)
    public_landing_path.write_text(source, encoding="utf-8")
    if landing_path.read_bytes() != public_landing_path.read_bytes():
        raise RuntimeError("Root/public post5 landing pages differ")

    for search_path in (REPO_DIR / "index.json", REPO_DIR / "public" / "index.json"):
        search_source = search_path.read_text(encoding="utf-8")
        search_source = search_source.replace(
            "## 📍 *Generalization*", "📍 Pitfalls in Measuring Generalization"
        )
        search_path.write_text(search_source, encoding="utf-8")

    print("Updated post5 to open all five PDFs as continuous readers")


def build_note(note: Note, skip_images: bool) -> None:
    pdf_path = REPO_DIR / note.pdf_name
    if not pdf_path.is_file():
        raise FileNotFoundError(pdf_path)
    page_count = pdf_page_count(pdf_path)
    pages_dir = REPO_DIR / "posts" / "post5" / "read" / note.slug / "pages"

    if skip_images:
        rendered = sorted(pages_dir.glob("page-*.jpg"))
        if len(rendered) != page_count:
            raise RuntimeError(
                f"{note.slug} has {len(rendered)} rendered pages; expected {page_count}"
            )
        pages = [(path, *jpeg_dimensions(path)) for path in rendered]
    else:
        pages = render_pages(note, page_count)

    markup = reader_html(note, pages)
    reader_path = REPO_DIR / "posts" / "post5" / "read" / note.slug / "index.html"
    public_reader_path = REPO_DIR / "public" / "posts" / "post5" / "read" / note.slug / "index.html"
    reader_path.parent.mkdir(parents=True, exist_ok=True)
    public_reader_path.parent.mkdir(parents=True, exist_ok=True)
    reader_path.write_text(markup, encoding="utf-8")
    public_reader_path.write_text(markup, encoding="utf-8")

    if reader_path.read_bytes() != public_reader_path.read_bytes():
        raise RuntimeError(f"Root/public HTML copies differ for {note.slug}")

    print(f"Built {note.slug}: {page_count} continuous pages")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-images",
        action="store_true",
        help="Regenerate HTML from existing JPEG pages without rerendering the PDFs.",
    )
    parser.add_argument(
        "--note",
        choices=[note.slug for note in NOTES],
        action="append",
        help="Build only the selected reader; may be passed more than once.",
    )
    args = parser.parse_args()

    for command_name in ("pdfinfo", "pdftocairo"):
        if shutil.which(command_name) is None:
            raise RuntimeError(f"Missing required command: {command_name}")

    selected = set(args.note or ())
    page_counts = {note.slug: pdf_page_count(REPO_DIR / note.pdf_name) for note in NOTES}
    for note in NOTES:
        if selected and note.slug not in selected:
            continue
        build_note(note, args.skip_images)

    update_landing_page(page_counts)


if __name__ == "__main__":
    main()
