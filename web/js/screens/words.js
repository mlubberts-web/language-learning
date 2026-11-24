// The themed word lists: topics (food, travel ...) and useful language (connectors, idioms).
// Choose a list, then an exercise type; the next types follow by themselves, like in a unit.

import * as data from "../data.js";
import * as store from "../store.js";
import { t } from "../text.js";
import { h, bar, noEmoji } from "../ui.js";
import { state, savePractice, modeTitle } from "../state.js";
import { doneKey } from "../rounds.js";
import { startDrill } from "./session.js";
import { mastery, sizeButtons, skipSwitch, sessionSize } from "./unit.js";

const KINDS = [["topic", "Topics", "Words for what people talk about."],
               ["language", "Useful language", "The words that hold a text together: connectors, set phrases, idioms. These count in the writing and speaking parts of the {exam} exam."]];

// The exercise buttons on a card, in the order they follow each other.
function themeModes(languages) {
  const { learn, explained_in: base } = state.info;
  const name = (code) => languages.names[code][base];
  const buttons = [["reverse", noEmoji(t("🔄 To {language}", { language: name(base) }))]];
  if (state.info.modes.some((m) => m.id === "gender")) buttons.push(["gender", modeTitle("gender")]);
  buttons.push(["words", noEmoji(t("🔤 To {language}", { language: name(learn) }))], ["fill", noEmoji(t("✏️ In a sentence"))]);
  return buttons;
}

// The list chosen on each card, kept for this visit
const chosenList = {};

function themeCard(name, theme, buttons) {
  const group = chosenList[name] || "";
  const pool = theme.items.filter((item) => !group || item.group === group);
  const title = noEmoji(theme.title);
  const source = group ? `${title} · ${group}` : title;
  const done = mastery(theme.items);
  const keys = [...new Set(pool.map(doneKey))];
  const ticked = keys.every((key) => store.isMarkedDone(state.practice, key));
  const words = (list) => theme.items.filter((item) => item.group === list && item.mode === "reverse").length;
  return h("section", { class: "card mode-card" },
    h("h3", {}, noEmoji(theme.title)),
    h("div", { class: "row" }, h("div", { style: "flex: 1 1 160px" }, bar(done / theme.items.length, true)),
      h("span", { class: "muted" }, t("{mastered} of {questions} questions mastered", { mastered: done, questions: theme.items.length }))),
    h("select", { "aria-label": t("List"), onchange: (event) => { chosenList[name] = event.target.value; state.render(); } },
      h("option", { value: "" }, t("All lists")),
      theme.lists.map((list) => h("option", { value: list.name, selected: list.name === group },
        `${list.name} · ${list.level} · ${t("{count} words", { count: words(list.name) })}`))),
    h("label", { class: "switch" },
      h("input", { type: "checkbox", checked: ticked, onchange: (event) => {
        for (const key of keys) store.markDone(state.practice, key, event.target.checked);
        savePractice();
        state.render();
      } }), group ? t("Mark this list as done") : t("Mark all lists as done")),
    h("div", { class: "row", style: "gap: 8px" }, buttons.filter(([mode]) => pool.some((item) => item.mode === mode)).map(([mode, label]) =>
      h("button", { type: "button", class: "button small", onclick: () =>
        startDrill(pool.filter((item) => item.mode === mode), `${source} · ${label}`, ["view", "words"],
          { unitId: `THEME_${name}`, mode, size: sessionSize(), pool, source, checkKnown: true }) }, label))));
}

export async function wordsScreen() {
  const [themes, languages] = await Promise.all([data.themes(state.course), data.languages()]);
  const all = Object.values(themes).flatMap((theme) => theme.items);
  const done = mastery(all);
  const buttons = themeModes(languages);
  document.title = `${t("Word lists")} · [SITE NAME]`;
  const notice = state.notice;
  state.notice = null;
  return h("div", { class: "stack", style: "gap: 24px" },
    h("section", { class: "card big" },
      h("div", { class: "eyebrow" }, t("Word lists")),
      h("h1", {}, t("Themed vocabulary")),
      h("div", { class: "row" }, h("div", { style: "flex: 1 1 200px" }, bar(all.length ? done / all.length : 0)),
        h("span", { class: "muted" }, t("{mastered} of {questions} questions mastered", { mastered: done, questions: all.length })))),
    h("div", { class: "row between" }, sizeButtons(), skipSwitch()),
    notice && h("div", { class: "notice", role: "status" }, notice),
    h("p", { class: "muted" }, t("Choose a list, then start with any exercise type; the next types follow by themselves.")),
    KINDS.map(([kind, heading, text]) => {
      const ofKind = Object.entries(themes).filter(([, theme]) => theme.kind === kind);
      return ofKind.length > 0 && h("section", { class: "stack" },
        h("h2", {}, t(heading)),
        h("p", { class: "muted" }, t(text, { exam: state.info.exam || "" })),
        h("div", { class: "grid" }, ofKind.map(([name, theme]) => themeCard(name, theme, buttons))));
    }));
}
