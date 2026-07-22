
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone } from "lucide-react";
import { announcementsMock } from "@/lib/mock-data";

export default function AnnouncementsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Announcements</h1>
        <p className="text-sm text-slate-500">Updates from your admins and department leads.</p>
      </div>

      <div className="space-y-3">
        {announcementsMock.map((a) => (
          <Card key={a.id} className="border-slate-200">
            <CardContent className="p-5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">{a.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                    {a.department}
                  </Badge>
                  <span className="text-xs text-slate-500">{a.date}</span>
                </div>
              </div>
              <p className="text-sm text-slate-600">{a.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
