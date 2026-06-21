"use client";

import { useActionState, useState } from "react";
import { motion } from "framer-motion";
import { Phone, Users, CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { completeOnboarding } from "@/app/auth/actions";
import { createClient } from "@/utils/supabase/client";
import LoadingOverlay from "@/components/LoadingOverlay";
import ThemeToggle from "@/components/ThemeToggle";

interface OnboardingClientProps {
    initialUsername: string;
    userId: string;
}

const DEPARTMENTS = [
    "Ushering", "Choir / Music", "Media / AV", "Protocol",
    "Children's Church", "Security", "Technical", "Hospitality",
    "Sanitation", "Parking", "Prayer", "Follow-Up / Counseling"
];

export default function OnboardingClient({ initialUsername, userId }: OnboardingClientProps) {
    const [state, formAction, isPending] = useActionState(completeOnboarding, null);
    const [username, setUsername] = useState(initialUsername);
    const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

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
            
            // Create a unique file name inside a folder named after the user's ID for RLS security
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
            const filePath = `${userId}/${fileName}`;

            const { data, error } = await supabase.storage
                .from('avatars')
                .upload(filePath, file, { upsert: true });

            if (error) throw error;

            const { data: publicUrlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            setAvatarUrl(publicUrlData.publicUrl);
        } catch (error: any) {
            console.error('Error uploading image:', error);
            setUploadError(error.message || "Failed to upload image. Please try again.");
        } finally {
            setIsUploading(false);
        }
    };

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
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-800 dark:text-white/90 mb-3">Welcome!</h1>
                    <p className="text-[15px] text-neutral-500 dark:text-white/50 max-w-md">Let's get your profile set up so you can start checking in for your service shifts.</p>
                </div>

                <form action={formAction} className="space-y-10">
                    {state?.error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-[13px] p-4 rounded-xl text-center">
                            {state.error}
                        </div>
                    )}

                    {/* Username Input */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Users className="w-5 h-5 text-[#34A853]" />
                            <label className="text-[14px] font-semibold tracking-wide text-neutral-700 dark:text-white/80">Choose a Username</label>
                        </div>
                        <div className="relative group max-w-md">
                            <div className="flex items-center border-b border-neutral-300 dark:border-white/10 group-focus-within:border-[#34A853]/50 transition-colors pb-3">
                                <span className="text-neutral-500 dark:text-white/40 text-[15px] mr-2">@</span>
                                <input
                                    type="text"
                                    name="username"
                                    required
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                                    className="w-full bg-transparent text-neutral-800 dark:text-white text-[16px] focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-white/20 tracking-wide"
                                    placeholder="coolworker"
                                />
                            </div>
                            <p className="text-[12px] text-neutral-500 dark:text-white/40 mt-2 font-medium">Letters, numbers, and underscores only.</p>
                        </div>
                    </div>

                    {/* Profile Picture Upload */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Users className="w-5 h-5 text-[#34A853]" />
                            <label className="text-[14px] font-semibold tracking-wide text-neutral-700 dark:text-white/80">Profile Picture</label>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="relative w-24 h-24 rounded-full bg-neutral-200 dark:bg-white/5 border-2 border-dashed border-neutral-300 dark:border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                                {avatarUrl ? (
                                    <Image src={avatarUrl} alt="Avatar" fill className="object-cover" sizes="96px" />
                                ) : (
                                    <span className="text-neutral-400 dark:text-white/30 text-[10px] uppercase font-bold tracking-widest">Upload</span>
                                )}
                                {isUploading && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm z-10">
                                        <div className="w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1">
                                <label className="cursor-pointer bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-700 dark:text-white/80 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors border border-neutral-200 dark:border-white/10">
                                    Choose Image
                                    <input 
                                        type="file" 
                                        accept="image/png, image/jpeg, image/jpg, image/webp" 
                                        onChange={handleFileUpload} 
                                        disabled={isUploading}
                                        className="hidden" 
                                    />
                                </label>
                                <p className="text-[12px] text-neutral-500 dark:text-white/40 mt-3 font-medium">JPEG, PNG, or WebP. Max 5MB.</p>
                                {uploadError && <p className="text-[12px] text-red-500 mt-2">{uploadError}</p>}
                            </div>
                        </div>
                        {/* Hidden input to pass avatar URL to server action */}
                        {avatarUrl && <input type="hidden" name="avatarUrl" value={avatarUrl} />}
                    </div>

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

                    <button
                        type="submit"
                        disabled={isPending || selectedDepts.length === 0 || isUploading || !avatarUrl || !username}
                        className="w-full flex items-center justify-center gap-2 bg-[#34A853] hover:bg-[#2e9347] disabled:opacity-40 disabled:hover:bg-[#34A853] text-white py-4 rounded-xl font-bold tracking-widest text-[14px] uppercase transition-all duration-300 shadow-lg hover:shadow-xl mt-8"
                    >
                        {isPending ? "Setting up..." : "Complete Setup"}
                    </button>
                </form>
            </motion.div>
        </main>
    );
}
