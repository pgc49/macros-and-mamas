/**
 * Client quiz for /quiz — posts answers to /api/lead; server recomputes ranges.
 */
(function () {
  const root = document.getElementById('quiz-root');
  if (!root) return;

  const enrollUrl = root.dataset.enrollUrl || '/join';
  const offerPrice = Number(root.dataset.offerPrice || 249);
  const fullPrice = Number(root.dataset.fullPrice || 299);
  const weeklyPrice = Number(root.dataset.weeklyPrice || Math.round(offerPrice / 8));
  const cohortStart = root.dataset.cohortStart || 'Monday, Aug 31';
  const doorsClose = root.dataset.doorsClose || 'Aug 27';
  const saveAmount = Math.max(0, fullPrice - offerPrice);
  const calliePhoto = root.dataset.calliePhoto || '/callie-kitchen.jpg';
  const postPayCopy =
    root.dataset.postPayCopy
    || "After you pre-pay, you'll set a password and fill out a short intake. Callie builds ranges in the order they come in, so the earlier you're in, the sooner your app opens.";
  const ATTR_KEY = 'mm_attribution_v1';
  const META_PIXEL_ID = '1078367721716098';
  /** Segments that may enroll Aug 31 — only these fire Meta Lead. */
  const ENROLLABLE_SEGMENTS = { main: 1, early_pp_nurture: 1 };
  /** The only “preview” sentence on the payoff (tone rule). */
  const PREVIEW_ONCE =
    'A preview built from your answers. If you join the 8 weeks, Callie builds and approves your final ranges herself before day one.';

  const Q1 = [
    { v: 'still_pregnant', l: 'Still pregnant' },
    { v: '0_3_months', l: '0–3 months' },
    { v: '3_12_months', l: '3–12 months' },
    { v: '1_2_years', l: '1–2 years' },
    { v: '2_plus_years', l: '2+ years' },
    { v: 'not_postpartum', l: 'Not postpartum' },
  ];
  const Q2 = [
    { v: 'exclusive', l: 'Exclusive breast milk' },
    { v: 'combination', l: 'Combination feeding' },
    { v: 'weaning', l: 'Weaning' },
    { v: 'not_feeding', l: 'Not feeding breast milk' },
  ];
  // One lose option — lose_sustainable and lose_efficient used to both mean
  // “lose” in the engine/intake; two near-identical labels just confused mamas.
  const Q5 = [
    { v: 'lose_sustainable', l: 'Lose fat — keep muscle and milk' },
    { v: 'maintain', l: 'Maintain where I am' },
    { v: 'gain', l: 'Gain / rebuild' },
  ];
  const Q6 = [
    { v: 'minimal', l: 'Minimal / survival' },
    { v: 'light', l: 'Light walks' },
    { v: 'moderate', l: 'Moderate movement' },
    { v: 'high', l: 'Training consistently' },
  ];
  const Q7 = [
    { v: 'vegetarian', l: 'Vegetarian / pescatarian' },
    { v: 'vegan', l: 'Fully vegan' },
    { v: 'blood_sugar', l: 'Blood sugar concerns' },
    { v: 'thyroid', l: 'Thyroid' },
    { v: 'c_section', l: 'Recent C-section' },
    { v: 'none', l: 'None of these' },
  ];

  const state = {
    step: 'q1',
    answers: {
      months_postpartum: '',
      feeding: '',
      height_ft: 5,
      height_in_part: 4,
      current_weight_lbs: '',
      weight_prefer_not: false,
      weight_band: '',
      goal_weight_lbs: '',
      goal: '',
      activity_level: '',
      flags: [],
    },
    contact: { first_name: '', last_name: '', email: '', referred_by: '' },
    result: null,
    leadSaved: false,
    busy: false,
    error: '',
    source: 'quiz_page',
  };

  /** Guard against double-taps during the 140ms selected-state flash. */
  let selectLock = false;

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  /** Route after Q1 — re-runs when an earlier answer changes. */
  function routeAfterQ1(v) {
    state.answers.months_postpartum = v;
    if (v === 'still_pregnant') {
      setStep('gate');
      return;
    }
    if (v === 'not_postpartum') {
      state.answers.feeding = 'not_feeding';
      setStep('q3');
      return;
    }
    setStep('q2');
  }

  const params = new URLSearchParams(location.search);
  const q1 = (params.get('q1') || '').trim();
  if (Q1.some((o) => o.v === q1)) {
    state.source = params.get('placement') === 'modal' ? 'modal' : 'inline';
    // Defer step until after helpers exist — set answers now, step after render funcs
    state.answers.months_postpartum = q1;
    if (q1 === 'still_pregnant') state.step = 'gate';
    else if (q1 === 'not_postpartum') {
      state.answers.feeding = 'not_feeding';
      state.step = 'q3';
    } else state.step = 'q2';
  }
  try {
    if (typeof window.fbq === 'function') {
      window.fbq('trackCustom', 'QuizStart', {
        placement: state.source === 'quiz_page' ? 'quiz_page' : state.source,
      });
    }
  } catch (e) {}

  function attr() {
    try {
      return JSON.parse(sessionStorage.getItem(ATTR_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function heightIn() {
    return Number(state.answers.height_ft) * 12 + Number(state.answers.height_in_part);
  }

  function currentWeight() {
    if (state.answers.weight_prefer_not && state.answers.weight_band) {
      const [a, b] = String(state.answers.weight_band)
        .split('-')
        .map(Number);
      if (a && b) return (a + b) / 2;
    }
    return Number(state.answers.current_weight_lbs);
  }

  const STEP_ORDER = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'gate', 'result'];
  const QUESTION_NUM = { q1: 1, q2: 2, q3: 3, q4: 4, q5: 5, q6: 6, q7: 7 };

  /** Progress = step/9 (q1…result). */
  function progress() {
    const i = Math.max(0, STEP_ORDER.indexOf(state.step));
    return Math.round(((i + 1) / STEP_ORDER.length) * 100);
  }

  function stepUrl(s) {
    const nextHash = s === 'q1' ? '' : `#${s}`;
    return `${location.pathname}${location.search}${nextHash}`;
  }

  function quizStack() {
    return (history.state && Array.isArray(history.state.quizStack)
      ? history.state.quizStack.slice()
      : []);
  }

  function pushQuizHistory(s, { replace = false, stack = null } = {}) {
    try {
      const data = { quizStep: s, quizStack: stack || [s] };
      const url = stepUrl(s);
      if (replace) history.replaceState(data, '', url);
      else history.pushState(data, '', url);
    } catch (e) {}
  }

  /** Meta custom events so partial quiz progress is retargetable. */
  function trackMeta(s) {
    try {
      if (typeof window.fbq === 'function') {
        const pct = progress();
        window.fbq('trackCustom', 'QuizStep', { step: s, progress: pct });
        if (s === 'q4' || s === 'q5') {
          window.fbq('trackCustom', 'QuizHalfway', { step: s, progress: pct });
        }
        if (s === 'gate') {
          window.fbq('trackCustom', 'QuizEmailGate', { step: s, progress: pct });
        }
      }
    } catch (e) {}
  }

  function setStep(s, { fromPop = false } = {}) {
    state.step = s;
    state.error = '';
    selectLock = false;
    if (!fromPop) {
      const stack = quizStack();
      const priorIdx = stack.lastIndexOf(s);
      if (priorIdx >= 0) stack.length = priorIdx + 1;
      else stack.push(s);
      if (!stack.length) stack.push(s);
      // Forward (or re-route) always pushState so device back unwinds the path taken.
      pushQuizHistory(s, { replace: false, stack });
    }
    trackMeta(s);
    render();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  /** Path-aware previous step (respects not_postpartum Q2 skip + pregnant gate). */
  function previousStepFor(step) {
    const a = state.answers;
    switch (step) {
      case 'q2':
        return 'q1';
      case 'q3':
        return a.months_postpartum === 'not_postpartum' ? 'q1' : 'q2';
      case 'q4':
        return 'q3';
      case 'q5':
        return 'q4';
      case 'q6':
        return 'q5';
      case 'q7':
        return 'q6';
      case 'gate':
        return a.months_postpartum === 'still_pregnant' ? 'q1' : 'q7';
      default:
        return null;
    }
  }

  /** Build the stack a deep-linked visitor should be able to rewind through. */
  function pathStackTo(step) {
    const a = state.answers;
    if (step === 'q1') return ['q1'];
    if (a.months_postpartum === 'still_pregnant') {
      const path = ['q1'];
      if (STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf('gate')) path.push('gate');
      if (step === 'result') path.push('result');
      return path;
    }
    const path = ['q1'];
    if (a.months_postpartum !== 'not_postpartum') path.push('q2');
    for (const s of ['q3', 'q4', 'q5', 'q6', 'q7', 'gate', 'result']) {
      if (STEP_ORDER.indexOf(step) >= STEP_ORDER.indexOf(s)) path.push(s);
    }
    return path;
  }

  function seedHistory() {
    const path = pathStackTo(state.step);
    pushQuizHistory(path[0], { replace: true, stack: [path[0]] });
    for (let i = 1; i < path.length; i++) {
      pushQuizHistory(path[i], { replace: false, stack: path.slice(0, i + 1) });
    }
  }

  function goBack() {
    if (state.step === 'q1' || state.step === 'result') return;
    const stack = quizStack();
    if (stack.length > 1) {
      history.back();
      return;
    }
    const prev = previousStepFor(state.step);
    if (!prev) return;
    pushQuizHistory(prev, { replace: true, stack: [prev] });
    state.step = prev;
    state.error = '';
    selectLock = false;
    trackMeta(prev);
    render();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function onPopState(e) {
    const step = e.state && e.state.quizStep;
    if (!step || STEP_ORDER.indexOf(step) < 0) return;
    state.step = step;
    state.error = '';
    selectLock = false;
    trackMeta(step);
    render();
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  function questionKicker(step) {
    const n = QUESTION_NUM[step];
    if (!n) return '';
    if (n === 1) return 'Your free macro ranges · Question 1 of 7';
    return `Question ${n} of 7`;
  }

  function choiceButtons(options, selected) {
    return `<div class="q-choices" id="pick">${options
      .map(
        (o) =>
          `<button type="button" class="q-choice${selected === o.v ? ' on' : ''}" data-v="${escapeHtml(o.v)}"><span class="q-choice-label">${escapeHtml(o.l)}</span>${
            o.sub ? `<span class="q-choice-sub">${escapeHtml(o.sub)}</span>` : ''
          }</button>`,
      )
      .join('')}</div>`;
  }

  /** Selected-state flash, then advance. No Next on single-select screens. */
  function flashSelectAndGo(btn, applyFn, goFn) {
    if (selectLock) return;
    selectLock = true;
    const pick = root.querySelector('#pick');
    if (pick) {
      pick.querySelectorAll('.q-choice').forEach((b) => {
        b.classList.toggle('on', b === btn);
      });
    }
    applyFn();
    const advance = () => {
      selectLock = false;
      goFn();
    };
    if (prefersReducedMotion()) advance();
    else setTimeout(advance, 140);
  }

  function screenShell(title, body, footer = '', kicker = '') {
    const showBack = state.step !== 'q1' && state.step !== 'result';
    return `
      <div class="q-progress" aria-hidden="true"><span style="width:${progress()}%"></span></div>
      ${showBack ? `<button type="button" class="q-back" id="qBack">← Back</button>` : ''}
      ${kicker ? `<span class="kicker q-step-kicker">${kicker}</span>` : ''}
      <h1 class="q-title">${title}</h1>
      <div class="q-body">${body}</div>
      ${footer}
      ${state.error ? `<p class="q-error">${state.error}</p>` : ''}
    `;
  }

  function quizIntroHtml() {
    return `<p class="q-trust">About 90 seconds. Free ranges from Callie, certified functional nutritionist and mama of two, built the same way she builds them for the program.</p>`;
  }

  /** Q1 only — signature band + length promise under the pills. */
  function q1MotifHtml() {
    return `<div class="q-intro-motif">
      <div class="band" aria-hidden="true"><div class="fill"></div></div>
      <p class="q-intro-caption">Six taps, two typed numbers, then your ranges.</p>
    </div>`;
  }

  /** Face + voice above the ask — quiz-only markup (not the homepage CallieLetter). */
  function coachBlockHtml() {
    return `<div class="q-coach-card">
      <div class="q-coach-photo">
        <img src="${escapeHtml(calliePhoto)}" alt="Callie in her kitchen" width="640" height="800" loading="lazy" />
      </div>
      <div class="q-coach-body">
        <strong>Your coach is Callie</strong>
        <span class="q-coach-creds">Certified functional nutritionist · blood chemistry certified · mama of two</span>
        <p class="q-coach-voice">“I personally make it a priority to connect with each client 1:1 to ensure they get the most out of this program. Macros and Mamas is the program I needed and couldn't find.”</p>
      </div>
    </div>`;
  }

  function appTourHtml() {
    return `<div class="q-app-preview q-app-tour" id="qAppTour">
      <div class="q-preview-kicker">App preview</div>
      <p class="q-tour-lead">A small snapshot of the inside. Simple tracking, easy logging, and Callie plus a community of women on the same journey — one tap away.</p>
      <div class="q-tour-tabs" role="tablist" aria-label="App screens">
        <button type="button" class="q-tour-tab on" role="tab" aria-selected="true" id="qTourTabToday" aria-controls="qTourToday" data-tour="today">Today</button>
        <button type="button" class="q-tour-tab" role="tab" aria-selected="false" id="qTourTabMeals" aria-controls="qTourMeals" data-tour="meals">Meals</button>
        <button type="button" class="q-tour-tab" role="tab" aria-selected="false" id="qTourTabMessages" aria-controls="qTourMessages" data-tour="messages">Messages</button>
      </div>
      <div class="mini q-log-card q-tour-panel" id="qTourToday" data-tour-panel="today" role="tabpanel" aria-labelledby="qTourTabToday">
        <div class="m-kicker">Today · log a meal</div>
        <div class="modes" aria-hidden="true">
          <div class="mode act"><span class="mi">📸</span><span class="ml">Snap</span><span class="ms">plate or menu</span></div>
          <div class="mode"><span class="mi">✏️</span><span class="ml">Describe</span><span class="ms">type it</span></div>
          <div class="mode"><span class="mi">🍳</span><span class="ml">My plan</span><span class="ms">exact</span></div>
          <div class="mode"><span class="mi mi-hash">#</span><span class="ml">Macros</span><span class="ms">I know them</span></div>
        </div>
        <p class="q-tour-section">Today's log</p>
        <div class="q-log-row">
          <span class="q-log-slot">Breakfast</span>
          <strong>Protein oatmeal</strong>
          <span class="q-log-macros">310 cal · P 30g · C 40g · F 4g</span>
        </div>
        <div class="q-log-row">
          <span class="q-log-slot">Lunch</span>
          <strong>Grilled Chicken Big Salad</strong>
          <span class="q-log-macros">420 cal · P 59g · C 10g · F 14g</span>
        </div>
        <div class="q-tour-ranges" aria-hidden="true">
          <span class="q-tour-chip"><b>730</b> cal</span>
          <span class="q-tour-chip"><b>89g</b> P</span>
          <span class="q-tour-chip"><b>50g</b> C</span>
          <span class="q-tour-chip"><b>18g</b> F</span>
        </div>
        <div class="q-tour-water">
          <span class="q-tour-water-label">Water · 40 of 88 oz</span>
          <span class="q-tour-water-btn">+ My bottle · 32 oz</span>
        </div>
      </div>
      <div class="mini q-log-card q-tour-panel" id="qTourMeals" data-tour-panel="meals" role="tabpanel" aria-labelledby="qTourTabMeals" hidden>
        <div class="m-kicker">All meals · Callie's recipes</div>
        <div class="q-meal-chips" aria-hidden="true">
          <span class="on">All meals</span>
          <span>Plan</span>
          <span>Breakfast</span>
          <span>My meals</span>
        </div>
        <div class="q-recipe-card" aria-hidden="true">
          <div class="q-recipe-top">
            <span class="q-recipe-tag">Breakfast · open recipe</span>
            <span class="q-recipe-add">Add to Today</span>
          </div>
          <strong class="q-recipe-name">Protein oatmeal</strong>
          <p class="q-recipe-macros">per serving <b>310 cal</b> · P 30g · C 40g · F 4g</p>
          <div class="q-recipe-slots">
            <span class="on">Breakfast</span>
            <span>Lunch</span>
            <span>Dinner</span>
            <span>Snack</span>
          </div>
        </div>
        <p class="q-include-copy">Search her recipes or save your own. Tap Add to Today — you stay here and keep going.</p>
      </div>
      <div class="mini q-log-card q-tour-panel" id="qTourMessages" data-tour-panel="messages" role="tabpanel" aria-labelledby="qTourTabMessages" hidden>
        <div class="m-kicker">Messages · 1:1 with Callie</div>
        <div class="bubble you">Week fell apart. Birthday cake for dinner Tuesday. Do I start over?</div>
        <div class="bubble callie">You don't start over, you just start logging again. One meal today with protein first. That's the whole assignment.</div>
        <p class="q-include-copy">When the week blows up, she answers your 1:1 herself — and the other mamas are right there in the thread. Not a chatbot wearing her name.</p>
      </div>
    </div>`;
  }

  function readJsonAttr(name, fallback) {
    const raw = root.getAttribute(name);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function testimonialsHtml() {
    const quotes = readJsonAttr('data-testimonials', []);
    const note = root.getAttribute('data-results-disclaimer') || "Every mama's results are her own.";
    if (!Array.isArray(quotes) || !quotes.length) return '';
    return `<div class="quotes q-payoff-quotes">
      <div class="q-preview-kicker">Real words from members</div>
      ${quotes
        .map(
          (t) => `<article class="q-card">
        <p class="q-pull">${escapeHtml(t.pull || '')}</p>
        <div class="q-who">${escapeHtml(t.who || '')}</div>
      </article>`,
        )
        .join('')}
      <p class="q-note">${escapeHtml(note)}</p>
    </div>`;
  }

  function render() {
    const a = state.answers;
    let html = '';

    if (state.step === 'q1') {
      html = screenShell(
        'Where are you right now?',
        `${quizIntroHtml()}
         ${choiceButtons(Q1, a.months_postpartum)}
         ${q1MotifHtml()}`,
        '',
        questionKicker('q1'),
      );
    } else if (state.step === 'q2') {
      html = screenShell(
        'Are you feeding your baby breast milk right now?',
        `${choiceButtons(Q2, a.feeding)}`,
        '',
        questionKicker('q2'),
      );
    } else if (state.step === 'q3') {
      html = screenShell(
        'Your height and current weight',
        `<div class="q-fields compact">
          <label>Height
            <span class="q-row">
              <select id="ft" class="pill-input">${[4, 5, 6].map((n) => `<option value="${n}" ${a.height_ft == n ? 'selected' : ''}>${n} ft</option>`).join('')}</select>
              <select id="inin" class="pill-input">${[...Array(12)].map((_, n) => `<option value="${n}" ${a.height_in_part == n ? 'selected' : ''}>${n} in</option>`).join('')}</select>
            </span>
          </label>
          ${
            a.weight_prefer_not
              ? `<label>Weight range
                  <select id="wband" class="pill-input">
                    <option value="">Choose a range</option>
                    ${['110-120','120-130','130-140','140-150','150-160','160-170','170-180','180-190','190-200','200-220','220-240','240-260'].map((b) => `<option value="${b}" ${a.weight_band === b ? 'selected' : ''}>${b} lb</option>`).join('')}
                  </select>
                </label>
                <button type="button" class="q-link" id="showWeight">Enter an exact weight instead</button>`
              : `<label>Current weight (lb)
                  <input id="cw" class="pill-input" type="number" inputmode="decimal" min="80" max="400" value="${a.current_weight_lbs}" />
                </label>
                <button type="button" class="q-link" id="preferNot">Prefer not to say — use a range</button>`
          }
        </div>
        <button type="button" class="btn q-next" id="next">Continue</button>`,
        '',
        questionKicker('q3'),
      );
    } else if (state.step === 'q4') {
      html = screenShell(
        'What weight do you feel like yourself at?',
        `<div class="q-fields compact">
          <label>Weight (lb)
            <input id="gw" class="pill-input" type="number" inputmode="decimal" min="80" max="400" value="${a.goal_weight_lbs}" />
          </label>
        </div>
        <button type="button" class="btn q-next" id="next">Continue</button>`,
        '',
        questionKicker('q4'),
      );
    } else if (state.step === 'q5') {
      html = screenShell(
        'What are you actually after?',
        `${choiceButtons(Q5, a.goal)}`,
        '',
        questionKicker('q5'),
      );
    } else if (state.step === 'q6') {
      html = screenShell(
        'How much are you moving right now?',
        `${choiceButtons(Q6, a.activity_level)}`,
        '',
        questionKicker('q6'),
      );
    } else if (state.step === 'q7') {
      html = screenShell(
        'Anything we should know?',
        `<p class="q-hint">Optional. Pick all that apply.</p>
         <div class="q-choices multi" id="pick">
           ${Q7.map(
             (o) =>
               `<button type="button" class="q-choice${a.flags.includes(o.v) ? ' on' : ''}" data-v="${escapeHtml(o.v)}"><span class="q-choice-label">${escapeHtml(o.l)}</span></button>`,
           ).join('')}
         </div>
         <button type="button" class="btn q-next" id="next">Continue</button>`,
        '',
        questionKicker('q7'),
      );
    } else if (state.step === 'gate') {
      const pregnant = a.months_postpartum === 'still_pregnant';
      let title = 'Your ranges are ready. Where should Callie send them?';
      if (pregnant) title = 'Leave your email — pregnancy season first.';
      html = screenShell(
        title,
        `<div class="q-fields compact">
          <label>First name<input id="fn" class="pill-input" autocomplete="given-name" value="${state.contact.first_name}" /></label>
          <label>Email<input id="em" class="pill-input" type="email" autocomplete="email" value="${state.contact.email}" /></label>
          <input type="text" name="website_url" id="hp" class="hp" tabindex="-1" autocomplete="off" />
        </div>
        <button type="button" class="btn q-next" id="submit" ${state.busy ? 'disabled' : ''}>
          ${state.busy ? 'Working…' : pregnant ? 'Submit' : 'Show me my ranges'}
        </button>`,
      );
    } else if (state.step === 'result') {
      html = renderResult();
    }

    root.innerHTML = html;
    bind();
    if (state.step === 'result') syncQuizSticky();
  }

  function bandMotif() {
    return `<div class="band" aria-hidden="true"><div class="fill"></div></div>
      <div class="band-labels"><span>slower day → aim low</span><span>active day → aim high</span></div>`;
  }

  function rangeRowHtml(label, lo, hi, unit) {
    return `<div class="range-row">
      <div class="range-head"><span class="label">${label}</span><span class="val">${lo}–${hi} <small>${unit}</small></span></div>
      ${bandMotif()}
    </div>`;
  }

  function rangesCardHtml(r) {
    const bands = r.ranges || {};
    const fmt = (n) => (n == null ? '' : Number(n).toLocaleString('en-US'));
    return `<div class="ui-card q-result-card" id="qRangesCard" aria-label="Your macro ranges in the app">
      <div class="q-card-badge">Your ranges</div>
      <div class="greet-sub">Live inside the bands. Busy, active day? Eat the top. Slow day? The bottom. Both count as a win.</div>
      ${rangeRowHtml('Protein', bands.protein_low_g, bands.protein_high_g, 'g')}
      ${rangeRowHtml('Carbs', bands.carbs_low_g, bands.carbs_high_g, 'g')}
      ${rangeRowHtml('Fat', bands.fat_low_g, bands.fat_high_g, 'g')}
      <div class="cal-line"><span class="label">Calories land around</span><span class="val">${fmt(bands.calories_low)}–${fmt(bands.calories_high)}</span></div>
      ${
        r.feeding_line
          ? `<p class="q-feed-line">${escapeHtml(r.feeding_line)}</p>`
          : ''
      }
    </div>`;
  }

  function previewOnceHtml() {
    return `<p class="q-preview-once">${escapeHtml(PREVIEW_ONCE)}</p>`;
  }

  function veganNoteHtml() {
    return `<div class="q-banner"><strong>A note on protein.</strong> Callie’s program emphasizes animal protein — meat, dairy, and eggs. Hitting these protein targets on a fully vegan diet can be challenging. If you want to talk through whether the program is a fit, reply to the email we send.</div>`;
  }

  function checkoutHref() {
    const email = String(state.contact.email || '').trim().toLowerCase();
    const joinBase = String(enrollUrl || '/join')
      .replace(/\?.*$/, '')
      .replace(/\/signin\/?$/i, '/join');
    const params = new URLSearchParams({ from: 'quiz' });
    if (email) params.set('email', email);
    try {
      if (email) sessionStorage.setItem('mm_quiz_email', email);
    } catch (e) { /* private mode */ }
    return `${joinBase || '/join'}?${params.toString()}`;
  }

  /** Compact fast-lane ask — one screen from ranges, before proof. */
  function fastOfferHtml() {
    const href = checkoutHref();
    const save = saveAmount > 0 ? `$${saveAmount} off the full $${fullPrice}` : `full rate $${fullPrice}`;
    const startShort = String(cohortStart || '').replace(/^Monday,\s+/i, '');
    return `<div class="q-fast-offer">
      <div class="q-fast-kicker">Your quiz unlocked the early rate</div>
      <p class="q-fast-line">$${offerPrice} · ${save} · the ${escapeHtml(startShort)} group, capped at 50 mamas</p>
      <a class="btn q-fast-btn" href="${href}">Lock my spot · $${offerPrice}</a>
      <p class="q-fast-micro">Doors close ${escapeHtml(doorsClose)}. Not ready? Your ranges are already in your inbox.</p>
    </div>`;
  }

  function stickyCheckoutHtml() {
    const href = checkoutHref();
    return `<div class="sticky-cta q-result-sticky" id="quizStickyCta" aria-hidden="true">
      <div class="s-price"><strong>Doors close ${escapeHtml(doorsClose)} · 50 mamas max</strong></div>
      <a class="btn" href="${href}">Pre-pay $${offerPrice}</a>
    </div>`;
  }

  function syncQuizSticky() {
    const bar = document.getElementById('quizStickyCta');
    const ranges = document.getElementById('qRangesCard');
    const offer = document.getElementById('qOfferCard');
    if (!bar) return;

    const disconnect = (obs) => {
      if (!obs) return;
      try { obs.disconnect(); } catch (e) { /* ignore */ }
    };
    disconnect(bar._mmRangesObs);
    disconnect(bar._mmOfferObs);

    if (!('IntersectionObserver' in window)) {
      bar.classList.add('on');
      bar.setAttribute('aria-hidden', 'false');
      return;
    }

    let rangesOut = !ranges;
    let offerInView = false;
    const sync = () => {
      const show = rangesOut && !offerInView;
      bar.classList.toggle('on', show);
      bar.setAttribute('aria-hidden', String(!show));
    };

    if (ranges) {
      const rangesObs = new IntersectionObserver(
        function (entries) {
          const e = entries[0];
          rangesOut = !e.isIntersecting && e.boundingClientRect.top < 0;
          sync();
        },
        { threshold: 0 },
      );
      rangesObs.observe(ranges);
      bar._mmRangesObs = rangesObs;
    }

    if (offer) {
      const offerObs = new IntersectionObserver(
        function (entries) {
          offerInView = !!(entries[0] && entries[0].isIntersecting);
          sync();
        },
        { threshold: 0, rootMargin: '0px 0px -12% 0px' },
      );
      offerObs.observe(offer);
      bar._mmOfferObs = offerObs;
    }

    sync();
  }

  function renderResult() {
    const r = state.result;
    if (!r) return '<p>Something went wrong. Refresh and try again.</p>';

    // Only pregnancy skips the app preview + checkout payoff.
    if (r.segment === 'pregnancy_nurture') {
      return screenShell(
        "You're in an abundance season.",
        `<p class="q-copy">Congratulations. We're not building cut ranges while you're pregnant. You're on a gentle list — when you're ready postpartum, your ranges will be here.</p>
         <a class="btn" href="/">Back home</a>`,
      );
    }

    const hasRanges = r.ranges && r.ranges.protein_low_g != null;
    const veganNote = r.segment === 'waitlist_plantbased' ? veganNoteHtml() : '';
    const rangesBlock = hasRanges
      ? rangesCardHtml(r)
      : `<p class="q-copy">Check your inbox. Callie is sending next steps. You can still lock your spot below.</p>`;
    const unsavedNote = state.leadSaved
      ? ''
      : `<p class="q-copy">We couldn't email these just now. They're on this page, and you can still lock your spot below.</p>`;

    return screenShell(
      `${escapeHtml(state.contact.first_name)}, your ranges are ready.`,
      `${previewOnceHtml()}
      ${unsavedNote}
      ${veganNote}
      ${rangesBlock}
      ${appTourHtml()}
      ${fastOfferHtml()}
      ${coachBlockHtml()}
      ${testimonialsHtml()}
      ${offerBlock()}
      ${stickyCheckoutHtml()}`,
    );
  }

  /** Quiz-gated exclusive pre-pay — shown for every non-pregnant finish. */
  function offerBlock() {
    const email = String(state.contact.email || '').trim().toLowerCase();
    const joinHref = checkoutHref();
    return `<div class="q-offer-card" id="qOfferCard">
      <div class="q-offer-kicker">Exclusive · early rate from your quiz</div>
      <h2 class="q-offer-title">Ready to lock your Aug 31 spot?</h2>
      <p class="q-offer-lede">You’re joining the group that starts <strong>${escapeHtml(cohortStart)}</strong>. Doors close ${escapeHtml(doorsClose)} so Callie can hand-build every set of ranges before day one, and so the whole group starts week one together. The group is capped at 50 mamas.</p>
      <div class="q-offer-price-row">
        <span class="q-offer-now">$${offerPrice}</span>
        <span class="q-offer-full">Full rate $${fullPrice}</span>
        <span class="q-offer-save">Save $${saveAmount}</span>
      </div>
      <p class="q-offer-week">$${weeklyPrice}/week for 8 weeks · everything included</p>
      <a class="btn q-offer-btn" href="${joinHref}">Pre-pay $${offerPrice} — lock my spot</a>
      ${email ? `<p class="q-offer-continuing">Continuing as ${escapeHtml(email)}</p>` : ''}
      <p class="q-offer-after">${escapeHtml(postPayCopy)}</p>
      <p class="q-offer-skip">${
        state.leadSaved
          ? 'Not ready yet? Your ranges stay in your inbox either way.'
          : 'Not ready yet? Screenshot these ranges — we couldn\'t email them just now.'
      }</p>
    </div>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bind() {
    root.querySelector('#qBack')?.addEventListener('click', goBack);

    const pick = root.querySelector('#pick');
    if (pick && state.step !== 'q7') {
      pick.querySelectorAll('.q-choice').forEach((btn) => {
        btn.addEventListener('click', () => {
          const v = btn.getAttribute('data-v');
          if (state.step === 'q1') {
            flashSelectAndGo(btn, () => {}, () => routeAfterQ1(v));
          } else if (state.step === 'q2') {
            flashSelectAndGo(
              btn,
              () => {
                state.answers.feeding = v;
              },
              () => setStep('q3'),
            );
          } else if (state.step === 'q5') {
            flashSelectAndGo(
              btn,
              () => {
                state.answers.goal = v;
              },
              () => setStep('q6'),
            );
          } else if (state.step === 'q6') {
            flashSelectAndGo(
              btn,
              () => {
                state.answers.activity_level = v;
              },
              () => setStep('q7'),
            );
          }
        });
      });
    }

    if (state.step === 'q7' && pick) {
      pick.querySelectorAll('.q-choice').forEach((btn) => {
        btn.addEventListener('click', () => {
          const v = btn.getAttribute('data-v');
          if (v === 'none') {
            state.answers.flags = ['none'];
          } else {
            state.answers.flags = state.answers.flags.filter((x) => x !== 'none');
            if (state.answers.flags.includes(v)) {
              state.answers.flags = state.answers.flags.filter((x) => x !== v);
            } else {
              state.answers.flags.push(v);
            }
          }
          render();
        });
      });
      root.querySelector('#next')?.addEventListener('click', () => setStep('gate'));
    }

    if (state.step === 'q3') {
      root.querySelector('#preferNot')?.addEventListener('click', () => {
        state.answers.weight_prefer_not = true;
        render();
      });
      root.querySelector('#showWeight')?.addEventListener('click', () => {
        state.answers.weight_prefer_not = false;
        render();
      });
      root.querySelector('#next')?.addEventListener('click', () => {
        state.answers.height_ft = Number(root.querySelector('#ft').value);
        state.answers.height_in_part = Number(root.querySelector('#inin').value);
        if (state.answers.weight_prefer_not) {
          state.answers.weight_band = root.querySelector('#wband').value;
          if (!state.answers.weight_band) {
            state.error = 'Choose a weight range to continue.';
            render();
            return;
          }
        } else {
          state.answers.current_weight_lbs = root.querySelector('#cw').value;
          if (!(Number(state.answers.current_weight_lbs) > 0)) {
            state.error = 'Enter your current weight to continue.';
            render();
            return;
          }
        }
        setStep('q4');
      });
    }

    if (state.step === 'q4') {
      root.querySelector('#next')?.addEventListener('click', () => {
        state.answers.goal_weight_lbs = root.querySelector('#gw').value;
        if (!(Number(state.answers.goal_weight_lbs) > 0)) {
          state.error = 'Enter the weight you feel like yourself at.';
          render();
          return;
        }
        setStep('q5');
      });
    }

    if (state.step === 'gate') {
      root.querySelector('#submit')?.addEventListener('click', submit);
    }

    bindAppTour();
  }

  function bindAppTour() {
    const tour = root.querySelector('#qAppTour');
    if (!tour) return;
    const tabs = [...tour.querySelectorAll('[data-tour]')];
    const panels = [...tour.querySelectorAll('[data-tour-panel]')];
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const id = tab.getAttribute('data-tour');
        tabs.forEach((t) => {
          const on = t === tab;
          t.classList.toggle('on', on);
          t.setAttribute('aria-selected', String(on));
        });
        panels.forEach((p) => {
          p.hidden = p.getAttribute('data-tour-panel') !== id;
        });
      });
    });
  }

  async function submit() {
    state.contact.first_name = (root.querySelector('#fn')?.value || '').trim();
    state.contact.last_name = '';
    state.contact.email = (root.querySelector('#em')?.value || '').trim();
    state.contact.referred_by = '';
    const hp = (root.querySelector('#hp')?.value || '').trim();
    if (!state.contact.first_name || !state.contact.email) {
      state.error = 'First name and email are required.';
      render();
      return;
    }

    state.busy = true;
    state.error = '';
    render();

    const a = attr();
    const eventId =
      'lead_' +
      (crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + '_' + Math.random().toString(36).slice(2));

    const payload = {
      email: state.contact.email,
      first_name: state.contact.first_name,
      last_name: state.contact.last_name,
      referred_by: state.contact.referred_by || undefined,
      source: state.source,
      website_url: hp || undefined,
      event_id: eventId,
      fbp: a.fbp || '',
      fbc: a.fbc || '',
      utm_source: a.utm_source || '',
      utm_medium: a.utm_medium || '',
      utm_campaign: a.utm_campaign || '',
      utm_content: a.utm_content || '',
      landing_path: a.landing_path || location.pathname,
      answers: {
        months_postpartum: state.answers.months_postpartum,
        feeding: state.answers.feeding || 'not_feeding',
        height_in: heightIn(),
        current_weight_lbs: currentWeight() || 0,
        goal_weight_lbs: Number(state.answers.goal_weight_lbs) || 0,
        goal: state.answers.goal || 'lose_sustainable',
        activity_level: state.answers.activity_level || 'moderate',
        flags: state.answers.flags.filter((f) => f !== 'none'),
      },
    };

    if (state.answers.months_postpartum === 'still_pregnant') {
      payload.answers = {
        months_postpartum: 'still_pregnant',
        feeding: 'not_feeding',
        height_in: 64,
        current_weight_lbs: 0,
        goal_weight_lbs: 0,
        goal: 'maintain',
        activity_level: 'minimal',
        flags: [],
      };
    }

    function rememberQuizEmail() {
      try {
        const leadEmail = String(state.contact.email || '').trim().toLowerCase();
        if (leadEmail) sessionStorage.setItem('mm_quiz_email', leadEmail);
      } catch (e) {}
    }

    function localPayoff() {
      const build = globalThis.__mmBuildQuizPayoff;
      if (typeof build !== 'function') return null;
      try {
        return build(payload.answers);
      } catch (e) {
        return null;
      }
    }

    function showPayoff(data, saved) {
      rememberQuizEmail();
      if (saved) {
        try {
          localStorage.setItem('mm_lead_email', '1');
        } catch (e) {}
        try {
          if (typeof window.fbq === 'function') {
            const seg = String(data.segment || '');
            const qualified =
              data.qualified_lead === true ||
              (data.qualified_lead == null && ENROLLABLE_SEGMENTS[seg]);
            if (qualified) {
              try {
                window.fbq('init', META_PIXEL_ID, {
                  em: String(state.contact.email || '').trim().toLowerCase(),
                  fn: String(state.contact.first_name || '').trim().toLowerCase(),
                  ln: String(state.contact.last_name || '').trim().toLowerCase(),
                });
              } catch (e) {}
              window.fbq(
                'track',
                'Lead',
                { content_name: 'ranges_quiz', content_category: seg },
                { eventID: eventId },
              );
            } else {
              window.fbq('trackCustom', 'QuizNurture', {
                content_name: 'ranges_quiz',
                content_category: seg || 'nurture',
              });
            }
          }
        } catch (e) {}
      }
      state.result = data;
      state.leadSaved = saved;
      state.busy = false;
      state.error = '';
      setStep('result');
    }

    try {
      const resp = await fetch('/api/lead', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error || 'save_failed');
      }
      showPayoff(data, true);
    } catch (e) {
      const fallback = localPayoff();
      if (fallback) {
        showPayoff(fallback, false);
        return;
      }
      state.busy = false;
      state.error = 'Could not save just now. Try again in a moment.';
      render();
    }
  }

  try {
    window.addEventListener('popstate', onPopState);
    // Seed history so device back / edge-swipe steps one question (Q1 leaves normally).
    seedHistory();
  } catch (e) {}
  trackMeta(state.step);
  render();
})();
