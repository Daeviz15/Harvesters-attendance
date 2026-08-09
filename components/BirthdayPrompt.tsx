"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, Loader2 } from "lucide-react";
import { updateMyDateOfBirth } from "@/app/dashboard/actions";

interface BirthdayPromptProps {
    initialOpen: boolean;
}

export default function BirthdayPrompt({ initialOpen }: BirthdayPromptProps) {
    const router = useRouter();
    const [dateOfBirth, setDateOfBirth] = useState("");
    const [isOpen, setIsOpen] = useState(initialOpen);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSaving(true);
        setError(null);

        const formData = new FormData(event.currentTarget);

        try {
            const result = await updateMyDateOfBirth(formData);

            if (result.error) {
                setError(result.error);
                return;
            }

            setIsOpen(false);
            router.refresh();
        } catch (submitError) {
            console.error("Birthday save failed:", submitError);
            setError("Could not reach the server. Please refresh the page and try again.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
                >
                    <motion.form
                        initial={{ scale: 0.96, y: 16, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.96, y: 16, opacity: 0 }}
                        onSubmit={handleSubmit}
                        className="w-full max-w-md rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl"
                    >
                        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#34A853]/15 text-[#34A853]">
                            <CalendarDays className="h-6 w-6" />
                        </div>
                        <h2 className="text-2xl font-bold tracking-tight text-white">Complete your profile</h2>
                        <p className="mt-2 text-sm leading-6 text-white/60">
                            Please add your birthday so your profile stays complete. This is private and only visible to authorized admins.
                        </p>

                        <label className="mt-6 block text-xs font-semibold uppercase tracking-wider text-white/60">
                            Birthday
                        </label>
                        <input
                            type="date"
                            name="dateOfBirth"
                            required
                            min="1900-01-01"
                            value={dateOfBirth}
                            onChange={(event) => setDateOfBirth(event.target.value)}
                            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-[#34A853] focus:ring-2 focus:ring-[#34A853]/30"
                        />

                        {error && (
                            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSaving || !dateOfBirth}
                            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#34A853] px-5 py-3 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-[#2e9347] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Save Birthday"
                            )}
                        </button>
                    </motion.form>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
