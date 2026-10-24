import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { googlePopup, base64url } from '../src/auth/google.js';
import { clearSetupProof, readSetupProof } from '../src/auth/passwordSetupProof.js';

const code = 'c'.repeat(43);
function browser(mode = 'success') {
  const events = new EventTarget();
  const calls = [];
  let challenge;
  const popup = { closed: false, close() { this.closed = true; }, location: {
    replace() {
      if (mode === 'closed') { popup.closed = true; return; }
      setTimeout(() => {
        for (const [origin, source, data] of [
          ['https://attacker.example', popup, { code }],
          ['http://127.0.0.1:8000', {}, { code }],
          ['http://127.0.0.1:8000', popup, mode === 'denied' ? { error: 'Google sign-in was cancelled.' } : { code }],
        ]) {
          const event = new Event('message');
          Object.assign(event, { origin, source, data: { type: 'reclaim:google', ...data } });
          events.dispatchEvent(event);
        }
      }, 0);
    },
  } };
  globalThis.window = { location: { origin: 'http://127.0.0.1:5173' }, open: () => mode === 'blocked' ? null : popup,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/sanctum/csrf-cookie')) { globalThis.document = { cookie: 'XSRF-TOKEN=unit-csrf' }; return new Response(null, { status: 204 }); }
    const body = JSON.parse(options.body); calls.push({ url, body, options });
    if (url.endsWith('/start')) {
      challenge = body.challenge;
      if (mode === 'unconfigured') return Response.json({ message: 'Google sign-in is not configured.' }, { status: 503 });
      return Response.json({ url: 'https://accounts.google.com/o/oauth2/auth?state=fixture', callback_origin: 'http://127.0.0.1:8000' });
    }
    assert.equal(body.code, code);
    assert.equal(base64url(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(body.verifier))), challenge);
    return Response.json({ token_type: 'Bearer', token: 'fictional-token' });
  };
  return { popup, calls };
}

test('Google popup binds the exchange to its verifier and rejects wrong message origins/sources', async () => {
  const { calls, popup } = browser();
  const result = await googlePopup();
  assert.equal(result.token_type, 'Bearer'); assert.equal(calls.length, 2);
  assert.equal(calls[1].options.credentials, 'include'); assert.equal(popup.closed, true);
  assert.equal(new URL(calls[1].url).search, '');
});
test('linking uses authenticated self endpoints and explicit current password', async () => {
  const { calls } = browser(); await googlePopup({ linking: true, currentPassword: 'fictional-password' });
  assert.ok(calls[0].url.endsWith('/me/google/start')); assert.ok(calls[1].url.endsWith('/me/google/exchange'));
  assert.equal(calls[0].body.current_password, 'fictional-password');
});
test('cancelled consent, closed popup, blocked popup and unavailable configuration remain failures', async () => {
  for (const mode of ['denied', 'closed', 'blocked', 'unconfigured']) {
    const { calls } = browser(mode);
    await assert.rejects(googlePopup());
    assert.equal(calls.filter(call => call.url.endsWith('/exchange')).length, 0);
  }
});
test('setup proof survives authentication remount in memory and clears after setup', () => {
  const proof = 'a'.repeat(64);
  clearSetupProof(); assert.equal(readSetupProof(`?token=${proof}`), proof);
  assert.equal(readSetupProof(''), proof); clearSetupProof(); assert.equal(readSetupProof(''), '');
});
