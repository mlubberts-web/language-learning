"""Checks the content of every course: each question of each PDF, themed list and verbs-in-context
file. Run with:  .venv\\Scripts\\python.exe test_content.py
test_practice.py uses check_course() for the Spanish course and then tests the rules with it.

For every question: its own answers count as right, dots never matter, a missing accent gives a
warning (or is wrong where accents must be right), nonsense and an empty answer are wrong."""
import collections, json

import course
import practice_logic as logic
from practice_items import CONTEXT_GROUP, build_items, build_theme_items, clean_text, course_languages, without_accents
from ui_text import t

LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
# Words that show Latin American Spanish; the Spanish courses teach the Spanish of Spain.
LATIN_AMERICAN = {"carro", "computadora", "celular", "jugo", "manejar", "boleto", "papa", "frijol", "frijoles",
                  "durazno", "chamaco", "ómnibus", "tiquete", "refrigeradora", "mesero", "mesera",
                  "elote", "ejote", "chícharo", "betabel"}


def check_question(item, name, expect):
    """The checks every question must pass."""
    expect(item["prompt"].strip() and item["answers"], f"{name}: empty question")
    expect("*" not in "".join(item["answers"]), f"{name}: star left in answer")
    for answer in item["answers"]:
        expect(answer.strip(), f"{name}: empty answer")
        result = logic.check_answer(item, answer)[0]
        expect(result == "right", f"{name}: its own answer {answer!r} gives {result}")
        no_dots = answer.replace(".", "")  # dots must not matter at all, for any exercise type
        if no_dots.strip():
            result = logic.check_answer(item, no_dots)[0]
            expect(result == "right", f"{name}: {no_dots!r} without dots gives {result}")
        # Without accents: wrong only where the accent has to be right, otherwise yellow.
        loose = without_accents(answer, item["lang"])
        if loose != answer and item["mode"] != "build" and len(item["answers"]) == 1:
            result = logic.check_answer(item, loose)[0]
            wanted = "wrong" if "accent" in item["must_match"] else "near"
            expect(result == wanted, f"{name}: {loose!r} gives {result}, wanted {wanted}")
    if item["mode"] == "verbs":
        expect("accent" in item["must_match"], f"{name}: accents must matter in verbs")
    if item["mode"] == "fix":  # a wrong sentence retyped without changes may never pass
        expect(logic.check_answer(item, item["prompt"])[0] == "wrong", f"{name}: unchanged mistake passes")
    expect(logic.check_answer(item, "xyzzy")[0] == "wrong", f"{name}: accepts nonsense")
    expect(logic.check_answer(item, "")[0] == "wrong", f"{name}: accepts an empty answer")
    if item["mode"] == "build":
        built = " ".join(item["tiles"])
        expect(len(item["tiles"]) >= 3, f"{name}: too few tiles")
        expect(logic.check_answer(item, built)[0] == "right", f"{name}: tiles give {built!r}")


def check_course(course_id, expect):
    """Checks every PDF, themed list and verbs-in-context file of a course.
    Returns (all questions, questions per exercise type, number of themed entries)."""
    folder = course.folder(course_id)
    learn, base = course_languages(course_id)
    spain = learn == "es"
    catalog = json.loads((folder / "catalog.json").read_text(encoding="utf-8"))
    totals, all_items = collections.Counter(), []

    for pdf in catalog:
        document = json.loads((folder / "content" / pdf["content"]).read_text(encoding="utf-8"))
        expect(document["meta"]["level"] in LEVELS, f"{course_id} {pdf['id']}: no level")
        items = build_items(pdf["id"], document, course_id)
        all_items += items
        ids = [i["id"] for i in items]
        expect(len(ids) == len(set(ids)), f"{course_id} {pdf['id']}: two questions with the same id")
        expect(any(i["mode"] == "fill" for i in items), f"{course_id} {pdf['id']}: no grammar exercises")
        for item in items:
            totals[item["mode"]] += 1
            check_question(item, f"{course_id} {pdf['id']} {item['mode']} {item['prompt']!r}", expect)

    theme_words = 0
    for path in sorted((folder / "themes").glob("*.json")):
        theme = json.loads(path.read_text(encoding="utf-8"))
        where = f"{course_id} {path.stem}"
        expect(theme.get("kind") in ("topic", "language"), f"{where}: kind must be topic or language")
        entries = [entry for part in theme["lists"] for entry in part["items"]]
        theme_words += len(entries)
        for part in theme["lists"]:
            expect(12 <= len(part["items"]) <= 30, f"{where} {part['name']}: {len(part['items'])} words, wanted 12 to 30")
            expect(part["level"] in LEVELS, f"{where} {part['name']}: no level")
        words = [entry[0] for entry in entries]
        expect(len(words) == len(set(words)), f"{where}: a word appears twice: "
               + str([w for w, n in collections.Counter(words).items() if n > 1]))
        names = [part["name"] for part in theme["lists"]]
        expect(len(names) == len(set(names)), f"{where}: two lists with the same name")
        for entry in entries:
            expect(2 <= len(entry) <= 4 and all(isinstance(x, str) for x in entry), f"{where}: bad item {entry}")
            if spain:
                expect(not (set(clean_text(entry[0], learn).split()) & LATIN_AMERICAN), f"{where}: not Spain Spanish? {entry[0]}")
            expect(not any(mark in entry[1] for mark in "!?¡¿"), f"{where}: no ! or ? in the translation: {entry[1]}")
            if len(entry) > 2:  # the example sentence has exactly one [gap]
                expect(entry[2].count("[") == 1 and entry[2].count("]") == 1, f"{where}: one [gap] needed: {entry[2]}")
        items = build_theme_items(path.stem, theme, course_id)
        all_items += items
        expect(all(item["group"] in names for item in items), f"{where}: a question without its list")
        for item in items:
            totals[item["mode"]] += 1
            for answer in item["answers"]:
                expect(logic.check_answer(item, answer)[0] == "right", f"{where} {item['prompt']!r}: own answer {answer!r}")
            expect(logic.check_answer(item, "xyzzy")[0] == "wrong", f"{where} {item['prompt']!r}: accepts nonsense")

    # verbs in context: one file per PDF, each sentence with one [gap] and the infinitive as hint
    prefixes = {pdf["id"][:5] for pdf in catalog}
    levels = {pdf["level"] for pdf in catalog}
    # A file for a level that has no PDFs yet was written ahead (a course still being written): skipped.
    files = [p for p in sorted((folder / "verbs_in_context").glob("*.json")) if p.stem[:2] in levels]
    group = t(CONTEXT_GROUP, base)
    context_items = [i for i in all_items if i["group"] == group]
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        expect(path.stem in prefixes and data["pdf"] == path.stem, f"{course_id} {path.name}: no PDF with this name")
        expect(len(data["items"]) >= 15, f"{course_id} {path.name}: only {len(data['items'])} sentences")
        for entry in data["items"]:
            sentence = entry[0]
            expect(sentence.count("[") == 1 and sentence.count("]") == 1,
                   f"{course_id} {path.name}: one [gap] needed: {sentence}")
            expect(len(entry) in (2, 3) and entry[1] and " " not in entry[1].strip(),
                   f"{course_id} {path.name}: the hint must be just the infinitive: {entry}")
            if spain:
                expect(not (set(clean_text(sentence, learn).split()) & LATIN_AMERICAN),
                       f"{course_id} {path.name}: not Spain Spanish? {sentence}")
    expect(len(context_items) == sum(len(json.loads(p.read_text(encoding="utf-8"))["items"]) for p in files),
           f"{course_id}: every verbs-in-context sentence must give one question (two the same?)")
    for item in context_items:
        expect("accent" in item["must_match"], f"{course_id}: accents must count in verbs: {item['prompt']}")
    return all_items, totals, theme_words


if __name__ == "__main__":
    problems = []

    def expect(condition, message):
        if not condition:
            problems.append(message)

    for course_id in course.all_ids():
        items, totals, words = check_course(course_id, expect)
        print(f"{course_id}: {len(items)} questions, {words} themed entries")
    if problems:
        print(f"{len(problems)} PROBLEMS:")
        for problem in problems[:80]:
            print(" -", problem)
    else:
        print("All content checks passed.")
