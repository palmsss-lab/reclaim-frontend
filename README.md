# Reclaim frontend

The signed-in user navigation has a private notification bell backed by the real Laravel API. It shows loading, empty and error states without mock fallback. Selecting a notice marks it read before opening the owner's report or claim. Mark all read is explicit; counts refresh on navigation, opening/reading, focus and returning to the app, without polling.

Staff can send a possible-match notice from a missing-report detail page. A notice does not create a claim, confirm ownership or promise return. Existing role and privacy checks remain server enforced.

The backend notification API and additive migration must be available before using the bell. Publishing the repositories does not apply that migration. See the [backend notification contract](https://github.com/palmsss-lab/reclaim-backend/blob/main/docs/NOTIFICATIONS_API.md).

## Verification

Run `npm test`, `npm run build`, and `node scripts/verify-notifications.mjs`. The browser script uses intercepted synthetic API responses.

For connected verification, place the backend checkout beside this directory as `reclaim-backend`, or set `RECLAIM_TEST_BACKEND` to its absolute path. Run `node scripts/verify-notifications-isolated.mjs` for the real API/browser workflow, or add `--notifications-tests` for the backend notification test class. Add `--full-backend` with that flag for the backend suite. The runner provisions and verifies its own MySQL data directory on loopback port 3307, uses isolated private storage and array mail, and refuses occupied ports. It does not use development or production records. MySQL results do not verify TiDB runtime behavior.

## Staff audit workflow fixes

Staff item details now offer **Record walk-in claim** using the existing claim endpoint and an existing, unlinked person. This records a pending claim only; account holders submit their own claims. `/staff/people` corrects walk-in details on their existing person ID, while account profiles remain owner-managed. The staff-only people API now provides `is_account_holder`; deploy the matching backend response and claim guard with this frontend. No schema or endpoint was added.

Reference controls load independently and distinguish loading, errors with retry, and empty results. Finder handover needs categories and storage only. Received-report links use persistent `received_item_id`; handover/closure conflicts refresh the report without replaying the action. Staff intake inputs explicitly use Philippine wall time and still send ISO timestamps. Report panels have independent retry states; monthly running totals include receipts before the selected start date. Staff photo replacement reloads its private preview even when `updated_at` is unchanged.

Focused checks: `node --test tests/staff-audit.test.js tests/staff-forms.test.js tests/dates.test.js tests/workflow-navigation.test.js tests/api-client.test.js tests/record-image.test.js`. Browser checks: `node --test scripts/verify-staff-audit.mjs` intercept every API request with synthetic data, check 320/375/390/768/1024/1440px and keyboard dialog behavior, and do **not** verify a connected Laravel deployment. Backend checks: `node scripts/verify-workflow.mjs --staff-audit-only --backend-only --auth-only` starts a separate disposable loopback MySQL instance and guarded test databases. It never uses the development/TiDB connection.
