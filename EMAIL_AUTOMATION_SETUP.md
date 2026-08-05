# Automatic Attendance Email Setup

The email processor is intentionally split into a durable database outbox and a stateless Next.js sender. Supabase Cron invokes the sender every minute; no administrator action is required after an event has automatic emails enabled.

## 1. Configure an authenticated sending domain

For production automation, use a verified Resend sending domain rather than a personal Gmail mailbox. The processor requires Resend SMTP in production so retries use the provider's idempotency key and cannot duplicate a message during the retry window.

Recommended Resend SMTP settings:

```dotenv
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASSWORD=<Resend API key>
EMAIL_FROM_NAME=Harvesters Globe Attendance
EMAIL_FROM_ADDRESS=attendance@<verified-sending-domain>
EMAIL_REPLY_TO=<monitored-reply-address>
EMAIL_MESSAGE_ID_DOMAIN=<verified-sending-domain>
```

Verify the sending domain in the provider and publish its SPF and DKIM records. Publish a DMARC record before production rollout. Never use an `EMAIL_FROM_ADDRESS` that the SMTP provider has not authorized.

Use a transactional subdomain such as `notifications.globeattendance.org` to isolate sender reputation from the main domain. Keep open and click tracking disabled for these operational messages, and start DMARC in monitoring mode (`p=none`) before gradually enforcing it after all legitimate senders pass alignment.

## 2. Install the outbox migration

Run [supabase_email_notification_automation.sql](./supabase_email_notification_automation.sql) in the Supabase SQL Editor before deploying the application code that calls its RPC functions. It is safe to install before activation: existing events have automatic email disabled by default and existing users do not receive welcome messages retroactively.

The migration stores welcome, reminder, and attendance follow-up messages in the same private, service-role-only outbox.

## 3. Deploy the application processor

Set these server-only environment variables in the deployed application:

```dotenv
EMAIL_CRON_SECRET=<cryptographically-random-ASCII-secret-of-32-to-256-characters>

# Temporary staging test values
EMAIL_REMINDER_LEAD_MINUTES=5
EMAIL_FOLLOWUP_DELAY_MINUTES=5

EMAIL_NOTIFICATION_MAX_LATENESS_MINUTES=1440
EMAIL_NOTIFICATION_BATCH_SIZE=20
EMAIL_NOTIFICATION_MAX_JOBS_PER_RUN=100
EMAIL_NOTIFICATION_LOCK_TIMEOUT_MINUTES=10
```

Deploy the application and confirm that `POST /api/internal/email-scheduler` is publicly reachable only with the matching bearer secret. A cloud cron service cannot invoke a `localhost` URL.

## 4. Activate Supabase Cron

In the Supabase Dashboard, open **Project Settings → Vault** and create these two named secrets:

- `email_processor_base_url`: the deployed HTTPS application origin.
- `email_cron_secret`: the same random value as the deployed `EMAIL_CRON_SECRET`.

Use the Dashboard for the bearer secret so plaintext is not retained in SQL query history. Then run [supabase_email_notification_cron_setup.sql](./supabase_email_notification_cron_setup.sql) unchanged in the SQL Editor. It validates the Vault values and schedules the processor once per minute; rerunning it safely replaces the existing Cron job.

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
