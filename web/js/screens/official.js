// The official DELE model exams (PLAN 9.11), in an exam room: the pages of one part, a timer you
// can pause, and for reading and listening an answer sheet that is marked with the official key.
// The files are private (account.js: examIndex, examUrls), made by exams/export_dele.py.
//
//   #/<course>/exams/official/A2            the exam: its parts, results, the PDF
//   #/<course>/exams/official/A2/reading    doing one part
//   #/<course>/exams/official/A2/reading/result

import { t } from "../text.js";
import { h, bar } from "../ui.js";
import { state, saveLog } from "../state.js";
import * as store from "../store.js";
import { examIndex, examUrls, examDownloadUrl } from "../account.js";

const CERVANTES = "https://examenes.cervantes.es/";
let index = null; // index.json, loaded once per visit

export async function loadIndex() {
  if (!index) index = await examIndex();
  return index;
}

const examOf = (level) => index?.exams.find((exam) => exam.level === level);
const pagePaths = (exam, [first, last]) => Array.from({ length: last - first + 1 }, (_, i) => `${exam.folder}/p${String(first + i).padStart(2, "0")}.jpg`);

// ---------- results, in the study log ----------
function results(level) {
  return ((state.log.official || {})[level]) || {};
}

function saveResult(exam, part, result) {
  state.log.official ??= {};
  (state.log.official[exam.level] ??= {})[part.id] = { ...result, date: store.today() };
  // All parts done: the plan counts this level's official mock exam as done
  const done = results(exam.level);
  if (!exam.examples_only && exam.parts.every((p) => done[p.id])) {
    state.log.mocks ??= [];
    if (!state.log.mocks.some((m) => m.level === exam.level && m.number === 1)) {
      const keyed = exam.parts.filter((p) => done[p.id].total);
      const right = keyed.reduce((sum, p) => sum + done[p.id].right, 0), total = keyed.reduce((sum, p) => sum + done[p.id].total, 0);
      state.log.mocks.push({ level: exam.level, number: 1, date: store.today(), right, total,
                             percent: total ? Math.round((100 * right) / total) : null, official: true });
    }
  }
  saveLog();
}

// ---------- the running part, kept for this browser tab ----------
const runKey = () => `official/${state.course}`;
function loadRun() { try { return JSON.parse(sessionStorage.getItem(runKey())); } catch { return null; } }
function saveRun(run) { try { sessionStorage.setItem(runKey(), JSON.stringify(run)); } catch { /* ignore */ } }

const elapsed = (run) => run.spent + (run.running ? Date.now() - run.started : 0);
const clock = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), seconds = total % 60;
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(seconds).padStart(2, "0")}`;
};

// The letters to choose from for each question: A–C, or up to the last letter a task uses (A–J)
function optionsFor(part, task) {
  let last = "C";
  for (let n = task[0]; n <= task[1]; n++) { const letter = part.answers?.[n]; if (letter && letter > last) last = letter; }
  return Array.from({ length: last.charCodeAt(0) - 64 }, (_, i) => String.fromCharCode(65 + i));
}

// ---------- the overview of one exam ----------
export async function overviewScreen(level) {
  await loadIndex();
  const exam = examOf(level);
  const base = `#/${state.course}/exams`;
  if (!exam) return h("section", { class: "card" }, h("p", {}, t("This exam is not available.")), h("a", { class: "button", href: base }, t("Back")));
  const done = results(level);
  const running = loadRun();
  const partRow = (part) => {
    const result = done[part.id];
    const questions = part.answers ? Object.keys(part.answers).length : 0;
    const about = [t("{minutes} min", { minutes: part.minutes })];
    if (part.prepare) about.push(t("+ {minutes} min to prepare", { minutes: part.prepare }));
    if (questions) about.push(t("{count} questions", { count: questions }));
    if (part.kind === "writing") about.push(t("{count} texts", { count: part.texts }));
    const carryOn = running && running.level === level && running.part === part.id;
    return h("div", { class: "unit" },
      h("div", { class: `number ${result ? "done" : "new"}` }, exam.parts.indexOf(part) + 1),
      h("div", { class: "about" },
        h("div", { class: "title" }, part.name),
        h("div", { class: "muted" }, about.join(" · "),
          result ? ` · ${result.total ? t("{right} of {total} right on {date}", { right: result.right, total: result.total, date: result.date }) : t("done on {date}", { date: result.date })}` : "")),
      h("div", { class: "actions" },
        h("a", { class: carryOn ? "button small primary" : "button small", href: `${base}/official/${level}/${part.id}` },
          carryOn ? t("Carry on") : result ? t("Do again") : t("Start"))));
  };
  const pdf = h("button", { type: "button", class: "button", onclick: async () => {
    location.href = await examDownloadUrl(`${exam.folder}/exam.pdf`, `DELE-${level}-modelo-0.pdf`);
  } }, t("Download the PDF"));
  return h("div", { class: "stack" },
    h("nav", { class: "breadcrumb", "aria-label": t("You are here") },
      h("a", { href: base }, t("Mock exams")), h("span", { "aria-hidden": "true" }, "/"), h("span", {}, exam.title)),
    h("section", { class: "card big" },
      h("div", { class: "eyebrow" }, t("Official model exam")),
      h("h1", {}, exam.title),
      h("p", { class: "lead" }, exam.examples_only
        ? t("This file explains the exam with one example per task. Use it to get to know the parts and the timing.")
        : t("Do the parts one by one, each with its own time, like on the day of the exam. Reading and listening are marked with the official key.")),
      h("div", { class: "row" }, pdf)),
    h("section", { class: "card flush" },
      h("div", { class: "list-head" }, h("div", { style: "font-weight: 600" }, t("The parts"))),
      exam.parts.map(partRow)),
    exam.parts.some((p) => p.transcript) && h("p", { class: "muted" },
      t("The audio of the listening part is not on the site. You can play it from the website of the Instituto Cervantes, or read the transcript in the exam room instead."), " ",
      h("a", { href: CERVANTES, target: "_blank", rel: "noopener" }, "examenes.cervantes.es")),
    h("p", { class: "muted" }, t("To pass a DELE exam you need 60% in each group of parts. These model exams are the property of the Instituto Cervantes and are only here for your own practice.")));
}

// ---------- doing one part ----------
let ticker = null;

export async function partScreen(level, partId) {
  await loadIndex();
  const exam = examOf(level);
  const part = exam?.parts.find((p) => p.id === partId);
  const base = `#/${state.course}/exams/official/${level}`;
  if (!part) { location.hash = `#/${state.course}/exams`; return h("div"); }
  let run = loadRun();
  if (!run || run.level !== level || run.part !== partId) {
    run = { level, part: partId, started: Date.now(), spent: 0, running: true, answers: {}, texts: [], notes: "",
            phase: part.prepare ? "prepare" : "work", transcript: false };
    saveRun(run);
  }
  document.body.classList.add("exam-room");
  const limit = () => (run.phase === "prepare" ? part.prepare : part.minutes) * 60000;

  // The pages of this part (or of the transcript), as pictures
  const range = run.transcript && part.transcript ? part.transcript : part.pages;
  const urls = await examUrls(pagePaths(exam, range));
  const pages = h("div", { class: "exam-pages" }, urls.map((url, i) =>
    h("img", { src: url, alt: t("Page {page}", { page: range[0] + i }), loading: i < 2 ? "eager" : "lazy" })));

  // The bar at the top: the part, the time left, pause and finish
  const time = h("span", { class: "exam-clock", "aria-live": "off" });
  const pauseButton = h("button", { type: "button", class: "button small", onclick: () => {
    if (run.running) { run.spent += Date.now() - run.started; run.running = false; }
    else { run.started = Date.now(); run.running = true; }
    saveRun(run); state.render();
  } }, run.running ? t("Pause") : t("Carry on"));
  const finish = () => {
    if (!confirm(t("Finish this part? You can't change your answers afterwards."))) return;
    let result = { done: true };
    if (part.answers) {
      const total = Object.keys(part.answers).length;
      const right = Object.entries(part.answers).filter(([n, letter]) => run.answers[n] === letter).length;
      result = { right, total, percent: Math.round((100 * right) / total) };
    }
    saveResult(exam, part, result);
    sessionStorage.setItem(`official-result/${state.course}`, JSON.stringify({ level, part: partId, answers: run.answers, texts: run.texts }));
    sessionStorage.removeItem(runKey());
    location.hash = `${base}/${partId}/result`;
  };
  const tick = () => {
    if (!time.isConnected) { // not on the screen yet, or the page was left
      if (time.dataset.shown) { clearInterval(ticker); ticker = null; }
      else if (Date.now() - built > 30000) clearInterval(ticker); // never shown
      return;
    }
    time.dataset.shown = "1";
    const left = limit() - elapsed(run);
    time.textContent = left > 0 ? clock(left) : t("Time is up");
    time.classList.toggle("over", left <= 0);
    if (run.phase === "prepare" && left <= 0) { run.phase = "work"; run.spent = 0; run.started = Date.now(); saveRun(run); state.render(); }
  };
  const built = Date.now();
  clearInterval(ticker);
  ticker = setInterval(tick, 250);
  state.afterRender = tick; // straight away once the page is shown

  const top = h("div", { class: "exam-bar" },
    h("div", { class: "exam-title" }, h("strong", {}, exam.title), h("span", {}, part.name)),
    h("div", { class: "exam-time" },
      run.phase === "prepare" && h("span", { class: "small" }, t("Preparation")), time, pauseButton,
      h("button", { type: "button", class: "button small primary", onclick: finish }, t("Finish part")),
      h("a", { class: "button small", href: base, onclick: () => { run.spent = elapsed(run); run.running = false; saveRun(run); } }, t("Leave"))));

  // What you fill in: an answer sheet, texts, or notes for speaking
  let side;
  if (part.kind === "choices") {
    const pick = (n, letter) => { run.answers[n] = run.answers[n] === letter ? undefined : letter; saveRun(run); state.render(); };
    const answered = Object.values(run.answers).filter(Boolean).length;
    side = h("section", { class: "card exam-sheet", id: "answer-sheet" },
      h("div", { class: "row between" }, h("strong", {}, t("Answer sheet")),
        h("span", { class: "muted small" }, t("{done} of {total}", { done: answered, total: Object.keys(part.answers).length }))),
      part.tasks.map((task, i) => h("div", { class: "exam-task" },
        h("div", { class: "muted small" }, t("Task {number}", { number: i + 1 }), ` · ${task[0]}–${task[1]}`),
        Array.from({ length: task[1] - task[0] + 1 }, (_, k) => task[0] + k).map((n) =>
          h("div", { class: "exam-question" }, h("span", { class: "exam-number" }, n),
            h("div", { class: "exam-options", role: "group", "aria-label": t("Question {number}", { number: n }) },
              optionsFor(part, task).map((letter) => h("button", { type: "button", "aria-pressed": String(run.answers[n] === letter),
                onclick: () => pick(n, letter) }, letter))))))),
      part.transcript && h("button", { type: "button", class: "button small", onclick: () => { run.transcript = !run.transcript; saveRun(run); state.render(); } },
        run.transcript ? t("Show the questions") : t("No audio? Read the transcript")));
  } else if (part.kind === "writing") {
    run.texts.length = Math.max(run.texts.length, part.texts);
    side = h("section", { class: "card exam-sheet" }, h("strong", {}, t("Your texts")),
      Array.from({ length: part.texts }, (_, i) => {
        const count = h("span", { class: "muted small" });
        const words = () => { count.textContent = t("{count} words", { count: (run.texts[i] || "").split(/\s+/).filter(Boolean).length }); };
        const box = h("textarea", { class: "exam-text", rows: 10, lang: "es", "aria-label": t("Task {number}", { number: i + 1 }),
          oninput: (event) => { run.texts[i] = event.target.value; saveRun(run); words(); } });
        box.value = run.texts[i] || "";
        words();
        return h("div", { class: "stack", style: "gap: 6px" }, h("span", { class: "small" }, t("Task {number}", { number: i + 1 })), box, count);
      }),
      h("p", { class: "muted small" }, t("Afterwards you can ask the AI helper or a teacher to look at your texts.")));
  } else {
    const notes = h("textarea", { class: "exam-text", rows: 8, lang: "es", "aria-label": t("Notes"),
      oninput: (event) => { run.notes = event.target.value; saveRun(run); } });
    notes.value = run.notes || "";
    side = h("section", { class: "card exam-sheet" },
      h("strong", {}, part.kind === "speaking" ? (run.phase === "prepare" ? t("Prepare") : t("Speak")) : t("Notes")),
      part.kind === "speaking" && h("p", { class: "muted small" }, run.phase === "prepare"
        ? t("Prepare the tasks and make notes. When the time is up, the speaking time starts by itself.")
        : t("Speak out loud, as if the examiner were listening. Recording yourself on your phone helps you hear your mistakes.")),
      part.kind === "speaking" && run.phase === "prepare" && h("button", { type: "button", class: "button small", onclick: () => {
        run.phase = "work"; run.spent = 0; run.started = Date.now(); run.running = true; saveRun(run); state.render();
      } }, t("Start speaking now")),
      notes);
  }

  const paused = !run.running && h("div", { class: "exam-paused" },
    h("p", {}, t("The exam is paused.")),
    h("button", { type: "button", class: "button primary large", onclick: () => { run.started = Date.now(); run.running = true; saveRun(run); state.render(); } }, t("Carry on")));
  document.title = `${exam.title} · ${part.name}`;
  // On a phone the answer sheet is below the pages: this button jumps between the two
  const jump = part.kind === "choices" && h("button", { type: "button", class: "button primary exam-jump", onclick: () => {
    const sheet = document.getElementById("answer-sheet");
    if (sheet.getBoundingClientRect().top > window.innerHeight / 2) sheet.scrollIntoView({ behavior: "smooth" });
    else window.scrollTo({ top: 0, behavior: "smooth" });
  } }, t("Answer sheet"));
  return h("div", { class: "exam-room-page" }, top,
    h("div", { class: "exam-body" }, h("div", { class: "exam-reading" }, paused || pages), side), jump);
}

// ---------- the result of one part ----------
export async function resultScreen(level, partId) {
  await loadIndex();
  const exam = examOf(level);
  const part = exam?.parts.find((p) => p.id === partId);
  const result = results(level)[partId];
  const base = `#/${state.course}/exams/official/${level}`;
  if (!part || !result) { location.hash = base; return h("div"); }
  let last = null;
  try { last = JSON.parse(sessionStorage.getItem(`official-result/${state.course}`)); } catch { /* none */ }
  const answers = last && last.level === level && last.part === partId ? last.answers : {};
  const next = exam.parts[exam.parts.indexOf(part) + 1];
  return h("div", { class: "stack" },
    h("section", { class: "card big" },
      h("div", { class: "eyebrow" }, `${exam.title} · ${part.name}`),
      result.total
        ? [h("div", { class: "big-number" }, `${result.percent}%`),
           h("p", { class: "lead" }, t("{right} of {total} right", result)), bar(result.percent / 100),
           h("p", { class: "muted" }, result.percent >= 60 ? t("That is a pass level (60%) for this part.") : t("The pass level is 60%. Look at the questions you missed below."))]
        : h("p", { class: "lead" }, t("Done. Compare your work with the task: did you cover every point, with the number of words asked?")),
      h("div", { class: "row" },
        next && h("a", { class: "button primary", href: `${base}/${next.id}` }, t("Next part: {name}", { name: next.name })),
        h("a", { class: "button", href: base }, t("Back to the exam")))),
    part.answers && h("section", { class: "card" },
      h("h2", {}, t("Your answers")),
      h("div", { class: "exam-key" }, Object.entries(part.answers).map(([n, letter]) => {
        const mine = answers[n];
        return h("div", { class: mine === letter ? "right" : "wrong" }, h("span", { class: "exam-number" }, n),
          h("strong", {}, letter), mine && mine !== letter ? h("span", { class: "muted small" }, ` ${t("you")}: ${mine}`) : !mine ? h("span", { class: "muted small" }, " –") : null);
      }))));
}

// ---------- the list on the mock exams page ----------
export async function officialCard() {
  if (state.info.learn !== "es") return null; // only the DELE exams so far
  await loadIndex();
  const base = `#/${state.course}/exams/official`;
  if (!index) return h("section", { class: "card" }, h("h2", {}, t("Official model exams")),
    h("p", { class: "muted" }, t("The official DELE model exams are not on the site yet.")));
  return h("section", { class: "card" }, h("h2", {}, t("Official model exams")),
    h("p", { class: "muted" }, t("The DELE model exams of the Instituto Cervantes, part by part, with a timer and the official key.")),
    h("div", { class: "stack", style: "gap: 8px" }, index.exams.map((exam) => {
      const done = results(exam.level);
      const count = exam.parts.filter((p) => done[p.id]).length;
      return h("a", { class: "exam-link", href: `${base}/${exam.level}` },
        h("strong", {}, exam.level), h("span", {}, exam.title.split("·")[1]?.trim() || exam.title),
        h("span", { class: "muted small" }, t("{done} of {total} parts", { done: count, total: exam.parts.length })));
    })));
}
