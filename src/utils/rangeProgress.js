/** empty | under | in | over — sage only inside Callie's lo–hi. */
export function rangeState(eaten, lo, hi) {
  if (typeof eaten !== "number" || eaten <= 0) return "empty";
  if (eaten < lo) return "under";
  if (eaten <= hi) return "in";
  return "over";
}

/**
 * How much is left to reach the band (or how far over the top).
 * Under → a left range (to lo–hi). In → room to the top. Over → overage.
 */
export function rangeProgress(eaten, lo, hi) {
  const st = rangeState(eaten, lo, hi);
  const e = Math.round(Number(eaten) || 0);
  const low = Math.round(Number(lo) || 0);
  const high = Math.round(Number(hi) || 0);
  if (st === "empty") return { state: "empty", eaten: 0 };
  if (st === "under") {
    return {
      state: "under",
      eaten: e,
      leftLo: Math.max(0, low - e),
      leftHi: Math.max(0, high - e),
    };
  }
  if (st === "in") {
    return { state: "in", eaten: e, room: Math.max(0, high - e) };
  }
  return { state: "over", eaten: e, over: Math.max(0, e - high) };
}

/** Caption under a macro band / calories row — keeps mental math off her plate. */
export function formatRangeProgress(eaten, lo, hi, unit = "g") {
  const r = rangeProgress(eaten, lo, hi);
  if (r.state === "empty") return null;
  if (r.state === "under") {
    const left = r.leftLo === r.leftHi
      ? `${r.leftLo}${unit} left`
      : `${r.leftLo}–${r.leftHi}${unit} left`;
    return { state: "under", logged: `${r.eaten}${unit} logged`, detail: left };
  }
  if (r.state === "in") {
    return {
      state: "in",
      logged: `${r.eaten}${unit} logged`,
      detail: r.room > 0 ? `${r.room}${unit} room` : "at the top",
    };
  }
  return {
    state: "over",
    logged: `${r.eaten}${unit} logged`,
    detail: `${r.over}${unit} over`,
  };
}
