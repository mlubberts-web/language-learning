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
    web/data/<course>/pdf/                 the PDFs, to download
    web/data/<course>/categories.json      the units by subject (from categories/)

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


def categories(course_id, catalog):
    """The categories of the course (categories/<language>.json), with the names in the language of
    the explanations and the unit ids instead of "A2 5". Stops with an error when a unit doesn't
    exist or a unit is in no category, so a mistake can't reach the website."""
    info = course.info(course_id)
    source = json.loads((HERE / "categories" / f"{info['learn']}.json").read_text(encoding="utf-8"))
    by_place = {f"{unit['level']} {unit['number']}": unit["id"] for unit in catalog}
    used = set()
    result = []
    for category in source:
        missing = [place for place in category["units"] if place not in by_place]
        if missing:
            sys.exit(f"categories/{info['learn']}.json: {category['id']} has units that don't exist: {missing}")
        used |= set(category["units"])
        result.append({"id": category["id"], "name": category["name"][info["explained_in"]],
                       "units": [by_place[place] for place in category["units"]]})
    left = sorted(set(by_place) - used)
    if left:
        sys.exit(f"categories/{info['learn']}.json: these units are in no category: {left}")
    return result


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
        # The number of pages in the web reader: the parts between the "pagebreak" blocks
        parts, size = 0, 0
        for block in document["blocks"] + [{"type": "pagebreak"}]:
            if block["type"] == "pagebreak":
                parts, size = parts + (size > 0), 0
            else:
                size += 1
        unit["web_pages"] = parts
    # The number of pages of each PDF: the study plan estimates reading time from it
    import pymupdf
    for unit in catalog:
        path = course.pdf_folder(course_id) / unit["file"]
        if path.exists():
            with pymupdf.open(path) as pdf:
                unit["pages"] = pdf.page_count
    write(out / "catalog.json", catalog)
    # The PDFs, for the "Download PDF" button in the reader
    pdfs = course.pdf_folder(course_id)
    (out / "pdf").mkdir(parents=True, exist_ok=True)
    for unit in catalog:
        if (pdfs / unit["file"]).exists():
            shutil.copy(pdfs / unit["file"], out / "pdf" / unit["file"])

    write(out / "categories.json", categories(course_id, catalog))

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
    # The translations: the ones shared with the Streamlit app, plus the website's own
    # (ui_text/web_nl.json, web_es.json). English needs no file: the texts in the code are English.
    from find_web_texts import tables
    for lang, table in tables().items():
        write(OUT / "ui" / f"{lang}.json", table)
    size = sum(path.stat().st_size for path in OUT.rglob("*") if path.is_file())
    print(f"Website data written to web/data: {size / 1e6:.1f} MB")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
