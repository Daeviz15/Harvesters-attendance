
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Building2, Users, UserCog, Mail, Phone, Briefcase, X } from "lucide-react";
import { currentWorker, departments, teammatesMock, type Worker } from "@/lib/mock-data";
import * as React from "react";



function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function TeammateProfileModal({
  teammate,
  open,
  onClose,
}: {
  teammate: Worker | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!teammate) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md border-slate-200 p-0">
        <div className="relative bg-slate-900 px-6 py-8 text-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="absolute right-3 top-3 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
          <Avatar className="mx-auto h-20 w-20 border-4 border-white">
            <AvatarImage src={teammate.avatar} alt={teammate.fullName} />
            <AvatarFallback className="bg-slate-200 text-slate-900">
              {teammate.fullName.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <h3 className="mt-3 text-lg font-semibold text-white">{teammate.fullName}</h3>
          <p className="text-sm text-slate-300">
            {teammate.role} · {teammate.department}
          </p>
        </div>

        <div className="p-6">
          <DialogHeader className="sr-only">
            <DialogTitle>{teammate.fullName}</DialogTitle>
            <DialogDescription>Profile preview for {teammate.fullName}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Mail className="h-4 w-4 text-slate-400" />
              <span className="truncate">{teammate.email}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Phone className="h-4 w-4 text-slate-400" />
              <span>{teammate.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Briefcase className="h-4 w-4 text-slate-400" />
              <span>{teammate.occupation}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Building2 className="h-4 w-4 text-slate-400" />
              <span className="truncate">{teammate.businessName}</span>
            </div>
          </div>

          <div className="mt-6 grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <Field label="Department" value={teammate.department} />
            <Field label="Role" value={teammate.role} />
            <Field label="Occupation" value={teammate.occupation} />
            <Field label="Business" value={teammate.businessName} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DepartmentPage() {
  const w = currentWorker;
  const dept = departments.find((d) => d.name === w.department);
  const [selected, setSelected] = React.useState<Worker | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My Department</h1>
        <p className="text-sm text-slate-500">The team you serve with.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Department</div>
              <div className="text-lg font-semibold text-slate-900">{w.department}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <UserCog className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Department admin</div>
              <div className="text-lg font-semibold text-slate-900">
                {dept?.admin ?? "—"}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Team size</div>
              <div className="text-lg font-semibold text-slate-900">
                {dept?.workersCount ?? teammatesMock.length}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Teammates</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {teammatesMock.map((t) => (
              <li
                key={t.id}
                onClick={() => setSelected(t)}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 p-3 transition-colors hover:border-slate-300 hover:bg-slate-50"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={t.avatar} alt={t.fullName} />
                  <AvatarFallback>{t.fullName.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{t.fullName}</div>
                  <div className="text-xs text-slate-500 truncate">{t.role}</div>
                </div>
                <Badge variant="secondary" className="bg-slate-100 text-slate-700 shrink-0">
                  {t.department}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <TeammateProfileModal
        teammate={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
