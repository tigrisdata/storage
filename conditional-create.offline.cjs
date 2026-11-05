// Offline candidate regression harness. No install, CLI bootstrap or real auth.
// Usage: node conditional-create.offline.cjs DEPENDENCY_ROOT ESBUILD_ROOT
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire, Module } = require('node:module');
const { Readable } = require('node:stream');
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
let networkAttempts = 0;
const deny = () => { networkAttempts++; throw new Error('NETWORK DENIED'); };
net.Socket.prototype.connect = deny;
tls.connect = deny;
http.request = https.request = http.get = https.get = deny;
global.fetch = deny;
const deps = createRequire(path.resolve(process.argv[2], '__offline__.cjs'));
const esbuild = require(path.resolve(process.argv[3]));
const { S3Client, GetObjectCommand } = deps('@aws-sdk/client-s3');
const baseline = process.argv[4] === '--baseline';
const sourceFiles = ['packages/storage/src/lib/object/put.ts', 'packages/cli/src/lib/objects/put.ts', 'packages/cli/src/specs.yaml'];
function upstreamSource(file) {
  assert.ok(sourceFiles.includes(file));
  return require('node:child_process').execFileSync('/usr/bin/git', ['show', `HEAD:${file}`], {encoding:'utf8'});
}
const state = global.__conditionalTest = { clients: 0, auth: 0 };
const requests = [];
const compiledInputs = new Set();
let objects = new Map();
let injectForeign = false;
let failStatus = 0;
const foreign = Buffer.from('FOREIGN OWNER BYTES');
const response = (statusCode, headers = {}, bytes = Buffer.alloc(0)) => ({
  response: { statusCode, headers, body: Readable.from([bytes]) }
});
state.client = new S3Client({
  region: 'auto', endpoint: 'https://offline.invalid', forcePathStyle: true,
  credentials: { accessKeyId: 'SYNTHETIC_OFFLINE_ONLY', secretAccessKey: 'SYNTHETIC_NOT_A_SECRET' },
  maxAttempts: 3, requestChecksumCalculation: 'WHEN_REQUIRED',
  requestHandler: { async handle(req) {
    const key = req.path;
    requests.push({ method: req.method, path: key, headers: { ...req.headers }, query: { ...req.query } });
    if (req.method === 'PUT') {
      assert.equal(req.query.uploadId, undefined);
      if (injectForeign) { objects.set(key, foreign); injectForeign = false; }
      const status = failStatus || (req.headers['if-none-match'] === '*' && objects.has(key) ? 412 : 0);
      if (status) return response(status, { 'content-type': 'application/xml' }, Buffer.from(`<Error><Code>${status === 412 ? 'PreconditionFailed' : status === 403 ? 'AccessDenied' : 'ConditionalRequestConflict'}</Code><Message>offline rejection</Message></Error>`));
      const chunks = [];
      if (typeof req.body === 'string' || Buffer.isBuffer(req.body) || req.body instanceof Uint8Array) chunks.push(Buffer.from(req.body));
      else for await (const c of req.body) chunks.push(Buffer.from(c));
      objects.set(key, Buffer.concat(chunks));
      return response(200, { etag: '"offline-etag"' });
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!objects.has(key)) return response(404);
      const bytes = objects.get(key);
      return response(200, { 'content-length': String(bytes.length), etag: '"offline-etag"' }, req.method === 'GET' ? bytes : Buffer.alloc(0));
    }
    throw new Error(`Unexpected wire method ${req.method}`);
  } }
});
async function compile(entry, cli = false) {
  const result = await esbuild.build({
    entryPoints: [entry], bundle: true, write: false, metafile: true, platform: 'node', format: 'cjs',
    plugins: [{ name: 'offline-only-boundaries', setup(build) {
      if (baseline) build.onLoad({filter: /\/put\.ts$/}, a => {
        const file = path.relative(process.cwd(), a.path);
        if (sourceFiles.includes(file)) return {contents:upstreamSource(file),loader:'ts'};
      });
      build.onResolve({ filter: /^(@aws-sdk|@smithy)\// }, a => ({ path: deps.resolve(a.path), external: true }));
      build.onResolve({ filter: /^\.\.\/(config|tigris-client)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `export const getConfig = () => ({bucket:'fixture'}); export const createTigrisClient = () => {globalThis.__conditionalTest.clients++; return {data:globalThis.__conditionalTest.client}};`, loader: 'js' }));
      build.onResolve({ filter: /^@shared\/index$/ }, () => ({ path: path.resolve('shared/headers.ts') }));
      build.onResolve({ filter: /^@shared\/utils$/ }, () => ({ path: path.resolve('shared/utils.ts') }));
      if (cli) {
        build.onResolve({ filter: /^@auth\// }, () => ({ path: 'auth-denied', namespace: 'cli-stub' }));
        build.onResolve({ filter: /^@tigrisdata\/storage$/ }, () => ({ path: 'storage-facade', namespace: 'storage-facade' }));
        build.onLoad({ filter: /.*/, namespace: 'storage-facade' }, () => ({ contents: `export {put} from './packages/storage/src/lib/object/put.ts'; export const list=()=>{throw new Error('list outside test scope')};`, resolveDir: process.cwd(), loader: 'js' }));
        build.onResolve({ filter: /^@utils\/(exit|format|messages|mime)\.js$/ }, a => ({ path: a.path, namespace: 'cli-stub' }));
        build.onLoad({ filter: /.*/, namespace: 'cli-stub' }, a => ({ contents: a.path === 'auth-denied'
          ? `export async function getStorageConfig(){globalThis.__conditionalTest.auth++; return {bucket:'fixture'}}`
          : `export const failWithError = (_,e) => {throw e instanceof Error ? e : new Error(e)}; export const printNextActions=()=>{}; export const formatOutput=()=>''; export const formatSize=String; export const msg=()=>''; export const printStart=()=>{}; export const printSuccess=()=>{}; export const getContentType=()=>undefined;`, loader: 'js' }));
        build.onResolve({ filter: /^@utils\// }, a => ({ path: path.resolve('packages/cli/src/utils', a.path.slice(7).replace(/\.js$/, '.ts')) }));
      }
    } }]
  });
  for (const input of Object.keys(result.metafile.inputs)) {
    assert.ok(!input.includes('packages/cli/src/auth/'), 'real auth provider must not be bundled');
    compiledInputs.add(input);
  }
  const m = new Module(path.resolve('__offline_bundle__.cjs'), module);
  m.filename = path.resolve('__offline_bundle__.cjs');
  m.paths = module.paths;
  m._compile(result.outputFiles[0].text, m.filename);
  return m.exports;
}
let passed = 0, failed = 0;
async function test(name, fn) {
  requests.length = 0; objects = new Map(); injectForeign = false; failStatus = 0;
  state.clients = state.auth = 0;
  try { await fn(); assert.equal(networkAttempts, 0); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
(async () => {
  const { put } = await compile('packages/storage/src/lib/object/put.ts');
  const opts = { ifAbsent: true, access: 'private', config: { bucket: 'fixture' } };
  await test('serialized conditional private PUT and exact GET readback', async () => {
    const bytes = Buffer.from([0, 255, 17, 128, 10]);
    const out = await put('new', bytes, opts); assert.ifError(out.error);
    assert.equal(requests[0].method, 'PUT'); assert.equal(requests[0].headers['if-none-match'], '*');
    assert.equal(requests[0].headers['x-amz-acl'], 'private');
    const read = await state.client.send(new GetObjectCommand({ Bucket: 'fixture', Key: 'new' }));
    assert.deepEqual(Buffer.from(await read.Body.transformToByteArray()), bytes);
    assert.equal(out.data.size, bytes.length);
  });
  await test('foreign writer at dispatch: 412, unchanged bytes, no fallback', async () => {
    injectForeign = true;
    const out = await put('race', Buffer.from('ours'), opts);
    assert.equal(out.error?.$metadata?.httpStatusCode, 412);
    assert.deepEqual(objects.get('/fixture/race'), foreign);
    assert.deepEqual(requests.map(r => r.method), ['PUT']);
  });
  await test('equal-byte conflict is still an error', async () => {
    objects.set('/fixture/equal', Buffer.from('same'));
    const out = await put('equal', Buffer.from('same'), opts);
    assert.equal(out.error?.$metadata?.httpStatusCode, 412);
    assert.deepEqual(requests.map(r => r.method), ['PUT']);
  });
  for (const status of [403, 409]) await test(`${status} is terminal without fallback`, async () => {
    failStatus = status; const out = await put('reject', 'body', opts);
    assert.equal(out.error?.$metadata?.httpStatusCode, status);
    assert.equal(requests[0].headers['if-none-match'], '*'); assert.equal(requests.length, 1);
  });
  for (const [name, body, extra] of [
    ['oversize buffer', Buffer.alloc(5 * 1024 * 1024 + 1), {}],
    ['oversize UTF8 string', 'é'.repeat(3 * 1024 * 1024), {}],
    ['unknown stream', new ReadableStream({start(c){c.close()}}), {}],
    ['multipart', 'small', { multipart: true }],
    ['custom part size', 'small', { partSize: 6 * 1024 * 1024 }]
  ]) await test(`${name} refused before client resolution`, async () => {
    const out = await put('reject', body, { ...opts, ...extra });
    assert.match(out.error?.message || '', /ifAbsent/);
    assert.equal(state.clients, 0); assert.equal(requests.length, 0); assert.equal(state.auth, 0);
  });
  await test('exact 5 MiB is single PUT', async () => {
    const out = await put('limit', Buffer.alloc(5 * 1024 * 1024), opts); assert.ifError(out.error);
    assert.deepEqual(requests.map(r => r.method), ['PUT']); assert.equal(requests[0].headers['if-none-match'], '*');
  });
  await test('empty and Blob bodies remain conditional', async () => {
    for (const [key, body] of [['empty', ''], ['blob', new Blob(['blob bytes'])]]) {
      const out = await put(key, body, opts); assert.ifError(out.error);
    }
    assert.ok(requests.filter(r=>r.method==='PUT').every(r=>r.headers['if-none-match']==='*'));
  });
  await test('default remains unconditional and allowOverwrite:false remains HEAD precheck', async () => {
    objects.set('/fixture/default', foreign);
    assert.ifError((await put('default', 'replacement', {config:{bucket:'fixture'}})).error);
    assert.equal(requests[0].headers['if-none-match'], undefined);
    requests.length = 0;
    const out = await put('default', 'no', {allowOverwrite:false,config:{bucket:'fixture'}});
    assert.equal(out.error.message, 'File already exists'); assert.deepEqual(requests.map(r=>r.method), ['HEAD']);
  });
  const cli = (await compile('packages/cli/src/lib/objects/put.ts', true)).default;
  await test('CLI rejects if-absent stdin before auth seam', async () => {
    await assert.rejects(cli({bucket:'fixture',key:'stdin','if-absent':true}), /if-absent/);
    assert.equal(state.auth,0); assert.equal(requests.length,0);
  });
  await test('CLI forwards if-absent to real SDK wire', async () => {
    await cli({bucket:'fixture',key:'cli',file:'LICENSE','if-absent':true,access:'private'});
    assert.equal(requests[0].headers['if-none-match'],'*');
    assert.equal(requests[0].headers['x-amz-acl'],'private');
    assert.deepEqual(objects.get('/fixture/cli'), fs.readFileSync('LICENSE'));
  });
  fs.mkdirSync('.offline-fixtures', {recursive:true});
  const fd = fs.openSync('.offline-fixtures/oversize', 'w');
  fs.ftruncateSync(fd, 5 * 1024 * 1024 + 1); fs.closeSync(fd);
  for (const file of ['.offline-fixtures/oversize', '.offline-fixtures']) await test(`CLI refuses ${file} before auth seam`, async () => {
    await assert.rejects(cli({bucket:'fixture',key:'bad',file,'if-absent':true}), /if-absent/);
    assert.equal(state.auth,0); assert.equal(requests.length,0);
  });
  await test('CLI conditional conflict propagates without fallback', async () => {
    injectForeign = true;
    await assert.rejects(cli({bucket:'fixture',key:'cli-race',file:'LICENSE','if-absent':true}), e=>e.$metadata?.httpStatusCode===412);
    assert.deepEqual(objects.get('/fixture/cli-race'),foreign);
    assert.deepEqual(requests.map(r=>r.method),['PUT']);
  });
  await test('CLI growth after fstat is bounded and refused before auth', async () => {
    const file = '.offline-fixtures/growing';
    fs.writeFileSync(file, 'tiny');
    const original = fs.fstatSync;
    fs.fstatSync = fd => { const stat = original(fd); fs.truncateSync(file,5*1024*1024+1); return stat; };
    try {
      await assert.rejects(cli({bucket:'fixture',key:'grow',file,'if-absent':true}), /if-absent/);
      assert.equal(state.auth,0); assert.equal(requests.length,0);
    } finally { fs.fstatSync = original; }
  });
  await test('explicit false keeps the unconditional path', async () => {
    assert.ifError((await put('false','body',{...opts,ifAbsent:false})).error);
    assert.equal(requests[0].headers['if-none-match'],undefined);
  });
  await test('oversize Blob refused before client resolution', async () => {
    const out = await put('blob-large',new Blob([Buffer.alloc(5*1024*1024+1)]),opts);
    assert.match(out.error?.message || '',/ifAbsent/); assert.equal(state.clients,0); assert.equal(requests.length,0);
  });
  await test('CLI spec exposes boolean opt-in', async () => {
    const specFile = 'packages/cli/src/specs.yaml';
    const spec = (baseline ? upstreamSource(specFile) : fs.readFileSync(specFile,'utf8')).split('      # put\n')[1].split('      # delete\n')[0];
    assert.match(spec, /name: if-absent\n\s+description:.*\n\s+type: flag/);
  });
  const realAuthProviderImports = [...compiledInputs].filter(p=>p.includes('packages/cli/src/auth/')).length;
  console.log(JSON.stringify({passed,failed,networkAttempts,realAuthProviderImports,realAuthProviderInvocations:0,compiledInputs:[...compiledInputs]}));
  state.client.destroy(); process.exitCode = failed ? 1 : 0;
})().catch(e=>{console.error(e);process.exitCode=1});
