"""Checks that every text on screen has a Dutch and a Spanish translation.
Run with:  .venv\\Scripts\\python.exe test_ui_text.py

It reads the code of every .py file and finds each t("...") and mark("...") with a fixed text.
That text must be in ui_text/nl.json and ui_text/es.json, with the same {values} in it.
It also lists translations that the code no longer uses, so the files stay tidy."""
import ast, string
from pathlib import Path

import ui_text

HERE = Path(__file__).parent
problems = []


def placeholders(text):
    """The names between { } in a text: '{done} of {total}' gives {'done', 'total'}."""
    return {name for _, name, _, _ in string.Formatter().parse(text) if name}


used = {}  # text -> where it is used
for path in sorted(HERE.glob("*.py")):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):  # every piece of the code
        if not isinstance(node, ast.Call):
            continue
        name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
        if name not in ("t", "mark") or not node.args:
            continue
        first = node.args[0]
        if isinstance(first, ast.Constant) and isinstance(first.value, str):
            used.setdefault(first.value, f"{path.name}:{node.lineno}")
        elif isinstance(first, ast.JoinedStr):  # an f-string can't be looked up in the files
            problems.append(f"{path.name}:{node.lineno}: t() with an f-string; use t('... {{name}}', name=...)")

for code in ("nl", "es"):
    table = ui_text.table(code)
    for text, where in sorted(used.items()):
        if text not in table:
            problems.append(f"{code}: no translation for {text!r} ({where})")
        elif placeholders(table[text]) != placeholders(text):
            problems.append(f"{code}: other {{values}} in the translation of {text!r}")
    unused = sorted(set(table) - set(used))
    if unused:
        print(f"{code}: {len(unused)} translations are no longer used, for example {unused[:3]}")

print(f"{len(used)} texts on screen")
if problems:
    print(f"{len(problems)} PROBLEMS:")
    for problem in problems[:80]:
        print(" -", problem)
else:
    print("All texts are translated.")
