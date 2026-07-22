import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Eye, Pencil, Trash2, Plus, Search } from "lucide-react";
import { useRole } from "@/lib/role-context";
import { workersAdmin, workersDeptAdmin, departments } from "@/lib/mock-data";

export default function WorkersList() {
  const { role } = useRole();
  const workers = role === "admin" ? workersAdmin : workersDeptAdmin;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Workers</h1>
          <p className="text-sm text-slate-500">
            {role === "dept-admin" ? "Ushering department workers." : "All church workers."}
          </p>
        </div>
        <Button asChild className="bg-slate-900 hover:bg-slate-800">
          <Link to="/workers/new">
            <Plus className="mr-2 h-4 w-4" /> Add Worker
          </Link>
        </Button>
      </div>

      <Card className="border-slate-200 p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search workers..." className="pl-9" />
          </div>
          <Select>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Filter by department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Full Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Work / Business</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workers.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={w.avatar} alt={w.fullName} />
                      <AvatarFallback>{w.fullName.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">{w.fullName}</TableCell>
                  <TableCell className="text-slate-600">{w.email}</TableCell>
                  <TableCell className="text-slate-600">{w.phone}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                      {w.department}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {w.occupation} · {w.businessName}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="icon">
                      <Link to={`/workers/${w.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button asChild variant="ghost" size="icon">
                      <Link to={`/workers/${w.id}/edit`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
