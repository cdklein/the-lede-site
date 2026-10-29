// Run from this folder: node --test
// Pins every validation case of the outage notice Worker (ios#598).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { readNotice, MAX_AHEAD_MS, KEY } from './worker.js';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const OFF = { v: 1, notice: null };
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const stored = (over = {}) =>
  JSON.stringify({ v: 1, notice: 'desk_unavailable', expires: iso(NOW + 12 * 3600e3), ...over });

test('a valid value passes through as the app expects it', () => {
  assert.deepEqual(readNotice(stored(), NOW),
    { v: 1, notice: 'desk_unavailable', expires: '2026-10-30T00:00:00Z' });
});

test('the Shortcut offset form and fractional seconds are accepted and normalized to UTC', () => {
  assert.equal(readNotice(stored({ expires: '2026-10-29T17:00:00-07:00' }), NOW).expires,
    '2026-10-30T00:00:00Z');
  assert.equal(readNotice(stored({ expires: '2026-10-30T00:00:00.250Z' }), NOW).expires,
    '2026-10-30T00:00:00Z');
});

test('no value, empty, oversized or non-JSON means no notice', () => {
  assert.deepEqual(readNotice(null, NOW), OFF);
  assert.deepEqual(readNotice('', NOW), OFF);
  assert.deepEqual(readNotice('not json', NOW), OFF);
  assert.deepEqual(readNotice(stored({ pad: 'x'.repeat(2000) }), NOW), OFF);
  assert.deepEqual(readNotice('[1]', NOW), OFF);
  assert.deepEqual(readNotice('null', NOW), OFF);
  assert.deepEqual(readNotice('"desk_unavailable"', NOW), OFF);
});

test('the version must be exactly 1', () => {
  assert.deepEqual(readNotice(stored({ v: 2 }), NOW), OFF);
  assert.deepEqual(readNotice(stored({ v: '1' }), NOW), OFF);
  assert.deepEqual(readNotice(stored({ v: undefined }), NOW), OFF);
});

test('the code must be on the allowed list', () => {
  assert.deepEqual(readNotice(stored({ notice: 'desk_down' }), NOW), OFF);
  assert.deepEqual(readNotice(stored({ notice: 'The desk is down, click here' }), NOW), OFF);
  assert.deepEqual(readNotice(stored({ notice: null }), NOW), OFF);
  assert.deepEqual(readNotice(stored({ notice: 1 }), NOW), OFF);
});

test('the expiry must be a future ISO 8601 instant at most 48 hours out', () => {
  assert.deepEqual(readNotice(stored({ expires: undefined }), NOW), OFF);
  assert.deepEqual(readNotice(stored({ expires: 1793000000 }), NOW), OFF);
  assert.deepEqual(readNotice(stored({ expires: 'tomorrow' }), NOW), OFF);
  assert.deepEqual(readNotice(stored({ expires: '2026-10-30' }), NOW), OFF);          // no time
  assert.deepEqual(readNotice(stored({ expires: '2026-10-30T00:00:00' }), NOW), OFF); // no zone
  assert.deepEqual(readNotice(stored({ expires: '2026-10-30T00:00:00+0000' }), NOW), OFF);
  assert.deepEqual(readNotice(stored({ expires: '2026-13-45T00:00:00Z' }), NOW), OFF);
  assert.deepEqual(readNotice(stored({ expires: iso(NOW - 1000) }), NOW), OFF);        // past
  assert.deepEqual(readNotice(stored({ expires: iso(NOW) }), NOW), OFF);               // the instant itself
  assert.deepEqual(readNotice(stored({ expires: iso(NOW + MAX_AHEAD_MS + 1000) }), NOW), OFF);
  assert.equal(readNotice(stored({ expires: iso(NOW + MAX_AHEAD_MS) }), NOW).notice, 'desk_unavailable');
});

test('extra stored fields never leave the Worker', () => {
  const out = readNotice(stored({ text: 'anything', url: 'https://evil.example' }), NOW);
  assert.deepEqual(Object.keys(out), ['v', 'notice', 'expires']);
});

// --- the fetch handler ---

const env = (value, calls = []) => ({
  STATUS: { get: async (...args) => { calls.push(args); if (value instanceof Error) throw value; return value; } },
});
const req = (method = 'GET', url = 'https://theledeapp.com/status/app.json', headers = {}) =>
  new Request(url, { method, headers });

test('GET answers JSON with a 60 second cache, no cookies, read from the one key', async () => {
  const calls = [];
  const live = JSON.stringify({ v: 1, notice: 'desk_unavailable', expires: iso(Date.now() + 3600e3) });
  let passed = false;
  const res = await worker.fetch(req(), env(live, calls), { passThroughOnException: () => { passed = true; } });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'max-age=60');
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal((await res.json()).notice, 'desk_unavailable');
  assert.deepEqual(calls, [[KEY, { cacheTtl: 60 }]]);
  assert.ok(passed, 'a crash must fall through to the site');
});

test('desk up (no value) answers the no-notice body the app reads as nil', async () => {
  const res = await worker.fetch(req(), env(null), {});
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '{"v":1,"notice":null}');
});

test('a KV error answers no notice', async () => {
  const res = await worker.fetch(req(), env(new Error('kv down')), {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), OFF);
});

test('GET only', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) {
    const calls = [];
    const res = await worker.fetch(req(method), env('x', calls), {});
    assert.equal(res.status, 405, method);
    assert.equal(calls.length, 0, `${method} must not read KV`);
  }
});

test('only /status/app.json is answered', async () => {
  for (const url of ['https://theledeapp.com/status/', 'https://theledeapp.com/status/app.json/x',
                     'https://theledeapp.com/status/other.json']) {
    const calls = [];
    const res = await worker.fetch(req('GET', url), env('x', calls), {});
    assert.equal(res.status, 404, url);
    assert.equal(calls.length, 0);
  }
});

test('request headers are never read', async () => {
  const headers = new Proxy(new Headers(), { get() { throw new Error('read a header'); } });
  const request = { method: 'GET', url: 'https://theledeapp.com/status/app.json', headers };
  const res = await worker.fetch(request, env(null), {});
  assert.equal(res.status, 200);
});

test('the source carries no logging call', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('./worker.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /console\./);
});
