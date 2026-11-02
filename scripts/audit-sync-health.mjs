// Publishes HTTP 200/404 health via a marker on the separate monitoring branch.
// No-change deploys still count as successful syncs; failed, cancelled, or
// overdue (>60 minutes) runs clear the marker without rebuilding GitHub Pages.
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export function classifyRuns(runs, now = Date.now(), maxAgeMs = 60 * 60 * 1000) {
  const completed = runs
    .filter((run) => run.status === 'completed')
    .sort((a, b) => Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at));
  const latest = completed[0];
  if (!latest) return { healthy: false, reason: 'No completed deployment workflow run found' };
  if (latest.conclusion !== 'success') {
    return { healthy: false, reason: 'Latest completed workflow concluded: ' + latest.conclusion, latest };
  }
  const completedAt = Date.parse(latest.updated_at || latest.created_at);
  if (!Number.isFinite(completedAt) || completedAt > now + 300000) {
    return { healthy: false, reason: 'Latest completed workflow has an invalid completion time', latest };
  }
  const ageMs = now - completedAt;
  if (ageMs > maxAgeMs) {
    return { healthy: false, reason: 'Last successful workflow is ' + Math.round(ageMs / 60000) + ' minutes old', latest };
  }
  return { healthy: true, reason: 'Latest completed workflow succeeded ' + Math.round(ageMs / 60000) + ' minutes ago', latest };
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GH_TOKEN are required');
  const base = 'https://api.github.com/repos/' + repo;

  const request = async (suffix, method = 'GET', body) => {
    const response = await fetch(base + suffix, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status !== 404 && !response.ok) {
      throw new Error(method + ' ' + suffix + ' failed (' + response.status + '): ' + (await response.text()).slice(0, 400));
    }
    return response;
  };

  const runsResponse = await request('/actions/workflows/deploy.yml/runs?branch=main&per_page=30');
  if (!runsResponse.ok) throw new Error('Deployment workflow not found');
  const state = classifyRuns((await runsResponse.json()).workflow_runs || []);
  const markerResponse = await request('/contents/sync-ok.txt?ref=monitoring');
  const marker = markerResponse.ok ? await markerResponse.json() : null;

  if (state.healthy && !marker) {
    const message = 'Last verified run: ' + state.latest.html_url + '\nChecked: ' + new Date().toISOString() + '\n';
    await request('/contents/sync-ok.txt', 'PUT', {
      message: 'health: mark synchronisation healthy',
      branch: 'monitoring',
      content: Buffer.from(message, 'utf8').toString('base64'),
    });
  } else if (!state.healthy && marker) {
    await request('/contents/sync-ok.txt', 'DELETE', {
      message: 'health: mark synchronisation unhealthy',
      branch: 'monitoring',
      sha: marker.sha,
    });
  }

  console.log((state.healthy ? 'HEALTHY: ' : 'UNHEALTHY: ') + state.reason);
  if (state.latest?.html_url) console.log('Workflow: ' + state.latest.html_url);
  if (!state.healthy) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('::error::Health audit failed: ' + error.message);
    process.exitCode = 1;
  });
}
