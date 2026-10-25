// Playwright CLI, with Vite on 127.0.0.1:5175: open about:blank#after, then run-code --filename=tests/layouts.browser.js.
// Use about:blank#interactions for drawers/forms/retries, or about:blank for baseline captures. Every API response is synthetic; writes are blocked.
async (page) => {
  const assert = {
    equal(actual, expected, message) { if (actual !== expected) throw new Error(message + ': ' + actual + ' !== ' + expected); },
    deepEqual(actual, expected, message) { this.equal(JSON.stringify(actual), JSON.stringify(expected), message); },
  };
  const interactions = page.url().includes('#interactions');
  const after = interactions || page.url().includes('#after');
  const phase = after ? 'after' : 'before';
  const origin = 'http://127.0.0.1:5175';
  const output = '.playwright-cli/layouts-' + phase;
  const state = { role: 'user', mode: 'normal', verified: true, unexpected: [], writes: [], errors: [] };
  const long = 'Navy campus backpack with a silver zip and a stitched front pocket';
  const date = '2026-10-24T11:30:00+08:00';
  const found = { report_id: 101, status: 'PENDING', item_description: long, found_place: 'Fictional campus reading room', category_id: 1, category_name: 'Bags and accessories', found_at: date, submitted_at: date, created_at: date, reporter_name: 'Fictional Finder', reporter_email: 'finder@example.test', reporter_contact: 'Fictional contact', received_item_id: null };
  const missing = { ...found, report_id: 102, status: 'OPEN', last_known_location: found.found_place, lost_at: date };
  const person = { person_id: 101, full_name: 'Fictional Walk-in Visitor', contact_details: 'visitor@example.test', is_account_holder: false };
  const location = { location_id: 1, location_code: 'TEST-A', location_description: 'Fictional test cabinet' };
  const category = { category_id: 1, category_name: 'Bags and accessories' };
  const item = { item_id: 201, item_description: long, public_description: long, category_name: category.category_name, category, category_id: 1, finder: person, received_by: { full_name: 'Fictional Staff' }, found_place: found.found_place, found_at: date, received_at: date, is_returned: false, current_assignment: { assignment_no: 1, ...location, assigned_at: date }, current_location_code: location.location_code, images: [] };
  const claim = { item_id: 201, claimant_id: 101, claimant: person, item, public_description: long, category_name: category.category_name, submitted_at: date, reviewed_at: null, outcome: 'PENDING', evidence_text: 'Fictional ownership evidence with a distinctive stitched pocket. This private identifying description must remain readable at every width.', has_proof_image: false };
  const list = data => ({ data, total: data.length, current_page: 1, last_page: 1, per_page: 20 });
  page.on('pageerror', error => state.errors.push(error.message));
  await page.context().route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { state.unexpected.push('external origin'); return route.abort(); }
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/sanctum/')) return route.continue();
    if (request.method() !== 'GET') { state.writes.push(url.pathname); return route.abort(); }
    const path = url.pathname.replace('/api/', '');
    const respond = (data, status = 200) => route.fulfill({ json: data, status });
    if (path === 'me') return state.role === 'guest' ? respond({}, 401) : respond({ user_id: 101, full_name: 'Fictional ' + state.role, email: 'fictional@example.test', email_verified: state.verified, staff_id: state.role === 'staff' ? 1 : null, person_id: state.role === 'user' ? 101 : null, permissions: { manage_accounts: false } });
    if (path === 'me/profile') return respond({ data: { id: 101, email: 'fictional@example.test', email_verified: state.verified, username: 'fictional_user', person, staff: { staff_id: 1, full_name: 'Fictional Staff' }, has_password: true, google_linked: false } });
    if (path === 'me/security') return respond({ data: { email: 'fictional@example.test', username: 'fictional_user', has_local_password: true, google_linked: false } });
    if (path === 'my/notifications/unread-count') return respond({ unread_count: 2 });
    if (path === 'my/notifications') return respond(list([{ notification_id: 1, kind: 'finder_handover_requested', target_type: 'finder_report', target_id: 101, message: 'Staff have not received your reported item. Please bring it to the office for physical handover.', created_at: date, read_at: null }]));
    if (state.holdPath === path) await new Promise(resolve => { (state.releases ||= []).push(resolve); });
    if (state.failedPath === path || (state.mode === 'error' && !path.endsWith('/images'))) return respond({ message: 'Fictional outage' }, 503);
    const rows = data => respond(list(state.mode === 'empty' ? [] : data));
    if (path === 'public/categories' || path === 'categories') return rows([category]);
    if (path === 'people') return rows([person, { ...person, person_id: 102, full_name: 'Fictional Account Holder', is_account_holder: true }]);
    if (path === 'storage-locations') return rows([location, { ...location, location_id: 2, location_code: 'TEST-B' }]);
    if (path === 'items' || path === 'public/items') return rows([item, { ...item, item_id: 202, public_description: 'Fictional umbrella with a wooden handle' }]);
    if (path === 'items/201' || path === 'public/items/201') return respond({ data: item });
    if (path === 'items/201/storage-history') return rows([{ item_id: 201, assignment_no: 1, location, assigned_by: { full_name: 'Fictional Staff' }, assigned_at: date, removed_at: null }]);
    if (path === 'items/201/claims' || path === 'reports/pending-claims') return rows([claim]);
    if (path === 'reports/return-rates') return rows([{ ...category, received_items: 5, returned_items: 2, return_rate_percent: 40 }]);
    if (path === 'reports/storage-occupancy') return rows([{ ...location, current_item_count: 3, average_holding_days: 2.5 }]);
    if (path === 'reports/monthly-intake') return rows([{ month: '2026-10', monthly_intake: 5, running_total: 9 }]);
    if (path === 'my/claims/201') return respond({}, 404);
    if (path === 'my/claims') return rows([claim, { ...claim, item_id: 202, outcome: 'REJECTED', reviewed_at: date }]);
    if (path === 'my/finder-reports' || path === 'staff/finder-reports') return rows([found]);
    if (path === 'my/missing-reports' || path === 'staff/missing-reports') return rows([missing]);
    if (path.endsWith('finder-reports/101')) return respond({ data: found });
    if (path.endsWith('missing-reports/102')) return respond({ data: missing });
    if (path === 'my/finder-reports/101/images') return rows([{ image_id: 1, updated_at: date }]);
    if (path === 'my/finder-reports/101/images/1/content') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
    if (path.endsWith('/images')) return rows([]);
    state.unexpected.push(path); return respond({}, 500);
  });
  const screens = [
    ['guest', '/', 'browse'], ['guest', '/items/201', 'public-item'],
    ['guest', '/login', 'login'], ['guest', '/register', 'register'], ['guest', '/forgot-password', 'forgot'], ['guest', '/reset-password', 'reset'],
    ['user', '/my', 'user-dashboard'], ['user', '/profile', 'user-profile'], ['user', '/change-password', 'user-security'], ['user', '/set-password', 'set-password'], ['user', '/verify-email', 'verify-email'],
    ['user', '/my/finder-reports', 'finder-reports'], ['user', '/my/missing-reports', 'missing-reports'], ['user', '/my/claims', 'user-claims'],
    ['staff', '/staff', 'staff-dashboard'], ['staff', '/staff/finder-reports', 'finder-queue'], ['staff', '/staff/finder-reports/101', 'finder-review'],
    ['staff', '/staff/missing-reports', 'missing-queue'], ['staff', '/staff/missing-reports/102', 'missing-review'],
    ['staff', '/staff/items', 'inventory'], ['staff', '/staff/items/new', 'intake'], ['staff', '/staff/items/201', 'item-detail'],
    ['staff', '/staff/claims', 'staff-claims'], ['staff', '/staff/reports', 'reports'], ['staff', '/staff/profile', 'staff-profile'],
    ['staff', '/staff/security', 'staff-security'], ['staff', '/staff/people', 'people'], ['staff', '/staff/reference-data', 'categories'], ['staff', '/staff/reference-data?type=locations', 'locations'],
  ];
  const measurements = [], findings = [];
  async function visit(role, path) {
    state.role = role; await page.goto(origin + path); await page.locator('main h1').first().waitFor();
    await page.waitForFunction(() => !document.querySelector('.loading-state'));
  }
  async function measure(name, width) {
    const data = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1,
      narrowCells: [...document.querySelectorAll('td')].filter(el => el.innerText.trim().length > 28 && el.getBoundingClientRect().width < 96).length,
      clippedControls: [...document.querySelectorAll('main button, main input, main select')].filter(el => { const rect = el.getBoundingClientRect(); return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1); }).length,
      scrollTables: [...document.querySelectorAll('.table-scroll')].filter(el => el.scrollWidth > el.clientWidth + 1).length,
    }));
    measurements.push({ name, width, ...data });
    if (data.overflow || data.narrowCells || data.clippedControls) findings.push({ name, width, ...data });
    if (after) { assert.equal(data.overflow, false, name + ' page overflow at ' + width); assert.equal(data.narrowCells, 0, name + ' fragments text at ' + width); assert.equal(data.clippedControls, 0, name + ' clips controls at ' + width); }
    if ([320, 768, 1440].includes(width)) await page.screenshot({ path: output + '/' + name + '-' + width + '.png', fullPage: true });
  }
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    if (interactions) break;
    await page.setViewportSize({ width, height: 900 });
    for (const [role, path, name] of screens) { await visit(role, path); await measure(name, width); }
    for (const [path, button, name] of [
      ['/my/finder-reports', 'Report found item', 'found-form'], ['/my/missing-reports', 'Report missing item', 'missing-form'],
      ['/my/finder-reports', 'Manage photos for report #101', 'report-images'], ['/staff/items/201', 'Transfer storage', 'transfer-form'],
      ['/staff/finder-reports/101', 'Record physical handover', 'handover-form'],
    ]) {
      await visit(path.startsWith('/staff') ? 'staff' : 'user', path);
      const trigger = page.getByRole('button', { name: button, exact: true }).first();
      if (!await trigger.count()) { findings.push({ name, unavailable: button }); continue; }
      await trigger.click(); await page.locator('dialog[open]').waitFor(); await measure(name, width);
      const dialog = page.locator('dialog[open]').last();
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, name + ' focus is contained');
      assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, name + ' no dialog overflow');
      await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    }
  }
  for (const mode of interactions ? [] : ['empty', 'error']) for (const [role, path, name] of screens.filter(row => ['browse', 'user-dashboard', 'finder-reports', 'missing-reports', 'user-claims', 'staff-dashboard', 'inventory', 'staff-claims', 'reports'].includes(row[2]))) {
    state.mode = mode; await page.setViewportSize({ width: 320, height: 900 }); await visit(role, path); await measure(name + '-' + mode, 320);
  }
  if (interactions) for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 640 });
    for (const [role, path, label] of [['user', '/my', 'Main navigation'], ['staff', '/staff', 'Staff navigation']]) {
      await visit(role, path);
      const toggle = page.getByRole('button', { name: label, exact: true });
      if (await toggle.isVisible()) {
        await toggle.focus(); await page.keyboard.press('Enter');
        const drawer = page.getByRole('dialog', { name: label, exact: true });
        await drawer.waitFor(); await measure(label.replaceAll(' ', '-') + '-drawer', width);
        assert.equal(await drawer.evaluate(el => el.contains(document.activeElement)), true, 'Drawer focus');
        await page.keyboard.press('Escape'); await drawer.waitFor({ state: 'hidden' });
        assert.equal(await toggle.evaluate(el => el === document.activeElement), true, 'Drawer restores focus');
      }
    }
    await visit('user', '/my/claims'); await page.getByRole('button', { name: 'Notifications, 2 unread', exact: true }).click();
    const bell = page.getByRole('dialog', { name: 'Notifications', exact: true });
    await bell.getByText(/Staff have not received/).waitFor(); await measure('notification-dialog', width);
    await page.keyboard.press('Escape'); await bell.waitFor({ state: 'hidden' });
    for (const [role, path, label, name] of [
      ['user', '/items/201', 'Submit ownership claim', 'claim-form'],
      ['staff', '/staff/items/new', 'Start staff intake', 'intake-form'],
      ['staff', '/staff/items/201', 'Record walk-in claim', 'walk-in-claim-form'],
      ['staff', '/staff/people', 'Edit walk-in person Fictional Walk-in Visitor', 'person-correction'],
      ['staff', '/staff/items/201', 'View claim evidence', 'evidence-dialog'],
    ]) {
      await visit(role, path); const trigger = page.getByRole('button', { name: label, exact: true }).first(); await trigger.click();
      const dialog = page.locator('dialog[open]').last(); await dialog.waitFor(); await measure(name, width);
      assert.equal(await dialog.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth + 1; }), true, name + ' fits short viewport');
      assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, name + ' initial focus');
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    }
    state.verified = false; await visit('user', '/verify-email'); await page.getByLabel('Digit 1 of 6', { exact: true }).waitFor(); await measure('verification-code-form', width); state.verified = true;
    state.failedPath = 'categories'; await visit('staff', '/staff/items/new'); await page.getByRole('button', { name: 'Start staff intake', exact: true }).click();
    const form = page.locator('dialog[open]');
    const failedReference = form.getByRole('alert').filter({ hasText: 'Official category could not be loaded' });
    await failedReference.getByRole('button', { name: 'Retry loading', exact: true }).waitFor();
    state.failedPath = null; await failedReference.getByRole('button', { name: 'Retry loading', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#category_id')?.disabled); await page.keyboard.press('Escape'); await form.waitFor({ state: 'hidden' });
    state.holdPath = 'my/finder-reports'; state.role = 'user'; await page.goto(origin + '/my/finder-reports');
    await page.getByText('Loading found-item reports…', { exact: true }).waitFor(); await measure('reports-loading', width);
    state.holdPath = null; for (const release of state.releases || []) release(); state.releases = [];
    await page.waitForFunction(() => !document.querySelector('.loading-state'));
  }
  assert.deepEqual(state.writes, [], 'Layout checks must never submit mutations');
  assert.deepEqual(state.unexpected, [], 'Every intercepted API path must be understood');
  assert.deepEqual(state.errors, [], 'No browser runtime exceptions');
  return { phase, interactions, screens: screens.length, measurements: measurements.length, findings, mutations: state.writes.length };
}
