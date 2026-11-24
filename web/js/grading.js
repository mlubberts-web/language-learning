// Checking an answer: the same rules as practice_items.py and practice_logic.py in the Python app.
// test_web.py checks that both give the same result for thousands of answers, so when a rule
// changes in one, it has to change in the other as well.
//
// The rules of each language (accents, ñ, pronouns, contractions ...) come from
// data/languages.json, which build_web.py makes from languages.py.

import { t } from "./text.js";

let PROFILES = {};

// Called once at the start with the contents of data/languages.json.
export function setLanguages(data) {
  PROFILES = data.profiles;
}

const profile = (lang) => PROFILES[lang];

const ALL_MARKS = "¿?¡!"; // question and exclamation marks of every language: never part of a word
const COMMA_MARKS = ",;:";
const OTHER_PUNCTUATION = ".\"'«»…—()"; // never matters: not wrong, and no yellow warning either

// The small differences that give a yellow warning (not capitals and not commas).
const WARNING_KINDS = ["accent", "special", "question mark", "spelling"];
// The exercise types in which adding or leaving out a subject pronoun (yo, tú ...) is fine.
const PRONOUN_MODES = ["verbs", "fill", "translate"];

// "a  b\n c" -> "a b c": Python's " ".join(text.split())
const squeeze = (text) => text.split(/\s+/).filter(Boolean).join(" ");

const isUpper = (c) => c !== c.toLowerCase() && c === c.toUpperCase();

// Two lists with the same elements in the same order
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Writes contractions out in full (English: don't -> do not), like languages.expand().
function expand(text, lang) {
  const shortForms = profile(lang).contractions;
  if (!Object.keys(shortForms).length) return text;
  text = text.replace(/’/g, "'"); // the curly apostrophe of phones and Word
  for (const [short, full] of Object.entries(shortForms)) { // in order: won't and can't before n't
    const pattern = short.startsWith("'") || short === "n't" ? escapeRegex(short) : `\\b${escapeRegex(short)}\\b`;
    text = text.replace(new RegExp(pattern, "gi"), full);
  }
  return text;
}

// The words without any punctuation. Capitals and accents stay.
export function wordsOnly(text, lang) {
  text = expand(text.normalize("NFC"), lang);
  for (const mark of ALL_MARKS + COMMA_MARKS + OTHER_PUNCTUATION) {
    text = text.split(mark).join(" ");
  }
  return squeeze(text);
}

export const cleanText = (text, lang) => wordsOnly(text, lang).toLowerCase();

function withoutAccents(text, lang) {
  const [accented, plain] = profile(lang).accents;
  return [...text].map((c) => { const i = accented.indexOf(c); return i < 0 ? c : plain[i]; }).join("");
}

function withoutSpecial(text, lang) { // ñ -> n in Spanish
  for (const [letter, typed] of Object.entries(profile(lang).special)) {
    text = text.split(letter).join(typed);
  }
  return text;
}

const plainLetters = (text, lang) => withoutSpecial(withoutAccents(cleanText(text, lang), lang), lang);

function preferredSpelling(text, lang) { // colour instead of color
  const spelling = profile(lang).spelling;
  return text.split(/\s+/).filter(Boolean).map((word) => spelling[word] ?? word).join(" ");
}

const marksIn = (text, marks) => [...text].filter((c) => marks.includes(c));

// Compares two texts. Returns null when they are different words, otherwise the list of small
// differences, empty when there are none.
export function differences(typed, answer, lang) {
  const p = profile(lang);
  const a = wordsOnly(typed, lang), b = wordsOnly(answer, lang);
  const plainA = plainLetters(a, lang), plainB = plainLetters(b, lang);
  if (plainA !== plainB) {
    if (Object.keys(p.spelling).length && preferredSpelling(plainA, lang) === preferredSpelling(plainB, lang)) {
      return ["spelling"];
    }
    return null;
  }
  const found = [];
  if (withoutSpecial(a.toLowerCase(), lang) !== withoutSpecial(b.toLowerCase(), lang)) found.push("accent");
  if (withoutAccents(a.toLowerCase(), lang) !== withoutAccents(b.toLowerCase(), lang)) found.push("special");
  const capitalsA = [...a].map(isUpper), capitalsB = [...b].map(isUpper);
  if (!same(capitalsA.slice(1), capitalsB.slice(1))) found.push("capital");
  else if (!same(capitalsA, capitalsB)) found.push("first capital");
  if (!same(marksIn(typed, p.marks), marksIn(answer, p.marks))) found.push("question mark");
  if (!same(marksIn(typed, COMMA_MARKS), marksIn(answer, COMMA_MARKS))) found.push("comma");
  return found;
}

// The language the answer to this question is typed in.
const itemLanguage = (item, learn) => item.lang || learn;

// Compares with one correct answer: the warnings, or null when it doesn't match.
function compare(item, typed, answer, lang) {
  const found = differences(typed, answer, lang);
  if (found === null || found.some((kind) => (item.must_match || []).includes(kind))) return null;
  return found.filter((kind) => WARNING_KINDS.includes(kind));
}

function warningName(kind, lang) {
  const p = profile(lang);
  return { accent: t("the accent"), special: t(p.special_name), "question mark": t(p.marks_name),
           spelling: t(p.spelling_name) }[kind];
}

function warningText(warnings, lang) {
  const names = warnings.map((kind) => warningName(kind, lang)).join(" " + t("and") + " ");
  return t("Correct, but mind {things}.", { things: names });
}

// '¿Tú hablas inglés?' -> '¿hablas inglés?'; null when it doesn't start with a pronoun.
function dropPronoun(text, pronouns) {
  const match = text.match(/^([¿¡]*)\s*([\p{L}\p{N}_]+)\s+(.+)/u);
  if (match && pronouns.includes(match[2].toLowerCase())) return match[1] + match[3];
  return null;
}

function compareWithoutPronoun(item, typed, answer, lang) {
  const p = profile(lang);
  const typedShort = dropPronoun(typed, p.pronouns.concat(p.typed_pronouns));
  const answerShort = dropPronoun(answer, p.pronouns);
  if ((typedShort === null) === (answerShort === null)) return null; // both or neither have one
  return compare(item, typedShort ?? typed, answerShort ?? answer, lang);
}

// Returns {result, note}. result is "right", "near" (yellow: counts as correct, but something
// small was off) or "wrong". 'accepted' are answers you said were right yourself.
// 'learn' is the language of the course, for questions that don't say their language.
export function checkAnswer(item, typed, learn, accepted = []) {
  typed = squeeze(typed);
  const answers = item.answers.concat(accepted);
  const lang = itemLanguage(item, learn);

  if (item.mode === "build") { // the tiles have no capitals or punctuation: only the order counts
    const words = cleanText(typed, lang);
    return { result: answers.some((a) => words === cleanText(a, lang)) ? "right" : "wrong", note: "" };
  }

  let best = null;
  for (const answer of answers) {
    const warnings = compare(item, typed, answer, lang);
    if (warnings && warnings.length === 0) return { result: "right", note: "" };
    if (warnings && warnings.length && best === null) best = warnings;
  }
  if (best) return { result: "near", note: warningText(best, lang) };

  if (item.mode === "words") { // the word is right, but el / la was left out
    for (const answer of answers) {
      const lower = answer.toLowerCase();
      if (profile(lang).articles.some((article) => lower.startsWith(article))) {
        const space = answer.indexOf(" ");
        const article = answer.slice(0, space), word = answer.slice(space + 1);
        if (compare(item, typed, word, lang) !== null) {
          return { result: "near",
                   note: t("Correct, but learn the word with its article: {word}.", { word: `${article.toLowerCase()} ${word}` }) };
        }
      }
    }
  }

  if (PRONOUN_MODES.includes(item.mode)) { // yo, tú, ella ... added or left out
    for (const answer of answers) {
      const warnings = compareWithoutPronoun(item, typed, answer, lang);
      if (warnings && warnings.length === 0) return { result: "right", note: "" };
      if (warnings && warnings.length) return { result: "near", note: warningText(warnings, lang) };
    }
  }
  return { result: "wrong", note: "" };
}
