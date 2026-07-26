import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, Pencil, Trash2, Plus } from "lucide-react";
import { useData } from "@/lib/data-context";
import { toast } from "sonner";

export default function DepartmentsPage() {
  const { departments, addDepartment } = useData();

  const handleAdd = () => {
    const name = window.prompt("Enter department name:");
    if (!name) return;
    const admin = window.prompt("Enter admin name:") || "Unassigned";
    addDepartment({ name, admin });
    toast.success("Department added.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Departments</h1>
          <p className="text-sm text-slate-500">Manage church departments.</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800" onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Department
        </Button>
      </div>

      <Card className="border-slate-200 p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department Name</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Workers</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <Link
                    to="/workers"
                    className="font-medium text-slate-900 hover:text-slate-600 hover:underline"
                  >
                    {d.name}
                  </Link>
                </TableCell>
                <TableCell className="text-slate-600">{d.admin}</TableCell>
                <TableCell className="text-slate-600">{d.workersCount}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {departments.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 text-slate-500">
                  No departments found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
