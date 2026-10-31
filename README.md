# What's On

Four What's On event embeds and two independent mailing embeds (latest mailing hero and archive) for a Duda site (or any site), built from a public Google Calendar and Mailchimp RSS feed.
Hosted for free on GitHub Pages, so there's no server to run.

| Page | Embed |
| --- | --- |
| `timetable.html` | Compact seven-row weekly agenda for a 593×434px desktop slot; no oversized day cards, thumbnails or internal scrollbar; today highlighted |
| `mailing-hero.html` | Latest mailing image and issue strip within the existing Duda Mailing tab, 593×434px; text fallback when no suitable image is available |
| `banner.html` | "What's happening": rotating event cards plus a fixed weekly mailing and fixed latest parish magazine |
| `whats-on.html` | What's On page: regular (repeating) events, search, a card grid and full event details |
| `calendar.html` | Monthly calendar with Today/prev/next, a Month/List switch and "+N more" for busy days; switches to a list on phones |
| `mailings.html` | Independent, searchable Parish Weekly Mailings archive (links open on Mailchimp) |
| `index.html` | Embed codes to copy into Duda, plus notes for editors |

The event embeds can open an event's **detail view**, which shows:

- the header image or poster
- the date and time, and the repeat pattern ("Second Monday of each month, 7.30pm")
- the location, with a map link
- the formatted description
- a contact box with the emails and phone numbers found in the description
- downloads (attached PDFs and other files)
- the next dates of a repeating event
- Add to Google, Apple or Outlook calendar, and Share

Live site: https://opmedia-dev.github.io/whats-on-calender/

## Weekly Mailchimp mailing (independent of Duda)

The latest **sent** campaign from the public Mailchimp RSS feed appears as a **fixed card**
in `banner.html` (default `mailing=1`) and as an **independent, single-card hero**
in `mailing-hero.html`, using the same **593×434px** space as the timetable hero.
Past issues appear only in `mailings.html`. Mailings are never inserted into `whats-on.html`,
`calendar.html`, the hero **timetable** or Google Calendar event data. The monthly parish
magazine remains a separate fixed card in the banner.

Configure repository **Settings → Secrets and variables → Actions → Variables →
New repository variable** with the name `MAILCHIMP_RSS_URL` and the exact public
sent-campaign RSS address currently used for the manual Duda blog import.
The scheduled GitHub Action checks the feed approximately every 15 minutes, retains
up to 24 issues, deduplicates by campaign GUID and skips redeployment when unchanged.
If the URL is absent, the preview uses an explicitly labelled **sample mailing**.
The full email opens via the campaign URL supplied by Mailchimp; no Duda
blog import, Mailchimp credentials or subscription/contact data are involved.
The mailing hero and archive are separate, optional embeds, both using the same synced `mailings.json` data.

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

Open <https://opmedia-dev.github.io/whats-on-calender/>, enter your What's On page URL, then
configure **each embed** independently before copying its HTML snippet into a Duda
**HTML** widget. The visual embed generator provides these controls without hand-editing URLs:

- **Shared:** brand colours, font families, corner radius, 12/24-hour clock and excluded titles.
- **Hero timetable:** seven full-width horizontal day rows at the 593×434px desktop size, using a narrow date rail and compact time + event title lines (no thumbnail images or locations). The iframe defaults to **434px**. Empty days are a single subtle line instead of an oversized card. Rows expand naturally on phones; unusually busy days use a counted link to the full agenda rather than silently clipping events.
- **Homepage banner:** heading, featured/all events, cards per page, maximum events,
  **14-day** lookahead (configurable), **8-second** automatic paging (configurable;
  pauses on hover, focus, event detail, hidden tabs and reduced motion), latest
  weekly mailing toggle, and optional alternate HTTPS magazine-preview URL.
  With the magazine enabled,
  the banner lays out two rotating event cards, the fixed latest weekly mailing,
  and the fixed latest magazine as four equal-width columns. Both publications
  stay visible as the event pages change. The cards match height and typography. The cover comes
  from the flipbook's published `issues.json` and opens the complete flipbook.
- **Weekly Mailing Hero:** a 593×434px content-only preview intended for the existing **Duda Mailing hero tab**, which already provides its own section heading, tabs and subscription controls. A genuine image from the sent Mailchimp issue fills the top of the embed; the issue title, date and small Read mailing link sit below it. Without a suitable image, a clean text-led fallback shows the issue excerpt. No redundant masthead, additional heading, subscription button or decorative illustration is inserted. Mobile height adapts and preview content is labelled.
- **Weekly Mailings:** searchable independent archive of sent Mailchimp campaigns.
- **What's On page:** regular events row, search, filters, default tab, grid columns and page size.
- **Monthly calendar:** grid/list/automatic view, events per day and minimum cell height.

The magazine column is a banner-only integration with the separate `flipbook` repository;
it is not embedded into the standalone What's On page or monthly calendar.

The detail view's Back button always returns to its own timetable, banner or events list (instead of stepping backwards through future dates in a repeating event).

A timed event disappears from *upcoming* lists after its actual end time, while events in progress
remain visible. The monthly calendar continues to display events on their scheduled dates.

The snippet's script does three things:

- sizes **all six iframes** to the actual content height, both up and down:
  mobile wrapping, the calendar's mobile agenda list, banner paging, mailing
  archive searches, and opening/closing event details are all accommodated
- scrolls the embed into view when an event opens
- on the What's On page, keeps `?event=<id>` in the address bar, so shared links and clicks from
  the timetable, banner or calendar open that event

**Duda sizing:** use the complete generated HTML snippet for each embed (iframe
**and** its message listener), and make the containing Duda row/section
content-sized rather than fixed shorter than the widget. Duda only runs widget
scripts on the **site preview and published site**, so the editor can still show
a temporary fixed-height frame. Check desktop, tablet and mobile in site Preview
before publishing. If you installed an earlier embed snippet, recopy it from
the current GitHub Pages generator; an updated iframe alone cannot fix an
outdated host message listener.

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
| `cardLocation` | `cardLocation=0` | Hide the location line on cards |
| `only` / `exclude` | `exclude=rehearsal,booking` | Only show / hide events whose titles contain these words |
| `colors` | `colors=3,10` | Only events with these Google Calendar colour IDs (`0` = default colour) |
| `contacts` | `contacts=0` | Hide the Contact box in details |
| `backText` | `backText=Back` | Detail view's back button label |

`timetable.html`: `days` (7; generator allows 1–7), `heroHeight` (434px), `compact=1` (default compact hero), `compact=0` (legacy roomy agenda), `maxHeight` (legacy agenda only), `location=0` (legacy agenda only),
`highlightToday=0`, `featured=1` (only events with pictures), `moreLink` + `moreText` (link
under the list), `emptyText`.

`mailing-hero.html`: Shows **only the mailing preview content**, designed to replace the existing card inside the Duda Mailing hero tab (not the tab header or Subscribe action). It uses the first suitable HTTPS campaign image from Mailchimp RSS as a wide top image, followed by the latest issue's date, title and unobtrusive Read mailing link. If no image is available, it shows an excerpt instead of stock artwork. Desktop canvas **593×434px**, mobile content-sized. The original Mailchimp mailing opens on click. Requires no integration beyond `MAILCHIMP_RSS_URL`; does not change the banner or mailing archive.

`banner.html`:

- `title` (`0` hides it)
- `perPage` (3, fewer on narrow screens), `max` (9), `minCardWidth` (240)
- `show=all` (include events without pictures), `days` (14 by default, 1–90 permitted)
- `autoplay` (8 seconds by default, `0` disables; 3–60 seconds permitted)
- `mailing=0` hides the fixed latest sent weekly mailing card. With both publications enabled, only two event cards rotate at a time. The mailing archive is a separate optional embed; no archive button is shown beneath the carousel.
- `style=plain` (no colour band), `ratio=4:3`
- `moreLink` + `moreText` ("See all events" link beside the pager; defaults to `link`, `moreText=0` hides it)
- `flipbook=1`, `flipbookUrl`, `flipbookLink` (archive page passed to the full reader), `flipbookTitle` ("Latest magazine"). The banner shows a **cover card** using the latest issue image/title from the flipbook's `issues.json`. Clicking it opens the full interactive reader in a separate tab. Magazine width is automatically matched to the event cards; old `flipbookWidth` and `flipbookHeight` options are ignored.

`whats-on.html`:

- `regular=0` (hide the regular events row), `regularTitle` ("Regular events"), `regularMax` (6), `moreText` ("More info")
- `upcomingTitle` ("Coming up"); `0` hides a title
- `filters=0` (hide the Highlights / This week / This month / All events buttons), `filter=week` (start on another tab)
- `summary=0` (no description excerpt on cards)
- `search=0`, `searchText`
- `perPage` (9), `cols` (3), `minCardWidth` (260)
- `show=all`, `style=band`, `ratio`, `emptyText`

Searching always covers every upcoming event.

`calendar.html`: `view` (`auto` = Month/List switch and a list on phones, `grid` or `list`), `month=2026-12`,
`maxPerDay` (3), `cellHeight` (128), `dots=1` (colour events with their Google Calendar colour),
`moreText`/`lessText`, `earlierText`.

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

## Pre-rollout testing without a Google API key

GitHub Pages can publish **demonstration content** when `GOOGLE_API_KEY` has
not been configured. This is the intended first-rollout experience:

1. Merge the implementation PRs into `main` and enable GitHub Pages using
   **GitHub Actions** as the source.
2. On a push to `main`, or by manually running **Build and deploy What's On**,
   the workflow generates example events from `scripts/preview-data.mjs`.
3. Open the GitHub Pages homepage (embed generator) and the standalone preview pages. No Duda HTML widget or Google API key is
   needed to preview appearance, recurrence, posters, contacts and downloads.
4. All sample views show a conspicuous **PREVIEW MODE** notice. Nothing in
   this demo feed is an actual event.

When a valid `GOOGLE_API_KEY` repository secret is added, subsequent runs switch
automatically to Google Calendar content. If the key exists but the Calendar API
fails, the deployment **fails instead of silently using sample events**.
Do not embed the preview in the public parish website. The preview mode is not
a validation of Google Calendar or Drive API access: live sync, attachment
permissions and event accuracy need separate testing.
