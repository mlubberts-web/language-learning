// Small helpers for building the page.
//
// h("button", {class: "button", onclick: go}, "Start") makes <button class="button">Start</button>
// with a click action. Children can be texts, elements, or lists of them; null and false are
// skipped, so  h("div", {}, done && "Done")  shows "Done" only when done is true.
// Texts are always put in as text, never as HTML, so a question can't break the page.

export function h(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name.startsWith("on")) element.addEventListener(name.slice(2), value);
    else if (name === "class") element.className = value;
    else if (name === "value") element.value = value;
    else element.setAttribute(name, value === true ? "" : value);
  }
  add(element, children);
  return element;
}

function add(element, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) add(element, child);
    else element.append(child instanceof Node ? child : String(child));
  }
}

// Simple line icons (no emoji): the shapes are 24 by 24, drawn with a 2 pixel line.
const SHAPES = {
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2.5Z"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  list: '<path d="M3 6h18M3 12h18M3 18h12"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  sound: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  slow: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
};

export function icon(name, size = 20) {
  const span = document.createElement("span");
  span.style.display = "inline-flex";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${SHAPES[name]}</svg>`;
  return span;
}

export const bar = (share, thin = false) =>
  h("div", { class: thin ? "bar thin" : "bar", role: "presentation" },
    h("div", { style: `width: ${Math.round(Math.max(0, Math.min(1, share)) * 100)}%` }));

// "🔤 Words, English to Spanish" -> "Words, English to Spanish": the new site has no emoji.
export const noEmoji = (text) => text.replace(/^[^\p{L}\p{N}¿¡]+/u, "");
