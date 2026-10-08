/**
 * Thread follow-ups: "the second one", "yes please", "make it spicier",
 * "too much work", "no thanks". The last reply's cards come from the phone.
 */

const ORDINALS = {
  first: 0,
  "1st": 0,
  second: 1,
  "2nd": 1,
  third: 2,
  "3rd": 2,
};

export function lastCardsFromContext(day) {
  const cards = Array.isArray(day?.lastCards) ? day.lastCards : [];
  return cards.filter((card) => card?.name).slice(0, 3);
}

export function followUpKind(raw) {
  const t = String(raw || "").toLowerCase().trim();
  if (!t) return null;
  if (/\b(no thanks|no thank you|i'?m good|all set|never mind|not tonight)\b/.test(t) && t.length < 80) {
    return "close";
  }
  if (/\b(too much work|less work|easier|simpler|something easier)\b/.test(t)) return "easier";
  if (/\b(spicier|more spice|make it spicy|add heat)\b/.test(t)) return "spicier";
  if (/\b(the )?(first|second|third|1st|2nd|3rd) one\b/.test(t)) return "pick";
  if (/\b(yes please|yes pls|more like that|another like (that|this)|something like that|that one)\b/.test(t)) {
    return "more";
  }
  return null;
}

export function pickLastCard(raw, lastCards = []) {
  const list = (lastCards || []).filter((card) => card?.name);
  if (!list.length) return null;
  const t = String(raw || "").toLowerCase();
  const hit = t.match(/\b(the )?(first|second|third|1st|2nd|3rd) one\b/);
  if (!hit) return list[0];
  const idx = ORDINALS[hit[2]];
  return list[Number.isInteger(idx) ? idx : 0] || list[0];
}

export function spicePlate(meal) {
  if (!meal?.name) return null;
  const name = String(meal.name).replace(/\s·.*$/, "").trim();
  const spicy = /spicy|chili|hot/i.test(name) ? name : `${name} · spicier`;
  return {
    ...meal,
    name: spicy.slice(0, 48),
    desc: "Same plate, more heat — chili flakes, hot sauce, or extra pepper.",
    steps: [
      ...(Array.isArray(meal.steps) ? meal.steps : []),
      "Add chili flakes, hot sauce, or extra pepper to taste.",
    ].slice(0, 6),
  };
}

export const COACH_FOLLOW_CLOSE = "Okay — I'm here when you want the next one.";
