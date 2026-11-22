"""Adds translations to ui_text/nl.json and ui_text/es.json.
usage: python ui_text/add_translations.py <file with triples>

The file is a JSON list of [English, Dutch, Spanish] triples. Existing translations are replaced
by the new ones, others stay. The files are written sorted, so changes are easy to see in Git.
Dutch uses 'je', Spanish uses 'tú' and the Spanish of Spain."""
import json, sys
from pathlib import Path

FOLDER = Path(__file__).parent
triples = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for column, code in ((1, "nl"), (2, "es")):
    path = FOLDER / f"{code}.json"
    table = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for triple in triples:
        table[triple[0]] = triple[column]
    path.write_text(json.dumps(dict(sorted(table.items())), ensure_ascii=False, indent=1) + "\n",
                    encoding="utf-8", newline="\n")
    print(code, len(table), "translations")
