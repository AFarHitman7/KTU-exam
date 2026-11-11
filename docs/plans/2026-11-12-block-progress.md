# Block progress, flexible completion, and get-ahead prompts

## Source brief (binding authority)

The user asked for four changes:

1. Adding a calendar block should also update timetable/weekly.
2. Progress is currently by topics completed, but topics are not necessary. Calculate
   progress by whatever element exists: Courses, Modules, Topics, in that order.
3. Passed/finished blocks should have an update modal. Depending on the course of the
   block, prompt to mark the topics, modules or course itself. Marking is not binary;
   add a gradation with a semantic such as "Almost done".
4. If nothing is scheduled for today, prompt the user to get ahead and start with the
   next earliest block.

Those four statements are the spec. When this plan and the brief disagree, the brief
wins and the controller records a ruling.

## Current state (read before Task 1)

- `app.js` is the whole app (no modules, no build). `state` is normalised on load.
- Only topics have completion (`done` + `completedAt`). Modules and courses are pure
  containers. `courseStats`, `moduleStats`, `overallStats` count topics only.
- `blocksForDate(date)` returns `dailyOverrides[date]` when present, otherwise the
  weekday's `weeklyTemplate` blocks. `ensureOverride(date)` copies template blocks
  (same ids) into an override.
- Block checkboxes call `toggleBlockCheckbox`. Topic checkboxes call
  `toggleTopicCheckbox`. Both are wired through `handleChange`.
- The app uses one `<dialog id="modal">`, `openModal({...})`, `commit()`,
  `renderAll()`, `focusByKey()`, and a delegated click handler.
- No test framework exists. Acceptance is verified with the Playwright script created
  alongside this plan in the SDD workspace.

## Global constraints

- Plain HTML/CSS/JS only. No framework, no build step, no new runtime dependency.
- Keep the existing stationery visual language. Reuse CSS variables and existing
  components; no new colour system. Never use a raw hex colour if a variable exists.
- Keep the existing focus-management pattern (`data-focus`, `focusByKey`, modal close
  fallback). All new controls must be keyboard reachable with a visible focus ring.
- Mobile (390px) and desktop (1280px) must both work. No horizontal overflow.
- Old saved data and old JSON exports must keep working. Every imported value is
  normalised; never trust storage.
- Statuses are exactly: `not-started`, `almost`, `done`. Weights: 0, 0.5, 1.
  Labels: "Not started", "Almost done", "Done".
- A block remains binary (`done`). The gradation applies to topics, modules and
  courses, which are the progress units.
- Preserve all existing flows: add/edit/delete course, module, topic, block, template
  block, exam; move block; import/export/erase; GitHub pull/push; autosave.
- Do not change `STORE_KEY` (`ktu-exam-v1`) or the GitHub sync protocol.
- Do not add unrequested refactors, reformatting, or renames.

## Progress rule (exact)

The effective unit of a course is the deepest level that exists:

1. If the course has at least one topic anywhere, its units are **all topics**.
2. Else, if the course has at least one module, its units are **all modules**.
3. Else, its single unit is the **course itself**.

Module display rule: if a module has topics, its bar counts its topics; otherwise it
counts the module itself. A module's own status is ignored while it has topics.

Overall progress sums each course's effective units. `pct = round(sum(weight) /
sum(units) * 100)`. A single "almost" is half a unit. Mixed levels are allowed; the
overall label falls back to "item(s)" when courses use different levels.

`done` means status `done`; `almost` means status `almost`. `completedAt` is set when
an entity first becomes `done` and cleared when it leaves `done`. It drives analytics.

## Task 1: Status model, migration, progress maths, analytics

**Files:** `app.js` (only). Do not add UI markup in this task beyond replacing
existing text labels with the new stats fields.

**Build:**

- Add constants near the top:
  `STATUSES`, `STATUS_LABELS`, `STATUS_WEIGHT`.
- Add helpers:
  - `cleanStatus(raw, doneFallback = false)` — accepts only a valid status, else
    `doneFallback ? 'done' : 'not-started'`.
  - `entityStatus(entity)` — valid `entity.status`, else derived from `entity.done`.
  - `applyStatus(entity, status)` — writes `status`, syncs legacy `done`, stamps
    `completedAt` when done, clears it otherwise.
  - `nextStatus(status)` — cycles not-started → almost → done → not-started.
- Normalise `status`, `done`, `completedAt` on topics, modules and courses.
  Topics keep `done` and `completedAt`. Modules and courses gain `status`, `done`,
  `completedAt`. Old data with only `done` must load as `status: 'done'`.
- `normalizeState` output shape otherwise unchanged.
- Add `statOf(units)` returning:
  `{ total, done, almost, points, pct, unitLabel }`.
- Rewrite `moduleStats`, `courseStats`, `overallStats` to follow the Progress rule.
  `unitLabel` is `topic`, `module` or `course`; overall uses `item` when mixed or
  empty.
- Add `progressCountLabel(stats)` (or equivalent) that renders the count phrase with
  the right plural, e.g. `2 of 4 topics`, `1 of 2 modules`, `1 of 1 course`, and
  appends `${almost} almost` when `almost > 0`.
- Generalise analytics from topics to effective units:
  - `completedUnits()` returns one item per done effective unit that has
    `completedAt`, with `{ course, entity, kind, date, at }`.
  - `completedOn`, `streakDays`, `weekCompletions`, `last14Days` use it.
  - Keep `completedTopics()` only if still used; otherwise remove it. Do not leave
    dead functions.
- Update every existing consumer of the old `{ total, done, pct }` shape so nothing
  prints `undefined` or claims "topics" when the course uses modules/course:
  Home progress widget, Home lede, Home analytics, Today meta, Courses header/cards,
  Progress page, Analytics page, Settings course/topic summary, import confirmation.
  Use the stats' `unitLabel` for labels. When overall is mixed, say "items".
- Do not change visible copy that is still true (e.g. "Day streak").

**Acceptance for this task:**

- Seeding a course with 2 topics (one almost, one done) yields course pct 75 and
  overall pct 75.
- A course with 2 modules, no topics, one almost yields pct 25.
- A course with no modules and status almost yields pct 50.
- A legacy export with `done: true` topics loads as done and still shows 100%.
- Analytics counts a done module in a module-only course as a check-in on its
  `completedAt` date.
- No console errors on any view.

## Task 2: Tri-state status controls in the Courses view

**Files:** `app.js`, `styles.css`.

**Build:**

- Add an `ICONS` entry only if a new icon is genuinely needed; prefer CSS marks.
- Add `statusTickHtml(entity, attrs)` for topic rows: a `<button>` that reuses the
  `.tick` footprint, with classes `is-almost` / `is-done`, a title and an aria-label
  that names the current status and the next one. Example aria-label:
  `Almost done. Click to set Done`.
- Add `statusChipHtml(entity, attrs)` for module and course rows: a compact chip
  showing a dot plus the status label.
- Topic rows in `topicHtml` replace the checkbox with the status button.
  `data-kind="topic"`, plus course/module/topic ids and a `data-focus` key.
- Module header: show a status chip **only when the module has no topics**.
- Course header: show a status chip **only when the course has no modules**.
  A course with modules but no topics uses its module chips. A course with topics
  uses topic buttons.
- Add a delegated click action `cycle-status`:
  - resolve the entity from `data-kind` + ids, ignore stale ids;
  - apply `nextStatus(entityStatus(entity))`;
  - `commit(focusKey)` so focus returns to the same control;
  - update the surrounding stats and labels.
- Remove the old `toggle-topic` change handler and `toggleTopicCheckbox` if the
  checkbox is gone. Keep block toggling untouched.
- Style:
  - `.tick--status` is a button with the same 24px footprint as `.tick`.
  - `is-almost`: half-filled ink square (linear-gradient or equivalent), still
    reads at 24px.
  - `is-done`: ink fill with the same check glyph as `.tick:checked`.
  - `.status-chip`: pill, 11px mono, section-tinted background, dot that encodes the
    status (open / half / filled).
  - All states have `:focus-visible` outlines and `:hover` feedback.
  - No layout shift when cycling.
- Update module count/pct and course meta to use `moduleStats` / `courseStats`
  (Task 1 shape). The visible `done/total` may keep whole counts; the percentage
  must include almosts.

**Acceptance:**

- Clicking a topic tick cycles not-started → almost → done → not-started; the course
  bar and percentage update each time; focus returns to the same tick.
- A module with no topics shows a chip; a module with topics does not.
- A course with no modules shows a chip; a module-only course shows no course chip.
- No `type="checkbox"` remains for topics.
- Desktop and 390px mobile screenshots show no overflow and controls remain tappable.

## Task 3: Finished-block update modal

**Files:** `app.js`, `styles.css`.

**Build:**

- Add `blockProgressLevel(course)` returning
  `{ kind: 'topic'|'module'|'course', units: [...] }` using the Progress rule.
- Add status-radio markup:
  - A row per unit with the unit title (and module name for topics).
  - A 3-option segmented radio group labelled Not started / Almost done / Done.
  - Native radio inputs (visually styled), unique `name`, `data-status-kind` and
    `data-status-id`, current status checked.
  - Wrap long lists in a scrollable area; the modal body must stay usable with 60
    topics.
- Add `openBlockProgressDialog(date, blockId)`:
  - Resolve the date's block and its course.
  - If there is no course, do nothing (the caller handles the toast).
  - Eyebrow: course title + short date. Title: "What did you cover?".
  - Body: intro line explaining a partial counts as Almost done, then the units.
  - Submit: apply every checked status, ensure `block.done = true`, `commit()`,
    toast a short confirmation (e.g. `Progress saved for Applied Mathematics.`).
  - Cancel leaves the block done and progress unchanged.
- Checking a block from `toggleBlockCheckbox`:
  - unchecking only unmarks the block (no modal);
  - checking marks the block done, persists/renders, then opens the dialog when the
    block has a course;
  - no course: mark done and toast `Block finished. Link a course to track progress.`
    (wording may be refined, but it must explain why no modal appeared).
- Completed blocks expose an explicit update affordance:
  - add an icon action `update-block-progress` on `done` rows that have a course,
    with `aria-label` and `title` "Update progress";
  - add the icon to `ICONS`;
  - clicking it opens the same dialog.
- Add CSS for `.status-grid`, `.status-row`, `.status-choices`,
  `.status-choice` (segmented control), and a modal body scroll cap.
  Match the paper/ink style, 44px minimum tap height on mobile, visible focus.
- Do not change how the block checkbox itself looks.

**Acceptance:**

- Checking a block linked to a topic course opens the modal with its topics grouped
  by module; setting one almost and one done updates course/overall percentages.
- Module-only and course-only courses produce module/course rows respectively.
- Cancelling leaves the block done and no progress changed.
- Unchecking a block never opens the modal.
- A done block shows an update action that reopens the modal.
- No-course block checks with a toast, no modal, no crash.
- Modal is usable at 390px and with a long topic list.

## Task 4: Calendar blocks also update the weekly template

**Files:** `app.js` (and `styles.css` only if the checkbox needs spacing).

**Build:**

- In `openBlockDialog` for a **new** block:
  - Add a checkbox `name="repeatWeekly"`, checked by default, label
    `Also add to the weekly timetable for <Weekday>s` (use `DAY_LONG`).
  - Hint: `Uncheck for a one-off block on this date only.`
  - On submit, create one id. Push to `dailyOverrides[date]` and, when checked, push
    the same id/title/courseId/start/end to `weeklyTemplate[weekdayKey(date)]`.
  - If an identical block (same title, courseId, start, end) already exists in that
    weekday's template, do not duplicate it; toast that it is already in the weekly
    timetable, but still add the daily block.
- In `openBlockDialog` for an **existing** block:
  - Add a checkbox `name="syncWeekly"`, unchecked by default, label
    `Also update the weekly timetable for <Weekday>s`.
  - Hint must make clear the daily edit applies now and the weekly copy changes only
    when checked.
  - When checked and the date is unchanged, update a template block with the same id
    if present; if none has that id, append a copy with the same id.
  - When the date changes (move), keep today's existing behaviour: only the daily
    block moves; do not rewrite the template. Toast or hint should not claim
    otherwise.
- Keep `ensureOverride` semantics. Do not rewrite the whole template when editing a
  single day.
- Update the Timetable note only if it becomes inaccurate. It currently says daily
  changes never rewrite the weekly template; after this task, that is only true
  unless the user checks the box. Rewrite it to say the checkbox is the explicit
  bridge.
- Ensure export/JSON includes the synced template block (it does, via state).

**Acceptance:**

- Add a block on an arbitrary future date with the box checked: it appears in the
  date detail and in the matching weekday column of Timetable.
- Add with the box unchecked: date detail only.
- Editing a daily block with sync checked changes both copies.
- Moving a block does not silently edit the template.
- A duplicate identical template block is not created twice.

## Task 5: Get-ahead prompt when today is empty

**Files:** `app.js`, `styles.css`.

**Build:**

- Add `nextScheduledBlock({ from = todayISO(), horizonDays = 30 } = {})`:
  - scan `from + 1` through `from + horizonDays`;
  - use `blocksForDate` and `sortBlocks`;
  - return `{ date, block, blocks }` for the first date with any block, earliest
    block first;
  - return `null` when nothing is found.
- Add `startAheadBlock(sourceDate, sourceBlockId)`:
  - resolve the source block, `ensureOverride(todayISO())`, append a copy with a new
    id and `done: false`;
  - `commit()`, toast `"<title>" added to today — you are a day ahead.` (exact copy
    may be polished but must mention today and getting ahead);
  - guard stale/missing ids.
- Today view: when `blocks.length === 0` and an ahead block exists, replace/augment
  the empty state with a prominent get-ahead card:
  - kicker `Nothing today · get ahead`;
  - the block title, weekday/date, time range and course;
  - primary button `Start it today` wired to `start-ahead`;
  - secondary `Add a block` and `Open timetable` actions remain available.
  When no ahead block exists, keep the current empty state.
- Home `Today` widget: when `blocks.length === 0` and an ahead block exists, show a
  compact version of the same prompt with the same action. Keep the footer add-block
  button.
- Add a delegated click action `start-ahead` reading `data-date` and `data-id`.
- Style `.ahead-card` / `.ahead-panel` in the stationery language: a torn/taped
  note is acceptable, but reuse the existing torn-card or widget patterns. It must
  not look like an error. Mobile: buttons stack or wrap without overflow.
- Do not show the prompt when today already has at least one block, or when no block
  exists in the horizon.

**Acceptance:**

- Seed tomorrow with a 09:00 block and today empty: Today and Home both show the
  prompt with that block.
- `Start it today` copies it to today, appears immediately in Today's schedule,
  persists in `dailyOverrides[today]`, and leaves the source untouched.
- Today with any block: no prompt.
- No blocks in 30 days: no prompt, normal empty state.
- The prompt is keyboard reachable and does not break the modal/focus pattern.

## Task 6: Documentation and final consistency sweep

**Files:** `README.md`, plus small consistency fixes in `app.js`/`styles.css` only
if Task 1–5 left stale copy.

**Build:**

- Update "What it does":
  - Courses: tri-state progress and the fallback hierarchy.
  - Timetable: calendar blocks can join the weekly template via the checkbox.
  - Progress: computed from topics, modules or course, whichever exists.
  - Today: get-ahead prompt.
  - Analytics: check-ins now include done modules/course when those are the unit.
- Update the data-shape JSON example: `status` on course/module/topic, module
  `status`, course `status`, and note that `done`/`completedAt` remain for
  compatibility.
- Update "Notes and limits":
  - progress hierarchy;
  - almost counts as half;
  - block update modal;
  - weekly checkbox;
  - get-ahead copy.
- Do not rewrite sections unrelated to these changes.
- Search for stale strings: "topics completed", "Topics done", "topic check-ins",
  "never rewrite this weekly template", "Check a topic when it is truly done".
  Update only where the meaning changed.

**Acceptance:** README matches shipped behaviour; no stale claims remain.

### Deferred-minor sweep (carry into Task 6)

These came from task reviews and are cheap, user-visible consistency fixes. Fix them
in the same task; do not expand into refactors.

- More → Progress → By course pct pill still prints `done/total · pct` and can read
  `0/1 · 50%` (app.js ~1663). Use the same coherence rule Task 2 applied to module
  headers: show `done/total` plus `· N almost` only when done > 0, and put the
  percentage first/second so it is never contradicted by the count.
- Courses overall line can read `2 almost complete` because it appends "complete" to
  `progressCountLabel` (app.js ~1323). Reword so an almost count reads naturally.
- Settings data summary and import confirmation can duplicate the course count when
  every course is bare (`2 courses · 2 courses`). A bare-course plan should read
  once, e.g. `2 courses · saved in this browser`, and the import line should not say
  "2 courses, 2 courses".
- Edit-append in `openBlockDialog` can create an identical weekly block when the
  add-flow duplicate guard had skipped one. Apply the same title/course/start/end
  guard before appending; if identical already exists, do not append and toast that
  the weekly copy already exists.
- Done topic ticks have no hover feedback because `.is-done` overrides the hover
  background. Add a visible hover state for almost and done that does not fight the
  check glyph.
- Status chips are 22px tall. Raise the tap target to at least 24px without making
  the chip visually heavy; keep cycle width stable.
- `blockProgressLevel` duplicates the effective-unit rule. Dedupe only if it is a
  small, safe change; otherwise leave it and note why.
- Radio group accessible names should include the module for topics so duplicate
  topic titles are distinguishable. Use `:has(input:focus-visible)` for the option
  ring, with `:focus` as fallback if needed.
- Done block rows should keep the update-progress action visible (or at least
  reachable) rather than relying on hover; keep icon buttons at their existing
  mobile size unless a low-risk 44px adjustment is possible.
- After `start-ahead` from Home, focus must not fall to the document. Focus the
  newly copied Home row (add `data-focus` and `tabindex="-1"`) or the Today widget
  heading.
- Remove the `renderAll` hidden-view prompt pruning (app.js ~937-942) if it exists
  only for an unscoped test selector; scope the harness selector instead. Hidden
  views are already inert and re-render on navigation.
- `startAheadBlock` should toast on an invalid source date, matching the missing-id
  branch.
- Today's "Study blocks" aside should not say `Empty` directly above a get-ahead
  card; use `Get ahead` or `Nothing today` when the prompt is shown.
- The weekly sync checkbox is a no-op after the date changes. Disable that row when
  the dialog's date differs from the opening date, with a short hint.

**Acceptance for the sweep:** each item is either fixed with a visible, low-risk
change or explicitly left with a one-line reason in the report. No new features.

## Verification harness

A Playwright script lives in the SDD workspace (not committed) and is run against a
local `http.server`. It covers the acceptance cases above:
calendar-to-timetable sync, percentages for topic/module/course levels, legacy
migration, block modal (topic/module/course/no-course), update affordance,
get-ahead prompt/copy, no-regression navigation, console errors, 390px layout.
Every implementer runs the relevant section and pastes the command/output into its
report. The controller runs the full script before the final review.

## Out of scope

- Multi-day or recurring-with-exceptions schedule rules.
- Editing the weekly template from the block modal.
- Sync conflict-merge changes.
- New analytics charts or timers.
- Any account, server or build step.
