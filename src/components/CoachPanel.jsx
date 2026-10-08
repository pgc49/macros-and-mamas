import { useEffect, useMemo, useRef, useState } from "react";

import { T, F, FD } from "../theme/tokens";
import {
  COACH_ASK_CALLIE_PREFILL,
  COACH_COPY,
  COACH_DEFLECT,
  COACH_SLOT_TITLE,
  askForSlotCopy,
  skipMealCopy,
} from "../content/coachVoice";
import { shownCoachLead } from "../utils/coachLines";
import {
  buildCoachAnswer,
  buildSuggestedCards,
  coachDayForPrompt,
  replayCoachMessages,
  recentNamesForPrompt,
} from "../utils/coachSession";
import { cardsWithShownReason, firstPaintPlates } from "../utils/coachRank";
import { CoachMealCard, CoachMealSheet } from "./CoachMealCard";
import { loggedSlotsFromEntries, nextCoachSlot } from "../utils/coachBudget";
import { localCoachIntent, slotNamedInAsk } from "../utils/coachIntent";
import { classifyAsk, deflectForScope, scopeIsRefused } from "../../functions/_shared/coachGuardrails";
import { askedForMealOptions } from "../../functions/_shared/coachAskMeals";
import { isWontLogRefusal } from "../../functions/_shared/coachRefusalSummary";
import { countTeachInThread, hasMenuLink, localCoachTeach, PAIN_TOPICS, teachBody } from "../utils/coachTeach";
import { downscaleImage } from "../utils/imageDownscale";
import { localDateIso } from "../utils/dates";

const QUICK_ASKS = [
  { id: "eat", label: COACH_COPY.askEat, kind: "cards" },
  { id: "out", label: COACH_COPY.askOut, kind: "photo", photo: "menu" },
  { id: "day", label: COACH_COPY.askDay, kind: "read" },
];

let localId = 0;
const nextId = () => {
  localId += 1;
  return `c_${localId}`;
};

const bubble = (mine) => ({
  maxWidth: "88%",
  alignSelf: mine ? "flex-end" : "flex-start",
  background: mine ? T.accentSoft : "#fff",
  color: T.ink,
  border: mine ? "none" : `1px solid ${T.border}`,
  borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
  padding: "10px 13px",
  fontSize: 14,
  lineHeight: 1.5,
});

const chipBtn = {
  fontFamily: F,
  fontSize: 12.5,
  fontWeight: 700,
  padding: "8px 12px",
  minHeight: 36,
  borderRadius: 999,
  border: `1.5px solid ${T.border}`,
  background: "#fff",
  color: T.inkSoft,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/**
 * The coach.
 *
 * The question she asks most often — "what should I eat?" — never leaves the
 * device: the budget, the ranking and the cards all come from
 * `buildCoachAnswer`, so it answers in a frame with no spinner. Only free
 * text and photos go to /api/coach, and anything that endpoint returns is
 * re-fit-checked here before it becomes a card.
 */
export function CoachPanel({
  profile,
  macros,
  totals,
  entries = [],
  plannedMeals = [],
  mealHistoryByDate = {},
  customMeals = [],
  onLogCard,
  onPencilCard,
  onSaveCard,
  onAskCallie,
  onLoadThread,
  onAppendMessage,
  postCoach,
  now = null,
}) {
  // Captured once, unless the caller hands an instant (tests, the Today card).
  // The slot is Pacific wall time of this instant, not Date#getHours.
  const clockRef = useRef(now || new Date());
  if (now) clockRef.current = now;
  const clock = clockRef.current;
  const [thread, setThread] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sheetCard, setSheetCard] = useState(null);
  const [slotOverride, setSlotOverride] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const photoKindRef = useRef("menu");
  const endRef = useRef(null);
  const sentRef = useRef(false);
  const openedRef = useRef(false);
  // What she's already been shown. A ref, not state: it only ever feeds the
  // next answer she asks for, and as state it would be a render behind the tap.
  const skipRef = useRef([]);
  const wontLogRef = useRef(false);

  const inputs = { profile, macros, totals, entries, plannedMeals, mealHistoryByDate, customMeals };

  const answer = useMemo(
    () => buildCoachAnswer({
      profile,
      macros,
      totals,
      entries,
      plannedMeals,
      mealHistoryByDate,
      customMeals,
      slot: slotOverride,
      now: clock,
    }),
    [profile, macros, totals, entries, plannedMeals, mealHistoryByDate, customMeals, slotOverride, clock],
  );
  const answerRef = useRef(answer);
  answerRef.current = answer;

  /**
   * Catch up on today, or — if there's nothing to catch up on — answer the
   * question she opened the coach to ask. Making her tap "What should I eat?"
   * to get an answer that was already worked out is a step for nothing.
   *
   * No cancel-on-unmount flag here, deliberately. StrictMode runs an effect,
   * tears it down and runs it again: the first pass claimed `openedRef` and
   * started the read, the second pass saw the claim and stood down, and then
   * the first pass came back to a torn-down flag and dropped the rows on the
   * floor. Both halves of the coach failed that way — it never answered on
   * open, and the thread looked wiped every time she came back from Messages
   * even though every message was safely in the table.
   *
   * `answerReady` is in the deps because macros can arrive a paint late, and
   * an effect that bails on a null answer and never re-runs never answers.
   */
  const answerReady = Boolean(answer);
  useEffect(() => {
    if (openedRef.current || !answerReady) return;
    openedRef.current = true;
    (async () => {
      const rows = await onLoadThread?.();
      if (Array.isArray(rows) && rows.length) {
        setThread(rows.map((r) => ({
          id: r.id,
          role: r.role,
          body: r.body,
          kind: r.kind,
          cards: r.payload?.cards || [],
          deflect: r.payload?.deflect || null,
          aside: r.payload?.aside || null,
        })));
        return;
      }
      answerWithCards({ echo: false });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLoadThread, answerReady]);

  useEffect(() => {
    if (!thread.length) return;
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [thread.length, busy]);

  const push = (message, { persist = true } = {}) => {
    const entry = { id: nextId(), ...message };
    setThread((list) => [...list, entry]);
    if (persist) {
      onAppendMessage?.({
        role: message.role,
        body: message.body || "",
        kind: message.kind || "text",
        template: message.template || (message.role === "coach" ? "local.text" : null),
        topic: message.teach || null,
        payload: message.cards?.length || message.deflect || message.aside || message.teach
          ? {
            cards: message.cards || [],
            deflect: message.deflect || null,
            aside: message.aside || null,
            teach: message.teach || null,
          }
          : null,
      });
    }
    return entry;
  };

  const slotTitle = COACH_SLOT_TITLE[answer?.slot] || "Next meal";

  /* ---------------------------------------------------------------- */
  /*  Answers that never leave the device                              */
  /* ---------------------------------------------------------------- */

  /**
   * Cards for a slot, worked out here rather than asked for. `slot` is only
   * passed when she named one, so the usual case still follows the clock.
   */
  const answerWithCards = ({ prefer = null, slot = null, askLabel = COACH_COPY.askEat, echo = true, aside = null } = {}) => {
    const build = (skipNames) => buildCoachAnswer({
      ...inputs,
      slot: slot || slotOverride,
      prefer,
      skipNames,
      now: clock,
    });

    if (echo) push({ role: "mama", body: askLabel });
    if (slot && slot !== answer?.slot) setSlotOverride(slot);

    let next = build(skipRef.current);
    let cards = next?.cards?.filter((c) => c.kind === "meal") || [];
    let lead = "";

    // Running out of new ideas is not the same as nothing fitting. Say which
    // one it is, then start the bank over rather than dead-ending her.
    if (!cards.length && skipRef.current.length) {
      skipRef.current = [];
      next = build([]);
      cards = next?.cards?.filter((c) => c.kind === "meal") || [];
      if (cards.length) lead = `${COACH_COPY.seenAll} `;
    }

    if (!cards.length) {
      push({ role: "coach", body: COACH_COPY.noneFit, kind: "text", aside, template: "local.noneFit" });
      return;
    }

    // One plate. A second card is only the half portion of that same plate.
    cards = firstPaintPlates(cards);
    skipRef.current = [...new Set([...skipRef.current, ...cards.map((c) => c.name)])];
    const loggedOther = loggedSlotsFromEntries(entries).size > 0;
    const skipLine = skipMealCopy(next.skipped, { loggedOtherMeals: loggedOther });
    lead += skipLine || "";
    push({ role: "coach", body: shownCoachLead(lead.trim()), kind: "cards", cards, aside, template: "local.cards" });
  };

  const answerWithRead = ({ askLabel = COACH_COPY.askDay, echo = true, aside = null } = {}) => {
    if (!answer) return;
    if (echo) push({ role: "mama", body: askLabel });
    const lines = [answer.left, answer.why].filter(Boolean).join("\n\n");
    push({ role: "coach", body: lines, kind: "read", aside, template: "local.read" });
  };

  /**
   * Everything already shown is skipped rather than reshuffled, so "none of
   * these" never hands her back a card she has just turned down.
   */
  const showMore = ({ askLabel = COACH_COPY.notThese, echo = true } = {}) => {
    answerWithCards({ askLabel, echo });
  };

  /* ---------------------------------------------------------------- */
  /*  Answers that need the model                                      */
  /* ---------------------------------------------------------------- */

  const send = async ({ mode, text, images }) => {
    if (busy || sentRef.current) return;
    sentRef.current = true;
    setBusy(true);
    setError("");
    // "Tonight" / "dinner" beats the clock. The panel may still be on
    // breakfast from an earlier open; the cards and the log have to follow
    // the meal she just named.
    const named = slotNamedInAsk(text);
    const slotForAsk = named || answer?.slot || "dinner";
    const fit = named && named !== answer?.slot
      ? (buildCoachAnswer({ ...inputs, slot: named, now: clock }) || answer)
      : answer;
    if (named && named !== answer?.slot) setSlotOverride(named);
    try {
      const data = await postCoach?.({
        mode,
        text,
        slot: slotForAsk,
        budget: fit?.budget
          ? {
            cal: fit.budget.cal,
            pNeed: fit.budget.pNeed,
            c: fit.budget.c,
            f: fit.budget.f,
          }
          : null,
        recent: recentNamesForPrompt(mealHistoryByDate, entries),
        context: coachDayForPrompt({
          entries,
          plannedMeals,
          mealHistoryByDate,
          slot: slotForAsk,
          skipped: fit?.skipped,
          snackCount: fit?.budget?.snackCount,
          turnedDown: skipRef.current,
          alreadySuggested: skipRef.current,
          notLogging: wontLogRef.current,
        }),
        localDate: localDateIso(clock),
        images,
      });

      if (!data?.ok) {
        setError(data?.message || "I couldn't get to that. Try me again in a second.");
        return;
      }

      if (data.deflect) {
        push({ role: "coach", body: "", kind: "deflect", deflect: data.deflect }, { persist: false });
        return;
      }

      // The model's meals are re-checked against the real budget here. One that
      // no longer fits is dropped rather than shown with a caveat.
      const suggested = cardsWithShownReason(buildSuggestedCards(data.meals, fit, {
        source: data.mealSource || "new",
        slot: slotForAsk,
      }));
      const cards = askedForMealOptions(text) ? suggested.slice(0, 3) : firstPaintPlates(suggested);
      skipRef.current = [...new Set([...skipRef.current, ...cards.map((c) => c.name)])];
      const body = data.reply || (cards.length ? "" : COACH_COPY.cantSeeIt);
      push({
        role: "coach",
        body,
        kind: cards.length ? "cards" : "text",
        cards,
        aside: data.aside || null,
      }, { persist: false });
    } catch (e) {
      console.error("coach send failed", e);
      setError("I couldn't get to that. Try me again in a second.");
    } finally {
      sentRef.current = false;
      setBusy(false);
    }
  };

  // The deflect is already on screen. This post only asks the server to
  // append a stuck or medical brief. A failure here does not take Message
  // Callie away. Supply, care, and off-scope stay in the thread only.
  const noteEscalation = (asked, escalate) => {
    const payload = { mode: "ask", text: asked, localDate: localDateIso(clock) };
    if (escalate) payload.escalate = escalate;
    Promise.resolve(postCoach?.(payload)).catch(() => {});
  };

  const submitText = async () => {
    const text = input.trim();
    if (!text && !photo) return;
    setInput("");
    if (photo) {
      const kind = photo.kind;
      push({ role: "mama", body: text || (kind === "menu" ? COACH_COPY.sentMenu : COACH_COPY.sentFridge), kind: "photo" });
      const images = [{ image_b64: photo.b64, media_type: "image/jpeg" }];
      setPhoto(null);
      await send({ mode: kind, text, images });
      return;
    }
    // The same guardrail the endpoint runs, run here as well. She sees Message
    // Callie in this frame, unsent. The post records the refusal on her card
    // and does not spend a model call. The server classifies again; this copy
    // is only as trustworthy as the browser.
    const verdict = classifyAsk(text);
    push({ role: "mama", body: text });
    if (verdict.scope === "urgent") {
      noteEscalation(text);
      push({ role: "coach", body: "", kind: "deflect", deflect: deflectForScope(verdict.scope, text) }, { persist: false });
      return;
    }

    if (isWontLogRefusal(text)) wontLogRef.current = true;

    // Callie's own sentences, before the meal router and before a model.
    // Asked a third time in a day, a pain point goes to her instead.
    const teach = localCoachTeach(text);
    if (teach) {
      const teachCount = countTeachInThread(thread, teach.topic);
      if (PAIN_TOPICS.has(teach.topic) && teachCount >= 2) {
        noteEscalation(text, "stuck");
        // Server persists the stuck handoff. Do not record it again here.
        push({ role: "coach", body: "", kind: "deflect", deflect: "again" }, { persist: false });
        return;
      }
      const carbsShort = answer?.bands
        ? (totals?.c || 0) < (answer.bands.cLo || 0)
        : false;
      push({
        role: "coach",
        body: teachBody(teach.topic, { totals, carbsShort, again: teach.topic === "neverSkip" && teachCount >= 1 }),
        kind: "teach",
        teach: teach.topic,
        aside: verdict.aside,
        template: "local.teach",
      });
      return;
    }

    // Answered here when it can be. She gets the cards in the same frame she
    // pressed send, and the model call is saved for a question that needs one.
    // A pasted link is read on the server. The phone must not answer it
    // from the recipe bank before that fetch happens.
    const intent = hasMenuLink(text) ? null : localCoachIntent(text);
    if (intent) {
      if (intent.kind === "read") answerWithRead({ echo: false, aside: verdict.aside });
      else if (intent.kind === "more") showMore({ echo: false });
      else answerWithCards({ prefer: intent.prefer, slot: intent.slot, echo: false, aside: verdict.aside });
      return;
    }

    if (scopeIsRefused(verdict.scope)) {
      push({ role: "coach", body: "", kind: "deflect", deflect: deflectForScope(verdict.scope, text) }, { persist: false });
      return;
    }

    await send({ mode: "ask", text });
  };

  const pickPhoto = (kind) => {
    photoKindRef.current = kind;
    fileRef.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const kind = photoKindRef.current;
    setError("");
    const b64 = await downscaleImage(file, kind === "menu" ? 1280 : 900);
    if (!b64) {
      setError("I couldn't read that photo. Try another one.");
      return;
    }
    setPhoto({ b64, kind });
  };

  /* ---------------------------------------------------------------- */
  /*  Card actions                                                     */
  /* ---------------------------------------------------------------- */

  const logCard = async (card) => {
    const ok = await onLogCard?.(card, answer?.slot);
    if (ok === true) setSheetCard(null);
    return ok;
  };

  const pencilCard = async (card) => {
    const ok = await onPencilCard?.(card, answer?.slot);
    if (ok === true) setSheetCard(null);
    return ok;
  };

  const saveCard = (card) => onSaveCard?.(card, answer?.slot);

  // Re-checked against the meals she still has saved. The open effect runs
  // once, so a delete after that load has to drop the card here, not in state.
  const shownThread = useMemo(
    () => replayCoachMessages(thread, customMeals),
    [thread, customMeals],
  );

  if (!answer) {
    return (
      <div style={{ padding: "24px 0", fontSize: 14, color: T.inkSoft, lineHeight: 1.6 }}>
        Your coach unlocks once Callie approves your ranges.
      </div>
    );
  }

  const logged = loggedSlotsFromEntries(entries);
  const next = nextCoachSlot({ entries, plannedMeals, now: clock });
  const opener = logged.size === 0
    ? COACH_COPY.openerFresh
    : (next ? askForSlotCopy(next) : COACH_COPY.openerDone);
  const shownCards = shownThread.some((m) => (m.cards || []).length > 0);

  return (
    // Same shape Messages uses under the shell's `lockContentScroll`: fill the
    // leftover height, scroll the conversation inside, and leave the composer
    // out of the scrolling area entirely.
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        height: "100%",
        overflow: "hidden",
      }}
    >
      <div
        data-coach-scroll
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "4px 0 10px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>{COACH_COPY.title}</h2>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: T.accentDeep,
            }}
            >
              {COACH_COPY.betaLabel}
            </span>
          </div>
          <p style={{ fontSize: 13.5, color: T.inkSoft, margin: "6px 0 0", lineHeight: 1.45 }}>{COACH_COPY.betaNote}</p>
        </div>

        <div
          style={{
            background: T.accentSoft,
            borderRadius: 14,
            padding: "10px 13px",
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: T.accentDeep }}>
            {/* "0 cal to play with" is not a headline to give anyone. */}
            {answer.strip.over ? slotTitle : `${slotTitle} · ${Math.round(answer.budget.cal)} cal to play with`}
          </div>
        </div>

        <p
          data-testid="coach-callie-reads"
          style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.45, margin: "0 0 12px" }}
        >
          {COACH_COPY.callieReads}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: "1 1 auto" }}>
          {!next && (
            <div style={bubble(false)}>{opener}</div>
          )}
          {next && answer.snackAsk ? (
            <div style={bubble(false)}>{COACH_COPY.snackAsk}</div>
          ) : null}

          {shownThread.map((m) => (
            <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
              {(m.aside === "nursing" || m.aside === "both") && (
                <div style={bubble(false)}>{COACH_COPY.nursingPreface}</div>
              )}

              {m.body && <div style={bubble(m.role === "mama")}>{m.body}</div>}

              {m.kind === "deflect" && (
                <div style={{ ...bubble(false), background: T.amberSoft, border: "none" }}>
                  <div style={{ marginBottom: 10 }}>{(COACH_DEFLECT[m.deflect] || COACH_DEFLECT.offTopic).line}</div>
                  <button
                    type="button"
                    onClick={() => onAskCallie?.(lastMamaBody(thread, m.id))}
                    style={{
                      fontFamily: F,
                      fontSize: 13,
                      fontWeight: 700,
                      padding: "9px 14px",
                      minHeight: 40,
                      borderRadius: 999,
                      border: "none",
                      background: T.accent,
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {(COACH_DEFLECT[m.deflect] || COACH_DEFLECT.offTopic).cta}
                  </button>
                </div>
              )}

              {(m.cards || []).map((card, i) => (
                <CoachMealCard
                  key={`${m.id}-${card.name}-${i}`}
                  card={card}
                  onLog={logCard}
                  onPencil={pencilCard}
                  onSave={saveCard}
                  onOpen={setSheetCard}
                />
              ))}

              {(m.aside === "care" || m.aside === "both") && (
                <div style={{ ...bubble(false), background: T.amberSoft, border: "none", marginTop: 8 }}>
                  <div style={{ marginBottom: 10 }}>{COACH_DEFLECT.care.line}</div>
                  <button
                    type="button"
                    onClick={() => onAskCallie?.(lastMamaBody(thread, m.id))}
                    style={{
                      fontFamily: F,
                      fontSize: 13,
                      fontWeight: 700,
                      padding: "9px 14px",
                      minHeight: 40,
                      borderRadius: 999,
                      border: "none",
                      background: T.accent,
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {COACH_DEFLECT.care.cta}
                  </button>
                </div>
              )}

              {m.aside === "supply" && (
                <div style={{ ...bubble(false), background: T.amberSoft, border: "none", marginTop: 8 }}>
                  <div style={{ marginBottom: 10 }}>{COACH_DEFLECT.supply.line}</div>
                  <button
                    type="button"
                    onClick={() => onAskCallie?.(lastMamaBody(thread, m.id))}
                    style={{
                      fontFamily: F,
                      fontSize: 13,
                      fontWeight: 700,
                      padding: "9px 14px",
                      minHeight: 40,
                      borderRadius: 999,
                      border: "none",
                      background: T.accent,
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {COACH_DEFLECT.supply.cta}
                  </button>
                </div>
              )}
            </div>
          ))}

          {busy && (
            <div style={{ ...bubble(false), color: T.inkSoft }} aria-live="polite">
              {COACH_COPY.thinking}…
            </div>
          )}
          {error && (
            <div style={{ ...bubble(false), background: T.amberSoft, border: "none", color: T.amber }} role="alert">
              {error}
            </div>
          )}
          {/* Scroll target. The composer lives outside this scroller now, so
              this only needs to clear the edge rather than a sticky footer. */}
          <div ref={endRef} style={{ height: 1, scrollMarginBottom: 8 }} />
        </div>
      </div>

      {/* Outside the scroller, so there is no strip for the thread to show
          through and nothing to pin. It was sticky once, and the shell's
          padding below it stayed a live window onto the cards going past. */}
      <div
        style={{
          flexShrink: 0,
          background: T.bg,
          paddingTop: 10,
        }}
      >
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, WebkitOverflowScrolling: "touch" }}>
          {QUICK_ASKS.map((q) => (
            <button
              key={q.id}
              type="button"
              style={chipBtn}
              disabled={busy}
              onClick={() => {
                if (q.kind === "cards") answerWithCards({ askLabel: q.label });
                else if (q.kind === "read") answerWithRead({ askLabel: q.label });
                else pickPhoto(q.photo);
              }}
            >
              {q.label}
            </button>
          ))}
          {shownCards && (
            <>
              <button
                type="button"
                style={chipBtn}
                disabled={busy}
                onClick={() => answerWithCards({ prefer: "lighter", askLabel: COACH_COPY.lighter })}
              >
                {COACH_COPY.lighter}
              </button>
              <button
                type="button"
                style={chipBtn}
                disabled={busy}
                onClick={() => answerWithCards({ prefer: "protein", askLabel: COACH_COPY.moreProtein })}
              >
                {COACH_COPY.moreProtein}
              </button>
              <button type="button" style={chipBtn} disabled={busy} onClick={() => showMore()}>
                {COACH_COPY.notThese}
              </button>
            </>
          )}
        </div>

        {photo && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <img
              src={`data:image/jpeg;base64,${photo.b64}`}
              alt={photo.kind === "menu" ? "Menu photo" : "Kitchen photo"}
              style={{
                width: 44,
                height: 44,
                // A flex row squashed the tall menu shot down to a sliver, so
                // the photo she just took looked like nothing had attached.
                flex: "0 0 44px",
                borderRadius: 8,
                objectFit: "cover",
                // Centre-cropping a menu lands on the blank gap between two
                // courses. The top has the restaurant's name on it, so she can
                // tell at a glance which photo she picked.
                objectPosition: "top",
                // And a menu is mostly white paper, so without an edge the
                // preview disappears into the composer.
                border: `1px solid ${T.border}`,
                background: "#fff",
              }}
            />
            <span style={{ fontSize: 12.5, color: T.inkSoft }}>
              {photo.kind === "menu" ? COACH_COPY.photoMenu : COACH_COPY.photoFridge} ready
            </span>
            <button
              type="button"
              onClick={() => setPhoto(null)}
              style={{ fontFamily: F, fontSize: 12.5, fontWeight: 700, color: T.accentDeep, background: "none", border: "none", cursor: "pointer" }}
            >
              {COACH_COPY.photoRemove}
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", paddingBottom: 8 }}>
          <button
            type="button"
            aria-label={COACH_COPY.addPhoto}
            disabled={busy}
            onClick={() => pickPhoto("menu")}
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: `1.5px solid ${T.border}`,
              background: "#fff",
              color: T.inkSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              cursor: "pointer",
              flex: "0 0 auto",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M20.5 11.5 12 20a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.9-7.8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {/* No `capture` attribute. With it, iOS goes straight to the camera
              and there is no way to reach a menu she photographed earlier. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onFile}
            style={{ display: "none" }}
          />
          <textarea
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitText();
              }
            }}
            placeholder={busy ? COACH_COPY.placeholderBusy : COACH_COPY.placeholder}
            aria-label={COACH_COPY.placeholder}
            style={{
              flex: "1 1 auto",
              fontFamily: F,
              fontSize: 15,
              lineHeight: 1.4,
              padding: "12px 14px",
              minHeight: 44,
              maxHeight: 120,
              borderRadius: 22,
              border: `1.5px solid ${T.border}`,
              background: "#fff",
              color: T.ink,
              resize: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            onClick={submitText}
            disabled={busy || (!input.trim() && !photo)}
            style={{
              fontFamily: F,
              fontSize: 13,
              fontWeight: 700,
              padding: "0 16px",
              height: 44,
              borderRadius: 999,
              border: "none",
              background: busy || (!input.trim() && !photo) ? T.track : T.accent,
              color: busy || (!input.trim() && !photo) ? T.inkSoft : "#fff",
              cursor: busy ? "default" : "pointer",
              flex: "0 0 auto",
            }}
          >
            {COACH_COPY.send}
          </button>
        </div>
      </div>

      {sheetCard && (
        <CoachMealSheet
          card={sheetCard}
          onClose={() => setSheetCard(null)}
          onLog={logCard}
          onPencil={pencilCard}
          onSave={saveCard}
        />
      )}
    </div>
  );
}

/** The question she actually asked, so Ask Callie doesn't make her retype it. */
function lastMamaBody(thread, beforeId) {
  const idx = thread.findIndex((m) => m.id === beforeId);
  for (let i = (idx < 0 ? thread.length : idx) - 1; i >= 0; i -= 1) {
    if (thread[i].role === "mama" && thread[i].body) return thread[i].body;
  }
  return "";
}

export { COACH_ASK_CALLIE_PREFILL };
