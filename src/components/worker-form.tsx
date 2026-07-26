"use client";

import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload } from "lucide-react";
import { toast } from "sonner";

const workerSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  phone: z.string().optional(),
  dob: z.string().optional(),
  gender: z.string().optional(),
  maritalStatus: z.string().optional(),
  homeAddress: z.string().optional(),
  emergencyContact: z.string().optional(),
  department: z.string().min(1, "Department is required"),
  role: z.string().min(1, "Role is required"),
  cellGroup: z.string().optional(),
  dateJoined: z.string().optional(),
  baptismStatus: z.string().optional(),
  active: z.boolean().default(true),
  occupation: z.string().optional(),
  businessName: z.string().optional(),
  businessType: z.string().optional(),
});

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

export function WorkerForm({ mode, initialData, onSubmit }: { mode: "new" | "edit", initialData?: any, onSubmit: (data: any) => void }) {
  const form = useForm<z.infer<typeof workerSchema>>({
    resolver: zodResolver(workerSchema) as any,
    defaultValues: {
      fullName: initialData?.fullName || "",
      email: initialData?.email || "",
      phone: initialData?.phone || "",
      dob: initialData?.dob || "",
      gender: initialData?.gender || "",
      maritalStatus: initialData?.maritalStatus || "",
      homeAddress: initialData?.homeAddress || "",
      emergencyContact: initialData?.emergencyContact || "",
      department: initialData?.department || "",
      cellGroup: initialData?.cellGroup || "",
      role: initialData?.role || "",
      dateJoined: initialData?.dateJoined || "",
      baptismStatus: initialData?.baptismStatus || "",
      active: initialData ? initialData.active : true,
      occupation: initialData?.occupation || "",
      businessName: initialData?.businessName || "",
      businessType: initialData?.businessType || "",
    },
  });

  const handleSubmit = (values: z.infer<typeof workerSchema>) => {
    onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit, (errors) => {
        toast.error("Please fill out all required fields correctly.");
      })} className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {mode === "new" ? "Add Worker" : "Edit Worker"}
          </h1>
          <p className="text-sm text-slate-500">
            Fill in the worker&apos;s details across the sections below.
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
              <FormField control={form.control as any} name="fullName" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Full Name</FormLabel><FormControl><Input placeholder="Jane Doe" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control as any} name="email" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Email</FormLabel><FormControl><Input type="email" placeholder="jane@church.org" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control as any} name="phone" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Phone</FormLabel><FormControl><Input placeholder="+234 800 000 0000" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control as any} name="dob" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Date of Birth</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control as any} name="gender" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-medium text-slate-600">Gender</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control as any} name="maritalStatus" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-medium text-slate-600">Marital Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="single">Single</SelectItem><SelectItem value="married">Married</SelectItem><SelectItem value="widowed">Widowed</SelectItem></SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control as any} name="homeAddress" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Home Address</FormLabel><FormControl><Input placeholder="Street, City" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control as any} name="emergencyContact" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Emergency Contact</FormLabel><FormControl><Input placeholder="Name — phone" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </Section>

            <Separator />

            <Section title="Church & Department" description="Membership and role info.">
              <FormField control={form.control as any} name="department" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-medium text-slate-600">Department</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="Ushering">Ushering</SelectItem>
                      <SelectItem value="Choir">Choir</SelectItem>
                      <SelectItem value="Media">Media</SelectItem>
                      <SelectItem value="Protocol">Protocol</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control as any} name="role" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Role</FormLabel><FormControl><Input placeholder="e.g. Team Lead" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control as any} name="cellGroup" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Cell Group</FormLabel><FormControl><Input placeholder="e.g. Grace Cell" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control as any} name="dateJoined" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Date Joined</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control as any} name="baptismStatus" render={({ field }) => (
                <FormItem className="space-y-1.5">
                  <FormLabel className="text-xs font-medium text-slate-600">Baptism Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="baptized">Baptized</SelectItem><SelectItem value="not-baptized">Not Baptized</SelectItem></SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control as any} name="active" render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border border-slate-200 p-3 md:col-span-2">
                  <div>
                    <FormLabel className="text-sm font-medium text-slate-900">Membership Status</FormLabel>
                    <div className="text-xs text-slate-500">Toggle if this worker is active.</div>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
            </Section>

            <Separator />

            <Section title="Work & Business" description="Professional details.">
              <FormField control={form.control as any} name="occupation" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Occupation</FormLabel><FormControl><Input placeholder="e.g. Engineer" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control as any} name="businessName" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Business Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control as any} name="businessType" render={({ field }) => (
                <FormItem className="space-y-1.5"><FormLabel className="text-xs font-medium text-slate-600">Business Type</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </Section>

            <Separator />

            <div className="flex justify-end gap-2">
              <Button asChild variant="outline" type="button">
                <button type="button" onClick={() => window.history.back()}>Cancel</button>
              </Button>
              <Button type="submit" className="bg-slate-900 hover:bg-slate-800">Save Worker</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
