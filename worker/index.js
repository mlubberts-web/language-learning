// The website's small server part, on Cloudflare (wrangler.jsonc). Everything in web/ is served
// as it is; only addresses under /api/ come here. One thing lives here: the AI helper next to the
// theory (PLAN 9.12), because it needs a secret key that must never reach the browser.
//
// POST /api/ask   {course, unit, question, history: [{role: "user"|"assistant", content}]}
//                 with the person's login (Authorization: Bearer <Supabase access token>)
//              -> {answer, used, limit}  or  {error: "NO_ACCESS" | "DAILY_LIMIT" | ...}
// GET  /api/usage -> {used, limit}: how many questions the person asked today
//
// Settings (Cloudflare: the Worker > Settings > Variables and Secrets):
//   ANTHROPIC_API_KEY  a secret: the key from platform.claude.com/settings/keys
//   SUPABASE_URL, SUPABASE_KEY  in wrangler.jsonc (the public address and publishable key)

const MODEL = "claude-haiku-5-5"; // the cheapest Claude model: plenty for questions about a chapter
const DAILY_LIMIT = 50;           // the same number as in supabase/ai_helper.sql
const LANGUAGE_NAMES = { en: "English", nl: "Dutch", es: "Spanish" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ask" && request.method === "POST") return answer(request, env);
    if (url.pathname === "/api/usage" && request.method === "GET") return usage(request, env);
    if (url.pathname.startsWith("/api/")) return json({ error: "NOT_FOUND" }, 404);
    return env.ASSETS.fetch(request); // anything else: the website itself
  },
};

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

// ---------- the login and the daily count, checked by the database ----------
async function rpc(env, token, name) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_KEY, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{}",
  });
  const text = await response.text();
  if (response.ok) return { value: JSON.parse(text) };
  // The function's own errors (NO_ACCESS, DAILY_LIMIT ...) come back in "message"
  let message = "";
  try { message = JSON.parse(text).message || ""; } catch { /* not JSON */ }
  const known = ["NOT_LOGGED_IN", "NO_ACCESS", "DAILY_LIMIT"].find((name) => message.includes(name));
  return { error: known || (response.status === 401 ? "NOT_LOGGED_IN" : "OTHER"), detail: message };
}

const tokenOf = (request) => (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

async function usage(request, env) {
  const token = tokenOf(request);
  if (!token) return json({ error: "NOT_LOGGED_IN" }, 401);
  const result = await rpc(env, token, "ai_used_today");
  if (result.error) return json({ error: result.error }, 403);
  return json({ used: result.value, limit: DAILY_LIMIT });
}

// ---------- the chapter, as plain text for the helper to read ----------
// The theory files are the website's own (web/data/<course>/units/<unit>.json): blocks with texts,
// lists and tables. All texts are taken in order, without the <b> and <i> marks.
function plainText(value, lines) {
  if (typeof value === "string") {
    const text = value.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").replace(/\*([^*]+)\*/g, "$1").trim();
    if (text) lines.push(text);
  } else if (Array.isArray(value)) {
    if (value.every((cell) => typeof cell === "string")) {
      const row = value.map((cell) => cell.replace(/<[^>]+>/g, "").trim()).filter(Boolean).join(" | ");
      if (row) lines.push(row);
    } else for (const part of value) plainText(part, lines);
  } else if (value && typeof value === "object") {
    for (const [key, part] of Object.entries(value)) if (key !== "type" && key !== "style" && key !== "kind") plainText(part, lines);
  }
}

async function chapter(env, course, unit) {
  const [unitFile, coursesFile] = await Promise.all([
    env.ASSETS.fetch(`https://assets.local/data/${course}/units/${unit}.json`),
    env.ASSETS.fetch("https://assets.local/data/courses.json"),
  ]);
  if (!unitFile.ok || !coursesFile.ok) return null;
  const document = await unitFile.json();
  const info = (await coursesFile.json()).find((entry) => entry.id === course);
  if (!info) return null;
  const lines = [];
  plainText(document.meta?.title || "", lines);
  for (const block of document.blocks || []) if (block.type !== "pagebreak") plainText(block, lines);
  return { info, title: document.meta?.title || unit, level: document.meta?.level || "", text: lines.join("\n") };
}

function instructions(info, found) {
  const explained = LANGUAGE_NAMES[info.explained_in], learn = LANGUAGE_NAMES[info.learn];
  const variety = info.learn === "es" ? " The course teaches the Spanish of Spain (vosotros, Spanish vocabulary)."
    : info.learn === "en" ? " The course teaches British English." : "";
  return `You are the helper next to a chapter of an online ${learn} course for people who speak ${explained}.${variety}
The student is reading the chapter "${found.title}" (level ${found.level}) and asks you about it.

How to answer:
- Answer in ${explained}, the student's language. ${learn} examples stay in ${learn}.
- Be short and clear: a few sentences, or a short list. Give one or two examples when that helps.
- Stick to what the chapter teaches and to the student's level; build on its explanations and terms.
- If the question is not about learning ${learn}, say kindly that you only help with this course.
- If you are not sure, say so. Never invent rules.
- Plain text only. You may use **bold** for a word or two and "- " at the start of a line for a list. No headings or tables.`;
}

// ---------- asking Claude (the Messages API, as a plain web request) ----------
async function askClaude(env, info, found, history, question) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2026-10-21", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000, // room for its thinking plus a short answer; the instructions keep answers short
      output_config: { effort: "low" }, // simple questions: quick and cheap
      system: [
        { type: "text", text: instructions(info, found) },
        // The chapter is the same for every question about it, so it is cached (cheaper and faster)
        { type: "text", text: `The chapter the student is reading:\n\n${found.text}`, cache_control: { type: "ephemeral" } },
      ],
      messages: [...history, { role: "user", content: question }],
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { error: response.status === 429 || response.status >= 500 ? "BUSY" : "OTHER", detail: data.error?.message };
  if (data.stop_reason === "refusal") return { error: "REFUSED" };
  const text = (data.content || []).filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
  return text ? { text } : { error: "OTHER", detail: `empty answer (${data.stop_reason})` };
}

const SAFE_NAME = /^[A-Za-z0-9_]{1,80}$/;

async function answer(request, env) {
  const token = tokenOf(request);
  if (!token) return json({ error: "NOT_LOGGED_IN" }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: "BAD_REQUEST" }, 400); }
  const question = String(body.question || "").trim();
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  const fine = SAFE_NAME.test(body.course || "") && SAFE_NAME.test(body.unit || "") && question && question.length <= 1000 &&
    history.every((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.length <= 6000);
  if (!fine) return json({ error: "BAD_REQUEST" }, 400);
  if (history.length && history[0].role !== "user") history.shift(); // a conversation starts with the student

  const found = await chapter(env, body.course, body.unit);
  if (!found) return json({ error: "BAD_REQUEST" }, 400);
  // Counts the question (and checks the login and access) before Claude is asked
  const count = await rpc(env, token, "ai_use_one");
  if (count.error) return json({ error: count.error }, count.error === "DAILY_LIMIT" ? 429 : 403);
  const reply = await askClaude(env, found.info, found, history, question);
  if (reply.error) {
    console.error("claude", reply.error, reply.detail);
    return json({ error: reply.error, used: count.value, limit: DAILY_LIMIT }, 502);
  }
  return json({ answer: reply.text, used: count.value, limit: DAILY_LIMIT });
}
