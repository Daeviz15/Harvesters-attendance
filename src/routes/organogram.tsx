
import { Card } from "@/components/ui/card";
import { OrganogramTree } from "@/components/organogram-tree";
import { organogram } from "@/lib/mock-data";

export default function OrganogramPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Organogram</h1>
        <p className="text-sm text-slate-500">Church leadership structure.</p>
      </div>
      <Card className="border-slate-200 overflow-auto">
        <OrganogramTree root={organogram} />
      </Card>
    </div>
  );
}
