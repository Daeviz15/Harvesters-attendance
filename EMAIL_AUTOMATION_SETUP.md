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
- `supabase/deferred/20260805132000_activate_email_notification_cron.sql` is deliberately outside the active migration directory until the protected route is deployed and verified.

The migration stores welcome, reminder, and attendance follow-up messages in the same private, service-role-only outbox.

## 3. Deploy the application processor

Set these server-only environment variables in the deployed application:

```dotenv
EMAIL_CRON_SECRET=<copy the generated email_cron_secret from Supabase Vault>

# Temporary staging test values
EMAIL_REMINDER_LEAD_MINUTES=5
EMAIL_FOLLOWUP_DELAY_MINUTES=5

EMAIL_NOTIFICATION_MAX_LATENESS_MINUTES=1440
EMAIL_NOTIFICATION_BATCH_SIZE=10
EMAIL_NOTIFICATION_MAX_JOBS_PER_RUN=20
EMAIL_NOTIFICATION_LOCK_TIMEOUT_MINUTES=10
```

Deploy the application and confirm that an unauthenticated `POST https://www.globeattendance.org/api/internal/email-scheduler` returns `401`, while the same request with the matching bearer secret succeeds. A `404` means the route is not deployed; do not activate Cron in that state. A cloud cron service cannot invoke a `localhost` URL.

## 4. Activate Supabase Cron

In the Supabase Dashboard, open **Project Settings → Vault** and verify these two named values created by the Vault migration:

- `email_processor_base_url`: `https://www.globeattendance.org`.
- `email_cron_secret`: a generated 64-character value; copy it into the hosting provider as the server-only `EMAIL_CRON_SECRET`.

After the endpoint checks pass, move the deferred SQL into `supabase/migrations` without changing its timestamp, dry-run it, and deploy it with `supabase db push --linked`. It validates the Vault values and schedules the processor once per minute; rerunning its SQL safely replaces the existing Cron job. Never paste the bearer value into a migration, terminal command, issue, or commit.

## 5. Controlled five-minute test

1. Use a department containing only the intended test worker, or temporarily disable email notifications for every non-test worker in `profiles`.
2. Create a one-time event at least seven minutes in the future.
3. Choose a short but valid event duration and select **Enable automatic attendance emails**.
4. At approximately five minutes before the event, confirm the reminder job is sent.
5. Do not check in for the first test. At approximately five minutes after the scheduled end, confirm the follow-up email and CC recipients.
6. Run a second test and check in. Confirm that no follow-up job is created for that worker.
7. Disable the event or the worker's email preference while a job is pending and confirm the job becomes `cancelled` rather than being sent.

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
```

No SQL change is required when switching from test timing to production timing. The 24-hour lateness window only recovers follow-ups after an outage; reminders are automatically cancelled once an event begins.
