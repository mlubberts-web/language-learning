// A practice session: one question at a time, then the result. The rules are in rounds.js,
// the grading in grading.js; this file shows them and handles the clicks and keys.

import * as data from "../data.js";
import * as store from "../store.js";
import { checkAnswer } from "../grading.js";
import * as rounds from "../rounds.js";
import { t } from "../text.js";
import { h, icon, bar } from "../ui.js";
import { state, savePractice, saveLog, saveDrill, modeTitle, unitById } from "../state.js";
import { mastery } from "./unit.js";

export const SIZES = { "10": 10, "20": 20, "All": null };

const isKnown = (item) => store.isMastered(state.practice, item.id) || store.isMarkedDone(state.practice, rounds.doneKey(item));

// ---------- starting and ending ----------
// back: where "Back" goes: ["unit", id], ["level", "A2"], ["home"] or ["view", "words"].
// options: unitId, mode, size (null: all), pool (every question of the unit, so the next type can
// follow), source (its name), checkKnown (leave out what you know when "Skip what I know" is on).
export function startDrill(items, title, back, options = {}) {
  let leftOut = 0;
  if (options.checkKnown && store.skipKnown(state.practice)) {
    const unknown = items.filter((item) => !isKnown(item));
    leftOut = items.length - unknown.length;
    if (!unknown.length) {
      state.notice = t("You already know all {count} questions of {title}. Switch off 'Skip what I know' to practise them anyway.",
        { count: leftOut, title });
      state.render();
      return;
    }
    items = unknown;
  }
  if (!items.length) return;
  const chosen = rounds.chooseItems(items, state.practice.items, options.size ?? null);
  state.drill = { ...rounds.newDrill(chosen), title, back, unitId: options.unitId || null, mode: options.mode || null,
                  size: options.size ?? null, pool: options.pool || [], source: options.source || null,
                  leftOut, order: [], picked: [], tilesFor: null };
  saveDrill();
  if (location.hash === `#/${state.course}/session`) state.render();
  else location.hash = `#/${state.course}/session`;
}

function startMode(mode) {
  const old = state.drill;
  const title = `${old.source} · ${modeTitle(mode) || t("Weak questions")}`;
  const options = { unitId: old.unitId, mode, size: old.size, pool: old.pool, source: old.source };
  if (mode === "weak") {
    startDrill(old.pool.filter((item) => store.isWeak(state.practice, item.id)), title, old.back, options);
  } else {
    startDrill(old.pool.filter((item) => item.mode === mode), title, old.back, { ...options, checkKnown: true });
  }
}

function runAgain() {
  const old = state.drill;
  startDrill(Object.values(old.items), old.title, old.back,
    { unitId: old.unitId, mode: old.mode, size: old.size, pool: old.pool, source: old.source });
}

function backAddress(back) {
  const base = `#/${state.course}`;
  if (back[0] === "unit") return `${base}/unit/${back[1]}`;
  if (back[0] === "level") return `${base}/level/${back[1]}`;
  if (back[0] === "view") return `${base}/${back[1]}`;
  return base;
}

function leave() {
  const address = backAddress(state.drill.back);
  state.drill = null;
  saveDrill();
  location.hash = address;
}

// ---------- answering ----------
function grade(typed) {
  const drill = state.drill;
  const item = rounds.currentItem(drill);
  const accepted = store.acceptedAnswers(state.practice, rounds.answerKey(item));
  const { result, note } = checkAnswer(item, typed, state.info.learn, accepted);
  const correct = result !== "wrong";
  const first = rounds.isFirstAttempt(drill);
  if (first) { store.record(state.practice, item.id, correct); savePractice(); }
  // Every answer counts towards today's study time; only first tries count for your accuracy.
  store.addActivity(state.log, "answer");
  if (first) store.addResult(state.log, correct);
  saveLog();
  rounds.giveResult(drill, item.id, correct);
  drill.feedback = { result, note, typed };
  saveDrill();
  state.render();
}

function iWasRight() {
  const drill = state.drill;
  const item = rounds.currentItem(drill);
  if (rounds.isFirstAttempt(drill)) {
    store.changeToCorrect(state.practice, item.id);
    store.overruleResult(state.log);
    saveLog();
  }
  // Remembered, so this answer counts as correct from now on, everywhere.
  store.accept(state.practice, rounds.answerKey(item), drill.feedback.typed);
  savePractice();
  rounds.changeToCorrect(drill, item.id);
  drill.feedback.result = "overruled";
  saveDrill();
  state.render();
}

function next() {
  const drill = state.drill;
  rounds.goToNext(drill);
  if (drill.finished && drill.unitId && drill.mode) { // a unit score is only saved for a finished session
    store.saveScore(state.practice, drill.unitId, drill.mode, rounds.scorePercent(drill));
    savePractice();
  }
  saveDrill();
  state.render();
}

// ---------- the keyboard ----------
// Enter: check, or go on after the answer is shown. Ctrl+Space: hear the sentence again.
// In the answer box, 1 to 9 type the special letters under it; with Alt they type the number.
let keyAction = null; // what Enter does on the screen that is shown, or null
document.addEventListener("keydown", (event) => {
  if (!location.hash.endsWith("/session")) return;
  if (event.ctrlKey && event.code === "Space" && lastSpeech) { event.preventDefault(); speak(lastSpeech.text, 1, lastSpeech.voice); return; }
  if (event.key === "Enter" && keyAction && !event.target.matches?.("input, textarea, button, select")) {
    event.preventDefault();
    keyAction();
  }
});

function letterKeyHandler(letters) {
  return (event) => {
    const n = "123456789".indexOf(event.key);
    if (n < 0 || n >= letters.length || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    insert(event.target, letters[n]);
  };
}

function insert(box, letter) {
  const at = box.selectionStart ?? box.value.length, end = box.selectionEnd ?? at;
  box.value = box.value.slice(0, at) + letter + box.value.slice(end);
  box.setSelectionRange(at + letter.length, at + letter.length);
  box.focus();
}

// With Alt held, Windows can swallow the number: then put the number in ourselves.
function altNumberHandler(event) {
  if (event.altKey && !event.ctrlKey && /^Digit[0-9]$/.test(event.code)) {
    event.preventDefault();
    insert(event.target, event.code.slice(5));
  }
}

// ---------- listening ----------
let lastSpeech = null;
const findVoice = (code) => speechSynthesis.getVoices().find((voice) => voice.lang.replace("_", "-") === code);

function speak(text, rate, code) {
  if (!("speechSynthesis" in window)) return;
  lastSpeech = { text, voice: code };
  speechSynthesis.cancel();
  const sentence = new SpeechSynthesisUtterance(text);
  sentence.lang = code;
  sentence.rate = rate;
  const voice = findVoice(code);
  if (voice) sentence.voice = voice;
  speechSynthesis.speak(sentence);
}

// ---------- the parts of the question screen ----------
// The answer box with its letter keys (and the play buttons for listening). onSubmit gets the
// typed text; the mock exam uses this too, with its own onSubmit.
export function typedQuestion(drill, item, profile, onSubmit = grade) {
  const box = h("input", { class: "answer-box", type: "text", id: "answer", autocomplete: "off", autocapitalize: "off",
                           spellcheck: "false", lang: item.lang || state.info.learn });
  const letters = profile.keys || [];
  box.addEventListener("keydown", letterKeyHandler(letters));
  box.addEventListener("keydown", altNumberHandler);
  state.afterRender = () => box.focus();
  const listening = item.speak && listeningControls(item, profile);
  if (item.speak) setTimeout(() => speak(item.speak, 1, profile.voice), 150);
  return h("form", { class: "stack", onsubmit: (event) => { event.preventDefault(); onSubmit(box.value); } },
    listening,
    h("label", { for: "answer", class: "muted" }, t("Your answer")),
    box,
    letters.length > 0 && h("div", { class: "letter-keys" }, letters.map((letter, i) =>
      h("button", { type: "button", "aria-label": t("Add {letter} (key {key})", { letter, key: i + 1 }), "aria-keyshortcuts": String(i + 1),
                    onmousedown: (event) => { event.preventDefault(); insert(box, letter); } },
        h("span", { class: "letter" }, letter), h("span", { class: "key" }, i + 1)))),
    letters.length > 0 && h("p", { class: "muted" }, t("In the answer box, 1 to {last} type these letters. Hold Alt for a real number.", { last: letters.length })),
    h("div", { class: "row between" },
      h("button", { type: "button", class: "button", onclick: () => onSubmit("") }, t("I don't know")),
      h("button", { type: "submit", class: "button primary large" }, t("Check (Enter)"))));
}

function listeningControls(item, profile) {
  const warning = h("p", { class: "notice", hidden: true },
    t("No {name} voice was found, so you may hear nothing or a different accent. Use Microsoft Edge or Chrome, or add a voice in the settings of your computer or phone.",
      { name: t(profile.voice_name) }));
  setTimeout(() => { if ("speechSynthesis" in window) warning.hidden = Boolean(findVoice(profile.voice)); }, 1500);
  return h("div", { class: "stack" },
    h("div", { class: "row" },
      h("button", { type: "button", class: "button dark", onclick: () => speak(item.speak, 1, profile.voice) }, icon("sound"), t("Play again (Ctrl+Space)")),
      h("button", { type: "button", class: "button", onclick: () => speak(item.speak, 0.65, profile.voice) }, icon("slow"), t("Slowly"))),
    warning);
}

function tileQuestion(drill, item) {
  if (drill.tilesFor !== drill.asked) { // first time on this question: shuffle the words
    let order = item.tiles.slice();
    for (let tries = 0; tries < 8; tries++) {
      order = rounds.shuffled(item.tiles);
      if (order.join(" ") !== item.tiles.join(" ")) break;
    }
    Object.assign(drill, { tilesFor: drill.asked, order, picked: [] });
    saveDrill();
  }
  const built = drill.picked.map((i) => drill.order[i]).join(" ");
  const allUsed = drill.picked.length === drill.order.length;
  keyAction = allUsed ? () => grade(built) : null;
  const change = (picked) => { drill.picked = picked; saveDrill(); state.render(); };
  return h("div", { class: "stack" },
    h("div", { class: "built", "aria-live": "polite" }, built || h("span", { class: "muted" }, t("Click the words in the right order."))),
    h("div", { class: "tiles" }, drill.order.map((word, i) =>
      h("button", { type: "button", disabled: drill.picked.includes(i), onclick: () => change(drill.picked.concat([i])) }, word))),
    h("div", { class: "row" },
      h("button", { type: "button", class: "button primary", disabled: !allUsed, onclick: () => grade(built) }, t("Check")),
      h("button", { type: "button", class: "button", disabled: !drill.picked.length, onclick: () => change(drill.picked.slice(0, -1)) }, t("Undo")),
      h("button", { type: "button", class: "button", disabled: !drill.picked.length, onclick: () => change([]) }, t("Clear"))));
}

function choiceQuestion(item) {
  // The first letter of each choice is its key: E or L for el / la, D or H for de / het.
  const keys = Object.fromEntries(item.choices.map((choice) => [choice[0].toLowerCase(), choice]));
  const onKey = (event) => {
    if (!location.hash.endsWith("/session") || event.ctrlKey || event.altKey || event.metaKey) return;
    const choice = keys[event.key.toLowerCase()];
    if (choice) { document.removeEventListener("keydown", onKey); grade(choice); }
  };
  document.addEventListener("keydown", onKey);
  state.cleanup = () => document.removeEventListener("keydown", onKey);
  return h("div", { class: "row" }, item.choices.map((choice) =>
    h("button", { type: "button", class: "button primary large", "aria-keyshortcuts": choice[0].toUpperCase(),
                  onclick: () => grade(choice) }, choice)));
}

function feedbackPart(item, feedback) {
  const mine = feedback.typed || t("(no answer)");
  const heads = {
    right: ["right", "check", t("Correct!")],
    near: ["near", "check", feedback.note],
    overruled: ["right", "check", t("Counted as correct.")],
    wrong: ["wrong", "close", t("Not quite. This one comes back later.")],
  };
  const [kind, shape, head] = heads[feedback.result];
  const box = h("div", { class: `feedback ${kind}`, role: "status" },
    h("div", { class: "head" }, icon(shape), head),
    feedback.result === "wrong" || feedback.result === "overruled"
      ? [h("div", {}, h("strong", {}, t("Your answer:")), " ", mine), h("div", {}, h("strong", {}, t("Model answer:")), " ", item.show)]
      : h("div", {}, item.show));
  keyAction = next;
  const nextButton = h("button", { type: "button", class: "button dark large", onclick: next }, t("Next (Enter)"));
  state.afterRender = () => nextButton.focus();
  return h("div", { class: "stack" }, box,
    item.why && h("div", { class: "why" }, item.why),
    h("div", { class: "row between" },
      feedback.result === "wrong" ? h("button", { type: "button", class: "button", onclick: iWasRight }, t("I was actually right")) : h("span"),
      nextButton));
}

// During a session the page header shows where you are and a Stop button instead of the menu.
function sessionBar(drill) {
  const header = document.getElementById("header");
  header.hidden = false;
  header.replaceChildren(h("div", { class: "inner" },
    h("div", { class: "brand session-brand" }, "[SITE NAME]"),
    h("div", { class: "session-where" }, drill.title),
    h("button", { type: "button", class: "button small", onclick: leave }, icon("close", 16), t("Stop session"))));
}

// ---------- the results ----------
function followingStep(drill) {
  if (!drill.pool.length) return null;
  const skip = store.skipKnown(state.practice);
  const left = [...new Set(drill.pool.filter((item) => !(skip ? isKnown(item) : store.isMarkedDone(state.practice, rounds.doneKey(item))))
    .map((item) => item.mode))];
  return rounds.nextStep(left, drill.mode, drill.pool.some((item) => store.isWeak(state.practice, item.id)));
}

function resultsScreen(drill) {
  const percent = rounds.scorePercent(drill);
  const total = Object.keys(drill.items).length;
  const right = total - drill.firstWrong.length;
  const step = followingStep(drill);
  const index = state.catalog.indexOf(unitById(drill.unitId));
  const after = drill.pool.length > 0 && drill.back[0] === "unit" && index >= 0 ? state.catalog[index + 1] : null;
  const base = `#/${state.course}`;
  let main;
  if (step) {
    main = h("button", { type: "button", class: "button primary large", onclick: () => startMode(step) },
      t("Next: {type}", { type: step === "weak" ? t("Weak questions") : modeTitle(step) }));
    keyAction = () => startMode(step);
  } else if (after) {
    main = h("a", { class: "button primary large", href: `${base}/read/${after.id}` },
      t("Next unit: {level} · {title}", { level: after.level, title: after.title }));
    keyAction = () => { location.hash = `${base}/read/${after.id}`; };
  } else {
    keyAction = null;
  }
  return h("div", { class: "stack" },
    h("section", { class: "card big" },
      h("div", { class: "eyebrow" }, t("Session complete")),
      h("div", { class: "big-number" }, `${percent}%`),
      h("p", { class: "lead" }, t("{right} of {total} correct the first time", { right, total })),
      bar(percent / 100),
      drill.pool.length > 0 && !step && !after && h("p", {}, t("That was the last exercise type.")),
      h("div", { class: "row" }, main,
        h("button", { type: "button", class: "button", onclick: runAgain }, t("Run again")),
        h("button", { type: "button", class: "button", onclick: leave }, t("Back")))),
    drill.firstWrong.length > 0 && h("section", { class: "card" },
      h("h2", {}, t("Wrong the first time")),
      h("ul", { class: "stack", style: "margin: 0; padding-left: 20px" }, drill.firstWrong.map((id) => {
        const item = drill.items[id];
        return h("li", {}, item.prompt || item.speak, " → ", h("strong", {}, item.show));
      }))));
}

// ---------- the screen ----------
export async function sessionScreen() {
  state.cleanup?.();
  state.cleanup = null;
  keyAction = null;
  const drill = state.drill;
  if (!drill) { location.hash = `#/${state.course}`; return h("div"); }
  document.title = `${drill.title} · [SITE NAME]`;
  sessionBar(drill);
  if (drill.finished) return resultsScreen(drill);

  const item = rounds.currentItem(drill);
  const profile = (await data.languages()).profiles[item.lang || state.info.learn];
  const stage = drill.stage === 1 ? t("Round {round}", { round: drill.round }) : t("Repeat of what you missed, round {round}", { round: drill.round });
  let answerPart;
  if (drill.feedback) answerPart = feedbackPart(item, drill.feedback);
  else if (item.mode === "build") answerPart = tileQuestion(drill, item);
  else if (item.choices.length) answerPart = choiceQuestion(item);
  else answerPart = typedQuestion(drill, item, profile);

  return h("div", {},
    h("div", { class: "stack" },
      h("div", { class: "stack", style: "gap: 8px" },
        h("div", { class: "row between muted" },
          h("span", {}, `${stage} · ${t("question {number} of {total}", { number: drill.position + 1, total: drill.queue.length })}`),
          drill.leftOut ? h("span", {}, t("{count} known questions left out", { count: drill.leftOut })) : null),
        bar(drill.position / drill.queue.length)),
      h("section", { class: "card big" },
        h("div", { class: "eyebrow" }, modeTitle(item.mode)),
        h("div", { class: "prompt" }, item.prompt),
        item.hint && h("div", { class: "hint" }, item.hint),
        answerPart)));
}
