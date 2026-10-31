// Standalone weekly mailing hero, reusing the same public Mailchimp metadata
// as the homepage banner and mailing archive. No separate feed or API calls.
export function renderMailingHero(mailing, { h, icon, preview = false } = {}) {
  if (typeof h !== 'function' || typeof icon !== 'function') throw new TypeError('Rendering helpers required');
  if (!mailing || !mailing.title || !mailing.url || !Number.isFinite(new Date(mailing.published).getTime())) {
    throw new Error('A valid published mailing is required');
  }
  const published = new Date(mailing.published);
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric',
  }).format(published);
  const summary = (mailing.summary || '').trim();
  return h('a', {
    class: 'wo-mailing-hero-card',
    href: mailing.url,
    target: '_blank',
    rel: 'noopener noreferrer',
    'aria-label': `Read ${mailing.title}${preview ? ' (demonstration mailing)' : ''}`,
  },
    h('div', { class: 'wo-mailing-hero-top' },
      h('span', { class: 'wo-mailing-hero-kicker' }, icon('mail'), 'Parish weekly mailing'),
      h('time', { class: 'wo-mailing-hero-date', datetime: published.toISOString() }, formatted)),
    preview ? h('span', { class: 'wo-mailing-hero-demo' }, 'Sample issue — not a real mailing') : null,
    h('div', { class: 'wo-mailing-hero-content' },
      h('span', { class: 'wo-mailing-hero-eyebrow' }, 'This week’s news'),
      h('h2', { class: 'wo-mailing-hero-title' }, mailing.title),
      summary ? h('p', { class: 'wo-mailing-hero-summary' }, summary) : null),
    h('div', { class: 'wo-mailing-hero-footer' },
      h('span', { class: 'wo-mailing-hero-cta' }, preview ? 'View sample mailing' : 'Read this week’s mailing', icon('arrow')),
      h('span', { class: 'wo-mailing-hero-footnote' }, 'Opens the complete mailing')));
}
