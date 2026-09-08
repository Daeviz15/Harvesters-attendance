"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { requestPasswordReset } from "@/app/auth/actions";
import LoadingOverlay from "@/components/LoadingOverlay";
import ThemeToggle from "@/components/ThemeToggle";

export default function ForgotPasswordPage() {
    const [state, formAction, isPending] = useActionState(requestPasswordReset, null);

    return (
        <main className="min-h-screen w-full flex items-center justify-center bg-background text-foreground relative overflow-hidden font-sans transition-colors duration-300">
            <LoadingOverlay isOpen={isPending} />

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
                        Reset your password
                    </h1>
                </div>

                <p className="mb-8 text-sm leading-6 text-neutral-600 dark:text-white/55">
                    Enter your email address and we&apos;ll send a secure password reset link if the account exists.
                </p>

                <form action={formAction} className="space-y-8">
                    {state?.success && (
                        <div className="bg-[#34A853]/10 border border-[#34A853]/20 text-[#34A853] text-[13px] p-3 rounded-lg text-center">
                            {state.success}
                        </div>
                    )}

                    {state?.error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-[13px] p-3 rounded-lg text-center">
                            {state.error}
                        </div>
                    )}

                    <div className="relative group">
                        <label className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-white/50 block mb-2">
                            Email Address
                        </label>
                        <div className="flex items-center border-b border-neutral-300 dark:border-white/10 group-focus-within:border-neutral-500 dark:group-focus-within:border-white/40 transition-colors pb-2">
                            <input
                                type="email"
                                name="email"
                                required
                                autoComplete="email"
                                className="w-full bg-transparent text-neutral-800 dark:text-white text-[15px] focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-white/20"
                                placeholder="you@harvesters.org"
                            />
                            <Mail className="w-5 h-5 text-neutral-400 dark:text-white/30 ml-3" />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isPending}
                        className="w-full mt-6 bg-[#34A853] hover:bg-[#2e9347] text-white py-4 rounded-xl font-semibold tracking-wider text-[13px] uppercase transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Send className="w-4 h-4" />
                        Send reset link
                    </button>
                </form>

                <div className="mt-10 text-center">
                    <Link
                        href="/auth/login"
                        className="inline-flex items-center gap-2 text-[13px] text-neutral-500 dark:text-white/50 hover:text-[#34A853] transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to login
                    </Link>
                </div>
            </section>
        </main>
    );
}
