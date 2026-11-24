// Loading the course data that build_web.py made (web/data). Each file is fetched once and
// then kept, so moving between screens doesn't download it again.

const files = {};

export function getJSON(path) {
  files[path] ??= fetch(`data/${path}`).then((response) => {
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  });
  return files[path];
}

// A question from the data with its empty parts filled in again (build_web.compact left them out).
const full = (item) => ({ hint: "", show: "", why: "", group: "", tiles: [], must_match: [], speak: "", choices: [], ...item });

export const courses = () => getJSON("courses.json");
export const languages = () => getJSON("languages.json");
export const catalog = (course) => getJSON(`${course}/catalog.json`);
export const unitText = (course, unit) => getJSON(`${course}/units/${unit}.json`);

export async function unitItems(course, unit) {
  return (await getJSON(`${course}/items/${unit}.json`)).map(full);
}

export async function themes(course) {
  const data = await getJSON(`${course}/themes.json`);
  for (const theme of Object.values(data)) theme.items = theme.items.map(full);
  return data;
}

// All questions of a list of units, for a level test or the review.
export async function itemsOfUnits(course, units) {
  const lists = await Promise.all(units.map((unit) => unitItems(course, unit.id)));
  return lists.flat();
}
