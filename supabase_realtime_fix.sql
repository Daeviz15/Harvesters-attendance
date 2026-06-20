-- ==============================================================================
-- REALTIME FIX: Ensure UPDATE payloads include all columns
-- Run this in your Supabase SQL Editor.
--
-- By default, Postgres only sends the primary key in UPDATE payloads via
-- logical replication. This means Supabase Realtime's `payload.new.status`
-- was undefined, causing the worker's dashboard to miss session-end events.
--
-- REPLICA IDENTITY FULL tells Postgres to include ALL columns in the
-- replication payload for UPDATE and DELETE events.
-- ==============================================================================

ALTER TABLE attendance_sessions REPLICA IDENTITY FULL;
ALTER TABLE attendance_logs REPLICA IDENTITY FULL;
ALTER TABLE live_feed_events REPLICA IDENTITY FULL;
