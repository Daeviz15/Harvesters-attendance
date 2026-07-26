"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuth } from "@/lib/auth-context";
import { useData } from "@/lib/data-context";
import { toast } from "sonner";
const authSide = "/auth-side.jpg";

const signupSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export default function SignupPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { addWorker } = useData();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof signupSchema>>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: z.infer<typeof signupSchema>) => {
    setIsSubmitting(true);
    // Simulate network delay
    setTimeout(() => {
      addWorker({
        fullName: values.fullName,
        email: values.email,
        phone: "",
        department: "Ushering",
        occupation: "",
        businessName: "",
        role: "Worker",
      });
      login(values.email);
      toast.success("Account created successfully!");
      router.push("/dashboard");
    }, 500);
  };

  return (
    <div className="grid min-h-screen grid-cols-1 bg-[#f7f5f0] lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-10 lg:px-16">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-black text-white overflow-hidden">
            <img src="/Harvester-icon.png" alt="Harvesters Icon" className="h-5 w-5 object-contain" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-slate-900">Harvesters Church Management System</span>
        </Link>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Start your church workspace.
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Free for churches under 50 workers.
          </p>

          <div className="mt-8 space-y-4">
            <Button
              variant="outline"
              className="w-full border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <GoogleIcon />
              Continue with Google
            </Button>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-[#f7f5f0] px-3 text-xs uppercase tracking-widest text-slate-500">
                  or with email
                </span>
              </div>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-xs font-medium text-slate-700">Full name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Jane Doe"
                          className="h-11 bg-white"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-xs font-medium text-slate-700">Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@church.org"
                          className="h-11 bg-white"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <FormLabel className="text-xs font-medium text-slate-700">Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="At least 8 characters"
                          className="h-11 bg-white"
                          disabled={isSubmitting}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button disabled={isSubmitting} type="submit" className="h-11 w-full bg-slate-900 text-sm hover:bg-slate-800">
                  {isSubmitting ? "Creating account..." : "Create account"}
                </Button>
              </form>
            </Form>

            <p className="text-center text-sm text-slate-600">
              Already have an account?{" "}
              <Link href="/auth/login" className="font-medium text-slate-900 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          By creating an account you agree to our Terms and Privacy Policy.
        </p>
      </div>

      <div className="relative hidden lg:block">
        <img
          src={authSide}
          alt="Stained glass in a modern sanctuary"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-900/60 via-slate-900/20 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <blockquote className="font-serif text-2xl leading-snug">
            "Set up on a Saturday. Ready by Sunday."
          </blockquote>
          <div className="mt-4 text-sm text-white/80">
            The whole idea behind Harvesters Church Management System.
          </div>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 12s4.3 9.7 9.6 9.7c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}
