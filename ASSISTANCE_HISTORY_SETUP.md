# Complaint history and notification read state

Apply `supabase/migrations/20261107120000_preserve_assistance_history_and_sync_notifications.sql`
in the intended Supabase project's SQL editor **before** deploying this application version.
The migration is transactional. It performs no complaint deletions and sends no emails.

## Resulting behavior

- Opening the bell marks its displayed notifications read. Mark all read explicitly
  includes older notifications outside the bell's latest 20 items.
- Viewing a page of reports marks only that administrator's alerts for those reports
  read. Closing a report, successful self/proxy check-in, or session expiry clears
  that report's unread alerts for all recipients. Other alerts are unaffected.
- Unresolved includes open, acknowledged, and expired reports. Resolved contains
  resolved reports; Dismissed contains dismissed reports. All includes every status.
- Lists are filtered and paginated on the server, 25 reports per page. A notification
  link finds its specific report even if it is older than the first page.
- Original complaints and their activity history cannot be deleted through normal
  application/service-role access. Session end expires requests rather than deleting
  them. The old Clear Finished action is removed.
- Previous leader notes and status changes remain in Activity history. Existing
  reports receive a clearly labelled baseline; previous edits and reports already
  deleted before this migration cannot be reconstructed without a suitable backup.
- Worker, event, and session records referenced by complaints cannot be hard-deleted.
  Deactivate or retain those records to keep the supporting evidence intact. An
  administrator with database-owner privileges can still alter database protections;
  this is application-level evidence retention, not an external immutable archive.
- Notification retention remains separate. Removing an old bell notification does
  not remove its complaint or activity history. Access to history is checked against
  the administrator's current department/team scope on every request.

## Verification

The isolated PostgreSQL runtime test loads the real notification, assistance, and
history migrations into PGlite with minimal supporting tables. It exercises recipient
isolation, scope rejection, pagination, resolution, self check-in, session expiry,
note preservation and deletion protection without connecting to the live project.

Install `@electric-sql/pglite` into a temporary directory, then run:

```powershell
node supabase/tests/database/assistance_history_runtime_test.mjs <temporary-dependency-directory>
```

After deployment, verify with two administrators in the same scope and another in
a different scope: view one report, resolve a second, end a session with an open
report, and review each history tab. The first administrator's viewed alert should
clear independently; terminal reports should clear alerts for both administrators.

The database access design follows [Supabase's function security guidance](https://supabase.com/docs/guides/database/functions):
authentication and scope are checked within each exposed function, function execution
is explicitly granted, and security-definer functions pin an empty search path.
