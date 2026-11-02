# Private What's On Event Manager — first milestone

This is an **alternative interface for editing the existing St John the Baptist, Old Malden Google Calendar**. It is not a new calendar data store, and it is not hosted by GitHub Pages when used for live editing.

- **Live editing runtime:** Google Apps Script web app, using the Google Calendar Advanced service.
- **Source control:** `admin/apps-script/Code.gs`, `Index.html`, and `appsscript.json` in this GitHub repository.
- **Pre-rollout demonstration:** `site/admin-demo.html` on GitHub Pages. It contains only sample events and **cannot save/delete**.
- **Existing public embeds:** unchanged. Public `events.json` gains `category` and `categorySource` properties without changing image-led featured-event selection.
- **Current workflow:** month/week calendar, click a day to create an event, click an event to edit it; form and live placeholder preview side-by-side above 930px, stacked on smaller screens. No special description tags and no featured checkbox.
- **Not in this milestone:** image upload, rich-text WYSIWYG, full recurrence editor, attendee management, approval workflow, and final public category-placeholder rendering. The preview is a design concept until the latter is implemented.

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
4. Enable **Google Calendar API** as an **Advanced Google service** in that Apps Script project. Use the manifest in this repository and upload `Code.gs` and `Index.html`.
5. Create a **Web app deployment** under **Deploy → New deployment** with **Execute as: User accessing the web app**. For a Google Workspace parish with all editors in the same domain, restrict access to the domain; otherwise require signed-in Google users and enforce the calendar-role check as the backend already does.
6. Test with an authorised editor and a viewer-only account. The viewer-only user must be unable to read or edit events from the private calendar interface.
7. Do not give volunteers direct access to the raw Google Calendar UI unless they need it for exceptional administrative work. The editor will use the same source calendar.

## GitHub-based deployment (optional after the initial Google setup)

The repository includes **Publish private What's On editor**, a manually triggered GitHub Actions workflow (`.github/workflows/deploy-admin-editor.yml`). It **will not run automatically** on merges, and requires secrets configured in the GitHub Actions environment `calendar-editor`.

Before using it, enable the **Google Apps Script API** for the authorised deployment account at <https://script.google.com/home/usersettings> and authenticate the Google `clasp` CLI locally. Generate a local `.clasp.json` like:

```json
{
  "scriptId": "THE_REAL_APPS_SCRIPT_PROJECT_ID",
  "rootDir": "admin/apps-script"
}
```

**Do not commit `.clasp.json` or `.clasprc.json`.** The workflow reads three GitHub Actions *secrets* from the `calendar-editor` environment:

| Secret | Purpose |
| --- | --- |
| `APPS_SCRIPT_CLASPRC_JSON` | JSON contents of the local `~/.clasprc.json` created during `clasp login`. Contains highly sensitive **deployment** OAuth credentials. |
| `APPS_SCRIPT_CLASP_JSON` | JSON contents of the local `.clasp.json` pointing at the Apps Script project and source folder. |
| `APPS_SCRIPT_DEPLOYMENT_ID` | Existing versioned Web app deployment ID, created via Google initially. |

Then run **Actions → Publish private What's On editor → Run workflow**. It validates tests, pushes only the `admin/apps-script` code, and updates the existing versioned web-app deployment without changing its URL. Use GitHub **environment approvals** if multiple maintainers can run deployment workflows.

These secrets are **not the parish administrators' login credentials**. They let GitHub upload trusted code to Google; editors still authenticate individually when using the resulting web app.

## Editing behaviour and safeguards

- Dates and times use `Europe/London`; Google Calendar remains authoritative for all event times and series.
- Event categories are written to the Google event's **shared extended property** `woCategory` (one of: general, worship, community, music, families, heritage, fundraising). No visible description tag is required.
- Existing events without metadata get a conservative suggested category; a volunteer can change it explicitly. Unknown titles default to General.
- Existing HTML-rich descriptions are **not rewritten** when a user only changes other fields. Editing one in this first version warns that formatting may be replaced; a rich-text editor is a later milestone.
- For recurring events, the user must choose **this occurrence** or **entire series**. Complex rules can be retained, rather than replaced with an incorrect simplified pattern.
- Saves and deletes check the event's revision and use a script-wide lock to prevent two concurrent editor writes. This is not a fully atomic conditional write against changes made directly in Google Calendar; verify with real accounts before rolling out broadly.
- Deletion is confirmation-gated. Calendar API write operations use `sendUpdates: none`; this first milestone does **not** manage meeting invitations or notify attendees.
- Newly saved or deleted events should appear in the public What's On embeds after the existing scheduled GitHub Actions sync (normally around 15 minutes), not instantaneously.
- The desktop layout has a **full-width month/week calendar**, then **left-side form + right-side preview**. On tablet/phone widths, these panels stack naturally.

## Verification before rollout

1. Review <https://opmedia-dev.github.io/whats-on-calender/admin-demo.html> after the branch is merged and Pages deployed. It is a sample-only, no-OAuth visual preview.
2. Deploy the Google Apps Script web app separately using an authorised account.
3. Test a standalone event, an all-day event, a weekly recurring series, an edited single occurrence, a full-series edit, and deleting an event.
4. Confirm that read-only Google accounts cannot use the editor to read or change calendar data.
5. Check the date/time of an event across GMT/BST boundaries and confirm the public site sync.
6. Keep the parish Google Calendar as a recovery point until the new editing interface has passed these acceptance tests.

Useful Google documentation: <https://developers.google.com/apps-script/guides/web>, <https://developers.google.com/apps-script/concepts/deployments>, and <https://developers.google.com/apps-script/guides/clasp>.
