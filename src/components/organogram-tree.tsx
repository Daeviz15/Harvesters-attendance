import { useState } from "react";
import { ChevronDown, ChevronRight, User } from "lucide-react";
import type { OrgNode } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

function Node({ node, root = false }: { node: OrgNode; root?: boolean }) {
  const [open, setOpen] = useState(true);
  const hasChildren = !!node.children?.length;

  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          "group relative flex min-w-[180px] items-center gap-2 rounded-lg border bg-white px-4 py-3 shadow-sm transition-all hover:scale-[1.03] hover:shadow-md",
          root ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200",
        )}
      >
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
            root ? "bg-slate-700" : "bg-slate-100",
          )}
        >
          <User className={cn("h-4 w-4", root ? "text-white" : "text-slate-600")} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold leading-tight">{node.name}</div>
          <div className={cn("text-xs", root ? "text-slate-300" : "text-slate-500")}>
            {node.role}
          </div>
        </div>
        {hasChildren && (
          <button
            onClick={() => setOpen((o) => !o)}
            className={cn(
              "rounded p-0.5",
              root ? "hover:bg-slate-700" : "hover:bg-slate-100",
            )}
            aria-label="toggle"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
      </div>

      {hasChildren && open && (
        <>
          <div className="h-6 w-px bg-slate-300" />
          <div className="relative flex items-start gap-6">
            <div className="absolute left-0 right-0 top-0 h-px bg-slate-300" />
            {node.children!.map((child, i) => (
              <div key={i} className="relative flex flex-col items-center pt-6">
                <div className="absolute left-1/2 top-0 h-6 w-px -translate-x-1/2 bg-slate-300" />
                <Node node={child} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function OrganogramTree({ root }: { root: OrgNode }) {
  return (
    <div className="min-w-max p-8">
      <Node node={root} root />
    </div>
  );
}
