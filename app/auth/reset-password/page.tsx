import Image from "next/image";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import ResetPasswordForm from "./ResetPasswordForm";
import ThemeToggle from "@/components/ThemeToggle";
import { createClient } from "@/utils/supabase/server";

export default async function ResetPasswordPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let statusMessage: string | null = null;
    let canResetPassword = Boolean(user);

    if (!user) {
        statusMessage = "This reset link is invalid or has expired. Please request a new password reset link.";
        canResetPassword = false;
    } else {
        const { data: profile, error } = await supabase
            .from("profiles")
            .select("is_active")
            .eq("id", user.id)
            .maybeSingle();

        if (error) {
            statusMessage = "We could not verify your account status. Please request a new reset link or contact an administrator.";
            canResetPassword = false;
        } else if (profile?.is_active === false) {
            statusMessage = "Your account has been deactivated. Please contact your department head, team lead, or an administrator for support.";
            canResetPassword = false;
        }
    }

    return (
        <main className="min-h-screen w-full flex items-center justify-center bg-background text-foreground relative overflow-hidden font-sans transition-colors duration-300">
            <div className="absolute top-6 right-6 z-20">
                <ThemeToggle />
            </div>

            <div className="absolute inset-0 pointer-events-none opacity-20">
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[120px]" />
            </div>

            <section className="w-full max-w-md px-6 pt-16 pb-12 relative z-10 flex flex-col">
                <div className="mb-10 flex flex-col items-start relative">
                    <div className="relative h-24 w-40 -ml-2 z-10">
                        <Image
                            src="/logo.png"
                            alt="Harvesters Logo"
                            fill
                            sizes="160px"
                            className="object-contain object-left opacity-90 dark:invert-0 invert transition-all"
                            priority
                        />
                    </div>
                    <h1 className="text-[22px] font-semibold tracking-wide text-neutral-800 dark:text-white/90 -mt-10 ml-12 relative z-20">
                        Choose a new password
                    </h1>
                </div>

                {canResetPassword ? (
                    <>
                        <p className="mb-8 text-sm leading-6 text-neutral-600 dark:text-white/55">
                            Create a new password for your Harvesters Attendance account. You&apos;ll be asked to log in again after it is saved.
                        </p>
                        <ResetPasswordForm />
                    </>
                ) : (
                    <div className="space-y-6">
                        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 flex items-start gap-3">
                            <KeyRound className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-sm leading-6 text-amber-700 dark:text-amber-300">{statusMessage}</p>
                        </div>
                        <Link
                            href="/auth/forgot-password"
                            className="inline-flex w-full items-center justify-center rounded-xl bg-[#34A853] px-4 py-4 text-[13px] font-semibold uppercase tracking-wider text-white transition-colors hover:bg-[#2e9347]"
                        >
                            Request a new reset link
                        </Link>
                    </div>
                )}
            </section>
        </main>
    );
}
