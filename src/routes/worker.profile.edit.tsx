import { WorkerForm } from "@/components/worker-form";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Circle } from "lucide-react";
import { currentWorker, profileCompletenessFields } from "@/lib/mock-data";

function ProfileChecklist() {
  const w = currentWorker;
  const items = profileCompletenessFields.map((field) => {
    const value = w[field.key as keyof typeof w];
    const isComplete = typeof value === "string" && value.trim().length > 0;
    return { ...field, isComplete };
  });
  const completed = items.filter((i) => i.isComplete).length;
  const total = items.length;
  const pct = Math.round((completed / total) * 100);

  return (
    <Card className="border-slate-200">
      <CardContent className="p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            Profile Completeness Checklist
          </h2>
          <p className="text-sm text-slate-500">
            {completed} of {total} fields completed ({pct}%)
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-sm">
              {item.isComplete ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Circle className="h-4 w-4 text-slate-300" />
              )}
              <span className={item.isComplete ? "text-slate-700" : "text-slate-400"}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function WorkerProfileEdit() {
  return (
    <div className="space-y-6">
      <ProfileChecklist />
      <WorkerForm mode="edit" />
    </div>
  );
}
