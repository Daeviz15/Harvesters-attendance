"use client";

import { motion } from "framer-motion";
import { Mail, Lock, User, ArrowLeft } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useActionState } from "react";
import { signup } from "@/app/auth/actions";

export default function SignupPage() {
    const [state, formAction, isPending] = useActionState(signup, null);

    return (
        <main className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0a] text-[#ededed] relative overflow-hidden font-sans">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 pointer-events-none opacity-20">
                <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full mix-blend-screen filter blur-[120px]"></div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="w-full max-w-md px-6 pt-16 pb-12 relative z-10 flex flex-col"
            >
                {/* Header Section */}
                <div className="mb-12 flex flex-col items-start relative">
                    <div className="relative h-24 w-40 -ml-2 z-10">
                        {/* Logo is already white */}
                        <Image
                            src="/logo.png"
                            alt="Harvesters Logo"
                            fill
                            sizes="(max-width: 768px) 160px, 160px"
                            className="object-contain object-left opacity-90"
                            priority
                        />
                    </div>
                    {/* Pull text up under the logo's right arm and shift it right */}
                    <h1 className="text-[22px] font-semibold tracking-wide text-white/90 -mt-10 ml-12 relative z-20">Sign up to Continue</h1>
                </div>

                {/* Google OAuth */}
                <div className="mb-10 w-full">
                    <button className="w-full flex items-center justify-center gap-3 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-colors">
                        <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                        </svg>
                        <span className="text-sm font-medium tracking-wide text-white/80">Continue with Google?</span>
                    </button>
                </div>

                <form action={formAction} className="space-y-8 flex-1">
                    {state?.error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] p-3 rounded-lg text-center">
                            {state.error}
                        </div>
                    )}
                    {/* Full Name */}
                    <div className="relative group">
                        <label className="text-[11px] font-medium uppercase tracking-wider text-white/50 block mb-2">Your Name</label>
                        <div className="flex items-center border-b border-white/10 group-focus-within:border-white/40 transition-colors pb-2">
                            <input
                                type="text"
                                name="name"
                                required
                                className="w-full bg-transparent text-white text-[15px] focus:outline-none placeholder:text-white/20"
                                placeholder="David Doe"
                            />
                            <User className="w-5 h-5 text-white/30 ml-3" />
                        </div>
                    </div>

                    {/* Email */}
                    <div className="relative group">
                        <label className="text-[11px] font-medium uppercase tracking-wider text-white/50 block mb-2">Email Address</label>
                        <div className="flex items-center border-b border-white/10 group-focus-within:border-white/40 transition-colors pb-2">
                            <input
                                type="email"
                                name="email"
                                required
                                className="w-full bg-transparent text-white text-[15px] focus:outline-none placeholder:text-white/20"
                                placeholder="you@harvesters.org"
                            />
                            <Mail className="w-5 h-5 text-white/30 ml-3" />
                        </div>
                    </div>

                    {/* Password */}
                    <div className="relative group">
                        <label className="text-[11px] font-medium uppercase tracking-wider text-white/50 block mb-2">Password</label>
                        <div className="flex items-center border-b border-white/10 group-focus-within:border-white/40 transition-colors pb-2">
                            <input
                                type="password"
                                name="password"
                                required
                                className="w-full bg-transparent text-white text-[15px] focus:outline-none placeholder:text-white/20 tracking-widest"
                                placeholder="••••••••"
                            />
                            <Lock className="w-5 h-5 text-white/30 ml-3" />
                        </div>
                    </div>

                    {/* Checkbox */}
                    <div className="flex items-start gap-3 mt-8">
                        <input
                            type="checkbox"
                            id="terms"
                            required
                            className="mt-1 w-4 h-4 rounded border-white/20 bg-white/5 focus:ring-[#34A853] focus:ring-offset-background appearance-none checked:bg-[#34A853] checked:border-[#34A853] relative
                            before:content-[''] before:absolute before:inset-0 before:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwb2x5bGluZSBwb2ludHM9IjIwIDYgOSAxNyA0IDEyIi8+PC9zdmc+')] before:bg-center before:bg-no-repeat before:bg-[length:12px_12px] before:opacity-0 checked:before:opacity-100 transition-all cursor-pointer"
                        />
                        <label htmlFor="terms" className="text-[13px] text-white/60 leading-tight cursor-pointer select-none">
                            Yes, I Accept the <span className="text-white hover:underline">Terms & Conditions</span>.
                        </label>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isPending}
                        className="w-full mt-6 bg-[#34A853] hover:bg-[#2e9347] text-white py-4 rounded-xl font-semibold tracking-wider text-[13px] uppercase transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isPending ? "Processing..." : "Sign Up"}
                    </button>
                </form>
                <div className="mt-10 text-center">
                    <p className="text-[13px] text-white/50">
                        Already have an account?{" "}
                        <Link href="/auth/login" className="text-[#34A853] font-semibold hover:underline">
                            Log In
                        </Link>
                    </p>
                </div>
            </motion.div>
        </main>
    );
}
