"""More correct answers for the word questions, made while the website data is built.

The same word often comes back in several chapters and word lists, sometimes with another
translation: "escuchar" is "to listen to" in A1 chapter 2 and "to listen" in A2 chapter 1. Each
question only knew its own answer, so a right translation could be marked wrong. Here every
translation that the course gives for a word anywhere becomes right everywhere, in both
directions:

    reverse (to your language):      escuchar -> to listen to, listen to, to listen, listen
    words (to the language you learn): to listen -> escuchar

Questions with a hint are left alone: the hint asks for one particular answer.
Extra answers by hand, for what the course itself doesn't give, are in extra_answers/<course>.json:
    {"reverse": {"escuchar": ["to hear"]}, "words": {"to listen": ["oír"]}}
The content files are not changed (Menno's rule): this only changes the website data."""
import json
from pathlib import Path

HERE = Path(__file__).parent
WORD_MODES = ("reverse", "words")


def key(text):
    """The text as a key: the same text with single spaces. Capitals and full stops count, so the
    greeting "Fine." is not mixed up with the word "fine" (a penalty)."""
    return " ".join(text.split())


def base_forms(text, lang):
    """A translation in your own language with the forms a reverse question accepts: an English
    verb with and without "to" (the course does the same in its own answers)."""
    forms = [text]
    if lang == "en" and text.lower().startswith("to ") and len(text) > 3:
        forms.append(text[3:])
    return forms


def _add(table, name, values):
    found = table.setdefault(key(name), [])
    for value in values:
        if value not in found:
            found.append(value)


def widen(items, articles, base_lang, extra=None):
    """Adds the other translations to the word questions in 'items' (a list, changed in place).
    articles: the articles of the language you learn ("el ", "la " ...), so a word question that
    wants the article keeps wanting it. base_lang: the language of the explanations ("en").
    Returns how many questions got more answers."""
    extra = extra or {}
    to_base, to_learn = {}, {}  # word you learn -> translations; translation -> words you learn
    for item in items:
        if item["mode"] not in WORD_MODES or item.get("hint"):
            continue
        if item["mode"] == "reverse":
            _add(to_base, item["prompt"], item["answers"])
            if "/" not in item["prompt"]:
                for answer in item["answers"]:
                    _add(to_learn, answer, [item["prompt"]])
        else:
            _add(to_learn, item["prompt"], item["answers"])
            for answer in item["answers"]:
                _add(to_base, answer, base_forms(item["prompt"], base_lang))
    for name, values in extra.get("reverse", {}).items():
        _add(to_base, name, values)
    for name, values in extra.get("words", {}).items():
        _add(to_learn, name, values)

    changed = 0
    for item in items:
        if item["mode"] not in WORD_MODES or item.get("hint"):
            continue
        table = to_base if item["mode"] == "reverse" else to_learn
        new = [a for a in table.get(key(item["prompt"]), []) if a not in item["answers"]]
        if item["mode"] == "words" and articles and any(a.lower().startswith(articles) for a in item["answers"]):
            # This question wants the article (el queso): don't add "queso" on its own
            new = [a for a in new if a.lower().startswith(articles)]
        if new:
            item["answers"] = item["answers"] + new
            changed += 1
    return changed


# ---------- sentences (PLAN 9.7b) ----------
# A sentence translation often has more than one right answer. extra_answers/translate_<language>.json
# lists them by the course's own answer, for every course that learns that language. Besides, in
# Spanish "they", "we" and "you (all)" don't say man or woman: ellos/ellas, nosotros/nosotras and
# vosotros/vosotras are both right when the sentence starts with them.
SWAP_START = {"es": {"Ellos": "Ellas", "Ellas": "Ellos", "Nosotros": "Nosotras", "Nosotras": "Nosotros",
                     "Vosotros": "Vosotras", "Vosotras": "Vosotros"}}


def sentence_answers(language):
    """{course answer: [other right answers]} for a language, from extra_answers/translate_<language>.json."""
    path = HERE / "extra_answers" / f"translate_{language}.json"
    if not path.exists():
        return {}
    return {key: value for key, value in json.loads(path.read_text(encoding="utf-8")).items() if not key.startswith("_")}


def widen_sentences(items, language):
    """Adds the other right answers to the sentence translations in 'items' (changed in place).
    Returns how many questions got more answers."""
    table, swaps = sentence_answers(language), SWAP_START.get(language, {})
    changed = 0
    for item in items:
        if item["mode"] != "translate" or not item["answers"]:
            continue
        main = item["answers"][0]
        new = list(table.get(main, []))
        for answer in [main] + new:
            marks = answer[:len(answer) - len(answer.lstrip("¿¡"))]
            first, _, rest = answer[len(marks):].partition(" ")
            if first in swaps:
                new.append(f"{marks}{swaps[first]} {rest}")
        new = [a for i, a in enumerate(new) if a not in item["answers"] and a not in new[:i]]
        if new:
            item["answers"] = item["answers"] + new
            changed += 1
    return changed


def extra_answers(course_id):
    """The answers added by hand for a course (extra_answers/<course>.json), or {}."""
    path = HERE / "extra_answers" / f"{course_id}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
