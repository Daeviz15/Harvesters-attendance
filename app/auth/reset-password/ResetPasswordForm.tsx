"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { updateRecoveredPassword } from "@/app/auth/actions";
import LoadingOverlay from "@/components/LoadingOverlay";

export default function ResetPasswordForm() {
    const [state, formAction, isPending] = useActionState(updateRecoveredPassword, null);

    return (
        <>
            <LoadingOverlay isOpen={isPending} />

            <form action={formAction} className="space-y-8">
                {state?.error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-[13px] p-3 rounded-lg text-center">
                        {state.error}
                    </div>
                )}

                <div className="relative group">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-white/50 block mb-2">
                        New Password
                    </label>
                    <div className="flex items-center border-b border-neutral-300 dark:border-white/10 group-focus-within:border-neutral-500 dark:group-focus-within:border-white/40 transition-colors pb-2">
                        <input
                            type="password"
                            name="password"
                            required
                            minLength={8}
                            maxLength={128}
                            autoComplete="new-password"
                            className="w-full bg-transparent text-neutral-800 dark:text-white text-[15px] focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-white/20 tracking-widest"
                            placeholder="••••••••"
                        />
                        <KeyRound className="w-5 h-5 text-neutral-400 dark:text-white/30 ml-3" />
                    </div>
                </div>

                <div className="relative group">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-white/50 block mb-2">
                        Confirm New Password
                    </label>
                    <div className="flex items-center border-b border-neutral-300 dark:border-white/10 group-focus-within:border-neutral-500 dark:group-focus-within:border-white/40 transition-colors pb-2">
                        <input
                            type="password"
                            name="confirmPassword"
                            required
                            minLength={8}
                            maxLength={128}
                            autoComplete="new-password"
                            className="w-full bg-transparent text-neutral-800 dark:text-white text-[15px] focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-white/20 tracking-widest"
                            placeholder="••••••••"
                        />
                        <KeyRound className="w-5 h-5 text-neutral-400 dark:text-white/30 ml-3" />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isPending}
                    className="w-full mt-6 bg-[#34A853] hover:bg-[#2e9347] text-white py-4 rounded-xl font-semibold tracking-wider text-[13px] uppercase transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    Update password
                </button>
            </form>
        </>
    );
}
