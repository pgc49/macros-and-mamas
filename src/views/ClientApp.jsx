import { CONFIG, hasPublicUrl } from "../config";
import { T, F, FD } from "../theme/tokens";
import { SKELETONS, RECIPES, DEFAULT_ITEMS, DAYS, DAY_LABEL } from "../content/data";
import { addDaysIso, fmtRange, formatLongDay, isTodayIso, weekdayKey, wkStartOf } from "../utils/dates";
import { Shell, Card, Btn, Chip, RangeBand, rangeState } from "../components/ui";
import { MealLogCard } from "../components/MealLogCard";
import { MealRecipeCard } from "../components/MealRecipeCard";
import { WaterLogCard } from "../components/WaterLogCard";
import { ProgressCharts } from "../components/ProgressCharts";
import { WeighInCard } from "../components/WeighInCard";
import { HomeScreenTip } from "../components/HomeScreenTip";
import { mealToCard } from "../content/recipeDetails";

export function ClientApp({
  tab, setTab,
  profile, macros,
  totals, waterOz,
  estimateBusy, estimate,
  analyzePhoto, analyzeText, confirmEstimate, discardEstimate,
  logManualMeal, logRecipe, todayLog, deleteMealEntry, updateMealEntry,
  mealLogDate, mealLogWeekStart, mealLogsByDate, selectMealLogDate, changeMealWeek,
  waterLogsByDate, waterBusy, onAddWater, onUndoWater, onChangeBottleOz,
  viewWk, setViewWk, curWk, editPast, setEditPast,
  checksByWeek, toggleCheck, adherenceFor, progWeekNum, earliestWk,
  weighins, logWeighin, deleteWeighin, weeklyRate, trends,
  macroHistory, habitHistory,
  mealFilter, setMealFilter,
  mealPlanMode = "default",
  publishedPlan = null,
}) {
  const personalized = mealPlanMode === "personalized" && publishedPlan?.days?.length;
  const flatPersonalized = personalized
    ? publishedPlan.days.flatMap((d) => (d.meals || []).map((m) => mealToCard(m)))
    : [];
  const hi = (n, d = 10) => n + d;
  const hasElectrolytes = hasPublicUrl(CONFIG.FULLSCRIPT_ELECTROLYTES);
  const hasSleep = hasPublicUrl(CONFIG.FULLSCRIPT_SLEEP);
  const hasDigestion = hasPublicUrl(CONFIG.FULLSCRIPT_DIGESTION);
  const hasAnySupport = hasElectrolytes || hasSleep || hasDigestion;
  const viewingToday = isTodayIso(mealLogDate || todayLog?.date);
  const todayWeekday = weekdayKey();
  const pLo = macros?.protein ?? 0;
  const pHi = hi(pLo);
  const cLo = macros?.carbs ?? 0;
  const cHi = hi(cLo);
  const fLo = macros?.fat ?? 0;
  const fHi = hi(fLo);
  const calLo = macros?.cal ?? 0;
  const calHi = calLo + 150;
  const pSt = rangeState(totals?.p, pLo, pHi);
  const cSt = rangeState(totals?.c, cLo, cHi);
  const fSt = rangeState(totals?.f, fLo, fHi);
  const calSt = rangeState(totals?.cal, calLo, calHi);
  const anyOver = [pSt, cSt, fSt, calSt].includes("over");
  const daysWithEntries = Object.fromEntries(
    Object.entries(mealLogsByDate || {}).map(([d, list]) => [d, (list || []).length > 0]),
  );
  const mealEarliestWeek = (() => {
    const fromChecks = earliestWk || wkStartOf();
    const floor = addDaysIso(wkStartOf(), -7 * 52);
    return fromChecks < floor ? fromChecks : floor;
  })();
  return (
    <Shell>
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "center", gap: 4, padding: "8px 0 14px", zIndex: 5 }}>
        {[["today", "Today"], ["meals", "Meals"], ["progress", "Progress"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            fontFamily: F, fontSize: 14, fontWeight: 700, padding: "9px 22px", borderRadius: 999, border: "none", cursor: "pointer",
            background: tab === k ? T.accentSoft : "transparent", color: tab === k ? T.accentDeep : T.inkSoft,
          }}>{l}</button>
        ))}
      </nav>

      {tab === "today" && macros && (
        <>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>
            {profile.name ? `Hi ${profile.name}.` : "Your ranges."}
          </h2>
          <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px" }}>
            {viewingToday
              ? "Live inside the bands. Busy, active day? Eat the top. Slow day? The bottom. Both count as a win."
              : `Ranges below show ${formatLongDay(mealLogDate)} — switch days in the meal log to compare.`}
          </p>

          <HomeScreenTip />

          <Card style={{ marginBottom: 4 }}>
            <RangeBand label="Protein" lo={pLo} hi={pHi} eaten={totals.p} />
            <RangeBand label="Carbs" lo={cLo} hi={cHi} eaten={totals.c} />
            <RangeBand label="Fat" lo={fLo} hi={fHi} eaten={totals.f} />
            <div style={{ borderTop: `1px dashed ${T.border}`, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{
                fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4,
                color: calSt === "over" ? T.amber : calSt === "in" ? T.sage : T.inkSoft,
              }}>
                {calSt === "empty" && "Calories land around"}
                {calSt === "under" && <>Calories · {Math.round(totals.cal)}</>}
                {calSt === "in" && <>Calories · {Math.round(totals.cal)} · ✓</>}
                {calSt === "over" && <>Calories · {Math.round(totals.cal)} · {Math.round(totals.cal - calHi)} over</>}
              </span>
              <span style={{ fontFamily: FD, fontSize: 22, color: calSt === "in" ? "#3E5A46" : T.ink }}>
                {calLo}–{calHi}
              </span>
            </div>
            {anyOver && (
              <div style={{ marginTop: 10, fontSize: 12, color: T.amber, lineHeight: 1.5 }}>
                Over on something today? Happens. Tomorrow start fresh.
              </div>
            )}
          </Card>

          <MealLogCard
            macros={macros}
            recipes={RECIPES}
            busy={estimateBusy}
            estimate={estimate}
            onAnalyzePhoto={analyzePhoto}
            onAnalyzeText={analyzeText}
            onConfirmEstimate={confirmEstimate}
            onDiscardEstimate={discardEstimate}
            onManualLog={logManualMeal}
            onLogRecipe={logRecipe}
            todayLog={todayLog}
            onUpdateEntry={updateMealEntry}
            onDeleteEntry={deleteMealEntry}
            mealLogDate={mealLogDate}
            mealLogWeekStart={mealLogWeekStart}
            daysWithEntries={daysWithEntries}
            onSelectMealDate={selectMealLogDate}
            onChangeMealWeek={(ws) => changeMealWeek(ws)}
            earliestWeekStart={mealEarliestWeek}
          />

          <WaterLogCard
            date={mealLogDate || todayLog?.date}
            goalOz={waterOz}
            bottleOz={profile.bottleOz || 24}
            entries={(waterLogsByDate || {})[mealLogDate || todayLog?.date] || []}
            busy={waterBusy}
            onAdd={onAddWater}
            onUndo={onUndoWater}
            onChangeBottle={onChangeBottleOz}
            electrolytesUrl={hasElectrolytes ? CONFIG.FULLSCRIPT_ELECTROLYTES : null}
          />

          {(() => {
            const isCur = viewWk === curWk;
            const editable = isCur || editPast;
            const vChecks = checksByWeek[viewWk] || {};
            const vAdh = adherenceFor(viewWk);
            const navBtn = (dir, disabled) => (
              <button disabled={disabled} onClick={() => { setViewWk(addDaysIso(viewWk, 7 * dir)); setEditPast(false); }} style={{
                width: 32, height: 32, borderRadius: "50%", border: `1.5px solid ${disabled ? T.track : T.border}`,
                background: "#fff", color: disabled ? "#D8CCD1" : T.ink, fontSize: 16, cursor: disabled ? "default" : "pointer",
              }}>{dir < 0 ? "‹" : "›"}</button>
            );
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "22px 0 4px" }}>
                  <h3 style={{ fontFamily: FD, fontWeight: 400, fontSize: 20, margin: 0 }}>
                    Week {progWeekNum(viewWk)} <span style={{ fontFamily: F, fontSize: 13, color: T.inkSoft }}>· {fmtRange(viewWk)}{isCur ? " · this week" : ""}</span>
                  </h3>
                  <div style={{ display: "flex", gap: 6 }}>
                    {navBtn(-1, viewWk <= earliestWk)}
                    {navBtn(1, isCur)}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 10px", gap: 10 }}>
                  <p style={{ fontSize: 13, color: T.inkSoft, margin: 0, flex: 1 }}>
                    {isCur
                      ? "Tap the days as you go. Strength days are yours to move."
                      : editPast
                        ? "Unlocked — fill in what you actually did, then lock it back up."
                        : "A look back. Forgot to log a day? Unlock it below."}
                  </p>
                  {!isCur && (
                    <button onClick={() => setEditPast(!editPast)} style={{
                      fontFamily: F, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                      padding: "7px 12px", borderRadius: 999, border: `1.5px solid ${T.accent}`,
                      background: editPast ? T.accent : "transparent", color: editPast ? "#fff" : T.accent,
                    }}>{editPast ? "🔓 Done editing" : "🔒 Edit this week"}</button>
                  )}
                </div>

                <Card>
                  {DEFAULT_ITEMS.map((it) => {
                    const strengthDone = it.daily ? 0 : DAYS.filter((d) => vChecks[`${it.id}|${d}`]).length;
                    return (
                      <div key={it.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
                          {it.label}
                          {it.id === "water" && waterOz ? <span style={{ color: T.inkSoft, fontWeight: 400 }}> · {waterOz} oz</span> : null}
                          {it.id === "strength" && (
                            <span style={{ color: T.inkSoft, fontWeight: 400 }}>
                              {" "}· goal 3× a week{strengthDone >= 3 ? " · ✓ goal hit" : ""}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {DAYS.map((d) => {
                            const done = vChecks[`${it.id}|${d}`];
                            const isTodayDot = isCur && d === todayWeekday;
                            return (
                              <button key={d}
                                onClick={() => { if (editable) toggleCheck(it.id, d); }}
                                title={isTodayDot ? "Today" : undefined}
                                aria-current={isTodayDot ? "date" : undefined}
                                style={{
                                  width: 36, height: 36, borderRadius: "50%", fontSize: 12, fontWeight: 700,
                                  cursor: editable ? "pointer" : "default",
                                  border: `1.5px solid ${done ? T.sage : isTodayDot ? T.accent : T.border}`,
                                  background: done ? T.sage : "#fff",
                                  color: done ? "#fff" : isTodayDot ? T.accentDeep : T.ink,
                                  boxShadow: isTodayDot && !done ? `0 0 0 3px ${T.accentSoft}` : "none",
                                  opacity: editable ? 1 : 0.85,
                                }}>{DAY_LABEL[d]}</button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ paddingTop: 12, fontSize: 13, color: T.inkSoft }}>
                    {isCur ? "Week so far: " : "This week finished at: "}
                    <b style={{ color: vAdh >= 70 ? T.sage : T.ink }}>{vAdh}%</b> — progress, not perfection.
                  </div>
                </Card>
              </>
            );
          })()}

          <Card style={{ marginTop: 12, background: T.sageSoft, border: "none" }}>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "#3E5A46" }}>
              <b>Morning sunlight + one or two walks</b> aren't extras — they steady your cortisol and your cravings. Ten minutes outside before scrolling.
            </div>
          </Card>
        </>
      )}

      {tab === "meals" && (
        <>
          <h2 style={{ fontFamily: FD, fontWeight: 400, fontSize: 26, margin: "6px 0 2px" }}>Automate your plate</h2>
          <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px" }}>
            {personalized
              ? "Your week from Callie — open a meal for ingredients and steps, then + Log to add it to your day."
              : "Same breakfasts, similar lunches, dinner gets to be fun. Repetition is the secret — decide once, win all week."}
          </p>

          {!personalized && (
            <Card style={{ background: T.accentSoft, border: "none", marginBottom: 14 }}>
              {SKELETONS.map((s) => (
                <div key={s.meal} style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: FD, fontSize: 17, color: T.accentDeep }}>{s.meal} <span style={{ fontFamily: F, fontSize: 13, color: T.inkSoft }}>— {s.formula}</span></div>
                  <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.6 }}>{s.lines.join(" · ")}</div>
                </div>
              ))}
              <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.5 }}>
                House rules: max 2 whole eggs per meal (egg whites are free game) · sweeten with honey, maple, or applesauce · organic where you can.
              </div>
            </Card>
          )}

          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {["By Day", "Breakfast", "Lunch", "Dinner", "Snack"].map((c) => (
              <Chip key={c} active={mealFilter === c} onClick={() => setMealFilter(c)}>{c}</Chip>
            ))}
          </div>

          {mealFilter === "By Day" && personalized && (publishedPlan?.days || []).map((day) => (
            <div key={day.day} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <div>
                  <span style={{ fontFamily: FD, fontSize: 20 }}>{day.day}</span>
                  {day.theme && <span style={{ fontSize: 13, color: T.inkSoft, marginLeft: 8 }}>{day.theme}</span>}
                </div>
                {day.dayTotals && (
                  <div style={{ fontSize: 12, color: T.inkSoft, fontWeight: 700 }}>
                    {Math.round(day.dayTotals.cal || 0)} cal · {Math.round(day.dayTotals.p || 0)}P · {Math.round(day.dayTotals.c || 0)}C · {Math.round(day.dayTotals.f || 0)}F
                  </div>
                )}
              </div>
              {(day.meals || []).map((m, idx) => (
                <MealRecipeCard key={`${day.day}-${idx}`} meal={mealToCard(m)} onLog={logRecipe} />
              ))}
            </div>
          ))}

          {mealFilter === "By Day" && !personalized && (
            <Card style={{ marginBottom: 12, background: T.accentSoft, border: "none" }}>
              <div style={{ fontFamily: FD, fontSize: 17, color: T.accentDeep, marginBottom: 4 }}>Your week by day</div>
              <div style={{ fontSize: 13.5, color: T.ink, lineHeight: 1.55 }}>
                Callie will publish your personalized Mon–Sun here when it&apos;s ready.
                Until then, browse Breakfast / Lunch / Dinner / Snack — open any card for the full recipe, then + Log.
              </div>
            </Card>
          )}

          {mealFilter !== "By Day" && personalized && flatPersonalized
            .filter((m) => (m.cat || "").toLowerCase() === mealFilter.toLowerCase())
            .map((m, idx) => (
              <MealRecipeCard key={`${m.name}-${idx}`} meal={m} onLog={logRecipe} />
            ))}

          {mealFilter !== "By Day" && !personalized && RECIPES
            .filter((r) => r.cat === mealFilter)
            .map((r) => (
              <MealRecipeCard key={r.name} meal={r} onLog={logRecipe} />
            ))}
        </>
      )}

      {tab === "progress" && (
        <>
          <p style={{ fontSize: 14, color: T.inkSoft, margin: "6px 0 14px" }}>
            Pick a day, log your weight, edit anytime — same rhythm as meal logging. The trend matters; any single number doesn't.
          </p>

          <WeighInCard
            weighins={weighins}
            goalWeight={profile.goalWeight}
            weeklyRate={weeklyRate}
            onSave={logWeighin}
            onDelete={deleteWeighin}
            earliestWeekStart={mealEarliestWeek}
          />

          <ProgressCharts macros={macros} macroHistory={macroHistory} habitHistory={habitHistory} />

          <Card style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Your 4-week trends</div>
            {trends.locked ? (
              <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6 }}>
                Unlocks after four weeks of tracking so the patterns are real, not noise. You're at <b style={{ color: T.ink }}>{trends.n} of 4</b> — keep checking those boxes.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, color: T.inkSoft, marginBottom: 10 }}>
                  Across your last {trends.n} weeks, your consistency is{" "}
                  <b style={{ color: trends.delta >= 0 ? T.sage : T.amber }}>
                    {trends.delta >= 3 ? "climbing" : trends.delta <= -3 ? "slipping" : "holding steady"}
                  </b>
                  {" "}({trends.overall.map((o) => `${o}%`).join(" → ")}).
                </div>
                {trends.items.map((i) => (
                  <div key={i.label} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 3 }}>
                      <span style={{ color: T.ink, fontWeight: 600 }}>{i.label}</span>
                      <span style={{ color: T.inkSoft }}>{i.strength ? `${i.avgSessions.toFixed(1)}× / wk (goal 3)` : `${i.pct}%`}</span>
                    </div>
                    <div style={{ height: 6, background: T.track, borderRadius: 99 }}>
                      <div style={{ height: 6, borderRadius: 99, width: `${i.strength ? Math.min((i.avgSessions / 3) * 100, 100) : i.pct}%`, background: (i.strength ? i.avgSessions >= 3 : i.pct >= 70) ? T.sage : T.accent }} />
                    </div>
                  </div>
                ))}
                <div style={{ background: T.accentSoft, borderRadius: 12, padding: "10px 14px", marginTop: 10, fontSize: 13, color: T.accentDeep, lineHeight: 1.55 }}>
                  💬 Strongest habit: <b>{trends.best.label.toLowerCase()}</b> ({trends.best.pct}%). The one to love on next: <b>{trends.worst.label.toLowerCase()}</b> ({trends.worst.pct}%) — pick your easiest day and start there.
                </div>
              </>
            )}
          </Card>

          <Card style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Before + after photos</div>
            <div style={{ fontSize: 13.5, color: T.inkSoft, lineHeight: 1.6 }}>
              Week 1 and week 8: same outfit, same spot, same lighting, front and side. Faces optional. The most transformed mama in this founding group wins Callie's Gut Reset Guide.
            </div>
          </Card>

          {hasAnySupport && (
            <Card style={{ marginTop: 12 }}>
              <div style={{ fontFamily: FD, fontSize: 18, marginBottom: 6 }}>Need extra support?</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.8 }}>
                {hasSleep && <><a href={CONFIG.FULLSCRIPT_SLEEP} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700, textDecoration: "none" }}>Sleep support →</a><br /></>}
                {hasDigestion && <><a href={CONFIG.FULLSCRIPT_DIGESTION} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700, textDecoration: "none" }}>Digestion support →</a><br /></>}
                {hasElectrolytes && <a href={CONFIG.FULLSCRIPT_ELECTROLYTES} target="_blank" rel="noreferrer" style={{ color: T.accent, fontWeight: 700, textDecoration: "none" }}>Electrolytes →</a>}
              </div>
            </Card>
          )}
        </>
      )}
    </Shell>
  );
}
