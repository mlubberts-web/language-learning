"""After content_sheet.py apply: lists texts that are still the same as in the source course and look
English, so a forgotten translation is found before it reaches a PDF.
usage: python check_translation.py es_from_en es_from_nl [--part content|themes|verbs_in_context]"""
import json, re, sys

import content_sheet

ENGLISH = re.compile(r"\b(the|and|of|is|are|with|to|you|your|for|this|that|before|after|only|not|"
                     r"in a|at the|or|when|which|who|it|do|does|can|must|from|like)\b", re.IGNORECASE)


def leftovers(source, target, part="content"):
    found = []
    for path in sorted(content_sheet.folder_of(target, part).glob("*.json")):
        old = json.loads((content_sheet.folder_of(source, part) / path.name).read_text(encoding="utf-8"))
        new = json.loads(path.read_text(encoding="utf-8"))
        for (where, old_text), (_, new_text) in zip(content_sheet.texts(old, part), content_sheet.texts(new, part)):
            plain = re.sub(r"<[^>]+>", "", new_text)
            if old_text == new_text and ENGLISH.search(plain) and len(plain.split()) > 1:
                found.append(f"{path.name} {'/'.join(map(str, where))}: {plain[:90]}")
    return found


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    part = args[args.index("--part") + 1] if "--part" in args else "content"
    found = leftovers(args[0], args[1], part)
    print("\n".join(found) if found else "No English left over.")
