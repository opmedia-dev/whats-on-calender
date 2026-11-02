// Used by both the standalone mailing archive and the homepage banner.
// Mailing metadata contains public browser links only; no subscriber data.
export async function loadMailings(fetcher = fetch) {
  const res = await fetcher(new URL('../mailings.json', import.meta.url), { cache: 'default' });
  if (!res.ok) throw new Error(`Mailings unavailable (HTTP ${res.status})`);
  const data = await res.json();
  const mailings = (data.mailings || []).filter((entry) => {
    try { const u = new URL(entry.url); return u.protocol === 'https:' || u.protocol === 'http:'; }
    catch { return false; }
  });
  return { preview: Boolean(data.preview), mailings };
}

export function makeMailingCard(mailing, { preview = false, h, icon }) {
  // Use the same imported cover as the standalone mailing hero. The old card
  // ignored mailing.image and always showed a decorative envelope instead.
  let imageUrl = '';
  try {
    const image = new URL(mailing.image || '');
    if (image.protocol === 'https:') imageUrl = image.href;
  } catch { /* No usable RSS artwork: retain the accessible placeholder. */ }

  const media = h('div', {
    class: `wo-card-media wo-mailing-media${imageUrl ? ' has-image' : ''}`,
  },
    h('div', { class: 'wo-mailing-art' },
      icon('mail'), h('span', {}, preview ? 'SAMPLE MAILING' : 'PARISH WEEKLY MAILING')),
    ...(imageUrl ? [h('img', {
      class: 'wo-mailing-cover', src: imageUrl,
      alt: `Artwork for ${mailing.title}`, loading: 'lazy',
      onerror: (event) => {
        const img = event.currentTarget;
        img?.parentElement?.classList.remove('has-image');
        img?.remove();
      },
    })] : []));
  return h('a', {
    class: 'wo-card wo-mailing-card',
    href: mailing.url, target: '_blank', rel: 'noopener noreferrer',
    'aria-label': `Read ${mailing.title}${preview ? ' (sample mailing)' : ''}`,
  },
  media,
  h('div', { class: 'wo-card-body wo-mailing-body' },
    h('h3', { class: 'wo-card-title' }, mailing.title),
    h('p', { class: 'wo-card-meta' }, icon('calendar'),
      h('span', {}, new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London',
        day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(mailing.published)))),
    h('p', { class: 'wo-card-meta' }, icon('arrow'), h('span', {}, preview ? 'Sample only — not a real mailing' : 'Read weekly mailing'))));
}
