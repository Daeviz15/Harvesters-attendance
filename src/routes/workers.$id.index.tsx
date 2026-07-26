import { Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Pencil, CalendarDays } from "lucide-react";
import { useData } from "@/lib/data-context";

function Field({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-900">{value || "-"}</div>
    </div>
  );
}

const TRACKED_FIELDS = [
  "fullName", "email", "phone", "dob", "gender", "maritalStatus",
  "homeAddress", "emergencyContact", "avatar",
  "department", "role", "dateJoined", "membershipStatus", "baptismStatus",
  "occupation", "businessName", "businessType", "workAddress", "workPhone", "professionalEmail",
];

export default function WorkerProfile() {
  const { id } = useParams();
  const { workers } = useData();
  const w = workers.find((w) => w.id === id);

  if (!w) return <div className="p-6">Worker not found</div>;

  const filled = TRACKED_FIELDS.filter((k) => {
    const v = w[k as keyof typeof w];
    return typeof v === "string" && v.trim().length > 0;
  }).length;
  const total = TRACKED_FIELDS.length;
  const pct = Math.round((filled / total) * 100);
  const tone =
    pct >= 90 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/workers">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Workers
          </Link>
        </Button>
        <Button asChild className="bg-slate-900 hover:bg-slate-800">
          <Link to={`/workers/${w.id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Link>
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <Avatar className="h-24 w-24">
            <AvatarImage src={w.avatar} alt={w.fullName} />
            <AvatarFallback>{w.fullName.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold text-slate-900">{w.fullName}</h1>
            <p className="text-sm text-slate-500">
              {w.role} · {w.department}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                {w.membershipStatus || "Active"}
              </Badge>
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                Joined {w.dateJoined || "Recently"}
              </Badge>
            </div>
          </div>
          <div className="w-full sm:w-64">
            <div className="mb-1.5 flex items-center justify-between text-xs text-slate-600">
              <span className="font-medium">Profile completeness</span>
              <span className="font-semibold text-slate-900">{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full ${tone} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs text-slate-500">
              {filled} of {total} fields filled
            </div>
          </div>
        </CardContent>

      </Card>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="church">Church & Dept</TabsTrigger>
          <TabsTrigger value="work">Work & Business</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <Card className="border-slate-200">
            <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
              <Field label="Full Name" value={w.fullName} />
              <Field label="Email" value={w.email} />
              <Field label="Phone" value={w.phone} />
              <Field label="Date of Birth" value={w.dob} />
              <Field label="Gender" value={w.gender} />
              <Field label="Marital Status" value={w.maritalStatus} />
              <Field label="Home Address" value={w.homeAddress} />
              <Field label="Emergency Contact" value={w.emergencyContact} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="church">
          <Card className="border-slate-200">
            <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
              <Field label="Department" value={w.department} />
              <Field label="Role" value={w.role} />
              <Field label="Date Joined" value={w.dateJoined} />
              <Field label="Membership Status" value={w.membershipStatus} />
              <Field label="Baptism Status" value={w.baptismStatus} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="work">
          <Card className="border-slate-200">
            <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
              <Field label="Occupation" value={w.occupation} />
              <Field label="Business Name" value={w.businessName} />
              <Field label="Business Type" value={w.businessType} />
              <Field label="Work Address" value={w.workAddress} />
              <Field label="Work Phone" value={w.workPhone} />
              <Field label="Professional Email" value={w.professionalEmail} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance">
          <Card className="border-slate-200">
            <CardContent className="space-y-4 p-6">
              <p className="text-sm text-slate-500">Attendance tracking coming soon</p>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 28 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex aspect-square items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
