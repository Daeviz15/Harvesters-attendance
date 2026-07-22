import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarCheck, Flame, Percent, Megaphone, ArrowRight } from "lucide-react";
import {
  currentWorker,
  attendanceStats,
  announcementsMock,
  upcomingServices,
} from "@/lib/mock-data";



function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="border-slate-200">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
          <div className="text-xl font-semibold text-slate-900">{value}</div>
          {hint && <div className="text-xs text-slate-500">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function WorkerDashboard() {
  const w = currentWorker;
  const next = upcomingServices[0];
  const recent = announcementsMock.slice(0, 3);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <Avatar className="h-16 w-16">
            <AvatarImage src={w.avatar} alt={w.fullName} />
            <AvatarFallback>{w.fullName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-slate-900">
              Welcome back, {w.fullName.split(" ")[0]}
            </h1>
            <p className="text-sm text-slate-500">
              {w.role} · {w.department}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/worker/profile">View profile</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={Percent}
          label="This month attendance"
          value={`${attendanceStats.percentage}%`}
          hint={`${attendanceStats.present} of ${attendanceStats.totalServices} services`}
        />
        <StatCard
          icon={Flame}
          label="Current streak"
          value={`${attendanceStats.streak}`}
          hint="services in a row"
        />
        <StatCard
          icon={CalendarCheck}
          label="Next service"
          value={next.title}
          hint={`${next.date} · ${next.time}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Upcoming services</h2>
              <Link to="/worker/attendance" className="text-sm text-slate-500 hover:text-slate-900">
                See all
              </Link>
            </div>
            <ul className="space-y-3">
              {upcomingServices.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 p-3"
                >
                  <div>
                    <div className="text-sm font-medium text-slate-900">{s.title}</div>
                    <div className="text-xs text-slate-500">
                      {s.date} · {s.time}
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {s.role}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Recent announcements</h2>
              <Link
                to="/worker/announcements"
                className="text-sm text-slate-500 hover:text-slate-900"
              >
                See all
              </Link>
            </div>
            <ul className="space-y-3">
              {recent.map((a) => (
                <li key={a.id} className="rounded-md border border-slate-200 p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <Megaphone className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-sm font-medium text-slate-900">{a.title}</span>
                  </div>
                  <div className="mb-1 text-xs text-slate-500">
                    {a.department} · {a.date}
                  </div>
                  <p className="line-clamp-2 text-sm text-slate-600">{a.body}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardContent className="flex items-center justify-between p-5">
          <div>
            <div className="text-sm font-medium text-slate-900">Keep your profile up to date</div>
            <div className="text-xs text-slate-500">
              Complete profile fields to help your admin reach you.
            </div>
          </div>
          <Button asChild variant="outline">
            <Link to="/worker/profile/edit">
              Update profile <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
