"""Checks that the new website grades answers and makes study plans exactly like the Python app.
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
import study_plan
from datetime import date
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


def plan_cases():
    """Situations for the study plan: (input for the browser, what Python's study_plan.py makes)."""
    cases = []
    scenarios = [  # course, deadlines, start, today, share finished, hours, days off, today's list fixed
        ("es_from_en", [{"level": "B2", "date": "2026-12-04"}, {"level": "C2", "date": "2027-01-20"}], "2026-11-07", "2026-11-23", 0.3, {"weekday": 240, "weekend": 120}, ["2026-12-25"], False),
        ("es_from_en", [{"level": "B2", "date": "2026-12-04"}, {"level": "C2", "date": "2027-01-20"}], "2026-11-07", "2026-11-23", 0.3, {"weekday": 240, "weekend": 120}, [], True),
        ("nl_from_es", [{"level": "B1", "date": "2027-03-01"}], "2026-11-23", "2026-11-23", 0.0, {"weekday": 60, "weekend": 0}, ["2026-12-31"], False),
        ("en_from_nl", [{"level": "A2", "date": "2026-12-01"}, {"level": "B2", "date": "2027-02-01"}, {"level": "C2", "date": "2027-06-30"}], "2026-11-01", "2026-12-10", 0.1, {"weekday": 90, "weekend": 45}, [], False),
        ("es_from_nl", [{"level": "C1", "date": "2026-11-20"}, {"level": "C2", "date": "2027-02-20"}], "2026-10-01", "2026-11-25", 0.5, {"weekday": 120, "weekend": 120}, ["2026-12-24", "2026-12-25"], True),
    ]
    for course_id, goals, start, today, share, hours, days_off, fixed in scenarios:
        data = WEB / "data" / course_id
        catalog = json.loads((data / "catalog.json").read_text(encoding="utf-8"))
        units = [{"id": u["id"], "level": u["level"], "number": u["number"], "title": u["title"], "pages": u["pages"],
                  "items": [{"mode": i["mode"]} for i in json.loads((data / "items" / f"{u['id']}.json").read_text(encoding="utf-8"))]}
                 for u in catalog]
        themes = [{"name": name, "title": theme["title"], "lists": theme["lists"],
                   "items": [{"mode": i["mode"], "group": i.get("group", "")} for i in theme["items"]]}
                  for name, theme in json.loads((data / "themes.json").read_text(encoding="utf-8")).items()]
        phases = study_plan.make_phases(goals, date.fromisoformat(start))
        all_units = study_plan.all_units(units, themes, phases)
        finished = [u["id"] for u in all_units[:int(len(all_units) * share)]]
        frozen = [u["id"] for u in all_units[len(finished):len(finished) + 7]] if fixed else None
        finished_dates = {unit_id: start for unit_id in finished}
        plan = study_plan.build_plan(all_units, date.fromisoformat(today), set(finished), hours, set(days_off), frozen, phases)
        expected = {"units": [[u["id"], u["minutes"], u["phase"]] for u in all_units],
                    "days": [[r["date"].isoformat(), r["budget"], r["review"], r["writing"], r["room"], [u["id"] for u in r["units"]]]
                             for r in plan["days"]],
                    "load": plan["load"], "late": [u["id"] for u in plan["late"]],
                    "position": study_plan.position(all_units, finished_dates, date.fromisoformat(today))}
        if expected["position"] == "All PDFs done":
            expected["position"] = None
        cases.append(({"goals": goals, "start": start, "today": today, "units": units, "themes": themes,
                       "finished": finished, "finished_dates": finished_dates, "hours": hours, "days_off": days_off,
                       "frozen": frozen}, expected, f"{course_id} {start}→{goals[-1]['date']}, today {today}"))
    return cases


def compare_plans(page):
    """Returns the descriptions of the situations where the two plans differ."""
    problems = []
    for case, expected, name in plan_cases():
        got = page.evaluate("c => window.runPlan(c)", case)
        for key in expected:
            if key == "load":
                same = expected[key].keys() == got[key].keys() and all(abs(expected[key][k] - got[key][k]) < 1e-9 for k in expected[key])
            elif key == "days":
                same = len(expected[key]) == len(got[key]) and all(
                    a[:4] == b[:4] and abs(a[4] - b[4]) < 1e-9 and a[5] == b[5] for a, b in zip(expected[key], got[key]))
            else:
                same = expected[key] == got[key]
            if not same:
                problems.append(f"plan {name}: '{key}' differs")
    return problems


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
            page.goto(f"http://127.0.0.1:{server.server_port}/tests/plan.html")
            page.wait_for_function("document.getElementById('status').textContent === 'Ready'", timeout=30000)
            plan_problems = compare_plans(page)
            browser.close()
    finally:
        server.shutdown()
    for case in different[:25]:
        print(f"DIFFERENT {case['item']['mode']} {case['item']['answers'][:2]} typed {case['typed']!r}: "
              f"Python {case['result']} {case['note']!r}, website {case['got']['result']} {case['got']['note']!r}")
    for problem in plan_problems:
        print("DIFFERENT", problem)
    if different:
        print(f"{len(different)} of {len(cases)} answers graded differently.")
    if different or plan_problems:
        sys.exit(1)
    print(f"All checks passed: the website grades all {len(cases)} answers like the app, and makes the same "
          f"study plan in {len(plan_cases())} situations.")


if __name__ == "__main__":
    main()
