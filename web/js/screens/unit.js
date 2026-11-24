// The exercises of one unit: one card per exercise type, the mixed test and your weak questions.

import * as data from "../data.js";
import * as store from "../store.js";
import { t } from "../text.js";
import { h, bar } from "../ui.js";
import { state, savePractice, modeTitle, unitById } from "../state.js";
import { doneKey } from "../rounds.js";
import { startDrill, SIZES } from "./session.js";
import { LEVEL_NAMES } from "./home.js";

// How many questions per session: kept for this visit
let chosenSize = "All";

export const mastery = (items) =>
  items.filter((item) => store.isMastered(state.practice, item.id) || store.isMarkedDone(state.practice, doneKey(item))).length;

export function sizeButtons() {
  return h("div", { class: "row" },
    h("span", { class: "muted" }, t("Questions per session")),
    h("div", { class: "segmented", role: "group", "aria-label": t("Questions per session") },
      Object.keys(SIZES).map((name) => h("button", { type: "button", "aria-pressed": String(name === chosenSize),
        onclick: () => { chosenSize = name; state.render(); } }, t(name)))));
}

export const sessionSize = () => SIZES[chosenSize];

export function skipSwitch() {
  return h("label", { class: "switch", title: t("Leaves out the questions you got right on the first try last time, and exercises you marked as done. The daily review still brings them back after 1, 3, 7 and 30 days.") },
    h("input", { type: "checkbox", checked: store.skipKnown(state.practice), onchange: (event) => {
      store.setSkipKnown(state.practice, event.target.checked);
      savePractice();
    } }), t("Skip what I know"));
}

function doneSwitch(items) {
  const keys = [...new Set(items.map(doneKey))];
  const ticked = keys.every((key) => store.isMarkedDone(state.practice, key));
  return h("label", { class: "switch" },
    h("input", { type: "checkbox", checked: ticked, onchange: (event) => {
      for (const key of keys) store.markDone(state.practice, key, event.target.checked);
      savePractice();
      state.render();
    } }), t("Mark as done"));
}

function modeCard(unit, all, mode, title, text, items) {
  const scores = state.practice.scores[unit.id] || {};
  const groups = [...new Set(items.map((item) => item.group).filter(Boolean))].sort();
  const topic = ["words", "reverse", "gender"].includes(mode) && groups.length > 1 &&
    h("select", { "aria-label": t("Topic") }, h("option", { value: "" }, t("All topics")),
      groups.map((name) => h("option", { value: name }, name)));
  const source = `${unit.level} · ${unit.title}`;
  const start = () => {
    const name = topic?.value;
    if (name) { // one topic only: then nothing follows, because the next type has no topics
      startDrill(items.filter((item) => item.group === name), `${source} · ${title} · ${name}`, ["unit", unit.id],
        { unitId: unit.id, mode, size: sessionSize(), checkKnown: true });
    } else {
      startDrill(items, `${source} · ${title}`, ["unit", unit.id],
        { unitId: unit.id, mode, size: sessionSize(), pool: all, source, checkKnown: mode !== "weak" });
    }
  };
  const line = [t("{mastered} of {questions} mastered", { mastered: mastery(items), questions: items.length })];
  if (scores[mode]) line.push(t("last {last}% · best {best}%", scores[mode]));
  return h("section", { class: "card mode-card" },
    h("h3", {}, title),
    h("p", { class: "muted" }, text),
    h("div", {}, line.join(" · ")),
    h("div", { class: "actions" },
      mode === "test" || mode === "weak" ? h("span") : doneSwitch(items),
      h("div", { class: "row" }, topic, h("button", { class: "button primary", onclick: start }, t("Start")))));
}

export async function unitScreen(part, unitId) {
  const unit = unitById(unitId);
  if (!unit) { location.hash = `#/${state.course}`; return h("div"); }
  const items = await data.unitItems(state.course, unit.id);
  const index = state.catalog.indexOf(unit);
  const before = state.catalog[index - 1], after = state.catalog[index + 1];
  const base = `#/${state.course}`;

  const cards = state.info.modes
    .map((m) => [m.id, modeTitle(m.id), m.text, items.filter((item) => item.mode === m.id)])
    .filter(([, , , list]) => list.length)
    .map(([mode, title, text, list]) => modeCard(unit, items, mode, title, text, list));
  cards.push(modeCard(unit, items, "test", t("Mixed test"), t("All exercise types mixed together."), items));
  const weak = items.filter((item) => store.isWeak(state.practice, item.id));
  if (weak.length) cards.push(modeCard(unit, items, "weak", t("Weak questions"), t("What you got wrong recently."), weak));

  const mastered = mastery(items);
  document.title = `${unit.title} · [SITE NAME]`;
  return h("div", { class: "stack" },
    h("nav", { class: "breadcrumb", "aria-label": t("You are here") },
      h("a", { href: base }, t("Course")), h("span", { "aria-hidden": "true" }, "/"),
      h("a", { href: `${base}/level/${unit.level}` }, `${unit.level} · ${t(LEVEL_NAMES[unit.level])}`),
      h("span", { "aria-hidden": "true" }, "/"), h("span", {}, t("Unit {number}", { number: unit.number }))),
    h("section", { class: "card big" },
      h("div", { class: "eyebrow" }, t("Practise")),
      h("h1", {}, unit.title),
      h("p", { class: "lead" }, unit.subtitle),
      h("div", { class: "row" }, h("div", { style: "flex: 1 1 200px" }, bar(items.length ? mastered / items.length : 0)),
        h("span", { class: "muted" }, t("{mastered} of {questions} questions mastered", { mastered, questions: items.length }))),
      h("div", { class: "row" },
        h("a", { class: "button", href: `${base}/read/${unit.id}` }, t("Read this unit")),
        before && h("a", { class: "button small", href: `${base}/unit/${before.id}` }, `← ${before.level} · ${before.number}`),
        after && h("a", { class: "button small", href: `${base}/unit/${after.id}` }, `${after.level} · ${after.number} →`))),
    h("div", { class: "row between" }, sizeButtons(), skipSwitch()),
    state.notice && h("div", { class: "notice", role: "status" }, takeNotice()),
    h("p", { class: "muted" }, t("After each session the next exercise type follows, in the order of the cards below.")),
    h("div", { class: "grid" }, cards));
}

function takeNotice() {
  const text = state.notice;
  state.notice = null; // shown once
  return text;
}
