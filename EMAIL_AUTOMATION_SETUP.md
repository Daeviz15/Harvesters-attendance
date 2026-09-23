# Automatic Attendance Email Setup

The email processor is intentionally split into a durable database outbox and a stateless Next.js sender. Supabase Cron invokes the sender every minute; no administrator action is required after an event has automatic emails enabled.

## 1. Configure an authenticated sending domain

Nodemailer is the SMTP client, not the email provider. Personal Gmail is supported only for the controlled test because Google limits it to 500 recipients per rolling 24 hours, can block server logins it considers suspicious, and rewrites the sender to the authenticated Gmail address. DNS records for `globeattendance.org` do not authenticate an `@gmail.com` From address.

Controlled personal-Gmail test settings:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
GOOGLE_EMAIL_ADDRESS=<the Gmail address>
GOOGLE_APP_PASSWORD=<16-character App Password with spaces removed>
EMAIL_ALLOW_PERSONAL_GMAIL_AUTOMATION=true
EMAIL_FROM_NAME=Harvesters Globe Attendance
EMAIL_FROM_ADDRESS=admin@globeattendance.org
EMAIL_REPLY_TO=admin@globeattendance.org
EMAIL_GMAIL_AUTHORIZED_FROM_ADDRESSES=admin@globeattendance.org
SMTP_MAX_CONNECTIONS=1
SMTP_RATE_LIMIT=1
```

The preferred Google production profile is a dedicated Google Workspace account on the church domain using `smtp-relay.gmail.com`, with SPF, DKIM, and DMARC aligned to the From domain. OAuth2 is preferred for new Gmail integrations; an App Password remains supported when 2-Step Verification is enabled. Remove `EMAIL_ALLOW_PERSONAL_GMAIL_AUTOMATION` after the controlled test.

Resend may remain an explicit manual fallback by changing `SMTP_HOST` and its credentials, but it is not an automatic failover: SMTP usage consumes the same Resend quota as API usage, and automatic provider failover could duplicate a message after an ambiguous SMTP response.

## 2. Install the outbox migration

Deploy the tracked migrations with `supabase db push --linked`. The outbox and Vault migrations are safe to install before activation: existing events have automatic email disabled by default, existing users do not receive welcome messages retroactively, and Cron is a separate migration.

- `20260805130000_email_notification_automation.sql` installs the private durable outbox and service-role RPCs.
- `20260805131000_email_notification_vault_secrets.sql` stores the canonical processor origin and generates a 64-character bearer credential directly inside encrypted Supabase Vault.
- `20260805132000_activate_email_notification_cron.sql` validates the protected route configuration and activates the one-minute processor schedule after deployment verification.

The worker outbox stores welcome, reminder, and attendance follow-up messages. Two later safety migrations must also be present before rollout:

- `20260909120000_harden_event_email_delivery.sql` disables every existing event, removes worker follow-up CC fan-out, and revalidates each recipient immediately before claim.
- `20260923120000_add_leadership_attendance_summaries.sql` adds a separate service-role-only leadership-summary outbox and an immutable occurrence roster. Summaries contain counts only; worker names and email addresses are never placed in a leadership email.

Leadership routing is intentionally non-overlapping: a department head receives one department summary, a team admin receives one team summary, a super admin receives one global summary, and reports-only admins receive no automatic summary. If a person holds more than one leadership assignment, the broadest authorized scope wins so that person still receives at most one summary for an occurrence.

## 3. Deploy the application processor

Set these server-only environment variables in the deployed application:

```dotenv
EMAIL_CRON_SECRET=<copy the generated email_cron_secret from Supabase Vault>

# Fail closed until the migration, allowlist, and canary checks pass.
EMAIL_AUTOMATION_ENABLED=false
EMAIL_TEST_MODE=true
EMAIL_TEST_RECIPIENTS=<comma-separated canary worker and leader addresses>
EMAIL_PROCESS_WELCOME_JOBS=false

# Temporary staging test values
EMAIL_REMINDER_LEAD_MINUTES=5
EMAIL_FOLLOWUP_DELAY_MINUTES=5

EMAIL_NOTIFICATION_MAX_LATENESS_MINUTES=1440
EMAIL_NOTIFICATION_BATCH_SIZE=10
EMAIL_SUMMARY_BATCH_SIZE=5
EMAIL_NOTIFICATION_MAX_JOBS_PER_RUN=20
EMAIL_NOTIFICATION_LOCK_TIMEOUT_MINUTES=10
```

Deploy the application and confirm that an unauthenticated `POST https://www.globeattendance.org/api/internal/email-scheduler` returns `401`, while the same request with the matching bearer secret succeeds. A `404` means the route is not deployed; do not activate Cron in that state. A cloud cron service cannot invoke a `localhost` URL.

## 4. Activate Supabase Cron

In the Supabase Dashboard, open **Project Settings → Vault** and verify these two named values created by the Vault migration:

- `email_processor_base_url`: `https://www.globeattendance.org`.
- `email_cron_secret`: a generated 64-character value; copy it into the hosting provider as the server-only `EMAIL_CRON_SECRET`.

After the endpoint checks pass, deploy `20260805132000_activate_email_notification_cron.sql` with `supabase db push --linked`. It validates the Vault values and schedules the processor once per minute; rerunning its SQL safely replaces the existing Cron job. Never paste the bearer value into a migration, terminal command, issue, or commit.

## 5. Controlled five-minute test

1. Keep every existing event disabled. Put only the intended worker and eligible leadership recipient(s) in `EMAIL_TEST_RECIPIENTS`.
2. Set `EMAIL_AUTOMATION_ENABLED=true`, keep `EMAIL_TEST_MODE=true`, redeploy, and create a new one-time canary event at least seven minutes in the future.
3. Explicitly select the canary worker as the target. Do not use a blank target list for a canary. Enable automatic emails only on this new event.
4. At approximately five minutes before the event, confirm exactly one `[TEST]` reminder reaches the worker. Re-running the processor must not create another logical reminder job.
5. Do not check in for the first canary. At approximately five minutes after the scheduled end, confirm exactly one `[TEST]` follow-up reaches only that worker, with no CC/BCC. Confirm the eligible leader receives a separate counts-only `[TEST]` summary.
6. Run a second new canary and check in. Confirm the worker receives no follow-up, while the leadership summary reports the worker as checked in.
7. Run a third new canary with approved leave covering the event date. Confirm no worker follow-up is sent and the leadership summary reports approved leave.
8. Disable the event or the worker's email preference while a job is pending and confirm the job becomes `cancelled` rather than being sent.
9. Return `EMAIL_AUTOMATION_ENABLED=false` and redeploy while reviewing the outbox and SMTP results. Test-mode cancellations are deliberate and must not be reused as production jobs.

Inspect delivery state without exposing it to normal application users:

```sql
SELECT
    notification_type,
    event_title,
    recipient_email,
    status,
    attempt_count,
    due_at,
    sent_at,
    last_error
FROM public.email_notification_jobs
ORDER BY created_at DESC
LIMIT 50;
```

Inspect the separate leadership outbox. This table contains leader delivery data and aggregate counts, but no worker list:

```sql
SELECT
    event_title,
    summary_scope_type,
    summary_scope_name,
    expected_count,
    checked_in_count,
    approved_leave_count,
    missed_count,
    status,
    attempt_count,
    due_at,
    sent_at,
    last_error
FROM public.attendance_summary_email_jobs
ORDER BY created_at DESC
LIMIT 50;
```

Inspect Cron execution:

```sql
SELECT status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE jobid = (
    SELECT jobid FROM cron.job WHERE jobname = 'email-notification-processor'
)
ORDER BY start_time DESC
LIMIT 20;
```

## 6. Production timing

After the controlled tests pass, update the deployed values and redeploy:

```dotenv
EMAIL_REMINDER_LEAD_MINUTES=30
EMAIL_FOLLOWUP_DELAY_MINUTES=60
EMAIL_NOTIFICATION_MAX_LATENESS_MINUTES=1440
EMAIL_TEST_MODE=false
EMAIL_AUTOMATION_ENABLED=true
```

Enable event-level automation gradually after each event's audience and scope have been reviewed. No SQL change is required when switching from test timing to production timing. The 24-hour lateness window recovers follow-ups and summaries after an outage; reminders are automatically cancelled once their event begins.

The database outbox guarantees one logical job per worker or leader and occurrence. SMTP itself is an at-least-once transport: if the provider accepts a message but the network fails before acknowledgement, an SMTP retry can still produce a duplicate. Keep deterministic message IDs enabled, monitor ambiguous delivery failures, and use a provider with a documented idempotency API if transport-level exactly-once delivery becomes a hard requirement.
