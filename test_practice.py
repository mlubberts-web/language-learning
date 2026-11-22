"""Checks the rules of practising (grading, rounds, review) with real questions of the Spanish course.
Run with:  .venv\\Scripts\\python.exe test_practice.py
Use this after changing the practice files or the content. It does not touch your progress."""
import collections, json, tempfile
from pathlib import Path

import practice_logic as logic
import course
import languages
import practice_store as store
from practice_items import build_items, modes, build_theme_items, clean_text, without_accents
from test_content import LATIN_AMERICAN, check_course

HERE = Path(__file__).parent
COURSE_ID = "es_from_en"  # the course whose content is checked
COURSE = course.folder(COURSE_ID)
problems = []


def expect(condition, message):
    if not condition:
        problems.append(message)


# ---------- every question of the Spanish course (the checks are in test_content.py) ----------
catalog = json.loads((COURSE / "catalog.json").read_text(encoding="utf-8"))
all_items, totals, theme_words = check_course(COURSE_ID, expect)
print(f"Themed lists: {theme_words} entries")
print("Questions per exercise type:")
for mode, title, _ in modes(COURSE_ID):
    print(f"  {title}: {totals[mode]}")
print(f"  Total: {sum(totals.values())}")

# ---------- grading rules, with real cases from the audit ----------
by_prompt = {(i["id"].split("|")[0][:5], i["mode"], i["prompt"]): i for i in all_items}


def grade(key, typed):
    return logic.check_answer(by_prompt[key], typed)[0]


cases = [
    # the accent is the exercise: a missing accent is wrong
    (("A1_01", "fill", "telefono"), "telefono", "wrong"),
    (("A1_01", "fill", "telefono"), "teléfono", "right"),
    # the capital is the mistake: wrong if it stays; the other capitals don't matter
    (("A1_01", "fix", "Hablo Español."), "Hablo Español.", "wrong"),
    (("A1_01", "fix", "Hablo Español."), "Hablo español.", "right"),
    (("A1_01", "fix", "Hablo Español."), "hablo español", "right"),
    # the comma is the mistake in this one, and the only place where a comma counts
    (("C1_08", "fix", "Mi hermano, vive en Madrid."), "Mi hermano, vive en Madrid.", "wrong"),
    (("C1_08", "fix", "Mi hermano, vive en Madrid."), "Mi hermano vive en Madrid", "right"),
    # capitals and a missing dot are nothing at all, without even a warning
    (("A2_01", "words", "to dance"), "bailar", "right"),
    (("A1_09", "words", "Monday"), "LUNES", "right"),
    (("A1_09", "words", "Monday"), "Lunes", "right"),
    (("A1_09", "words", "mother"), "la madre", "right"),
    (("A2_01", "translate", "Yesterday I ate paella in a bar."), "Ayer comí paella en un bar", "right"),
    (("A2_01", "translate", "Yesterday I ate paella in a bar."), "ayer comí paella en un bar.", "right"),
    # question and exclamation marks are yellow
    (("A1_09", "fill", "Where is the station?"), "¿Dónde está la estación?", "right"),
    (("A1_09", "fill", "Where is the station?"), "Dónde está la estación", "near"),
    (("A1_09", "fill", "Good morning!"), "Buenos días", "near"),
    # article: left out is yellow, the wrong article is wrong
    (("A1_09", "words", "mother"), "madre", "near"),
    (("A1_09", "words", "mother"), "el madre", "wrong"),
    # ñ written as n is yellow
    (("A1_09", "words", "Spain"), "Espana", "near"),
    (("A1_09", "words", "Spain"), "España", "right"),
    # accents matter in verbs, but the ñ is still only yellow there
    (("A2_01", "verbs", "hablar · él / ella / usted · preterite"), "habló", "right"),
    (("A2_01", "verbs", "hablar · él / ella / usted · preterite"), "hablo", "wrong"),
    # accents are yellow outside verbs
    (("A1_09", "words", "Wednesday"), "miercoles", "near"),
    # one of several correct forms
    (("A1_05", "words", "Spanish"), "española", "right"),
    (("A1_05", "words", "Spanish"), "español", "right"),
    # stem-change reminder and an optional word
    (("A2_10", "words", "to hurt"), "doler", "right"),
    (("A1_09", "words", "(very) well"), "muy bien", "right"),
    (("A1_09", "words", "(very) well"), "bien", "right"),
    # a choice of one word inside a sentence
    (("B2_08", "fix", "¡Qué día muy bonito!"), "¡Qué día tan bonito!", "right"),
    (("B2_08", "fix", "¡Qué día muy bonito!"), "¡Qué día más bonito!", "right"),
]
for key, typed, wanted in cases:
    expect(grade(key, typed) == wanted, f"{key} typed {typed!r}: wanted {wanted}, got {grade(key, typed)}")
note = logic.check_answer(by_prompt[("A1_09", "words", "mother")], "madre")[1]
expect("la madre" in note, f"the warning must name the article, was {note!r}")
note = logic.check_answer(by_prompt[("A1_09", "words", "Spain")], "Espana")[1]
expect("ñ" in note, f"the warning must name the ñ, was {note!r}")
expect(("A1_05", "words", "big") in by_prompt and ("A1_05", "words", "small") in by_prompt,
       "big / small should be two questions")
expect(by_prompt[("A1_09", "fill", "juice")]["answers"][0] == "el zumo", "Spain Spanish: juice is el zumo")

# ---------- Spanish to English, el or la, listening ----------
reverse_cases = [
    (("A1_09", "reverse", "la madre"), "mother", "right"), (("A1_09", "reverse", "la madre"), "the mother", "right"),
    (("A1_09", "reverse", "lunes"), "monday", "right"), (("A1_09", "reverse", "lunes"), "Monday", "right"),
    (("A1_09", "reverse", "cero"), "0", "right"),
    (("A2_01", "reverse", "bailar"), "to dance", "right"), (("A2_01", "reverse", "bailar"), "dance", "right"),
    (("C1_10", "reverse", "abordar"), "to address", "right"), (("C1_10", "reverse", "abordar"), "tackle", "right"),
    (("A1_03", "reverse", "caer"), "to fall", "right"), (("A1_03", "reverse", "caer"), "to jump", "wrong"),
    (("A1_05", "reverse", "grande"), "big", "right"), (("A1_05", "reverse", "grande"), "small", "wrong"),
]
for key, typed, wanted in reverse_cases:
    expect(key in by_prompt, f"{key} is missing")
    if key in by_prompt:
        expect(grade(key, typed) == wanted, f"{key} typed {typed!r}: wanted {wanted}, got {grade(key, typed)}")

gender = [i for i in all_items if i["mode"] == "gender"]
expect(all(i["choices"] == ["el", "la"] and i["answers"][0] in ("el", "la") for i in gender), "el/la questions are wrong")
expect(not any("masculine" in i["hint"] or "feminine" in i["hint"] for i in gender), "the hint gives the gender away")
expect(not any("/" in i["prompt"] for i in gender), "words with both genders can't be asked")
expect(logic.check_answer(by_prompt[("A1_09", "gender", "madre")], "la")[0] == "right", "madre is la")
expect(logic.check_answer(by_prompt[("A1_09", "gender", "madre")], "el")[0] == "wrong", "madre is not el")

listening = [i for i in all_items if i["mode"] == "listen"]
expect(listening and all(i["speak"] == i["answers"][0] and "______" not in i["speak"] for i in listening), "listening data")
expect(all(i["speak"] not in i["prompt"] for i in listening), "the sentence may not be on the screen while listening")

expect(not any("capital" in logic.check_answer(i, i["answers"][0].upper())[1] for i in all_items[:3000]),
       "capitals must never give a warning")

# ---------- 'I was actually right' remembers the answer ----------
data = {"items": {}, "scores": {}}
mother = by_prompt[("A1_09", "words", "mother")]
key = logic.answer_key(mother)
expect(logic.check_answer(mother, "mamá", store.accepted_answers(data, key))[0] == "wrong", "mamá is not in the PDF")
store.accept(data, key, "  mamá ")
store.accept(data, key, "mamá")
expect(store.accepted_answers(data, key) == ["mamá"], "an accepted answer is saved once, without spaces")
expect(logic.check_answer(mother, "mamá", store.accepted_answers(data, key))[0] == "right", "accepted must count as right")
expect(logic.check_answer(mother, "mama", store.accepted_answers(data, key))[0] == "near", "accepted still warns about accents")
by_key = collections.defaultdict(set)  # for each key: the PDFs and lists that have this question
for item in all_items:
    by_key[logic.answer_key(item)].add(item["id"].split("|")[0])
expect(any(len(sources) > 1 for sources in by_key.values()), "the same word in two PDFs must share one key")
listen = [i for i in all_items if i["mode"] == "listen"][:2]
expect(logic.answer_key(listen[0]) != logic.answer_key(listen[1]), "listening questions must not share a key")
store.unaccept(data, key, "mamá")
expect(store.accepted_answers(data, key) == [] and key not in data["accepted"], "removing must work")

# ---------- the order of the exercise types ----------
expect(logic.CHAIN[:3] == ["reverse", "gender", "words"], "words: Spanish to English first, then el/la, then English to Spanish")
expect(logic.next_step({"reverse", "words", "fill"}, "reverse", False) == "words", "skip types the PDF doesn't have")
expect(logic.next_step({"reverse", "words", "translate"}, "translate", True) == "weak", "weak questions come last")
expect(logic.next_step({"reverse", "words", "translate"}, "translate", False) is None, "then the PDF is done")
expect(logic.next_step({"reverse"}, "test", True) is None and logic.next_step({"reverse"}, "weak", True) is None,
       "nothing follows the mixed test or the weak questions")

# ---------- mock exam ----------
pool = [i for i in all_items if i["id"].startswith("B2")]
mock = logic.choose_mock_items(pool, 40)
expect(len(mock) == 40 and len({i["id"] for i in mock}) == 40, "a mock needs 40 different questions")
counts = collections.Counter(i["mode"] for i in mock)
expect(set(counts) <= set(logic.MOCK_MODES), f"only typed exercise types in a mock: {counts}")
expect(len(counts) >= 3 and max(counts.values()) - min(counts.values()) <= 1, f"a mock must be spread evenly: {counts}")
expect(len(logic.choose_mock_items(pool[:5], 40)) <= 5, "a small pool must not fail")

# ---------- daily review: 1, 3, 7 and 30 days ----------
from datetime import date, timedelta
day = date(2026, 1, 1)
data = {"items": {}, "scores": {}}
expect(not store.is_due(data, "q", day), "a new question is not due yet")
for days in (1, 3, 7, 30, 30):
    store.record(data, "q", True, day)
    expect(data["items"]["q"]["due"] == (day + timedelta(days=days)).isoformat(), f"correct must wait {days} days")
    expect(not store.is_due(data, "q", day + timedelta(days=days - 1)), f"not due before {days} days")
    expect(store.is_due(data, "q", day + timedelta(days=days)), f"due after {days} days")
    day += timedelta(days=days)
store.record(data, "q", False, day)
expect(data["items"]["q"]["due"] == (day + timedelta(days=1)).isoformat() and data["items"]["q"]["box"] == 0,
       "a wrong answer must come back tomorrow")
store.change_to_correct(data, "q", day)
expect(data["items"]["q"]["due"] == (day + timedelta(days=30)).isoformat(), "'I was right' must restore the schedule")
old_file = {"items": {"old": {"right": 1, "wrong": 0, "last_ok": True}}, "scores": {}}
expect(store.is_due(old_file, "old", day), "results from before the daily review must be due")
store.record(old_file, "old", True, day)
expect("box" in old_file["items"]["old"], "results from before the daily review must keep working")

# ---------- the rounds, from the design in the brief ----------
items = [{"id": name} for name in "abcd"]
drill = logic.new_drill(items)
seen, round_history = [], []


def answer_round(drill, wrong):
    asked = []
    start = (drill["stage"], drill["round"])
    while not drill["finished"] and (drill["stage"], drill["round"]) == start:
        item_id = logic.current_item(drill)["id"]
        asked.append(item_id)
        logic.give_result(drill, item_id, item_id not in wrong)
        logic.go_to_next(drill)
    return sorted(asked)


expect(answer_round(drill, {"a", "b"}) == list("abcd"), "round 1 must show everything once")
expect(answer_round(drill, {"a"}) == ["a", "b"], "round 2 must show only round 1's wrong ones")
expect(answer_round(drill, set()) == ["a"], "round 3 must show only round 2's wrong ones")
expect(not drill["finished"] and drill["stage"] == 2, "then the repeat must start")
expect(answer_round(drill, {"b"}) == ["a", "b"], "the repeat must use round 1's wrong ones")
expect(answer_round(drill, set()) == ["b"], "the repeat must also go on until all are correct")
expect(drill["finished"], "the drill must end after that")
expect(logic.score_percent(drill) == 50, "score must only count round 1")

drill = logic.new_drill(items)
expect(answer_round(drill, set()) == list("abcd") and drill["finished"], "all correct must end at once")

drill = logic.new_drill(items[:1])
logic.give_result(drill, "a", False)
logic.change_to_correct(drill, "a")
logic.go_to_next(drill)
expect(drill["finished"] and logic.score_percent(drill) == 100, "'I was actually right' must count as right")

# ---------- more wrong means chosen more often ----------
pool = [{"id": str(n)} for n in range(10)]
hard = {"0": {"right": 0, "wrong": 5, "last_ok": False}}
picked = sum(any(i["id"] == "0" for i in logic.choose_items(pool, hard, 2)) for _ in range(3000))
expect(picked > 1200, f"a difficult question must be chosen far more often, was {picked} of 3000")
expect(len(logic.choose_items(pool, {}, None)) == 10, "'all' must keep every question")
expect(len({i["id"] for i in logic.choose_items(pool, {}, 5)}) == 5, "no question twice in one session")

# ---------- saving ----------
with tempfile.TemporaryDirectory() as folder:
    path = Path(folder) / "practice.json"
    data = store.load(path)
    store.record(data, "x¿ñ", False)
    expect(store.is_weak(data, "x¿ñ") and not store.is_mastered(data, "x¿ñ"), "wrong must be weak")
    store.change_to_correct(data, "x¿ñ")
    expect(store.is_mastered(data, "x¿ñ") and not store.is_weak(data, "x¿ñ"), "override must clear weak")
    store.save_score(data, "pdf", "fill", 90)
    store.save_score(data, "pdf", "fill", 70)
    store.save(path, data)
    again = store.load(path)
    expect(again["scores"]["pdf"]["fill"]["best"] == 90 and again["scores"]["pdf"]["fill"]["last"] == 70,
           "best and last score must be kept")
    expect(again["items"]["x¿ñ"]["right"] == 1, "results must survive saving, also with ñ and ¿")

# ---------- subject pronouns: added or left out is never a mistake ----------
verb = by_prompt[("A2_01", "verbs", "hablar · él / ella / usted · preterite")]
for typed, wanted in [("él habló", "right"), ("Ella habló", "right"), ("el habló", "right"),
                      ("él hablo", "wrong"), ("habló", "right")]:
    got = logic.check_answer(verb, typed)[0]
    expect(got == wanted, f"verb typed {typed!r}: wanted {wanted}, got {got}")
fast = next(i for i in all_items if i["mode"] == "translate" and i["prompt"] == "She speaks very fast.")
for typed, wanted in [("Habla muy rápido.", "right"), ("Ella habla muy rápido", "right"),
                      ("Él habla muy rápido", "wrong"),  # both have a pronoun: it must be the right one
                      ("Habla muy rapido", "near")]:     # other warnings still work without the pronoun
    got = logic.check_answer(fast, typed)[0]
    expect(got == wanted, f"translate typed {typed!r}: wanted {wanted}, got {got}")
vive = next(i for i in all_items if i["mode"] == "fill" and i["prompt"] == "Ella ______ en Madrid.")
expect(logic.check_answer(vive, "ella vive")[0] == "right", "fill: the pronoun before the gap word is fine")
listen = next(i for i in all_items if i["mode"] == "listen" and i["answers"][0] == "Ella habla muy rápido.")
expect(logic.check_answer(listen, "Habla muy rápido.")[0] == "wrong", "listening: you type what you hear")
expect(logic.drop_pronoun("¿Tú hablas inglés?", languages.profile("es")["pronouns"]) == "¿hablas inglés?", "¿ must stay")
expect(logic.drop_pronoun("Tu casa es grande.", languages.profile("es")["pronouns"]) is None, "tu without accent is 'your'")

# ---------- verb forms: verb · person · tense, with the id of the older order ----------
expect(verb["id"].endswith("|verbs|hablar · preterite · él / ella / usted|to speak") or
       "|verbs|hablar · preterite · él / ella / usted|" in verb["id"],
       f"the id must stay as before, so your results stay: {verb['id']}")

# ---------- verbs in context ----------
context_files = sorted((COURSE / "verbs_in_context").glob("*.json"))
prefixes = {pdf["id"][:5] for pdf in catalog}
expect(len(context_files) >= 20, f"only {len(context_files)} files with verbs in context")
context_items = [i for i in all_items if i["group"] == "Verbs in context"]
for path in context_files:
    data = json.loads(path.read_text(encoding="utf-8"))
    expect(path.stem in prefixes and data["pdf"] == path.stem, f"{path.name}: no PDF with this name")
    expect(len(data["items"]) >= 15, f"{path.name}: only {len(data['items'])} sentences")
    for entry in data["items"]:
        sentence = entry[0]
        expect(sentence.count("[") == 1 and sentence.count("]") == 1, f"{path.name}: one [gap] needed: {sentence}")
        expect(len(entry) in (2, 3) and entry[1] and " " not in entry[1].strip(),
               f"{path.name}: the hint must be just the infinitive: {entry}")
        expect(not (set(clean_text(sentence).split()) & LATIN_AMERICAN), f"{path.name}: not Spain Spanish? {sentence}")
expect(len(context_items) == sum(len(json.loads(p.read_text(encoding="utf-8"))["items"]) for p in context_files),
       "every sentence must give one question (two the same?)")
for item in context_items:
    for answer in item["answers"]:
        expect(logic.check_answer(item, answer)[0] == "right", f"own answer not right: {item['prompt']} -> {answer}")
    expect(logic.check_answer(item, "xyz")[0] == "wrong", f"nonsense counted as right: {item['prompt']}")
    expect("accent" in item["must_match"], f"accents must count in verbs: {item['prompt']}")
ganar = next(i for i in context_items if i["prompt"].startswith("Si yo ______ la lotería"))
expect(logic.check_answer(ganar, "ganara")[0] == "right" and logic.check_answer(ganar, "ganase")[0] == "right",
       "both -ra and -se forms must count")
hable = next(i for i in context_items if i["prompt"] == "Ayer yo ______ con mi jefe.")
expect(logic.check_answer(hable, "hable")[0] == "wrong", "a missing accent in a verb is wrong")
expect(logic.check_answer(hable, "yo hablé")[0] == "right", "the pronoun may be typed")
print(f"Verbs in context: {len(context_items)} sentences in {len(context_files)} PDFs")

# ---------- grammar markers and gaps are never typed ----------
def word_item(prompt):
    return next(i for i in all_items if i["mode"] == "words" and i["prompt"] == prompt)


for prompt, typed in [("to have to (do)", "tener que"), ("to have to (do)", "tener que + inf."),
                      ("to be doing", "estar"), ("to be doing", "estar + gerundio"),
                      ("to consider as", "dar por")]:
    got = logic.check_answer(word_item(prompt), typed)[0]
    expect(got == "right", f"{prompt!r} typed {typed!r}: the marker must be optional, got {got}")
expect(word_item("to have to (do)")["show"] == "tener que + inf.", "the model answer still shows the marker")
gaps = [i["prompt"] for i in all_items if i["mode"] in ("words", "reverse", "gender")
        and any(mark in text for text in [i["prompt"]] + i["answers"] for mark in ("…", "..."))]
expect(not gaps, f"vocabulary with a gap to type: {gaps[:5]}")

# ---------- marking an exercise as done ----------
expect(logic.done_key(verb) == verb["id"].split("|")[0] + "|verbs",
       f"done key of a PDF exercise, was {logic.done_key(verb)}")
theme_item = next(i for i in all_items if i["id"].startswith("THEME_") and i["mode"] == "reverse")
expect(logic.done_key(theme_item).startswith("THEME_") and "|list:" in logic.done_key(theme_item),
       f"done key of a themed list, was {logic.done_key(theme_item)}")
data = {"items": {}, "scores": {}}
expect(not store.is_marked_done(data, "A2_01|verbs"), "an older file has no marks")
store.mark_done(data, "A2_01|verbs", True)
store.mark_done(data, "A2_01|verbs", True)
expect(data["done"] == ["A2_01|verbs"], "a mark is saved once")
store.mark_done(data, "A2_01|verbs", False)
expect(not store.is_marked_done(data, "A2_01|verbs"), "a mark can be taken away")

# ---------- known questions 10x less often ----------
known = {"right": 1, "wrong": 0, "last_ok": True}
expect(logic.weight(known) * 10 == logic.weight({"right": 1, "wrong": 0, "last_ok": False}),
       "right on the first try last time must divide the weight by 10")
pool = [{"id": str(n)} for n in range(10)]
known_stats = {"0": known}
picked = sum(any(i["id"] == "0" for i in logic.choose_items(pool, known_stats, 1)) for _ in range(20000))
# 10 questions, one with a weight 10x lower (0.3 against 3, 3 for the others): about 1 in 91
expect(100 < picked < 450, f"a known question must be chosen about 10x less often, was {picked} of 20000")

# ---------- weak subjects ----------
qs = [{"id": f"s{n}"} for n in range(12)]
expect(logic.first_try_score(qs, {"s0": known}) == (None, 1), "too few practised: no score yet")
stats = {f"s{n}": {"right": 1, "wrong": 0, "last_ok": n < 6} for n in range(12)}
expect(logic.first_try_score(qs, stats) == (0.5, 12), f"6 of 12 right is 50%, was {logic.first_try_score(qs, stats)}")
good = [{"id": f"g{n}"} for n in range(10)]
stats.update({f"g{n}": known for n in range(10)})
weak = logic.weak_subjects([("good", good), ("bad", qs), ("new", [{"id": "x"}])], stats)
expect([name for _, _, name, _ in weak] == ["bad"], f"only 'bad' is weak, got {[w[2] for w in weak]}")

# ---------- the rules of English and Dutch (languages.py) ----------
def made_up(mode, answers, lang):
    """A question made by hand, as build_items would make it."""
    return {"id": f"T|{mode}|{answers[0]}", "mode": mode, "prompt": "?", "hint": "", "answers": answers,
            "show": answers[0], "why": "", "group": "", "tiles": [], "must_match": [], "speak": "",
            "choices": [], "lang": lang}


english = made_up("translate", ["I do not know where she lives."], "en")
expect(logic.check_answer(english, "I don't know where she lives.")[0] == "right", "en: don't = do not")
expect(logic.check_answer(english, "I don’t know where she lives")[0] == "right", "en: curly apostrophe")
expect(logic.check_answer(english, "Don't know where she lives.")[0] == "wrong", "en: the subject is needed")
colour = made_up("words", ["my favourite colour"], "en")
result, note = logic.check_answer(colour, "my favorite color")
expect(result == "near" and "British" in note, f"en: American spelling is a warning, was {result} {note!r}")
expect(logic.check_answer(made_up("words", ["I won't go"], "en"), "I will not go")[0] == "right", "en: won't")
expect(logic.check_answer(made_up("words", ["I can't swim"], "en"), "I cannot swim")[0] == "right", "en: can't")
expect(languages.expand("Want it?", "en") == "Want it?", "en: 'want' is not a contraction")
there = made_up("translate", ["There is a book on the table."], "en")
expect(logic.check_answer(there, "There's a book on the table.")[0] == "right", "en: there's = there is")
expect(logic.check_answer(made_up("translate", ["She's a teacher."], "en"), "She is a teacher")[0] == "right",
       "en: she's = she is")
expect(logic.check_answer(made_up("words", ["Anna's book"], "en"), "Anna is book")[0] == "wrong",
       "en: Anna's is a possessive, not Anna is")
een = made_up("fill", ["één"], "nl")
result, note = logic.check_answer(een, "een")
expect(result == "near" and "accent" in note, f"nl: een for één is a warning, was {result}")
hond = made_up("words", ["de hond"], "nl")
result, note = logic.check_answer(hond, "hond")
expect(result == "near" and "de hond" in note, f"nl: a missing de/het is a warning, was {result} {note!r}")
expect(logic.check_answer(made_up("translate", ["Ik woon in Utrecht."], "nl"), "Woon in Utrecht.")[0] == "wrong",
       "nl: the subject is needed")

# ---------- the exercise types of other courses ----------
import practice_items
real_languages = practice_items.course_languages
practice_items.course_languages = lambda course_id=None: ("nl", "en")  # pretend: Dutch, explained in English
titles = [title for _, title, _ in modes()]
expect("⚖️ de or het?" in titles and "🔤 Words, English to Dutch" in titles, f"Dutch course titles: {titles}")
practice_items.course_languages = lambda course_id=None: ("en", "nl")  # English, explained in Dutch
expect(not any(mode == "gender" for mode, _, _ in modes()), "English has no article exercise")
practice_items.course_languages = real_languages

# ---------- result ----------
print()
if problems:
    print(f"{len(problems)} PROBLEMS:")
    for problem in problems[:60]:
        print(" -", problem)
else:
    print("All checks passed.")
