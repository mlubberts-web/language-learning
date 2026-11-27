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
import json, re, shutil, sys
from pathlib import Path

import course
import languages
from practice_items import build_items, build_theme_items, modes
from answer_variants import widen, widen_sentences, extra_answers

HERE = Path(__file__).parent
OUT = HERE / "web" / "data"


def write(path, data):
    """Writes data as compact JSON (no spaces: the files are smaller to download)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


# On the website a unit is a "chapter", not a "PDF". The course files speak of PDFs (they were
# written for the PDFs), so the word is changed here, while the files are written for the site.
# Per language of the explanations: (pattern, replacement), in this order. File names such as
# "a1_01.pdf" are left alone (a "." or "/" before the word).
_NOT_FILE = r"(?<![./\w])"
CHAPTER_WORDS = {
    "en": [(r"\bfrom the PDF\b", "from the theory"), (r"(?<=· )(?i:pdf)\b", "Chapter"), (r"^PDF\b", "Chapter"), (_NOT_FILE + r"PDFs\b", "chapters"),
           (_NOT_FILE + r"(?i:pdf)\b", "chapter")],
    "nl": [(r"\buit de pdf\b", "uit de theorie"), (r"(?<=· )pdf\b", "Hoofdstuk"), (_NOT_FILE + r"pdf's", "hoofdstukken"),
           (r"\bDeze pdf\b", "Dit hoofdstuk"), (r"\bdeze pdf\b", "dit hoofdstuk"),
           (r"\bDie pdf\b", "Dat hoofdstuk"), (r"\bdie pdf\b", "dat hoofdstuk"),
           (r"\bDe volgende pdf\b", "Het volgende hoofdstuk"), (r"\bde volgende pdf\b", "het volgende hoofdstuk"),
           (r"\bde vorige pdf\b", "het vorige hoofdstuk"), (r"\bde pdf\b", "het hoofdstuk"),
           (r"^pdf\b", "Hoofdstuk"), (_NOT_FILE + r"(?i:pdf)\b", "hoofdstuk")],
    "es": [(r"\bdel (?i:pdf)\b(?! ?\d)", "de la teoría"), (r"(?<=· )pdf\b", "Capítulo"), (_NOT_FILE + r"(?i:pdfs)\b", "capítulos"),
           (r"\blos pdf\b", "los capítulos"), (r"^pdf\b", "Capítulo"), (_NOT_FILE + r"(?i:pdf)\b", "capítulo")],
}


def chapter_words(value, lang):
    """The same data with "PDF" changed into "chapter" in every text (see CHAPTER_WORDS)."""
    if isinstance(value, str):
        if "pdf" not in value.lower():
            return value
        for pattern, new in CHAPTER_WORDS[lang]:
            value = re.sub(pattern, new, value, flags=re.M)
        return value
    if isinstance(value, list):
        return [chapter_words(v, lang) for v in value]
    if isinstance(value, dict):
        return {k: (v if k == "file" else chapter_words(v, lang)) for k, v in value.items()}
    return value


def compare_boxes(course_id):
    """What replaces comparisons with another language than the learner's own, on the website
    (courses/<course>/compare_boxes.json, PLAN 9.10): {"boxes", "texts", "blocks"}, each keyed by
    "<content file without .json>#<block number>". The content files themselves are not changed."""
    path = course.folder(course_id) / "compare_boxes.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    changes = {}
    for kind in ("box", "texts", "block"):
        for key, change in data.get(kind + ("es" if kind == "box" else "s" if kind == "block" else ""), {}).items():
            changes.setdefault(key, []).append((kind, change))
    return changes


def _replace_text(value, old, new, found):
    if isinstance(value, str):
        if old in value:
            found.append(old)
            return value.replace(old, new)
        return value
    if isinstance(value, list):
        return [_replace_text(v, old, new, found) for v in value]
    if isinstance(value, dict):
        return {k: _replace_text(v, old, new, found) for k, v in value.items()}
    return value


def put_boxes(document, stem, changes, used):
    """The document with those changes made (a copy: the content file is not changed)."""
    blocks = list(document["blocks"])
    for key, todo in changes.items():
        name, number = key.rsplit("#", 1)
        if name != stem:
            continue
        number = int(number)
        for kind, change in todo:
            if kind == "box":
                if blocks[number].get("type") != "callout":
                    sys.exit(f"compare_boxes: {key} is not a box")
                blocks[number] = {"type": "callout", "kind": "compare", **change}
            elif kind == "block":
                if blocks[number].get("type") != change.get("type"):
                    sys.exit(f"compare_boxes: {key} is a {blocks[number].get('type')}, not a {change.get('type')}")
                blocks[number] = change
            else:
                for old, new in change:
                    found = []
                    blocks[number] = _replace_text(blocks[number], old, new, found)
                    if not found:
                        sys.exit(f"compare_boxes: '{old}' not found in {key}")
        used.add(key)
    return {**document, "blocks": blocks}


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
    lang = course.info(course_id)["explained_in"]
    count = 0
    unit_items = {}
    boxes, used_boxes = compare_boxes(course_id), set()
    for unit in catalog:
        document = json.loads((folder / "content" / unit["content"]).read_text(encoding="utf-8"))
        # The comparison boxes and texts for this course's learners (compare_boxes.json), also in the exercises
        shown = put_boxes(document, Path(unit["content"]).stem, boxes, used_boxes)
        items = build_items(unit["id"], shown, course_id)
        count += len(items)
        unit_items[unit["id"]] = items  # written below, after the extra answers are added
        write(out / "units" / f"{unit['id']}.json", chapter_words(shown, lang))
        # The number of pages in the web reader: the parts between the "pagebreak" blocks
        parts, size = 0, 0
        for block in document["blocks"] + [{"type": "pagebreak"}]:
            if block["type"] == "pagebreak":
                parts, size = parts + (size > 0), 0
            else:
                size += 1
        unit["web_pages"] = parts
    if set(boxes) - used_boxes:
        sys.exit(f"{course_id}: compare_boxes.json names blocks that don't exist: {sorted(set(boxes) - used_boxes)}")
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
    write(out / "verbs.json", verb_practice(course_id))

    themes, theme_items = {}, {}
    for path in sorted((folder / "themes").glob("*.json")):  # path.stem: the name without .json
        theme = json.loads(path.read_text(encoding="utf-8"))
        theme_items[path.stem] = build_theme_items(path.stem, theme, course_id)
        count += len(theme_items[path.stem])
        themes[path.stem] = {"title": theme["title"], "kind": theme.get("kind", "topic"),
                             "lists": [{"name": part["name"], "level": part["level"]} for part in theme["lists"]]}

    # Every translation the course gives for a word counts everywhere (answer_variants.py)
    learn = course.info(course_id)["learn"]
    every = [item for items in list(unit_items.values()) + list(theme_items.values()) for item in items]
    widened = widen(every, tuple(languages.profile(learn)["articles"]), lang, extra_answers(course_id))
    widened += widen_sentences(every, learn)  # other right wordings of the sentence translations
    for unit_id, items in unit_items.items():
        write(out / "items" / f"{unit_id}.json", chapter_words([compact(item) for item in items], lang))
    for name, items in theme_items.items():
        themes[name]["items"] = chapter_words([compact(item) for item in items], lang)
    write(out / "themes.json", themes)

    info = course.info(course_id)
    entry = {**info, "modes": [{"id": mode, "title": title, "text": chapter_words(text, lang)}
                               for mode, title, text in modes(course_id)],
             "levels": sorted({unit["level"] for unit in catalog}), "units": len(catalog), "questions": count}
    print(f"{course_id}: {len(catalog)} units, {count} questions, {widened} with more answers")
    return entry


def verb_practice(course_id):
    """The sentences of the Verb practice tab: verb_bank/<language>.json (new sentences per tense)
    plus the course's own verbs in context. Each: [sentence with the verb in [brackets], infinitive,
    tense id or None, note]. A tense is known for the bank and for chapters about one tense
    (verb_bank/tenses.json, "from_chapters"); the others only come in "find the tense" mode."""
    info = course.info(course_id)
    learn, base = info["learn"], info["explained_in"]
    tenses = json.loads((HERE / "verb_bank" / "tenses.json").read_text(encoding="utf-8"))
    by_chapter = tenses["from_chapters"].get(learn, {})
    sentences, seen = [], set()
    # verb_bank/es.json, es_2.json, es_3.json ...: the bank of a language may be split over files
    banks = [HERE / "verb_bank" / f"{learn}.json"] + sorted((HERE / "verb_bank").glob(f"{learn}_*.json"))
    for bank in banks:
        if not bank.exists():
            continue
        for tense, rows in json.loads(bank.read_text(encoding="utf-8")).items():
            for row in rows:
                if row[0] not in seen:
                    seen.add(row[0])
                    sentences.append([row[0], row[1], tense, row[2] if len(row) > 2 else ""])
    for path in sorted((course.folder(course_id) / "verbs_in_context").glob("*.json")):
        for row in json.loads(path.read_text(encoding="utf-8"))["items"]:
            if row[0] not in seen:
                seen.add(row[0])
                sentences.append([row[0], row[1], by_chapter.get(path.stem), row[2] if len(row) > 2 else ""])
    return {"tenses": [{"id": t["id"], "level": t["level"], "name": t["name"][base]} for t in tenses.get(learn, [])],
            "sentences": sentences}


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
