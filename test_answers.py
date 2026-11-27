"""Checks answer_variants.py: every translation the course gives for a word counts everywhere.
Run with:  .venv\\Scripts\\python.exe test_answers.py
Needs the website data (build_web.py), which run_tests.py builds in test_web.py first."""
import json, sys
from pathlib import Path

from answer_variants import widen

sys.stdout.reconfigure(encoding="utf-8")
problems = []
DATA = Path(__file__).parent / "web" / "data"


def check(name, ok):
    if not ok:
        problems.append(name)


def word(mode, prompt, answers, hint=""):
    return {"mode": mode, "prompt": prompt, "answers": list(answers), "hint": hint}


# 1. Two chapters translate escuchar differently: both answers count in both
a = word("reverse", "escuchar", ["to listen to", "listen to"])
b = word("reverse", "escuchar", ["to listen", "listen"])
c = word("words", "to hear", ["oír"])
d = word("words", "to listen", ["escuchar"])
widen([a, b, c, d], ("el ", "la "), "en")
check("escuchar accepts 'to listen' (A1)", "to listen" in a["answers"] and "listen" in a["answers"])
check("escuchar accepts 'to listen to' (A2)", "to listen to" in b["answers"])

# 2. A question with a hint keeps its own answer
e = word("reverse", "escuchar", ["to listen"], hint="formal")
widen([a, e], ("el ", "la "), "en")
check("a hint keeps one answer", e["answers"] == ["to listen"])

# 3. A word question that wants the article keeps wanting it
f = word("words", "cheese", ["el queso"])
g = word("reverse", "queso", ["cheese"])
widen([f, g], ("el ", "la "), "en")
check("no article-less answer added", f["answers"] == ["el queso"])

# 4. "Fine." (a greeting) is not "fine" (a penalty)
h = word("words", "Fine.", ["Prima."])
i = word("words", "fine", ["de boete"])
widen([h, i], ("de ", "het "), "en")
check("Fine. stays a greeting", h["answers"] == ["Prima."])

# 5. In the built site data: escuchar in A1 chapter 2 accepts "to listen"
items = json.loads((DATA / "es_from_en" / "items" / "A1_02_Regular_Verbs_Present_Tense.json").read_text(encoding="utf-8"))
found = [x for x in items if x["mode"] == "reverse" and x["prompt"] == "escuchar"]
check("site data: escuchar accepts to listen", found and "to listen" in found[0]["answers"])

if problems:
    print("Problems:", *problems, sep="\n  ")
else:
    print("All checks passed. Extra answers work in both directions, keep hints and articles.")
