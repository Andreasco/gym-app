# AGENTS.md

Guide for AI agents (Claude Code and others) working on this repository.

## Project

**Gym** is a personal workout PWA for a single user (Andrea) on iPhone. Andrea has no Mac, so a native app is not an option. It is installed from Safari via *Share → Add to Home Screen*. Claude writes the workout programs (*schede*); Andrea logs workouts in the app.

- **Live:** https://andreasco.github.io/gym-app/ (GitHub Pages, branch `main`, root `/`). Every push to `main` deploys automatically in about a minute.
- **Code repo:** `Andreasco/gym-app` (public, required for free GitHub Pages; it contains no personal data).
- **Data repo:** `Andreasco/gym-app-data` (private): the user's programs and workout history, synced by the app.

## Working agreements (Andrea's preferences)

- Reply in **Italian**, concise and direct. Ask before risky actions on files, git or external systems.
- **Commits:** never credit Claude as author or co-author (no `Co-Authored-By`, no Claude mention). Author commits as Andrea:
  `git -c user.name="Andrea Scoppetta" -c user.email="andrea.scoppetta97@gmail.com" commit ...`
- **GitHub account scope:** use Andrea's account **only** for `Andreasco/gym-app` and `Andreasco/gym-app-data`. Never read or write his other repositories.
- **Secrets:** the sync token is entered only in the app (*Dati* tab). Never ask for it, print it or commit it.
- Pushing straight to `main` is the established workflow for this personal project.

## Stack

- Static site: vanilla JavaScript ES modules, **no framework, no build step, no dependencies**. Edit the files and push.
- Persistence: `localStorage` (key `gymapp.v1`), plus optional two-way sync with the private data repo via the GitHub REST API.
- Offline support and updates: `sw.js` service worker.
- Exercise catalog: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain, 876 exercises), bundled in `data/exercises.json`. Images are hotlinked from `raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/` and cached by the service worker. ExerciseDB was evaluated and rejected: the full dataset is paid and the free tier has unclear terms.
- Security: a CSP in `index.html` allows scripts only from `'self'` and network calls only to `api.github.com` and `raw.githubusercontent.com`. Keep it that way: no CDNs and no inline scripts.

## Code structure

```
index.html            layout shell (top bar, <main id="view">, timer bar, tab bar) + CSP
styles.css            all styling; design tokens in :root
sw.js                 service worker (precache list + cache strategy)
manifest.webmanifest  PWA manifest; icons/ holds app icons
data/exercises.json   exercise catalog
js/main.js            entry point: wires core events to the UI, boot, SW registration
js/core/              application logic — NO DOM access
  config.js           APP_VERSION, storage key, constants
  i18n.js             Italian labels (muscles, equipment, levels)
  exercises.js        catalog: load, lookup, search, image URLs, display names
  store.js            state + every mutation (actions), persistence, change events
  queries.js          read-only derived data: history, records (e1RM), stats, plan lookup
  validate.js         program schema validation
  sync.js             GitHub REST client + two-way reconcile
  sync-service.js     runs sync, tracks status, emits events
js/ui/                presentation
  dom.js, shell.js, router.js, components.js, timer.js
  views/*.js          one module per screen (home, program, day, workout, history,
                      library, exercise, editor, import, settings)
```

Rules:
- `js/core` must never touch the DOM. `js/ui` reads data through getters and queries and changes state **only** through `store.js` actions.
- A visual redesign should only touch `styles.css`, `index.html` and `js/ui/`.
- Routes are hash-based (`#/program/<id>/<dayId>`, `#/workout/<id>`, `#/edit/<id>`, …) and are registered in `js/ui/router.js`.
- Editing is split in two screens, each with its own draft and save: `#/edit/<id>` for the program details and day order, `#/edit/<id>/<dayId>` for one day (`new` as `dayId` creates a day).
- The layout is a flex app shell where only `<main>` scrolls. Do not reintroduce `position: fixed` bars on a scrolling body: they jumped on iOS.
- Keep `.topbar` as `position: sticky; top: 0` with a plain `background-color` and no `backdrop-filter`. Since iOS 26 the installed app blurs the top of the page unless it finds such a box at the top edge. This only shows in the Home Screen app, not in a Safari tab or in desktop emulation.
- In standalone mode the shell height is `100dvh` plus the top safe-area inset (see `styles.css`): on iOS `dvh` excludes the status bar even when the page is drawn under it.

## Releasing a change (important)

The installed PWA only picks up a new version when the service worker changes. On every user-facing change:
1. Bump `APP_VERSION` in `js/core/config.js` (format `YYYY-MM-DD.N`; shown in the *Dati* tab).
2. Bump `VERSION` in `sw.js`. If you add, rename or remove files, update `SHELL_FILES` in `sw.js`.
3. Push to `main`.

The app checks for updates whenever it returns to the foreground and reloads itself once the new service worker activates. Shell files are fetched with `cache: 'no-cache'` to bypass GitHub Pages' 10-minute HTTP cache.

## Program JSON (schema v1)

Full reference in `README.md`. Summary:

```json
{
  "schemaVersion": 1,
  "id": "upper-lower-2026-10",
  "name": "Upper / Lower – Blocco 1",
  "description": "…", "goal": "Ipertrofia", "level": "intermediate", "weeks": 8,
  "days": [
    { "id": "upper-a", "name": "Upper A", "notes": "…",
      "exercises": [
        { "exerciseId": "Barbell_Bench_Press_-_Medium_Grip", "name": "Panca piana",
          "sets": 4, "reps": "6-8", "restSec": 150, "rpe": 8, "weightKg": 60, "notes": "…" }
      ] }
  ]
}
```

- `exerciseId` **must** be an `id` from `data/exercises.json`, for example:
  `jq -r '.[] | select(.name|test("bench";"i")) | .id + " | " + .name' data/exercises.json`
- Required fields: `name`, `days[].name`, `days[].exercises[].exerciseId`, and `sets` > 0. `reps` is a string (`"8"`, `"6-8"`, `"45s"`). `level` is `beginner|intermediate|expert`.
- Give each day a stable `id`: sessions reference `dayId`.

## Data repo and sync (`Andreasco/gym-app-data`)

```
programs/<id>.json                       one file per program
sessions/<yyyy>/<yyyy-mm-dd>-<id>.json   one file per finished workout
```

- Session shape: `{ id, programId, programName, dayId, dayName, startedAt, finishedAt, entries: [{ exerciseId, planId, name, note, sets: [{ weight, reps, done }] }] }`. `planId` is the planned exercise when it was swapped during the workout (`null` for one added on the fly).
- **Publishing a program for Andrea:** commit `programs/<id>.json` to `gym-app-data`. The app pulls it on the next sync (on open or foreground) and shows it on the home screen. To revise one, edit the same file and keep its `id`.
- **Reading progress:** read `sessions/**` (weights, reps, notes) before writing the next program.
- Conflict rule: a file already known locally takes the remote version unless it was edited on the phone (`_dirty`). In that case the phone's version wins. Local deletions delete the remote file.
- The app accepts only private repos. It uses a fine-grained PAT scoped to `gym-app-data` with *Contents: Read and write*, stored on the device only.

## Testing

There is no automated test suite in the repo. Changes were verified with Playwright (Chromium, iPhone 13 device profile) against `python3 -m http.server`, with `api.github.com` mocked via `context.route` as an in-memory repo that serves the tree, blob and contents endpoints. Before pushing, cover at least:
- home → program → day → start workout → tick sets (rest timer) → finish → history;
- program editor (rename, reorder, change, add, delete) → save;
- sync: connect, push of programs and sessions, a remote add or edit pulled in, local delete, wipe and resync;
- service worker update: change `sw.js`, trigger `visibilitychange`, and check that the page reloads.

Real iOS Safari behaviour (standalone mode, keyboard, safe areas) can only be confirmed by Andrea on his phone.

## Environment notes (Claude Code cloud sessions)

- The egress proxy blocks `*.github.io` and some GitHub API paths (for example enabling Pages via the API). Andrea makes Pages and visibility changes in the repository settings himself.
- Agents cannot create repositories with Andrea's account; ask him to create them.
