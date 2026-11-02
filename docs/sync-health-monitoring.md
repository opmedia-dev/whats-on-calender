# Synchronisation health monitor

This repository uses a separate GitHub Actions workflow to audit the latest completed
main-branch deployment workflow (deploy.yml), not just the request which triggered it.

- A successful run, including an unchanged-data skip, is healthy.
- A failed/cancelled latest completed run, or no success in the past 60 minutes, is unhealthy.
- After each deployment run and every 15 minutes, the audit runs and reconciles
  the file sync-ok.txt on the monitoring branch.
- The raw file URL returns 200 when healthy and 404 when unhealthy:
  https://raw.githubusercontent.com/REPOSITORY/monitoring/sync-ok.txt
  Replace REPOSITORY with the owner/repo, such as opmedia-dev/flipbook.
- This marker lives outside main, so changing it does not trigger a Pages build.
- Cron-job.org: create a GET job for the raw URL every 5-15 minutes, verify
  that a missing file reports 404, enable failure/recovery notifications, then
  add it as a Status Monitor.
- Do not monitor the GitHub workflow badge alone: SVG badge URLs return HTTP
  200 even when a workflow has failed.

Operational limits: workflow_run and GitHub scheduled audit execution rely on
GitHub Actions being available; if both stop, the marker may remain stale.
A check detects failure when the audit itself runs. API or permission errors
also fail the auditor and are visible in the Actions tab. The monitor reflects
workflow completion, not independent verification of third-party data correctness.
