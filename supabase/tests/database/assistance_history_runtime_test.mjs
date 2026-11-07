// Isolated PostgreSQL runtime regression test using PGlite (no live project).
// Install @electric-sql/pglite in a temporary directory and pass that directory
// as the first argument. Nothing is sent to Supabase or to real recipients.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { randomUUID } from "node:crypto";

const require = createRequire(path.resolve(process.argv[2] || ".", "package.json"));
const { PGlite } = require("@electric-sql/pglite");
const db = new PGlite();
const id = Object.fromEntries(["admin", "otherAdmin", "head", "outsideHead", "reports", "worker", "otherWorker", "department", "otherDepartment", "team", "session", "event", "baseline", "request"].map((name) => [name, randomUUID()]));
const scalar = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
const asUser = async (userId) => {
  await db.exec("RESET ROLE");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec("SET ROLE authenticated");
};
const owner = () => db.exec("RESET ROLE");
const denied = async (sql, params = []) => {
  await assert.rejects(() => db.query(sql, params), (error) => ["42501", "23503", "23001"].includes(error.code));
};
const page = (status = "all", pageNumber = 1, limit = 25, requestId = null) => scalar(
  "SELECT public.get_check_in_assistance_page($1, $2, $3, $4) AS value", [status, pageNumber, limit, requestId]);

try {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE SCHEMA private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE TABLE public.profiles (
      id uuid PRIMARY KEY, first_name text, last_name text, worker_id text,
      role text, is_active boolean DEFAULT true, department_id uuid,
      team_id uuid, department text, team text
    );
    CREATE TABLE public.teams (id uuid PRIMARY KEY, name text, is_active boolean DEFAULT true);
    CREATE TABLE public.departments (
      id uuid PRIMARY KEY, name text, team_id uuid, head_user_id uuid, is_active boolean DEFAULT true
    );
    CREATE TABLE public.team_admin_assignments (user_id uuid, team_id uuid);
    CREATE TABLE public.events (id uuid PRIMARY KEY, title text);
    CREATE TABLE public.attendance_sessions (id uuid PRIMARY KEY, event_id uuid, status text);
    CREATE TABLE public.locations (id uuid PRIMARY KEY, name text);
    CREATE TABLE public.attendance_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid,
      user_id uuid, checked_in_by uuid, is_manual boolean
    );
    CREATE TABLE public.leave_requests (
      id uuid PRIMARY KEY, user_id uuid, status text, returned_early_at timestamptz
    );
  `);
  for (const file of [
    "20260925121000_add_admin_notification_center.sql",
    "20260925130000_add_check_in_assistance_workflow.sql",
  ]) await db.exec(await readFile(path.join("supabase/migrations", file), "utf8"));

  for (const [name, role] of [["admin", "super_admin"], ["otherAdmin", "admin"], ["head", "worker"], ["outsideHead", "worker"], ["reports", "reports_admin"], ["worker", "worker"], ["otherWorker", "worker"]]) {
    await db.query("INSERT INTO public.profiles (id, first_name, last_name, role, department_id) VALUES ($1,$2,'Example',$3,$4)",
      [id[name], name, role, name === "outsideHead" || name === "otherWorker" ? id.otherDepartment : id.department]);
  }
  await db.query("INSERT INTO public.teams (id,name) VALUES ($1,'Team')", [id.team]);
  await db.query("INSERT INTO public.departments (id,name,team_id,head_user_id) VALUES ($1,'First',$3,$4),($2,'Second',$3,$5)",
    [id.department, id.otherDepartment, id.team, id.head, id.outsideHead]);
  await db.query("INSERT INTO public.events (id,title) VALUES ($1,'Test event')", [id.event]);
  await db.query("INSERT INTO public.attendance_sessions (id,event_id,status) VALUES ($1,$2,'active')", [id.session,id.event]);
  await db.query("INSERT INTO public.check_in_assistance_requests (id,session_id,event_id,user_id,reported_status,status,resolution_note) VALUES ($1,$2,$3,$4,'unavailable','resolved','Existing resolution')",
    [id.baseline,id.session,id.event,id.worker]);
  await db.exec(await readFile("supabase/migrations/20261107120000_preserve_assistance_history_and_sync_notifications.sql", "utf8"));
  assert.equal(await scalar("SELECT count(*)::int AS value FROM public.admin_notifications WHERE assistance_request_id=$1 AND read_at IS NULL",[id.baseline]),0);
  assert.equal(await scalar("SELECT count(*)::int AS value FROM public.check_in_assistance_activity WHERE request_id=$1 AND is_baseline",[id.baseline]),1);
  console.log("PASS existing records are retained, linked, and closed alerts reconciled");

  await db.query("INSERT INTO public.check_in_assistance_requests (id,session_id,event_id,user_id,reported_status,worker_message) VALUES ($1,$2,$3,$4,'unavailable','Original complaint')",
    [id.request,id.session,id.event,id.worker]);
  assert.equal(await scalar("SELECT count(*)::int AS value FROM public.admin_notifications WHERE assistance_request_id=$1 AND read_at IS NULL",[id.request]),3);
  await asUser(id.head);
  assert.equal(await scalar("SELECT public.mark_my_assistance_notifications_read(ARRAY[$1::uuid]) AS value",[id.request]),1);
  assert.equal((await page("unresolved")).requests.length,1);
  await owner();
  assert.equal(await scalar("SELECT count(*)::int AS value FROM public.admin_notifications WHERE assistance_request_id=$1 AND read_at IS NULL",[id.request]),2);
  const ownAlert=await scalar("SELECT id AS value FROM public.admin_notifications WHERE assistance_request_id=$1 AND recipient_user_id=$2",[id.request,id.admin]);
  const otherAlert=await scalar("SELECT id AS value FROM public.admin_notifications WHERE assistance_request_id=$1 AND recipient_user_id=$2",[id.request,id.otherAdmin]);
  await asUser(id.admin);
  assert.equal(await scalar("SELECT public.mark_my_admin_notifications_read(ARRAY[$1::uuid]) AS value",[otherAlert]),0);
  assert.equal(await scalar("SELECT public.mark_my_admin_notifications_read(ARRAY[$1::uuid]) AS value",[ownAlert]),1);
  assert.equal(await scalar("SELECT public.mark_my_admin_notifications_read(ARRAY[$1::uuid]) AS value",[ownAlert]),0);
  await owner();
  await db.query("INSERT INTO public.admin_notifications (recipient_user_id,event_type,title,message,action_url,dedupe_key) VALUES ($1,'leave_requested','Unrelated alert','Keep unread','/admin/leave-requests','unrelated-alert')",[id.admin]);
  console.log("PASS viewing marks only the current recipient's alert read");

  await asUser(id.outsideHead);
  assert.equal((await page("all",1,25,id.request)).total,0);
  assert.equal(await scalar("SELECT public.mark_my_assistance_notifications_read(ARRAY[$1::uuid]) AS value",[id.request]),0);
  await denied("SELECT public.update_check_in_assistance_request($1,'dismissed','Outside scope')",[id.request]);
  await asUser(id.reports);
  await denied("SELECT public.get_check_in_assistance_page()");
  await denied("SELECT public.mark_my_assistance_notifications_read(ARRAY[$1::uuid])",[id.request]);
  await asUser(id.worker);
  await denied("SELECT public.get_check_in_assistance_page()");
  await denied("SELECT * FROM public.check_in_assistance_activity");
  console.log("PASS cross-department, ordinary-worker and reports-only access is denied");

  await asUser(id.head);
  await scalar("SELECT public.update_check_in_assistance_request($1,'acknowledged','First leader note') AS value",[id.request]);
  await scalar("SELECT public.update_check_in_assistance_request($1,'note','Second leader note') AS value",[id.request]);
  await scalar("SELECT public.update_check_in_assistance_request($1,'dismissed','Final decision') AS value",[id.request]);
  assert.equal(await scalar("SELECT public.update_check_in_assistance_request($1,'acknowledged','Stale review') AS value",[id.request]),"dismissed");
  const closedPage=await page("closed");
  assert.equal(closedPage.requests[0].activity.length,4);
  assert.deepEqual(closedPage.requests[0].activity.map((entry)=>entry.note),["Original complaint","First leader note","Second leader note","Final decision"]);
  await owner();
  assert.equal(await scalar("SELECT count(*)::int AS value FROM public.admin_notifications WHERE assistance_request_id=$1 AND read_at IS NULL",[id.request]),0);
  assert.equal(await scalar("SELECT count(*)::int AS value FROM public.admin_notifications WHERE dedupe_key='unrelated-alert' AND read_at IS NULL"),1);
  console.log("PASS closing clears every recipient's stale alert and preserves all previous notes");

  await db.query("INSERT INTO public.check_in_assistance_requests (session_id,event_id,user_id,reported_status,status) SELECT $1,$2,$3,'unavailable','resolved' FROM generate_series(1,60)",
    [id.session,id.event,id.worker]);
  await asUser(id.head);
  const first=await page("resolved",1),second=await page("resolved",2),third=await page("resolved",3);
  assert.equal(first.total,61);
  assert.equal(first.requests.length,25);
  assert.equal(second.requests.length,25);
  assert.equal(third.requests.length,11);
  assert.equal(new Set([...first.requests,...second.requests,...third.requests].map((request)=>request.id)).size,61);
  assert.equal((await page("resolved",100)).page,3);
  assert.equal((await page("all",1,25,id.baseline)).requests[0].id,id.baseline);
  console.log("PASS status tabs, deep links and pagination expose history beyond the old 50-row limit");

  await owner();
  const expiring=randomUUID();
  await db.query("INSERT INTO public.check_in_assistance_requests (id,session_id,event_id,user_id,reported_status) VALUES ($1,$2,$3,$4,'unavailable')",[expiring,id.session,id.event,id.worker]);
  await db.query("UPDATE public.attendance_sessions SET status='ended' WHERE id=$1",[id.session]);
  assert.equal(await scalar("SELECT status AS value FROM public.check_in_assistance_requests WHERE id=$1",[expiring]),"expired");
  assert.equal(await scalar("SELECT count(*)::int AS value FROM public.admin_notifications WHERE assistance_request_id=$1 AND read_at IS NULL",[expiring]),0);
  await asUser(id.head);
  assert.equal((await page("unresolved")).requests[0].id,expiring);
  console.log("PASS session end preserves unresolved reports and clears expired alerts");

  await owner();
  const selfSession=randomUUID(), selfRequest=randomUUID();
  await db.query("INSERT INTO public.attendance_sessions (id,event_id,status) VALUES ($1,$2,'active')",[selfSession,id.event]);
  await db.query("INSERT INTO public.check_in_assistance_requests (id,session_id,event_id,user_id,reported_status) VALUES ($1,$2,$3,$4,'unavailable')",[selfRequest,selfSession,id.event,id.worker]);
  await db.query("INSERT INTO public.attendance_logs (session_id,user_id,is_manual) VALUES ($1,$2,false)",[selfSession,id.worker]);
  assert.equal(await scalar("SELECT status AS value FROM public.check_in_assistance_requests WHERE id=$1",[selfRequest]),"resolved");
  assert.equal(await scalar("SELECT count(*)::int AS value FROM public.admin_notifications WHERE assistance_request_id=$1 AND read_at IS NULL",[selfRequest]),0);
  await asUser(id.admin);
  await scalar("SELECT public.update_check_in_assistance_request($1,'note','Additional evidence from another leader') AS value",[selfRequest]);
  const selfHistory=await page("all",1,25,selfRequest);
  assert.equal(selfHistory.requests[0].activity.at(-1).actor_name,"admin Example");
  console.log("PASS successful self check-in clears alerts and subsequent notes retain their actual author");

  await owner();
  await denied("DELETE FROM public.check_in_assistance_requests WHERE id=$1",[id.request]);
  await denied("TRUNCATE public.check_in_assistance_requests CASCADE");
  await denied("UPDATE public.check_in_assistance_requests SET worker_message='Rewritten' WHERE id=$1",[id.request]);
  await denied("UPDATE public.check_in_assistance_requests SET status='open' WHERE id=$1",[id.request]);
  await denied("DELETE FROM public.check_in_assistance_activity WHERE request_id=$1",[id.request]);
  await denied("UPDATE public.check_in_assistance_activity SET note='Rewritten' WHERE request_id=$1",[id.request]);
  await denied("TRUNCATE public.check_in_assistance_activity");
  await denied("DELETE FROM public.attendance_sessions WHERE id=$1",[id.session]);
  await denied("DELETE FROM public.events WHERE id=$1",[id.event]);
  await denied("DELETE FROM public.profiles WHERE id=$1",[id.worker]);
  console.log("PASS deletion, original-report edits, audit edits and parent cascades cannot erase evidence");
  const retainedCount=await scalar("SELECT count(*)::int AS value FROM public.check_in_assistance_requests");
  await db.exec("UPDATE public.admin_notifications SET created_at=NOW()-INTERVAL '500 days', read_at=NOW()-INTERVAL '500 days'");
  assert.ok(await scalar("SELECT public.prune_admin_notifications() AS value")>0);
  assert.equal(await scalar("SELECT count(*)::int AS value FROM public.check_in_assistance_requests"),retainedCount);
  assert.ok(await scalar("SELECT count(*)::int AS value FROM public.check_in_assistance_activity WHERE request_id=$1",[id.request])>=4);
  console.log("PASS pruning old bell notifications leaves complaint evidence intact");
} finally {
  await db.close();
}
