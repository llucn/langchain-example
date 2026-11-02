// Writes the bundle's package.json: the API's runtime dependencies, with the workspace package
// @app/shared pointing at the vendored copy. Usage: node make-bundle-package.js <apiPkg> <outDir>
const fs = require('fs');
const path = require('path');

const [apiPkgPath, outDir] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(apiPkgPath, 'utf8'));
const out = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  main: pkg.main,
  engines: { node: '>=22' },
  dependencies: { ...pkg.dependencies, '@app/shared': 'file:./vendor/shared' },
};
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(out, null, 2) + '\n');
