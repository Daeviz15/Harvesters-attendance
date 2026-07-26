import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRole, type Role } from "@/lib/role-context";

const roleLabels: Record<Role, string> = {
  admin: "Church Admin",
  "dept-admin": "Dept Admin",
  worker: "Worker",
};

export function Header() {
  const { role, setRole } = useRole();
  const navigate = useNavigate();

  const pick = (r: Role) => {
    setRole(r);
    if (r === "worker") navigate("/worker");
    else navigate("/dashboard");
  };

  const opts: { r: Role; label: string }[] = [
    { r: "admin", label: "Admin" },
    { r: "dept-admin", label: "Dept Admin" },
    { r: "worker", label: "Worker" },
  ];

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div>
        <h2 className="text-sm font-medium text-slate-500">Harvesters Church Management System</h2>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="bg-slate-100 text-slate-700">
          Role: {roleLabels[role]}
        </Badge>
        <div className="flex overflow-hidden rounded-md border border-slate-200">
          {opts.map((o) => (
            <Button
              key={o.r}
              variant={role === o.r ? "default" : "ghost"}
              size="sm"
              className={role === o.r ? "bg-slate-900 hover:bg-slate-800" : ""}
              onClick={() => pick(o.r)}
            >
              {o.label}
            </Button>
          ))}
        </div>
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-slate-200 text-slate-700">
            {role === "worker" ? "GA" : "AD"}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
