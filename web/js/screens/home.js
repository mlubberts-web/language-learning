// The course home: where you are, the units of one level, and today's review.

import * as data from "../data.js";
import * as store from "../store.js";
import { t } from "../text.js";
import { h, bar } from "../ui.js";
import { state } from "../state.js";
import { startDrill } from "./session.js";

export const LEVEL_NAMES = { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper intermediate", // t-list
                             C1: "Advanced", C2: "Mastery" }; // t-list

// How far you are in a unit: "done", "reading" or "new" (progress comes from the reader).
export function unitStatus(unit) {
  const entry = state.progress[unit.id];
  if (entry?.done) return "done";
  return entry?.seen?.length ? "reading" : "new";
}

const STATUS_TEXT = { done: "Done", reading: "In progress", new: "Not started" }; // t-list

// One unit with its buttons. withPlace: also say where it is in the course ("A2 · Unit 5").
function unitRow(unit, isNext, withPlace = false) {
  const status = unitStatus(unit);
  const base = `#/${state.course}`;
  const place = `${unit.level} · ${t("Unit {number}", { number: unit.number })}`;
  return h("div", { class: "unit" },
    h("div", { class: `number ${status}` }, withPlace ? unit.level : unit.number),
    h("div", { class: "about" },
      h("div", { class: "title" }, unit.title),
      h("div", { class: "muted" }, withPlace ? `${place} · ${t(STATUS_TEXT[status])}` : `${unit.section} · ${t(STATUS_TEXT[status])}`)),
    h("div", { class: "actions" },
      h("a", { class: isNext ? "button small primary" : "button small", href: `${base}/read/${unit.id}` },
        status === "done" ? t("Read again") : status === "reading" ? t("Continue") : t("Read")),
      h("a", { class: "button small", href: `${base}/unit/${unit.id}` }, t("Practise"))));
}

async function reviewCard() {
  const due = Object.entries(state.practice.items).filter(([, stats]) => (stats.due || "") <= store.today());
  const card = h("section", { class: "card" }, h("h2", {}, t("Daily review")));
  if (!due.length) {
    card.append(h("p", { class: "muted" }, t("Nothing to review today. Questions you practise come back after 1, 3, 7 and 30 days.")));
    return card;
  }
  card.append(h("p", {}, t("{count} questions are waiting for you today.", { count: due.length })),
    h("button", { class: "button primary", onclick: async () => {
      const ids = new Set(due.map(([id]) => id));
      const items = (await data.itemsOfUnits(state.course, state.catalog)).filter((item) => ids.has(item.id));
      const lists = Object.values(await data.themes(state.course)).flatMap((theme) => theme.items);
      startDrill(items.concat(lists.filter((item) => ids.has(item.id))), t("Daily review"), ["home"], { size: 30 });
    } }, t("Start the review")));
  return card;
}

// The units by subject: a list of the subjects, and the units of the chosen one with where each
// one is in the course. chosen: the id of a subject, like "tenses".
async function subjectsList(chosen, next) {
  const subjects = await data.getJSON(`${state.course}/categories.json`);
  const subject = subjects.find((s) => s.id === chosen) || subjects[0];
  const base = `#/${state.course}`;
  const units = subject.units.map((id) => state.catalog.find((unit) => unit.id === id)).filter(Boolean);
  const done = units.filter((unit) => unitStatus(unit) === "done").length;
  return h("section", { class: "stack" },
    h("div", { class: "row between" }, h("div", { class: "row" }, h("h2", {}, t("Your course")),
      h("div", { class: "segmented", role: "group", "aria-label": t("Show") },
        h("a", { class: "seg-link", href: `${base}` }, t("By level")),
        h("button", { type: "button", "aria-pressed": "true" }, t("By subject"))))),
    h("div", { class: "subject-list", role: "group", "aria-label": t("Subjects") }, subjects.map((s) =>
      h("a", { href: `${base}/subjects/${s.id}`, "aria-current": s.id === subject.id ? "true" : null },
        s.name, h("span", { class: "muted" }, ` ${s.units.length}`)))),
    h("div", { class: "card flush" },
      h("div", { class: "list-head" },
        h("div", { style: "font-weight: 600" }, subject.name),
        h("div", { class: "muted" }, t("{done} of {total} units done", { done, total: units.length }))),
      units.map((unit) => unitRow(unit, unit === next, true))));
}

export async function homeScreen(part, chosenLevel) {
  const levels = state.info.levels;
  const next = state.catalog.find((unit) => unitStatus(unit) !== "done");
  const level = levels.includes(chosenLevel) ? chosenLevel : next?.level || levels[0];
  const units = state.catalog.filter((unit) => unit.level === level);
  const done = units.filter((unit) => unitStatus(unit) === "done").length;
  const base = `#/${state.course}`;

  const continueCard = next && h("section", { class: "card big" },
    h("div", { class: "eyebrow" }, unitStatus(next) === "reading" ? t("Continue where you left off") : t("Next up")),
    h("h1", {}, next.title),
    h("p", { class: "lead" }, next.subtitle),
    h("div", { class: "muted" }, `${next.level} · ${t(LEVEL_NAMES[next.level])} · ${t("Unit {number}", { number: next.number })}`),
    h("div", { class: "row" },
      h("a", { class: "button primary", href: `${base}/read/${next.id}` }, unitStatus(next) === "reading" ? t("Continue reading") : t("Start reading")),
      h("a", { class: "button", href: `${base}/unit/${next.id}` }, t("Practise this unit"))));

  const tabs = h("div", { class: "segmented", role: "group", "aria-label": t("Level") },
    levels.map((code) => h("button", { type: "button", "aria-pressed": String(code === level),
      onclick: () => { location.hash = `${base}/level/${code}`; } }, code)));

  // By level (the units of one level) or by subject (all units about verb tenses ...)
  const views = h("div", { class: "segmented", role: "group", "aria-label": t("Show") },
    h("button", { type: "button", "aria-pressed": String(part !== "subjects"), onclick: () => { location.hash = `${base}/level/${level}`; } }, t("By level")),
    h("button", { type: "button", "aria-pressed": String(part === "subjects"), onclick: () => { location.hash = `${base}/subjects`; } }, t("By subject")));
  const list = part === "subjects" ? await subjectsList(chosenLevel, next) : h("section", { class: "stack" },
    h("div", { class: "row between" }, h("div", { class: "row" }, h("h2", {}, t("Your course")), views), tabs),
    h("div", { class: "card flush" },
      h("div", { class: "list-head" },
        h("div", { style: "font-weight: 600" }, `${level} · ${t(LEVEL_NAMES[level])}`),
        h("div", { class: "muted" }, t("{done} of {total} units done", { done, total: units.length }))),
      units.map((unit) => unitRow(unit, unit === next))));

  const levelCard = h("section", { class: "card" },
    h("h2", {}, t("Practise the whole level")),
    h("p", { class: "muted" }, t("A mixed test with questions from every unit of {level}.", { level })),
    h("button", { class: "button", onclick: async () => {
      const items = await data.itemsOfUnits(state.course, units);
      startDrill(items, `${level} · ${t("Mixed test")}`, ["level", level], { size: 30 });
    } }, t("Test all of {level} (30 questions)", { level })));

  document.title = `${state.info.title} · [SITE NAME]`;
  return h("div", { class: "columns" },
    h("div", { class: "wide" }, continueCard, list),
    h("aside", { class: "side" }, await reviewCard(), levelCard));
}
