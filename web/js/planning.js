// Connects the study plan (plan.js) to your results: which units you finished, your deadlines,
// hours and days off, and today's list. The same steps as current_state() in schedule_screen.py.
// The Schedule and Progress screens both use this.

import * as data from "./data.js";
import * as store from "./store.js";
import * as plan from "./plan.js";
import { doneKey } from "./rounds.js";
import { state, saveLog } from "./state.js";

// ---------- your settings (kept in the study log, like in the app) ----------
// Until you set your own deadlines, an example: B2 half a year after your first day, the highest
// level a year after it. (Writing practice is planned in the part with C1 and C2 only.)
export function goals(today) {
  const saved = state.log.deadlines;
  const top = state.info.levels[state.info.levels.length - 1];
  const example = [{ level: "B2", date: plan.addDays(firstDay(today), 182) }, { level: top, date: plan.addDays(firstDay(today), 365) }]
    .filter((goal, n, all) => n === all.length - 1 || plan.LEVELS.indexOf(goal.level) < plan.LEVELS.indexOf(top));
  const list = saved && saved.length ? saved : example;
  return list.slice().sort((a, b) => plan.LEVELS.indexOf(a.level) - plan.LEVELS.indexOf(b.level));
}

export const hasOwnDeadlines = () => Boolean(state.log.deadlines && state.log.deadlines.length);
export const hours = () => state.log.hours || plan.DEFAULT_HOURS;
export const daysOff = () => new Set(state.log.days_off || []);

// Your first day: the earliest date in the log, or today.
export function firstDay(today) {
  const log = state.log;
  const dates = Object.keys(log.days || {}).concat(Object.values(log.finished || {}), Object.keys(log.goals || {}), [today]);
  return dates.sort()[0];
}

export const phases = (today) => plan.makePhases(goals(today), firstDay(today));

export function currentPhase(today) {
  const every = phases(today);
  return every.find((p) => p.end >= today) || every[every.length - 1];
}

// After a change in the settings, today's list is made again.
export function remakeToday() {
  if (state.log.goals) delete state.log.goals[store.today()];
}

// ---------- the units and how far you are in each ----------
const cache = {};

// The units of the course with their questions (loaded once per course).
async function courseUnits() {
  if (!cache[state.course]) {
    const themes = await data.themes(state.course);
    const units = await Promise.all(state.catalog.map(async (unit) => ({
      id: unit.id, level: unit.level, number: unit.number, title: unit.title, pages: unit.pages || 1,
      web_pages: unit.web_pages || 1, items: await data.unitItems(state.course, unit.id) })));
    const themeList = Object.entries(themes).map(([name, theme]) => ({ name, title: theme.title, lists: theme.lists, items: theme.items }));
    // For each exercise unit: its questions
    const groups = {};
    for (const unit of units) for (const item of unit.items) (groups[`exercise:${unit.id}|${item.mode}`] ??= []).push(item);
    for (const theme of themeList) for (const item of theme.items) (groups[`exercise:THEME_${theme.name}|list:${item.group}|${item.mode}`] ??= []).push(item);
    cache[state.course] = { units, themes: themeList, groups, byId: Object.fromEntries(units.map((u) => [u.id, u])) };
  }
  return cache[state.course];
}

// How far an exercise is, 0 to 1. It is finished (1) when it is marked as done, or when more than
// 95% of its questions are mastered (right on the first try last time, store.listMastered).
function exerciseShare(items) {
  if (!items.length) return 1;
  if (items.every((item) => store.isMarkedDone(state.practice, doneKey(item)))) return 1;
  if (store.listMastered(state.practice, items)) return 1;
  return Math.min(0.99, store.countMastered(state.practice, items) / (items.length * store.MASTERED_SHARE));
}

function readingShare(unit) {
  const e = state.progress[unit.id];
  if (!e) return 0;
  if (e.done) return 1;
  // the parts finished, or how far down the one-page reader you got (e.farthest)
  return Math.min(1, Math.max((e.seen || []).length / unit.web_pages, e.farthest || 0));
}

// For each unit of the plan: the share finished, 0 to 1.
function shares(units, course) {
  const mocks = new Set((state.log.mocks || []).map((m) => `${m.level}:${m.number}`));
  const result = {};
  for (const unit of units) {
    if (unit.kind === "read") result[unit.id] = readingShare(course.byId[unit.pdf_id]);
    else if (unit.kind === "exercise") {
      const items = course.groups[unit.id] || [];
      result[unit.id] = exerciseShare(items);
    } else result[unit.id] = mocks.has(`${unit.level}:${unit.number}`) ? 1 : 0;
  }
  return result;
}

// The date of your last first-try answer to a question (practice_store.last_answer_date).
const REVIEW_DAYS = [1, 3, 7, 30];
function lastAnswerDate(stats) {
  if (stats.last) return stats.last;
  if (!stats.due) return null;
  const wait = stats.last_ok ? REVIEW_DAYS[stats.box_before ?? 0] : REVIEW_DAYS[0];
  return plan.addDays(stats.due, -wait);
}

// For what you finished before the dates were kept: the date it was most likely finished.
function estimatedDates(units, course) {
  const guesses = {};
  const mocks = Object.fromEntries((state.log.mocks || []).map((m) => [`${m.level}:${m.number}`, m.date]));
  for (const unit of units) {
    if (unit.kind === "read") guesses[unit.id] = state.progress[unit.pdf_id]?.updated?.slice(0, 10) || null;
    else if (unit.kind === "exercise") {
      const dates = (course.groups[unit.id] || []).map((i) => state.practice.items[i.id]).filter(Boolean).map(lastAnswerDate).filter(Boolean).sort();
      guesses[unit.id] = dates.length ? dates[dates.length - 1] : null;
    } else guesses[unit.id] = mocks[`${unit.level}:${unit.number}`] || null;
  }
  return guesses;
}

// {plan, shares, finished, units, phases, course}. Also writes down what you finished and fixes
// today's list the first time you look at it.
export async function currentState(today) {
  const course = await courseUnits();
  const every = phases(today);
  const units = plan.allUnits(course.units, course.themes, every);
  const share = shares(units, course);
  const finished = new Set(Object.keys(share).filter((id) => share[id] >= 0.999));
  const log = state.log;
  const estimates = "finished" in log ? null : estimatedDates(units, course);
  let changed = plan.updateFinished(log, finished, today, estimates);
  const frozen = (log.goals || {})[today] ?? null;
  const made = plan.buildPlan(units, today, finished, hours(), daysOff(), frozen, every);
  const row = made.days.find((r) => r.date === today);
  if (frozen === null && row) {
    (log.goals ??= {})[today] = row.units.map((u) => u.id);
    changed = true;
  }
  if (changed) saveLog();
  return { plan: made, shares: share, finished, units, phases: every, course, byId: Object.fromEntries(units.map((u) => [u.id, u])) };
}

// The units on a day's list (fixed when you first looked at it).
export const goalUnits = (now, day) => ((state.log.goals || {})[day] || []).map((id) => now.byId[id]).filter(Boolean);

// How many units of a kind you finished on a day.
export function finishedOn(now, day, kind) {
  return Object.entries(state.log.finished || {}).filter(([id, d]) => d === day && now.byId[id]?.kind === kind).length;
}

export const count = (units, kind) => units.filter((u) => u.kind === kind).length;

// "75 min" -> "1 h 15"
export function fmt(minutes) {
  minutes = Math.round(minutes);
  if (minutes < 60) return `${minutes} min`;
  return minutes % 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}` : `${minutes / 60} h`;
}
