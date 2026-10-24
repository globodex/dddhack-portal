// Local static inspection. No HTTP requests and no registered module factories run.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import cp from 'node:child_process';

const output = 'evidence/performance-content-boundary/';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function inspect(root, source) {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(`${root}/.next/server/app/[[...path]]/page_client-reference-manifest.js`, 'utf8'), sandbox);
  const route = Object.values(sandbox.__RSC_MANIFEST)[0];
  const portal = Object.entries(route.clientModules).find(([name]) => name.endsWith('/app/[[...path]]/portal-client.tsx'));
  if (!portal) throw new Error('PORTAL_CLIENT_MANIFEST_REQUIRED');
  const manifest = JSON.parse(fs.readFileSync(`${root}/.next/build-manifest.json`, 'utf8'));
  const layoutChunks = Object.entries(route.clientModules).filter(([name]) => name.endsWith('.css')).flatMap(([, value]) => value.chunks);
  const initialNames = [...new Set([...manifest.rootMainFiles, ...portal[1].chunks, ...layoutChunks].filter(name => name.endsWith('.js')))];
  const read = name => fs.readFileSync(`${root}/.next/${decodeURIComponent(name)}`);
  const size = name => { const bytes = read(name); return { file: name, bytes: bytes.length, gzipBytes: zlib.gzipSync(bytes).length, sha256: sha(bytes) }; };
  const initialFiles = initialNames.map(size);
  const factories = [];
  for (const name of initialNames) {
    if (name.split('/').at(-1).startsWith('webpack-')) continue;
    const queue = { push(packet) {
      for (const [id, factory] of Object.entries(packet[1])) {
        const code = String(factory);
        const markers = ['ZodError', 'ZodType', 'ZodFirstPartyTypeKind', 'safeParse'].filter(marker => code.includes(marker));
        if (markers.includes('ZodError') && markers.includes('ZodType')) factories.push({ file: name, moduleId: id, factoryBytes: Buffer.byteLength(code), factorySha256: sha(code), markers });
      }
    } };
    vm.runInNewContext(read(name).toString('utf8'), { self: { webpackChunk_N_E: queue } }, { timeout: 1000 });
  }
  const cssNames = [...new Set(Object.values(route.entryCSSFiles).flat().map(value => value.path))];
  const css = cssNames.map(size);
  const fonts = fs.readdirSync(`${root}/.next/static/media`).filter(name => /\.(woff2?|ttf|otf)$/.test(name)).map(name => size(`static/media/${name}`));
  const configs = {};
  for (const name of ['next.config.ts', 'package.json', 'package-lock.json']) configs[name] = sha(fs.readFileSync(`${root}/${name}`));
  const loadable = JSON.parse(fs.readFileSync(`${root}/.next/react-loadable-manifest.json`, 'utf8'));
  const allEmittedClientJavaScriptWithZodMarkers = [];
  function scan(relative) {
    for (const entry of fs.readdirSync(`${root}/.next/${relative}`, { withFileTypes: true })) {
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) scan(name);
      else if (entry.name.endsWith('.js')) {
        const code = read(name).toString('utf8');
        if (code.includes('ZodError') && code.includes('ZodType')) allEmittedClientJavaScriptWithZodMarkers.push(size(name));
      }
    }
  }
  scan('static/chunks');
  return { root, source, buildId: fs.readFileSync(`${root}/.next/BUILD_ID`, 'utf8'), configs, initialJavaScript: { basis: 'rootMainFiles plus Portal client-reference chunks and shared layout chunks; legacy polyfills excluded', files: initialFiles, bytes: initialFiles.reduce((sum, file) => sum + file.bytes, 0), gzipBytes: initialFiles.reduce((sum, file) => sum + file.gzipBytes, 0) }, initialZodFactories: factories, allEmittedClientJavaScriptWithZodMarkers, initialCSS: css, fonts, homeAsyncLoadableEntry: loadable['app/portal.tsx -> ./home'] ?? null, staticHomeImport: fs.readFileSync(`${root}/app/portal.tsx`, 'utf8').includes('import Home from "./home";') };
}
const control = inspect('/workspace/ddd-perf-prod-final', '2657f26254ed323ca84a167a2f220f05f4ec7cbf; app equivalent to e135e3ec7b787f7e6167c29f4e46bc76a9fbfcec');
const candidate = inspect('/workspace/ddd-perf-content-boundary', 'd24b47f01c40abe247944a2e81e414a7a31ac06d');
const fingerprint = files => files.map(file => `${file.file}:${file.sha256}`).sort();
const sameCSS = JSON.stringify(fingerprint(control.initialCSS)) === JSON.stringify(fingerprint(candidate.initialCSS));
const sameFonts = JSON.stringify(fingerprint(control.fonts)) === JSON.stringify(fingerprint(candidate.fonts));
const oldContract = cp.execFileSync('git', ['show', 'e135e3ec7b787f7e6167c29f4e46bc76a9fbfcec:lib/event-content-contract.ts'], { encoding: 'utf8' });
const newContract = fs.readFileSync('lib/event-content-contract.ts', 'utf8');
const pureDefaults = fs.readFileSync('lib/public-content-defaults.ts', 'utf8');
const marker = 'export const defaultPublicContent = ';
const oldDefaults = oldContract.slice(oldContract.indexOf(marker));
const newDefaults = pureDefaults.slice(pureDefaults.indexOf(marker));
const oldSchemas = oldContract.slice(0, oldContract.indexOf(marker));
const newSchemas = newContract.slice(0, newContract.indexOf('// Compatibility export'));
const sourceEquivalence = { defaultsLiteralBytesIdentical: oldDefaults === newDefaults, oldDefaultsSha256: sha(oldDefaults), newDefaultsSha256: sha(newDefaults), serverSchemaPrefixBytesIdentical: oldSchemas === newSchemas, oldSchemaSha256: sha(oldSchemas), newSchemaSha256: sha(newSchemas), pureDefaultsHasNoImport: !/^import\s/m.test(pureDefaults), compatibilityReexportPresent: newContract.includes('export { defaultPublicContent } from "./public-content-defaults";') };
if (!control.initialZodFactories.length || candidate.initialZodFactories.length) throw new Error('ZOD_CLIENT_BOUNDARY_PROOF_FAILED');
if (candidate.allEmittedClientJavaScriptWithZodMarkers.length) throw new Error('UNEXPECTED_ZOD_IN_EMITTED_CLIENT_JAVASCRIPT');
if (!sameCSS || !sameFonts || !sourceEquivalence.defaultsLiteralBytesIdentical || !sourceEquivalence.serverSchemaPrefixBytesIdentical) throw new Error('UNCHANGED_CONTENT_STYLE_SCHEMA_PROOF_FAILED');
if (!control.staticHomeImport || !candidate.staticHomeImport || candidate.homeAsyncLoadableEntry) throw new Error('STATIC_HOME_IMPORT_REQUIRED');
const report = { capturedAt: new Date().toISOString(), kind: 'static production build graph; no browser performance inference', gzipIsEstimateNotMeasuredTransfer: true, registeredFactoriesExecuted: false, sameConfigAndPackageHashes: JSON.stringify(control.configs) === JSON.stringify(candidate.configs), identicalCSSAssetsAndHashes: sameCSS, identicalFontAssetsAndHashes: sameFonts, sourceEquivalence, control, candidate, difference: { initialRawJavaScriptBytes: candidate.initialJavaScript.bytes - control.initialJavaScript.bytes, initialGzipEstimateBytes: candidate.initialJavaScript.gzipBytes - control.initialJavaScript.gzipBytes }, SSRLimit: 'Default-data source and schema bytes are identical. Actual rendered Home SSR, content and pixels are verified separately by Profile.' };
fs.writeFileSync(output + 'candidate-build-graph.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ candidateBuildId: candidate.buildId, controlBuildId: control.buildId, difference: report.difference, controlZodFactories: control.initialZodFactories, candidateZodFactories: candidate.initialZodFactories, sameCSS, sameFonts, sourceEquivalence }));
