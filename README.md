# Tripsplit

A web app for tracking and splitting shared costs, for example on holiday: who paid what, who owes whom, and the
fewest payments to settle up. Mobile-first, in English, in a black-and-white design. "Tripsplit" is a working title.

**Stack:** React + TypeScript + Vite, Tailwind CSS v4, Supabase (Postgres, Auth, Realtime, Storage), Vitest, oxlint,
Lucide icons, Inter font. Hosted on GitHub Pages.

## Features

- **Trips, people and expenses.** Split an expense equally, by shares (e.g. 2:1) or by exact amounts, with categories.
- **Receipts.** Attach a photo of the receipt to an expense, straight from the camera or from your photos. Photos are
  shrunk before uploading and only people on the trip can see them.
- **Balances and settling up.** Everyone's balance, and suggested payments that even everything out with at most
  n − 1 transfers. Repayments are recorded with a "slide to settle up" control and can be undone.
- **Accounts.** Sign up with your email (confirmed by a link), then choose a username and password. Forgot your
  password? Reset it by email. Change your username or password, or delete your account, under **Account**.
- **Friends.** Invite people by their username (with suggestions while typing). They accept or decline, and can
  leave a trip later. Changes by others show up right away (live updates).
- **Permissions.** Only the author of an expense (or the trip's owner) can change it, and only the people involved
  can settle a payment. The database enforces this, not just the app.
- **Without an account.** If no Supabase project is configured, everything is saved in the browser, with a demo trip.
- An easter egg. 🎉

## Getting started

Requirements: **Node.js 24**, ideally 24.15 or newer. Newer versions ship npm 12, the same version the GitHub
Actions build uses. Older npm versions can write a `package-lock.json` that the build rejects.

```powershell
npm install        # install dependencies
npm run dev        # dev server on http://localhost:5173
npm test           # run all tests once
npm run test:watch # rerun tests on every change
npm run typecheck  # check TypeScript
npm run lint       # oxlint
npm run build      # production build into dist/
```

Without `.env.local` the app runs in **browser-only mode**: no sign-in, everything is stored in `localStorage`
("Saved in this browser", receipt photos in IndexedDB), and there is a demo trip to try things out. With a Supabase project configured (see
below), the app requires an account and stores trips in the database.

## Setting up Supabase

1. Create a project on [supabase.com](https://supabase.com), in an EU region (e.g. Frankfurt).
2. **Create the database schema.** Open the **SQL Editor** in the dashboard and run these files in order:
   1. `supabase/migrations/20261122120000_init.sql`: trips, people, expenses, repayments
   2. `supabase/migrations/20261122140000_profiles.sql`: usernames
   3. `supabase/migrations/20261122160000_member_accounts.sql`: linking people to accounts
   4. `supabase/migrations/20261122180000_permissions.sql`: who may change what
   5. `supabase/migrations/20261122200000_invitations.sql`: inviting friends by username
   6. `supabase/migrations/20261122220000_realtime.sql`: live updates (safe to run more than once)
   7. `supabase/migrations/20261123100000_account_settings.sql`: changing the username, deleting the account
   8. `supabase/migrations/20261123120000_receipts.sql`: receipt photos (private Storage bucket and its access rules)

   Run new migrations **before** you publish the app version that needs them. The app loads the new columns right
   away, and without them it can't load any trips.

   Alternatively with the CLI: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.
3. **Authentication → URL Configuration:** set the Site URL to `http://localhost:5173` and add the same address under
   Redirect URLs. Otherwise the links in emails don't lead back to the app. Add the app's public address later.
4. **Authentication → Sign In / Providers → Email:** turn **Confirm email** on. The app doesn't strictly need it (the
   link confirms the address anyway), but it stops anyone from creating an account with an unconfirmed address
   around the app.
5. **Recommended: adjust the email templates** (Authentication → Emails → Templates). With the default templates, links
   only work in the browser that requested them. With these links they work on any device, e.g. sign up on a laptop
   and open the email on a phone:

   | Template | Link in the `href` |
   |---|---|
   | Confirm signup | `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email` |
   | Magic Link | `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email` |
   | Reset Password | `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery` |

   Example for "Confirm signup":

   ```html
   <h2>Confirm your email</h2>
   <p>Open this link to finish creating your Tripsplit account:</p>
   <p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirm email</a></p>
   ```

   "Magic Link" is needed too: depending on the settings, Supabase uses it to confirm new accounts.
6. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (Project Settings →
   API Keys; the publishable key `sb_publishable_…` or the legacy "anon" key). **Never** use the secret /
   `service_role` key. `.env.local` is not committed.
7. Restart `npm run dev`.

Good to know:

- **Usernames** have 3–20 characters (letters, numbers, `_` and `.`), are stored in lowercase and are unique.
  People still sign in with their email; the username is what friends see and use to invite them.
- **Passwords** need at least 8 characters in the app. Supabase itself allows 6; set a stricter minimum under
  Authentication → Sign In / Providers → Email if you like.
- **Emails:** Supabase's built-in mail service only sends a few emails per hour. That's fine for trying things out.
  For real users, add your own SMTP server (Authentication → SMTP Settings).
- Expired, already used or wrongly opened links are explained on the sign-in page.
- Entering an address that already has an account under "Create account" also sends a link that signs in. That is
  no less safe than "Forgot your password?": both require access to the mailbox.
- Trips from browser-only mode are not moved into an account.

## Publishing on GitHub Pages

The workflow `.github/workflows/deploy.yml` type-checks, lints, tests and builds the app on every push to `main` and
publishes it at `https://<github-name>.github.io/<repo-name>/`. The app uses relative paths (`base: './'` in
`vite.config.ts`) and `#/` addresses, so GitHub Pages needs no further configuration.

One-time setup:

1. Create a **public** repository on GitHub (needed for GitHub Pages on the free plan) without README, `.gitignore`
   or licence, and push the project to it.
2. **Settings → Pages → Build and deployment → Source:** choose "GitHub Actions".
3. **Settings → Secrets and variables → Actions → Variables → New repository variable**, twice:
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY`, with the same values as in `.env.local`. Use *variables*, not
   *secrets*: both values end up in the published app anyway, and the publishable key is meant for that. Never add
   the secret / `service_role` key.
4. **Actions → "Deploy to GitHub Pages" → Run workflow**, or push again. Without the variables the workflow stops with
   a clear message instead of publishing an app without accounts.
5. **Supabase → Authentication → URL Configuration:** set the Site URL to
   `https://<github-name>.github.io/<repo-name>/`, add `https://<github-name>.github.io/<repo-name>/**` to the Redirect
   URLs, and keep `http://localhost:5173` for development.

After that, every push to `main` is online after a minute or two; the **Actions** tab shows the progress.

## How it works

### Signing up and signing in

1. **Create account:** enter only an email. Supabase sends a confirmation link.
2. The link leads back to the app, where the user chooses a **username** and **password** ("Finish your account").
3. **Sign in** with email and password. **Forgot your password?** sends a link to choose a new one.

Emails are only used to confirm the address and to reset the password, never for signing in.

### Inviting friends

With accounts, the people in a trip are real accounts. In "New trip" and "Edit trip", **Invite person** replaces
"Add person": type a username (suggestions appear from two characters), pick one, **Add**, and the invitation is
sent when the trip is saved. A new trip starts with just you and needs at least one invitation. People without an
account from older trips are kept; when inviting, you can pick one of them so their expenses carry over. Removing an
invited person from the list takes the invitation back.

The friend sees the invitation at the top of their trip list and accepts or declines it. Only after accepting do they
get access and become linked to their person in the trip. Invited people can leave a trip via "Edit trip" →
**Leave trip**; only the owner can delete it.

### Live updates

When someone else changes a trip (an expense, a repayment, people, an invitation), everyone else sees it right away
via Supabase Realtime. The app listens to the tables in `src/data/live.ts` and reloads in the background, once for
several changes in quick succession. Row level security applies here too: everyone only gets changes to their own
trips. After a lost connection, and whenever you come back to the app (another tab, phone unlocked), it reloads to
catch up.

### Receipts

In the expense form, **Add a photo of the receipt** opens the camera or your photos (phones offer both). Before
uploading, the app turns the photo upright and shrinks it to a JPEG of at most 2000 px on the longest side, usually a
few hundred KB (`src/receipt-image.ts`). The upload only happens when you save the expense. Expenses with a photo
show a paperclip in the list. Tapping the photo opens it at full size, for zooming in.

- **Where:** the private Storage bucket `receipts`, one folder per trip and expense:
  `<trip id>/<expense id>/<file id>.jpg`. The expense points at its photo (`expenses.receipt_path`).
- **Who:** everyone on the trip can look at the photos. Adding, replacing or removing one follows the same rule as
  changing the expense: its author or the trip owner. The bucket only accepts images up to 5 MB.
- **Links:** the app shows photos through signed links that work for one hour.
- **Cleaning up:** a replaced or removed photo is deleted once the expense is saved. Deleting an expense deletes its
  photo, deleting a trip deletes all its photos, deleting your account deletes the photos of the trips that go with it.
  Files can only be deleted through the Storage API, not with SQL, so the app does this itself.
- **Space:** the free Supabase plan includes 1 GB of storage, roughly a few thousand receipts.

### Account settings

Clicking your `@username` at the top opens **Account** (`#/account`):

- **Change username.** People in trips who were named after the old username follow the new one.
- **Change password**, only with the current password.
- **Sign out.**
- **Delete account** (GDPR right to erasure), only with your password and in two steps:
  - trips you share with others go to the person who joined first (with their receipt photos),
  - trips only you use are deleted with all their data, receipt photos included,
  - in other people's trips you stay as a plain name, so their balances stay correct.

### Database and permissions

| Table | Contents |
|---|---|
| `trips` | Trips (name, currency) |
| `trip_access` | Which accounts may open a trip; the creator becomes `owner` |
| `members` | People in a trip, with or without an account; removed people are only marked as removed |
| `expenses` | Expenses in cents, with payer, split type and the path of the receipt photo |
| `expense_splits` | Who takes part in an expense (share or fixed amount) |
| `settlements` | Recorded repayments |
| `profiles` | One unique username per account, visible only to you and people you share a trip with |
| `trip_invitations` | Invitations by username: pending, accepted, declined or cancelled |
| Storage bucket `receipts` | Receipt photos, private (see [Receipts](#receipts)) |

Row level security makes sure every account only sees its own trips. Within a trip, only the author of an expense or
the trip's owner may change or delete it, and only the people involved (payer or receiver, linked to their account)
may record or undo a repayment. The app only offers what is allowed (`src/permissions.ts`). Trips and expenses are
saved through the database functions `save_trip` and `save_expense`, each in one transaction.
`src/data/schema.test.ts` runs all migrations in an in-memory Postgres (PGlite) and tests the schema, the functions
and the access rules with several simulated users.

### Security notes

- `VITE_SUPABASE_URL` and the publishable key are public by design; they are part of the built app. The data is
  protected by row level security, not by keeping the key secret.
- Signed-out visitors (`anon`) have no access to any table or function.
- Never put the secret / `service_role` key into a `VITE_` variable, the repository or GitHub variables: it bypasses
  all rules.
- Every new table needs row level security. After new migrations, check Supabase → Advisors → Security Advisor.
- The `receipts` bucket must stay private (not "Public bucket"). Photos are only reachable through signed links,
  which the app only gets for trips you are on.
- Not built yet: a CAPTCHA against spam sign-ups (Supabase supports Cloudflare Turnstile and hCaptcha).

## Project structure

```
src/
  lib/                   Money logic without UI or database (all with tests)
    types.ts             Data types (Expense, SplitSpec, Settlement, Member, …)
    split.ts             Splitting: equally, by shares, exact amounts
    balances.ts          Balance per person
    settle.ts            Suggested payments to settle up
    money.ts             Parsing input ("12.50" or "12,50" → 1250) and formatting
    example-trip.ts      Sample data for the demo trip
  data/                  Storage, accounts and sync
    actions.ts           Every change as an action, applied to the screen right away
    useTripStore.ts      Trips state: optimistic updates, saving in the background
    local-backend.ts     Browser-only storage (localStorage)
    supabase-backend.ts  Supabase storage, supabase-mapping.ts translates rows ↔ app data
    receipts.ts          Receipt photos: supabase-receipts.ts (Storage), local-receipts.ts (IndexedDB),
                         useReceiptUrl.ts loads a photo's link
    supabase-client.ts   Supabase client and handling of email links
    auth-flow.ts         Password recovery, link errors and notices for the sign-in page
    auth-messages.ts     Validation and user-facing auth messages
    account.ts           Change password and username, delete account
    social.ts            Username search, invitations, leaving trips, live updates
    live.ts              Realtime tables, useLiveUpdates.ts subscribes to them
    useSession.ts        Current Supabase session, useProfile.ts the user's username
    schema.test.ts       Tests for all migrations in PGlite
  pages/                 Trip list, trip, sign-in, account setup, account settings
  components/            UI building blocks (Dialog, forms, lists, SlideToConfirm, PartyLayer, …)
  trips.ts               Trips and people: create, edit, validate
  expense-draft.ts       Form logic for expenses
  receipt-image.ts       Shrinks receipt photos before uploading, useReceiptDraft.ts the photo in the form
  people.ts              Names in the UI ("You" for the signed-in user)
  permissions.ts         What the signed-in user may do (mirrors the database rules)
  router.ts              Hash router: #/, #/trips/<id>, #/account
  motion.ts              Helpers for staggered animations
  party.ts, party.css    Easter egg
  categories.ts          Categories with names and icons
  styles.ts              Shared classes for buttons and inputs
  format.ts              Dates and texts for the UI (en-GB)
  index.css              Design tokens, motion, base styles
  App.tsx                Picks browser-only or Supabase mode, sign-in flow, pages
supabase/
  migrations/            Database schema (SQL)
  config.toml            Settings for the Supabase CLI
.github/workflows/       Build and deploy to GitHub Pages
```

## Design

Monochrome: black background, white text, white as the only accent. Colors are tokens in `src/index.css`; components
always use the token classes, never fixed color values:

| Token | Class | Use |
|---|---|---|
| `canvas` | `bg-canvas` | Page background (#000) |
| `surface` | `bg-surface` | Cards |
| `raised` | `bg-raised` | Elements inside cards (icon tiles, bars) |
| `line` / `line-strong` | `border-line` | Borders, dividers, outlined buttons |
| `ink` | `text-ink`, `bg-ink` | Text and accents (white buttons, total card) |
| `ink-muted` / `ink-subtle` | `text-ink-muted` | Secondary text, at least 4.5:1 contrast |

Rules:

- Touch targets are at least 44 px high, focus outlines are visible, icons come from Lucide (no emoji icons).
- **Motion** is CSS only: `animate-enter` (fade and slide up) with `stagger()` from `src/motion.ts` for lists, dialogs
  that slide in and fade out, counting amounts and growing balance bars. Everything is switched off for
  "reduce motion".
- **Mobile layout:** layout grids use `grid-cols-1` on phones, otherwise long truncated text (`truncate`) still widens
  the column. Fieldsets may shrink below their content (set globally in `index.css`). Check new screens at 320 px.

**Easter egg:** tap "Tripsplit" in the top left 5 times within 2 seconds to start party mode: colors, confetti and
floating emojis. Tap 5 more times to end it. The browser remembers it (`localStorage`). Logic in `src/party.ts`,
styles in `src/party.css` (only overrides the tokens under `html[data-party]`), confetti and emojis in
`src/components/PartyLayer.tsx`. Emojis are explicitly allowed here.

## Rules for the money logic

- **Money is always an integer in cents** (`€12.50` = `1250`). Never floating point.
- **Splits always add up to the exact total.** Leftover cents go by the largest-remainder method.
- **A group's balances always add up to 0.** `settleUp` refuses otherwise.
- **Shares (`weight`) are integers.** "1.5 shares" becomes 3:2 and so on.
- **Error messages are in English**, because the app shows them.

## Roadmap

Done:

- [x] Money logic with tests, black-and-white design, animations
- [x] Expenses, splitting, balances, settling up with "slide to settle up"
- [x] Several trips; adding, renaming and removing people
- [x] Supabase: database, accounts, row level security, permissions
- [x] Sign-up with email confirmation, username and password, password reset
- [x] Inviting friends by username, live updates
- [x] Account settings: change username and password, delete account
- [x] Receipts: a photo of the receipt on an expense (Supabase Storage)
- [x] Hosting on GitHub Pages

Open:

- [ ] **PWA:** installable on the home screen, viewing trips offline
- [ ] **Several currencies** with exchange rates (the database already stores a currency per trip)
- [ ] **Export** of a trip as CSV or PDF
- [ ] **Statistics** per category
- [ ] Restore a deleted expense
- [ ] Invitation link for friends without an account
- [ ] Payment links when settling up (e.g. PayPal.me)
- [ ] Push notifications
- [ ] CAPTCHA against spam sign-ups, own SMTP server
- [ ] Final name, test on a real trip
