# Private What's On Event Manager — first milestone

This is an **alternative interface for editing the existing St John the Baptist, Old Malden Google Calendar**. It is not a new calendar data store, and it is not hosted by GitHub Pages when used for live editing.

- **Live editing runtime:** Google Apps Script web app, using the Google Calendar Advanced service.
- **Source control:** `admin/apps-script/Code.gs`, `Index.html`, and `appsscript.json` in this GitHub repository.
- **Pre-rollout demonstration:** `site/admin-demo.html` on GitHub Pages. It contains only sample events and **cannot save/delete**.
- **Existing public embeds:** banner event slots and What's On Highlights now use explicit `woFeatured` metadata, rather than inferring it from a header image.
- **Current workflow:** month/week calendar, click a day to create an event, click an event to edit it; form and live placeholder preview side-by-side above 930px, stacked on smaller screens. No special description tags; a dedicated Featured checkbox controls banner and Highlights placement.
- **Still under development:** final production tests of rich-text authoring, Google Drive image/PDF/document uploads, complicated historical recurrence patterns, attendee management and public category-placeholder rendering. The preview is a design concept until the publishing change is implemented.

## Google OAuth, authentication and hosting

An API key does **not** grant write access to Google Calendar. Editing requires user-authorised Google OAuth. The existing `GOOGLE_API_KEY` GitHub secret stays for read-only scheduled publishing.

Google Apps Script provides the small server-side runtime **and** the Google login/consent mechanism. We do not need to rent another backend or store each parish editor's OAuth refresh token in GitHub.

The Apps Script manifest sets:

- `webapp.executeAs = USER_ACCESSING`: operations run as the signed-in user, not as the script owner's privileged Google account.
- `webapp.access = ANYONE`: any signed-in Google account can reach the sign-in page, but **every calendar read/write function independently checks** the Google Calendar `CalendarList.accessRole` is `writer` or `owner`. No anonymous access and no privilege based only on knowing the URL. If all editors use one Google Workspace domain, change access to `DOMAIN` for tighter access.
- Explicit scopes: `calendar.events` and `calendar.calendarlist.readonly`. Google may ask administrators to grant these permissions on first use.

Do not set `executeAs` to the deployment owner for a multi-user editor. That would give everyone visiting the web app the owner's permissions.

**Google OAuth verification:** If editors use unrelated personal Gmail accounts or accounts outside the owner's Google Workspace domain, Google may show an unverified-app warning and impose test-user limits. A production rollout may require configuring and verifying the OAuth consent screen/Google Cloud project. Avoid asking nontechnical volunteers to bypass security warnings; finish the correct account/consent setup first. An app used internally by one Google Workspace domain can have a simpler process.

## Initial configuration (one time, by the calendar owner)

1. Confirm the parish calendar ID in `config.json` and `EDITOR_CALENDAR_ID` in `Code.gs` are the same. They currently refer to the pre-existing parish calendar.
2. Share the parish calendar with each authorised editor, granting **Make changes to events** (Google Calendar's `writer` role), not just viewer rights. One account should retain owner-level administration.
3. Open <https://script.google.com/> using the chosen long-lived parish/organisation account, create a new **standalone Apps Script** project and name it e.g. `St John's What's On Editor`.
4. Enable **Google Calendar API and Google Drive API** as **Advanced Google services** in that Apps Script project. Use the manifest in this repository and add `Code.gs` and `Index.html` in the browser. Configure the parish's attachment folder ID in `Code.gs` before enabling uploads.
5. Create a **Web app deployment** under **Deploy → New deployment** with **Execute as: User accessing the web app**. For a Google Workspace parish with all editors in the same domain, restrict access to the domain; otherwise require signed-in Google users and enforce the calendar-role check as the backend already does.
6. Test with an authorised editor and a viewer-only account. The viewer-only user must be unable to read or edit events from the private calendar interface.
7. Do not give volunteers direct access to the raw Google Calendar UI unless they need it for exceptional administrative work. The editor will use the same source calendar.

## Deploy entirely in a browser (recommended)

**Nothing is installed on the parish desktops or an administrator's computer.**
Creating the Google Apps Script project and publishing its initial web-app
deployment can be done at <https://script.google.com/> using the website's
editor and **Deploy → New deployment → Web app**.

For later code updates, open the same Apps Script project, update the
versioned source from the approved GitHub PR and use **Deploy → Manage
deployments → Edit → New version**. The web-app URL remains stable. None
of this requires a terminal, Node.js or `clasp`.

For attachments, nominate a parish-controlled Google Drive folder shared
with the editors (permission to add files). Set its **folder ID** as
`EDITOR_UPLOAD_FOLDER_ID` in `Code.gs`, then enable the advanced Google
Drive API service alongside Calendar. Uploads are limited to 8 MB each and
supported image, PDF, Word, Excel and text files; uploaded assets are made
viewable to anyone with their link because the public site must show them.
**Never upload private or confidential documents.** The app requests a
Drive OAuth scope in addition to Calendar access. Editors should confirm
that this scope is acceptable for the parish's Google account policy.

### Optional automatic deployment from GitHub (advanced, not required)

The separately included workflow **Publish private What's On editor**
can upload source updates from GitHub Actions to the existing Apps Script
deployment. The actual `clasp` CLI then runs in **GitHub's cloud runner**,
not on a parish computer. This still requires an initial secure setup of
Google OAuth deployment credentials, script ID and deployment ID. Those
credentials must be stored only in the `calendar-editor` GitHub Actions
environment secrets:

- `APPS_SCRIPT_CLASPRC_JSON`: deployer's OAuth credentials
- `APPS_SCRIPT_CLASP_JSON`: script project ID and source directory
- `APPS_SCRIPT_DEPLOYMENT_ID`: existing web-app deployment ID

The current workflow does not establish those credentials from scratch.
They are normally provisioned via a separate authorised CLI login, which
**may require an administrator's trusted machine during setup**. Since
the parish cannot install software, **do not use this option initially**.
Use the browser-only deployment and update workflow above instead.
Neither option requires installations on the editor users' desktops.

## Editing behaviour and safeguards

- Dates and times use `Europe/London`; Google Calendar remains authoritative for all event times and series.
- Event categories are written to the Google event's **shared extended property** `woCategory` (one of: general, worship, community, music, families, heritage, fundraising). No visible description tag is required.
- Existing events without metadata get a conservative suggested category; a volunteer can change it explicitly. Unknown titles default to General.
- Existing HTML-rich descriptions are **not rewritten** unless changed. The editor now has a limited rich-text toolbar (bold, italic, lists and safe links), with HTML sanitisation before preview and save.
- For recurring events, the user must choose **this occurrence** or **entire series**. Complex rules can be retained, rather than replaced with an incorrect simplified pattern.
- Saves and deletes check the event's revision and use a script-wide lock to prevent two concurrent editor writes. This is not a fully atomic conditional write against changes made directly in Google Calendar; verify with real accounts before rolling out broadly.
- Deletion is confirmation-gated. Calendar API write operations use `sendUpdates: none`; this first milestone does **not** manage meeting invitations or notify attendees.
- Newly saved or deleted events should appear in the public What's On embeds after the existing scheduled GitHub Actions sync (normally around 15 minutes), not instantaneously.
- The desktop layout has a **full-width month/week calendar**, then **left-side form + right-side preview**. On tablet/phone widths, these panels stack naturally.

## Choosing header images and listing/gallery images

The public system previously made the **first attached picture** the event
header automatically. That behaviour is retained **only as the fallback for
legacy events** without an explicit choice.

- **Save the new event first**, then upload images from the editor using the
  `Image placement` selector: **Use as event header** or **Add to
  listing/gallery**. PDF/Word/Excel/text files remain under Downloads.
- **When an image is selected in the editor**, Save event now saves the calendar data and uploads the selected image together. The operation reports separate calendar/save/upload results, preserves the selected file on failure, and restores controls even if refresh fails. Drive upload requires `EDITOR_UPLOAD_FOLDER_ID` to be set in the Apps Script source and a new web-app deployment version.
- **Faster uploads:** the editor now offers an enabled-by-default **Optimise large pictures** option. JPEG/PNG/WebP files of 700 KB or more can be converted to a smaller WebP copy (longest side at most 2400px) in the browser before transfer. The local original is untouched. Untick to upload the exact original; GIFs and documents are unchanged. Compression falls back to the original when not supported or not beneficial.
- **Reposition an image** in the editor's card preview by dragging it or using the horizontal/vertical sliders; the crop centre is stored as `woImageFocus` (two 0–100 percentages). The public banner, listing and regular-event cards reproduce the crop. The full image in event detail remains unchanged.
- For an existing event with several images, select **Use as header** beside
  any image in the attachment list, then press **Save event**. The selection is
  stored in Google Calendar's shared `woHeaderImageId` property, referencing
  a Drive file attached to **that specific event**.
- Select **Listing images only — no header** to use the category text
  placeholder while still publishing photos in the detail-page gallery. A
  gallery-only first upload does not silently become a header.
- **Feature this event** is independent of the header/gallery selection. It stores `woFeatured=true` or `false` as a shared Google Calendar event property. Only marked events appear in banner event slots and the What's On Highlights filter. Other events remain in the full listings, timetable and calendar. For recurring series, choose **Entire series** to feature future dates, or **This date only** for an exception.
- Events without a featured property are **not** automatically featured, even if they have an image.
- Draft file selections are local to the open event. Closing without saving,
  switching events or resetting clears their file input, temporary preview and
  browser object URL. The read-only demo can preview a chosen local picture
  without uploading it anywhere.
- On the public event detail page, the selected header appears at the top,
  other attached images appear in **More event photos**, and non-image files
  appear in **Downloads**.
- Always review photo and attachment permissions: uploaded files are made
  publicly link-viewable so visitors can see them on the website.

**Deployment caution:** the OAuth/Calendar/Drive functions still require a
real parish test calendar and Drive folder for end-to-end validation. The
downloadable editor demo proves browser UI state, not live Google uploads.

## Verification before rollout

1. Download the latest `whats-on-editor-ui-demo` artifact from the successful draft-PR validation run. This is an updated sample-only, no-OAuth visual preview.
2. Deploy the Google Apps Script web app separately using an authorised account.
3. Test a standalone event, an all-day event, a weekly recurring series, an edited single occurrence, a full-series edit, and deleting an event.
4. Confirm that read-only Google accounts cannot use the editor to read or change calendar data.
5. Check the date/time of an event across GMT/BST boundaries and confirm the public site sync.
6. Keep the parish Google Calendar as a recovery point until the new editing interface has passed these acceptance tests.

Useful Google documentation: <https://developers.google.com/apps-script/guides/web>, <https://developers.google.com/apps-script/concepts/deployments>, and <https://developers.google.com/apps-script/guides/clasp>.
