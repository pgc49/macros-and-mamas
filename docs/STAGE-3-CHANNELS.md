# Stage 3 — Cohort + Alumni group chat

Requires stages 0–2. C1 **Founding Members** migrates off WhatsApp as a live beta; C2 gets a separate August channel.

## Decisions

| Topic | Choice |
| --- | --- |
| C1 channel label | **Founding Members** (`cohort_label=2026-07`) |
| C2 channel label | **August Group** (`cohort_label=2026-08`) |
| Cohort stamp | Durable `profiles.cohort_label` + `tier`; calendar in `functions/_shared/cohorts.js` |
| C1 backfill | Paid cluster `2026-07-20` … `2026-07-27` (42 mamas) + Callie/Patrick |
| UI | Messages tab pills: Callie (default) + her group |
| Group notify default | `highlights` (Callie/system + replies to you) |
| Alumni | Empty room seeded; pill only when `tier=alumni_49` (stage 4) |

## Schema

Migrations `047_channels.sql`, `048_stamp_founding_cohort.sql`:

- `conversations`, `conversation_members`, `conversation_messages`, `channel_prompts`
- Separate from 1:1 `messages` (DM RLS stays thread-by-`client_id`)
- `profiles.tier` locked from client writes (same triggers as ambassador / cohort_label)
- Storage bucket `channel-attachments`

## Hooks

- Paid checkout → join open enrollment cohort if unlabeled (`OPEN_COHORT_LABEL` or `2026-08`)
- Callie approve (`/api/macros-approved`) → `handleActivationCohort`
- Push: `/api/channel-notify` respects mute / highlights / all
- Prompts: `/api/channel-prompts-cron` + `CRON_SECRET`

## Acceptance (manual)

- [ ] Founding mama sees `[Callie] [Founding Members]` only; can post; guidelines pin
- [ ] Group default highlights: peer posts no push; Callie post pushes
- [ ] Mute / All settings work
- [ ] Callie pill has count; group pill has dot
- [ ] New C2 paid test joins August Group, not Founding
- [ ] C1 never sees August Group
- [ ] read_only hides composer
- [ ] Removed member loses channel (RLS)

Security review: `docs/STAGE-3-SECURITY-REVIEW.md` (after QA pass).
