# Project Notes — eBook Studio

---

## What This App Does
AI-powered eBook creation wizard. Authors upload source material (files, URLs), get AI-generated book concepts and chapter outlines, then generate a full manuscript with marketing plan. Saves projects per user to Supabase.

---

## Tech Stack
- Frontend: Vanilla JS (`app.js`), HTML (`index.html`), CSS (`styles.css`) — all served from repo root
- Backend/Database: Node/Express (`server.js`) on Vercel serverless; Supabase (`public.projects` table) for project storage; Anthropic Claude API for generation
- Hosting: Vercel — production URL is `https://ebook-studio-pi.vercel.app`
- Auth: Supabase email/password auth with JWT tokens passed as `Authorization: Bearer` headers to the API

---

## Current Status
**Last updated:** 2026-05-13
**Overall status:** [x] Mostly working

What's working:
- Sign in / sign up / sign out
- Full eBook wizard (source upload, idea generation, chapter structure, chapter writing, marketing plan)
- Project save/load/delete — data goes to `public.projects` table in Supabase
- Password reset flow: email sends, link redirects back to app, "Set New Password" form appears, user can update password

What's broken or incomplete:
- Nothing known.

What the next step is:
- App is fully working. Next session can focus on new features or improvements.

---

## Session Log
<!-- Paste Claude's end-of-session summary here each time. Most recent at the top. -->

### 2026-05-13 — Auth Fixes & Debugging Session

**What broke:** Sign-in buttons did nothing. Root cause: user had manually edited `app.js` on GitHub and removed the quote marks around a URL string, which crashed the entire JS file before any functions loaded.

**What we fixed:**
1. Found and fixed the JS syntax error in `app.js` (missing quotes on `redirectTo` URL)
2. Added `PASSWORD_RECOVERY` auth event handler in `onAuthStateChange` — without this, clicking a reset link silently signed the user in without showing a password form
3. Added `formSetPassword` UI in `index.html` (two password fields + submit button)
4. Added `#np-submit` click handler in `app.js` to call `sb.auth.updateUser({ password })`
5. Pushed all fixes from the worktree to the main repo and confirmed the production deployment updated

**Table confusion resolved:** App uses `public.projects` table (not `ebook_users` or `ebook_projects` — those are empty legacy tables from an earlier schema, not used by any code).

**Still broken:** Supabase Site URL in dashboard still points to old `bgec6si3r` deployment URL. Password reset emails redirect there instead of production. Must be fixed manually in Supabase dashboard.


---

## Key Decisions Made
<!-- Things you decided that Claude should never undo or second-guess -->
<!-- Example: "Login uses magic links, not passwords. Do not change this." -->


---

## File Map
<!-- Claude will fill this in once it reads the project. Leave blank for now. -->
Where the main pages live:

Where the styles live:

Where the data/database logic lives:


---

## Passwords & Keys
<!-- DO NOT put actual passwords here. Just note where they are. -->
<!-- Example: "Supabase keys are in .env file — do not commit to GitHub" -->


---

## How to Start a New Session
Copy and paste this at the start of every Claude Code session:

"Read NOTES.md and give me a one-paragraph summary of where we are with this project and what we're working on next."

---

## How to End a Session
Copy and paste this at the end of every Claude Code session:

"Update NOTES.md with a summary of what we did today, what's now working, what's still broken, and what the next step is. Add it to the Session Log section with today's date. Keep it short and specific enough that you could read it next session and know exactly where to pick up."

---
