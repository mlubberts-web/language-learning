"""Builds the data files of the new website (the web/ folder) from the course files in courses/.
Run with:  .venv\\Scripts\\python.exe build_web.py

The website itself is plain HTML, CSS and JavaScript in web/. It can't read the course files
directly, and it shouldn't have to know how questions are made from them, so this script does
that once and writes the result as JSON files in web/data/ (that folder is made again every time
and is not kept in git):

    web/data/courses.json                  the courses, their languages and exercise types
    web/data/languages.json                the rules of each language (accents, ñ, pronouns ...)
    web/data/ui/nl.json, es.json           the translated interface texts
    web/data/<course>/catalog.json         the units of the course
    web/data/<course>/items/<unit>.json    the practice questions of one unit
    web/data/<course>/units/<unit>.json    the text of one unit, for the reader
    web/data/<course>/themes.json          the themed word lists and their questions

The questions are made by practice_items.py, the same code the Streamlit app uses, so both
sites ask exactly the same questions."""
import json, shutil, sys
from pathlib import Path

import course
import languages
from practice_items import build_items, build_theme_items, modes

HERE = Path(__file__).parent
OUT = HERE / "web" / "data"


def write(path, data):
    """Writes data as compact JSON (no spaces: the files are smaller to download)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def compact(item):
    """A question without its empty parts ("" or [] or None): the browser fills those in again.
    That makes the files about a third smaller."""
    return {key: value for key, value in item.items() if value not in ("", [], (), None)}


def language_rules():
    """languages.py as JSON. Sets and tuples become lists, because JSON only knows lists."""
    rules = {}
    for code, profile in languages.PROFILES.items():
        rules[code] = {key: sorted(value) if isinstance(value, set) else
                       list(value) if isinstance(value, tuple) else value
                       for key, value in profile.items()}
    return {"profiles": rules, "names": languages.NAMES}


def build_course(course_id):
    """Writes the files of one course and returns its entry for courses.json."""
    folder = course.folder(course_id)
    out = OUT / course_id
    catalog = json.loads((folder / "catalog.json").read_text(encoding="utf-8"))
    count = 0
    for unit in catalog:
        document = json.loads((folder / "content" / unit["content"]).read_text(encoding="utf-8"))
        items = build_items(unit["id"], document, course_id)
        count += len(items)
        write(out / "items" / f"{unit['id']}.json", [compact(item) for item in items])
        write(out / "units" / f"{unit['id']}.json", document)
    write(out / "catalog.json", catalog)

    themes = {}
    for path in sorted((folder / "themes").glob("*.json")):  # path.stem: the name without .json
        theme = json.loads(path.read_text(encoding="utf-8"))
        items = build_theme_items(path.stem, theme, course_id)
        count += len(items)
        themes[path.stem] = {"title": theme["title"], "kind": theme.get("kind", "topic"),
                             "lists": [{"name": part["name"], "level": part["level"]} for part in theme["lists"]],
                             "items": [compact(item) for item in items]}
    write(out / "themes.json", themes)

    info = course.info(course_id)
    entry = {**info, "modes": [{"id": mode, "title": title, "text": text}
                               for mode, title, text in modes(course_id)],
             "levels": sorted({unit["level"] for unit in catalog}), "units": len(catalog), "questions": count}
    print(f"{course_id}: {len(catalog)} units, {count} questions")
    return entry


def main():
    if OUT.exists():
        shutil.rmtree(OUT)  # start clean, so nothing old stays behind
    entries = [build_course(course_id) for course_id in course.all_ids()]
    write(OUT / "courses.json", entries)
    write(OUT / "languages.json", language_rules())
    (OUT / "ui").mkdir()
    for lang in ("nl", "es"):  # English needs no file: the texts in the code are English
        shutil.copy(HERE / "ui_text" / f"{lang}.json", OUT / "ui" / f"{lang}.json")
    size = sum(path.stat().st_size for path in OUT.rglob("*") if path.is_file())
    print(f"Website data written to web/data: {size / 1e6:.1f} MB")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
