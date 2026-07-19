/* ------------------------------------------------------------------ */
/*  PROD-TODO: DATA LAYER — replaces every window.storage call.        */
/*  Suggested Supabase tables (RLS on all):                            */
/*    profiles  (intake fields incl. tastes + phone, role)             */
/*    macros    (cal/protein/fat/carbs/notes, approved flag)           */
/*    checkins  (week_start, item_id, day)                             */
/*    weighins  (date, weight)                                         */
/*    meal_logs (date, name, cal, p, c, f)                             */
/* ------------------------------------------------------------------ */
export const db = {
  // PROD-TODO(db): load the signed-in client's full state
  async loadClientState() { return null; },
  // PROD-TODO(db): persist client state (split writes per table; do
  // NOT blob the whole state into one row like the prototype did)
  async saveClientState(_state) {},
  // PROD-TODO(db): write the completed intake -> profiles + macros
  // rows with approved=false; this is what puts a mama in Callie's
  // pending queue
  async submitIntake(_profile, _macros) {},
  // PROD-TODO(db): admin only — full roster with status/adherence/weighins
  async loadRoster() { return []; },
  // PROD-TODO(db): admin only — update a client's macro numbers
  async updateClientMacros(_clientId, _macros) {},
  // PROD-TODO(db): admin only — set approved=true, week=1; also
  // triggers Callie's manual WhatsApp invite text
  async approveClient(_clientId) {},
};
