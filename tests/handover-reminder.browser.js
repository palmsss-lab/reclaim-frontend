import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

// Synthetic API fixtures only: no external requests or database records.
const origin = 'http://127.0.0.1:5188';
const server = await preview({ configFile: false, envDir: false, preview: { host: '127.0.0.1', port: 5188, strictPort: true } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
after(async () => { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); });
const label = 'Remind finder to bring the item to the office';
const message = 'Staff have not received the item from your found-item report yet. Please bring it to the office for physical handover. Contact the office to arrange handover.';
const paged = data => ({ data, total: data.length, current_page: 1, last_page: 1, per_page: 20 });
async function fixture(role = 'staff') {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: 'XSRF-TOKEN', value: 'synthetic-csrf', url: origin }]);
  const state = { status: 'PENDING', writes: [], failure: null, sent: null, unexpected: [] };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.slice(5);
    if (url.origin !== origin) { state.unexpected.push('external'); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ json: body, status });
    if (request.method() !== 'GET') {
      state.writes.push({ path, body: request.postDataJSON() });
      assert.equal(request.headers()['x-xsrf-token'], 'synthetic-csrf');
      assert.equal(request.headers().authorization, undefined);
    }
    if (path === 'me') return json({ user_id: 1, person_id: role === 'user' ? 1 : null, staff_id: role === 'staff' ? 2 : null, full_name: 'Fictional account', email_verified: true, permissions: { manage_accounts: false } });
    if (path === 'me/profile') return json({ data: { email_verified: true, person: { full_name: 'Fictional owner' } } });
    if (path.endsWith('/request-handover')) {
      assert.match(request.postDataJSON().request_id, /^[a-f0-9-]{36}$/);
      assert.deepEqual(Object.keys(request.postDataJSON()), ['request_id']);
      if (state.failure === 409) { state.status = 'RECEIVED'; return json({ message: 'This finder report is no longer pending handover.' }, 409); }
      if (state.failure) return json({ message: state.failure === 429 ? 'Too many requests.' : '' }, state.failure);
      state.sent = '2026-10-25T11:00:00+08:00';
      return json({ message: 'Handover reminder recorded.', data: { sent_at: state.sent, next_reminder_at: '2026-10-25T12:00:00+08:00', deduplicated: false } });
    }
    if (path === 'staff/finder-reports/41') return json({ data: { report_id: 41, status: state.status, item_description: 'Fictional report', found_at: '2026-10-25T09:00:00+08:00', last_handover_reminder_at: state.sent } });
    if (path === 'my/notifications/unread-count') return json({ unread_count: 1 });
    if (path === 'my/notifications') return json(paged([{ notification_id: 7, kind: 'finder_handover_requested', message, target_type: 'finder_report', target_id: 41, possible_item_id: null, created_at: '2026-10-25T11:00:00+08:00', read_at: null }]));
    if (path === 'my/notifications/7/read') return json({ data: { notification_id: 7, read_at: '2026-10-25T12:00:00+08:00' } });
    if (path === 'my/finder-reports/41') return json({ data: { report_id: 41, status: 'PENDING', item_description: 'Fictional report' } });
    if (['categories', 'storage-locations', 'staff/finder-reports/41/images', 'my/finder-reports'].includes(path)) return json(paged([]));
    state.unexpected.push(path); return json({}, 500);
  });
  const page = await context.newPage(); page.setDefaultTimeout(3000);
  return { page, state, close: async () => { await context.close(); assert.deepEqual(state.unexpected, []); } };
}
async function send(page) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirm action', exact: true });
  await dialog.getByRole('button', { name: 'Send reminder', exact: true }).click();
}
test('staff reminder confirms, cancels with keyboard, shows real success and last-sent time without handover', async () => {
  const f = await fixture();
  try {
    await f.page.goto(origin + '/staff/finder-reports/41');
    await f.page.getByRole('button', { name: label, exact: true }).click();
    const dialog = f.page.getByRole('dialog', { name: 'Confirm action', exact: true });
    await dialog.getByText(/does not record receipt/).waitFor();
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await f.page.setViewportSize({ width, height: 900 });
      assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
      await f.page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
    }
    await f.page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    assert.equal(f.state.writes.length, 0);
    await send(f.page);
    await f.page.getByRole('status').filter({ hasText: 'Handover reminder recorded.' }).waitFor();
    await f.page.getByText(/Last reminder sent/).waitFor();
    assert.deepEqual(f.state.writes.map(row => row.path), ['staff/finder-reports/41/request-handover']);
    await f.page.getByRole('button', { name: 'Record physical handover', exact: true }).waitFor();
  } finally { await f.close(); }
});
for (const failure of [409, 429, 503]) test(`reminder handles ${failure} without false success and refreshes conflicts`, async () => {
  const f = await fixture();
  try {
    f.state.failure = failure; await f.page.goto(origin + '/staff/finder-reports/41'); await send(f.page);
    await f.page.getByRole('alert').waitFor();
    assert.equal(await f.page.getByRole('status').filter({ hasText: 'Handover reminder recorded.' }).count(), 0);
    if (failure === 409) await f.page.getByRole('button', { name: label, exact: true }).waitFor({ state: 'hidden' });
    if (failure === 503) {
      const key = f.state.writes[0].body.request_id; f.state.failure = null; await send(f.page);
      await f.page.getByRole('status').filter({ hasText: 'Handover reminder recorded.' }).waitFor();
      assert.equal(f.state.writes[1].body.request_id, key, 'Uncertain failures reuse the same idempotency key');
    }
  } finally { await f.close(); }
});
test('owner sees private reminder text and own-report link in existing bell', async () => {
  const f = await fixture('user');
  try {
    await f.page.goto(origin + '/my/finder-reports');
    await f.page.getByRole('button', { name: 'Notifications, 1 unread', exact: true }).click();
    const dialog = f.page.getByRole('dialog', { name: 'Notifications', exact: true });
    await dialog.getByText(message, { exact: true }).waitFor();
    await dialog.getByRole('link', { name: 'Open my report', exact: true }).click();
    await f.page.waitForURL('**/my/finder-reports?report=41');
    await f.page.getByRole('heading', { name: 'Your report #41', exact: true }).waitFor();
  } finally { await f.close(); }
});
