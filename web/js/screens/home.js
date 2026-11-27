// The course home: where you are, the units of one level, and today's review.

import * as data from "../data.js";
import * as store from "../store.js";
import { t } from "../text.js";
import { h, bar } from "../ui.js";
import { state, savePractice, place } from "../state.js";
import { startDrill } from "./session.js";
import { verbItems } from "./verbs.js";

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
  const place = `${unit.level} · ${t("Chapter {number}", { number: unit.number })}`;
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

// Starts a session with these question ids (from the chapters and the word lists).
export async function startReview(ids, back) {
  const wanted = new Set(ids);
  const items = (await data.itemsOfUnits(state.course, state.catalog))
    .concat(Object.values(await data.themes(state.course)).flatMap((theme) => theme.items))
    .concat(await verbItems(true), await verbItems(false)); // the verb practice too
  startDrill(items.filter((item) => wanted.has(item.id)), t("Daily review"), back, { size: store.DAILY_REVIEW });
}

// Today's review: at most 20 questions, picked once a day (store.todaysReview).
async function reviewCard() {
  const [ids, fresh] = store.todaysReview(state.practice);
  if (fresh) savePractice();
  const left = store.reviewLeft(state.practice, ids);
  const card = h("section", { class: "card" }, h("h2", {}, t("Daily review")));
  if (!ids.length) {
    card.append(h("p", { class: "muted" }, t("Nothing to review today. Questions you practise come back after 1, 3, 7 and 30 days.")));
    return card;
  }
  const done = ids.length - left.length;
  card.append(h("div", { class: "row between" },
      h("span", {}, t("{done} of {total} done today", { done, total: ids.length })), h("span", { class: "muted" }, t("about {minutes} min", { minutes: Math.max(1, Math.round(left.length / 3)) }))),
    bar(done / ids.length));
  if (!left.length) {
    card.append(h("p", { class: "muted" }, t("Today's review is done. Tomorrow there is a new one.")));
    return card;
  }
  card.append(h("button", { class: "button primary", onclick: () => startReview(left, ["home"]) },
    done ? t("Carry on with the review") : t("Start the review")));
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
        h("div", { class: "muted" }, t("{done} of {total} chapters done", { done, total: units.length }))),
      units.map((unit) => unitRow(unit, unit === next, true))));
}

export async function homeScreen(part, chosenLevel) {
  const levels = state.info.levels;
  const next = state.catalog.find((unit) => unitStatus(unit) !== "done");
  const last = place(); // where you left off (state.setPlace)
  const lastUnit = last && state.catalog.find((unit) => unit.id === last.unit);
  const level = levels.includes(chosenLevel) ? chosenLevel : (lastUnit || next)?.level || levels[0];
  const units = state.catalog.filter((unit) => unit.level === level);
  const done = units.filter((unit) => unitStatus(unit) === "done").length;
  const base = `#/${state.course}`;

  // Where you left off: the theory or the exercises of the chapter you had open last.
  // Without that (a new course), the first chapter that isn't done.
  const shown = lastUnit || next;
  // The next chapter after the one you had open that isn't done yet
  const after = lastUnit && state.catalog.slice(state.catalog.indexOf(lastUnit) + 1).find((unit) => unitStatus(unit) !== "done");
  const practising = lastUnit && last.kind === "practise";
  const readLink = h("a", { class: practising ? "button" : "button primary", href: `${base}/read/${shown?.id}` },
    lastUnit && !practising ? t("Continue reading") : unitStatus(shown || {}) === "new" ? t("Start reading") : t("Read the theory"));
  const practiseLink = h("a", { class: practising ? "button primary" : "button", href: `${base}/unit/${shown?.id}` },
    practising ? t("Continue practising") : t("Practise this chapter"));
  const continueCard = shown && h("section", { class: "card big" },
    h("div", { class: "eyebrow" }, lastUnit ? t("Continue where you left off") : t("Next up")),
    h("h1", {}, shown.title),
    h("p", { class: "lead" }, shown.subtitle),
    h("div", { class: "muted" }, `${shown.level} · ${t(LEVEL_NAMES[shown.level])} · ${t("Chapter {number}", { number: shown.number })}` +
      (lastUnit ? ` · ${practising ? t("Exercises") : t("Theory")}` : "")),
    h("div", { class: "row" }, practising ? [practiseLink, readLink] : [readLink, practiseLink]),
    after && unitStatus(lastUnit) === "done" && h("p", { class: "muted" },
      t("Next chapter: {level} · {title}", { level: after.level, title: after.title }), " ",
      h("a", { href: `${base}/read/${after.id}` }, t("Start reading"))));

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
        h("div", { class: "muted" }, t("{done} of {total} chapters done", { done, total: units.length }))),
      units.map((unit) => unitRow(unit, unit === next))));

  const levelCard = h("section", { class: "card" },
    h("h2", {}, t("Practise the whole level")),
    h("p", { class: "muted" }, t("A mixed test with questions from every chapter of {level}.", { level })),
    h("button", { class: "button", onclick: async () => {
      const items = await data.itemsOfUnits(state.course, units);
      startDrill(items, `${level} · ${t("Mixed test")}`, ["level", level], { size: 30 });
    } }, t("Test all of {level} (30 questions)", { level })));

  document.title = `${state.info.title} · [SITE NAME]`;
  return h("div", { class: "columns" },
    h("div", { class: "wide" }, continueCard, list),
    h("aside", { class: "side" }, await reviewCard(), levelCard));
}
