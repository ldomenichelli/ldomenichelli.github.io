(function () {
  const shelf = document.querySelector("[data-library-shelf]");
  const updated = document.querySelector("[data-library-updated]");
  const count = document.querySelector("[data-library-count]");
  const card = document.querySelector("[data-library-card]");

  if (!shelf || !card) {
    return;
  }

  const fields = {
    title: card.querySelector("[data-book-title]"),
    author: card.querySelector("[data-book-author]"),
    status: card.querySelector("[data-book-status]"),
    genre: card.querySelector("[data-book-genre]"),
    note: card.querySelector("[data-book-note]"),
    linkWrap: card.querySelector("[data-book-link-wrap]"),
    link: card.querySelector("[data-book-link]"),
  };

  const colors = [
    ["#8a2638", "#d7ad4b"],
    ["#1f5b6d", "#f0cf77"],
    ["#2e6b52", "#e5c45c"],
    ["#7a3f7d", "#f0bf7a"],
    ["#9b5533", "#f3d27b"],
    ["#45568b", "#e8bf64"],
  ];

  function normalizeCatalogue(data) {
    if (Array.isArray(data)) {
      return { books: data, updated: "" };
    }

    if (data && Array.isArray(data.books)) {
      return {
        books: data.books,
        updated: data.updated || data.lastUpdated || "",
      };
    }

    return { books: [], updated: "" };
  }

  function placeholderBooks() {
    return Array.from({ length: 12 }, (_, index) => {
      const pair = colors[index % colors.length];
      return {
        title: "book slot",
        author: "waiting for json",
        status: "empty shelf",
        genre: "-",
        note: "This shelf is ready for the catalogue.",
        color: pair[0],
        accent: pair[1],
        placeholder: true,
      };
    });
  }

  function text(value, fallback) {
    return value == null || value === "" ? fallback : String(value);
  }

  function setCard(book) {
    fields.title.textContent = text(book.title, "untitled");
    fields.author.textContent = text(book.author, "unknown");
    fields.status.textContent = text(book.status, "shelved");
    fields.genre.textContent = text(book.genre, "-");
    fields.note.textContent = text(book.note, "");

    if (book.link) {
      fields.link.href = book.link;
      fields.link.textContent = text(book.linkLabel, "open link");
      fields.linkWrap.hidden = false;
    } else {
      fields.link.removeAttribute("href");
      fields.linkWrap.hidden = true;
    }
  }

  function makeBook(book, index) {
    const button = document.createElement("button");
    const pair = colors[index % colors.length];
    button.type = "button";
    button.className = "library-book";
    button.style.setProperty("--book-color", book.color || pair[0]);
    button.style.setProperty("--book-accent", book.accent || pair[1]);
    button.setAttribute("aria-label", text(book.title, "book"));

    if (book.placeholder) {
      button.classList.add("is-placeholder");
      button.tabIndex = -1;
    }

    if (book.cover) {
      const image = document.createElement("img");
      image.src = book.cover;
      image.alt = "";
      image.loading = "lazy";
      button.appendChild(image);
    }

    const label = document.createElement("span");
    label.textContent = text(book.shortTitle || book.title, "book");
    button.appendChild(label);

    button.addEventListener("click", () => {
      if (book.placeholder) {
        return;
      }

      shelf.querySelectorAll(".library-book").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      setCard(book);
    });

    return button;
  }

  function render(catalogue) {
    const hasBooks = catalogue.books.length > 0;
    const books = hasBooks ? catalogue.books : placeholderBooks();

    shelf.replaceChildren(...books.map(makeBook));

    if (updated) {
      updated.textContent = catalogue.updated
        ? `last updated: ${catalogue.updated}`
        : hasBooks
          ? "last updated: soon"
          : "last updated: catalogue soon";
    }

    if (count) {
      count.textContent = `${hasBooks ? catalogue.books.length : 0} books`;
    }

    setCard(hasBooks ? books[0] : placeholderBooks()[0]);

    const firstRealBook = shelf.querySelector(".library-book:not(.is-placeholder)");
    if (firstRealBook) {
      firstRealBook.classList.add("is-active");
    }
  }

  fetch("books.json", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : []))
    .then((data) => render(normalizeCatalogue(data)))
    .catch(() => render({ books: [], updated: "" }));
})();
