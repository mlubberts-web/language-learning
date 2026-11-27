// Verb practice: sentences with the verb left out (data/<course>/verbs.json, made by build_web.py
// from verb_bank/ and the course's verbs in context). Two ways to practise:
//   "tense given": the hint says the infinitive and the tense;
//   "find the tense": only the infinitive; every tense that fits the sentence is right.
// Each session takes 20 sentences, the ones you don't know yet most often; "New sentences" after a
// session draws the next 20, so it never runs out.

import * as data from "../data.js";
import * as store from "../store.js";
import { t } from "../text.js";
import { h, bar } from "../ui.js";
import { state } from "../state.js";
import { startDrill } from "./session.js";
import { skipSwitch } from "./unit.js";

const GAP = "______";
const PER_SESSION = 20;

// Kept for this visit: the way of practising and the chosen tenses (empty: all)
let withTense = true;
const chosen = new Set();

// One sentence as a question. tenseNames: id -> name in the language of the explanations.
function toItem(row, tensed, tenseNames, lang) {
  const [sentence, infinitive, tense, why] = row;
  const match = sentence.match(/\[(.+?)\]/);
  const prompt = sentence.slice(0, match.index) + GAP + sentence.slice(match.index + match[0].length);
  // "habrá salido / hubiera salido | ha salido": after the | only right when you find the tense yourself
  const [main, contextOnly = ""] = match[1].split(" | ");
  const forms = main.split(" / ").concat(tensed || !contextOnly ? [] : contextOnly.split(" / "));
  const sentences = forms.map((form) => prompt.replace(GAP, form));
  const name = tense ? tenseNames[tense] : "";
  return {
    id: `VERB|${tensed ? "tense" : "context"}|${sentence}`, mode: "fill", eyebrow: t("Verb practice"),
    prompt, hint: tensed && name ? `${infinitive} · ${name}` : infinitive, lang,
    answers: forms.concat(sentences), show: sentences[0] + (forms.length > 1 ? `  (${t("also")}: ${forms.slice(1).join(", ")})` : ""),
    why: why || "", group: name, must_match: ["accent"], tiles: [], choices: [], speak: "",
  };
}

// All verb questions of the open course, in one way of practising
export async function verbItems(tensed) {
  const bank = await data.getJSON(`${state.course}/verbs.json`);
  const names = Object.fromEntries(bank.tenses.map((x) => [x.id, x.name]));
  const rows = tensed ? bank.sentences.filter((row) => row[2]) : bank.sentences; // with a tense given: only known tenses
  return rows.map((row) => toItem(row, tensed, names, state.info.learn));
}

function start(items) {
  const title = withTense ? t("Verb practice · tense given") : t("Verb practice · find the tense");
  startDrill(items, title, ["view", "verbs"], { size: PER_SESSION, checkKnown: true });
}

export async function verbsScreen() {
  const bank = await data.getJSON(`${state.course}/verbs.json`);
  const all = await verbItems(withTense);
  const tenseOf = (item) => bank.tenses.find((x) => x.name === item.group)?.id || null;
  // The chosen tenses; in "find the tense" mode sentences without a known tense always come along
  const picked = (item) => !chosen.size || chosen.has(tenseOf(item)) || (!withTense && !tenseOf(item));
  const pool = all.filter(picked);
  state.verbAgain = () => start(pool); // "New sentences" on the results screen

  const mode = h("div", { class: "segmented", role: "group", "aria-label": t("How to practise") },
    h("button", { type: "button", "aria-pressed": String(withTense), onclick: () => { withTense = true; state.render(); } }, t("Tense given")),
    h("button", { type: "button", "aria-pressed": String(!withTense), onclick: () => { withTense = false; state.render(); } }, t("Find the tense yourself")));

  const toggle = (id) => { if (chosen.has(id)) chosen.delete(id); else chosen.add(id); state.render(); };
  const rows = bank.tenses.map((tense) => {
    const items = all.filter((item) => tenseOf(item) === tense.id);
    const first = store.countMastered(state.practice, items);
    return h("tr", {},
      h("td", {}, h("label", { class: "switch" },
        h("input", { type: "checkbox", checked: chosen.has(tense.id), onchange: () => toggle(tense.id) }),
        h("span", {}, tense.name, h("span", { class: "muted small" }, ` · ${tense.level}`)))),
      h("td", { class: "tense-count" }, h("div", { class: "row", style: "gap: 8px; flex-wrap: nowrap" },
        h("div", { style: "flex: 1 1 60px; min-width: 40px" }, bar(items.length ? first / items.length : 0, true)),
        h("span", { class: "muted small", style: "white-space: nowrap" }, t("{done} of {total}", { done: first, total: items.length })))));
  });
  const mastered = store.countMastered(state.practice, all);
  document.title = `${t("Verb practice")} · [SITE NAME]`;
  const notice = state.notice;
  state.notice = null;
  return h("div", { class: "stack", style: "gap: 24px" },
    h("section", { class: "card big" },
      h("div", { class: "eyebrow" }, t("Verb practice")),
      h("h1", {}, t("Verbs in sentences")),
      h("p", { class: "lead" }, withTense
        ? t("Fill in the verb in the tense that is given.")
        : t("Only the infinitive is given: the sentence tells you which tense and form to use. Every tense that fits is right.")),
      h("div", { class: "row" }, h("div", { style: "flex: 1 1 200px" }, bar(all.length ? mastered / all.length : 0)),
        h("span", { class: "muted" }, t("{mastered} of {questions} questions mastered", { mastered, questions: all.length }))),
      h("div", { class: "row between" }, mode, skipSwitch()),
      h("div", { class: "row" },
        h("button", { type: "button", class: "button primary", disabled: !pool.length, onclick: () => start(pool) },
          t("Start {count} sentences", { count: Math.min(PER_SESSION, pool.length) })),
        h("span", { class: "muted" }, chosen.size ? t("{count} sentences in the chosen tenses", { count: pool.length }) : t("{count} sentences in all tenses", { count: pool.length })))),
    notice && h("div", { class: "notice", role: "status" }, notice),
    h("section", { class: "card flush" },
      h("div", { class: "list-head" }, h("div", { style: "font-weight: 600" }, t("Tenses")),
        chosen.size ? h("button", { type: "button", class: "button small", onclick: () => { chosen.clear(); state.render(); } }, t("All tenses"))
          : h("span", { class: "muted" }, t("Tick tenses to practise only those"))),
      h("div", { class: "table-box", style: "border: none; border-radius: 0" }, h("table", { class: "tense-table" },
        h("thead", {}, h("tr", {}, h("th", {}, t("Tense")), h("th", {}, t("Right first try")))),
        h("tbody", {}, rows)))));
}
