"""Checks that the new website grades answers exactly like the Python app.
Run with:  .venv\\Scripts\\python.exe test_web.py

How: it builds the website data (build_web.py), takes questions of every course and makes many
typed answers for each (right, without accents, n instead of ñ, without ¿, with an extra
pronoun, American spelling, a typo, someone else's answer ...). Python grades them with
practice_logic.check_answer. Then Microsoft Edge opens web/tests/grading.html, which grades the
same answers with web/js/grading.js. Every answer where the two disagree is printed.
Needs playwright (requirements-dev.txt); it uses Edge, so no extra browser download."""
import functools, http.server, json, random, sys, threading
from pathlib import Path

import build_web
import course
import languages
import practice_logic as logic
from practice_items import without_accents, without_special

HERE = Path(__file__).parent
WEB = HERE / "web"
PER_MODE = 60  # questions per exercise type per course; with ~12 answers each that is ~40,000 cases
random.seed(7)  # the same "random" questions every time, so a failure can be found again


def full(item):
    """A question from the website data with its empty parts filled in again (see build_web.compact)."""
    return {"hint": "", "show": "", "why": "", "group": "", "tiles": [], "must_match": [], "speak": "",
            "choices": [], **item}


def variants(item, answer, other, lang):
    """Typed answers to try for one correct answer."""
    profile = languages.profile(lang)
    words = answer.split()
    tries = [answer, answer.lower(), answer.upper(), "  " + answer.replace(" ", "   ") + " ",
             without_accents(answer, lang), without_special(answer, lang),
             without_special(without_accents(answer, lang), lang),
             "".join(c for c in answer if c not in "¿¡"), "".join(c for c in answer if c not in "¿?¡!"),
             "".join(c for c in answer if c not in ".,;:"), answer + "!", other]
    if len(words) > 1:
        tries += [" ".join(words[1:]), " ".join(words[:-1]), " ".join(reversed(words))]
    for pronoun in sorted(profile["pronouns"])[:3] + sorted(profile["typed_pronouns"]):
        tries.append(f"{pronoun} {answer}")
    for article in profile["articles"][:2]:
        tries.append(article + answer)
    if len(answer) > 3:  # a typo: one letter left out
        spot = random.randrange(1, len(answer) - 1)
        tries.append(answer[:spot] + answer[spot + 1:])
    for american, british in profile["spelling"].items():
        if british in answer:
            tries.append(answer.replace(british, american))
    for short, long in (("do not", "don't"), ("I am", "I'm"), ("it is", "it's"), ("cannot", "can't"),
                        ("will not", "won't")):
        if short in answer:
            tries.append(answer.replace(short, long).replace("'", "’"))
            tries.append(answer.replace(short, long))
    if item["mode"] == "build" and item["tiles"]:
        tries += [" ".join(item["tiles"]), " ".join(random.sample(item["tiles"], len(item["tiles"])))]
    return tries


def make_cases():
    cases = []
    for course_id in course.all_ids():
        learn = course.info(course_id)["learn"]
        data = WEB / "data" / course_id
        items = [full(i) for path in sorted((data / "items").glob("*.json"))
                 for i in json.loads(path.read_text(encoding="utf-8"))]
        items += [full(i) for theme in json.loads((data / "themes.json").read_text(encoding="utf-8")).values()
                  for i in theme["items"]]
        by_mode = {}
        for item in items:
            by_mode.setdefault(item["mode"], []).append(item)
        for mode, pile in by_mode.items():
            for item in random.sample(pile, min(PER_MODE, len(pile))):
                lang = item.get("lang") or learn
                other = random.choice(pile)["answers"][0]
                for answer in item["answers"][:3]:
                    for typed in variants(item, answer, other, lang):
                        accepted = [other] if random.random() < 0.05 else []
                        python_item = {**item, "lang": lang}
                        result, note = logic.check_answer(python_item, typed, accepted)
                        cases.append({"item": item, "typed": typed, "learn": learn, "accepted": accepted,
                                      "result": result, "note": note})
    return cases


def serve(folder):
    """A small web server for the web folder, on a free port, in the background."""
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):  # no line for every file the browser asks for
            pass
    handler = functools.partial(Quiet, directory=str(folder))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    build_web.main()
    cases = make_cases()
    counts = {kind: sum(case["result"] == kind for case in cases) for kind in ("right", "near", "wrong")}
    print(f"{len(cases)} answers graded by Python: {counts['right']} right, {counts['near']} with a warning, "
          f"{counts['wrong']} wrong")
    from playwright.sync_api import sync_playwright
    server = serve(WEB)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="msedge")
            page = browser.new_page()
            page.goto(f"http://127.0.0.1:{server.server_port}/tests/grading.html")
            page.wait_for_function("document.getElementById('status').textContent === 'Ready'", timeout=30000)
            different = []
            for start in range(0, len(cases), 5000):  # in parts, so no single message gets too big
                different += page.evaluate("cases => window.runCases(cases)", cases[start:start + 5000])
            browser.close()
    finally:
        server.shutdown()
    for case in different[:25]:
        print(f"DIFFERENT {case['item']['mode']} {case['item']['answers'][:2]} typed {case['typed']!r}: "
              f"Python {case['result']} {case['note']!r}, website {case['got']['result']} {case['got']['note']!r}")
    if different:
        print(f"{len(different)} of {len(cases)} answers graded differently.")
        sys.exit(1)
    print(f"All checks passed: the website grades all {len(cases)} answers like the app.")


if __name__ == "__main__":
    main()
