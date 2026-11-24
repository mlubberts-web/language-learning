"""Checks place.py: what goes into the web address, and what comes back from it.
Run with:  .venv\\Scripts\\python.exe test_place.py"""
import sys

from place import place_back, where_now

sys.stdout.reconfigure(encoding="utf-8")
problems = []


def check(name, got, expected):
    if got != expected:
        problems.append(f"{name}: got {got}, expected {expected}")


# ---- where_now: from the session state to the address
check("home", where_now({"view": "home"}), {"screen": "home"})
check("nothing yet", where_now({}), {"screen": "home"})
check("level", where_now({"view": "level", "level": "B1"}), {"screen": "level", "level": "B1"})
check("reader", where_now({"view": "reader", "current": "a2_03", "page": 4}),
      {"screen": "reader", "pdf": "a2_03", "page": "4"})
check("practice", where_now({"view": "practice", "practice_pdf": "a1_01"}),
      {"screen": "practice", "pdf": "a1_01"})
check("schedule", where_now({"view": "schedule"}), {"screen": "schedule"})
check("session of a PDF", where_now({"view": "drill", "drill": {"back": ("pdf", "a1_02")}}),
      {"screen": "practice", "pdf": "a1_02"})
check("session of a level", where_now({"view": "drill", "drill": {"back": ("level", "C1")}}),
      {"screen": "level", "level": "C1"})
check("session of word lists", where_now({"view": "drill", "drill": {"back": ("view", "themes")}}),
      {"screen": "themes"})
check("session from home", where_now({"view": "drill", "drill": {"back": ("home",)}}), {"screen": "home"})
check("running mock", where_now({"view": "mock_run"}), {"screen": "mock"})
check("course choice", where_now({"view": "courses"}), {"screen": "home"})

# ---- place_back: from the address to the session state
by_id = {"a2_03": {"id": "a2_03", "level": "A2"}, "a1_01": {"id": "a1_01", "level": "A1"}}
levels = ["A1", "A2"]
pages = lambda pdf: 10
check("back to level", place_back({"screen": "level", "level": "A2"}, by_id, levels, pages),
      {"view": "level", "level": "A2"})
check("level not in course", place_back({"screen": "level", "level": "C2"}, by_id, levels, pages), {})
check("back to reader", place_back({"screen": "reader", "pdf": "a2_03", "page": "4"}, by_id, levels, pages),
      {"view": "reader", "current": "a2_03", "level": "A2", "page": 4, "page_jump": 5})
check("page too far", place_back({"screen": "reader", "pdf": "a2_03", "page": "99"}, by_id, levels, pages)["page"], 9)
check("page not a number", place_back({"screen": "reader", "pdf": "a2_03", "page": "x"}, by_id, levels, pages)["page"], 0)
check("unknown PDF", place_back({"screen": "reader", "pdf": "zz"}, by_id, levels, pages), {})
check("back to practice", place_back({"screen": "practice", "pdf": "a1_01"}, by_id, levels, pages),
      {"view": "practice", "practice_pdf": "a1_01", "level": "A1"})
check("back to progress", place_back({"screen": "progress"}, by_id, levels, pages), {"view": "progress"})
check("unknown screen", place_back({"screen": "drill"}, by_id, levels, pages), {})
check("empty address", place_back({}, by_id, levels, pages), {})
# every place written can be read back to the same screen
for state in ({"view": "level", "level": "A1"}, {"view": "reader", "current": "a1_01", "page": 2},
              {"view": "practice", "practice_pdf": "a2_03"}, {"view": "themes"}, {"view": "mock"}):
    check(f"round trip {state['view']}", place_back(where_now(state), by_id, levels, pages)["view"], state["view"])

if problems:
    print("\n".join(problems))
    sys.exit(1)
print("All checks passed.")
