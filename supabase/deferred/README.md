# Deferred production migrations

Files in this directory are intentionally excluded from `supabase db push`.

The email Cron activation must stay here until the deployed application exposes
`POST /api/internal/email-scheduler`, an unauthenticated probe returns `401`, and
the hosting provider contains the Vault-generated `EMAIL_CRON_SECRET`.

After those checks pass, move the activation SQL into `supabase/migrations`
without changing its timestamp, run `supabase db push --linked --dry-run`, and
then run `supabase db push --linked --yes`.
