import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import InteractiveHero from "@/components/InteractiveHero";
import AnimatedTimeline from "@/components/AnimatedTimeline";
import AceternityFeatures from "@/components/AceternityFeatures";
import VisitUs from "@/components/VisitUs";
import TeamStrip from "@/components/TeamStrip";
import ScrollReveal from "@/components/ScrollReveal";

export const metadata: Metadata = {
    title: "Harvesters Attendance — Smart Attendance for Church Workers",
    description: "Harvesters Attendance is a modern, location-verified attendance tracking application for church workers at The Harvesters International Christian Centre.",
};

export default function HomePage() {
    return (
        <main className="min-h-screen bg-background text-foreground relative overflow-hidden pt-[72px]">
            {/* Ambient Glows */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-60 -right-60 w-[600px] h-[600px] bg-[#34A853]/15 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[180px]" />
                <div className="absolute top-1/2 -left-40 w-[500px] h-[500px] bg-[#34A853]/8 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[150px]" />
                <div className="absolute -bottom-40 right-1/4 w-[400px] h-[400px] bg-[#34A853]/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[160px]" />
            </div>

            <Navbar />

            <InteractiveHero />

            <div id="features">
                <AceternityFeatures />
            </div>

            <div id="how-it-works">
                <AnimatedTimeline />
            </div>

            <div id="visit-us">
                <VisitUs />
            </div>

            {/* CTA Section */}
            <ScrollReveal>
                <section className="relative z-10 max-w-6xl mx-auto px-6 py-20">
                <div className="relative rounded-[2rem] bg-[#0a0a0a] border border-white/10 p-12 md:p-16 text-center overflow-hidden shadow-2xl">
                    {/* Abstract Background Elements */}
                    <div className="absolute inset-0 pointer-events-none">
                        {/* Dot Grid */}
                        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                        {/* Glowing Orbs */}
                        <div className="absolute -top-20 -right-20 w-60 h-60 bg-[#34A853]/20 rounded-full filter blur-[100px]" />
                        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-[#34A853]/10 rounded-full filter blur-[80px]" />
                        {/* Concentric Rings */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border border-white/[0.03] rounded-full" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] border border-white/[0.05] rounded-full" />
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] border border-white/[0.07] rounded-full" />
                    </div>
                    <div className="relative z-10">
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">
                            Ready to Get Started?
                        </h2>
                        <p className="text-neutral-400 max-w-md mx-auto mb-8">
                            Join your fellow workers and start tracking your attendance today.
                        </p>
                        <Link
                            href="/auth/signup"
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#34A853] hover:bg-[#2e9347] text-white font-semibold tracking-wider text-sm uppercase transition-all shadow-[0_0_30px_rgba(52,168,83,0.3)] hover:shadow-[0_0_40px_rgba(52,168,83,0.4)]"
                        >
                            Create Your Account
                            <ChevronRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
                </section>
            </ScrollReveal>

            <TeamStrip />

            {/* Footer */}
            <ScrollReveal delay={0.2}>
                <footer className="relative z-10 border-t border-neutral-200 dark:border-white/5 mt-10">
                <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-2">
                        <div className="relative h-8 w-8">
                            <Image
                                src="/logo.png"
                                alt="Harvesters Logo"
                                fill
                                sizes="32px"
                                className="object-contain dark:invert-0 invert"
                            />
                        </div>
                        <span className="text-xs font-medium text-neutral-500 dark:text-white/40">
                            © {new Date().getFullYear()} Harvesters Globe Attendance
                        </span>
                    </div>
                    <div className="flex items-center gap-6">
                        <Link href="/privacy" className="text-xs text-neutral-500 dark:text-white/40 hover:text-neutral-800 dark:hover:text-white transition-colors">
                            Privacy Policy
                        </Link>
                        <Link href="/terms" className="text-xs text-neutral-500 dark:text-white/40 hover:text-neutral-800 dark:hover:text-white transition-colors">
                            Terms of Service
                        </Link>
                        <a href="mailto:feedback@harvestersng.org" className="text-xs text-neutral-500 dark:text-white/40 hover:text-neutral-800 dark:hover:text-white transition-colors">
                            Contact
                        </a>
                    </div>
                </div>
                </footer>
            </ScrollReveal>
        </main>
    );
}

function StepCard({ step, title, description }: { step: string; title: string; description: string }) {
    return (
        <div className="text-center md:text-left">
            <span className="text-5xl font-black text-[#34A853]/15 dark:text-[#34A853]/10 block mb-3">{step}</span>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2 tracking-tight">{title}</h3>
            <p className="text-sm text-neutral-500 dark:text-white/50 leading-relaxed">{description}</p>
        </div>
    );
}
