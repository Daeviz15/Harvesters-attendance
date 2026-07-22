
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, CalendarCheck, CalendarClock } from "lucide-react";
import { useRole } from "@/lib/role-context";
import { workersAdmin, workersDeptAdmin, departments } from "@/lib/mock-data";

export default function Dashboard() {
  const { role } = useRole();
  const workers = role === "admin" ? workersAdmin : workersDeptAdmin;
  const depts = role === "admin" ? departments : departments.filter((d) => d.name === "Ushering");

  const stats = [
    { label: "Total Workers", value: workers.length, icon: Users },
    { label: "Total Departments", value: depts.length, icon: Building2 },
    { label: "Today's Attendance", value: 87, icon: CalendarCheck },
    { label: "Upcoming Events", value: "Sunday Service", icon: CalendarClock },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Overview of your church workers.</p>
        </div>
        {role === "dept-admin" && (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            Filtered: Ushering Dept
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="border-slate-200">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">{s.label}</CardTitle>
              <s.icon className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-slate-900">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">
          No recent activity to display.
        </CardContent>
      </Card>
    </div>
  );
}
