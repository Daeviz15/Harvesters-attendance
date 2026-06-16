"use client";

import { useActionState, useState } from "react";
import { motion } from "framer-motion";
import { Phone, Users, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { completeOnboarding } from "@/app/auth/actions";
import LoadingOverlay from "@/components/LoadingOverlay";

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
    const [selectedDept, setSelectedDept] = useState<string>("");

    return (
        <main className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0a] text-[#ededed] relative overflow-hidden font-sans py-12 px-6">
            <LoadingOverlay isOpen={isPending} />
            
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full mix-blend-screen filter blur-[120px]"></div>
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#34A853]/10 rounded-full mix-blend-screen filter blur-[120px]"></div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-3xl relative z-10 flex flex-col bg-black/40 backdrop-blur-xl border border-white/10 rounded-[32px] p-8 md:p-12 shadow-2xl"
            >
                {/* Header Section */}
                <div className="mb-10 text-center flex flex-col items-center">
                    <div className="relative h-20 w-32 mb-6">
                        <Image
                            src="/logo.png"
                            alt="Harvesters Logo"
                            fill
                            sizes="128px"
                            className="object-contain opacity-90"
                            priority
                        />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white/90 mb-3">Welcome, {firstName}!</h1>
                    <p className="text-[15px] text-white/50 max-w-md">Let's get your profile set up so you can start checking in for your service shifts.</p>
                </div>

                <form action={formAction} className="space-y-10">
                    {state?.error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] p-4 rounded-xl text-center">
                            {state.error}
                        </div>
                    )}

                    {/* Department Selection */}
                    <div>
                        <div className="flex items-center gap-2 mb-6">
                            <Users className="w-5 h-5 text-[#34A853]" />
                            <label className="text-[14px] font-semibold tracking-wide text-white/80">Which department do you serve in?</label>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {DEPARTMENTS.map((dept) => (
                                <button
                                    key={dept}
                                    type="button"
                                    onClick={() => setSelectedDept(dept)}
                                    className={`relative p-4 rounded-2xl border text-left transition-all duration-200 cursor-none ${
                                        selectedDept === dept 
                                        ? "bg-[#34A853]/10 border-[#34A853]/40 text-white" 
                                        : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20"
                                    }`}
                                >
                                    <span className="text-[13px] font-medium leading-snug block pr-6">{dept}</span>
                                    {selectedDept === dept && (
                                        <CheckCircle2 className="w-4 h-4 text-[#34A853] absolute top-4 right-3" />
                                    )}
                                </button>
                            ))}
                        </div>
                        {/* Hidden input to pass the selected department to the server action */}
                        <input type="hidden" name="department" value={selectedDept} required />
                    </div>

                    {/* Phone Number Input */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Phone className="w-5 h-5 text-[#34A853]" />
                            <label className="text-[14px] font-semibold tracking-wide text-white/80">Phone Number</label>
                        </div>
                        <div className="relative group max-w-md">
                            <div className="flex items-center border-b border-white/10 group-focus-within:border-[#34A853]/50 transition-colors pb-3">
                                <span className="text-white/40 text-[15px] mr-2">+234</span>
                                <input
                                    type="tel"
                                    name="phone"
                                    required
                                    className="w-full bg-transparent text-white text-[16px] focus:outline-none placeholder:text-white/20 tracking-wide cursor-none"
                                    placeholder="801 234 5678"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-6 border-t border-white/10 flex justify-end">
                        <button
                            type="submit"
                            disabled={isPending || !selectedDept}
                            className="bg-[#34A853] hover:bg-[#2e9347] text-white px-8 py-4 rounded-full font-semibold tracking-wider text-[13px] uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-none flex items-center gap-2 shadow-lg shadow-[#34A853]/20"
                        >
                            Complete Setup
                        </button>
                    </div>
                </form>
            </motion.div>
        </main>
    );
}
