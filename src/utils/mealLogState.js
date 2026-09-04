/**
 * Keep Today's log list in sync with the week map.
 * todayLog can be emptied on a hydrate date-mismatch even when meal_logs rows exist.
 */

export function entriesForLogDate(date, mealLogsByDate, todayLog) {
  if (!date) return todayLog?.entries || [];
  if (mealLogsByDate && Object.prototype.hasOwnProperty.call(mealLogsByDate, date)) {
    return mealLogsByDate[date] || [];
  }
  if (todayLog?.date === date) return todayLog.entries || [];
  return [];
}

/** Build the selected-day log after loadClientState. Never wipe meals the map already has. */
export function hydrateTodayLog(state, today) {
  const fromMap = state?.mealLogsByDate?.[today] || state?.mealHistoryByDate?.[today];
  if (Array.isArray(fromMap)) {
    return { date: today, entries: fromMap };
  }
  if (state?.todayLog?.date === today) {
    return { date: today, entries: state.todayLog.entries || [] };
  }
  return { date: today, entries: [] };
}

export function sumLogTotals(entries) {
  return (entries || []).reduce(
    (a, e) => ({
      cal: a.cal + (Number(e.cal) || 0),
      p: a.p + (Number(e.p) || 0),
      c: a.c + (Number(e.c) || 0),
      f: a.f + (Number(e.f) || 0),
    }),
    { cal: 0, p: 0, c: 0, f: 0 },
  );
}
