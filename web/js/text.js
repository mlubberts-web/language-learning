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

export function language() {
  return current;
}

// t("Correct, but mind {things}.", {things: "the accent"}) -> the text in the interface language,
// with the {names} filled in. A text that has no translation stays English.
export function t(text, values = {}, code = current) {
  const translated = (tables[code] || {})[text] ?? text;
  return translated.replace(/\{(\w+)\}/g, (whole, name) => (name in values ? String(values[name]) : whole));
}
