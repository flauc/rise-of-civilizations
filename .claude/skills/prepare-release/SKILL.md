---
name: prepare-release
description: >-
  Prepare a new release of Rise of Civilizations: bump the version everywhere and
  write the changelog from the uncommitted (or since-last-tag) changes. Use this
  whenever the user says something like "prepare everything for version 0.4.0",
  "cut a release for X", "prep the 0.5.0 changelog", "bump the version and write
  the changelog", or otherwise asks to roll up the current work into a versioned
  release. The user gives a target version number; this skill knows which files to
  touch and how to write the changelog in the game's voice.
---

# Prepare a release

When the user asks to "prepare everything for version `X.Y.Z`", do the whole
release-prep pass below. The target version comes from the user (e.g. `0.4.0`).
Do NOT commit, tag, or push unless the user explicitly asks — this skill only
edits the working tree.

## The four things a version lives in

There are exactly **three files** to update for the version bump, plus the two
changelogs (the in-game one and the docs one share their content):

1. `package.json` → `"version"` field.
2. `packages/client/src/changelog.ts` → the `CURRENT_VERSION` constant (this is
   what the start-screen/lobby label and the What's-New overlay show; nothing
   else renders the version, so these two spots are the whole story).
3. `packages/client/src/changelog.ts` → a new entry at the **top** of the
   `CHANGELOG` array (newest first).
4. `docs/CHANGELOG.html` → a new `<h2>` section at the **top** (just under the
   `<p>Recent changes…</p>` line), mirroring the in-game entry.

Keep all of these on the **same** version string. After editing, verify they
agree (grep the version across the three files).

## Step 1 — Figure out what changed

The release covers everything not yet released. Usually that's the uncommitted
working tree on top of the last release commit:

- `git status --short` and `git diff --stat` for the shape of it.
- Read the actual diffs for the substantive files. There are usually too many to
  read one-by-one, so **fan out**: launch a few `Explore` subagents in parallel,
  each given a related cluster of files (e.g. one for diplomacy, one for the sim
  gameplay files, one for data/UI/content), asking each to return a concise
  bulleted list of **player-facing** changes only. Then compose from their
  reports.
- If the work is already committed since the last release, diff against the last
  release commit/tag instead of the working tree (`git log` to find it — releases
  are commits titled like `feat: version 0.3.0`).

**Watch for a partially-drafted entry.** A previous session may have left a
draft changelog entry under a placeholder version (e.g. the working tree had a
`0.3.2` entry while `package.json` was still `0.3.1`). If the user's target
version supersedes it, **rename that draft to the target version and fold the
newly-discovered items into it** rather than creating a second release block.

**Don't re-announce.** Before writing an item, check it isn't already described
in an earlier (already-released) changelog entry. Big systems are sometimes
narrated a release before the code fully lands; if players already read about it,
skip it. When in doubt, grep the existing changelog for the feature.

## Step 2 — Write the changelog plainly

Write it straight. State what each item is (a new feature, a change, or a bug
fix) and explain the actual gameplay addition, change, or fix. No hype, no
marketing voice, no evocative flourishes. A player should be able to read an
entry and know exactly what is different in the game.

- Each item is `{ tag, title, desc }` in `changelog.ts`, and
  `<li><strong>[Tag] Title.</strong> Desc</li>` in the HTML.
- **Tags** (the badge) tell the player the *kind* of change. Pick the accurate
  one:
  - `New` — a feature or content that did not exist before.
  - `Gameplay` — a change to how something already in the game works.
  - `Balance` — a numbers/tuning change (costs, stats, rates).
  - `UI` — a change to the interface or presentation.
  - `Fix` — a bug fix; something that was broken now works correctly.
- **Title**: short and factual, sentence-case, names the thing that changed. No
  trailing period in `changelog.ts` (the HTML version appends a `.` after the
  title).
- **Desc**: 1–3 plain sentences written for a *player*. Say what changed and, for
  fixes, what the wrong behaviour was. Name the units/wonders/mechanics/numbers
  involved. Do not editorialise about how exciting or impactful it is. Never
  mention file names, functions, tests, or refactors.
- **No em dashes** in any changelog copy (see the `no-em-dashes` house rule). Use
  commas, periods, or colons instead.
- Order items by impact: new features first, then gameplay/balance changes, then
  fixes. AI-behaviour items usually go last.
- `date`: the current month and year, e.g. `"July 2026"`.

**HTML escaping:** in `docs/CHANGELOG.html`, write real ampersands as `&amp;`.
Keep the two changelogs' wording identical.

## Step 3 — Verify

- Grep the version string across `package.json`, `changelog.ts` (expect 2 hits:
  `CURRENT_VERSION` + the release block) and `docs/CHANGELOG.html` (1 hit) — all
  must match the target.
- Sanity-check `changelog.ts` still parses (balanced braces/brackets; the new
  block sits inside the array). A quick `bun run typecheck` or a targeted read of
  the edited region is enough.
- Do **not** verify in the browser preview — per the user's standing preference,
  they verify the running game themselves.

## Step 4 — Report

Summarise: the new version, the list of changelog items you wrote (by title), and
the files touched. Remind the user you have **not** committed/tagged unless they
asked, and offer to do so.
