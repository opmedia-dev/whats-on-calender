# External 15-minute refresh scheduler — What's On

## Why
GitHub Actions declares `cron: '*/15 * * * *'`, but actual GitHub `schedule`
events have appeared several hours apart. GitHub explicitly warns that timed
runs may be delayed or dropped. Keep GitHub's own cron as a fallback; use an
independent scheduler to call the existing workflow via its documented API.

**This documentation does not activate a scheduler or grant any account access.**
The repo owner must configure an external service and a restricted credential.

## Suggested simple option: cron-job.org

1. Generate a **fine-grained GitHub personal access token** under GitHub
   Settings → Developer settings → Personal access tokens. Limit it to the
   `opmedia-dev/whats-on-calender` and `opmedia-dev/flipbook` repositories,
   grant only **Actions: Read and write** plus the mandatory metadata permission,
   and choose a sensible expiration. Never commit it, paste it into an issue or
   send it in a support chat.
2. On <https://cron-job.org/>, create a job named `What's On 15-minute sync`.
   Use **HTTP POST** with URL:

   `https://api.github.com/repos/opmedia-dev/whats-on-calender/actions/workflows/deploy.yml/dispatches`

3. Schedule every 15 minutes. If the interface supports minute selection,
   choose UTC minutes **03, 18, 33, 48** to avoid the top-of-hour/quarter-hour
   congestion and stagger away from the flipbook. Use the service's normal
   every-15-minutes option otherwise.
4. Configure request headers, entering the token only in the service's
   private settings:

   ```http
   Authorization: Bearer YOUR_RESTRICTED_TOKEN
   Accept: application/vnd.github+json
   X-GitHub-Api-Version: 2026-03-10
   Content-Type: application/json
   ```

5. Set the exact JSON request body:

   ```json
   {"ref":"main","inputs":{"force":"false","source":"external-cron"}}
   ```

6. Save and trigger one **test** request. GitHub's workflow dispatch API
   typically returns **204 No Content** on success. This acknowledges queuing,
   not successful data synchronisation or deployment. Verify the resulting run
   in <https://github.com/opmedia-dev/whats-on-calender/actions/workflows/deploy.yml>:
   it should be marked `workflow_dispatch` and carry the `external-cron`
   run name. Check the sync steps for success.
7. Set cron-job.org failure notifications and review its history after 24 hours.
   Arrange token renewal before expiry; expired tokens cause HTTP 401/403.

### Why the workflow was adjusted
A normal manual `workflow_dispatch` or a push publishes immediately. The new
`source=external-cron` input makes an externally started run use exactly the
same **Google Calendar + Mailchimp change detection** as the GitHub `schedule`
event. In particular, it sets `SITE_URL` so existing published data can be
compared, and avoids republishing unchanged events and mailings every 15 minutes.

GitHub's existing native schedule remains enabled as a fallback. Occasional
duplicate checks are harmless; the existing `pages` concurrency protection
serialises builds, while content checks skip unnecessary Pages deployments.

### Safety and limits
- Never place tokens in site HTML, query strings, commit history, public
  variables, or the cron job's URL. Use an HTTPS **Authorization header**.
- cron-job.org is an independent third party that must hold the restricted token.
  If this is unsuitable, use a secret-backed scheduler (for example a
  Cloudflare Worker Cron Trigger) instead.
- The countdown on the embed management page and Event Manager still predicts
  scheduled slots, **not actual execution**. Check GitHub Actions and the
  scheduler's history for completed runs.
- Do not disable GitHub's built-in cron until external triggering has been
  demonstrated reliable over several days. Avoid `force=true` for routine
  automated checks.

## Corresponding flipbook job
Configure a second POST job for
`https://api.github.com/repos/opmedia-dev/flipbook/actions/workflows/deploy.yml/dispatches`
with the same JSON body, preferably at UTC minutes **05, 20, 35, 50**. Both
repositories can share one appropriately restricted token if the token permits
**only** those two repositories.

References:
- <https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event>
- <https://docs.github.com/en/actions/how-tos/troubleshoot-workflows>
- <https://cron-job.org/EN/>
