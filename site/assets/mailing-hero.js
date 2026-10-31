// Editorial-style latest mailing panel, using the same public Mailchimp
// metadata as the banner and the archive. A campaign photo is optional.
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
    timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric',
  }).format(date);
  const summary = (mailing.summary || '').trim();
  let photo = '';
  try {
    const url = new URL(mailing.image || '');
    if (url.protocol === 'https:') photo = url.href;
  } catch { /* A missing photo is fine: use the typographic layout. */ }
  const hasImage = Boolean(photo);

  return h('a', {
    class: `wo-mailing-hero-card ${hasImage ? 'has-image' : 'is-text-only'}`,
    href: mailing.url, target: '_blank', rel: 'noopener noreferrer',
    'aria-label': `Read ${mailing.title}${preview ? ' (demonstration mailing)' : ''}`,
  },
    h('div', { class: 'wo-mailing-hero-copy' },
      h('header', { class: 'wo-mailing-hero-masthead' },
        h('span', { class: 'wo-mailing-hero-identity' },
          h('strong', {}, 'St John the Baptist'),
          h('span', {}, 'Old Malden')),
        h('span', { class: 'wo-mailing-hero-series' }, 'Parish weekly mailing')),
      h('div', { class: 'wo-mailing-hero-article' },
        h('div', { class: 'wo-mailing-hero-meta' },
          h('time', { datetime: date.toISOString() }, published),
          preview ? h('span', { class: 'wo-mailing-hero-preview' }, 'Demonstration issue') : null),
        h('h2', { class: 'wo-mailing-hero-title' }, mailingHeadline(mailing.title)),
        summary ? h('p', { class: 'wo-mailing-hero-summary' }, summary) : null),
      h('footer', { class: 'wo-mailing-hero-footer' },
        h('span', { class: 'wo-mailing-hero-link' },
          preview ? 'View sample mailing' : 'Read the full mailing',
          h('span', { 'aria-hidden': 'true' }, '→')))),
    hasImage ? h('div', { class: 'wo-mailing-hero-picture' },
      h('img', {
        src: photo, alt: 'Image from this parish mailing', loading: 'eager',
        onerror: (event) => {
          const card = event.currentTarget?.closest('.wo-mailing-hero-card');
          if (card) {
            card.classList.remove('has-image');
            card.classList.add('is-text-only');
          }
        },
      })) : null);
}
