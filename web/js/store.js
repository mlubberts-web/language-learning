// Your results: the same three parts, with the same names and layout, as in the Python app
// (practice_store.py and study_log.py), so results can move between the two unchanged.
//
//   <course>_practice    per question: right, wrong, last_ok, box, due ...; scores; accepted; done
//   <course>_progress    per unit: the pages you read, done, last page
//   <course>_study_log   per day: study time, answers, pages, first tries
//
// Logged in, they are kept in the database (account.js); without an account (on your own
// computer, for trying things out) in this browser (localStorage).

import { account, saveResult } from "./account.js";

const REVIEW_DAYS = [1, 3, 7, 30]; // the daily review: a right answer waits longer each time
const MAX_GAP = { page: 600, answer: 180 }; // seconds between two actions that still count as study time
const START_SECONDS = 20; // the first action after a break counts for this long

const cache = {};

const storageKey = (course, kind) => `results/${course}_${kind}`;
const EMPTY = { practice: () => ({ items: {}, scores: {} }), progress: () => ({}), study_log: () => ({}) };

export function load(course, kind) {
  const key = storageKey(course, kind);
  if (!(key in cache)) {
    let saved = null;
    if (account.user) saved = account.results[`${course}_${kind}`] || null;
    else { try { saved = JSON.parse(localStorage.getItem(key)); } catch { saved = null; } }
    cache[key] = saved || EMPTY[kind]();
  }
  return cache[key];
}

export function save(course, kind) {
  const key = storageKey(course, kind);
  if (account.user) { saveResult(`${course}_${kind}`, cache[key]); return; }
  try { localStorage.setItem(key, JSON.stringify(cache[key])); } catch { /* full or blocked: kept for this visit */ }
}

// After logging in or out: forget what was loaded, so the right person's results are read.
export function forget() {
  for (const key of Object.keys(cache)) delete cache[key];
}

// ---------- dates, in the time of your own computer ----------
const pad = (n) => String(n).padStart(2, "0");
export const dateText = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => dateText(new Date());
function addDays(text, days) {
  const [y, m, d] = text.split("-").map(Number);
  return dateText(new Date(y, m - 1, d + days));
}
const localTime = (d) => `${dateText(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// ---------- practice results (practice_store.py) ----------
function schedule(stats, correct, day) {
  if (correct) {
    const box = stats.box;
    stats.due = addDays(day, REVIEW_DAYS[box]);
    stats.box = Math.min(box + 1, REVIEW_DAYS.length - 1);
  } else {
    stats.box = 0;
    stats.due = addDays(day, REVIEW_DAYS[0]);
  }
}

export function record(data, itemId, correct) {
  const day = today();
  const stats = data.items[itemId] ??= { right: 0, wrong: 0, last_ok: false };
  stats.box ??= 0;
  stats.box_before = stats.box;
  stats[correct ? "right" : "wrong"] += 1;
  stats.last_ok = correct;
  stats.end_ok = correct; // a wrong first try can still become right later in the session
  stats.last = day;
  schedule(stats, correct, day);
}

// An answer in a later round of a session (after a wrong first try): doesn't change your score or
// the review, but "right in the end" is remembered.
export function recordLater(data, itemId, correct) {
  const stats = data.items[itemId];
  if (stats && correct) stats.end_ok = true;
}

export function changeToCorrect(data, itemId) {
  const stats = data.items[itemId];
  stats.wrong -= 1;
  stats.right += 1;
  stats.last_ok = true;
  stats.end_ok = true;
  stats.box = stats.box_before ?? 0;
  schedule(stats, true, today());
}

export const acceptedAnswers = (data, key) => (data.accepted || {})[key] || [];

export function accept(data, key, typed) {
  typed = typed.split(/\s+/).filter(Boolean).join(" ");
  if (!typed) return;
  data.accepted ??= {};
  const answers = data.accepted[key] ??= [];
  if (!answers.includes(typed)) answers.push(typed);
}

export function unaccept(data, key, typed) {
  const answers = (data.accepted || {})[key] || [];
  const i = answers.indexOf(typed);
  if (i >= 0) answers.splice(i, 1);
  if (!answers.length && data.accepted) delete data.accepted[key];
}

export const isMarkedDone = (data, key) => (data.done || []).includes(key);

export function markDone(data, key, done) {
  data.done ??= [];
  const i = data.done.indexOf(key);
  if (done && i < 0) data.done.push(key);
  if (!done && i >= 0) data.done.splice(i, 1);
}

export function saveScore(data, unitId, mode, percent) {
  const unitScores = data.scores[unitId] ??= {};
  const old = unitScores[mode] || { best: 0 };
  unitScores[mode] = { last: percent, best: Math.max(old.best, percent), date: today() };
}

// ---------- mastering (agreed with Menno on 2026-11-26) ----------
// A question is mastered when it was right on the first try the last time it was asked (the
// first round of a session; a later session counts too, and a wrong first try takes it away).
// Marking an exercise as done does not make its questions mastered.
export const isMastered = (data, itemId) => Boolean(data.items[itemId]?.last_ok);

// Right in the end: answered, and right at the end of the session (maybe after a wrong first try).
export function isRightInEnd(data, itemId) {
  const s = data.items[itemId];
  return Boolean(s && (s.end_ok ?? s.last_ok));
}

// A list (an exercise type of a chapter, or a word list part) is mastered when MORE than 95% of
// its questions are mastered. It is finished when it is mastered or marked as done by hand.
export const MASTERED_SHARE = 0.95;
export const countMastered = (data, items) => items.filter((item) => isMastered(data, item.id)).length;
export const listMastered = (data, items) => items.length > 0 && countMastered(data, items) / items.length > MASTERED_SHARE;

export function isWeak(data, itemId) {
  const s = data.items[itemId];
  return Boolean(s && s.wrong > 0 && (!s.last_ok || s.wrong > s.right));
}

export function isDue(data, itemId) {
  const s = data.items[itemId];
  return Boolean(s) && (s.due || "") <= today();
}

// ---------- the daily review: a small set, fresh every day ----------
// Once a day, 20 questions are picked from those that are due, the longest waiting first. Only
// those are today's review; the rest waits, so the review never piles up. A question counts as
// done today once you answered it today (here or in any other exercise).
export const DAILY_REVIEW = 20;

// Returns [the ids of today's review, whether they were picked just now (then save)].
export function todaysReview(data) {
  const day = today();
  if (data.review?.day === day) return [data.review.ids, false];
  const due = Object.entries(data.items)
    .filter(([, s]) => (s.due || "") <= day)
    .sort((a, b) => (a[1].due || "").localeCompare(b[1].due || "") || (a[1].box || 0) - (b[1].box || 0));
  data.review = { day, ids: due.slice(0, DAILY_REVIEW).map(([id]) => id) };
  return [data.review.ids, true];
}

export const reviewLeft = (data, ids) => ids.filter((id) => data.items[id]?.last !== today());

export const skipKnown = (data) => Boolean(data.settings?.skip_known);
export function setSkipKnown(data, on) {
  data.settings ??= {};
  data.settings.skip_known = on;
}

// ---------- the study log (study_log.py) ----------
function dayEntry(log, day) {
  log.days ??= {};
  const entry = log.days[day] ??= {};
  for (const key of ["seconds", "answers", "pages", "extra"]) entry[key] ??= 0;
  entry.blocks ??= {};
  return entry;
}

// For every answer ('answer') and every new page read ('page'): adds the time since your last action.
export function addActivity(log, kind) {
  const now = new Date();
  const entry = dayEntry(log, dateText(now));
  entry[kind === "answer" ? "answers" : "pages"] += 1;
  const last = log.last;
  const gap = last ? (now - new Date(last.time)) / 1000 : null; // "2026-11-23T19:40:00" is read as local time
  entry.seconds += gap !== null && gap >= 0 && gap <= MAX_GAP[last.kind] ? Math.round(gap) : START_SECONDS;
  log.last = { time: localTime(now), kind };
}

export function addResult(log, correct) {
  const entry = dayEntry(log, today());
  entry.first_total = (entry.first_total || 0) + 1;
  entry.first_right = (entry.first_right || 0) + (correct ? 1 : 0);
}

export function overruleResult(log) {
  const entry = dayEntry(log, today());
  if ((entry.first_right || 0) < (entry.first_total || 0)) entry.first_right += 1;
}
