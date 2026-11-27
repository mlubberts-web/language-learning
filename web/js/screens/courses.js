// Choosing a course: the six courses, each in the language of its explanations.

import * as data from "../data.js";
import { t } from "../text.js";
import { h } from "../ui.js";
import { profile } from "../state.js";

export async function coursesScreen() {
  const [all, languages] = await Promise.all([data.courses(), data.languages()]);
  const names = languages.names;
  const last = profile().last;
  const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  const card = (course) =>
    h("a", { class: "card course-card", href: `#/${course.id}` },
      h("div", { class: "eyebrow" }, capital(names[course.explained_in][course.explained_in])),
      h("div", { class: "language" }, capital(names[course.learn][course.explained_in])),
      h("p", { class: "lead" }, course.subtitle),
      h("p", { class: "muted" }, t("{units} chapters · {questions} practice questions",
        { units: course.units, questions: course.questions.toLocaleString(course.explained_in) })),
      course.id === last && h("div", { class: "eyebrow", style: "color: var(--accent)" }, t("Your last course")));
  return h("div", { class: "stack" },
    h("h1", {}, t("What do you want to learn?")),
    h("p", { class: "lead" }, t("Each language is taught from A1 to C2, explained in English, Dutch or Spanish.")),
    h("div", { class: "grid" }, all.map(card)));
}
