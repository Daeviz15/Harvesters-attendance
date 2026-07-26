import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  Building2,
  CalendarCheck,
  CalendarClock,
  TrendingUp,
  UserPlus,
  Clock,
  MoreHorizontal
} from "lucide-react";
import { useRole } from "@/lib/role-context";
import { useData } from "@/lib/data-context";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid
} from "recharts";

// Mock data for attendance chart
const attendanceData = [
  { name: "Week 1", attendance: 750 },
  { name: "Week 2", attendance: 820 },
  { name: "Week 3", attendance: 780 },
  { name: "Week 4", attendance: 890 },
  { name: "Week 5", attendance: 920 },
];

// Mock data for recent activities
const recentActivities = [
  { id: 1, action: "New worker added", subject: "John Doe", time: "2 hours ago", icon: UserPlus, color: "text-blue-500", bg: "bg-blue-100" },
  { id: 2, action: "Attendance marked", subject: "Ushering Department", time: "5 hours ago", icon: CalendarCheck, color: "text-emerald-500", bg: "bg-emerald-100" },
  { id: 3, action: "Event scheduled", subject: "Worker's Meeting", time: "Yesterday", icon: CalendarClock, color: "text-amber-500", bg: "bg-amber-100" },
  { id: 4, action: "Roster updated", subject: "Choir Department", time: "Yesterday", icon: Clock, color: "text-purple-500", bg: "bg-purple-100" },
];

export default function Dashboard() {
  const { role } = useRole();
  const { workers: allWorkers, departments: allDepartments } = useData();
  
  const workers = role === "admin" ? allWorkers : allWorkers.filter((w) => w.department === "Ushering");
  const depts = role === "admin" ? allDepartments : allDepartments.filter((d) => d.name === "Ushering");

  const stats = [
    { label: "Total Workers", value: workers.length, icon: Users, trend: "+12% from last month", trendUp: true },
    { label: "Total Departments", value: depts.length, icon: Building2, trend: "+2 this year", trendUp: true },
    { label: "Avg Attendance", value: "88%", icon: CalendarCheck, trend: "+4% from last week", trendUp: true },
    { label: "Upcoming Events", value: 3, icon: CalendarClock, trend: "Next: Sunday Service", trendUp: false },
  ];

  // Dynamic greeting based on time
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8 pb-8 animate-fade-in-up">
      {/* ──── Welcome Banner ──── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-lg">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}, {role === "admin" ? "Admin" : "Dept Lead"}!</h1>
          <p className="mt-1 text-slate-300">
            Here is what's happening with your teams today.
          </p>
          {role === "dept-admin" && (
            <Badge className="mt-3 bg-amber-500/20 text-amber-200 border-none hover:bg-amber-500/30">
              Filtered: Ushering Dept
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" className="bg-white/10 text-white hover:bg-white/20 border-none">
            <CalendarCheck className="mr-2 h-4 w-4" />
            Mark Attendance
          </Button>
          <Button className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold border-none">
            <UserPlus className="mr-2 h-4 w-4" />
            Add Worker
          </Button>
        </div>
      </div>

      {/* ──── Stats Grid ──── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="group overflow-hidden border-slate-200/60 bg-white/50 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{s.label}</CardTitle>
              <div className="rounded-md bg-slate-100 p-2 text-slate-500 transition-colors group-hover:bg-amber-100 group-hover:text-amber-600">
                <s.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{s.value}</div>
              <div className="mt-2 text-xs flex items-center gap-1">
                {s.trendUp ? <TrendingUp className="h-3 w-3 text-emerald-500" /> : <Clock className="h-3 w-3 text-slate-400" />}
                <span className={s.trendUp ? "text-emerald-600 font-medium" : "text-slate-400"}>
                  {s.trend}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* ──── Chart Area ──── */}
        <Card className="lg:col-span-2 border-slate-200/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Attendance Overview</CardTitle>
            <CardDescription>Monthly attendance trends across all services.</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:p-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={attendanceData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAttendance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#64748b', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="attendance" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorAttendance)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* ──── Recent Activity ──── */}
        <Card className="border-slate-200/60 shadow-sm flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
              <CardDescription>Latest updates from your teams</CardDescription>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="space-y-6 pt-4">
              {recentActivities.map((activity, index) => (
                <div key={activity.id} className="relative flex gap-4">
                  {/* Timeline connecting line */}
                  {index !== recentActivities.length - 1 && (
                    <div className="absolute left-[19px] top-10 bottom-[-24px] w-px bg-slate-200" />
                  )}
                  <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${activity.bg} ${activity.color}`}>
                    <activity.icon className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-sm font-medium text-slate-900">
                      {activity.action}
                    </p>
                    <div className="flex items-center text-xs text-slate-500">
                      <span className="font-medium text-slate-700 mr-1">{activity.subject}</span>
                      <span>• {activity.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
