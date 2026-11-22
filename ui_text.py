"""The texts on screen in the interface language: English, Dutch or Spanish. No screens here.

Every text on screen goes through t(). The English text itself is the key; ui_text/nl.json and
ui_text/es.json give the Dutch and Spanish for each one:

    t("Your progress")                          -> "Je voortgang" in Dutch
    t("{done} of {total} PDFs done", done=3, total=9)
                                                -> "3 van 9 pdf's klaar"

Values go in as {name} and are filled in after translating, so a translation can put them in
another order. The interface language is the language of the course's explanations
(course.json: "explained_in"). A text without a translation stays English; test_ui_text.py
checks that this never happens.
"""
import json
from functools import lru_cache
from pathlib import Path

import course

FOLDER = Path(__file__).parent / "ui_text"
LANGUAGES = ("en", "nl", "es")


def interface(course_id=None):
    """The interface language of a course, for example 'nl'."""
    return course.info(course_id)["explained_in"]


@lru_cache  # each file is read once
def table(code):
    path = FOLDER / f"{code}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def mark(text):
    """Marks a text for translation without translating it yet, for texts in a list at the top of
    a file (such as the section names), which t() translates later when they are shown. The
    test finds the texts through this mark."""
    return text


def t(text, lang=None, **values):
    """The text in the interface language (or in 'lang'), with the {values} filled in."""
    code = lang or interface()
    if code != "en":
        text = table(code).get(text, text)
    return text.format(**values) if values else text


# ---------- dates ----------
DAYS = {"en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "nl": ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"],
        "es": ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]}
MONTHS = {"en": ["January", "February", "March", "April", "May", "June", "July", "August",
                 "September", "October", "November", "December"],
          "nl": ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus",
                 "september", "oktober", "november", "december"],
          "es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
                 "septiembre", "octubre", "noviembre", "diciembre"]}


def day_name(day, lang=None):
    """'Monday' for a date; day.weekday() is 0 on Monday."""
    return DAYS[lang or interface()][day.weekday()]


def month_name(day, lang=None):
    return MONTHS[lang or interface()][day.month - 1]


def short_date(day, lang=None):
    """'4 December' / '4 december' / '4 de diciembre'."""
    code = lang or interface()
    return f"{day.day} de {month_name(day, code)}" if code == "es" else f"{day.day} {month_name(day, code)}"


def long_date(day, lang=None):
    """'Friday 4 December' / 'vrijdag 4 december' / 'viernes 4 de diciembre'."""
    code = lang or interface()
    return f"{day_name(day, code)} {short_date(day, code)}"
