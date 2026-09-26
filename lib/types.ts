

export interface AttendanceLog {
  id: string;
  check_in_time: string;
  check_out_time: string | null;
  status: 'active' | 'completed' | 'auto_completed';
}

export interface AttendanceHistoryResponse {
  logs: AttendanceLog[];
  hasMore: boolean;
}

export interface LiveFeedEvent {
  id: string;
  attendance_log_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  department: string;
  event_type: 'Checked In' | 'Checked Out';
  created_at: string;
  avatar_url?: string | null;
}

export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: string; 
  user_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  created_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  returned_early_at?: string | null;
  returned_early_by?: string | null;
  return_note?: string | null;
}

export interface UpcomingBirthday {
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  department_name: string;
  birthday_month: number;
  birthday_day: number;
  next_birthday: string;
  days_until: number;
}

export interface UpcomingEvent {
  eventId: string;
  title: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  occurrenceKey: string;
  timezone: string;
  locationName: string | null;
  isInProgress: boolean;
}

export type AdminNotificationEventType =
  | "leave_requested"
  | "leave_approved"
  | "leave_rejected"
  | "leave_returned_early"
  | "worker_deactivated"
  | "worker_reactivated"
  | "check_in_assistance_requested";

export interface AdminNotification {
  id: string;
  recipient_user_id: string;
  event_type: AdminNotificationEventType;
  actor_user_id: string | null;
  subject_user_id: string | null;
  title: string;
  message: string;
  action_url: string;
  read_at: string | null;
  created_at: string;
}

export type CheckInAssistanceStatus =
  | "open"
  | "acknowledged"
  | "resolved"
  | "dismissed"
  | "expired";

export type CheckInAssistanceDiagnostic =
  | "low_accuracy"
  | "not_confirmed"
  | "unavailable";

export interface CheckInAssistanceRequest {
  id: string;
  session_id: string;
  event_id: string;
  event_title: string;
  user_id: string;
  worker_name: string;
  worker_code: string | null;
  department_name: string | null;
  reported_status: CheckInAssistanceDiagnostic;
  reported_accuracy_meters: number | null;
  nearest_location_name: string | null;
  nearest_distance_meters: number | null;
  worker_message: string | null;
  status: CheckInAssistanceStatus;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
}
