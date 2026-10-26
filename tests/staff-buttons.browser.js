// Playwright CLI; Vite on 127.0.0.1:5175. Fictional API fixtures only, including failed mutations.
async page => {
  let checks = 0, writes = 0, release, started;
  const check = (value, message) => { if (!value) throw new Error(message); checks++; };
  const origin = 'http://127.0.0.1:5175', date = '2026-10-25T10:00:00+08:00';
  const person = { person_id: 101, full_name: 'Fictional Walk-in Visitor', contact_details: 'visitor@example.test', is_account_holder: false };
  const location = { location_id: 1, location_code: 'TEST-A', location_description: 'Fictional cabinet' };
  const item = { item_id: 201, item_description: 'Fictional campus backpack', received_at: date, found_at: date, found_place: 'Fictional library', is_returned: false, current_location: location, current_assignment: { ...location, assignment_no: 1 }, images: [] };
  const report = { report_id: 102, item_description: item.item_description, status: 'OPEN', lost_at: date, created_at: date, last_known_location: 'Fictional library', reporter_name: 'Fictional Reporter' };
  const list = data => ({ data, total: data.length, current_page: 1, last_page: 1, per_page: 20 });
  await page.context().addCookies([{ name: 'XSRF-TOKEN', value: 'synthetic-csrf', url: origin }]);
  await page.context().route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.slice(5);
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ json: body, status });
    if (request.method() !== 'GET') {
      check(request.method() === 'POST' && /^items\/201\/(transfers|claims\/101\/(reject|return))$/.test(path), 'Only intended synthetic staff requests are allowed');
      check(request.headers()['x-xsrf-token'] === 'synthetic-csrf', 'Requests retain the existing CSRF contract');
      check(JSON.stringify(request.postDataJSON()) === JSON.stringify(path.endsWith('transfers') ? { location_id: 2 } : {}), 'Action payloads remain unchanged');
      writes++; await new Promise(resolve => { release = resolve; started(); });
      return json({ message: 'Fictional unavailable service' }, 503);
    }
    if (path === 'me') return json({ user_id: 1, staff_id: 1, email_verified: true, full_name: 'Fictional staff', permissions: { manage_accounts: false } });
    if (path === 'people') return json(list([person]));
    if (path === 'storage-locations') return json(list([location, { ...location, location_id: 2, location_code: 'TEST-B' }]));
    if (path === 'categories') return json(list([{ category_id: 1, category_name: 'Bags' }]));
    if (path === 'items/201') return json({ data: item });
    if (path === 'items/201/claims') return json(list([{ item_id: 201, claimant_id: 101, claimant: person, outcome: 'PENDING', evidence_text: 'Fictional evidence', submitted_at: date, reviewed_at: null, reviewed_by: null }]));
    if (path === 'public/items/201') return json({}, 404);
    if (path === 'public/items') return json(list([{ item_id: 201, public_description: 'Fictional published backpack' }]));
    if (path === 'staff/missing-reports/102') return json({ data: report });
    if (path === 'staff/finder-reports/101') return json({ data: { ...report, report_id: 101, status: 'PENDING', found_at: date, found_place: 'Fictional library' } });
    return json(list([]));
  });
  const settle = () => page.waitForFunction(() => !document.querySelector('.loading-state'));
  const visit = async path => { await page.goto(origin + path); await page.locator('main h1').waitFor(); await settle(); };
  async function searchLayout(input, button, name, width) {
    const field = await input.boundingBox(), action = await button.boundingBox();
    check(action.height >= 44 && action.width >= 44, name + ' touch target at ' + width);
    if (action.y >= field.y + field.height - 1) check(action.y - field.y - field.height >= 12, name + ' has space below its input at ' + width);
    else check(Math.abs(action.y + action.height - field.y - field.height) < 2, name + ' aligns with its input at ' + width);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' has no horizontal overflow');
  }
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await visit('/staff/people');
    await searchLayout(page.getByLabel('Search people', { exact: true }), page.getByRole('button', { name: 'Search', exact: true }), 'People search', width);
    const navigation = page.getByRole('button', { name: 'Staff navigation', exact: true });
    if (await navigation.isVisible()) {
      await navigation.focus(); await page.keyboard.press('Enter');
      const drawer = page.getByRole('dialog', { name: 'Staff navigation', exact: true }); await drawer.waitFor();
      await page.keyboard.press('Tab'); check(await drawer.evaluate(el => el.contains(document.activeElement)), 'Navigation contains keyboard focus');
      await page.keyboard.press('Escape'); await drawer.waitFor({ state: 'hidden' });
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Staff navigation');
      check(await navigation.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth) >= 3), 'Navigation restores visible keyboard focus');
    } else {
      await page.locator('.staff-sidebar a').first().focus(); await page.keyboard.press('Tab');
      check(await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'Desktop navigation reveals the focused action');
    }
    await visit('/staff/missing-reports/102');
    const opener = page.getByRole('button', { name: 'Notify possible match', exact: true }); await opener.focus(); await page.keyboard.press('Enter');
    await page.getByLabel('Possible item', { exact: true }).waitFor();
    await searchLayout(page.getByLabel('Search published items', { exact: true }), page.getByRole('button', { name: 'Search items', exact: true }), 'Possible-match search', width);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('dialog[open]'));
    await page.waitForFunction(() => document.activeElement?.textContent === 'Notify possible match');
    check(await opener.evaluate(el => el === document.activeElement), 'Possible-match dialog restores keyboard focus');
    await visit('/staff/finder-reports/101');
    if (width <= 640) {
      const receive = await page.getByRole('button', { name: 'Record physical handover', exact: true }).boundingBox();
      const close = await page.getByRole('button', { name: 'Close report', exact: true }).boundingBox();
      check(Math.abs(receive.width - close.width) < 2 && Math.abs(receive.x - close.x) < 2, 'Mobile handover actions align at ' + width);
    }
    await visit('/staff/items/201'); await page.getByRole('button', { name: 'Transfer storage', exact: true }).click();
    const transfer = page.getByRole('button', { name: 'Record transfer', exact: true });
    check(await transfer.evaluate(el => el.classList.contains('button-primary')), 'Transfer form has a clear primary action');
    check(await transfer.isDisabled(), 'Transfer stays disabled without a destination');
    await page.getByLabel('New storage location', { exact: true }).selectOption('2');
    let waiting = new Promise(resolve => { started = resolve; }); await transfer.click(); await waiting;
    await page.getByRole('button', { name: 'Transferring…', exact: true }).waitFor();
    await page.keyboard.press('Escape'); check(await page.locator('dialog[open]').count() === 1, 'Pending transfer cannot be dismissed');
    release(); await page.getByRole('alert').first().waitFor(); await transfer.waitFor();
    check(await page.getByLabel('New storage location', { exact: true }).inputValue() === '2', 'Transfer failure preserves the selection');
    await page.locator('dialog[open] [data-dialog-close]').click();
    await page.getByRole('dialog', { name: 'Confirm action', exact: true }).getByRole('button', { name: 'Discard changes', exact: true }).click();
    for (const [action, confirmLabel, loading] of [['Reject', 'Reject claim', 'Rejecting claim…'], ['Return item', 'Return item', 'Recording return…']]) {
      await visit('/staff/items/201'); await page.getByRole('button', { name: action, exact: true }).click();
      waiting = new Promise(resolve => { started = resolve; });
      await page.locator('.confirmation-dialog[open]').getByRole('button', { name: confirmLabel, exact: true }).click(); await waiting;
      const pending = page.getByRole('button', { name: loading, exact: true }); await pending.waitFor();
      check(await pending.isDisabled(), loading + ' prevents another click');
      check(await pending.locator('xpath=ancestor::div[contains(@class,"claim-decision")]').getAttribute('aria-busy') === 'true', 'Claim decision announces its pending state');
      release(); await page.getByRole('button', { name: action, exact: true }).waitFor(); await page.getByRole('alert').first().waitFor();
      check(await page.locator('.success-toast').count() === 0, 'Failed staff actions never show success');
    }
  }
  return { checks, widths: [320, 375, 390, 768, 1024, 1440], failedSyntheticRequests: writes, evidence: 'Intercepted local API fixtures; no connected API or database mutations' };
}
