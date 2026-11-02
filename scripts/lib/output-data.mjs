// Calendar and Mailchimp data are independent. Rebuilding event media must
// never delete data/mailings.json produced earlier in the same workflow.
import fs from 'node:fs';
import path from 'node:path';

export function prepareCalendarOutput(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  for (const name of ['events.json', 'files', 'media']) {
    fs.rmSync(path.join(dataDir, name), { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true });
}

export function assertMailingsReady(dataDir, { liveFeedConfigured = false } = {}) {
  const filename = path.join(dataDir, 'mailings.json');
  if (!fs.existsSync(filename)) {
    if (liveFeedConfigured) throw new Error(
      'Mailchimp RSS is configured but data/mailings.json is missing. Refusing to deploy an empty mailing archive.',
    );
    return false;
  }
  if (liveFeedConfigured) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    } catch {
      throw new Error('Mailchimp RSS is configured but data/mailings.json is invalid JSON. Refusing deployment.');
    }
    if (data.preview !== false || !Array.isArray(data.mailings) || data.mailings.length === 0) {
      throw new Error('Mailchimp RSS is configured but the build has no real mailings. Refusing to deploy preview or empty data.');
    }
  }
  return true;
}
