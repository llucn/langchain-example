// Prints `export KEY='value'` lines for the app's Elastic Beanstalk configuration:
// plain environment properties (get-config) plus Secrets Manager values (get-secrets).
// Usage: eval "$(node load-env.js)"
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BIN = '/opt/elasticbeanstalk/bin';
const plain = JSON.parse(execFileSync(`${BIN}/get-config`, ['environment'], { encoding: 'utf8' }));

// get-secrets refuses to overwrite, so give it a fresh path in a private directory.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ebsec-'));
fs.chmodSync(dir, 0o700);
const file = path.join(dir, 'secrets.env');
const secrets = {};
try {
  execFileSync(`${BIN}/get-secrets`, [file], { stdio: ['ignore', 'ignore', 'inherit'] });
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\(["\\])/g, '$1');
    secrets[m[1]] = v;
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

const all = { ...plain, ...secrets };
for (const [k, v] of Object.entries(all)) {
  console.log(`export ${k}='${String(v).replace(/'/g, `'\\''`)}'`);
}
