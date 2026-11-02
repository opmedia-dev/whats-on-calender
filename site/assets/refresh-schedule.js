// External cron-job.org triggers at UTC minutes 03, 18, 33 and 48.
// GitHub Actions keeps its native quarter-hour schedule as a fallback.
// This estimates the next external trigger, not workflow completion.
const INTERVAL_MS = 15 * 60 * 1000;
const OFFSET_MS = 3 * 60 * 1000;

export function nextScheduledCheck(now = Date.now()) {
  if (!Number.isFinite(now)) throw new TypeError('Expected a finite timestamp');
  return (Math.floor((now - OFFSET_MS) / INTERVAL_MS) + 1) * INTERVAL_MS + OFFSET_MS;
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
