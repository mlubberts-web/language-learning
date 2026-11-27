// The Schedule: today's list of units to read and exercises to finish, the coming days, an
// overview with your deadlines and a calendar, the official mock exams you log, and settings.
// The plan itself is made in plan.js; planning.js connects it to your results.

import * as store from "../store.js";
import * as plan from "../plan.js";
import * as P from "../planning.js";
import { t, longDate, shortDate, dayLabel, decimal } from "../text.js";
import { h, bar, icon, noEmoji } from "../ui.js";
import { state, saveLog, savePractice, modeTitle } from "../state.js";
import { startReview } from "./home.js";

const SECTIONS = [["today", "Today"], ["coming", "Coming days"], ["overview", "Overview"], ["mocks", "Mock exams"], ["settings", "Settings"]]; // t-list
const PARTS = ["Reading", "Listening", "Writing", "Speaking"]; // t-list
const TARGET = 70; // aim for at least this percentage on every part of an official mock exam
let weekOffset = 0;

const counted = (n, one, many) => t(n === 1 ? one : many, { count: n });
const done = (now, unit) => (now.shares[unit.id] ?? 0) >= 0.999;

// "B2 by 4 Dec", with the year when it isn't this year: "C2 by 23 Nov 2027"
function goalText(phase) {
  const day = shortDate(phase.end) + (phase.end.slice(0, 4) !== store.today().slice(0, 4) ? ` ${phase.end.slice(0, 4)}` : "");
  return t("{levels} by {day}", { levels: phase.name.replace("/", ` ${t("and")} `), day });
}

function examName(level) {
  return state.info.exam_levels?.[level]?.name || state.info.exam || "";
}

function mockTitle(level, number) {
  if (state.info.exam_levels?.[level]) return t("Official {exam} mock exam no. {number} ({level})", { exam: examName(level), level, number });
  return t("Official {exam} {level} mock exam no. {number}", { exam: examName(), level, number });
}

// The exercises of one unit or list together: [[title, [units]]], in plan order.
function groupUnits(units) {
  const groups = new Map();
  for (const unit of units) {
    if (unit.kind === "exercise") {
      const key = `exercise|${unit.pdf_id || `${unit.theme}|${unit.group}`}`;
      if (!groups.has(key)) groups.set(key, [t("Practise {title}", { title: noEmoji(unit.title) }), []]);
      groups.get(key)[1].push(unit);
    } else if (unit.kind === "read") groups.set(unit.id, [t("Read {title}", { title: unit.title }), [unit]]);
    else groups.set(unit.id, [mockTitle(unit.level, unit.number), [unit]]);
  }
  return [...groups.values()];
}

function unitRow(now, title, units) {
  const first = units[0];
  const finishedUnits = units.filter((u) => done(now, u));
  const all = finishedUnits.length === units.length;
  const base = `#/${state.course}`;
  let caption, share, action;
  if (first.kind === "exercise") {
    caption = `${t("{done} of {total} finished:", { done: finishedUnits.length, total: units.length })} ${units.map((u) => (done(now, u) ? "✓ " : "") + modeTitle(u.mode)).join(" · ")}`;
    share = units.reduce((sum, u) => sum + Math.min(1, now.shares[u.id] ?? 0), 0) / units.length;
    action = first.pdf_id ? h("a", { class: all ? "button small" : "button small primary", href: `${base}/unit/${first.pdf_id}` }, t("Practise"))
                          : h("a", { class: all ? "button small" : "button small primary", href: `${base}/words` }, t("Open"));
  } else if (first.kind === "read") {
    share = now.shares[first.id] ?? 0;
    caption = t("{pages} pages · {percent} read", { pages: first.pages, percent: `${Math.round(share * 100)}%` });
    action = h("a", { class: all ? "button small" : "button small primary", href: `${base}/read/${first.pdf_id}` }, t("Read"));
  } else {
    share = now.shares[first.id] ?? 0;
    caption = t("Use an official model exam, on paper and timed. You may split it over two days, then log your scores.");
    action = h("button", { type: "button", class: "button small primary", onclick: () => { mockSlot = `${first.level}:${first.number}`; section = "mocks"; state.render(); } }, t("Log result"));
  }
  return h("div", { class: "unit" },
    h("div", { class: `number ${all ? "done" : share > 0 ? "reading" : ""}` }, all ? icon("check", 16) : icon(first.kind === "read" ? "book" : first.kind === "mock" ? "clock" : "list", 16)),
    h("div", { class: "about" }, h("div", { class: "title" }, title), h("div", { class: "muted" }, caption),
      h("div", { style: "max-width: 260px; margin-top: 6px" }, bar(Math.min(1, share), true))),
    h("div", { class: "actions" }, action));
}

function blockRow(title, caption, ticked, button) {
  return h("div", { class: "unit" },
    h("div", { class: `number ${ticked ? "done" : ""}` }, icon(ticked ? "check" : "calendar", 16)),
    h("div", { class: "about" }, h("div", { class: "title" }, title), h("div", { class: "muted" }, caption)),
    h("div", { class: "actions" }, button));
}

function tick(day, block, minutes) {
  plan.tickBlock(state.log, day, block, minutes);
  saveLog();
  state.render();
}

// ---------- today ----------
async function todaySection(now, today) {
  const row = now.plan.days.find((r) => r.date === today);
  if (!row) {
    const every = now.phases;
    return h("div", { class: "notice" }, t("Your plan runs from {first} to {last}. Set new deadlines in Settings.",
      { first: longDate(every[0].start), last: longDate(every[every.length - 1].end) }));
  }
  const log = state.log;
  const goal = P.goalUnits(now, today);
  const ids = (kind) => goal.filter((u) => u.kind === kind).map((u) => u.id);
  const phase = P.currentPhase(today);
  const needRead = plan.neededPerDay(now.plan, now.units, now.finished, phase.name, today, "read", now.phases);
  const needEx = plan.neededPerDay(now.plan, now.units, now.finished, phase.name, today, "exercise", now.phases);
  const week = [...Array(7).keys()].map((n) => plan.addDays(today, -n));
  const didRead = week.reduce((s, d) => s + P.finishedOn(now, d, "read"), 0) / 7;
  const didEx = week.reduce((s, d) => s + P.finishedOn(now, d, "exercise"), 0) / 7;
  const pace = needRead === 0 && needEx === 0
    ? t("Everything for {goal} is finished.", { goal: goalText(phase) })
    : t("For {goal} you need on average {reads} chapters and {exercises} exercises per study day. Over the last 7 days you did {did_reads} and {did_exercises} a day.",
        { goal: goalText(phase), reads: decimal(needRead), exercises: decimal(needEx), did_reads: decimal(didRead), did_exercises: decimal(didEx) });

  const tiles = h("div", { class: "tiles-row" },
    tile(t("Exercises finished"), t("{done} of {total}", { done: plan.finishedBy(log, ids("exercise"), today), total: ids("exercise").length })),
    tile(t("Chapters read"), t("{done} of {total}", { done: plan.finishedBy(log, ids("read"), today), total: ids("read").length })),
    tile(t("Studied today"), P.fmt(plan.studiedMinutes(log, today))),
    tile(t("Streak"), counted(plan.streak(log, today), "{count} day", "{count} days")));

  if (row.budget === 0 && !goal.length) return h("div", { class: "stack" }, tiles, h("div", { class: "notice" }, t("Day off. Enjoy it, the plan has moved its work to the other days.")));

  // Today's review: at most 20 questions, picked once a day (store.todaysReview)
  const [reviewIds, fresh] = store.todaysReview(state.practice);
  if (fresh) savePractice();
  const left = store.reviewLeft(state.practice, reviewIds);
  const reviewTicked = "review" in ((log.days || {})[today]?.blocks || {});
  const review = blockRow(`${t("Daily review")} · ${t("{done} of {total} done today", { done: reviewIds.length - left.length, total: reviewIds.length })}`,
    t("At most 20 questions a day, the longest waiting first. Not part of the goal: do what you can."), reviewTicked,
    h("div", { class: "row", style: "gap: 8px" },
      left.length > 0 && h("button", { type: "button", class: "button small primary", onclick: () => startReview(left, ["view", "schedule"]) },
        t("Review {count}", { count: left.length })),
      h("button", { type: "button", class: "button small", onclick: () => tick(today, "review", 0) }, reviewTicked ? t("Undo") : t("Done"))));

  const rows = groupUnits(goal).map(([title, units]) => unitRow(now, title, units));
  const allDone = goal.length > 0 && goal.every((u) => done(now, u));
  const upcoming = allDone ? (now.plan.days.find((r) => r.date > today && r.units.length)?.units || []) : [];
  const writingTicked = "writing" in ((log.days || {})[today]?.blocks || {});
  const writingIsToday = plan.daysBetween("2000-01-03", today) % 2 === 1; // writing and speaking take turns
  const extra = h("input", { type: "number", min: 0, max: 600, step: 15, class: "answer-box", style: "max-width: 140px; min-height: 44px; font-size: 16px",
    value: String((log.days || {})[today]?.extra || 0), "aria-label": t("Minutes you studied outside the app today"),
    onchange: (event) => {
      log.days ??= {};
      const entry = log.days[today] ??= { seconds: 0, answers: 0, pages: 0, extra: 0, blocks: {} };
      entry.extra = Math.max(0, Math.min(600, Number(event.target.value) || 0));
      saveLog();
    } });
  const estimate = row.review + row.writing + goal.reduce((s, u) => s + u.minutes, 0);
  return h("div", { class: "stack" }, tiles,
    h("div", { class: "notice" }, pace),
    h("div", { class: "row between" }, h("h2", {}, t("Today's goal")),
      h("span", { class: "muted" }, t("Estimated time: about {time}. Your goal is the list, not the time.", { time: P.fmt(estimate) }))),
    h("div", { class: "card flush" }, review, rows,
      row.writing > 0 && blockRow(`${t(writingIsToday ? "Writing" : "Speaking")} · ${P.fmt(row.writing)}`,
        writingIsToday ? t("Write one task from an official model exam, then check it or have it checked.")
                       : t("Record a 3-minute monologue on a topic from a model exam and listen back."),
        writingTicked, h("button", { type: "button", class: "button small", onclick: () => tick(today, "writing", row.writing) }, writingTicked ? t("Undo") : t("Done")))),
    allDone && h("div", { class: "stack" }, h("div", { class: "feedback right" }, t("Today's list is done. If you want to do more, these come next:")),
      h("div", { class: "card flush" }, groupUnits(upcoming).slice(0, 3).map(([title, units]) => unitRow(now, title, units)))),
    h("label", { class: "row" }, extra, h("span", { class: "muted" }, t("Minutes you studied outside the app today (a class, a book, a podcast...)"))));
}

function tile(label, value) {
  return h("div", { class: "card tile" }, h("div", { class: "muted" }, label), h("div", { class: "tile-value" }, value));
}

// ---------- coming days ----------
function comingSection(now, today) {
  const monday = plan.addDays(plan.mondayOf(today), 7 * weekOffset);
  const days = [...Array(7).keys()].map((n) => plan.addDays(monday, n));
  const last = now.phases[now.phases.length - 1].end;
  const byDate = Object.fromEntries(now.plan.days.map((r) => [r.date, r]));
  return h("div", { class: "stack" },
    h("div", { class: "row" },
      h("button", { type: "button", class: "button small", disabled: weekOffset <= 0, onclick: () => { weekOffset -= 1; state.render(); } }, icon("left", 16), t("Previous week")),
      h("button", { type: "button", class: "button small", onclick: () => { weekOffset = 0; state.render(); } }, t("This week")),
      h("button", { type: "button", class: "button small", disabled: days[6] >= last, onclick: () => { weekOffset += 1; state.render(); } }, t("Next week"), icon("right", 16)),
      h("strong", {}, `${shortDate(days[0])} – ${shortDate(days[6])}`)),
    h("p", { class: "muted" }, t("The coming days are a forecast: each morning the plan starts again from where you are, so finishing more today makes the following days lighter.")),
    h("div", { class: "week-grid" }, days.map((day) => {
      const row = byDate[day];
      const head = h("div", { class: "row between" }, h("strong", {}, dayLabel(day)), day === today && h("span", { class: "eyebrow", style: "color: var(--accent)" }, t("today")));
      let body;
      if (day < today) body = h("p", { class: "muted" }, t("Past: see Progress"));
      else if (!row) body = h("p", { class: "muted" }, t("Outside the plan"));
      else {
        const units = day === today ? P.goalUnits(now, day) : row.units;
        body = !units.length ? h("p", { class: "muted" }, row.budget === 0 ? t("Day off") : t("Nothing planned"))
          : h("div", { class: "stack", style: "gap: 6px" },
              h("div", { class: "muted" }, t("{reads} chapters · {exercises} exercises", { reads: P.count(units, "read"), exercises: P.count(units, "exercise") })),
              groupUnits(units).map(([, group]) => {
                const first = group[0];
                const mark = group.every((u) => done(now, u)) ? "✓ " : "";
                if (first.kind === "exercise") return h("div", { class: "small" }, mark + (first.pdf_id ? `${first.level} ${String(first.number).padStart(2, "0")}` : first.group) + ": " + counted(group.length, "{count} exercise", "{count} exercises"));
                if (first.kind === "read") return h("div", { class: "small" }, mark + t("Read {chapter}", { chapter: `${first.level} ${String(first.number).padStart(2, "0")}` }));
                return h("div", { class: "small" }, mark + t("Mock {level} no. {number}", { level: first.level, number: first.number }));
              }),
              row.writing > 0 && h("div", { class: "small" }, t("Writing {minutes} min", { minutes: row.writing })));
      }
      return h("section", { class: day === today ? "card day today" : "card day" }, head, body);
    })));
}

// ---------- overview ----------
function overviewSection(now, today) {
  const log = state.log;
  const units = now.plan.units;
  const doneOf = (kind) => units.filter((u) => u.kind === kind && now.finished.has(u.id)).length;
  const week = [...Array(7).keys()].map((n) => plan.addDays(today, -n));
  const pace = week.reduce((s, d) => s + P.finishedOn(now, d, "read") + P.finishedOn(now, d, "exercise") + P.finishedOn(now, d, "mock"), 0) / 7;
  const deadlineCards = now.phases.map((phase, n) => {
    const names = now.phases.slice(0, n + 1).map((p) => p.name);
    const left = units.filter((u) => names.includes(u.phase) && !now.finished.has(u.id));
    let verdict;
    if (!left.length) verdict = h("div", { class: "feedback right" }, t("All done!"));
    else if (pace <= 0) verdict = h("p", { class: "muted" }, t("Your expected finish date appears here once you finish chapters and exercises."));
    else {
      const projected = plan.addDays(today, Math.ceil(left.length / pace));
      verdict = projected <= phase.end
        ? h("div", { class: "feedback right" }, t("At your pace of the last 7 days you finish on {day}.", { day: longDate(projected) }))
        : h("div", { class: "feedback near" }, t("At your pace of the last 7 days you finish on {day}, {days} days late. The daily lists will grow to make up for it.",
            { day: longDate(projected), days: plan.daysBetween(phase.end, projected) }));
    }
    return h("section", { class: "card" }, h("h3", {}, goalText(phase)),
      h("p", {}, t("Deadline: {day} · {days} days left", { day: longDate(phase.end), days: Math.max(0, plan.daysBetween(today, phase.end)) })),
      h("p", { class: "muted" }, (n ? t("Left, earlier levels included:") : t("Left:")) + " " +
        t("{reads} chapters to read, {exercises} exercises, {mocks} mock exams", { reads: P.count(left, "read"), exercises: P.count(left, "exercise"), mocks: P.count(left, "mock") })),
      verdict);
  });
  const mocks = new Set((log.mocks || []).map((m) => `${m.level}:${m.number}`));
  const levelRows = plan.LEVELS.map((level) => {
    const own = units.filter((u) => u.level === level);
    if (!own.length) return null;
    const reads = own.filter((u) => u.kind === "read"), ex = own.filter((u) => u.kind === "exercise");
    const read = reads.filter((u) => now.finished.has(u.id)).length / reads.length;
    const practised = ex.filter((u) => now.finished.has(u.id)).length / ex.length;
    const end = plan.finishDay(now.plan, (u) => u.level === level);
    return h("div", { class: "unit" }, h("div", { class: "number" }, level),
      h("div", { class: "about stack", style: "gap: 6px" },
        h("div", { class: "row" }, h("span", { class: "muted", style: "width: 150px" }, t("Chapters read {percent}", { percent: `${Math.round(read * 100)}%` })), h("div", { style: "flex: 1 1 120px" }, bar(read, true))),
        h("div", { class: "row" }, h("span", { class: "muted", style: "width: 150px" }, t("Exercises finished {percent}", { percent: `${Math.round(practised * 100)}%` })), h("div", { style: "flex: 1 1 120px" }, bar(practised, true)))),
      h("div", { class: "muted" }, t("Mocks {done}/2", { done: [1, 2].filter((n) => mocks.has(`${level}:${n}`)).length }), end ? ` · ${t("Planned to finish: {day}", { day: shortDate(end) })}` : ""));
  });
  return h("div", { class: "stack" },
    h("div", { class: "tiles-row" },
      tile(t("Chapters read"), t("{done} of {total}", { done: doneOf("read"), total: P.count(units, "read") })),
      tile(t("Exercises finished"), t("{done} of {total}", { done: doneOf("exercise"), total: P.count(units, "exercise") })),
      tile(t("Studied in total"), P.fmt(Object.keys(log.days || {}).reduce((s, d) => s + plan.studiedMinutes(log, d), 0))),
      tile(t("Streak"), counted(plan.streak(log, today), "{count} day", "{count} days"))),
    h("h2", {}, t("Deadlines")), h("div", { class: "grid" }, deadlineCards),
    h("h2", {}, t("Levels")), h("div", { class: "card flush" }, levelRows),
    h("h2", {}, t("Calendar")), calendar(now, today));
}

function calendar(now, today) {
  const byDate = Object.fromEntries(now.plan.days.map((r) => [r.date, r]));
  const log = state.log;
  const start = now.phases[0].start, last = now.phases[now.phases.length - 1].end;
  const first = plan.mondayOf(start);
  const weeks = Math.max(1, Math.floor(plan.daysBetween(first, last) / 7) + 1);
  const deadlines = Object.fromEntries(now.phases.map((p) => [p.end, goalText(p)]));
  const cells = [];
  for (let w = 0; w < weeks; w++) {
    for (let n = 0; n < 7; n++) {
      const day = plan.addDays(first, w * 7 + n);
      const row = byDate[day];
      const goal = (log.goals || {})[day];
      const studied = plan.studiedMinutes(log, day);
      let kind = "future", tip = [longDate(day)];
      if (day < start || day > last) kind = "out";
      else if (day <= today && goal && goal.length) {
        const share = plan.finishedBy(log, goal, day) / goal.length;
        kind = share >= 1 ? "c4" : share >= 0.66 ? "c3" : share >= 0.33 ? "c2" : share > 0 ? "c1" : "c0";
        tip.push(t("{done} of {total} of the list", { done: plan.finishedBy(log, goal, day), total: goal.length }) + ` · ${P.fmt(studied)}`);
      } else if (day <= today) { kind = studied >= 60 ? "c2" : studied > 0 ? "c1" : "c0"; tip.push(t("{time} studied", { time: P.fmt(studied) })); }
      else if (row && row.budget === 0) { kind = "off"; tip.push(t("day off")); }
      if (deadlines[day]) tip.push(deadlines[day]);
      cells.push(h("div", { class: `cal ${kind}${deadlines[day] ? " deadline" : ""}${day === today ? " now" : ""}`, title: tip.join(" · "),
                            style: `grid-column: ${w + 1}; grid-row: ${n + 1}` }, kind === "out" ? "" : String(Number(day.slice(8)))));
    }
  }
  return h("div", { class: "card" },
    h("div", { class: "calendar", style: `grid-template-columns: repeat(${weeks}, 30px)` }, cells),
    h("div", { class: "legend muted" },
      [["c0", "nothing"], ["c1", "under a third of the list"], ["c2", "a third"], ["c3", "two thirds"], ["c4", "list finished"], ["off", "day off"], ["future deadline", "deadline"]] // t-list
        .map(([kind, text]) => h("span", {}, h("i", { class: `cal ${kind}` }), t(text)))));
}

// ---------- official mock exams ----------
let mockSlot = null;
function mocksSection(now, today) {
  const logged = Object.fromEntries((state.log.mocks || []).map((m) => [`${m.level}:${m.number}`, m]));
  const planned = {};
  for (const row of now.plan.days) for (const u of row.units) if (u.kind === "mock") planned[`${u.level}:${u.number}`] ??= row.date;
  const slots = plan.LEVELS.flatMap((level) => [1, 2].map((number) => ({ level, number, key: `${level}:${number}` })));
  mockSlot ??= slots[0].key;
  const chosen = slots.find((s) => s.key === mockSlot);
  const old = logged[mockSlot];
  const field = (label, input) => h("label", { class: "stack", style: "gap: 4px" }, h("span", { class: "muted" }, label), input);
  const number = (value, min, max, step) => h("input", { type: "number", class: "answer-box", style: "min-height: 44px; font-size: 16px", value: String(value), min, max, step });
  const dateBox = h("input", { type: "date", class: "answer-box", style: "min-height: 44px; font-size: 16px", value: old ? old.date : today });
  const minutesBox = number(old ? old.minutes : plan.MOCK_MINUTES[chosen.level], 10, 600, 10);
  const partBoxes = PARTS.map((part) => [part, number(old ? old.parts[part] : 0, 0, 100, 1)]);
  const noteBox = h("input", { type: "text", class: "answer-box", style: "min-height: 44px; font-size: 16px", value: old?.note || "" });
  const save = () => {
    const parts = Object.fromEntries(partBoxes.map(([part, box]) => [part, Math.max(0, Math.min(100, Number(box.value) || 0))]));
    plan.saveOfficialMock(state.log, chosen.level, chosen.number, dateBox.value || today, Number(minutesBox.value) || 0, parts, noteBox.value);
    saveLog();
    state.render();
  };
  return h("div", { class: "stack" },
    h("p", {}, t("Take these on paper with the official model exams, timed and with the audio, then log your scores here. Aim for at least {target}% on every part. That is a target for practice, not the official pass mark.", { target: TARGET })),
    state.info.exam_site && h("div", {}, h("a", { class: "button", href: state.info.exam_site, target: "_blank", rel: "noopener" }, t("Official {exam} page", { exam: examName() }))),
    h("div", { class: "grid" }, slots.map(({ level, number, key }) => {
      const m = logged[key];
      const scores = m ? Object.values(m.parts) : [];
      return h("section", { class: "card" }, h("h3", {}, `${level} · ${t("no.")} ${number}`),
        m ? [h("div", {}, h("strong", {}, `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}% `), t("on average"), ` · ${longDate(m.date)}`),
             h("div", { class: "muted" }, Object.entries(m.parts).map(([part, score]) => `${t(part)} ${score}%${score >= TARGET ? "" : " ⚠"}`).join(" · ")),
             m.note && h("p", { class: "muted" }, m.note),
             h("div", { class: "row" },
               h("button", { type: "button", class: "button small", onclick: () => { mockSlot = key; state.render(); } }, t("Edit")),
               h("button", { type: "button", class: "button small", onclick: () => { plan.removeOfficialMock(state.log, level, number); saveLog(); state.render(); } }, t("Remove")))]
          : [h("p", { class: "muted" }, planned[key] ? t("Planned for {day}", { day: longDate(planned[key]) }) : t("Not in the plan")),
             h("button", { type: "button", class: "button small", onclick: () => { mockSlot = key; state.render(); } }, t("Log result"))],
        state.info.exam_levels?.[level] && h("a", { href: state.info.exam_levels[level].site, target: "_blank", rel: "noopener" }, t("{exam} sample papers", { exam: examName(level) })));
    })),
    h("section", { class: "card", id: "mock-form" },
      h("h2", {}, t("Log a result")),
      h("select", { "aria-label": t("Mock exam"), class: "answer-box", style: "min-height: 44px; font-size: 16px", onchange: (e) => { mockSlot = e.target.value; state.render(); } },
        slots.map((s) => h("option", { value: s.key, selected: s.key === mockSlot }, `${s.level} · ${t("no.")} ${s.number}`))),
      h("div", { class: "grid", style: "grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))" },
        field(t("Date"), dateBox), field(t("Minutes it took you"), minutesBox), partBoxes.map(([part, box]) => field(`${t(part)} (%)`, box))),
      field(t("Note (what went wrong, what to practise)"), noteBox),
      h("div", {}, h("button", { type: "button", class: "button primary", onclick: save }, t("Save result"))),
      h("p", { class: "muted" }, t("The minutes count towards your study time on that date."))));
}

// ---------- settings ----------
let problem = null;
function saveGoals(list) {
  const wrong = plan.deadlineProblem(list);
  if (wrong) { problem = wrong; state.render(); return; }
  state.log.deadlines = list.slice().sort((a, b) => plan.LEVELS.indexOf(a.level) - plan.LEVELS.indexOf(b.level));
  P.remakeToday();
  saveLog();
  state.render();
}

function settingsSection(now, today) {
  const goals = P.goals(today);
  const used = new Set(goals.map((g) => g.level));
  const free = plan.LEVELS.filter((l) => !used.has(l) && state.info.levels.includes(l));
  const dateInput = (value, onchange) => h("input", { type: "date", class: "answer-box", style: "min-height: 44px; font-size: 16px; max-width: 200px", value, onchange });
  const newLevel = h("select", { class: "answer-box", style: "min-height: 44px; font-size: 16px; max-width: 120px", "aria-label": t("Add a deadline for") },
    free.map((l, i) => h("option", { value: l, selected: i === free.length - 1 }, l)));
  const newDate = dateInput(plan.addDays(goals[goals.length - 1].date, 30));
  const hoursBox = (key, label) => h("label", { class: "stack", style: "gap: 4px" }, h("span", { class: "muted" }, label),
    h("input", { type: "number", class: "answer-box", style: "min-height: 44px; font-size: 16px; max-width: 140px", min: 0, max: 12, step: 0.5,
      value: String(P.hours()[key] / 60), onchange: (e) => {
        state.log.hours = { ...P.hours(), [key]: Math.round(Math.max(0, Math.min(12, Number(e.target.value) || 0)) * 60) };
        P.remakeToday(); saveLog(); state.render();
      } }));
  const offDate = dateInput(today);
  const daysOff = state.log.days_off || [];
  const phase = P.currentPhase(today);
  const load = now.plan.load[phase.name];
  const wrong = problem;
  problem = null;
  return h("div", { class: "stack" },
    h("section", { class: "card" },
      h("h2", {}, t("Deadlines")),
      h("p", { class: "muted" }, t("Finish everything up to a level by a date: its chapters, exercises and mock exams. The themed word lists go with your last deadline. Changing a deadline makes today's list again.")),
      wrong && h("div", { class: "feedback wrong" }, t(wrong)),
      now.phases.map((p, n) => h("div", { class: "row between", style: "border-top: 1px solid var(--line-faint); padding-top: 12px" },
        h("div", {}, h("strong", {}, goalText(p)), h("div", { class: "muted" }, p.levels.join(" · "))),
        h("div", { class: "row" },
          dateInput(p.end, (e) => saveGoals(goals.map((g, k) => (k === n ? { ...g, date: e.target.value } : g)))),
          h("button", { type: "button", class: "button small", disabled: goals.length === 1, onclick: () => saveGoals(goals.filter((_, k) => k !== n)) }, t("Remove"))))),
      free.length > 0 && h("div", { class: "row", style: "border-top: 1px solid var(--line-faint); padding-top: 12px" },
        h("span", { class: "muted" }, t("Add a deadline for")), newLevel, newDate,
        h("button", { type: "button", class: "button small", onclick: () => saveGoals(goals.concat([{ level: newLevel.value, date: newDate.value }])) }, t("Add")))),
    h("section", { class: "card" },
      h("h2", {}, t("Study time per day")),
      h("div", { class: "row" }, hoursBox("weekday", t("Monday to Friday (hours)")), hoursBox("weekend", t("Saturday and Sunday (hours)"))),
      h("p", { class: "muted" }, t("Your goals are chapters and exercises, not hours. These hours set how the work is shared between weekdays and the weekend, and give the time estimate on the Today page. Changing them makes today's list again.")),
      load > 1.05 && h("div", { class: "feedback near" }, t("What is left for {goal} takes about {percent} of these hours, by my estimate. The lists still fit the deadline, but the days will feel longer than this.",
        { goal: goalText(phase), percent: `${Math.round(load * 100)}%` }))),
    h("section", { class: "card" },
      h("h2", {}, t("Days off")),
      h("div", { class: "row" }, offDate, h("button", { type: "button", class: "button small", onclick: () => {
        state.log.days_off = [...new Set(daysOff.concat([offDate.value]))].sort();
        P.remakeToday(); saveLog(); state.render();
      } }, t("Add day off"))),
      daysOff.length ? daysOff.map((d) => h("div", { class: "row between" }, h("span", {}, longDate(d) + ` ${d.slice(0, 4)}`),
        h("button", { type: "button", class: "button small", onclick: () => {
          state.log.days_off = daysOff.filter((x) => x !== d); P.remakeToday(); saveLog(); state.render();
        } }, t("Remove"))))
        : h("p", { class: "muted" }, t("None yet. Christmas Day and New Year's Day might be good ones."))));
}

// ---------- the screen ----------
let section = "today";

export async function scheduleScreen(part, chosen) {
  if (SECTIONS.some(([id]) => id === chosen)) section = chosen;
  const today = store.today();
  const now = await P.currentState(today);
  const goal = P.goalUnits(now, today);
  const log = state.log;
  const ids = (kind) => goal.filter((u) => u.kind === kind).map((u) => u.id);
  const finishedToday = plan.finishedBy(log, goal.map((u) => u.id), today);
  const countdown = now.phases.filter((p) => p.end >= today).map((p) => t("{days} days to {levels}", { days: plan.daysBetween(today, p.end), levels: p.name })).join(" · ");
  const sections = { today: todaySection, coming: comingSection, overview: overviewSection, mocks: mocksSection, settings: settingsSection };
  document.title = `${t("Schedule")} · [SITE NAME]`;
  return h("div", { class: "stack", style: "gap: 24px" },
    h("section", { class: "card big" },
      h("div", { class: "eyebrow" }, t("Schedule")),
      h("h1", {}, longDate(today)),
      h("p", { class: "lead" }, [t("{exercises_done} of {exercises} exercises · {reads_done} of {reads} chapters read today · {time} studied",
        { exercises_done: plan.finishedBy(log, ids("exercise"), today), exercises: ids("exercise").length, reads_done: plan.finishedBy(log, ids("read"), today),
          reads: ids("read").length, time: P.fmt(plan.studiedMinutes(log, today)) }), countdown].filter(Boolean).join(" · ")),
      bar(goal.length ? finishedToday / goal.length : 0)),
    !P.hasOwnDeadlines() && h("div", { class: "notice row between" },
      h("span", {}, t("These deadlines are examples: {deadlines}. Set your own in Settings, or keep these.", { deadlines: now.phases.map(goalText).join(", ") })),
      h("button", { type: "button", class: "button small", onclick: () => saveGoals(P.goals(today)) }, t("Keep these deadlines"))),
    now.plan.late.length > 0 && h("div", { class: "feedback wrong" },
      t(now.plan.late.length === 1 ? "{count} part of the plan no longer fits before {day}." : "{count} parts of the plan no longer fit before {day}.", // t-list
        { count: now.plan.late.length, day: longDate(now.phases[now.phases.length - 1].end) })),
    h("div", { class: "segmented", role: "group", "aria-label": t("Show") }, SECTIONS.map(([id, label]) =>
      h("button", { type: "button", "aria-pressed": String(id === section), onclick: () => { location.hash = `#/${state.course}/schedule/${id}`; } }, t(label)))),
    await sections[section](now, today));
}
