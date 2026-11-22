"""Builds courses/<course>/catalog.json from the content files and the PDFs of a course.
Run again with:  python build_catalog.py es_from_en   (only needed after adding PDFs).
Without a course id it rebuilds the catalogue of every course."""
import json, os, sys

import course

ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"]


def build(course_id):
    pdf_dir = course.pdf_folder(course_id)
    pdfs = sorted(f for f in os.listdir(pdf_dir) if f.lower().endswith(".pdf")) if pdf_dir.exists() else []
    items = []
    for path in sorted((course.folder(course_id) / "content").glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        meta = doc["meta"]
        prefix = f'{meta["level"]}_{int(meta["number"]):02d}_'  # A1_02_...
        match = [f for f in pdfs if f.startswith(prefix)]
        if not match:
            print("No PDF for", path)
            continue
        n_ex = sum(len(b.get("items", [])) for b in doc["blocks"] if b.get("type") == "exercises")
        items.append({
            "id": match[0][:-4], "file": match[0], "level": meta["level"], "number": int(meta["number"]),
            "section": meta.get("section", ""), "title": meta["title"], "subtitle": meta.get("subtitle", ""),
            "content": path.name, "exercise_count": n_ex})
    items.sort(key=lambda x: (ORDER.index(x["level"]), x["number"]))
    (course.folder(course_id) / "catalog.json").write_text(
        json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")
    print(course_id, len(items), "PDFs catalogued")


if __name__ == "__main__":
    for course_id in sys.argv[1:] or course.all_ids():
        build(course_id)
