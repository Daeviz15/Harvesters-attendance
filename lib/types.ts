

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
}
