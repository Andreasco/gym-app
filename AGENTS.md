# AGENTS.md

Guide for AI agents (Claude Code and others) working on this repository.

## Project

**Gym** is a personal workout PWA for a single user (Andrea) on iPhone. Andrea has no Mac, so a native app is not an option. It is installed from Safari via *Share → Add to Home Screen*. Claude writes the workout programs (*schede*); Andrea logs workouts in the app.

- **Live:** https://andreasco.github.io/gym-app/ (GitHub Pages, branch `main`, root `/`). Every push to `main` deploys automatically in about a minute.
- **Code repo:** `Andreasco/gym-app` (public, required for free GitHub Pages; it contains no personal data).
- **Data repo:** `Andreasco/gym-app-data` (private): the user's programs, workout history and training profile. The app syncs the first two.

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

## Writing a new program for Andrea

Andrea's training profile (goal, schedule, equipment, injuries, exercises to avoid, reference loads, log of past blocks) is personal data. It lives in the private data repo as `PROFILE.md`. This repository is public: never copy that information, or a program file, into it.

### Steps

1. Read `PROFILE.md` and the current program in `gym-app-data`.
2. Read `sessions/**` since the last block: weights, reps and notes. An entry whose `planId` differs from its `exerciseId` is an exercise he swapped; `planId: null` is one he added.
3. Ask Andrea what changed before designing: goal, sessions per week, session length, pain or injuries, exercises he wants in or out. Do not assume the profile is still current.
4. Design the block, build the JSON in a temporary directory, check it and publish it (below).
5. Update `PROFILE.md`: any change to the profile, plus one entry in the block log with the reasoning and the weekly sets per muscle group.
6. Tell Andrea to open the app. A pulled program is not activated automatically: he opens it and taps "Imposta come attiva".

### Conventions

- A block lasts 4 weeks: `"weeks": 4`.
- A new block is a new file with a new `id`, `<split>-<yyyy>-<mm>` (for example `full-body-2026-10`). Leave the previous block in place: past sessions point at it. To correct the current block, edit the same file and keep its `id` and the day ids.
- Everything shown in the app is Italian: program and day names, `description`, `notes`, and a `name` on every exercise (catalog names are English).
- Intensity goes in `rpe`. His old sheets used RIR: RIR 2 is RPE 8.
- Session length: the app estimates `sets × (restSec + 45 s)` per exercise. Keep that estimate about 10 minutes under the session length he asked for, to leave room for the warm-up.
- Put the warm-up in the day `notes`. Keep exercise `notes` to one short line: they are shown on the workout card every time.

### What the schema cannot express

- **Weekly changes.** An exercise has one prescription, the same every week. Write the rule for the block (which week to add load, which week to deload) in `description`.
- **Supersets.** List the two exercises one after the other, say so in both `notes`, and give the first a short `restSec` such as 20. Do not use 0: it falls back to the 90-second default.
- **Starting loads.** `weightKg` only prefills the first workout of an exercise with no history. After that the app prefills the weights used last time.
- **Per-day history.** History, prefill and records are keyed by `exerciseId` across all days and programs. Variants that use different loads need different catalog ids (dumbbell and cable lateral raises, for example). Never use the same `exerciseId` twice in one day.

### What the app derives from the program

- **Progression hint.** On each workout card the app compares the last time the exercise was done with `reps`. If every planned set reached the top of the range it suggests more load (+2.5 kg from 20 kg up, +1 kg below, added weight for bodyweight work); otherwise it suggests repeating the load. This needs `reps` as a number or a range (`"8"`, `"6-8"`); other formats such as `"45s"` show no hint. The hint knows nothing about deload weeks: mention that in `description` when the block has one.
- **Week counter.** A "week" is one completed round of all the days, not a calendar week. When the rounds reach `weeks` the home screen shows "Blocco completato": that is the cue for the next block.

### Checking and publishing

There is no command-line validator. Before publishing, check the file against `js/core/validate.js` (a name, at least one day, no day without exercises, `sets` > 0) and make sure every `exerciseId` is in the catalog:

```bash
jq -r '.[] | select(.name|test("lateral raise";"i")) | .id + " | " + .equipment' data/exercises.json
```

Publish with the contents API. To update an existing file, add its current `sha`:

```bash
gh api -X PUT repos/Andreasco/gym-app-data/contents/programs/<id>.json   -f message="Add program <name>" -f content="$(base64 -w0 <file>)"

gh api -X PUT repos/Andreasco/gym-app-data/contents/programs/<id>.json   -f message="Update program <name>" -f content="$(base64 -w0 <file>)"   -f sha="$(gh api repos/Andreasco/gym-app-data/contents/programs/<id>.json --jq .sha)"
```

Deleting a program file removes it from the phone on the next sync, unless it was edited there and not yet synced.

## Data repo and sync (`Andreasco/gym-app-data`)

```
PROFILE.md                               Andrea's training profile and block log (ignored by the app)
programs/<id>.json                       one file per program
sessions/<yyyy>/<yyyy-mm-dd>-<id>.json   one file per finished workout
```

- Session shape: `{ id, programId, programName, dayId, dayName, startedAt, finishedAt, entries: [{ exerciseId, planId, name, note, sets: [{ weight, reps, done }] }] }`. `planId` is the planned exercise when it was swapped during the workout (`null` for one added on the fly).
- **Publishing a program for Andrea:** commit `programs/<id>.json` to `gym-app-data`. The app pulls it on the next sync (on open or foreground) and shows it on the home screen. The full procedure is in "Writing a new program for Andrea".
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
