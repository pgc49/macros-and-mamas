/**
 * Client quiz for /quiz — posts answers to /api/lead; server recomputes ranges.
 */
(function () {
  const root = document.getElementById('quiz-root');
  if (!root) return;

  const enrollUrl = root.dataset.enrollUrl || 'https://www.macrosandmamas.com/join';
  const offerPrice = Number(root.dataset.offerPrice || 249);
  const fullPrice = Number(root.dataset.fullPrice || 299);
  const weeklyPrice = Number(root.dataset.weeklyPrice || Math.round(offerPrice / 8));
  const cohortStart = root.dataset.cohortStart || 'Monday, Aug 31';
  const doorsClose = root.dataset.doorsClose || 'Aug 27';
  const saveAmount = Math.max(0, fullPrice - offerPrice);
  const calliePhoto = root.dataset.calliePhoto || '/callie-kitchen.jpg';
  const postPayCopy =
    root.dataset.postPayCopy
    || "After you pre-pay, you'll fill out a short intake. Callie builds ranges in the order they come in, so the earlier you're in, the sooner your app opens.";
  const ATTR_KEY = 'mm_attribution_v1';
  /** Segments that may enroll Aug 31 — only these fire Meta Lead. */
  const ENROLLABLE_SEGMENTS = { main: 1, early_pp_nurture: 1 };
  /**
   * Offer-card social proof. Empty = hidden in prod.
   * Fill when Cohort 1 quotes are approved:
   *   { quote: '...', who: 'First · 6 months postpartum' }
   */
  const QUIZ_OFFER_TESTIMONIALS = [];

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
  const Q5 = [
    { v: 'lose_sustainable', l: 'Lose fat sustainably' },
    { v: 'lose_efficient', l: 'Lose efficiently (no crash)' },
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
    { v: 'none', l: 'Nothing to add' },
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
    contact: { first_name: '', last_name: '', email: '' },
    result: null,
    busy: false,
    error: '',
    source: 'quiz_page',
    /** Interactive log demo on the product-preview result screen */
    previewLogMode: 'snap',
  };

  function afterQ1(v) {
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

  function progress() {
    const i = Math.max(0, STEP_ORDER.indexOf(state.step));
    // Start ~15% so Q1 doesn't feel like "zero of a long quiz."
    return Math.round(15 + (i / (STEP_ORDER.length - 1)) * 85);
  }

  /** Hash + Meta custom events so partial quiz progress is retargetable. */
  function trackStep(s) {
    try {
      const nextHash = s === 'q1' ? '' : `#${s}`;
      const path = `${location.pathname}${location.search}${nextHash}`;
      if (`${location.pathname}${location.search}${location.hash}` !== path) {
        history.replaceState(null, '', path);
      }
    } catch (e) {}
    try {
      if (typeof window.fbq === 'function') {
        const pct = progress();
        window.fbq('trackCustom', 'QuizStep', { step: s, progress: pct });
        // Cheapest retarget pool: started but stalled mid-quiz.
        if (s === 'q4' || s === 'q5') {
          window.fbq('trackCustom', 'QuizHalfway', { step: s, progress: pct });
        }
        if (s === 'gate') {
          window.fbq('trackCustom', 'QuizEmailGate', { step: s, progress: pct });
        }
      }
    } catch (e) {}
  }

  function setStep(s) {
    state.step = s;
    state.error = '';
    trackStep(s);
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function choiceButtons(options, selected, gridClass) {
    const cls = gridClass || 'q-choices pills';
    return `<div class="${cls}" id="pick">${options
      .map(
        (o) =>
          `<button type="button" class="q-choice pill${selected === o.v ? ' on' : ''}" data-v="${o.v}">${o.l}</button>`,
      )
      .join('')}</div>`;
  }

  function screenShell(title, body, footer = '') {
    return `
      <div class="q-progress" aria-hidden="true"><span style="width:${progress()}%"></span></div>
      <h1 class="q-title">${title}</h1>
      <div class="q-body">${body}</div>
      ${footer}
      ${state.error ? `<p class="q-error">${state.error}</p>` : ''}
    `;
  }

  function quizIntroHtml() {
    return `<p class="q-trust">About 90 seconds. Free ranges from Callie — certified holistic nutritionist and mama of two — built the same way she builds them for the program.</p>`;
  }

  /** Face + voice above the ask — quiz-only markup (not the homepage CallieLetter). */
  function coachBlockHtml() {
    return `<div class="q-coach-card">
      <div class="q-coach-photo">
        <img src="${escapeHtml(calliePhoto)}" alt="Callie in her kitchen" width="640" height="800" loading="lazy" />
      </div>
      <div class="q-coach-body">
        <strong>Your coach is Callie</strong>
        <span class="q-coach-creds">Certified holistic nutritionist · blood chemistry certified · mama of two</span>
        <p class="q-coach-voice">“I've done the 2am math on milk supply and calories. Macros and Mamas is the program I needed and couldn't find.”</p>
      </div>
    </div>`;
  }

  /** Hidden until QUIZ_OFFER_TESTIMONIALS has real quotes. */
  function testimonialSlotHtml() {
    if (!QUIZ_OFFER_TESTIMONIALS.length) return '';
    const t = QUIZ_OFFER_TESTIMONIALS[0];
    if (!t || !t.quote) return '';
    return `<figure class="q-offer-quote">
      <blockquote>${escapeHtml(t.quote)}</blockquote>
      <figcaption>${escapeHtml(t.who || '')}</figcaption>
    </figure>`;
  }

  function render() {
    const a = state.answers;
    let html = '';

    if (state.step === 'q1') {
      html = screenShell(
        'Where are you right now?',
        `${quizIntroHtml()}
         ${choiceButtons(Q1, a.months_postpartum, 'q-choices pills grid-2')}`,
      );
    } else if (state.step === 'q2') {
      html = screenShell(
        'Are you feeding your baby breast milk right now?',
        `${choiceButtons(Q2, a.feeding, 'q-choices pills grid-2')}
         <button type="button" class="q-back" data-back="q1">Back</button>`,
      );
    } else if (state.step === 'q3') {
      const backStep = a.months_postpartum === 'not_postpartum' ? 'q1' : 'q2';
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
        <button type="button" class="btn q-next" id="next">Continue</button>
        <button type="button" class="q-back" data-back="${backStep}">Back</button>`,
      );
    } else if (state.step === 'q4') {
      html = screenShell(
        'What weight do you feel like yourself at?',
        `<div class="q-fields compact">
          <label>Weight (lb)
            <input id="gw" class="pill-input" type="number" inputmode="decimal" min="80" max="400" value="${a.goal_weight_lbs}" />
          </label>
        </div>
        <button type="button" class="btn q-next" id="next">Continue</button>
        <button type="button" class="q-back" data-back="q3">Back</button>`,
      );
    } else if (state.step === 'q5') {
      html = screenShell(
        'What are you actually after?',
        `${choiceButtons(Q5, a.goal, 'q-choices pills grid-2')}
         <button type="button" class="q-back" data-back="q4">Back</button>`,
      );
    } else if (state.step === 'q6') {
      html = screenShell(
        'How much are you moving right now?',
        `${choiceButtons(Q6, a.activity_level, 'q-choices pills grid-2')}
         <button type="button" class="q-back" data-back="q5">Back</button>`,
      );
    } else if (state.step === 'q7') {
      html = screenShell(
        'Anything we should know?',
        `<p class="q-hint">Optional. Pick all that apply.</p>
         <div class="q-choices pills grid-2 multi" id="pick">
           ${Q7.map((o) => `<button type="button" class="q-choice pill${a.flags.includes(o.v) ? ' on' : ''}" data-v="${o.v}">${o.l}</button>`).join('')}
         </div>
         <button type="button" class="btn q-next" id="next">Continue</button>
         <button type="button" class="q-back" data-back="q6">Back</button>`,
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
        </button>
        <button type="button" class="q-back" data-back="${pregnant ? 'q1' : 'q7'}">Back</button>`,
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

  function logPanelHtml(mode) {
    if (mode === 'describe') {
      return `<div class="q-log-demo">
        <label class="q-log-label">What did you eat?
          <textarea class="q-log-textarea" rows="3" readonly>Leftover mac and cheese and a handful of grapes</textarea>
        </label>
        <button type="button" class="btn q-log-demo-btn" disabled>Estimate</button>
        <p class="q-log-hint">In the app you type it, tap Estimate, and it lands in your day — no weighing every bite.</p>
      </div>`;
    }
    if (mode === 'recipes') {
      return `<div class="q-log-demo">
        <div class="q-plan-row"><span>Turkey taco bowls</span><span class="q-plan-meta">planned · dinner</span></div>
        <div class="q-plan-row"><span>Greek yogurt + berries</span><span class="q-plan-meta">planned · snack</span></div>
        <p class="q-log-hint">Your week planner meals log in one tap — exact macros, no re-typing.</p>
      </div>`;
    }
    if (mode === 'manual') {
      return `<div class="q-log-demo">
        <div class="q-macro-grid" aria-hidden="true">
          <div><span>Cal</span><strong>480</strong></div>
          <div><span>P</span><strong>32</strong></div>
          <div><span>C</span><strong>35</strong></div>
          <div><span>F</span><strong>24</strong></div>
        </div>
        <p class="q-log-hint">Already know the numbers? Enter them straight — useful for packaged food or a known recipe.</p>
      </div>`;
    }
    // snap (default)
    return `<div class="q-log-demo">
      <div class="q-snap-actions" aria-hidden="true">
        <span class="q-snap-pill">Open camera</span>
        <span class="q-snap-pill ghost">Photo library</span>
        <span class="q-snap-pill ghost">Menu</span>
      </div>
      <div class="meal-res">
        <img class="mr-photo" src="/meal-bowl.jpg" alt="Example logged plate: chicken meatballs, rice, and Caesar salad" width="640" height="400" loading="lazy" />
        <div class="mr-name">Chicken meatballs, rice &amp; Caesar</div>
        <div class="mr-sub">Recognized from one photo, portions and all</div>
        <div class="mp"><span>480 <small>cal</small></span><span>32 <small>P</small></span><span>35 <small>C</small></span><span>24 <small>F</small></span></div>
      </div>
      <p class="q-log-hint">Snap a plate or a restaurant menu. The app estimates and logs it against your ranges.</p>
    </div>`;
  }

  function logPreviewHtml(opts) {
    const hideKicker = opts && opts.hideKicker;
    const mode = state.previewLogMode || 'snap';
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const todayIdx = (new Date().getDay() + 6) % 7; // Mon = 0
    const modes = [
      { v: 'snap', mi: '📸', ml: 'Snap', ms: 'plate or menu' },
      { v: 'describe', mi: '✏️', ml: 'Describe', ms: 'type it' },
      { v: 'recipes', mi: '🍳', ml: 'My plan', ms: 'exact' },
      { v: 'manual', mi: '#', ml: 'Macros', ms: 'I know them', hash: true },
    ];
    return `<div class="q-app-preview">
      ${hideKicker ? '' : '<div class="q-preview-kicker">How logging works in the app</div>'}
      <div class="mini q-log-card">
        <div class="q-day-head">
          <div class="q-day-title">Today <span>· preview</span></div>
        </div>
        <div class="q-day-strip" aria-hidden="true">
          ${labels
            .map(
              (d, i) =>
                `<span class="q-day-chip${i === todayIdx ? ' on' : ''}">${d}</span>`,
            )
            .join('')}
        </div>
        <div class="m-kicker">Log a meal · four ways</div>
        <div class="modes" id="qLogModes">
          ${modes
            .map(
              (m) =>
                `<button type="button" class="mode${mode === m.v ? ' act' : ''}" data-log-mode="${m.v}">
                  <span class="mi${m.hash ? ' mi-hash' : ''}">${m.mi}</span>
                  <span class="ml">${m.ml}</span>
                  <span class="ms">${m.ms}</span>
                </button>`,
            )
            .join('')}
        </div>
        <div class="q-log-panel" id="qLogPanel">${logPanelHtml(mode)}</div>
      </div>
    </div>`;
  }

  function rangesCardHtml(r) {
    const bands = r.ranges || {};
    const fmt = (n) => (n == null ? '' : Number(n).toLocaleString('en-US'));
    return `<div class="ui-card q-result-card" aria-label="Preview of your macro ranges in the app">
      <div class="q-card-badge">App preview</div>
      <div class="greet-sub">Live inside the bands. Busy, active day? Eat the top. Slow day? The bottom. Both count as a win.</div>
      ${rangeRowHtml('Protein', bands.protein_low_g, bands.protein_high_g, 'g')}
      ${rangeRowHtml('Carbs', bands.carbs_low_g, bands.carbs_high_g, 'g')}
      ${rangeRowHtml('Fat', bands.fat_low_g, bands.fat_high_g, 'g')}
      <div class="cal-line"><span class="label">Calories land around</span><span class="val">${fmt(bands.calories_low)}–${fmt(bands.calories_high)}</span></div>
      <div class="human-note"><span class="dot"></span>${escapeHtml(r.feeding_line || 'Built from your answers the same way Callie builds program ranges.')}</div>
    </div>`;
  }

  function previewDisclaimer(r) {
    const early = r.early_pp
      ? `<p class="q-copy" style="margin-top:10px;margin-bottom:0">You're early postpartum — that's welcome here. If you join, Callie builds your final ranges gently and supply-aware for this season.</p>`
      : '';
    return `<div class="q-banner q-banner-preview">
      <strong>This is a preview — not your final numbers.</strong>
      Bands below are estimated from your answers. If you join the 8 weeks, Callie builds and approves your ranges herself before you start.
      ${early}
    </div>`;
  }

  /** One proof the app is real — snap-a-plate only (full logger sits below the offer). */
  function snapProofHtml() {
    return `<div class="q-app-preview q-snap-proof">
      <div class="q-preview-kicker">In the app</div>
      <div class="mini q-log-card">
        ${logPanelHtml('snap')}
      </div>
    </div>`;
  }

  function veganNoteHtml() {
    return `<div class="q-banner">Our playbook leans on animal protein. Fully vegan kitchens usually aren't a fit — here's an app preview anyway, and you can still reach out if you want to talk through it.</div>`;
  }

  function checkoutHref() {
    const email = String(state.contact.email || '').trim().toLowerCase();
    const joinBase = String(enrollUrl || 'https://www.macrosandmamas.com/join')
      .replace(/\?.*$/, '')
      .replace(/\/signin\/?$/i, '/join');
    const params = new URLSearchParams({ from: 'quiz' });
    if (email) params.set('email', email);
    try {
      if (email) sessionStorage.setItem('mm_quiz_email', email);
    } catch (e) { /* private mode */ }
    return `${joinBase || 'https://www.macrosandmamas.com/join'}?${params.toString()}`;
  }

  function stickyCheckoutHtml() {
    const href = checkoutHref();
    return `<div class="sticky-cta q-result-sticky on" id="quizStickyCta" aria-hidden="false">
      <div class="s-price"><strong>Doors close ${escapeHtml(doorsClose)}</strong></div>
      <a class="btn" href="${href}">Pre-pay $${offerPrice}</a>
    </div>`;
  }

  function syncQuizSticky() {
    const bar = document.getElementById('quizStickyCta');
    const offer = document.querySelector('.q-offer-card');
    if (!bar) return;
    if (!offer || !('IntersectionObserver' in window)) {
      bar.classList.add('on');
      bar.setAttribute('aria-hidden', 'false');
      return;
    }
    if (bar._mmOfferObs) {
      try { bar._mmOfferObs.disconnect(); } catch (e) { /* ignore */ }
    }
    const obs = new IntersectionObserver(
      function (entries) {
        const offerInView = entries[0] && entries[0].isIntersecting;
        bar.classList.toggle('on', !offerInView);
        bar.setAttribute('aria-hidden', String(!!offerInView));
      },
      { threshold: 0.35 },
    );
    obs.observe(offer);
    bar._mmOfferObs = obs;
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
      ? `${rangesCardHtml(r)}
      <p class="q-copy">These are bands, not one rigid number. Busier day → eat toward the top. Quieter day → the bottom. Both count as a win. Lead with protein; the rest gets easier.</p>`
      : `<p class="q-copy">Check your inbox — Callie is sending next steps. You can still lock your spot below.</p>`;

    return screenShell(
      `${escapeHtml(state.contact.first_name)}, your ranges`,
      `${veganNote}
      ${previewDisclaimer(r)}
      ${rangesBlock}
      ${snapProofHtml()}
      ${coachBlockHtml()}
      ${testimonialSlotHtml()}
      ${offerBlock()}
      ${stickyCheckoutHtml()}
      <div class="q-app-tour-below">
        <p class="q-preview-kicker">More of how the app works</p>
        ${logPreviewHtml({ hideKicker: true })}
      </div>
      <p class="q-copy muted">We emailed these ranges to you so you can keep them.</p>`,
    );
  }

  /** Quiz-gated exclusive pre-pay — shown for every non-pregnant finish. */
  function offerBlock() {
    const email = String(state.contact.email || '').trim().toLowerCase();
    const joinHref = checkoutHref();
    return `<div class="q-offer-card" id="qOfferCard">
      <div class="q-offer-kicker">Exclusive · early rate from your quiz</div>
      <h2 class="q-offer-title">Ready to lock your Aug 31 spot?</h2>
      <p class="q-offer-lede">You’re joining the group that starts <strong>${escapeHtml(cohortStart)}</strong>. Doors close ${escapeHtml(doorsClose)} so Callie can hand-build every set of ranges before day one, and so the whole group starts week one together.</p>
      <div class="q-offer-price-row">
        <span class="q-offer-now">$${offerPrice}</span>
        <span class="q-offer-full">Full rate $${fullPrice}</span>
        <span class="q-offer-save">Save $${saveAmount}</span>
      </div>
      <p class="q-offer-week">$${weeklyPrice}/week for 8 weeks · everything included</p>
      <a class="btn q-offer-btn" href="${joinHref}">Pre-pay $${offerPrice} — lock my spot</a>
      <p class="q-offer-after">${escapeHtml(postPayCopy)}</p>
      <p class="q-offer-fine">Next: set a password${email ? ` for <strong>${escapeHtml(email)}</strong>` : ''}, then pre-pay at the early rate from your quiz. Ranges above are a preview — Callie approves your final numbers if you join.</p>
      <p class="q-copy muted" style="margin-bottom:0">Not ready to pay yet? No problem — your ranges stay in your inbox either way.</p>
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
    root.querySelectorAll('[data-back]').forEach((b) => {
      b.addEventListener('click', () => setStep(b.getAttribute('data-back')));
    });

    const pick = root.querySelector('#pick');
    if (pick && state.step !== 'q7') {
      pick.querySelectorAll('.q-choice').forEach((btn) => {
        btn.addEventListener('click', () => {
          const v = btn.getAttribute('data-v');
          if (state.step === 'q1') {
            afterQ1(v);
          } else if (state.step === 'q2') {
            state.answers.feeding = v;
            setStep('q3');
          } else if (state.step === 'q5') {
            state.answers.goal = v;
            setStep('q6');
          } else if (state.step === 'q6') {
            state.answers.activity_level = v;
            setStep('q7');
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

    if (state.step === 'result') {
      const modes = root.querySelector('#qLogModes');
      if (modes) {
        modes.querySelectorAll('[data-log-mode]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const next = btn.getAttribute('data-log-mode') || 'snap';
            state.previewLogMode = next;
            modes.querySelectorAll('[data-log-mode]').forEach((b) => {
              b.classList.toggle('act', b === btn);
            });
            const panel = root.querySelector('#qLogPanel');
            if (panel) panel.innerHTML = logPanelHtml(next);
          });
        });
      }
    }
  }

  async function submit() {
    state.contact.first_name = (root.querySelector('#fn')?.value || '').trim();
    state.contact.last_name = '';
    state.contact.email = (root.querySelector('#em')?.value || '').trim();
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
      try {
        localStorage.setItem('mm_lead_email', '1');
      } catch (e) {}
      try {
        const leadEmail = String(state.contact.email || '').trim().toLowerCase();
        if (leadEmail) sessionStorage.setItem('mm_quiz_email', leadEmail);
      } catch (e) {}

      // Meta: fire Lead only for segments who can enroll this cohort.
      // Pregnant / vegan nurture paths must not train delivery on cheap "leads."
      try {
        if (typeof window.fbq === 'function') {
          const seg = String(data.segment || '');
          if (ENROLLABLE_SEGMENTS[seg]) {
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

      state.result = data;
      state.busy = false;
      setStep('result');
    } catch (e) {
      state.busy = false;
      state.error = 'Could not save just now. Try again in a moment.';
      render();
    }
  }

  trackStep(state.step);
  render();
})();
