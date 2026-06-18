/**
 * Shared type definitions for the Harvesters Attendance App.
 * Single source of truth — used by both server actions and client components.
 */

/** Represents a single attendance log entry from the `attendance_logs` table. */
export interface AttendanceLog {
  id: string;
  check_in_time: string;
  check_out_time: string | null;
  status: 'active' | 'completed' | 'auto_completed';
}

/** Paginated response shape returned by `fetchAttendanceHistory`. */
export interface AttendanceHistoryResponse {
  logs: AttendanceLog[];
  hasMore: boolean;
}

/** Represents an event in the real-time live feed. */
export interface LiveFeedEvent {
  id: string;
  attendance_log_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  department: string;
  event_type: 'Checked In' | 'Checked Out';
  created_at: string;
}

export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string; // Using string to map smoothly from Postgres UUIDs
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  created_at: string;
}
