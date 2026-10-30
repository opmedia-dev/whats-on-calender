// Read the published flipbook's latest issue metadata. The magazine has its
// own GitHub Pages deployment; the calendar must not copy or cache its PDF.
export async function loadMagazineIssue(previewUrl, fetcher = fetch) {
  const preview = new URL(previewUrl);
  if (preview.protocol !== 'https:') throw new Error('Magazine preview must use HTTPS');

  // e.g. /flipbook/preview.html -> /flipbook/issues.json
  const catalogue = new URL('issues.json', preview);
  const response = await fetcher(catalogue.href, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Magazine issue list returned ${response.status}`);

  const data = await response.json();
  if (!Array.isArray(data.issues) || !data.issues.length) {
    throw new Error('No magazine issues have been published');
  }
  // Respect a specific issue selected by ?id=, otherwise use the newest issue.
  const selectedId = preview.searchParams.get('id');
  const issue = selectedId ? data.issues.find((item) => item.id === selectedId) : data.issues[0];
  if (!issue) throw new Error('The selected magazine issue was not found');

  return {
    title: issue.title || 'Latest magazine',
    cover: typeof issue.cover === 'string' && issue.cover
      ? new URL(issue.cover, catalogue).href : null,
    preview: preview.href,
  };
}
