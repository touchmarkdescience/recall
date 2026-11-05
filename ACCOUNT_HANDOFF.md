# Recall — handoff to another Codex account

Updated 5 November 2026 (IST). Read this file and the current code before making changes. The older `PROJECT_HANDOFF.md` covers broader architecture but predates recent commits and may contain stale verification claims.

## Where to work

- Local project: `/Users/bharathirajathangappalam/Documents/Codex/recall`
- Source repository: <https://github.com/mjsan-dosclub/recall>, branch `main`, latest pushed commit `1026d9a` when this handoff was written.
- Live app: <https://recall-six-azure.vercel.app/>
- Vercel is connected to a **separate** repository, `touchmarkdescience/recall`. The owner manually merges changes from `mjsan-dosclub/recall`; do not reconnect Vercel to the source repo or assume a push deploys live.
- Supabase project reference: `jwhgbzdepxoskdzbtxnb`.

## Current implementation

- Next.js 16 PWA, local SQLite for development, Supabase for production, account-owned contacts, conversations, actions, push subscriptions, and Sheet outbox.
- Voice audio is stored on device first, then transcribed by the selected Groq Whisper or Gemini provider. English is the current target language. User reviews extracted details before saving.
- A follow-up can have no contact. It is stored with `contact_id = NULL`, displayed as **Guest**, and remains separate from other unnamed actions. Do not create a shared Guest contact.
- On 5 November 2026, the owner approved and the production Supabase SQL Editor successfully ran `DROP NOT NULL` on `public.recall_interactions.contact_id` and `public.recall_actions.contact_id`. A follow-up without a name had previously failed on the first constraint. A follow-up live save after the migration has not yet been independently verified.
- Commit `988b5f4` changed the person Action board to a mobile list and unified the website/PWA logo. Commit `1026d9a` added Guest labels and sends Guest to connected Sheets when no person is present. These commits are in the source repo; verify whether the owner has merged them into the Vercel repo before assuming the live UI contains them.

## Verified and still to verify

- `npm run typecheck`, `npm run build`, and extraction tests passed on the recent source commits.
- A disposable localhost account saved a contact-free follow-up; the returned contact ID was empty and the contact count stayed zero. The test account was removed.
- Production Supabase `information_schema.columns` returned `is_nullable = YES` for both contact IDs after the approved migration.
- Still test an actual no-name save in the live app, Guest display after deployment, and a connected user's Google Sheet. Real iPhone/Android recording, installed PWA gestures, and push delivery are not verified by these checks.

## Safe continuation

1. Open this local folder in Codex while signed in to the other account. Verify `git status`, branch, and `git log -1` before editing.
2. Reconnect GitHub, Vercel, and Supabase only if that account needs access. Permissions and browser/app connections do not transfer with the chat. Do not paste API keys or `.env.local` contents into a chat or commit them.
3. Keep changes on `mjsan-dosclub/recall` for the owner's manual merge. Ask before changing production schemas, deployment connections, or copying account data.
4. For the next user issue, inspect the actual code and current live behavior; this handoff is context, not proof that a later deployment happened.

Suggested first message in the other account:

> Continue my Recall Next.js PWA in `/Users/bharathirajathangappalam/Documents/Codex/recall`. Read `ACCOUNT_HANDOFF.md`, then inspect git status and the relevant code. Source changes go to `mjsan-dosclub/recall`; I manually merge into the separate Vercel-connected `touchmarkdescience/recall`. Do not assume the source commit is live. First check whether the Guest follow-up fix at commit `1026d9a` was deployed and whether a live no-name save works. Do not reveal or copy secrets.
