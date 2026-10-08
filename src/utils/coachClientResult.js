/**
 * /api/coach can come back 429 or 502 with plates attached. A status
 * that is not 200 is not a reason to throw those cards away.
 */
export function readCoachClientData(resp, data) {
  const meals = Array.isArray(data?.meals) ? data.meals.filter((meal) => meal?.name) : [];
  const reply = String(data?.reply || data?.message || "").trim();
  if (resp?.ok) return { ...data, ok: true, meals, reply: data?.reply };
  if (meals.length) {
    return {
      ok: true,
      status: resp?.status,
      reply,
      meals,
      mealSource: data?.mealSource || "new",
      aside: data?.aside || null,
      limited: data?.error === "rate_limited",
    };
  }
  return {
    ok: false,
    status: resp?.status,
    timeout: false,
    message: reply || "I couldn't get to that. Try me again in a second.",
  };
}
