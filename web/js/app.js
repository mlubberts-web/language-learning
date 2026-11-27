// The start of the site: reads the address after # and shows that screen.
//
//   #/                           choose a course
//   #/es_from_en                 the course home (the levels and units)
//   #/es_from_en/level/B1        the course home, open at level B1
//   #/es_from_en/subjects/tenses the course home, the units about verb tenses
//   #/es_from_en/unit/<id>       the exercises of one unit
//   #/es_from_en/session         a running practice session
//   #/es_from_en/read/<id>/3     page 3 of a unit in the reader
//   #/es_from_en/schedule ...    the other parts of the menu
//
// Every screen is a function in js/screens/ that gets the parts of the address and returns the
// content of the page. After anything changes, render() builds the page again.

import * as data from "./data.js";
import { setLanguages } from "./grading.js";
import { loadLanguage, t } from "./text.js";
import { h, icon } from "./ui.js";
import { state, openCourse, profile } from "./state.js";
import { coursesScreen } from "./screens/courses.js";
import { homeScreen } from "./screens/home.js";
import { unitScreen } from "./screens/unit.js";
import { sessionScreen } from "./screens/session.js";
import { comingScreen } from "./screens/coming.js";
import { readerScreen } from "./screens/reader.js";
import { account, startSession, supabase } from "./account.js";
import * as accountScreens from "./screens/account.js";
import { wordsScreen } from "./screens/words.js";
import { verbsScreen } from "./screens/verbs.js";
import { examsScreen } from "./screens/exams.js";
import { scheduleScreen } from "./screens/schedule.js";
import { progressScreen } from "./screens/progress.js";

const SITE_NAME = "[SITE NAME]"; // the name Menno chooses (PLAN 7.4)

// The menu: [part of the address, text, icon]
const MENU = [["", "Course", "book"], ["schedule", "Schedule", "calendar"], ["progress", "Progress", "chart"], // t-list
              ["words", "Word lists", "list"], ["verbs", "Verbs", "pen"], ["exams", "Mock exams", "clock"]]; // t-list

function header(courseId, part) {
  const box = document.getElementById("header");
  const nav = courseId && h("nav", { class: "main-nav", "aria-label": t("Main menu") },
    MENU.map(([path, text, shape]) => {
      const here = path === "" ? ["", "level", "subjects", "unit", "session", "read"].includes(part) : part === path;
      return h("a", { href: `#/${courseId}${path ? "/" + path : ""}`, "aria-current": here ? "page" : null },
        icon(shape, 22), t(text));
    }));
  const initial = (account.profile?.display_name || account.user?.email || "?").charAt(0).toUpperCase();
  const tools = h("div", { class: "header-tools" },
    courseId && h("a", { class: "button small", href: "#/", title: t("Choose another course") },
      state.info ? courseName() : "", icon("down", 14)),
    account.user && h("a", { class: "avatar", href: "#/account", "aria-label": t("Your account") }, initial));
  box.replaceChildren(h("div", { class: "inner" },
    h("a", { class: "brand", href: courseId ? `#/${courseId}` : "#/" }, SITE_NAME), nav, tools));
  // During a session the header gives way to the session bar
  box.hidden = part === "session";
}

// The language you learn, named in the interface language: "Spanish", "Spaans", "neerlandés"
function courseName() {
  const name = state.languageNames?.[state.info.learn]?.[state.info.explained_in] || state.info.title;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export async function render() {
  const [courseId, part = "", ...rest] = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  const main = document.getElementById("main");
  try {
    // Pages about your account, at the top level of the address (#/login, #/account ...)
    const pages = { login: accountScreens.loginScreen, signup: accountScreens.signupScreen, forgot: accountScreens.forgotScreen,
                    "new-password": accountScreens.newPasswordScreen, privacy: accountScreens.privacyScreen,
                    account: accountScreens.accountScreen, admin: accountScreens.adminScreen };
    const open = ["login", "signup", "forgot", "new-password", "privacy"]; // reachable without logging in
    if (!OFFLINE && !account.user && !open.includes(courseId)) { location.hash = "#/login"; return; }
    if (!OFFLINE && account.user && account.profile && !account.profile.has_access && !["account", "privacy", "new-password"].includes(courseId)) {
      header(null, ""); main.className = "";
      main.replaceChildren(await accountScreens.noAccessScreen()); return;
    }
    if (courseId in pages) {
      if (!state.info) await loadLanguage(profile().ui_lang || guessLanguage());
      header(null, ""); main.className = "";
      main.replaceChildren(await pages[courseId]());
      return;
    }
    if (!courseId) {
      await loadLanguage(profile().ui_lang || guessLanguage());
      header(null, "");
      main.className = "";
      main.replaceChildren(await coursesScreen());
      document.title = SITE_NAME;
      return;
    }
    await openCourse(courseId);
    header(courseId, part);
    const screens = { "": homeScreen, level: homeScreen, subjects: homeScreen, unit: unitScreen, session: sessionScreen, read: readerScreen,
                      words: wordsScreen, verbs: verbsScreen, exams: examsScreen, schedule: scheduleScreen, progress: progressScreen };
    const screen = screens[part] || comingScreen;
    main.className = part === "session" || (part === "exams" && rest[0] === "run") ? "narrow" : "";
    document.body.classList.remove("exam-room"); // the exam room (official.js) sets it again
    const content = await screen(part, ...rest);
    main.replaceChildren(content);
    if (state.afterRender) { state.afterRender(); state.afterRender = null; } // e.g. put the cursor in the answer box
  } catch (problem) {
    console.error(problem);
    main.replaceChildren(h("div", { class: "card" }, h("h1", {}, t("Something went wrong")),
      h("p", {}, t("Reload the page in a moment. If it keeps happening, please let us know.")),
      h("p", { class: "muted" }, String(problem.message || problem))));
  }
}

// The interface language before a course is chosen: the browser's own language, if we have it.
function guessLanguage() {
  const code = (navigator.language || "en").slice(0, 2);
  return ["nl", "es"].includes(code) ? code : "en";
}

// Scrolls to the top when the screen changes, not when the same screen is built again.
let lastScreen = "";
function scrollWhenNew() {
  const screen = location.hash.split("?")[0];
  if (screen !== lastScreen) window.scrollTo(0, 0);
  lastScreen = screen;
}

// ?offline in the address: no account, results only in this browser (for trying things out and
// for the automatic tests on your own computer).
const OFFLINE = new URLSearchParams(location.search).has("offline");

async function start() {
  if (!OFFLINE) {
    await startSession();
    // The link in a "forgot your password" email logs you in for a moment to choose a new one.
    supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") location.hash = "#/new-password"; });
  }
  const languages = await data.languages();
  setLanguages(languages);
  state.languageNames = languages.names;
  window.addEventListener("hashchange", () => { scrollWhenNew(); render(); });
  state.render = render; // so screens can ask for a new render after a click
  await render();
}

start();
