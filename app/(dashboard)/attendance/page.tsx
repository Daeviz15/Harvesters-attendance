"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { attendanceMock, attendanceStats } from "@/lib/mock-data";
import { cn } from "@/lib/utils";



const statusStyles: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-800 border-emerald-200",
  absent: "bg-red-100 text-red-800 border-red-200",
  excused: "bg-amber-100 text-amber-800 border-amber-200",
  upcoming: "bg-slate-50 text-slate-400 border-slate-200",
};

const statusLabel: Record<string, string> = {
  present: "P",
  absent: "A",
  excused: "E",
  upcoming: "·",
};

export default function AttendancePage() {
  const firstDate = new Date(attendanceMock[0].date);
  const monthLabel = firstDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  const startOffset = firstDate.getDay();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Attendance</h1>
        <p className="text-sm text-slate-500">Your service attendance for {monthLabel}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">Attendance</div>
            <div className="text-2xl font-semibold text-slate-900">
              {attendanceStats.percentage}%
            </div>
            <div className="text-xs text-slate-500">
              {attendanceStats.present} / {attendanceStats.totalServices} services
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">Current streak</div>
            <div className="text-2xl font-semibold text-slate-900">{attendanceStats.streak}</div>
            <div className="text-xs text-slate-500">services in a row</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500">Total services</div>
            <div className="text-2xl font-semibold text-slate-900">
              {attendanceStats.totalServices}
            </div>
            <div className="text-xs text-slate-500">this month</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">{monthLabel}</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                Present
              </Badge>
              <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">
                Absent
              </Badge>
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                Excused
              </Badge>
            </div>
          </div>
          <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-medium text-slate-500">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {attendanceMock.map((a) => {
              const day = Number(a.date.slice(8, 10));
              return (
                <div
                  key={a.date}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-md border text-xs",
                    statusStyles[a.status],
                  )}
                >
                  <div className="text-sm font-semibold">{day}</div>
                  <div className="text-[10px] font-medium">{statusLabel[a.status]}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
