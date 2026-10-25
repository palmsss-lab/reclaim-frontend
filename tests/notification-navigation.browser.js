// Playwright CLI, Vite on 127.0.0.1:5175. All API responses and read actions are synthetic; production is never contacted.
async page => {
  let checks = 0;
  const check = (value, message) => { if (!value) throw new Error(message); checks++; };
  const origin = 'http://127.0.0.1:5175';
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTimezoneOverride', { timezoneId: 'America/Los_Angeles' });
  const date = '2026-10-25T10:00:00+08:00';
  const state = { failure: null, hold: false, reads: [], writes: [], role: 'user' };
  const events = [
    ['finder_handover_requested', 'finder_report', 303, 'PENDING'], ['finder_received', 'finder_report', 304, 'RECEIVED'], ['finder_closed', 'finder_report', 305, 'CLOSED'],
    ['possible_match', 'missing_report', 303, 'OPEN'], ['missing_reviewed', 'missing_report', 304, 'RESOLVED'],
    ['claim_rejected', 'claim', 303, 'REJECTED'], ['claim_returned', 'claim', 304, 'RETURNED'], ['claim_verification_requested', 'claim', 305, 'PENDING'],
  ];
  const notices = events.map(([kind, target_type, target_id], i) => ({ notification_id: i + 1, kind, target_type, target_id, message: 'Fictional private update: ' + kind, created_at: date, read_at: date, possible_item_id: kind === 'possible_match' ? 201 : null }));
  const base = { item_description: 'Fictional campus backpack with a stitched pocket', public_description: 'Fictional public backpack', category_name: 'Bags', found_at: date, lost_at: date, submitted_at: date, created_at: date, found_place: 'Fictional library', last_known_location: 'Fictional classroom', evidence_text: 'Own fictional evidence', has_proof_image: false };
  const list = data => ({ data, total: data.length, current_page: 1, last_page: 1, per_page: 20 });
  await page.context().addCookies([{ name: 'XSRF-TOKEN', value: 'synthetic-csrf', url: origin }]);
  await page.context().route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.slice(5);
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const json = (body, status = 200) => route.fulfill({ json: body, status });
    if (request.method() !== 'GET') {
      state.writes.push(path);
      check(/^my\/notifications\/\d+\/read$/.test(path), 'Only synthetic notification read writes are allowed');
      return json({ data: { notification_id: Number(path.split('/')[2]), read_at: date } });
    }
    state.reads.push(path);
    if (path === 'me') return json({ user_id: 1, person_id: state.role === 'user' ? 1 : null, staff_id: state.role === 'staff' ? 1 : null, email_verified: true, full_name: 'Fictional account', permissions: { manage_accounts: false } });
    if (path === 'me/profile') return json({ data: { person: { full_name: 'Fictional user' }, email_verified: true } });
    if (path === 'my/notifications/unread-count') return json({ unread_count: 0 });
    if (path === 'my/notifications') return json(list(notices));
    if (path === 'my/claims/201') return json({}, 404);
    const selected = path.match(/^my\/(finder-reports|missing-reports|claims)\/(\d+)$/);
    if (selected) {
      if (state.hold) await new Promise(resolve => { state.release = resolve; });
      if (state.failure) return json({}, state.failure);
      if (Number(selected[2]) === 999) return json({}, 404);
      const target = selected[1] === 'claims' ? 'claim' : selected[1] === 'finder-reports' ? 'finder_report' : 'missing_report';
      const event = events.find(row => row[1] === target && row[2] === Number(selected[2]));
      const status = target === 'finder_report' && Number(selected[2]) === 303 && state.updated ? 'RECEIVED' : event?.[3];
      return json({ data: { ...base, report_id: Number(selected[2]), item_id: Number(selected[2]), status: target === 'claim' ? undefined : status, outcome: status, reviewed_at: status === 'PENDING' ? null : '2026-10-25 10:00:00' } });
    }
    if (path === 'public/items/201') return json({ data: { ...base, item_id: 201, images: [], received_at: date } });
    if (path === 'public/categories' || path === 'categories') return json(list([{ category_id: 1, category_name: 'Bags' }]));
    if (path.endsWith('/images')) return json(list([]));
    if (['my/finder-reports', 'my/missing-reports', 'my/claims'].includes(path)) return json(list(Array.from({ length: 20 }, (_, i) => ({ ...base, report_id: 100 + i, item_id: 100 + i, status: path.includes('missing') ? 'OPEN' : 'PENDING', outcome: 'PENDING' }))));
    if (path === 'public/items') return json(list(Array.from({ length: 15 }, (_, i) => ({ ...base, item_id: 201 + i, received_at: date, images: [] }))));
    return json(list([]));
  });
  const targetPath = n => '/my/' + (n.target_type === 'claim' ? 'claims?item=' : n.target_type === 'finder_report' ? 'finder-reports?report=' : 'missing-reports?report=') + n.target_id;
  const waitPage = () => page.waitForFunction(() => !document.querySelector('.loading-state'));
  const selectedHeading = n => page.getByRole('heading', { name: (n.target_type === 'claim' ? 'Your claim for item #' : 'Your report #') + n.target_id, exact: true });
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    for (const n of notices) {
      const start = targetPath(n).split('?')[0];
      await page.goto(origin + start); await waitPage();
      await page.evaluate(() => scrollTo({ top: 900, behavior: 'instant' }));
      await page.getByRole('button', { name: 'Notifications, 0 unread', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Notifications', exact: true });
      const row = dialog.getByRole('listitem').filter({ hasText: n.message });
      await row.getByRole('link', { name: n.target_type === 'claim' ? 'Open my claim' : 'Open my report', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' }); await waitPage();
      const heading = selectedHeading(n); await heading.waitFor();
      check(await heading.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), n.kind + ' destination is visible at ' + width);
      check(await heading.evaluate(el => el.closest('[data-notification-target]')?.contains(document.activeElement)), n.kind + ' destination receives focus');
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Notification destination has no horizontal overflow');
      if (n.kind !== 'finder_handover_requested' && n.kind !== 'claim_verification_requested') check((await page.getByText(/^Reviewed /).textContent()).includes('Oct 25, 2026, 10:00 AM'), 'Review date uses Philippine local time on a Los Angeles device');
      await page.reload(); await heading.waitFor(); await waitPage();
      check(await heading.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'Selected record remains useful after refresh');
    }
    await page.goto(origin + '/my/finder-reports'); await waitPage();
    await page.getByRole('button', { name: 'Notifications, 0 unread', exact: true }).click();
    await page.getByRole('dialog', { name: 'Notifications', exact: true }).getByRole('listitem').filter({ hasText: 'Fictional private update: possible_match' }).getByRole('link', { name: 'View possible item', exact: true }).click();
    await page.waitForURL('**/items/201'); await waitPage();
    check(await page.evaluate(() => document.activeElement?.id === 'main' && scrollY < 5), 'Possible-item links open the public item at the top with page focus');
    await page.goto(origin + '/my/finder-reports?report=303'); await waitPage();
    await page.getByRole('button', { name: 'Close selected record', exact: true }).click();
    await page.getByRole('heading', { name: 'Your report #303', exact: true }).waitFor({ state: 'hidden' });
    check(await page.getByRole('heading', { name: 'Your report #303', exact: true }).count() === 0, 'Closing a selection removes only selected context');
    check(await page.evaluate(() => document.activeElement?.id === 'main'), 'Closing a selection returns focus to page context');
    await page.goto(origin + '/my/finder-reports'); await waitPage();
    await page.evaluate(() => scrollTo({ top: 700, behavior: 'instant' }));
    const before = await page.evaluate(() => scrollY);
    const browseLink = page.locator('.public-header-inner > .public-navigation').getByRole('link', { name: 'Browse items', exact: true });
    if (await browseLink.isVisible()) await browseLink.click();
    else {
      await page.getByRole('button', { name: 'Main navigation', exact: true }).click();
      await page.getByRole('dialog', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Browse items', exact: true }).click();
    }
    await waitPage();
    check(await page.evaluate(() => scrollY < 5), 'A new route starts at the top');
    await page.goBack(); await waitPage();
    await page.waitForFunction(y => Math.abs(scrollY - y) < 5, before);
    check(Math.abs(await page.evaluate(() => scrollY) - before) < 5, 'Back restores the previous page position');
    await page.goForward(); await waitPage();
    check(await page.evaluate(() => scrollY < 5), 'Forward restores the browse page position');
  }
  await page.goto(origin + '/my/finder-reports?report=303'); await waitPage();
  const calls = state.reads.filter(path => path === 'my/finder-reports/303').length;
  state.updated = true; state.hold = true;
  await page.getByRole('button', { name: 'Notifications, 0 unread', exact: true }).click();
  await page.getByRole('dialog', { name: 'Notifications', exact: true }).getByRole('listitem').filter({ hasText: 'Fictional private update: finder_handover_requested' }).getByRole('link', { name: 'Open my report', exact: true }).click();
  const selection = page.locator('[data-notification-target]');
  await selection.getByText('Loading selected record…', { exact: true }).waitFor();
  check(await selection.locator('.user-status').count() === 0, 'Reopening the same selected record clears stale status while loading');
  state.hold = false; state.release(); await waitPage();
  check(state.reads.filter(path => path === 'my/finder-reports/303').length > calls, 'The same notification URL reloads current owner-scoped data');
  await selection.getByText('Received by staff', { exact: true }).waitFor();
  for (const failure of [404, 503]) {
    state.failure = failure;
    await page.goto(origin + '/my/finder-reports?report=303'); await waitPage();
    await page.getByRole('alert').waitFor();
    check(await page.getByRole('heading', { name: 'Your report #303', exact: true }).isVisible(), 'Selected-record errors retain a clear destination');
    state.failure = null;
    if (failure === 503) { await page.getByRole('alert').getByRole('button', { name: 'Retry loading', exact: true }).click(); await waitPage(); }
  }
  check(state.reads.every(path => !path.includes('recipient') && !path.includes('user_id=')), 'Destination requests remain owner scoped');
  await page.goto(origin + '/my/finder-reports?report=invalid'); await waitPage();
  check(await page.locator('[data-notification-target]').count() === 0, 'Malformed destination IDs never create a selected record');
  state.role = 'staff'; await page.setViewportSize({ width: 1440, height: 640 });
  await page.goto(origin + '/staff'); await waitPage();
  const links = page.locator('.staff-sidebar a'); await links.first().focus();
  for (let i = 1; i < await links.count(); i++) {
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; });
    check(await page.evaluate(() => document.activeElement.closest('.staff-sidebar') !== null), 'Desktop staff navigation remains keyboard reachable in a short viewport');
  }
  return { checks, notificationKinds: notices.length, widths: [320, 375, 390, 768, 1024, 1440], evidence: 'Synthetic API fixtures only; no live API mutations' };
}
