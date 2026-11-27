"""Clicks through the website in Microsoft Edge, on a laptop and a phone screen size (PLAN 8.9).
Run with:  .venv\\Scripts\\python.exe test_site.py      (run_tests.py runs it too)

It uses the data that build_web.py made (web/data) and opens the site with ?offline: no account,
results only in the browser. What it checks:
- the theory: one page, the bar on the left, the place you were, the solutions line, the
  continue button, and the word PDF nowhere;
- the daily review: 20 questions a day;
- mastering: right first try, right in the end, more than 95%, "Skip what I know";
- the course choice in two steps;
- the Verbs tab, and that every verb question accepts its own answer;
- the AI helper: the server part (worker/index.js) with a fake database and a fake Claude, and the
  panel beside the theory;
- the exam room, when the official exams are in web/exams-local (they are never in git).
Needs playwright (requirements-dev.txt); it uses Edge, so no extra browser download."""
import functools, http.server, json, sys, threading, time
from pathlib import Path

HERE = Path(__file__).parent
WEB = HERE / "web"
UNIT = "A2_04_Preterite_vs_Imperfect"
problems = []


def check(name, ok, detail=""):
    if not ok:
        problems.append(f"{name} {detail}".strip())


def serve(folder):
    """A small web server for the project folder, on a free port, in the background."""
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(folder)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def new_page(browser, size, errors):
    page = browser.new_page(viewport=size)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("dialog", lambda d: d.accept())
    return page


def progress(page):
    return (page.evaluate("JSON.parse(localStorage.getItem('results/es_from_en_progress'))") or {}).get(UNIT, {})


def reader_and_home(browser, url, errors):
    for name, size in (("laptop", {"width": 1280, "height": 900}), ("phone", {"width": 390, "height": 844})):
        p = new_page(browser, size, errors)
        p.goto(url + f"#/es_from_en/read/{UNIT}"); p.wait_for_selector(".reader-page"); time.sleep(0.6)
        check(f"{name}: theory on one page", p.locator(".reader-part").count() > 1)
        check(f"{name}: bar left of the text", p.locator(".reader-rail-track").bounding_box()["x"] < p.locator(".reader-page").bounding_box()["x"])
        check(f"{name}: no word PDF in the text", "PDF" not in p.locator(".reader-page").inner_text())
        height = p.evaluate("document.querySelector('.reader-page').getBoundingClientRect().height")
        p.evaluate(f"window.scrollTo(0, {height * 0.5})"); time.sleep(1.8)
        e = progress(p)
        check(f"{name}: half read, place saved", 0.4 < e.get("farthest", 0) < 0.95 and 0.3 < e.get("scroll", 0) < 0.7, e)
        p.goto(url + "#/es_from_en"); p.wait_for_selector(".card.big"); time.sleep(0.4)
        p.get_by_role("link", name="Continue reading").first.click(); p.wait_for_selector(".reader-page"); time.sleep(0.8)
        check(f"{name}: continue reading opens at the place", p.evaluate("window.scrollY") > height * 0.3)
        check(f"{name}: solutions line", "Solutions below" in p.locator(".solutions-line").inner_text())
        p.evaluate("window.scrollTo(0, document.body.scrollHeight)"); time.sleep(1.8)
        check(f"{name}: read to the end is done", progress(p).get("done") is True)
        p.goto(url + f"#/es_from_en/unit/{UNIT}"); p.wait_for_selector(".mode-card")
        p.goto(url + "#/es_from_en"); p.wait_for_selector(".card.big"); time.sleep(0.4)
        check(f"{name}: continue goes to the exercises", p.get_by_role("link", name="Continue practising").count() == 1)
        p.evaluate("localStorage.clear()"); p.close()


def review_and_mastery(browser, url, errors):
    p = new_page(browser, {"width": 1280, "height": 1000}, errors)
    p.goto(url + "#/es_from_en"); p.wait_for_selector(".card.big")
    items = json.loads((WEB / "data" / "es_from_en" / "items" / f"{UNIT}.json").read_text(encoding="utf-8"))
    due = {i["id"]: {"right": 1, "wrong": 0, "last_ok": True, "box": 1, "due": "2026-01-01", "last": "2025-12-31"} for i in items[:60]}
    p.evaluate(f"localStorage.setItem('results/es_from_en_practice', {json.dumps(json.dumps({'items': due, 'scores': {}}))})")
    p.reload(); p.wait_for_selector(".card.big"); time.sleep(0.5)
    check("review: 20 of 60 due", "0 of 20 done today" in p.locator("aside.side").inner_text())
    # The rules of mastering, straight from store.js
    r = p.evaluate("""async () => {
      const s = await import('./js/store.js');
      const d = { items: {}, scores: {} };
      s.record(d, 'a', false); const wrong = [s.isMastered(d, 'a'), s.isRightInEnd(d, 'a')];
      s.recordLater(d, 'a', true); const later = [s.isMastered(d, 'a'), s.isRightInEnd(d, 'a')];
      s.record(d, 'a', true); const next = s.isMastered(d, 'a');
      s.record(d, 'a', false); const lost = s.isMastered(d, 'a');
      const list = Array.from({ length: 20 }, (_, i) => ({ id: 'q' + i }));
      const d2 = { items: {}, scores: {} };
      list.forEach((q, i) => { d2.items[q.id] = { last_ok: i < 19 }; });
      return { wrong, later, next, lost, at95: s.listMastered(d2, list) };
    }""")
    check("mastery: wrong first try", r["wrong"] == [False, False], r)
    check("mastery: right later is only right in the end", r["later"] == [False, True], r)
    check("mastery: right first try next time", r["next"] is True and r["lost"] is False, r)
    check("mastery: 95% is not more than 95%", r["at95"] is False, r)
    p.close()


def course_choice(browser, url, errors):
    p = new_page(browser, {"width": 1280, "height": 900}, errors)
    p.goto(url + "#/"); p.wait_for_selector(".choice"); p.evaluate("localStorage.clear()"); p.reload(); p.wait_for_selector(".choice")
    p.get_by_role("button", name="Nederlands").click(); time.sleep(0.5)
    text = p.locator("main").inner_text()
    check("course choice: Dutch speakers, site in Dutch", "Ik wil leren" in text and p.locator(".course-card").count() == 2)
    p.locator(".course-card", has_text="Spaans").click(); p.wait_for_selector(".card.big")
    check("course choice: opens es_from_nl", "es_from_nl" in p.evaluate("location.hash"))
    p.evaluate("localStorage.clear()"); p.close()


def verbs(browser, url, errors):
    p = new_page(browser, {"width": 1280, "height": 900}, errors)
    for course in ("es_from_en", "en_from_nl", "nl_from_es"):
        p.goto(url + f"#/{course}/verbs"); p.wait_for_selector("table"); time.sleep(0.3)
        r = p.evaluate("""async () => {
          const v = await import('./js/screens/verbs.js'), g = await import('./js/grading.js');
          const bad = []; let n = 0;
          for (const tensed of [true, false]) for (const item of await v.verbItems(tensed)) {
            n++;
            if (g.checkAnswer(item, item.answers[0], item.lang).result !== 'right' || !item.prompt.includes('______')) bad.push(item.prompt);
          }
          return { n, bad: bad.slice(0, 3) };
        }""")
        check(f"verbs {course}: every question accepts its answer", r["n"] > 200 and not r["bad"], r)
    p.goto(url + "#/es_from_en/verbs"); p.wait_for_selector("table")
    p.get_by_role("button", name="Start 20 sentences").click(); p.wait_for_selector(".prompt")
    check("verbs: a session starts", "session" in p.evaluate("location.hash"))
    p.close()


def helper(browser, root, errors):
    p = new_page(browser, {"width": 1280, "height": 900}, errors)
    p.goto(root + "/web/favicon.svg")
    r = p.evaluate("""async (root) => {
      const worker = (await import(root + '/worker/index.js')).default;
      const real = fetch; let rpc = { status: 200, body: '3' }; const sent = [];
      globalThis.fetch = async (url, options = {}) => {
        url = String(url); sent.push(url);
        if (url.includes('/rest/v1/rpc/')) return new Response(rpc.body, { status: rpc.status });
        return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Fine.' }] }));
      };
      const env = { ANTHROPIC_API_KEY: 'k', SUPABASE_URL: 'https://db', SUPABASE_KEY: 'p',
        ASSETS: { fetch: (u) => real(root + '/web' + new URL(String(u.url || u)).pathname) } };
      const ask = (token) => worker.fetch(new Request('https://s/api/ask', { method: 'POST',
        headers: token ? { authorization: 'Bearer ' + token } : {},
        body: JSON.stringify({ course: 'es_from_en', unit: 'A2_04_Preterite_vs_Imperfect', question: 'Why?', history: [] }) }), env);
      const out = {};
      let res = await ask('t'); out.ok = [res.status, (await res.json()).answer];
      res = await ask(null); out.noLogin = res.status;
      rpc = { status: 400, body: JSON.stringify({ message: 'DAILY_LIMIT' }) };
      const before = sent.filter((u) => u.includes('anthropic')).length;
      res = await ask('t'); out.limit = res.status; out.claudeAfter = sent.filter((u) => u.includes('anthropic')).length - before;
      globalThis.fetch = real;
      return out;
    }""", root)
    check("helper server: answers", r["ok"] == [200, "Fine."], r)
    check("helper server: needs a login", r["noLogin"] == 401, r)
    check("helper server: daily limit, Claude not asked", r["limit"] == 429 and r["claudeAfter"] == 0, r)
    p.route("**/api/ask", lambda route: route.fulfill(json={"answer": "**Era** is the background.", "used": 5, "limit": 50}))
    p.route("**/api/usage", lambda route: route.fulfill(json={"used": 4, "limit": 50}))
    p.goto(root + "/web/?offline#/es_from_en"); p.wait_for_selector(".card.big")
    p.evaluate("""async () => { const a = await import('./js/account.js');
      a.account.user = { id: 'x' }; a.supabase.auth.getSession = async () => ({ data: { session: { access_token: 't' } } }); }""")
    p.evaluate(f"location.hash = '#/es_from_en/read/{UNIT}'"); p.wait_for_selector(".helper"); time.sleep(0.6)
    p.locator("#helper-question").fill("Why?"); p.locator("#helper-question").press("Enter"); time.sleep(0.6)
    check("helper panel: answer shown", p.locator(".helper-text strong").first.inner_text() == "Era")
    p.close()


def exam_room(browser, url, errors):
    index = WEB / "exams-local" / "index.json"
    if not index.exists():
        return  # the official exams are only on Menno's computer
    key = next(e for e in json.loads(index.read_text(encoding="utf-8"))["exams"] if e["level"] == "A2")["parts"][0]["answers"]
    p = new_page(browser, {"width": 1280, "height": 900}, errors)
    p.goto(url + "#/es_from_en/exams/official/A2/reading"); p.wait_for_selector(".exam-sheet"); time.sleep(0.6)
    check("exam room: timer runs", p.locator(".exam-clock").inner_text()[:2] in ("59", "1:"))
    for n, letter in key.items():
        if n != "1":
            p.locator(f".exam-options[aria-label='Question {n}'] button", has_text=letter).first.click()
    p.get_by_role("button", name="Finish part").click(); p.wait_for_selector(".big-number")
    check("exam room: marked with the key", f"{len(key) - 1} of {len(key)} right" in p.locator("main").inner_text())
    p.evaluate("localStorage.clear()"); p.close()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if not (WEB / "data" / "courses.json").exists():
        import build_web
        build_web.main()
    from playwright.sync_api import sync_playwright
    server = serve(HERE)
    root = f"http://127.0.0.1:{server.server_port}"
    url = root + "/web/?offline"
    errors = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="msedge")
            for part in (reader_and_home, review_and_mastery, course_choice, verbs, exam_room):
                part(browser, url, errors)
            helper(browser, root, errors)
            browser.close()
    finally:
        server.shutdown()
    for error in errors[:5]:
        problems.append(f"page error: {error}")
    if problems:
        print("Problems:", *problems, sep="\n  ")
        sys.exit(1)
    print("All checks passed. The website works on a laptop and a phone screen: theory, review, mastering, "
          "course choice, verbs, the AI helper" + (" and the exam room." if (WEB / "exams-local").exists() else "."))


if __name__ == "__main__":
    main()
