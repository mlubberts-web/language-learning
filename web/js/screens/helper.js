// The AI helper next to the theory (PLAN 9.12, design A): a panel beside the text where you ask
// about the chapter you are reading. The server part (worker/index.js) sends the question and the
// chapter to Claude and counts it: 50 questions a day. On a phone the panel is a sheet that a
// button opens. The conversation is kept for this browser tab, per chapter.

import { t } from "../text.js";
import { h } from "../ui.js";
import { state } from "../state.js";
import { account, askHelper, helperUsage } from "../account.js";

const ERRORS = {
  NOT_LOGGED_IN: "Log in again to ask questions.", // t-list
  NO_ACCESS: "Your account has no access at the moment.", // t-list
  DAILY_LIMIT: "You have asked 50 questions today. The helper is back tomorrow.", // t-list
  BUSY: "The helper is busy. Try again in a minute.", // t-list
  OFFLINE: "No connection. Check your internet and try again.", // t-list
  OTHER: "Something went wrong. Try again in a moment.", // t-list
};

const storeKey = (unitId) => `helper/${state.course}/${unitId}`;
function loadChat(unitId) {
  try { return JSON.parse(sessionStorage.getItem(storeKey(unitId))) || []; } catch { return []; }
}
function saveChat(unitId, chat) {
  try { sessionStorage.setItem(storeKey(unitId), JSON.stringify(chat.slice(-20))); } catch { /* full: kept on screen only */ }
}

// "**word**" -> bold; lines starting with "- " -> a list; empty lines -> paragraphs
function answerText(text) {
  const box = h("div", { class: "helper-text" });
  const inline = (line) => line.split(/(\*\*[^*]+\*\*)/).filter(Boolean)
    .map((part) => (/^\*\*[^*]+\*\*$/.test(part) ? h("strong", {}, part.slice(2, -2)) : part));
  let list = null;
  for (const line of text.split("\n")) {
    if (/^\s*[-•]\s+/.test(line)) {
      if (!list) { list = h("ul"); box.append(list); }
      list.append(h("li", {}, inline(line.replace(/^\s*[-•]\s+/, ""))));
    } else {
      list = null;
      if (line.trim()) box.append(h("p", {}, inline(line.trim())));
    }
  }
  return box;
}

export function helperPanel(unit) {
  const chat = loadChat(unit.id); // [{role, content}], only questions that got an answer
  const left = h("span", { class: "muted small" }, t("{limit} questions a day", { limit: 50 }));
  const messages = h("div", { class: "helper-messages", "aria-live": "polite" });
  const input = h("input", { type: "text", id: "helper-question", maxlength: 1000, autocomplete: "off",
    placeholder: t("Type a question about this chapter") });
  const send = h("button", { type: "submit", class: "button primary" }, t("Ask"));
  const panel = h("section", { class: "card helper", "aria-label": t("Ask about this chapter") });
  const loggedIn = Boolean(account.user);

  const bubble = (role, content) => role === "user"
    ? h("div", { class: "helper-question" }, content)
    : h("div", { class: "helper-answer" }, typeof content === "string" ? answerText(content) : content);
  const scrollDown = () => { messages.scrollTop = messages.scrollHeight; };
  const showUsage = (used, limit) => {
    if (typeof used === "number") left.textContent = t("{left} of {limit} left today", { left: Math.max(0, limit - used), limit });
  };

  async function ask(question) {
    question = question.trim();
    if (!question || send.disabled) return;
    input.value = "";
    messages.querySelector(".helper-empty")?.remove();
    messages.append(bubble("user", question));
    const waiting = h("div", { class: "helper-answer waiting" }, t("Thinking…"));
    messages.append(waiting);
    scrollDown();
    send.disabled = true;
    const reply = await askHelper(state.course, unit.id, question, chat);
    send.disabled = false;
    waiting.remove();
    if (reply.answer) {
      chat.push({ role: "user", content: question }, { role: "assistant", content: reply.answer });
      saveChat(unit.id, chat);
      messages.append(bubble("assistant", reply.answer));
    } else {
      messages.append(h("div", { class: "helper-answer problem" }, t(ERRORS[reply.error] || ERRORS.OTHER)));
    }
    showUsage(reply.used, reply.limit);
    scrollDown();
    input.focus();
  }

  if (chat.length) for (const message of chat) messages.append(bubble(message.role, message.content));
  else messages.append(h("div", { class: "helper-empty" },
    h("p", {}, t("Ask anything about this chapter. The helper reads it with you.")),
    h("div", { class: "row", style: "gap: 8px" },
      [t("Explain the main rule more simply"), t("Give me another example")].map((text) =>
        h("button", { type: "button", class: "chip-button", disabled: !loggedIn, onclick: () => ask(text) }, text)))));

  const form = h("form", { class: "helper-form", onsubmit: (event) => { event.preventDefault(); ask(input.value); } },
    h("label", { for: "helper-question", class: "muted small" }, t("Your question")),
    h("div", { class: "row", style: "gap: 8px; flex-wrap: nowrap" }, input, send),
    h("span", { class: "muted small" }, loggedIn
      ? t("The helper is an AI and can make mistakes. It only sees this chapter.")
      : t("Log in to ask questions.")));
  if (!loggedIn) { input.disabled = true; send.disabled = true; }

  const close = h("button", { type: "button", class: "helper-close", "aria-label": t("Close"),
    onclick: () => panel.classList.remove("open") }, "×");
  panel.append(
    h("div", { class: "helper-head" },
      h("div", { class: "stack", style: "gap: 2px" }, h("strong", {}, t("Ask about this chapter")), left),
      close),
    messages, form);
  if (loggedIn) helperUsage().then((r) => showUsage(r.used, r.limit));
  requestAnimationFrame(scrollDown);

  // On a phone: a button at the bottom of the screen opens the panel as a sheet
  const opener = h("button", { type: "button", class: "button primary helper-opener",
    onclick: () => { panel.classList.add("open"); input.focus(); } }, t("Ask a question"));
  return { panel, opener };
}
