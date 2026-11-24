"""Checks that every text on the new website has a Dutch and a Spanish translation, with the same
{values} in it as the English text.
Run with:  .venv\\Scripts\\python.exe test_web_text.py
A missing one: add it to ui_text/web_nl.json and ui_text/web_es.json."""
import re, sys

from find_web_texts import missing, tables, web_texts

sys.stdout.reconfigure(encoding="utf-8")
problems = []
for lang, texts in missing().items():
    problems += [f"MISSING {lang}: {text}" for text in texts]
holes = lambda text: sorted(re.findall(r"\{(\w+)\}", text))  # the {values} in a text
for lang, table in tables().items():
    for text in web_texts():
        if text in table and holes(text) != holes(table[text]):
            problems.append(f"VALUES {lang}: {text} -> {table[text]}")
print("\n".join(problems))
if problems:
    sys.exit(1)
print(f"All texts are translated. {len(web_texts())} texts on the website, in Dutch and Spanish.")
