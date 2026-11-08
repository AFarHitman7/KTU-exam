# KTU Exam — a quiet exam planner

A personal exam planner with a Japanese stationery temperament: paper white, ink
black, and one shu-red seal for exams. No account, no server, no build step. It is
plain HTML, CSS and JavaScript, designed to live on GitHub Pages.

## What it does

- **Courses** — course → module → topic, fully editable. Checking a topic stores a
  `completedAt` timestamp and updates module, course and overall percentages.
- **Timetable** — a Monday–Sunday weekly template. Today has its own daily copy where
  blocks can be added, moved, edited or checked off without changing the template.
- **Calendar** — month grid with a dot for days that have study blocks and a red
  circle for exam dates. Add and edit exams per day.
- **Progress** — overall completion, bars per course, and a red hanko countdown for
  every upcoming exam.
- **Analytics** — a check-in streak, this week's completions, 14 days of activity and
  completion by subject, all derived from `completedAt` timestamps. No timer.
- **Your data** — autosaves to `localStorage` under `ktu-exam-v1`, with JSON export and
  import. On a first visit with empty storage, it seeds from `data.json`.
- **GitHub sync** — Pull and Push `data.json` with a personal access token (PAT),
  including SHA conflict protection and Unicode-safe base64 encoding.

The interface uses a bottom tab bar on mobile and a sidebar on desktop. Main sections:
Today, Timetable, Courses, Calendar, and More (Progress / Analytics / Settings).

## Files

```
index.html     app shell and navigation
styles.css     all styling; no frameworks
app.js         all application logic; no dependencies
data.json      empty seed, read on first load
README.md      this file
```

## Run locally

A tiny static server is enough:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`. Opening `index.html` as a file also mostly works,
but fetching `data.json` requires a server (or GitHub Pages).

## Deploy to GitHub Pages

1. Create a **public** repository named **`KTU-exam`** on GitHub (a private repo also
   works for sync; GitHub Pages availability for private repos depends on your plan).
2. Push these files to the repository root of the **`main`** branch:

   ```bash
   git init
   git add index.html styles.css app.js data.json README.md
   git commit -m "Add KTU exam planner"
   git branch -M main
   git remote add origin https://github.com/<your-username>/KTU-exam.git
   git push -u origin main
   ```

3. In the repository: **Settings → Pages → Build and deployment**.
   Set **Source** to **Deploy from a branch**, then choose **`main`** and **`/ (root)`**.
   Save.
4. Wait for the deployment, then open:

   `https://<your-username>.github.io/KTU-exam/`

The site has no server routes. `data.json` is fetched from the same folder.

## GitHub PAT sync

The sync feature talks directly to `https://api.github.com` from the browser. GitHub
supports this with CORS; there is no proxy and no backend.

### Create a fine-grained token

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. Repository access: **Only select repositories → `KTU-exam`**.
3. Repository permissions: **Contents → Read and write**. Nothing else is required.
4. Generate the token and copy it.

A classic token with the `repo` scope also works, but a fine-grained token limited to
this one repository is strongly preferred.

### Connect

Open **More → Settings → GitHub sync** and fill in:

| Field | Default | Notes |
| --- | --- | --- |
| Personal access token | — | Password field. Stored in this browser only, under `ktu-pat`. |
| Owner | — | Your GitHub username or organization. |
| Repository | `KTU-exam` | The repo holding `data.json`. |
| Branch | `main` | The Pages branch. |
| Path | `data.json` | File at the repository root unless you use a folder. |

Press **Pull from GitHub** to replace local data with the remote file, or **Push to
GitHub** to write the local plan into the repository. The status line shows the last
successful sync or the exact error. Pulling requires a token with read access; pushing
requires Contents: read and write.

### How conflicts are handled

After a Pull or Push, the app remembers the file's Git SHA. On the next Push it checks
the remote SHA first:

- If the remote SHA matches, the push proceeds.
- If the remote is newer, the push stops with **“Remote is newer than your last pull.
  Pull first?”**. Pull deliberately (it replaces the browser copy), review, then push.
- If this browser has never synced and a remote file already exists, a confirmation
  warns that Push will replace the remote file.

### Security notes

- The token is saved **only** in this browser's `localStorage` under `ktu-pat`. It is
  never written into `data.json`, export files, or any committed file.
- Never paste a token into a file in the repository. Do not commit it.
- Use a fine-grained token with only **Contents: read and write** on this repository,
  and revoke it if the device is lost or shared.
- If the repository is public, `data.json` will be public too. Use a private repository
  if the exam plan should stay private, and check that your Pages setup supports it.
- Browser `localStorage` is readable by any script on the same origin. Serve only your
  own files on this origin; avoid adding third-party scripts.

## Data shape

```json
{
  "courses": [
    {
      "id": "uuid",
      "title": "Applied Mathematics",
      "examDate": "2026-12-02",
      "modules": [
        {
          "id": "uuid",
          "title": "Module 1 — Linear algebra",
          "topics": [
            {
              "id": "uuid",
              "title": "Cayley–Hamilton theorem",
              "done": false,
              "completedAt": null
            }
          ]
        }
      ]
    }
  ],
  "weeklyTemplate": {
    "Mon": [
      { "id": "uuid", "title": "Mathematics", "courseId": "uuid", "start": "18:00", "end": "19:30" }
    ],
    "Tue": [], "Wed": [], "Thu": [], "Fri": [], "Sat": [], "Sun": []
  },
  "dailyOverrides": {
    "2026-11-08": [
      { "id": "uuid", "title": "Physics revision", "courseId": "", "start": "09:00", "end": "10:00", "done": false }
    ]
  },
  "exams": [
    { "id": "uuid", "title": "Applied Mathematics paper", "date": "2026-12-02", "courseId": "uuid" }
  ]
}
```

`dailyOverrides["YYYY-MM-DD"]` replaces the weekly template for that date. If a date has
no override, Today and Calendar read that weekday's blocks from `weeklyTemplate`.

Course exam dates (`courses[].examDate`) also appear on the calendar and in countdowns
as virtual exams. Standalone exams live in `exams[]`.

## Notes and limits

- Autosave is immediate; the save state in the sidebar/footer shows the time.
- **Import** replaces everything currently in the browser. Export first if unsure.
- **Erase local data** clears courses, blocks, overrides and exams, but keeps the token
  and sync settings. It does not touch GitHub.
- Move means “move this block to another date” and preserves its done state.
- Calendar dots mean study blocks; the red circled date means at least one exam.
- Analytics uses only topic check-ins. Study-block checkmarks are for the day's rhythm
  and do not affect streaks.
- Dates are local to the browser. Completed timestamps are ISO strings and grouped by
  local calendar date.
- Sync is last-write-wins after conflict checks. There is no automatic merge.
