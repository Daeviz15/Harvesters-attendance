"use client";

import { useActionState, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Phone, Users, CheckCircle2, Lock, User, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { completeOnboarding, getUpcomingWorkerIdPreview } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/client";
import LoadingOverlay from "@/components/LoadingOverlay";
import ThemeToggle from "@/components/ThemeToggle";
import { getTeamCode } from "@/lib/workerId";

interface OnboardingClientProps {
    initialFirstName: string;
    initialLastName: string;
    workerId: string;
    userId: string;
    initialAvatarUrl: string | null;
    initialPhone: string;
    initialDepartmentId?: string | null;
    departments: {
        id: string;
        name: string;
        description: string | null;
        team: string | null;
    }[];
}

export default function OnboardingClient({
    initialFirstName,
    initialLastName,
    workerId,
    userId,
    initialAvatarUrl,
    initialPhone,
    initialDepartmentId,
    departments,
}: OnboardingClientProps) {
    const [state, formAction, isPending] = useActionState(completeOnboarding, null);
    const [firstName, setFirstName] = useState(initialFirstName);
    const [lastName, setLastName] = useState(initialLastName);
    const [phone, setPhone] = useState(initialPhone);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    // Normalize team names for case-insensitive matching and group uncategorized departments
    const normalizedDepts = (departments || []).map(d => ({
        ...d,
        teamNormalized: d.team ? d.team.trim().toUpperCase() : "GENERAL"
    }));

    const initialDept = normalizedDepts.find(d => d.id === initialDepartmentId);
    const [selectedTeam, setSelectedTeam] = useState<string | null>(
        initialDept ? initialDept.teamNormalized : null
    );
    const [selectedDepartmentId, setSelectedDepartmentId] = useState(initialDepartmentId || "");
    const [previewWorkerId, setPreviewWorkerId] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedTeam) {
            setPreviewWorkerId(null);
            return;
        }
        let isMounted = true;
        getUpcomingWorkerIdPreview(selectedTeam).then(id => {
            if (isMounted && id) setPreviewWorkerId(id);
        }).catch(err => console.error("Error fetching preview ID:", err));
        return () => { isMounted = false; };
    }, [selectedTeam]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setUploadError("Image size must be less than 5MB");
            return;
        }

        setUploadError(null);
        setIsUploading(true);

        try {
            const supabase = createClient();
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
            const filePath = `${userId}/${fileName}`;

            const { error } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, { upsert: true });

            if (error) throw error;

            const { data: publicUrlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            setAvatarUrl(publicUrlData.publicUrl);
        } catch (error: unknown) {
            console.error('Error uploading image:', error);
            setUploadError(error instanceof Error ? error.message : "Failed to upload image. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

    const isPhoneValid = phone.length === 10;
    const isFormValid = firstName.trim().length >= 2 && isPhoneValid && !!selectedDepartmentId && !isUploading;

    const knownTeamOrder = ["PROGRAMS", "MINISTRY", "MATURITY", "MEMBERSHIP", "MISSIONS", "NEXT GEN", "GENERAL"];
    const presentTeams = Array.from(new Set(normalizedDepts.map(d => d.teamNormalized)));
    const sortedTeams = knownTeamOrder.filter(t => presentTeams.includes(t));
    presentTeams.forEach(t => {
        if (!sortedTeams.includes(t)) sortedTeams.push(t);
    });

    const filteredDepts = selectedTeam
        ? normalizedDepts.filter(d => d.teamNormalized === selectedTeam)
        : [];
    const selectedDepartment = normalizedDepts.find(d => d.id === selectedDepartmentId);

    return (
        <main className="min-h-screen w-full flex items-center justify-center bg-background text-foreground relative overflow-hidden font-sans py-12 px-6 transition-colors duration-300">
            <LoadingOverlay isOpen={isPending} />

            {/* Theme Toggle */}
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
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-800 dark:text-white/90 mb-3">Welcome!</h1>
                    <p className="text-[15px] text-neutral-500 dark:text-white/50 max-w-md">Let&apos;s complete your profile set up so you can start checking in for your service shifts.</p>
                </div>

                <form action={formAction} className="space-y-8">
                    {state?.error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-[13px] p-4 rounded-xl text-center font-medium">
                            {state.error}
                        </div>
                    )}

                    {/* Section 1: Assigned Worker ID (Auto-generated & Uneditable) */}
                    <div className="bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-[#34A853]" />
                                <label className="text-[14px] font-semibold tracking-wide text-neutral-800 dark:text-white/90">
                                    Assigned Worker ID
                                </label>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-[#34A853]/10 text-[#34A853] border border-[#34A853]/20">
                                <Lock className="w-3 h-3" /> System Generated
                            </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between bg-white dark:bg-black/40 border border-neutral-300 dark:border-white/15 rounded-xl px-4 py-3 shadow-inner">
                            <span className="font-mono text-[18px] font-bold text-[#34A853] tracking-widest">
                                {workerId ? (
                                    workerId
                                ) : previewWorkerId ? (
                                    previewWorkerId
                                ) : selectedTeam ? (
                                    `GLOBE/${getTeamCode(selectedTeam)}/${new Date().getFullYear().toString().slice(-2)}/••••`
                                ) : (
                                    `GLOBE/---/${new Date().getFullYear().toString().slice(-2)}/••••`
                                )}
                            </span>
                            <span className="text-[11px] uppercase font-semibold tracking-wider text-neutral-400 dark:text-white/40 bg-neutral-100 dark:bg-white/5 px-2.5 py-1 rounded-md">
                                {workerId ? "Read Only" : previewWorkerId ? "Assigned Preview" : selectedTeam ? "Format Preview" : "Pending Team"}
                            </span>
                        </div>
                        <p className="text-[12px] text-neutral-500 dark:text-white/40 mt-2.5 font-medium">
                            {workerId
                                ? "This unique Worker ID is permanently assigned to your profile for attendance tracking."
                                : previewWorkerId
                                    ? `Your assigned Worker ID will be ${previewWorkerId} upon completing setup.`
                                    : selectedTeam
                                        ? `Your Worker ID format is set to GLOBE/${getTeamCode(selectedTeam)}/${new Date().getFullYear().toString().slice(-2)}/XXXX.`
                                        : "Select your Ministry Team below to generate your team-scoped Worker ID."}
                        </p>
                        <input type="hidden" name="workerId" value={workerId} />
                    </div>

                    {/* Section 2: Full Name Input */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <User className="w-5 h-5 text-[#34A853]" />
                            <label className="text-[14px] font-semibold tracking-wide text-neutral-700 dark:text-white/80">
                                Your Full Name
                            </label>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[12px] font-medium text-neutral-500 dark:text-white/50 mb-1.5">
                                    First Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="firstName"
                                    required
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full bg-neutral-100/70 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-800 dark:text-white text-[15px] focus:outline-none focus:border-[#34A853] transition-colors"
                                    placeholder="e.g. David"
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] font-medium text-neutral-500 dark:text-white/50 mb-1.5">
                                    Last Name
                                </label>
                                <input
                                    type="text"
                                    name="lastName"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                    className="w-full bg-neutral-100/70 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-800 dark:text-white text-[15px] focus:outline-none focus:border-[#34A853] transition-colors"
                                    placeholder="e.g. Oyetade"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Section 3: Profile Picture Upload */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Users className="w-5 h-5 text-[#34A853]" />
                            <label className="text-[14px] font-semibold tracking-wide text-neutral-700 dark:text-white/80">
                                Profile Picture <span className="text-[12px] font-normal text-neutral-400 dark:text-white/40 ml-1">(Optional)</span>
                            </label>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center sm:items-center text-center sm:text-left gap-4 sm:gap-6 bg-neutral-50/50 dark:bg-white/[0.02] border border-neutral-200 dark:border-white/5 p-4 rounded-2xl">
                            <div className="relative w-20 h-20 rounded-full bg-neutral-200 dark:bg-white/5 border-2 border-dashed border-neutral-300 dark:border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                                {avatarUrl ? (
                                    <Image src={avatarUrl} alt="Avatar" fill className="object-cover" sizes="80px" />
                                ) : (
                                    <span className="text-neutral-400 dark:text-white/30 text-[10px] uppercase font-bold tracking-widest">Upload</span>
                                )}
                                {isUploading && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm z-10">
                                        <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 w-full">
                                <label className="cursor-pointer inline-block bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-white/80 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors border border-neutral-200 dark:border-white/10">
                                    Choose Image
                                    <input 
                                        type="file" 
                                        accept="image/png, image/jpeg, image/jpg, image/webp" 
                                        onChange={handleFileUpload} 
                                        disabled={isUploading}
                                        className="hidden" 
                                    />
                                </label>
                                <p className="text-[12px] text-neutral-500 dark:text-white/40 mt-2 font-medium">JPEG, PNG, or WebP. Max 5MB.</p>
                                {uploadError && <p className="text-[12px] text-red-500 mt-2">{uploadError}</p>}
                            </div>
                        </div>
                        <input type="hidden" name="avatarUrl" value={avatarUrl || ""} />
                    </div>

                    {/* Section 4: Ministry Team & Department Selection (Cascading Dropdowns) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Users className="w-5 h-5 text-[#34A853]" />
                            <label className="text-[14px] font-semibold tracking-wide text-neutral-700 dark:text-white/80">
                                Select Your Team & Department <span className="text-red-500">*</span>
                            </label>
                        </div>
                        <p className="text-[12px] text-neutral-500 dark:text-white/40 mb-3 ml-7">
                            Choose your Ministry Team first to view and select your assigned department.
                        </p>

                        {sortedTeams.length === 0 ? (
                            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-4 rounded-xl text-[13px] font-medium text-center">
                                No active departments found in database.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Step 1: Ministry Team Dropdown */}
                                <div>
                                    <label className="block text-[12px] font-medium text-neutral-500 dark:text-white/50 mb-1.5">
                                        Ministry Team <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedTeam || ""}
                                            onChange={(e) => {
                                                const newTeam = e.target.value || null;
                                                setSelectedTeam(newTeam);
                                                if (selectedDepartmentId) {
                                                    const currentDept = normalizedDepts.find(d => d.id === selectedDepartmentId);
                                                    if (currentDept && currentDept.teamNormalized !== newTeam) {
                                                        setSelectedDepartmentId("");
                                                    }
                                                }
                                            }}
                                            className="w-full bg-neutral-100/70 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-800 dark:text-white text-[14px] font-medium focus:outline-none focus:border-[#34A853] transition-colors appearance-none cursor-pointer pr-10"
                                        >
                                            <option value="" disabled className="dark:bg-[#121212] text-neutral-400">
                                                -- Select Ministry Team --
                                            </option>
                                            {sortedTeams.map((teamName) => {
                                                const count = normalizedDepts.filter(d => d.teamNormalized === teamName).length;
                                                return (
                                                    <option key={teamName} value={teamName} className="dark:bg-[#121212] text-neutral-800 dark:text-white">
                                                        {teamName} ({count} dept{count !== 1 ? 's' : ''})
                                                    </option>
                                                );
                                            })}
                                        </select>
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-neutral-400 dark:text-white/40">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                {/* Step 2: Department Dropdown (Cascading based on selectedTeam) */}
                                <div>
                                    <label className="block text-[12px] font-medium text-neutral-500 dark:text-white/50 mb-1.5">
                                        Department <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <select
                                            disabled={!selectedTeam}
                                            value={selectedDepartmentId}
                                            onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                            className="w-full bg-neutral-100/70 dark:bg-white/5 border border-neutral-300 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-800 dark:text-white text-[14px] font-medium focus:outline-none focus:border-[#34A853] transition-colors appearance-none cursor-pointer pr-10 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <option value="" disabled className="dark:bg-[#121212] text-neutral-400">
                                                {selectedTeam ? "-- Select Department --" : "-- Select Team First --"}
                                            </option>
                                            {filteredDepts.map((dept) => (
                                                <option key={dept.id} value={dept.id} className="dark:bg-[#121212] text-neutral-800 dark:text-white">
                                                    {dept.name}
                                                </option>
                                            ))}
                                        </select>
                                        <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-neutral-400 dark:text-white/40">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Selected Department Confirmation Badge */}
                        {selectedDepartment && selectedTeam && (
                            <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#34A853]/10 border border-[#34A853]/20 text-[#34A853] text-[13px] font-medium mt-2"
                            >
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                <span>
                                    Selected: <strong className="font-bold">{selectedDepartment.name}</strong> under <strong className="font-bold">{selectedTeam}</strong> Ministry
                                </span>
                            </motion.div>
                        )}

                        <input type="hidden" name="departmentId" value={selectedDepartmentId} required />
                    </div>

                    {/* Section 5: Phone Number Input */}
                    <div>
                        <div className="flex items-center gap-2 mb-3">
                            <Phone className="w-5 h-5 text-[#34A853]" />
                            <label className="text-[14px] font-semibold tracking-wide text-neutral-700 dark:text-white/80">
                                Phone Number <span className="text-red-500">*</span>
                            </label>
                        </div>
                        <div className="relative group max-w-md">
                            <div className="flex items-center border-b border-neutral-300 dark:border-white/10 group-focus-within:border-[#34A853]/50 transition-colors pb-3">
                                <span className="text-neutral-500 dark:text-white/40 text-[15px] mr-2 font-medium">+234</span>
                                <input
                                    type="tel"
                                    name="phone"
                                    required
                                    pattern="[0-9]{10}"
                                    maxLength={10}
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                                    className="w-full bg-transparent text-neutral-800 dark:text-white text-[16px] focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-white/20 tracking-wide font-medium"
                                    placeholder="8012345678"
                                />
                            </div>
                            <p className="text-[12px] text-neutral-500 dark:text-white/40 mt-2 font-medium">
                                Enter your 10-digit mobile number.
                            </p>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isPending || !isFormValid}
                        className="w-full flex items-center justify-center gap-2 bg-[#34A853] hover:bg-[#2e9347] disabled:opacity-40 disabled:hover:bg-[#34A853] text-white py-4 rounded-xl font-bold tracking-widest text-[14px] uppercase transition-all duration-300 shadow-lg hover:shadow-xl mt-8 cursor-pointer disabled:cursor-not-allowed"
                    >
                        {isPending ? "Completing Setup..." : "Complete Setup"}
                    </button>
                </form>
            </motion.div>
        </main>
    );
}
