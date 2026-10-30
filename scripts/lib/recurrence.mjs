// Plain-English summaries of Google Calendar RRULEs, e.g.
// "RRULE:FREQ=MONTHLY;BYDAY=2MO" -> "Second Monday of each month".
const DAYS = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' };
const ORDINALS = { 1: 'First', 2: 'Second', 3: 'Third', 4: 'Fourth', 5: 'Fifth', '-1': 'Last', '-2': 'Second to last' };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function parseRrule(lines = []) {
  const line = lines.find((l) => /^RRULE:/i.test(l));
  if (!line) return null;
  const rule = {};
  for (const part of line.slice(6).split(';')) {
    const [k, v] = part.split('=');
    if (k && v) rule[k.toUpperCase()] = v;
  }
  return rule;
}

function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

function nth(n) {
  const v = Math.abs(n) % 100;
  const s = v >= 11 && v <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[v % 10] || 'th');
  return `${n}${s}`;
}

function parseByDay(byday) {
  return (byday || '').split(',').filter(Boolean).map((d) => {
    const m = d.match(/^([+-]?\d+)?([A-Z]{2})$/);
    return m ? { pos: m[1] ? Number(m[1]) : null, day: DAYS[m[2]] } : null;
  }).filter((d) => d?.day);
}

// `start` is the series start ("2026-03-15T09:45:00Z" or "2026-03-15"), used when
// the rule leaves the day implicit (e.g. FREQ=WEEKLY with no BYDAY).
export function describeRecurrence(lines, start, timeZone = 'Europe/London') {
  const rule = parseRrule(lines);
  if (!rule) return null;
  const interval = Number(rule.INTERVAL || 1);
  const startDate = start ? new Date(start.length === 10 ? `${start}T12:00:00Z` : start) : null;
  const startDay = startDate && new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(startDate);
  const startDom = startDate && Number(new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone }).format(startDate));
  const startMonth = startDate && Number(new Intl.DateTimeFormat('en-GB', { month: 'numeric', timeZone }).format(startDate)) - 1;
  const byday = parseByDay(rule.BYDAY);
  const every = (unit, plural) => (interval === 1 ? `Every ${unit}` : interval === 2 ? `Every other ${unit}` : `Every ${interval} ${plural}`);

  switch (rule.FREQ) {
    case 'DAILY':
      return interval === 1 ? 'Daily' : `Every ${interval} days`;
    case 'WEEKLY': {
      const days = byday.length ? byday.map((d) => d.day) : [startDay].filter(Boolean);
      const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      if (interval === 1 && days.length === 5 && weekdays.every((d) => days.includes(d))) return 'Every weekday';
      if (interval === 1) return `Every ${list(days)}`;
      return `${every('week', 'weeks')} on ${list(days)}`;
    }
    case 'MONTHLY': {
      const suffix = interval === 1 ? 'of each month' : interval === 2 ? 'of every other month' : `of every ${interval} months`;
      const positioned = byday.filter((d) => d.pos != null);
      if (positioned.length) {
        const pos = Number(rule.BYSETPOS || 0);
        const parts = positioned.map((d) => `${ORDINALS[d.pos] || nth(d.pos)} ${d.day}`);
        if (parts.length === 1 && !pos) return `${parts[0]} ${suffix}`;
        return `${list(parts)} ${suffix}`;
      }
      if (byday.length && rule.BYSETPOS) {
        return `${ORDINALS[rule.BYSETPOS] || nth(Number(rule.BYSETPOS))} ${list(byday.map((d) => d.day))} ${suffix}`;
      }
      const dom = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : [startDom].filter(Boolean);
      if (!dom.length) return interval === 1 ? 'Monthly' : `Every ${interval} months`;
      const label = dom.map((d) => (d === -1 ? 'last day' : nth(d)));
      return `${label.length === 1 && dom[0] === -1 ? 'Last day' : `The ${list(label)}`} ${suffix}`;
    }
    case 'YEARLY': {
      const month = rule.BYMONTH ? Number(rule.BYMONTH.split(',')[0]) - 1 : startMonth;
      const dom = rule.BYMONTHDAY ? Number(rule.BYMONTHDAY.split(',')[0]) : startDom;
      const positioned = byday.find((d) => d.pos != null);
      const when = positioned && month != null
        ? `the ${(ORDINALS[positioned.pos] || nth(positioned.pos)).toLowerCase()} ${positioned.day} of ${MONTHS[month]}`
        : month != null && dom ? `${dom} ${MONTHS[month]}` : null;
      const base = interval === 1 ? 'Every year' : `Every ${interval} years`;
      return when ? `${base} on ${when}` : base;
    }
    default:
      return null;
  }
}

// Combines the summaries of several series with the same title, e.g. Toddler
// Group on Tuesdays and Thursdays held as two series -> "Every Tuesday and Thursday".
export function mergeRecurrenceTexts(texts) {
  const unique = [...new Set(texts.filter(Boolean))];
  const weekly = unique.map((t) => t.match(/^Every ((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:(?:, | and )(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))*)$/));
  if (unique.length > 1 && weekly.every(Boolean)) {
    const order = Object.values(DAYS);
    const days = [...new Set(weekly.flatMap((m) => m[1].split(/, | and /)))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return `Every ${list(days)}`;
  }
  return unique.join('; ') || null;
}
