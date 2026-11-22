"""What is different about each language, for checking answers and for the practice screens.
No screens here. practice_items.py and practice_logic.py read these profiles; a course says which
language you learn and which language explains it (course.json: "learn" and "explained_in").

Each profile has:
    accents          letters with an accent, and the same letters without it. A missing accent is
                     a yellow warning (outside verb forms), like before.
    special          letters that are more than an accent, with what people type instead: the ñ
                     typed as n is also only a warning, but it is named separately.
    special_name     how the warning names them, for example "the ñ"
    marks            question and exclamation marks; a missing one is a yellow warning
    marks_name       how the warning names them
    articles         the articles in front of nouns (with a space after them)
    gender           the two articles of the "el or la?" exercise, or None: no such exercise
    pronouns         subject pronouns that may be added or left out without it being a mistake.
                     Only in languages that often leave them out (Spanish); empty otherwise.
    typed_pronouns   extra ways people type those pronouns (tú without its accent)
    persons          the six persons of a verb table
    infinitive       the word before an infinitive in a word list ("to" in "to eat"), or ""
    strip_articles   True: in answers typed in this language an article may be left out
    contractions     short forms that count the same as the long ones (don't = do not)
    spelling         other spellings that count with a warning: {other: preferred}
    spelling_name    how that warning is worded
    voice            the language code of the speech voice, as browsers name it
    voice_name       how the voice is called in Windows settings
    keys             the buttons under the answer box for letters that are hard to type
"""
import re

PROFILES = {
    "es": {
        "accents": ("áéíóúü", "aeiouu"),
        "special": {"ñ": "n"},
        "special_name": "the ñ",
        "marks": "¿?¡!",
        "marks_name": "the ¿ ? ¡ !",
        "articles": ("el ", "la ", "los ", "las ", "un ", "una "),
        "gender": ["el", "la"],
        "pronouns": {"yo", "tú", "él", "ella", "usted", "nosotros", "nosotras", "vosotros",
                     "vosotras", "ellos", "ellas", "ustedes"},
        "typed_pronouns": {"tu", "el"},
        "persons": ["yo", "tú", "él / ella / usted", "nosotros", "vosotros", "ellos / ellas / ustedes"],
        "infinitive": "",
        "strip_articles": True,
        "contractions": {},
        "spelling": {},
        "spelling_name": "",
        "voice": "es-ES",
        "voice_name": "Spanish (Spain)",
        "keys": ["á", "é", "í", "ó", "ú", "ü", "ñ", "¿", "¡"],
    },
    "en": {
        "accents": ("éèêëïöüç", "eeeeiouc"),  # café, naïve: rare, and never a mistake to leave out
        "special": {},
        "special_name": "",
        "marks": "?!",
        "marks_name": "the ? or !",
        "articles": ("the ", "a ", "an "),
        "gender": None,
        "pronouns": set(),  # English always needs the subject: 'I speak', never just 'speak'
        "typed_pronouns": set(),
        "persons": ["I", "you", "he / she / it", "we", "you (plural)", "they"],
        "infinitive": "to",
        "strip_articles": False,
        "contractions": {
            "won't": "will not", "can't": "cannot", "shan't": "shall not", "ain't": "is not",
            "n't": " not", "'m": " am", "'re": " are", "'ve": " have", "'ll": " will",
            "can not": "cannot",
        },
        # The course teaches British English; the American spelling counts, with a warning.
        # More pairs are added with the English content (phase 3).
        "spelling": {"color": "colour", "favorite": "favourite", "neighbor": "neighbour",
                     "behavior": "behaviour", "honor": "honour", "humor": "humour",
                     "labor": "labour", "flavor": "flavour", "center": "centre",
                     "theater": "theatre", "liter": "litre", "fiber": "fibre",
                     "defense": "defence", "offense": "offence",
                     "traveled": "travelled", "traveling": "travelling", "traveler": "traveller",
                     "canceled": "cancelled", "canceling": "cancelling", "gray": "grey",
                     # Left out on purpose: words that are also correct British English with
                     # another meaning, such as check (cheque), tire (tyre), meter, program, license.
                     "catalog": "catalogue", "dialog": "dialogue",
                     "realize": "realise", "realized": "realised", "organize": "organise",
                     "organized": "organised", "recognize": "recognise", "apologize": "apologise",
                     "analyze": "analyse", "aluminum": "aluminium",
                     "mom": "mum", "pajamas": "pyjamas", "jewelry": "jewellery"},
        "spelling_name": "the British spelling",
        "voice": "en-GB",
        "voice_name": "English (United Kingdom)",
        "keys": [],
    },
    "nl": {
        "accents": ("áéíóúàèëïöüêç", "aeiouaeeioueç"),  # één, café, ruïne, coöperatie
        "special": {},
        "special_name": "",
        "marks": "?!",
        "marks_name": "the ? or !",
        "articles": ("de ", "het ", "een "),
        "gender": ["de", "het"],
        "pronouns": set(),  # Dutch always needs the subject, like English
        "typed_pronouns": set(),
        "persons": ["ik", "jij / u", "hij / zij / het", "wij", "jullie", "zij"],
        "infinitive": "",
        "strip_articles": True,
        "contractions": {},
        "spelling": {},
        "spelling_name": "",
        "voice": "nl-NL",
        "voice_name": "Dutch (Netherlands)",
        "keys": ["é", "ë", "ï", "ö", "è"],
    },
}

# How each language is called, in each interface language: NAMES[language][interface].
NAMES = {
    "es": {"en": "Spanish", "nl": "Spaans", "es": "español"},
    "en": {"en": "English", "nl": "Engels", "es": "inglés"},
    "nl": {"en": "Dutch", "nl": "Nederlands", "es": "neerlandés"},
}


def profile(code):
    return PROFILES[code]


def name(code, interface="en"):
    return NAMES[code][interface]


def expand(text, code):
    """Writes contractions out in full, so 'I don't know' and 'I do not know' are the same.
    Only for languages with contractions (English); the text is lowercased by the caller."""
    short_forms = PROFILES[code]["contractions"]
    if not short_forms:
        return text
    text = text.replace("’", "'")  # the curly apostrophe of phones and Word
    for short, full in short_forms.items():  # in order: won't and can't before the ending n't
        if short.startswith("'") or short == "n't":
            pattern = re.escape(short)  # endings: don't -> do not, I'm -> I am
        else:
            pattern = rf"\b{re.escape(short)}\b"  # whole words: won't, can't
        text = re.sub(pattern, full, text, flags=re.IGNORECASE)  # Won't and won't alike
    return text
