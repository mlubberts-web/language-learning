// What the site knows during a visit: the open course and your results for it.
// Screens read and change 'state', then call state.render() to show the change.

import * as data from "./data.js";
import * as store from "./store.js";
import { loadLanguage } from "./text.js";

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
export function profile() {
  try { return JSON.parse(localStorage.getItem("results/profile")) || {}; } catch { return {}; }
}

export function saveProfile(changes) {
  try { localStorage.setItem("results/profile", JSON.stringify({ ...profile(), ...changes })); } catch { /* ignore */ }
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
