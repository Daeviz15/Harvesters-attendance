-- Transactional runtime smoke test. It exercises real scope fan-out,
-- deduplication, and per-recipient read state, then rolls every test row back.
BEGIN;

CREATE TEMP TABLE notification_smoke_context (
    subject_user_id UUID NOT NULL,
    subject_department_id UUID NOT NULL,
    subject_team_id UUID,
    dedupe_key TEXT NOT NULL,
    first_insert_count INTEGER,
    duplicate_insert_count INTEGER,
    recipient_user_id UUID,
    notification_id UUID,
    marked_read_count INTEGER
) ON COMMIT DROP;

INSERT INTO notification_smoke_context (
    subject_user_id,
    subject_department_id,
    subject_team_id,
    dedupe_key
)
SELECT
    profile_row.id,
    profile_row.department_id,
    COALESCE(profile_row.team_id, department_row.team_id),
    'runtime-smoke:' || gen_random_uuid()::TEXT
FROM public.profiles profile_row
JOIN public.departments department_row
    ON department_row.id = profile_row.department_id
WHERE profile_row.is_active IS TRUE
    AND department_row.is_active IS TRUE
ORDER BY profile_row.created_at
LIMIT 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM notification_smoke_context) THEN
        RAISE EXCEPTION 'Runtime notification test needs one active assigned worker';
    END IF;
END $$;

UPDATE notification_smoke_context context_row
SET first_insert_count = private.enqueue_scoped_admin_notification(
    context_row.subject_user_id,
    context_row.subject_user_id,
    'leave_returned_early',
    'Runtime smoke test',
    'This row must be rolled back.',
    '/admin/leave-requests?status=approved',
    context_row.dedupe_key
);

UPDATE notification_smoke_context context_row
SET duplicate_insert_count = private.enqueue_scoped_admin_notification(
    context_row.subject_user_id,
    context_row.subject_user_id,
    'leave_returned_early',
    'Runtime smoke test',
    'This row must be rolled back.',
    '/admin/leave-requests?status=approved',
    context_row.dedupe_key
);

UPDATE notification_smoke_context context_row
SET (recipient_user_id, notification_id) = (
    SELECT inserted_notification.recipient_user_id, inserted_notification.id
    FROM public.admin_notifications inserted_notification
    WHERE inserted_notification.dedupe_key = context_row.dedupe_key
    ORDER BY inserted_notification.created_at, inserted_notification.id
    LIMIT 1
);

SELECT set_config(
    'request.jwt.claim.sub',
    (SELECT recipient_user_id::TEXT FROM notification_smoke_context),
    TRUE
);

UPDATE notification_smoke_context context_row
SET marked_read_count = public.mark_my_admin_notifications_read(
    ARRAY[context_row.notification_id]
);

SELECT '1..7';

WITH checks(test_number, passed, description) AS (
    SELECT check_rows.*
    FROM notification_smoke_context context_row
    CROSS JOIN LATERAL (
        VALUES
            (1, context_row.first_insert_count > 0,
                'scope fan-out creates at least one administrator notification'),
            (2, context_row.duplicate_insert_count = 0,
                'repeating the same activity creates no duplicate rows'),
            (3, (
                    SELECT COUNT(*) = COUNT(DISTINCT notification_row.recipient_user_id)
                    FROM public.admin_notifications notification_row
                    WHERE notification_row.dedupe_key = context_row.dedupe_key
                ), 'each administrator receives at most one copy'),
            (4, NOT EXISTS (
                    SELECT 1
                    FROM public.admin_notifications notification_row
                    JOIN public.profiles recipient_profile
                        ON recipient_profile.id = notification_row.recipient_user_id
                    WHERE notification_row.dedupe_key = context_row.dedupe_key
                        AND recipient_profile.role::TEXT = 'reports_admin'
                ), 'reports-only administrators receive no operational notification'),
            (5, NOT EXISTS (
                    SELECT 1
                    FROM public.admin_notifications notification_row
                    JOIN public.profiles recipient_profile
                        ON recipient_profile.id = notification_row.recipient_user_id
                    WHERE notification_row.dedupe_key = context_row.dedupe_key
                        AND recipient_profile.role::TEXT NOT IN ('admin', 'super_admin')
                        AND NOT (
                            recipient_profile.role::TEXT = 'team_admin'
                            AND (
                                recipient_profile.team_id = context_row.subject_team_id
                                OR EXISTS (
                                    SELECT 1
                                    FROM public.team_admin_assignments assignment_row
                                    WHERE assignment_row.user_id = recipient_profile.id
                                        AND assignment_row.team_id = context_row.subject_team_id
                                )
                            )
                        )
                        AND NOT EXISTS (
                            SELECT 1
                            FROM public.departments department_row
                            WHERE department_row.id = context_row.subject_department_id
                                AND department_row.head_user_id = recipient_profile.id
                        )
                ), 'every recipient is authorized for the subject scope'),
            (6, context_row.marked_read_count = 1,
                'recipient can mark their own notification read'),
            (7, EXISTS (
                    SELECT 1
                    FROM public.admin_notifications notification_row
                    WHERE notification_row.id = context_row.notification_id
                        AND notification_row.recipient_user_id = context_row.recipient_user_id
                        AND notification_row.read_at IS NOT NULL
                ), 'read timestamp is stored on the recipient row')
    ) AS check_rows(test_number, passed, description)
)
SELECT FORMAT(
    '%s %s - %s',
    CASE WHEN passed THEN 'ok' ELSE 'not ok' END,
    test_number,
    description
)
FROM checks
ORDER BY test_number;

ROLLBACK;
