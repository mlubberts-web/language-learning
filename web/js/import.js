// Bringing in results from the Streamlit app: its backup file ({"progress", "practice",
// "study_log"}) or its separate results files (progress.json, es_from_en_practice.json ...).
// Practice results and the study log use the same names for questions and units here, so they
// come over as they are. Reading progress is counted in PDF pages there and in web pages here,
// so it is converted: finished stays finished, half-read keeps its share of the pages.

import * as store from "./store.js";

const PARTS = ["progress", "practice", "study_log"];
// The deadlines the Streamlit app used for everyone who hadn't set their own (study_plan.py)
const APP_DEADLINES = [{ level: "B2", date: "2026-12-04" }, { level: "C2", date: "2027-01-20" }];

// Which part a file holds, from its name, or null. Files of another course are refused.
function partOf(fileName, course) {
  for (const part of PARTS) {
    if (fileName === `${part}.json` || fileName === `${course}_${part}.json`) return part;
  }
  return null;
}

// Reads the chosen files: returns {progress?, practice?, study_log?}
export async function readFiles(files, course) {
  const found = {};
  for (const file of files) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { continue; } // not a JSON file
    const part = partOf(file.name, course);
    if (part) found[part] = data;
    else if (data && typeof data === "object" && PARTS.some((p) => p in data)) {
      for (const p of PARTS) if (p in data) found[p] = data[p];
    }
  }
  return found;
}

// Reading progress from PDF pages to web pages. catalog: the units, with pages (PDF) and web_pages.
export function convertProgress(progress, catalog) {
  const units = Object.fromEntries(catalog.map((unit) => [unit.id, unit]));
  const result = {};
  for (const [id, entry] of Object.entries(progress || {})) {
    const unit = units[id];
    if (!unit) continue; // a unit this course doesn't have
    const seen = entry.seen || [];
    const web = unit.web_pages || 1;
    const done = Boolean(entry.done) || seen.length >= (unit.pages || 1);
    const count = done ? web : Math.min(web - 1, Math.round((seen.length / (unit.pages || 1)) * web));
    result[id] = { seen: [...Array(Math.max(count, seen.length ? 1 : 0)).keys()], last_page: 0, done, updated: entry.updated ?? null };
  }
  return result;
}

// Puts the parts in place of the results of this course. Returns a short summary.
export function applyImport(found, course, catalog) {
  const summary = {};
  if (found.progress) {
    const progress = store.load(course, "progress");
    for (const key of Object.keys(progress)) delete progress[key];
    Object.assign(progress, convertProgress(found.progress, catalog));
    store.save(course, "progress");
    summary.units = Object.keys(progress).length;
  }
  if (found.practice) {
    const practice = store.load(course, "practice");
    for (const key of Object.keys(practice)) delete practice[key];
    Object.assign(practice, { items: {}, scores: {}, ...found.practice });
    store.save(course, "practice");
    summary.questions = Object.keys(practice.items).length;
  }
  if (found.study_log) {
    const log = store.load(course, "study_log");
    for (const key of Object.keys(log)) delete log[key];
    Object.assign(log, found.study_log);
    if (!log.deadlines || !log.deadlines.length) log.deadlines = APP_DEADLINES; // the plan stays the same
    store.save(course, "study_log");
    summary.days = Object.keys(log.days || {}).length;
  }
  return summary;
}
