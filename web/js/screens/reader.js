// The reader: the theory of a chapter on one page you scroll through, made from the same content
// files as the PDFs (the blocks of make_pdfs.py, here as HTML). A "pagebreak" block starts a new
// part; a part counts as read once its end has been on the screen. Your progress (parts seen,
// last part, done) is saved in the same layout as in the app, plus how far down you were.

import * as data from "../data.js";
import * as store from "../store.js";
import { t } from "../text.js";
import { h, icon, bar } from "../ui.js";
import { state, saveProgress, saveLog, unitById, setPlace } from "../state.js";
import { LEVEL_NAMES } from "./home.js";
import { helperPanel } from "./helper.js";

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
      h("div", { class: "solutions-line", role: "note" },
        h("strong", {}, t("Solutions below")),
        h("span", {}, t("Do the exercises above first. Scroll on only when you want to check your answers."))),
      h("h2", { class: "reader-h1", id: "solutions" }, t("Answers")),
      exercises.map(([kind, block]) => kind === "exercises"
        ? table(["#", ...(block.answer_titles || [t("Answer"), t("Full sentence")])],
            block.items.map((item, n) => [String(n + 1), h("strong", { class: "irregular" }, rich(item.a)),
              rich(block.answer_titles ? item.why || "" : item.full || "")]))
        : table(["#", t("Translation")], block.items.map((item, n) => [String(n + 1), rich(item.a)])))),
  };
}

// Splits the blocks into parts at each "pagebreak".
function partsOf(blocks) {
  const parts = [[]];
  for (const block of blocks) {
    if (block.type === "pagebreak") { if (parts[parts.length - 1].length) parts.push([]); }
    else parts[parts.length - 1].push(block);
  }
  return parts.filter((part) => part.length);
}

// ---------- progress ----------
function entry(unitId) {
  return state.progress[unitId] ??= { seen: [], last_page: 0, done: false, updated: null };
}

const now = () => new Date().toISOString().slice(0, 19);

// How much of the chapter you read, 0 to 1: the parts you finished, or how far down you got.
export const readShare = (e, total) => (e.done ? 1 : Math.min(1, Math.max((e.seen || []).length / total, e.farthest || 0)));

// A part has been read: saved, and it counts towards today's study time.
function seePart(unitId, part, total) {
  const e = entry(unitId);
  if (e.seen.includes(part)) return false;
  e.seen.push(part);
  if (e.seen.length >= total) e.done = true; // every part read
  e.updated = now();
  store.addActivity(state.log, "page");
  saveLog();
  return true;
}

function toggleDone(unitId) {
  const e = entry(unitId);
  e.done = !e.done;
  if (!e.done) { e.seen = []; e.last_page = 0; e.scroll = 0; } // like the app: "not done" starts the chapter again
  e.updated = now();
  saveProgress();
  state.render();
}

// ---------- following the scrolling ----------
// One listener for the whole visit; it only does something while a reader is on the screen.
let reading = null; // the open reader: { unitId, article, parts, total, fill, percent, readBar, doneButton }

function update() {
  if (!reading || !reading.article.isConnected) { reading = null; return; }
  const { article, parts, unitId, total } = reading;
  const box = article.getBoundingClientRect();
  const view = window.innerHeight;
  // How far: 0 at the top of the text, 1 when its end is on the screen
  const share = Math.max(0, Math.min(1, (view - box.top) / Math.max(1, box.height)));
  reading.fill.style.height = `${share * 100}%`;
  const e = entry(unitId);
  let changed = false;
  parts.forEach((part, n) => { if (part.getBoundingClientRect().bottom <= view) changed = seePart(unitId, n, total) || changed; });
  const current = parts.findIndex((part) => part.getBoundingClientRect().bottom > 80);
  e.last_page = current < 0 ? total - 1 : current;
  e.scroll = Math.max(0, Math.min(1, -box.top / Math.max(1, box.height)));
  // The farthest you got (the part of the text that has been on the screen), for the percentage
  e.farthest = Math.max(e.farthest || 0, Math.round(share * 1000) / 1000);
  const read = readShare(e, total);
  reading.percent.textContent = t("{percent}% read", { percent: Math.round(read * 100) });
  const inner = reading.readBar.querySelector("div");
  if (inner) inner.style.width = `${read * 100}%`;
  if (changed && e.done) reading.doneButton.textContent = t("Mark as not done");
  // Saved a moment after you stop scrolling, not on every movement
  clearTimeout(reading.saveTimer);
  reading.saveTimer = setTimeout(() => { e.updated = now(); saveProgress(); }, changed ? 0 : 1200);
}

let listening = false;
function follow() {
  if (listening) return;
  listening = true;
  let waiting = false;
  const onScroll = () => {
    if (waiting) return;
    waiting = true;
    requestAnimationFrame(() => { waiting = false; update(); });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
}

// ---------- the screen ----------
export async function readerScreen(part, unitId, partText) {
  const unit = unitById(unitId);
  if (!unit) { location.hash = `#/${state.course}`; return h("div"); }
  const [document_, languages] = await Promise.all([data.unitText(state.course, unit.id), data.languages()]);
  const exercises = [];
  const blocks = makeBlocks({ ...state.info, names: languages.names }, languages.profiles[state.info.learn], exercises);
  const parts = partsOf(document_.blocks);
  const total = parts.length;
  const e = entry(unit.id);
  setPlace("read", unit.id);
  const base = `#/${state.course}`;
  const meta = document_.meta;

  // Each part in its own section; the big headings get an id so the contents can jump to them.
  const headings = [];
  const sections = parts.map((partBlocks, n) => h("section", { class: "reader-part", "data-part": n },
    partBlocks.map((b) => {
      const element = (blocks[b.type] || (() => null))(b);
      if (b.type === "h1" && element) {
        element.id = `part-${headings.length}`;
        headings.push([element.id, b.text]);
      }
      return element;
    })));
  const header = h("header", { class: "stack", style: "gap: 6px; margin-bottom: 8px" },
    h("div", { class: "eyebrow", style: "color: var(--accent)" },
      `${meta.level} · ${meta.section || ""} · ${t("Chapter {number}", { number: meta.number })}`),
    h("h1", { style: "font-size: 34px" }, meta.title),
    meta.subtitle && h("p", { class: "lead" }, meta.subtitle));
  const article = h("article", { class: "reader-page", lang: state.info.explained_in },
    header, sections, meta.next && h("p", { class: "muted", style: "margin-top: 24px" }, rich(meta.next)));
  // The thin bar on the left: how far down the page you are
  const fill = h("div", { class: "reader-rail-fill" });
  const rail = h("div", { class: "reader-rail", "aria-hidden": "true" }, h("div", { class: "reader-rail-track" }, fill));

  const read = readShare(e, total);
  const percent = h("span", { class: "muted" }, t("{percent}% read", { percent: Math.round(read * 100) }));
  const readBar = bar(read);
  const doneButton = h("button", { type: "button", class: "button", onclick: () => toggleDone(unit.id) },
    e.done ? t("Mark as not done") : t("Mark as done"));
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const link = (id, label) => h("a", { href: `#${id}`, onclick: (event) => { event.preventDefault(); jump(id); } }, label);
  const contents = headings.length > 1 && h("section", { class: "card reader-contents" },
    h("strong", {}, t("Contents")),
    h("ol", {}, headings.map(([id, text]) => h("li", {}, link(id, rich(text))))),
    exercises.length ? link("solutions", t("Solutions")) : null);

  reading = { unitId: unit.id, article, parts: sections, total, fill, percent, readBar, doneButton };
  follow();
  // Once the page is on the screen: back to where you were, or to the part in the address
  state.afterRender = () => {
    const wanted = partText ? sections[Number(partText) - 1] : null;
    if (wanted) wanted.scrollIntoView({ block: "start" });
    else if (e.scroll > 0 && e.scroll < 0.98) {
      const box = article.getBoundingClientRect();
      window.scrollTo(0, box.top + window.scrollY + e.scroll * box.height);
    }
    update();
  };

  const helper = helperPanel(unit); // the AI helper beside the text (helper.js)
  document.title = `${unit.title} · [SITE NAME]`;
  return h("div", { class: "stack" },
    h("nav", { class: "breadcrumb", "aria-label": t("You are here") },
      h("a", { href: base }, t("Course")), h("span", { "aria-hidden": "true" }, "/"),
      h("a", { href: `${base}/level/${unit.level}` }, `${unit.level} · ${t(LEVEL_NAMES[unit.level])}`),
      h("span", { "aria-hidden": "true" }, "/"), h("span", {}, t("Chapter {number}", { number: unit.number }))),
    h("div", { class: "columns" },
      h("section", { class: "wide", style: "gap: 16px" },
        h("div", { class: "reader-with-rail" }, rail, article),
        h("div", { class: "row between" }, h("span"),
          h("a", { class: "button primary", href: `${base}/unit/${unit.id}` }, t("Practise this chapter")))),
      h("aside", { class: "side reader-side" },
        h("section", { class: "card" },
          h("div", { class: "row between" }, h("strong", {}, t("Theory")), percent),
          readBar,
          h("a", { class: "button primary", href: `${base}/unit/${unit.id}` }, t("Practise this chapter")),
          doneButton,
          unit.file && h("a", { class: "button", href: `data/${state.course}/pdf/${unit.file}`, download: unit.file }, t("Download as PDF"))),
        helper.panel,
        contents,
        h("p", { class: "muted" }, t("Your place is saved, so you can stop at any time.")))),
    helper.opener);
}
