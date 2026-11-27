// Progress: what you studied, week by week back to your first day, trends, levels, mock exams and
// weak subjects. Only shows things; the numbers come from your study log and practice results.

import * as store from "../store.js";
import * as plan from "../plan.js";
import * as P from "../planning.js";
import { t, longDate, shortDate, dayLabel, decimal } from "../text.js";
import { h, bar, icon, noEmoji } from "../ui.js";
import { state, modeTitle } from "../state.js";
import { firstTryScore, MIN_PRACTISED, WEAK_BELOW, doneKey } from "../rounds.js";
import { startDrill } from "./session.js";

const TABS = [["week", "Week by week"], ["trends", "Trends"], ["levels", "Levels"], ["mocks", "Mock exams"], ["weak", "Weak subjects"]]; // t-list
let tab = "week";
let weekOffset = 0;
const percent = (x) => (x === null || x === undefined ? "–" : `${Math.round(x * 100)}%`);

function daySummary(now, day) {
  const entry = (state.log.days || {})[day] || {};
  const goal = P.goalUnits(now, day);
  return { day, hours: plan.studiedMinutes(state.log, day) / 60, exercises: P.finishedOn(now, day, "exercise"),
           reads: P.finishedOn(now, day, "read"), mocks: P.finishedOn(now, day, "mock"), questions: entry.answers || 0,
           pages: entry.pages || 0, right: entry.first_right || 0, tries: entry.first_total || 0,
           goal: goal.length, goalDone: plan.finishedBy(state.log, goal.map((u) => u.id), day) };
}

function weekSummary(now, monday, today) {
  const days = [...Array(7).keys()].map((n) => plan.addDays(monday, n)).filter((d) => d <= today).map((d) => daySummary(now, d));
  const sum = (key) => days.reduce((s, d) => s + d[key], 0);
  const end = plan.addDays(monday, 6) < today ? plan.addDays(monday, 6) : today;
  return { monday, days, hours: sum("hours"), exercises: sum("exercises"), reads: sum("reads"), mocks: sum("mocks"),
           questions: sum("questions"), right: sum("right"), tries: sum("tries"),
           studied: days.filter((d) => d.hours >= 0.25).length, accuracy: sum("tries") ? sum("right") / sum("tries") : null,
           start: plan.position(now.units, state.log.finished || {}, plan.addDays(monday, -1)),
           end: plan.position(now.units, state.log.finished || {}, end) };
}

// A bar chart: one series, the value above each bar, the label under it.
function barChart(rows, format, label) {
  const top = Math.max(...rows.map((r) => r.value), 0) || 1;
  return h("figure", { style: "margin: 0" },
    h("figcaption", { class: "muted", style: "margin-bottom: 4px" }, label),
    h("div", { class: "chart", role: "img", "aria-label": label },
      rows.map((r) => h("div", { class: "column", title: `${r.label}: ${format(r.value)}` },
        r.value > 0 && h("span", { class: "value" }, format(r.value)),
        h("div", { class: "fill", style: `height: ${(r.value / top) * 100}%` })))),
    h("div", { class: "chart-labels", "aria-hidden": "true" }, rows.map((r) => h("span", {}, r.label))));
}

function table(head, rows) {
  return h("div", { class: "table-box" }, h("table", {},
    h("thead", {}, h("tr", {}, head.map((cell) => h("th", { scope: "col" }, cell)))),
    h("tbody", {}, rows.map((row) => h("tr", {}, row.map((cell) => h("td", {}, cell)))))));
}

const tile = (label, value, help) => h("div", { class: "card tile", title: help || null }, h("div", { class: "muted" }, label), h("div", { class: "tile-value" }, value));

// ---------- week by week ----------
function weekView(now, first, today) {
  const thisWeek = plan.mondayOf(today), firstWeek = plan.mondayOf(first);
  const weeks = Math.floor(plan.daysBetween(firstWeek, thisWeek) / 7);
  weekOffset = Math.max(-weeks, Math.min(0, weekOffset));
  const monday = plan.addDays(thisWeek, 7 * weekOffset);
  const week = weekSummary(now, monday, today);
  const before = monday > firstWeek ? weekSummary(now, plan.addDays(monday, -7), today) : null;
  const change = (a, b, unit = "") => (b === null || b === undefined ? "" : ` (${a - b >= 0 ? "+" : ""}${typeof a === "number" && !Number.isInteger(a) ? decimal(a - b) : a - b}${unit})`);
  const days = [...Array(7).keys()].map((n) => plan.addDays(monday, n));
  const rows = days.map((d) => (d <= today ? daySummary(now, d) : null));
  return h("div", { class: "stack" },
    h("div", { class: "row" },
      h("button", { type: "button", class: "button small", disabled: monday <= firstWeek, onclick: () => { weekOffset -= 1; state.render(); } }, icon("left", 16), t("Previous week")),
      h("button", { type: "button", class: "button small", onclick: () => { weekOffset = 0; state.render(); } }, t("This week")),
      h("button", { type: "button", class: "button small", disabled: monday >= thisWeek, onclick: () => { weekOffset += 1; state.render(); } }, t("Next week"), icon("right", 16)),
      h("strong", {}, monday === thisWeek ? t("This week") : `${shortDate(monday)} – ${shortDate(days[6])}`)),
    h("div", { class: "tiles-row" },
      tile(t("Hours studied"), `${decimal(week.hours)} h${before ? change(Math.round(week.hours * 10) / 10, Math.round(before.hours * 10) / 10, " h") : ""}`),
      tile(t("Days studied"), t("{done} of {total}", { done: week.studied, total: week.days.length }), t("Days with at least 15 minutes.")),
      tile(t("Exercises finished"), `${week.exercises}${before ? change(week.exercises, before.exercises) : ""}`),
      tile(t("Chapters read"), `${week.reads}${before ? change(week.reads, before.reads) : ""}`),
      tile(t("Questions answered"), `${week.questions}${before ? change(week.questions, before.questions) : ""}`),
      tile(t("Right on the first try"), percent(week.accuracy), t("Of your first tries this week (not the repeats in later rounds), the share that was right."))),
    h("p", {}, t("Started the week at {start}, ended at {end}", { start: week.start || t("the end"), end: week.end || t("the end") })),
    h("section", { class: "card" },
      barChart(rows.map((r, n) => ({ label: dayLabel(days[n]), value: r ? Math.round(r.hours * 100) / 100 : 0 })), (v) => decimal(v), t("Hours studied per day")),
      table([t("Day"), t("Hours"), t("Exercises"), t("Chapters read"), t("Pages"), t("Questions"), t("First try right"), t("Daily list")],
        rows.filter(Boolean).map((r) => [dayLabel(r.day), decimal(r.hours), r.exercises, r.reads, r.pages, r.questions,
          r.tries ? percent(r.right / r.tries) : "–", r.goal ? t("{done} of {total}", { done: r.goalDone, total: r.goal }) : "–"]))));
}

// ---------- trends ----------
function trendsView(now, first, today) {
  const firstWeek = plan.mondayOf(first);
  const count = Math.floor(plan.daysBetween(firstWeek, plan.mondayOf(today)) / 7) + 1;
  const weeks = [...Array(count).keys()].map((n) => weekSummary(now, plan.addDays(firstWeek, 7 * n), today));
  const rows = (key) => weeks.map((w) => ({ label: shortDate(w.monday), value: w[key] ?? 0 }));
  const mastered = Object.entries(state.log.mastered || {}).sort();
  return h("div", { class: "stack" },
    h("div", { class: "grid", style: "grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))" },
      h("section", { class: "card" }, barChart(rows("hours").map((r) => ({ ...r, value: Math.round(r.value * 10) / 10 })), (v) => decimal(v), t("Hours studied per week"))),
      h("section", { class: "card" }, barChart(rows("exercises"), String, t("Exercises finished per week"))),
      h("section", { class: "card" }, barChart(rows("questions"), String, t("Questions answered per week"))),
      h("section", { class: "card" }, barChart(weeks.map((w) => ({ label: shortDate(w.monday), value: w.accuracy === null ? 0 : Math.round(w.accuracy * 100) })), (v) => `${v}%`, t("Right on the first try, per week")))),
    mastered.length >= 2 && h("section", { class: "card" }, barChart(mastered.map(([d, n]) => ({ label: shortDate(d), value: n })), String, t("Questions mastered over time"))),
    h("section", { class: "card" }, h("h2", {}, t("All weeks")),
      table([t("Week"), t("Hours"), t("Days studied"), t("Exercises"), t("Chapters read"), t("Questions"), t("First try right"), t("Where you were")],
        weeks.slice().reverse().map((w) => [`${shortDate(w.monday)} – ${shortDate(plan.addDays(w.monday, 6))}`, decimal(w.hours), w.studied, w.exercises, w.reads, w.questions,
          percent(w.accuracy), `${w.start || "–"} → ${w.end || "–"}`]))));
}

// ---------- levels ----------
function levelsView(now) {
  const mocks = new Set((state.log.mocks || []).map((m) => `${m.level}:${m.number}`));
  const isKnown = (item) => store.isMastered(state.practice, item.id) || store.isMarkedDone(state.practice, doneKey(item));
  const rows = [];
  for (const level of plan.LEVELS.concat(["themes"])) {
    const own = now.units.filter((u) => u.level === level);
    const reads = own.filter((u) => u.kind === "read"), exercises = own.filter((u) => u.kind === "exercise");
    if (!exercises.length) continue;
    const items = level === "themes" ? now.course.themes.flatMap((x) => x.items) : now.course.units.filter((u) => u.level === level).flatMap((u) => u.items);
    const share = (list) => list.filter((u) => now.finished.has(u.id)).length / list.length;
    rows.push([level === "themes" ? t("Themed lists") : level,
      reads.length ? h("div", { class: "row", style: "gap: 8px" }, h("div", { style: "width: 90px" }, bar(share(reads), true)), percent(share(reads))) : "–",
      h("div", { class: "row", style: "gap: 8px" }, h("div", { style: "width: 90px" }, bar(share(exercises), true)), percent(share(exercises))),
      h("div", { class: "row", style: "gap: 8px" }, h("div", { style: "width: 90px" }, bar(items.filter(isKnown).length / items.length, true)), percent(items.filter(isKnown).length / items.length)),
      level === "themes" ? "–" : t("{done} of {total}", { done: [1, 2].filter((n) => mocks.has(`${level}:${n}`)).length, total: 2 })]);
  }
  return h("div", { class: "stack" },
    table([t("Level"), t("Chapters read"), t("Exercises finished"), t("Questions mastered"), t("Mock exams")], rows),
    h("p", { class: "muted" }, t("A unit counts as read when you opened all its pages or marked it as done. An exercise is one exercise type of a unit or list, finished when every question was answered once. Mastered: right on your last first try.")));
}

// ---------- mock exams ----------
function mocksView() {
  const official = (state.log.mocks || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const own = state.practice.mocks || [];
  return h("div", { class: "stack" },
    h("section", { class: "card" }, h("h2", {}, t("Official {exam} model exams", { exam: state.info.exam || "" })),
      official.length ? table([t("Date"), t("Exam"), t("Reading"), t("Listening"), t("Writing"), t("Speaking"), t("Average")],
        official.map((m) => { const s = Object.values(m.parts); return [longDate(m.date), `${m.level} ${t("no.")} ${m.number}`,
          ...["Reading", "Listening", "Writing", "Speaking"].map((p) => `${m.parts[p] ?? "–"}%`), `${Math.round(s.reduce((a, b) => a + b, 0) / s.length)}%`]; }))
        : h("p", { class: "muted" }, t("None logged yet. Log them on the Schedule, under Mock exams."))),
    h("section", { class: "card" }, h("h2", {}, t("Mock exams on this site")),
      own.length ? [own.length >= 2 && barChart(own.map((m) => ({ label: shortDate(m.date), value: m.percent })), (v) => `${v}%`, t("Score")),
        table([t("Date"), t("Level"), t("Score"), t("Right")], own.slice().reverse().map((m) => [longDate(m.date), t(m.level), `${m.percent}%`, t("{done} of {total}", { done: m.right, total: m.total })]))]
        : h("p", { class: "muted" }, t("None yet. Start one with Mock exams in the menu."))));
}

// ---------- weak subjects ----------
function weakView(now) {
  const stats = state.practice.items;
  const subjects = now.course.units.map((u) => [`${u.level} · ${u.title}`, u.items, u.id])
    .concat(now.course.themes.flatMap((theme) => theme.lists.map((list) => [`${noEmoji(theme.title)} · ${list.name}`, theme.items.filter((i) => i.group === list.name), null])));
  const weak = subjects.map(([name, items, unitId]) => { const [score, practised] = firstTryScore(items, stats); return { name, items, unitId, score, practised }; })
    .filter((s) => s.score !== null && s.score < WEAK_BELOW).sort((a, b) => a.score - b.score);
  const every = subjects.flatMap(([, items]) => items);
  const perType = state.info.modes.map((m) => [modeTitle(m.id), firstTryScore(every.filter((i) => i.mode === m.id), stats)[0]]).filter(([, s]) => s !== null);
  if (!Object.keys(stats).length) return h("p", { class: "muted" }, t("Weak subjects appear here once you have practised."));
  return h("div", { class: "stack" },
    perType.length > 0 && h("p", {}, t("Right on the first try, per exercise type: {scores}", { scores: perType.sort((a, b) => a[1] - b[1]).map(([title, s]) => `${title} ${percent(s)}`).join(" · ") })),
    weak.length ? h("div", { class: "card flush" }, weak.slice(0, 5).map((s) => h("div", { class: "unit" },
      h("div", { class: "about" }, h("div", { class: "title" }, s.name),
        h("div", { class: "muted" }, t("{percent} right on the first try ({count} practised)", { percent: percent(s.score), count: s.practised }))),
      h("div", { class: "actions" }, h("button", { type: "button", class: "button small primary", onclick: () =>
        startDrill(s.items.filter((i) => store.isWeak(state.practice, i.id)), t("{name} · Weak questions", { name: s.name }), ["view", "progress"], { unitId: s.unitId, mode: "weak" }) }, t("Practise"))))))
      : h("p", { class: "muted" }, t("No weak subjects: everywhere you practised at least {count} questions, {percent} or more was right on the first try.", { count: MIN_PRACTISED, percent: percent(WEAK_BELOW) })));
}

// ---------- the screen ----------
export async function progressScreen(part, chosen) {
  if (TABS.some(([id]) => id === chosen)) tab = chosen;
  const today = store.today();
  const now = await P.currentState(today);
  const log = state.log;
  const first = P.firstDay(today);
  // How many questions you had mastered today, for the "mastered over time" chart
  const allItems = now.course.units.flatMap((u) => u.items).concat(now.course.themes.flatMap((x) => x.items));
  const mastered = allItems.filter((i) => store.isMastered(state.practice, i.id) || store.isMarkedDone(state.practice, doneKey(i))).length;
  if ((log.mastered ??= {})[today] !== mastered) { log.mastered[today] = mastered; store.save(state.course, "study_log"); }
  const days = [...Array(plan.daysBetween(first, today) + 1).keys()].map((n) => plan.addDays(first, n));
  const studiedDays = days.filter((d) => plan.studiedMinutes(log, d) >= 15);
  const totalHours = Object.keys(log.days || {}).reduce((s, d) => s + plan.studiedMinutes(log, d), 0) / 60;
  const best = days.reduce((a, b) => (plan.studiedMinutes(log, b) > plan.studiedMinutes(log, a) ? b : a), days[0]);
  const reads = now.units.filter((u) => u.kind === "read"), exercises = now.units.filter((u) => u.kind === "exercise");
  const readDone = reads.filter((u) => now.finished.has(u.id)).length, exDone = exercises.filter((u) => now.finished.has(u.id)).length;
  const views = { week: () => weekView(now, first, today), trends: () => trendsView(now, first, today), levels: () => levelsView(now), mocks: mocksView, weak: () => weakView(now) };
  document.title = `${t("Progress")} · [SITE NAME]`;
  return h("div", { class: "stack", style: "gap: 24px" },
    h("section", { class: "card big" },
      h("div", { class: "eyebrow" }, t("Progress")),
      h("h1", {}, t("Your progress")),
      h("p", { class: "lead" }, t("{hours} hours studied since {day} · {reads_done} of {reads} units read · {exercises_done} of {exercises} exercises finished · {mastered} of {questions} questions mastered",
        { hours: decimal(totalHours), day: longDate(first), reads_done: readDone, reads: reads.length, exercises_done: exDone, exercises: exercises.length, mastered, questions: allItems.length })),
      bar((readDone + exDone) / (reads.length + exercises.length || 1))),
    h("div", { class: "tiles-row" },
      tile(t("Days studied"), t("{done} of {total}", { done: studiedDays.length, total: days.length }), t("Days with at least 15 minutes.")),
      tile(t("Average per study day"), studiedDays.length ? `${decimal(totalHours / studiedDays.length)} h` : "–"),
      tile(t("Best day"), P.fmt(plan.studiedMinutes(log, best)), longDate(best)),
      tile(t("Streak"), t(plan.streak(log, today) === 1 ? "{count} day" : "{count} days", { count: plan.streak(log, today) }), t("Days in a row on which you finished your whole list from the Schedule.")),
      tile(t("Where you are now"), plan.position(now.units, log.finished || {}, today) || t("All chapters done"), t("The first chapter you haven't finished yet: read, and all its exercises."))),
    h("div", { class: "segmented", role: "group", "aria-label": t("Show") }, TABS.map(([id, label]) =>
      h("button", { type: "button", "aria-pressed": String(id === tab), onclick: () => { location.hash = `#/${state.course}/progress/${id}`; } }, t(label)))),
    views[tab]());
}
