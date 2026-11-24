"""Lists the interface texts of the new website (web/js) and which ones have no Dutch or Spanish
translation yet. test_web_text.py uses this; run it on its own to see what to translate.
Run with:  .venv\\Scripts\\python.exe find_web_texts.py

The translations are ui_text/nl.json and es.json (shared with the Streamlit app) plus
ui_text/web_nl.json and web_es.json for texts only the website has."""
import json, re, sys
from pathlib import Path

HERE = Path(__file__).parent
# t("...") with a fixed text
CALL = re.compile(r'\bt\(\s*"((?:[^"\\]|\\.)*)"')
# Every text on a line that ends in the comment  // t-list  (lists that t() translates later),
# or that calls counted(...) (one text for 1, another for more)
TEXT = re.compile(r'"((?:[^"\\]|\\.)*)"')
# Names in those lists that are never shown: icons, tab names, colour classes, numbers
NOT_SHOWN = {"", "10", "20", "book", "calendar", "chart", "list", "clock", "c0", "c1", "c2", "c3", "c4", "off",
             "future deadline", "coming", "overview", "mocks", "settings", "week", "trends", "levels", "weak",
             "topic", "language", "schedule", "progress", "words", "exams"}


def web_texts():
    texts = set()
    for path in sorted((HERE / "web" / "js").rglob("*.js")):
        source = path.read_text(encoding="utf-8")
        texts |= {json.loads(f'"{m}"') for m in CALL.findall(source)}
        for line in source.splitlines():
            if "// t-list" in line:
                texts |= {json.loads(f'"{m}"') for m in TEXT.findall(line.split("// t-list")[0])}
            elif "counted(" in line and "const counted" not in line:
                texts |= {json.loads(f'"{m}"') for m in TEXT.findall(line) if "{count}" in m}
    return texts - NOT_SHOWN


def tables():
    """For nl and es: the shared translations with the website's own on top."""
    result = {}
    for lang in ("nl", "es"):
        table = json.loads((HERE / "ui_text" / f"{lang}.json").read_text(encoding="utf-8"))
        extra = HERE / "ui_text" / f"web_{lang}.json"
        if extra.exists():
            table.update(json.loads(extra.read_text(encoding="utf-8")))
        result[lang] = table
    return result


def missing():
    found = tables()
    texts = web_texts()
    return {lang: sorted(text for text in texts if text not in found[lang]) for lang in found}


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    gaps = missing()
    print(len(web_texts()), "texts;", {lang: len(v) for lang, v in gaps.items()}, "without a translation")
    print(json.dumps(gaps["nl"], ensure_ascii=False, indent=0))
