// Expected schedule for .github/workflows/deploy.yml:
// cron '*/15 * * * *' (GitHub Actions cron uses UTC).
// Predicts a scheduled check, not a guaranteed workflow start or publication.
const INTERVAL_MS = 15 * 60 * 1000;

export function nextScheduledCheck(now = Date.now()) {
  if (!Number.isFinite(now)) throw new TypeError('Expected a finite timestamp');
  return (Math.floor(now / INTERVAL_MS) + 1) * INTERVAL_MS;
}

export function formatRemaining(now, next) {
  const totalSeconds = Math.max(0, Math.ceil((next - now) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + 'm ' + String(seconds).padStart(2, '0') + 's';
}

export function nextRefreshStatus(now = Date.now()) {
  const next = nextScheduledCheck(now);
  return {
    next,
    countdown: formatRemaining(now, next),
    localTime: new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(next)),
  };
}
