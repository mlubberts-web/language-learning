# Categories

The units of each language grouped by subject, for the "By subject" view of the website
(for example all units about verb tenses). One file per language you learn, used by both
courses of that language: `es.json` for es_from_en and es_from_nl, and so on.

Each category has a name in English, Dutch and Spanish, and its units as "level number",
for example "A2 5" for unit 5 of A2. A unit may be in more than one category. build_web.py
checks that every unit exists and that every unit is in at least one category.
