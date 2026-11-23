"""Checks the PDF generator (make_pdfs.py) on a few content files of every course.
Run with:  .venv\\Scripts\\python.exe test_pdfs.py
It writes the PDFs to a temporary folder, never to static/. Needs ReportLab (pip install reportlab);
without it, it says so and stops, because the app itself doesn't need it."""
import json, tempfile
from pathlib import Path

try:
    import make_pdfs
except ImportError:
    raise SystemExit("ReportLab is not installed: pip install reportlab")
import pymupdf

import course

problems = []
SAMPLE = 3  # PDFs per course: the first, the middle and the last content file

for course_id in course.all_ids():
    paths = sorted((course.folder(course_id) / "content").glob("*.json"))
    picks = {paths[0], paths[len(paths) // 2], paths[-1]} if paths else set()
    with tempfile.TemporaryDirectory() as folder:
        for path in sorted(picks):
            meta = json.loads(path.read_text(encoding="utf-8"))["meta"]
            try:
                out = make_pdfs.make_pdf(course_id, path, folder)
            except Exception as error:  # any error at all is a problem worth reporting
                problems.append(f"{course_id} {path.name}: {type(error).__name__}: {error}")
                continue
            with pymupdf.open(out) as doc:
                text = "".join(page.get_text() for page in doc)
                if doc.page_count < 2:
                    problems.append(f"{course_id} {path.name}: only {doc.page_count} page")
                if meta["title"].split()[0] not in text:
                    problems.append(f"{course_id} {path.name}: the title is missing")
                if "�" in text or "■" in text:
                    problems.append(f"{course_id} {path.name}: characters the font can't show")
    for pdf in course.pdf_folder(course_id).glob("*.pdf"):
        if not pdf.name.isascii():  # an accent in a file name can break the link to it
            problems.append(f"{course_id} {pdf.name}: the file name has letters outside ASCII")
    print(f"{course_id}: {len(picks)} PDFs made")

if problems:
    print(f"{len(problems)} PROBLEMS:")
    for problem in problems:
        print(" -", problem)
else:
    print("All PDFs made without problems.")
