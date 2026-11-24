// For the parts of the menu that are still being built (PLAN 8.6): the reader, word lists,
// mock exams, schedule and progress. Replaced one by one by their real screens.

import { t } from "../text.js";
import { h } from "../ui.js";
import { state } from "../state.js";

export async function comingScreen(part) {
  return h("section", { class: "card big" },
    h("div", { class: "eyebrow" }, t("Coming soon")),
    h("h1", {}, t("This part is being built")),
    h("p", { class: "lead" }, t("The exercises already work. Until this part is ready, use the current app for it.")),
    h("div", { class: "row" }, h("a", { class: "button primary", href: `#/${state.course}` }, t("Back to the course"))));
}
