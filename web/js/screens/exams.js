// The mock exam: questions of one level (or all levels) with a time limit, no feedback until the
// end, then the result. The same rules as extra_screens.py. Also links to the official free
// model exams, which the site may not copy (they belong to the exam organisations).

import * as data from "../data.js";
import * as store from "../store.js";
import { checkAnswer } from "../grading.js";
import * as rounds from "../rounds.js";
import { t } from "../text.js";
import { h, bar, icon, noEmoji } from "../ui.js";
import { state, savePractice, saveLog, modeTitle } from "../state.js";
import { typedQuestion } from "./session.js";
import { LEVEL_NAMES } from "./home.js";

// Number of questions and minutes
const LENGTHS = { "20 questions, 15 minutes": [20, 15], "40 questions, 30 minutes": [40, 30], "60 questions, 45 minutes": [60, 45] }; // t-list
let chosen = { level: null, length: "40 questions, 30 minutes" };

// The running mock exam is kept for this browser tab, like a practice session.
const keyOf = () => `mock/${state.course}`;
function loadMock() { try { return JSON.parse(sessionStorage.getItem(keyOf())); } catch { return null; } }
function saveMock(mock) { try { sessionStorage.setItem(keyOf(), JSON.stringify(mock)); } catch { /* ignore */ } }

function result(mock) {
  const right = mock.answers.filter((a) => a.result !== "wrong").length;
  const total = mock.items.length;
  return { date: store.today(), level: mock.level, right, total, percent: rounds.pythonRound((100 * right) / total) };
}

async function start() {
  const [questions, minutes] = LENGTHS[chosen.length];
  const units = state.catalog.filter((unit) => chosen.level === "All levels" || unit.level === chosen.level);
  const pool = await data.itemsOfUnits(state.course, units);
  saveMock({ level: chosen.level, items: rounds.chooseMockItems(pool, questions), position: 0, answers: [],
             minutes, deadline: Date.now() + minutes * 60000, saved: false });
  location.hash = `#/${state.course}/exams/run`;
}

function finish(mock) {
  if (!mock.saved) {
    mock.saved = true;
    (state.practice.mocks ??= []).push(result(mock));
    savePractice();
  }
  saveMock(mock);
  location.hash = `#/${state.course}/exams/result`;
}

function submit(mock, typed) {
  const item = mock.items[mock.position];
  const accepted = store.acceptedAnswers(state.practice, rounds.answerKey(item));
  const { result: outcome } = checkAnswer(item, typed, state.info.learn, accepted);
  store.record(state.practice, item.id, outcome !== "wrong");
  savePractice();
  store.addActivity(state.log, "answer");
  store.addResult(state.log, outcome !== "wrong"); // each mock question is a first try
  saveLog();
  mock.answers.push({ item, typed, result: outcome });
  mock.position += 1;
  if (mock.position >= mock.items.length) finish(mock);
  else { saveMock(mock); state.render(); }
}

// ---------- choosing ----------
function setupScreen() {
  const levels = state.info.levels;
  chosen.level ??= levels[Math.max(0, levels.length - 2)];
  const segmented = (label, options, current, change, show = (x) => t(x)) =>
    h("div", { class: "stack", style: "gap: 8px" }, h("strong", {}, label),
      h("div", { class: "segmented", role: "group", "aria-label": label }, options.map((option) =>
        h("button", { type: "button", "aria-pressed": String(option === current), onclick: () => { change(option); state.render(); } }, show(option)))));
  const earlier = (state.practice.mocks || []).slice(-10).reverse();
  const official = state.info.exam_levels || {};
  return h("div", { class: "columns" },
    h("div", { class: "wide" },
      h("section", { class: "card big" },
        h("div", { class: "eyebrow" }, t("Mock exam")),
        h("h1", {}, t("Test yourself under time pressure")),
        h("p", { class: "lead" }, t("A mix of all exercise types, one attempt each, with no feedback until the end.")),
        segmented(t("Level"), [...levels, "All levels"], chosen.level, (x) => { chosen.level = x; }), // t-list
        segmented(t("Length"), Object.keys(LENGTHS), chosen.length, (x) => { chosen.length = x; }),
        h("div", { class: "row" }, h("button", { type: "button", class: "button primary large", onclick: start }, t("Start the mock exam"))),
        h("p", { class: "muted" }, t("This trains exam conditions with the questions of this program. It does not follow the format of the official {exam} exam.", { exam: state.info.exam || "" }))),
      earlier.length > 0 && h("section", { class: "card" },
        h("h2", {}, t("Earlier results")),
        h("ul", { style: "margin: 0; padding-left: 20px" }, earlier.map((m) =>
          h("li", {}, `${m.date} · ${t(m.level)} · `, h("strong", {}, `${m.percent}%`), " ", t("({right} of {total})", m)))))),
    h("aside", { class: "side" },
      h("section", { class: "card" },
        h("h2", {}, t("Official model exams")),
        h("p", { class: "muted" }, t("The organisations behind the official exams publish free model exams. Do one when you finish a level.")),
        levels.some((level) => official[level])
          ? h("ul", { style: "margin: 0; padding-left: 20px" }, levels.filter((level) => official[level]).map((level) =>
              h("li", {}, `${level}: `, h("a", { href: official[level].site, target: "_blank", rel: "noopener" }, official[level].name))))
          : state.info.exam_site && h("a", { class: "button", href: state.info.exam_site, target: "_blank", rel: "noopener" },
              t("{exam}: official site", { exam: state.info.exam || "" })))));
}

// ---------- answering ----------
let timer = null;
async function runScreen() {
  const mock = loadMock();
  if (!mock || mock.saved) { location.hash = `#/${state.course}/exams`; return h("div"); }
  const item = mock.items[mock.position];
  const profile = (await data.languages()).profiles[item.lang || state.info.learn];
  const clock = h("div", { class: "clock", role: "timer", "aria-label": t("Time left") });
  const tick = () => {
    const left = Math.max(0, Math.round((mock.deadline - Date.now()) / 1000));
    clock.textContent = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    if (left <= 0) { clearInterval(timer); finish(mock); }
  };
  clearInterval(timer);
  timer = setInterval(() => { if (location.hash.endsWith("/exams/run")) tick(); else clearInterval(timer); }, 1000);
  tick();
  return h("div", { class: "stack" },
    h("div", { class: "row between" },
      h("button", { type: "button", class: "button small", onclick: () => finish(mock) }, t("Finish now")),
      h("span", { class: "muted" }, t("Question {number} of {total}", { number: mock.position + 1, total: mock.items.length })),
      h("div", { class: "row", style: "gap: 6px" }, icon("clock", 20), clock)),
    bar(mock.position / mock.items.length),
    h("section", { class: "card big" },
      h("div", { class: "eyebrow" }, modeTitle(item.mode)),
      h("div", { class: "prompt" }, item.prompt),
      item.hint && h("div", { class: "hint" }, item.hint),
      typedQuestion(null, item, profile, (typed) => submit(mock, typed))));
}

// ---------- the result ----------
function iWasRight(mock, index) {
  const answer = mock.answers[index];
  answer.result = "overruled";
  store.changeToCorrect(state.practice, answer.item.id);
  store.accept(state.practice, rounds.answerKey(answer.item), answer.typed); // right from now on
  store.overruleResult(state.log);
  saveLog();
  state.practice.mocks[state.practice.mocks.length - 1] = result(mock); // the mock just finished is the last one
  savePractice();
  saveMock(mock);
  state.render();
}

function resultScreen() {
  const mock = loadMock();
  if (!mock) { location.hash = `#/${state.course}/exams`; return h("div"); }
  const r = result(mock);
  const unanswered = r.total - mock.answers.length;
  const perType = state.info.modes.map((m) => {
    const asked = mock.answers.filter((a) => a.item.mode === m.id);
    return asked.length > 0 && h("li", {}, `${modeTitle(m.id)}: `,
      h("strong", {}, t("{right} of {total}", { right: asked.filter((a) => a.result !== "wrong").length, total: asked.length })));
  });
  const wrong = mock.answers.map((a, n) => [a, n]).filter(([a]) => a.result === "wrong");
  return h("div", { class: "stack" },
    h("section", { class: "card big" },
      h("div", { class: "eyebrow" }, t("Mock exam result")),
      h("div", { class: "big-number" }, `${r.percent}%`),
      h("p", { class: "lead" }, [t("{right} of {total} correct", r), t(mock.level),
        unanswered > 0 && t("{count} not answered", { count: unanswered })].filter(Boolean).join(" · ")),
      bar(r.percent / 100),
      h("div", { class: "row" }, h("a", { class: "button primary", href: `#/${state.course}/exams` }, t("New mock exam")))),
    h("section", { class: "card" }, h("h2", {}, t("Per exercise type")), h("ul", { style: "margin: 0; padding-left: 20px" }, perType)),
    wrong.length > 0 && h("section", { class: "card" },
      h("h2", {}, t("What you got wrong")),
      wrong.map(([a, n]) => h("div", { class: "row between", style: "border-top: 1px solid var(--line-faint); padding-top: 12px" },
        h("div", { style: "flex: 1 1 300px" },
          h("div", {}, a.item.prompt),
          h("div", { class: "muted" }, `${t("Your answer:")} ${a.typed || t("(no answer)")}`),
          h("div", {}, `${t("Model answer:")} `, h("strong", {}, a.item.show))),
        h("button", { type: "button", class: "button small", onclick: () => iWasRight(mock, n) }, t("I was right"))))));
}

export async function examsScreen(part, step) {
  document.title = `${t("Mock exam")} · [SITE NAME]`;
  if (step === "run") return runScreen();
  if (step === "result") return resultScreen();
  return setupScreen();
}
