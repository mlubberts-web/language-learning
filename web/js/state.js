// What the site knows during a visit: the open course and your results for it.
// Screens read and change 'state', then call state.render() to show the change.

import * as data from "./data.js";
import * as store from "./store.js";
import { loadLanguage } from "./text.js";
import { account, saveResult } from "./account.js";

export const state = {
  course: null,    // the id of the open course, like "es_from_en"
  info: null,      // that course's entry in courses.json (languages, exercise types ...)
  catalog: [],     // its units
  practice: null,  // your practice results (store.js)
  log: null,       // your study log
  progress: null,  // your reading progress
  drill: null,     // the running practice session, or null
  render: null,    // app.js puts its render function here
  afterRender: null,
};

// ---------- the profile: your last course and interface language, in this browser ----------
// Logged in it is a row "profile" in the database, otherwise kept in this browser.
export function profile() {
  if (account.user) return account.results.profile || {};
  try { return JSON.parse(localStorage.getItem("results/profile")) || {}; } catch { return {}; }
}

export function saveProfile(changes) {
  const updated = { ...profile(), ...changes };
  if (account.user) { saveResult("profile", updated); return; }
  try { localStorage.setItem("results/profile", JSON.stringify(updated)); } catch { /* ignore */ }
}

// After logging in or out: start again with nothing open.
export function resetState() {
  store.forget();
  Object.assign(state, { course: null, info: null, catalog: [], practice: null, log: null, progress: null, drill: null });
}

export async function openCourse(courseId) {
  if (state.course === courseId) return;
  const all = await data.courses();
  const info = all.find((entry) => entry.id === courseId);
  if (!info) throw new Error(`No course called ${courseId}`);
  state.course = courseId;
  state.info = info;
  state.catalog = await data.catalog(courseId);
  state.practice = store.load(courseId, "practice");
  state.log = store.load(courseId, "study_log");
  state.progress = store.load(courseId, "progress");
  state.drill = loadDrill(courseId);
  await loadLanguage(info.explained_in); // the interface speaks the language of the explanations
  document.documentElement.lang = info.explained_in;
  saveProfile({ last: courseId });
}

export const savePractice = () => store.save(state.course, "practice");
export const saveLog = () => store.save(state.course, "study_log");
export const saveProgress = () => store.save(state.course, "progress");

// A running session is kept for this browser tab, so a reload carries on where you were.
export function saveDrill() {
  try { sessionStorage.setItem(`drill/${state.course}`, JSON.stringify(state.drill)); } catch { /* ignore */ }
}

function loadDrill(courseId) {
  try { return JSON.parse(sessionStorage.getItem(`drill/${courseId}`)); } catch { return null; }
}

// The title of an exercise type in this course, without emoji
export function modeTitle(mode) {
  const found = state.info.modes.find((m) => m.id === mode);
  return found ? found.title.replace(/^[^\p{L}\p{N}¿¡]+/u, "") : mode;
}

export const unitById = (id) => state.catalog.find((unit) => unit.id === id);

// ---------- where you left off, for the continue button on the home page ----------
// Per course: what you did last, "read" (the theory of a chapter) or "practise" (its exercises).
// Kept in the profile, so it is the same on your phone and your laptop.
export function setPlace(kind, unitId) {
  const places = profile().places || {};
  const old = places[state.course];
  if (old && old.kind === kind && old.unit === unitId) return; // nothing new: no save needed
  saveProfile({ places: { ...places, [state.course]: { kind, unit: unitId, time: new Date().toISOString().slice(0, 19) } } });
}

export const place = () => (profile().places || {})[state.course] || null;
