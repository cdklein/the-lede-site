// The outage notice's Cloudflare half (ios#598, "The desk is down" notice).
//
// Answers https://theledeapp.com/status/app.json for the app's DeskNoticeService. It reads
// one value ("notice") from the STATUS key-value namespace, which Charles writes and deletes
// from his phone with two Shortcuts (RUNBOOK.md), and returns the JSON the app's
// DeskNoticePolicy parses (the-lede-ios-app thelede/Services/DeskNoticePolicy.swift):
//
//   notice on:  {"v":1,"notice":"desk_unavailable","expires":"2026-10-29T21:03:00Z"}
//   notice off: {"v":1,"notice":null}
//
// The value carries a CODE, never text: the app shows only words compiled into it, so the
// worst a stolen token can do is show our own approved notice for at most 48 hours.
//
// Anything wrong (no value, bad JSON, wrong version, unknown code, a missing, past or
// too-distant expiry, a KV error) answers "notice off". A crash falls through to the site
// (passThroughOnException), whose 404 the app also reads as no notice.
//
// Privacy: GET only, reads no request headers (only the method and the path), sets no
// cookies, logs nothing (no console calls; logging is off in wrangler.toml).

export const KEY = 'notice';
export const SUPPORTED_VERSION = 1;
export const ALLOWED_CODES = new Set(['desk_unavailable']);
export const MAX_AHEAD_MS = 48 * 60 * 60 * 1000;
// A real stored value is about 80 bytes. Anything far larger is not ours.
export const MAX_STORED_BYTES = 1024;
export const STATUS_PATH = '/status/app.json';
export const CACHE_CONTROL = 'max-age=60';

// The forms the app's DeskNoticePolicy.parseExpiry accepts: ISO 8601 date and time, with
// "Z" or a +hh:mm / -hh:mm offset, with or without fractional seconds. The Shortcut's
// "Format Date: ISO 8601" (with time included) writes the offset form.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

const NO_NOTICE = Object.freeze({ v: SUPPORTED_VERSION, notice: null });

// The pure rule: the stored string (or null) and the clock in, the answer out.
export function readNotice(stored, nowMs) {
  if (typeof stored !== 'string' || stored.length === 0 || stored.length > MAX_STORED_BYTES) {
    return NO_NOTICE;
  }
  let value;
  try {
    value = JSON.parse(stored);
  } catch {
    return NO_NOTICE;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return NO_NOTICE;
  if (value.v !== SUPPORTED_VERSION) return NO_NOTICE;
  if (typeof value.notice !== 'string' || !ALLOWED_CODES.has(value.notice)) return NO_NOTICE;
  if (typeof value.expires !== 'string' || !ISO_INSTANT.test(value.expires)) return NO_NOTICE;
  const expiresMs = Date.parse(value.expires);
  if (!Number.isFinite(expiresMs)) return NO_NOTICE;
  if (expiresMs <= nowMs || expiresMs - nowMs > MAX_AHEAD_MS) return NO_NOTICE;
  // Re-written rather than passed through: only the three known fields ever leave, in the
  // plain UTC form the app parses first.
  const expires = new Date(expiresMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { v: SUPPORTED_VERSION, notice: value.notice, expires };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': CACHE_CONTROL,
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    ctx?.passThroughOnException?.();
    if (request.method !== 'GET') {
      return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    }
    if (new URL(request.url).pathname !== STATUS_PATH) {
      return new Response(null, { status: 404 });
    }
    let stored = null;
    try {
      stored = await env.STATUS.get(KEY, { cacheTtl: 60 });
    } catch {
      return json(NO_NOTICE);
    }
    return json(readNotice(stored, Date.now()));
  },
};
