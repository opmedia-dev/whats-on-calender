# What's On

Four What's On embeds for a Duda site (or any site), built from a public Google Calendar.
Hosted for free on GitHub Pages, so there's no server to run.

| Page | Embed |
| --- | --- |
| `timetable.html` | Hero timetable: the next 7 days grouped by day, with today highlighted |
| `banner.html` | "What's happening" banner: paged cards of events with pictures, with an optional flipbook column on the right |
| `whats-on.html` | What's On page: regular (repeating) events, search, a card grid and full event details |
| `calendar.html` | Monthly calendar with prev/next and "Show All"; switches to a list on phones |
| `index.html` | Embed codes to copy into Duda, plus notes for editors |

Every embed can open an event's **detail view**, which shows:

- the header image or poster
- the date and time, and the repeat pattern ("Second Monday of each month, 7.30pm")
- the location, with a map link
- the formatted description
- a contact box with the emails and phone numbers found in the description
- downloads (attached PDFs and other files)
- the next dates of a repeating event
- Add to Google, Apple or Outlook calendar, and Share

Live site: https://opmedia-dev.github.io/whats-on-calender/

## Managing events (in Google Calendar)

- **Any event** in the calendar appears in the timetable and the monthly calendar within about
  15 minutes. To publish straight away, open
  [Actions → Build and deploy What's On](https://github.com/opmedia-dev/whats-on-calender/actions/workflows/deploy.yml)
  and press **Run workflow**.
- **Repeating events** show on every date. Cards show them once, with their pattern. Series with
  the same title are merged, e.g. "Every Tuesday and Thursday".
- **Pictures and posters:** in the event, use **Add attachment** and pick an image or PDF from
  Google Drive. Share the file as **Anyone with the link** (Viewer).
  - The first image, or the first page of the first PDF, becomes the event's picture.
  - Events with a picture appear in the banner and on the What's On page.
  - PDFs and other attachments are listed as downloads.
  - If a file can't be read (not shared), the run shows a warning naming the file.
- **Description:** bold, italics, lists and links from the Google Calendar editor are kept. Web
  addresses, emails and phone numbers become links, and emails and phone numbers also go in the
  Contact box.
- **Location:** full addresses get a Google Maps link.
- **Hide an event** (e.g. room bookings): set its visibility to **Private** in Google Calendar.
  Embeds can also hide titles containing certain words (`exclude=`).

## One-time setup

1. **GitHub Pages:** repo Settings → Pages → Source: **GitHub Actions**. On a free plan the repo
   must be public.
2. **API key:** in [Google Cloud Console](https://console.cloud.google.com/), you can use the
   flipbook's project and key:
   1. APIs & Services → Library: enable **Google Calendar API** and **Google Drive API**.
   2. APIs & Services → Credentials → the API key → API restrictions: allow both APIs.
3. **GitHub secret:** repo Settings → Secrets and variables → Actions → New repository secret
   `GOOGLE_API_KEY` = the key.
4. The calendar ID is in `config.json`. You can override it with a repository *variable* `GCAL_ID`.
   The calendar must be public (Google Calendar → Settings → Access permissions →
   *Make available to public*, "See all event details").
5. Run the workflow once (Actions → Build and deploy What's On → Run workflow).

The sync runs every 15 minutes. It only rebuilds when an event, series or attachment has changed,
or once a day so "upcoming" stays current. Downloaded attachments are kept in the Actions cache.
GitHub pauses scheduled workflows after 60 days without activity; the workflow re-enables itself
on each run, but if syncing ever stops, press **Run workflow**.

`config.json`:

| Key | Default | Meaning |
| --- | --- | --- |
| `calendarId` | | Google Calendar ID |
| `timeZone` | `Europe/London` | Times are shown in this zone whatever the visitor's zone |
| `pastDays` / `futureDays` | `62` / `400` | Date range published (the calendar can browse this far) |
| `hidePrivate` | `true` | Hide events marked Private |
| `maxAttachmentMB` | `25` | Larger files link to Google Drive instead of being copied |

## Embedding in Duda

Open <https://opmedia-dev.github.io/whats-on-calender/>, enter your What's On page URL (and the
other settings), then copy each snippet into an **HTML** widget.

The snippet's script does three things:

- sizes the iframe to its content
- scrolls the embed into view when an event opens
- on the What's On page, keeps `?event=<id>` in the address bar, so shared links and clicks from
  the timetable, banner or calendar open that event

Duda only runs widget scripts on the preview/published site, so widgets may look a fixed size in
the editor.

### URL options

All embeds:

| Option | Example | Effect |
| --- | --- | --- |
| `accent` | `accent=7a1424` | Buttons, headings, card bands |
| `accent2` | `accent2=f3df8f` | Banner card date colour |
| `text`, `muted`, `bg`, `card`, `time`, `today`, `dayBg`, `border`, `titleColor` | `time=1f4f9c` | Other colours (hex or CSS); `bg` is transparent by default |
| `font`, `headingFont` | `font=Lora,serif` | Fonts; add `fontUrl=https://fonts.googleapis.com/css2?family=Lora` to load a web font |
| `radius` | `radius=0` | Corner radius (px) |
| `clock` | `clock=12` | `24` → 19:30, `12` → 7.30pm. Default: 24 in the timetable/calendar, 12 on cards and details |
| `link` | `link=https://site/events-calendar` | Open events on the What's On page instead of inside this embed |
| `only` / `exclude` | `exclude=rehearsal,booking` | Only show / hide events whose titles contain these words |
| `colors` | `colors=3,10` | Only events with these Google Calendar colour IDs (`0` = default colour) |
| `contacts` | `contacts=0` | Hide the Contact box in details |
| `backText` | `backText=Back` | Detail view's back button label |

`timetable.html`: `days` (7), `max` (no limit), `maxHeight` (px, scrolls inside), `location=0`,
`highlightToday=0`, `featured=1` (only events with pictures), `moreLink` + `moreText` (link
under the list), `emptyText`.

`banner.html`:

- `title` (`0` hides it)
- `perPage` (3, fewer on narrow screens), `max` (12), `minCardWidth` (240)
- `show=all` (include events without pictures), `days` (only the next N days)
- `autoplay` (seconds per page)
- `style=plain` (no colour band), `ratio=4:3`
- `flipbook=1`, `flipbookUrl`, `flipbookLink` (archive page), `flipbookWidth` (300), `flipbookHeight` (360)

`whats-on.html`:

- `regular=0` (hide the regular events row), `regularTitle`, `regularMax` (6), `moreText`
- `upcomingTitle`
- `search=0`, `searchText`
- `perPage` (9), `cols` (3), `minCardWidth` (260)
- `show=all`, `style=band`, `ratio`, `emptyText`

Searching always covers every upcoming event.

`calendar.html`: `view` (`auto`, `grid` or `list`), `month=2026-12`, `maxPerDay` (3),
`cellHeight` (150), `dots=1` (show Google Calendar event colours), `moreText`/`lessText`.

## How it works

`.github/workflows/deploy.yml` runs two scripts, then deploys `_site/` to Pages:

1. `scripts/sync-calendar.mjs` reads the calendar with the Google Calendar API. It expands
   repeating events into individual dates, reads each series' RRULE for the plain-English pattern
   (`scripts/lib/recurrence.mjs`), and cleans and sanitises descriptions
   (`scripts/lib/description.mjs`). It downloads attachments with the Drive API and makes WebP
   images with `sharp` (PDF posters via poppler's `pdftoppm`). The output is `data/events.json`
   plus `data/media/` and `data/files/`.
2. `scripts/build.mjs` copies `site/` and `data/` into `_site/`.

### Local development

```sh
npm ci
sudo apt-get install poppler-utils           # optional, for PDF posters
GOOGLE_API_KEY=... node scripts/sync-calendar.mjs
node scripts/build.mjs
python3 -m http.server -d _site 8080
npm test
```
