"use client";

import { useActionState, useState } from "react";
import { motion } from "framer-motion";
import { Phone, Users, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { completeOnboarding } from "@/app/auth/actions";
import LoadingOverlay from "@/components/LoadingOverlay";
import ThemeToggle from "@/components/ThemeToggle";

interface OnboardingClientProps {
    firstName: string;
}

const DEPARTMENTS = [
    "Ushering", "Choir / Music", "Media / AV", "Protocol",
    "Children's Church", "Security", "Technical", "Hospitality",
    "Sanitation", "Parking", "Prayer", "Follow-Up / Counseling"
];

export default function OnboardingClient({ firstName }: OnboardingClientProps) {
    const [state, formAction, isPending] = useActionState(completeOnboarding, null);
    const [selectedDepts, setSelectedDepts] = useState<string[]>([]);

    const toggleDepartment = (dept: string) => {
        setSelectedDepts(prev =>
            prev.includes(dept)
                ? prev.filter(d => d !== dept)
                : [...prev, dept]
        );
    };

    return (
        <main className="min-h-screen w-full flex items-center justify-center bg-background text-foreground relative overflow-hidden font-sans py-12 px-6 transition-colors duration-300">
            <LoadingOverlay isOpen={isPending} />

            {/* Theme Toggle in Top Right */}
            <div className="absolute top-6 right-6 z-20">
                <ThemeToggle />
            </div>

            {/* Ambient Background Glow */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[120px]"></div>
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#34A853]/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[120px]"></div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-3xl relative z-10 flex flex-col bg-card dark:bg-black/40 backdrop-blur-xl border border-border dark:border-white/10 rounded-[32px] p-8 md:p-12 shadow-2xl transition-colors duration-300"
            >
                {/* Header Section */}
                <div className="mb-10 text-center flex flex-col items-center">
                    <div className="relative h-20 w-32 mb-6">
                        <Image
                            src="/logo.png"
                            alt="Harvesters Logo"
                            fill
                            sizes="128px"
                            className="object-contain opacity-90 dark:invert-0 invert transition-all"
                            priority
                        />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-800 dark:text-white/90 mb-3">Welcome, {firstName}!</h1>
                    <p className="text-[15px] text-neutral-500 dark:text-white/50 max-w-md">Let's get your profile set up so you can start checking in for your service shifts.</p>
                </div>

                <form action={formAction} className="space-y-10">
                    {state?.error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-[13px] p-4 rounded-xl text-center">
                            {state.error}
                        </div>
                    )}

                    {/* Department Selection */}
                    <div>
                        <div className="flex items-center gap-2 mb-6">
                            <Users className="w-5 h-5 text-[#34A853]" />
                            <label className="text-[14px] font-semibold tracking-wide text-neutral-700 dark:text-white/80">Which department(s) do you serve in?</label>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {DEPARTMENTS.map((dept) => (
                                <button
                                    key={dept}
                                    type="button"
                                    onClick={() => toggleDepartment(dept)}
                                    className={`relative p-4 rounded-2xl border text-left transition-all duration-200 ${selectedDepts.includes(dept)
                                            ? "bg-[#34A853]/10 border-[#34A853]/40 text-[#34A853] dark:text-white font-semibold"
                                            : "bg-neutral-200/50 dark:bg-white/5 border-neutral-300 dark:border-white/10 text-neutral-600 dark:text-white/50 hover:bg-neutral-200/80 dark:hover:bg-white/10"
                                        }`}
                                >
                                    <span className="text-[13px] font-medium leading-snug block pr-6">{dept}</span>
                                    {selectedDepts.includes(dept) && (
                                        <CheckCircle2 className="w-4 h-4 text-[#34A853] absolute top-4 right-3" />
                                    )}
                                </button>
                            ))}
                        </div>
                        {/* Hidden input to pass the selected department to the server action */}
                        <input type="hidden" name="department" value={selectedDepts.join(", ")} required={selectedDepts.length === 0 ? true : undefined} />
                    </div>

                    {/* Phone Number Input */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Phone className="w-5 h-5 text-[#34A853]" />
                            <label className="text-[14px] font-semibold tracking-wide text-neutral-700 dark:text-white/80">Phone Number</label>
                        </div>
                        <div className="relative group max-w-md">
                            <div className="flex items-center border-b border-neutral-300 dark:border-white/10 group-focus-within:border-[#34A853]/50 transition-colors pb-3">
                                <span className="text-neutral-500 dark:text-white/40 text-[15px] mr-2">+234</span>
                                <input
                                    type="tel"
                                    name="phone"
                                    required
                                    pattern="[0-9]{10}"
                                    maxLength={10}
                                    onInput={(e) => {
                                        e.currentTarget.value = e.currentTarget.value.replace(/[^0-9]/g, '');
                                    }}
                                    className="w-full bg-transparent text-neutral-800 dark:text-white text-[16px] focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-white/20 tracking-wide"
                                    placeholder="8012345678"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isPending || selectedDepts.length === 0}
                        className="w-full flex items-center justify-center gap-2 bg-[#34A853] hover:bg-[#2e9347] disabled:opacity-40 disabled:hover:bg-[#34A853] text-white py-4 rounded-xl font-bold tracking-widest text-[14px] uppercase transition-all duration-300 shadow-lg hover:shadow-xl mt-8"
                    >
                        {isPending ? "Setting up..." : "Complete Setup"}
                    </button>
                </form>
            </motion.div>
        </main>
    );
}
