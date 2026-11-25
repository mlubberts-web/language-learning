// The interface texts in English, Dutch or Spanish: the same idea as ui_text.py.
// Texts are written in English in the code; t() looks up the translation in
// data/ui/nl.json or data/ui/es.json (the same files the Streamlit app uses).

const tables = { en: {} };
let current = "en";

// Loads the translations of one language (once). English needs no file.
export async function loadLanguage(code) {
  if (!tables[code]) {
    const response = await fetch(`data/ui/${code}.json`);
    tables[code] = response.ok ? await response.json() : {};
  }
  current = code;
}

// For the tests: put a table in directly, without fetching it.
export function setTable(code, table) {
  tables[code] = table;
}

// Marks a text for translation without translating it yet (for lists at the top of a file, which
// t() translates where they are shown). The translation test finds the texts through this mark.
export const mark = (text) => text;

export function language() {
  return current;
}

// t("Correct, but mind {things}.", {things: "the accent"}) -> the text in the interface language,
// with the {names} filled in. A text that has no translation stays English.
export function t(text, values = {}, code = current) {
  const translated = (tables[code] || {})[text] ?? text;
  return translated.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole));
}

// A date text ("2026-12-04") in the interface language: longDate -> "Friday 4 December",
// shortDate -> "4 Dec", dayLabel -> "Fri 4". Intl is the browser's own date formatting.
const LOCALES = { en: "en-GB", nl: "nl-NL", es: "es-ES" };
function asDate(text) {
  const [y, m, d] = text.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const format = (text, options) => new Intl.DateTimeFormat(LOCALES[current] || "en-GB", { timeZone: "UTC", ...options }).format(asDate(text));
export const longDate = (text) => format(text, { weekday: "long", day: "numeric", month: "long" });
export const shortDate = (text) => format(text, { day: "numeric", month: "short" });
export const dayLabel = (text) => format(text, { weekday: "short", day: "numeric" });
export const decimal = (value, places = 1) => value.toLocaleString(LOCALES[current] || "en-GB", { minimumFractionDigits: places, maximumFractionDigits: places });
