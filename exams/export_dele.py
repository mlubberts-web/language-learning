"""Turns the official DELE model exams (Menno's PDFs) into the files of the exam room (PLAN 9.11).
Run with:  .venv\\Scripts\\python.exe exams\\export_dele.py C:\\Users\\mlubb\\Desktop\\DeleMockExams [output folder]

The output folder (default: DeleExamsForSite next to the PDFs) is NOT part of this project: the
exams belong to the Instituto Cervantes and the repository is public. It is uploaded once into the
private storage of the website (the "exams" bucket, see supabase/exams.sql) through the upload
button on the admin page, and only accounts with access can open it.

What it writes:
    index.json            the exams: per level its parts (pages, minutes, tasks, answer key)
    <level>/p01.jpg ...   every page as a picture, so it shows on every phone and computer
    <level>/exam.pdf      the original PDF, to download

The structure below (which pages, how long, which questions per task) was read from the PDFs by
hand. The answer keys are read from the PDFs here, so they never have to be typed into this file."""
import json, re, shutil, sys
from pathlib import Path

import pymupdf

# Per level: the file, and its parts. "pages": the candidate's pages (first, last), without the
# answer key and transcripts. "key": the page with the answer key and which part of it.
# "transcript": the pages of the listening transcript (used when there is no audio).
EXAMS = {
    "A1": {"file": "dele-modelo-0-a1.pdf", "title": "DELE A1 · Modelo 0", "parts": [
        {"id": "reading", "name": "Comprensión de lectura", "kind": "choices", "pages": [2, 9], "minutes": 45,
         "tasks": [[1, 5], [6, 11], [12, 17], [18, 25]], "key": {"page": 16, "section": "PRUEBA 1"}},
        {"id": "listening", "name": "Comprensión auditiva", "kind": "choices", "pages": [11, 15], "minutes": 25,
         "tasks": [[1, 5], [6, 10], [11, 18], [19, 25]], "key": {"page": 16, "section": "PRUEBA 2"}, "transcript": [17, 28]},
        {"id": "writing", "name": "Expresión e interacción escritas", "kind": "writing", "pages": [29, 30], "minutes": 25, "texts": 2},
        {"id": "speaking", "name": "Expresión e interacción orales", "kind": "speaking", "pages": [33, 39], "minutes": 10, "prepare": 10}]},
    "A2": {"file": "dele-modelo-0-a2.pdf", "title": "DELE A2 · Modelo 0", "parts": [
        {"id": "reading", "name": "Comprensión de lectura", "kind": "choices", "pages": [2, 10], "minutes": 60,
         "tasks": [[1, 5], [6, 13], [14, 19], [20, 25]], "key": {"page": 16, "section": "PRUEBA 1"}},
        {"id": "listening", "name": "Comprensión auditiva", "kind": "choices", "pages": [11, 15], "minutes": 40,
         "tasks": [[1, 6], [7, 12], [13, 18], [19, 25]], "key": {"page": 16, "section": "PRUEBA 2"}, "transcript": [17, 28]},
        {"id": "writing", "name": "Expresión e interacción escritas", "kind": "writing", "pages": [29, 30], "minutes": 45, "texts": 2},
        {"id": "speaking", "name": "Expresión e interacción orales", "kind": "speaking", "pages": [33, 38], "minutes": 10, "prepare": 12}]},
    "B1": {"file": "dele-modelo-0-b1.pdf", "title": "DELE B1 · Modelo 0", "parts": [
        {"id": "reading", "name": "Comprensión de lectura", "kind": "choices", "pages": [4, 15], "minutes": 70,
         "tasks": [[1, 6], [7, 12], [13, 18], [19, 24], [25, 30]], "key": {"page": 16}},
        {"id": "listening", "name": "Comprensión auditiva", "kind": "choices", "pages": [18, 24], "minutes": 40,
         "tasks": [[1, 6], [7, 12], [13, 18], [19, 24], [25, 30]], "key": {"page": 25}, "transcript": [26, 34]},
        {"id": "writing", "name": "Expresión e interacción escritas", "kind": "writing", "pages": [36, 39], "minutes": 60, "texts": 2},
        {"id": "speaking", "name": "Expresión e interacción orales", "kind": "speaking", "pages": [41, 46], "minutes": 15, "prepare": 15}]},
    "B2": {"file": "dele-modelo-0-b2.pdf", "title": "DELE B2 · Modelo 0", "parts": [
        {"id": "reading", "name": "Comprensión de lectura", "kind": "choices", "pages": [4, 13], "minutes": 70,
         "tasks": [[1, 6], [7, 16], [17, 22], [23, 36]], "key": {"page": 14}},
        {"id": "listening", "name": "Comprensión auditiva", "kind": "choices", "pages": [16, 22], "minutes": 40,
         "tasks": [[1, 6], [7, 12], [13, 18], [19, 24], [25, 30]], "key": {"page": 23}, "transcript": [24, 33]},
        {"id": "writing", "name": "Expresión e interacción escritas", "kind": "writing", "pages": [35, 39], "minutes": 80, "texts": 2},
        {"id": "speaking", "name": "Expresión e interacción orales", "kind": "speaking", "pages": [41, 47], "minutes": 20, "prepare": 20}]},
    "C1": {"file": "dele-modelo-0-c1.pdf", "title": "DELE C1 · Modelo 0", "parts": [
        {"id": "reading", "name": "Comprensión de lectura y uso de la lengua", "kind": "choices", "pages": [2, 14], "minutes": 90,
         "tasks": [[1, 6], [7, 12], [13, 18], [19, 26], [27, 40]], "key": {"page": 39, "first": 0, "count": 40}},
        {"id": "listening", "name": "Comprensión auditiva y uso de la lengua", "kind": "choices", "pages": [15, 19], "minutes": 50,
         "tasks": [[1, 6], [7, 14], [15, 20], [21, 30]], "key": {"page": 39, "first": 40, "count": 30}, "transcript": [20, 31]},
        {"id": "writing", "name": "Destrezas integradas: comprensión auditiva y expresión e interacción escritas", "kind": "writing",
         "pages": [32, 33], "minutes": 80, "texts": 2},
        {"id": "speaking", "name": "Destrezas integradas: comprensión de lectura y expresión e interacción orales", "kind": "speaking",
         "pages": [34, 38], "minutes": 20, "prepare": 20}]},
    # The C2 file is an explanation of the exam with one example per task, without an answer key
    "C2": {"file": "dele-modelo-0-c2.pdf", "title": "DELE C2 · Explicación y ejemplo", "examples_only": True, "parts": [
        {"id": "reading", "name": "Uso de la lengua, comprensión de lectura y comprensión auditiva", "kind": "examples", "pages": [3, 14], "minutes": 105},
        {"id": "writing", "name": "Destrezas integradas: comprensión auditiva y de lectura y expresión e interacción escritas", "kind": "writing",
         "pages": [15, 21], "minutes": 150, "texts": 3},
        {"id": "speaking", "name": "Destrezas integradas: comprensión de lectura y expresión e interacción orales", "kind": "speaking",
         "pages": [22, 29], "minutes": 20, "prepare": 30}]},
}

DPI = 140  # an A4 page becomes about 1160 pixels wide: sharp on a laptop, small enough for a phone


def key_tokens(text):
    """The answers on a key page, in order: "1C 2E ..." or a table "1 2 3 A B C" (A1, A2)."""
    pairs = re.findall(r"\b(\d{1,2})([A-L])\b", text)
    if len(pairs) >= 5:
        return [(int(n), letter) for n, letter in pairs]
    found, numbers = [], []
    for word in text.split():
        if word.isdigit() and int(word) <= 60:
            numbers.append(int(word))
        elif re.fullmatch(r"[A-L]", word) and numbers:
            found.append((numbers.pop(0), word))
            if not numbers:
                numbers = []
    return found


def answer_key(document, part):
    spec = part["key"]
    text = " ".join(document[spec["page"] - 1].get_text().split())
    if "section" in spec:  # A1, A2: one page with both keys, "PRUEBA 2: ..." and "PRUEBA 1: ..."
        start = text.index(spec["section"])
        others = [text.find(name, start + 1) for name in ("PRUEBA 1", "PRUEBA 2") if text.find(name, start + 1) > 0]
        text = text[start:min(others)] if others else text[start:]
    tokens = key_tokens(text)
    if "count" in spec:  # C1: both keys after each other, numbered from 1 each time
        tokens = tokens[spec["first"]:spec["first"] + spec["count"]]
    key = {str(n): letter for n, letter in tokens}
    last = part["tasks"][-1][1]
    missing = [n for n in range(1, last + 1) if str(n) not in key]
    if missing:
        sys.exit(f"{part['id']}: no answer found for questions {missing}")
    return {str(n): key[str(n)] for n in range(1, last + 1)}


def main():
    source = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else source.parent / "DeleExamsForSite"
    if out.exists():
        shutil.rmtree(out)
    index = {"exams": []}
    for level, exam in EXAMS.items():
        path = source / exam["file"]
        if not path.exists():
            print(f"{level}: {exam['file']} not found, left out")
            continue
        folder = out / level.lower()
        folder.mkdir(parents=True)
        shutil.copy(path, folder / "exam.pdf")
        with pymupdf.open(path) as document:
            for number, page in enumerate(document, start=1):
                page.get_pixmap(dpi=DPI).save(folder / f"p{number:02d}.jpg", jpg_quality=78)
            parts = []
            for part in exam["parts"]:
                entry = {key: value for key, value in part.items() if key != "key"}
                if "key" in part:
                    entry["answers"] = answer_key(document, part)
                parts.append(entry)
            index["exams"].append({"level": level, "title": exam["title"], "folder": level.lower(),
                                   "pages": document.page_count, "examples_only": exam.get("examples_only", False), "parts": parts})
        keyed = sum(len(p.get("answers", {})) for p in parts)
        print(f"{level}: {len(parts)} parts, {keyed} answers in the key")
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    files = sum(1 for f in out.rglob("*") if f.is_file())
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"Written to {out}: {files} files, {size / 1e6:.1f} MB")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
