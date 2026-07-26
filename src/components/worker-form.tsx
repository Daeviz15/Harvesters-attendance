import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload } from "lucide-react";

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="grid gap-4 md:col-span-2 md:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-slate-600">{label}</Label>
      {children}
    </div>
  );
}

export function WorkerForm({ mode, initialData, onSubmit }: { mode: "new" | "edit", initialData?: any, onSubmit: (data: any) => void }) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {mode === "new" ? "Add Worker" : "Edit Worker"}
        </h1>
        <p className="text-sm text-slate-500">
          Fill in the worker's details across the sections below.
        </p>
      </div>

      <Card className="border-slate-200">
        <CardContent className="space-y-8 p-6">
          <Section title="Profile Photo" description="Upload a clear headshot.">
            <div className="md:col-span-2">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-10 text-slate-500 hover:bg-slate-100">
                <Upload className="mb-2 h-6 w-6" />
                <span className="text-sm">Click to upload photo</span>
                <span className="text-xs text-slate-400">PNG, JPG up to 5MB</span>
              </label>
            </div>
          </Section>

          <Separator />

          <Section title="Personal Information" description="Basic contact details.">
            <Field label="Full Name"><Input name="fullName" defaultValue={initialData?.fullName} placeholder="Jane Doe" required /></Field>
            <Field label="Email"><Input name="email" defaultValue={initialData?.email} type="email" placeholder="jane@church.org" required /></Field>
            <Field label="Phone"><Input name="phone" defaultValue={initialData?.phone} placeholder="+234 800 000 0000" /></Field>
            <Field label="Date of Birth"><Input name="dob" defaultValue={initialData?.dob} type="date" /></Field>
            <Field label="Gender">
              <Select name="gender" defaultValue={initialData?.gender}>
                <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Marital Status">
              <Select name="maritalStatus" defaultValue={initialData?.maritalStatus}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="widowed">Widowed</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Home Address"><Input name="homeAddress" defaultValue={initialData?.homeAddress} placeholder="Street, City" /></Field>
            <Field label="Emergency Contact"><Input name="emergencyContact" defaultValue={initialData?.emergencyContact} placeholder="Name — phone" /></Field>
          </Section>

          <Separator />

          <Section title="Church & Department" description="Membership and role info.">
            <Field label="Department">
              <Select name="department" defaultValue={initialData?.department} required>
                <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ushering">Ushering</SelectItem>
                  <SelectItem value="Choir">Choir</SelectItem>
                  <SelectItem value="Media">Media</SelectItem>
                  <SelectItem value="Protocol">Protocol</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Role"><Input name="role" defaultValue={initialData?.role} placeholder="e.g. Team Lead" required /></Field>
            <Field label="Date Joined"><Input name="dateJoined" defaultValue={initialData?.dateJoined} type="date" /></Field>
            <Field label="Baptism Status">
              <Select name="baptismStatus" defaultValue={initialData?.baptismStatus}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baptized">Baptized</SelectItem>
                  <SelectItem value="not-baptized">Not Baptized</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-center justify-between rounded-md border border-slate-200 p-3 md:col-span-2">
              <div>
                <div className="text-sm font-medium text-slate-900">Membership Status</div>
                <div className="text-xs text-slate-500">Toggle if this worker is active.</div>
              </div>
              <Switch name="active" defaultChecked={initialData ? initialData.active : true} />
            </div>
          </Section>

          <Separator />

          <Section title="Work & Business" description="Professional details.">
            <Field label="Occupation"><Input name="occupation" defaultValue={initialData?.occupation} placeholder="e.g. Engineer" /></Field>
            <Field label="Business Name"><Input name="businessName" defaultValue={initialData?.businessName} /></Field>
            <Field label="Business Type"><Input name="businessType" defaultValue={initialData?.businessType} /></Field>
            <Field label="Work Address"><Input name="workAddress" defaultValue={initialData?.workAddress} /></Field>
            <Field label="Work Phone"><Input name="workPhone" defaultValue={initialData?.workPhone} /></Field>
            <Field label="Professional Email"><Input name="professionalEmail" defaultValue={initialData?.professionalEmail} type="email" /></Field>
          </Section>

          <Separator />

          <div className="flex justify-end gap-2">
            <Button asChild variant="outline" type="button">
              <Link to="/workers">Cancel</Link>
            </Button>
            <Button type="submit" className="bg-slate-900 hover:bg-slate-800">Save Worker</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
