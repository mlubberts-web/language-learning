// The rules of a practice session: choosing the questions, the rounds, and what comes next.
// The same rules as practice_logic.py in the Python app.
//
// Round 1 shows everything once. Later rounds show what was wrong in the round before, until
// all are correct once. After that the same happens with what was wrong in round 1.

export const MODE_ORDER = ["reverse", "gender", "words", "verbs", "fill", "build", "listen", "fix", "translate"];
export const MOCK_MODES = ["fill", "verbs", "words", "translate", "fix", "listen"];

const KNOWN_FACTOR = 10; // right on the first try last time: chosen 10 times less often
export const MIN_PRACTISED = 10; // a subject is only judged after this many of its questions
export const WEAK_BELOW = 0.70; // a subject is weak when less than 70% was right on the first try

// Random order: the Fisher-Yates shuffle (random.sample(x, len(x)) in Python)
export function shuffled(list) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// How likely a question is to be chosen: often wrong is high, often right is low.
function weight(stats) {
  if (!stats) return 3; // never practised
  const usual = Math.max(1, 3 + 3 * stats.wrong - stats.right);
  return stats.last_ok ? usual / KNOWN_FACTOR : usual;
}

// Chooses 'size' different questions, with more chance for the difficult ones (null: all).
export function chooseItems(items, statsById, size) {
  if (size === null || size >= items.length) return items.slice();
  const scored = items.map((item) => ({ item, score: Math.random() ** (1 / weight(statsById[item.id])) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, size).map((entry) => entry.item);
}

// Mock exam questions, spread evenly over the exercise types you type an answer for.
export function chooseMockItems(items, count) {
  const piles = MOCK_MODES.map((mode) => shuffled(items.filter((item) => item.mode === mode))).filter((pile) => pile.length);
  const chosen = [];
  while (chosen.length < count && piles.some((pile) => pile.length)) {
    for (const pile of piles) { // one from each pile in turn, like dealing cards
      if (pile.length && chosen.length < count) chosen.push(pile.pop());
    }
  }
  return shuffled(chosen);
}

export function newDrill(items) {
  return {
    items: Object.fromEntries(items.map((item) => [item.id, item])),
    stage: 1,           // 1 = everything, 2 = the repeat of round 1's wrong answers
    round: 1,
    queue: shuffled(items.map((item) => item.id)),
    position: 0,        // the current question in the queue (0 is the first)
    wrongNow: [],       // wrong in this round
    firstWrong: [],     // wrong in the very first round
    asked: 0,           // how many answers were given
    finished: false,
    feedback: null,     // the result on screen, null while answering
  };
}

export const currentItem = (drill) => drill.items[drill.queue[drill.position]];

// Only the first round says what you really knew, so only that one counts for your score.
export const isFirstAttempt = (drill) => drill.stage === 1 && drill.round === 1;

export function giveResult(drill, itemId, correct) {
  drill.asked += 1;
  if (!correct) {
    drill.wrongNow.push(itemId);
    if (isFirstAttempt(drill)) drill.firstWrong.push(itemId);
  }
}

// For the "I was actually right" button
export function changeToCorrect(drill, itemId) {
  drill.wrongNow = drill.wrongNow.filter((id) => id !== itemId);
  if (isFirstAttempt(drill)) drill.firstWrong = drill.firstWrong.filter((id) => id !== itemId);
}

export function goToNext(drill) {
  drill.feedback = null;
  drill.position += 1;
  if (drill.position < drill.queue.length) return;
  if (drill.wrongNow.length) { // next round: only what was wrong
    drill.queue = shuffled(drill.wrongNow);
    drill.round += 1;
  } else if (drill.stage === 1 && drill.firstWrong.length) { // all correct: repeat round 1's wrong ones
    drill.queue = shuffled(drill.firstWrong);
    drill.stage = 2;
    drill.round = 1;
  } else {
    drill.finished = true;
    return;
  }
  drill.position = 0;
  drill.wrongNow = [];
}

// What comes after a finished session of type 'current': the next type, "weak", or null.
export function nextStep(modesLeft, current, hasWeak) {
  if (!MODE_ORDER.includes(current)) return null;
  const later = MODE_ORDER.slice(MODE_ORDER.indexOf(current) + 1).filter((mode) => modesLeft.includes(mode));
  if (later.length) return later[0];
  return hasWeak ? "weak" : null;
}

// Python's round(): a half goes to the even number (12.5 -> 12, 13.5 -> 14), so both apps agree.
export function pythonRound(x) {
  const down = Math.floor(x), rest = x - down;
  if (Math.abs(rest - 0.5) < 1e-9) return down % 2 === 0 ? down : down + 1;
  return Math.round(x);
}

export function scorePercent(drill) {
  const total = Object.keys(drill.items).length;
  return pythonRound((100 * (total - drill.firstWrong.length)) / total);
}

// The name under which your accepted answers to a question are saved (answer_key in Python).
export function answerKey(item) {
  let question = item.prompt;
  if (item.speak) question = item.speak;
  else if (item.mode === "build") question = (item.tiles || []).join(" ");
  return `${item.mode}|${question}|${item.hint || ""}`;
}

// The name under which "Mark as done" is saved (done_key in Python).
export function doneKey(item) {
  const source = item.id.split("|")[0];
  return source.startsWith("THEME_") ? `${source}|list:${item.group}` : `${source}|${item.mode}`;
}

// (share right on the first try last time, number practised); the share is null below MIN_PRACTISED.
export function firstTryScore(items, statsById) {
  const practised = items.filter((item) => item.id in statsById);
  if (practised.length < MIN_PRACTISED) return [null, practised.length];
  const right = practised.filter((item) => statsById[item.id].last_ok).length;
  return [right / practised.length, practised.length];
}
