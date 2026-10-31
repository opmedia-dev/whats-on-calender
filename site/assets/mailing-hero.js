// Latest public parish mailing, presented as an image-led preview within
// the existing Duda hero Mailing tab. No duplicate section heading or controls.
export function mailingHeadline(title = '') {
  const clean = String(title).trim();
  const short = clean.replace(
    /^(?:(?:st\.?\s*john(?:['’]s)?\s+)?parish\s+(?:weekly\s+)?mailing|weekly\s+parish\s+mailing)\s*[-:–—]\s*/i, '',
  ).trim();
  return short || clean;
}

export function renderMailingHero(mailing, { h, preview = false } = {}) {
  if (typeof h !== 'function') throw new TypeError('Rendering helper required');
  if (!mailing?.title || !mailing.url || !Number.isFinite(new Date(mailing.published).getTime())) {
    throw new Error('A valid published mailing is required');
  }
  const date = new Date(mailing.published);
  const published = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
  let photo = '';
  try {
    const u = new URL(mailing.image || '');
    if (u.protocol === 'https:') photo = u.href;
  } catch { /* No artwork supplied: show a clean text-only card. */ }
  const hasImage = Boolean(photo);
  const summary = (mailing.summary || '').trim();

  return h('a', {
    class: `wo-mailing-hero-card ${hasImage ? 'has-image' : 'is-text-only'}`,
    href: mailing.url, target: '_blank', rel: 'noopener noreferrer',
    'aria-label': `Read ${mailing.title}${preview ? ' (demonstration mailing)' : ''}`,
  },
    ...(hasImage ? [h('div', { class: 'wo-mailing-hero-picture' },
      h('img', {
        src: photo, alt: '', loading: 'eager',
        onerror: (event) => {
          const card = event.currentTarget?.closest('.wo-mailing-hero-card');
          if (card) {
            card.classList.remove('has-image');
            card.classList.add('is-text-only');
          }
        },
      }))] : []),
    h('div', { class: 'wo-mailing-hero-copy' },
      h('div', { class: 'wo-mailing-hero-meta' },
        h('time', { datetime: date.toISOString() }, published),
        ...(preview ? [h('span', { class: 'wo-mailing-hero-preview' },
          'Demonstration issue')] : [])),
      h('h2', { class: 'wo-mailing-hero-title' }, mailingHeadline(mailing.title)),
      ...(summary ? [h('p', { class: 'wo-mailing-hero-summary' }, summary)] : []),
      h('span', { class: 'wo-mailing-hero-link' },
        preview ? 'View sample mailing' : 'Read mailing',
        h('span', { 'aria-hidden': 'true' }, '→'))));
}
