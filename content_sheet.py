"""Helps to make a course from another one with the same language to learn, but explanations in
another language (es_from_en -> es_from_nl). Only the explanations change; the language you learn
stays exactly as it is.

    python content_sheet.py sheet es_from_en a1_02_regular_present.json
        writes sheets/a1_02_regular_present.json: a numbered list of every text that may need
        translating, with where it is. Texts that are always in the language you learn (verb forms,
        answers, the learned half of a word pair) are left out.
    python content_sheet.py apply es_from_en es_from_nl a1_02_regular_present.json answers.json
        answers.json holds {"number": "translation", ...} for the texts that change; a text that is
        not in it stays as it was (for example a Spanish sentence in a table). Writes the file to
        courses/es_from_nl/content/, with the language-independent marks the practice questions need.

The same works for themed lists (the folder 'themes') and verbs in context ('verbs_in_context'):
add --part themes or --part verbs_in_context.
"""
import copy, json, sys
from pathlib import Path

import course

SHEETS = Path(__file__).parent / "sheets"
# Keys whose texts are never explanations
SKIP_KEYS = {"type", "style", "widths", "kind", "check", "latam_ok", "level", "number", "total_in_level",
             "stem", "endings", "forms", "inf", "verb", "a", "full", "persons", "group", "pdf", "answer_widths"}


def texts(document, part):
    """Every (path, text) that may need translating; a path is a list of keys and positions."""
    found = []

    def walk(value, path, block):
        if isinstance(value, str):
            if value.strip():
                found.append((path, value))
        elif isinstance(value, dict):
            for key, inner in value.items():
                if key in SKIP_KEYS:
                    continue
                walk(inner, path + [key], value if block is None and "type" in value else block)
        elif isinstance(value, list):
            for n, inner in enumerate(value):
                if learned_position(path, n, block, part):
                    continue  # always in the language you learn
                walk(inner, path + [n], block)

    walk(document, [], None)
    return found


def learned_position(path, n, block, part):
    """True for the place in a list that holds the learned language, such as the Spanish half of
    a word pair."""
    kind = block.get("type") if block else None
    if part == "themes":  # ["sin embargo", "however", "Llovía; [sin embargo], salimos.", "note"]
        return len(path) >= 4 and path[-2] == "items" and n in (0, 2)
    if part == "verbs_in_context":  # ["Ayer yo [hablé] con mi jefe.", "hablar", "note"]
        return len(path) >= 2 and path[-2] == "items" and n in (0, 1)
    if len(path) < 2:
        return False
    if kind == "verbpairs" and path[-2] == "items":
        return n == 0
    if kind == "conj" and path[-2] == "examples":
        return n == 0
    if kind == "mistakes" and path[-2] == "rows":
        return n in (0, 1)
    return False


def folder_of(course_id, part):
    return course.folder(course_id) / ("content" if part == "content" else part)


def sheet(source, name, part):
    document = json.loads((folder_of(source, part) / name).read_text(encoding="utf-8"))
    rows = [[n, "/".join(map(str, path)), text] for n, (path, text) in enumerate(texts(document, part))]
    SHEETS.mkdir(exist_ok=True)
    out = SHEETS / name
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{out}: {len(rows)} texts")


def apply(source, target, name, answers_file, part):
    document = json.loads((folder_of(source, part) / name).read_text(encoding="utf-8"))
    original = copy.deepcopy(document)
    answers = json.loads(Path(answers_file).read_text(encoding="utf-8"))
    for n, (path, text) in enumerate(texts(document, part)):
        if str(n) in answers:
            place = document
            for key in path[:-1]:
                place = place[key]
            place[path[-1]] = answers[str(n)]
    if part == "content":
        mark(original, document)
    out = folder_of(target, part) / name
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(document, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
    print(f"{out}: {len(answers)} texts translated")


def mark(original, document):
    """The marks that the first course gave by its English words, written out so they work in any
    language (see practice_items.py)."""
    for old, new in zip(original["blocks"], document["blocks"]):
        if old["type"] == "verbpairs" and old.get("title") == "Letter and name":
            new["kind"] = "letters"
        if old["type"] == "verbpairs" and old.get("title") == "Numbers":
            new["kind"] = "numbers"
        if old["type"] == "exercises":
            for old_item, new_item in zip(old["items"], new["items"]):
                if old_item.get("hint", "").startswith("translate"):
                    new_item["kind"] = "translate"
        if old["type"] == "mistakes":
            for old_row, new_row in zip(old["rows"], new["rows"]):
                if old_row[1].startswith("Both are correct") or old_row[0].startswith("Never say"):
                    new_row[3:] = ["advice"]


if __name__ == "__main__":
    args = sys.argv[1:]
    part = "content"
    if "--part" in args:
        part = args[args.index("--part") + 1]
        args = args[:args.index("--part")] + args[args.index("--part") + 2:]
    if args[0] == "sheet":
        sheet(args[1], args[2], part)
    else:
        apply(args[1], args[2], args[3], args[4], part)
