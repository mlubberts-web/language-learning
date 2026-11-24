// The study plan: which units to read and which exercises to finish on each day, up to your
// deadlines. The same rules as study_plan.py and the parts of study_log.py about finishing;
// test_web.py checks that both make the same plan.
//
// Dates are texts like "2026-11-23" everywhere, as in the saved files. Units are:
//   read      read a unit                      id "read:<unit id>"
//   exercise  one exercise type of a unit     id "exercise:<unit id>|<type>"
//             or of a themed list              id "exercise:THEME_<name>|list:<list>|<type>"
//   mock      an official model exam           id "mock:<level>:<number>"

import { MODE_ORDER, pythonRound } from "./rounds.js";

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
// Estimated seconds for one question of each exercise type, the first time you answer it.
const SECONDS = { gender: 5, words: 12, reverse: 12, verbs: 12, fill: 20, build: 25, listen: 25, translate: 40, fix: 40 };
// Extra time for the questions you repeat in the rounds: harder levels need more.
const RETRY = { A1: 1.05, A2: 1.1, B1: 1.15, B2: 1.25, C1: 1.4, C2: 1.5, themes: 1.2 };
const READ_MINUTES = { A1: 2, A2: 2, B1: 3, B2: 4, C1: 5, C2: 5 }; // per page
export const MOCK_MINUTES = { A1: 150, A2: 150, B1: 240, B2: 240, C1: 300, C2: 300 };
const REVIEW_MINUTES = 20;
export const DEFAULT_HOURS = { weekday: 240, weekend: 120 }; // minutes per day
const WRITING_MINUTES = 60;

// ---------- dates ----------
// Worked out in UTC, so summer time never shifts a day.
const toDate = (text) => { const [y, m, d] = text.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const toText = (date) => date.toISOString().slice(0, 10);
export const addDays = (text, n) => { const d = toDate(text); d.setUTCDate(d.getUTCDate() + n); return toText(d); };
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000); // b - a in days
export const weekday = (text) => (toDate(text).getUTCDay() + 6) % 7; // 0 = Monday ... 6 = Sunday
export const mondayOf = (text) => addDays(text, -weekday(text));
function datesFrom(first, last) {
  const out = [];
  for (let d = first; d <= last; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------- phases ----------
function levelNames(levels, fromStart) {
  if (fromStart || levels.length === 1) return levels[levels.length - 1];
  return levels.length === 2 ? levels.join("/") : `${levels[0]}–${levels[levels.length - 1]}`;
}

// The deadlines as phases: the levels to finish before each deadline. goals are sorted low to high.
export function makePhases(goals, start) {
  const phases = [];
  let first = 0;
  goals.forEach((goal, n) => {
    const last = LEVELS.indexOf(goal.level);
    const levels = LEVELS.slice(first, last + 1);
    const name = levelNames(levels, first === 0);
    phases.push({ name, start, end: goal.date, levels, themes: n === goals.length - 1, themes_up_to: goal.level,
                  writing: levels.some((l) => l === "C1" || l === "C2") ? WRITING_MINUTES : 0 });
    start = addDays(goal.date, 1);
    first = last + 1;
  });
  return phases;
}

// null when the deadlines can be planned, else what is wrong (in English, translated where shown).
export function deadlineProblem(goals) {
  if (!goals.length) return "Keep at least one deadline."; // t-list
  goals = goals.slice().sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
  const levels = goals.map((g) => g.level), dates = goals.map((g) => g.date);
  if (new Set(levels).size < levels.length) return "Each level can have only one deadline."; // t-list
  if (dates.slice().sort().join() !== dates.join() || new Set(dates).size < dates.length) return "A higher level needs a later date."; // t-list
  return null;
}

// ---------- units ----------
const practiseMinutes = (modes, level) => (modes.reduce((sum, mode) => sum + SECONDS[mode], 0) * RETRY[level]) / 60;

function newUnit(kind, key, title, minutes, level, extra = {}) {
  return { id: `${kind}:${key}`, kind, title, minutes: Math.max(1, pythonRound(minutes)), level, ...extra };
}

const mockUnit = (level, number) => newUnit("mock", `${level}:${number}`, `Official ${level} mock exam no. ${number}`, MOCK_MINUTES[level], level, { number });

function exerciseUnits(source, name, items, level, extra = {}) {
  const units = [];
  for (const mode of MODE_ORDER) {
    const modes = items.filter((item) => item.mode === mode).map((item) => item.mode);
    if (modes.length) units.push(newUnit("exercise", `${source}|${mode}`, name, practiseMinutes(modes, level), level, { mode, questions: modes.length, ...extra }));
  }
  return units;
}

// The units of one phase, in the order you do them (see study_plan.make_units).
// units: [{id, level, number, title, pages, items}] in catalog order; themes: [{name, title, lists, items}]
function makeUnits(phase, units, themes) {
  const byLevel = Object.fromEntries(phase.levels.map((level) => [level, units.filter((u) => u.level === level)]));
  const levels = phase.levels.filter((level) => byLevel[level].length);
  const after = {};
  const put = (id, unit) => { (after[id] ??= []).push(unit); };
  const end = [];
  levels.forEach((level, n) => {
    const own = byLevel[level];
    if (n + 1 < levels.length) {
      const following = byLevel[levels[n + 1]];
      put(own[own.length - 1].id, mockUnit(level, 1));
      put(following[Math.min(4, following.length - 1)].id, mockUnit(level, 2));
    } else {
      put(own[Math.min(6, own.length - 1)].id, mockUnit(level, 1));
      end.push(mockUnit(level, 2));
    }
  });
  const phaseUnits = levels.flatMap((level) => byLevel[level]);
  const top = LEVELS.indexOf(phase.themes_up_to ?? "C2");
  const wanted = (part) => !LEVELS.includes(part.level) || LEVELS.indexOf(part.level) <= top;
  themes = themes.map((theme) => ({ ...theme, lists: theme.lists.filter(wanted) })).filter((theme) => theme.lists.length);
  if (phase.themes && themes.length) {
    themes.forEach((theme, k) => {
      let list = [];
      for (const part of theme.lists) {
        const items = theme.items.filter((i) => i.group === part.name);
        list = list.concat(exerciseUnits(`THEME_${theme.name}|list:${part.name}`, `${theme.title} · ${part.name}`, items, "themes",
          { theme: theme.name, group: part.name }));
      }
      if (!phaseUnits.length) { end.push(...list); return; }
      const spot = Math.max(0, Math.floor(((k + 1) * phaseUnits.length) / themes.length) - 1);
      const id = phaseUnits[spot].id;
      after[id] = list.concat(after[id] || []);
    });
  }
  const result = [];
  for (const unit of phaseUnits) {
    const name = `${unit.level} · ${String(unit.number).padStart(2, "0")} ${unit.title}`;
    result.push(newUnit("read", unit.id, name, unit.pages * READ_MINUTES[unit.level], unit.level, { pdf_id: unit.id, number: unit.number, pages: unit.pages }));
    result.push(...exerciseUnits(unit.id, name, unit.items, unit.level, { pdf_id: unit.id, number: unit.number }));
    result.push(...(after[unit.id] || []));
  }
  return result.concat(end);
}

export function allUnits(units, themes, phases) {
  return phases.flatMap((phase) => makeUnits(phase, units, themes).map((unit) => ({ ...unit, phase: phase.name })));
}

// ---------- spreading the work over the days ----------
function budget(day, hours, daysOff) {
  if (daysOff.has(day)) return 0;
  return weekday(day) < 5 ? hours.weekday : hours.weekend;
}

function dayRow(day, phase, hours, daysOff) {
  const total = budget(day, hours, daysOff);
  const review = Math.min(total, REVIEW_MINUTES);
  let writing = weekday(day) < 5 ? phase.writing : Math.floor(phase.writing / 2);
  writing = Math.min(total - review, writing);
  return { date: day, phase: phase.name, budget: total, review, writing, room: Math.max(total - review - writing, total / 4), units: [] };
}

// Puts each unit on the day on which its middle falls, each day getting work in proportion to its room.
function spread(units, rows) {
  rows = rows.filter((row) => row.room > 0);
  const work = units.reduce((sum, unit) => sum + unit.minutes, 0);
  const room = rows.reduce((sum, row) => sum + row.room, 0);
  if (!rows.length || !work) return;
  const stretch = room / work;
  let done = 0, index = 0, edge = rows[0].room;
  for (const unit of units) {
    const middle = (done + unit.minutes / 2) * stretch;
    while (middle > edge && index + 1 < rows.length) {
      index += 1;
      edge += rows[index].room;
    }
    rows[index].units.push(unit);
    done += unit.minutes;
  }
}

// {days, units, load, late}. finished: a Set of unit ids; frozen: today's list (ids) or null.
export function buildPlan(units, today, finished, hours, daysOff, frozen, phases) {
  const frozenIds = new Set(frozen || []);
  const days = [], load = {};
  let carry = [];
  for (const phase of phases) {
    const rows = datesFrom(phase.start, phase.end).map((day) => dayRow(day, phase, hours, daysOff));
    const start = frozen !== null && frozen !== undefined ? addDays(today, 1) : today;
    const open = rows.filter((row) => row.date >= start);
    for (const row of rows) {
      if (row.date === today && frozen !== null && frozen !== undefined) row.units = units.filter((u) => frozenIds.has(u.id));
    }
    const work = carry.concat(units.filter((u) => u.phase === phase.name && !finished.has(u.id) && !frozenIds.has(u.id)));
    if (open.some((row) => row.room > 0)) {
      spread(work, open);
      const room = open.reduce((sum, row) => sum + row.room, 0);
      load[phase.name] = work.reduce((sum, u) => sum + u.minutes, 0) / room;
      carry = [];
    } else {
      carry = work; // the deadline has passed: this work moves to the next phase
    }
    days.push(...rows);
  }
  return { days, units, load, late: carry };
}

// How far you were at the end of 'day': the first unit not read and practised, like "A2 · 03".
export function position(units, finishedDates, day) {
  for (const unit of units) {
    if (unit.pdf_id && (unit.kind === "read" || unit.kind === "exercise") && (finishedDates[unit.id] ?? "9999") > day) {
      return `${unit.level} · ${String(unit.number).padStart(2, "0")}`;
    }
  }
  return null; // everything done
}

export function neededPerDay(plan, units, finished, phaseName, today, kind, phases) {
  const index = phases.findIndex((p) => p.name === phaseName);
  const phase = phases[index];
  const names = phases.slice(0, index + 1).map((p) => p.name);
  const left = units.filter((u) => names.includes(u.phase) && u.kind === kind && !finished.has(u.id)).length;
  const studyDays = plan.days.filter((row) => today <= row.date && row.date <= phase.end && row.room > 0).length;
  return studyDays ? left / studyDays : left;
}

export function finishDay(plan, select) {
  const found = plan.days.filter((row) => row.units.some(select)).map((row) => row.date);
  return found.length ? found.sort()[found.length - 1] : null;
}

// ---------- the study log: what you finished, and each day's list (study_log.py) ----------
export function updateFinished(log, doneIds, today, estimates = null) {
  const firstTime = !("finished" in log);
  const finished = log.finished ??= {};
  let changed = firstTime;
  for (const id of doneIds) {
    if (!(id in finished)) {
      const guess = firstTime && estimates ? estimates[id] : null;
      finished[id] = guess ? (guess < today ? guess : today) : today;
      changed = true;
    }
  }
  for (const id of Object.keys(finished)) {
    if (!doneIds.has(id)) { delete finished[id]; changed = true; }
  }
  return changed;
}

export const finishedBy = (log, ids, day) => ids.filter((id) => ((log.finished || {})[id] ?? "9999") <= day).length;

export function goalReached(log, day) {
  const goal = (log.goals || {})[day];
  if (!goal || !goal.length) return null;
  return finishedBy(log, goal, day) === goal.length;
}

export function streak(log, today) {
  let count = 0;
  for (const day of Object.keys(log.goals || {}).filter((d) => d <= today).sort().reverse()) {
    const reached = goalReached(log, day);
    if (reached === null) continue;
    if (reached) count += 1;
    else if (day !== today) break;
  }
  return count;
}

export function studiedMinutes(log, day) {
  const entry = (log.days || {})[day];
  let minutes = 0;
  if (entry) minutes += (entry.seconds || 0) / 60 + (entry.extra || 0) + Object.values(entry.blocks || {}).reduce((a, b) => a + b, 0);
  minutes += (log.mocks || []).filter((m) => m.date === day).reduce((sum, m) => sum + m.minutes, 0);
  return minutes;
}

export function tickBlock(log, day, block, minutes) {
  log.days ??= {};
  const entry = log.days[day] ??= { seconds: 0, answers: 0, pages: 0, extra: 0, blocks: {} };
  entry.blocks ??= {};
  if (block in entry.blocks) delete entry.blocks[block];
  else entry.blocks[block] = minutes;
}

export function saveOfficialMock(log, level, number, day, minutes, parts, note = "") {
  const mocks = (log.mocks || []).filter((m) => !(m.level === level && m.number === number));
  mocks.push({ level, number, date: day, minutes, parts, note });
  log.mocks = mocks.sort((a, b) => (a.level + a.number).localeCompare(b.level + b.number));
}

export function removeOfficialMock(log, level, number) {
  log.mocks = (log.mocks || []).filter((m) => !(m.level === level && m.number === number));
}
