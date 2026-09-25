

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
  | "worker_reactivated";

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
