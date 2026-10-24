# Reclaim frontend

The signed-in user navigation has a private notification bell backed by the real Laravel API. It shows loading, empty and error states without mock fallback. Selecting a notice marks it read before opening the owner's report or claim. Mark all read is explicit; counts refresh on navigation, opening/reading, focus and returning to the app, without polling.

Staff can send a possible-match notice from a missing-report detail page. A notice does not create a claim, confirm ownership or promise return. Existing role and privacy checks remain server enforced.

The backend notification API and additive migration must be available before using the bell. Publishing the repositories does not apply that migration. See the [backend notification contract](https://github.com/palmsss-lab/reclaim-backend/blob/main/docs/NOTIFICATIONS_API.md).

## Verification

Run `npm test`, `npm run build`, and `node scripts/verify-notifications.mjs`. The browser script uses intercepted synthetic API responses.

For connected verification, place the backend checkout beside this directory as `reclaim-backend`, or set `RECLAIM_TEST_BACKEND` to its absolute path. Run `node scripts/verify-notifications-isolated.mjs` for the real API/browser workflow, or add `--notifications-tests` for the backend notification test class. Add `--full-backend` with that flag for the backend suite. The runner provisions and verifies its own MySQL data directory on loopback port 3307, uses isolated private storage and array mail, and refuses occupied ports. It does not use development or production records. MySQL results do not verify TiDB runtime behavior.
