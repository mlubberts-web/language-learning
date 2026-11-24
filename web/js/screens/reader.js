// The reader: the text of a unit as web pages, made from the same content files as the PDFs
// (the blocks of make_pdfs.py, here as HTML). A "pagebreak" block starts a new page.
// Your progress (pages seen, last page, done) is saved in the same layout as in the app.

import * as data from "../data.js";
import * as store from "../store.js";
import { t } from "../text.js";
import { h, icon, bar } from "../ui.js";
import { state, saveProgress, saveLog, unitById } from "../state.js";
import { LEVEL_NAMES } from "./home.js";

// ---------- text with <b>, <i> and <br/> ----------
// Content texts may use <b>bold</b>, <i>italic</i> and <br/>. Only those become formatting;
// anything else stays plain text. In verb forms, *stars* mark the irregular part (red).
function rich(text, stars = false) {
  const span = document.createElement("span");
  // Stars only count in verb forms; elsewhere a star is just a star (*Pienso de que: a wrong sentence).
  const pattern = stars ? /(<\/?b>|<\/?i>|<br\s*\/?>|<font[^>]*>|<\/font>|\*[^*]+\*)/ : /(<\/?b>|<\/?i>|<br\s*\/?>|<font[^>]*>|<\/font>)/;
  const parts = String(text ?? "").split(pattern);
  let target = span;
  const open = [];
  for (const part of parts) {
    if (!part) continue;
    if (part === "<b>" || part === "<i>") {
      const element = document.createElement(part === "<b>" ? "strong" : "em");
      target.append(element); open.push(target); target = element;
    } else if ((part === "</b>" || part === "</i>") && open.length) {
      target = open.pop();
    } else if (/^<br/.test(part)) {
      target.append(document.createElement("br"));
    } else if (/^<\/?font/.test(part)) {
      // a colour in the content: ignored, the site has its own colours
    } else if (stars && /^\*[^*]+\*$/.test(part)) {
      target.append(h("strong", { class: "irregular" }, part.slice(1, -1)));
    } else {
      target.append(part);
    }
  }
  return span;
}

// ---------- the blocks ----------
function table(head, rows, options = {}) {
  return h("div", { class: "table-box" }, h("table", { class: options.className || "" },
    head && h("thead", {}, h("tr", {}, head.map((cell) => h("th", { scope: "col" }, cell instanceof Node ? cell : rich(cell))))),
    h("tbody", {}, rows.map((row) => h("tr", {}, row.map((cell, c) => {
      const content = cell instanceof Node ? cell : rich(cell, options.stars);
      return c === 0 && options.firstBold ? h("th", { scope: "row" }, content) : h("td", {}, content);
    }))))));
}

const bullets = (items) => h("ul", {}, items.map((item) => h("li", {}, rich(item))));

function makeBlocks(info, profile, exercises) {
  const base = info.explained_in;
  const language = (code) => { const name = info.names[code][base]; return name.charAt(0).toUpperCase() + name.slice(1); };
  const persons = profile.table_persons || profile.persons;
  return {
    h1: (b) => h("h2", { class: "reader-h1" }, rich(b.text)),
    h2: (b) => h("h3", { class: "reader-h2" }, rich(b.text)),
    p: (b) => h("p", {}, rich(b.text)),
    bullets: (b) => bullets(b.items),
    callout: (b) => h("aside", { class: `callout ${b.kind || "tip"}` },
      b.title && h("div", { class: "callout-title" }, rich(b.title)),
      b.text && h("p", {}, rich(b.text)),
      b.bullets && bullets(b.bullets)),
    table: (b) => table(b.head, b.style === "endings"
      ? b.rows.map((row) => [row[0], ...row.slice(1).map((v) => h("strong", { class: "irregular" }, rich(v)))])
      : b.rows, { firstBold: true }),
    verbpairs: (b) => h("div", { class: "stack", style: "gap: 6px" },
      b.title && h("div", { class: "table-title" }, rich(b.title)),
      table(null, b.items.map(([word, meaning]) => [h("strong", {}, rich(word)), rich(meaning)]), { className: "pairs" })),
    conj: (b) => {
      const forms = b.forms || b.endings.map((end) => `${b.stem}*${end}*`);
      const kind = b.label ? rich(b.label) : rich(t("regular {group} verb", { group: `<b>${b.group || ""}</b>` }));
      const examples = b.examples || [];
      return h("div", { class: "stack", style: "gap: 6px" },
        h("div", { class: "table-title" }, h("strong", {}, b.verb), ` — ${b.meaning || ""} · `, kind),
        table([t("Person"), t("Form"), t("Example"), language(base)],
          persons.map((person, n) => [person, h("strong", {}, rich(forms[n] || "", true)),
            h("em", {}, rich((examples[n] || ["", ""])[0])), rich((examples[n] || ["", ""])[1])])));
    },
    conjgrid: (b) => {
      const people = b.persons || persons;
      return h("div", { class: "stack", style: "gap: 6px" },
        b.title && h("div", { class: "table-title" }, rich(b.title)),
        table([b.person_title || t("Person"), ...b.verbs.map((v) => h("span", {}, h("strong", {}, v.inf), v.meaning ? h("span", { class: "small-head" }, v.meaning) : null))],
          people.map((person, n) => [person, ...b.verbs.map((v) => h("strong", {}, rich(v.forms[n] || "", true)))])));
    },
    mistakes: (b) => table([t("Instead of…"), t("Write…"), t("Why")],
      b.rows.map(([wrong, right, why]) => [h("span", { class: "mistake" }, rich(wrong)), h("strong", { class: "correction" }, rich(right)), rich(why)])),
    exercises: (b) => {
      exercises.push(["exercises", b]);
      return table(["#", ...(b.titles || [t("Sentence"), t("Hint")])],
        b.items.map((item, n) => [String(n + 1), rich(item.q), h("span", { class: "muted" }, rich(item.hint || ""))]));
    },
    translations: (b) => {
      exercises.push(["translations", b]);
      return h("ol", { class: "translations" }, b.items.map((item) => h("li", {}, rich(item.q))));
    },
    answers: () => h("div", { class: "stack" },
      h("h2", { class: "reader-h1" }, t("Answers")),
      exercises.map(([kind, block]) => kind === "exercises"
        ? table(["#", ...(block.answer_titles || [t("Answer"), t("Full sentence")])],
            block.items.map((item, n) => [String(n + 1), h("strong", { class: "irregular" }, rich(item.a)),
              rich(block.answer_titles ? item.why || "" : item.full || "")]))
        : table(["#", t("Translation")], block.items.map((item, n) => [String(n + 1), rich(item.a)])))),
  };
}

// Splits the blocks into pages at each "pagebreak".
function pagesOf(blocks) {
  const pages = [[]];
  for (const block of blocks) {
    if (block.type === "pagebreak") { if (pages[pages.length - 1].length) pages.push([]); }
    else pages[pages.length - 1].push(block);
  }
  return pages.filter((page) => page.length);
}

// ---------- progress ----------
function entry(unitId) {
  return state.progress[unitId] ??= { seen: [], last_page: 0, done: false, updated: null };
}

function seePage(unitId, page, total) {
  const e = entry(unitId);
  const isNew = !e.seen.includes(page);
  if (isNew) e.seen.push(page);
  e.last_page = page;
  if (e.seen.length >= total) e.done = true; // every page read
  e.updated = new Date().toISOString().slice(0, 19);
  saveProgress();
  // A page counts towards today's study time once per visit to it
  if (state.loggedPage !== `${unitId}/${page}`) {
    state.loggedPage = `${unitId}/${page}`;
    store.addActivity(state.log, "page");
    saveLog();
  }
}

function toggleDone(unitId) {
  const e = entry(unitId);
  e.done = !e.done;
  if (!e.done) { e.seen = []; e.last_page = 0; } // like the app: "not done" starts the unit again
  e.updated = new Date().toISOString().slice(0, 19);
  saveProgress();
  state.render();
}

// ---------- the screen ----------
let keysReady = false;

export async function readerScreen(part, unitId, pageText) {
  const unit = unitById(unitId);
  if (!unit) { location.hash = `#/${state.course}`; return h("div"); }
  const [document_, languages] = await Promise.all([data.unitText(state.course, unit.id), data.languages()]);
  const exercises = [];
  const blocks = makeBlocks({ ...state.info, names: languages.names }, languages.profiles[state.info.learn], exercises);
  const pages = pagesOf(document_.blocks);
  const total = pages.length;
  const e = entry(unit.id);
  const wanted = pageText ? Number(pageText) - 1 : e.last_page;
  const page = Math.max(0, Math.min(total - 1, Number.isFinite(wanted) ? wanted : 0));
  seePage(unit.id, page, total);
  // Exercises on earlier pages are needed for the answers page, so all pages are built, one shown.
  const built = pages.map((blocksOfPage) => blocksOfPage.map((b) => (blocks[b.type] || (() => null))(b)));
  const base = `#/${state.course}`;
  const go = (n) => { location.hash = `${base}/read/${unit.id}/${n + 1}`; };

  if (!keysReady) { // the arrow keys turn the pages (once for the whole visit)
    keysReady = true;
    document.addEventListener("keydown", (event) => {
      const match = location.hash.match(/\/read\/([^/]+)\/?(\d*)$/);
      if (!match || event.target.matches?.("input, textarea, select") || event.altKey || event.ctrlKey || event.metaKey) return;
      const now = state.readerPage;
      if (event.key === "ArrowRight" && now.page < now.total - 1) go2(now.page + 1);
      if (event.key === "ArrowLeft" && now.page > 0) go2(now.page - 1);
      function go2(n) { location.hash = `#/${state.course}/read/${decodeURIComponent(match[1])}/${n + 1}`; }
    });
  }
  state.readerPage = { page, total };

  const meta = document_.meta;
  const header = page === 0 && h("header", { class: "stack", style: "gap: 6px; margin-bottom: 8px" },
    h("div", { class: "eyebrow", style: "color: var(--accent)" },
      `${meta.level} · ${meta.section || ""} · ${t("Unit {number}", { number: meta.number })}`),
    h("h1", { style: "font-size: 34px" }, meta.title),
    meta.subtitle && h("p", { class: "lead" }, meta.subtitle));
  const article = h("article", { class: "reader-page", lang: state.info.explained_in },
    header, built[page], page === total - 1 && meta.next && h("p", { class: "muted", style: "margin-top: 24px" }, rich(meta.next)));

  const turn = (label, n, shape, disabled) => h("button", { type: "button", class: "button icon-button", "aria-label": label,
    disabled, onclick: () => go(n) }, icon(shape, 18));
  const done = e.done;
  document.title = `${unit.title} · [SITE NAME]`;
  return h("div", { class: "stack" },
    h("nav", { class: "breadcrumb", "aria-label": t("You are here") },
      h("a", { href: base }, t("Course")), h("span", { "aria-hidden": "true" }, "/"),
      h("a", { href: `${base}/level/${unit.level}` }, `${unit.level} · ${t(LEVEL_NAMES[unit.level])}`),
      h("span", { "aria-hidden": "true" }, "/"), h("span", {}, t("Unit {number}", { number: unit.number }))),
    h("div", { class: "columns" },
      h("section", { class: "wide", style: "gap: 16px" },
        h("div", { class: "row between" },
          h("h2", { style: "font-size: 22px" }, unit.title),
          h("div", { class: "row", style: "gap: 8px" },
            turn(t("Previous page"), page - 1, "left", page === 0),
            h("div", { style: "min-width: 110px; text-align: center" }, t("Page {page} of {total}", { page: page + 1, total })),
            turn(t("Next page"), page + 1, "right", page >= total - 1))),
        article,
        h("div", { class: "row between" },
          page > 0 ? h("button", { type: "button", class: "button", onclick: () => go(page - 1) }, icon("left", 16), t("Previous page")) : h("span"),
          page < total - 1
            ? h("button", { type: "button", class: "button primary", onclick: () => go(page + 1) }, t("Next page"), icon("right", 16))
            : h("a", { class: "button primary", href: `${base}/unit/${unit.id}` }, t("Practise this unit")))),
      h("aside", { class: "side", style: "gap: 16px" },
        h("section", { class: "card" },
          h("div", { class: "row between" }, h("strong", {}, t("Read")), h("span", { class: "muted" }, t("{read} of {total} pages", { read: done ? total : e.seen.length, total }))),
          bar(done ? 1 : e.seen.length / total),
          h("div", { class: "page-buttons" }, pages.map((_, n) => h("button", { type: "button",
            class: n === page ? "here" : (done || e.seen.includes(n)) ? "seen" : "",
            "aria-label": t("Page {page}", { page: n + 1 }), "aria-current": n === page ? "page" : null,
            onclick: () => go(n) }, n + 1)))),
        h("section", { class: "card" },
          h("a", { class: "button primary", href: `${base}/unit/${unit.id}` }, t("Practise this unit")),
          h("button", { type: "button", class: "button", onclick: () => toggleDone(unit.id) }, done ? t("Mark as not done") : t("Mark as done")),
          unit.file && h("a", { class: "button", href: `data/${state.course}/pdf/${unit.file}`, download: unit.file }, t("Download PDF"))),
        h("p", { class: "muted" }, t("Use the arrow keys to turn pages. Your page is saved, so you can stop at any time.")))));
}
