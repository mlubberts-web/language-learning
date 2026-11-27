// Choosing a course, in two steps: "I speak …" (the language the course explains things in, and
// the language of the site) and "I want to learn …" (the language of the course).
// Your last course stays at the top, so you can carry on with one click.

import * as data from "../data.js";
import { t, loadLanguage } from "../text.js";
import { h } from "../ui.js";
import { profile, saveProfile } from "../state.js";

// The languages you can speak, in the order shown, each with its name in itself
const SPOKEN = ["en", "nl", "es"];

export async function coursesScreen() {
  const [all, languages] = await Promise.all([data.courses(), data.languages()]);
  const names = languages.names;
  const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  const nameIn = (code, inLanguage) => capital(names[code][inLanguage]);
  const saved = profile();
  const lastCourse = all.find((course) => course.id === saved.last);
  // The language you speak: chosen before, or the one of your last course, or the site's language
  const speak = saved.speak || lastCourse?.explained_in || saved.ui_lang || null;

  const choose = async (code) => {
    saveProfile({ speak: code, ui_lang: code });
    await loadLanguage(code); // the site speaks your language straight away
    document.documentElement.lang = code;
    const main = document.getElementById("main");
    main.replaceChildren(await coursesScreen());
  };

  // Step 1: I speak …
  const step1 = h("section", { class: "stack", style: "gap: 12px" },
    h("div", { class: "step-label" }, h("span", { class: "step-number" }, "1"), t("I speak")),
    h("div", { class: "choice-row", role: "group", "aria-label": t("I speak") },
      SPOKEN.map((code) => h("button", { type: "button", class: "choice", "aria-pressed": String(code === speak), lang: code,
        onclick: () => choose(code) }, nameIn(code, code)))));

  // Step 2: I want to learn … (the courses explained in the language you speak)
  const offered = speak ? all.filter((course) => course.explained_in === speak) : [];
  const card = (course) =>
    h("a", { class: "card course-card", href: `#/${course.id}` },
      h("div", { class: "language" }, nameIn(course.learn, speak)),
      h("p", { class: "lead" }, course.subtitle),
      h("p", { class: "muted" }, t("From A1 to C2 · goal: the {exam} exam", { exam: course.exam })),
      h("p", { class: "muted" }, t("{units} chapters · {questions} practice questions",
        { units: course.units, questions: course.questions.toLocaleString(speak) })),
      course.id === saved.last && h("div", { class: "eyebrow", style: "color: var(--accent)" }, t("Your last course")));
  const step2 = speak && h("section", { class: "stack", style: "gap: 12px" },
    h("div", { class: "step-label" }, h("span", { class: "step-number" }, "2"), t("I want to learn")),
    h("div", { class: "grid" }, offered.map(card)));

  const carryOn = lastCourse && h("a", { class: "card carry-on", href: `#/${lastCourse.id}` },
    h("div", {},
      h("div", { class: "eyebrow" }, t("Continue with your course")),
      h("div", { class: "language", style: "font-size: 22px" }, nameIn(lastCourse.learn, lastCourse.explained_in)),
      h("div", { class: "muted" }, t("Explained in {language}", { language: names[lastCourse.explained_in][lastCourse.explained_in] }))),
    h("span", { class: "button primary" }, t("Continue")));

  return h("div", { class: "stack", style: "gap: 28px" },
    h("div", { class: "stack", style: "gap: 8px" },
      h("h1", {}, t("Choose your course")),
      h("p", { class: "lead" }, t("Every course goes from A1 to C2. First choose the language you speak: the explanations and the site are in that language. Then choose the language you want to learn."))),
    carryOn, step1, step2);
}
