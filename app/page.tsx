import Link from "next/link";
import Image from "next/image";
import { MapPin, Clock, Users, Shield, ChevronRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Harvesters Attendance — Smart Attendance for Church Workers",
    description: "Harvesters Attendance is a modern, location-verified attendance tracking application for church workers at The Harvesters International Christian Centre.",
};

export default function HomePage() {
    return (
        <main className="min-h-screen bg-background text-foreground relative overflow-hidden">
            {/* Ambient Glows */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-60 -right-60 w-[600px] h-[600px] bg-[#34A853]/15 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[180px]" />
                <div className="absolute top-1/2 -left-40 w-[500px] h-[500px] bg-[#34A853]/8 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[150px]" />
                <div className="absolute -bottom-40 right-1/4 w-[400px] h-[400px] bg-[#34A853]/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[160px]" />
            </div>

            {/* Navigation */}
            <nav className="sticky top-0 z-50 backdrop-blur-2xl bg-background/70 border-b border-neutral-200/60 dark:border-white/5">
                <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="relative h-10 w-10">
                            <Image
                                src="/logo.png"
                                alt="Harvesters Logo"
                                fill
                                sizes="40px"
                                className="object-contain dark:invert-0 invert transition-all"
                                priority
                            />
                        </div>
                        <span className="text-sm font-bold tracking-wide text-neutral-800 dark:text-white/90">
                            Harvesters Attendance
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link
                            href="/auth/login"
                            className="text-xs font-medium tracking-wider uppercase px-4 py-2 rounded-full text-neutral-600 dark:text-white/60 hover:text-neutral-900 dark:hover:text-white transition-colors"
                        >
                            Login
                        </Link>
                        <Link
                            href="/auth/signup"
                            className="text-xs font-medium tracking-wider uppercase px-5 py-2.5 rounded-full bg-[#34A853] hover:bg-[#2e9347] text-white transition-colors shadow-lg shadow-[#34A853]/20"
                        >
                            Get Started
                        </Link>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <section className="relative z-10 max-w-7xl mx-auto px-6 pt-16 md:pt-24 lg:pt-32 pb-16 md:pb-24">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8 items-center">
                    {/* Left Column: Text Content */}
                    <div className="max-w-2xl mx-auto lg:mx-0 text-center lg:text-left flex flex-col items-center lg:items-start">
                        <h1 className="text-[2.5rem] leading-[1.1] sm:text-5xl md:text-6xl lg:text-[4rem] font-bold tracking-tight text-neutral-900 dark:text-white mb-6">
                            Smart Attendance{" "}
                            <br className="hidden lg:block" />
                            <span className="text-[#34A853]">Tracking</span>{" "}
                            for Workers
                        </h1>

                        <p className="text-base sm:text-lg md:text-xl text-neutral-500 dark:text-white/50 max-w-xl leading-relaxed mb-10">
                            A modern, location-verified attendance system designed exclusively for workers 
                            at The Harvesters International Christian Centre. Check in with confidence, 
                            track your service, stay accountable.
                        </p>

                        <div className="flex flex-col sm:flex-row w-full sm:w-auto items-center justify-center lg:justify-start gap-4">
                            <Link
                                href="/auth/signup"
                                className="group flex w-full sm:w-auto items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-[#34A853] hover:bg-[#2e9347] text-white font-semibold tracking-wider text-sm uppercase transition-all shadow-xl shadow-[#34A853]/25 hover:shadow-2xl hover:shadow-[#34A853]/30"
                            >
                                Start Tracking
                                <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                            </Link>
                            <Link
                                href="/auth/login"
                                className="flex w-full sm:w-auto items-center justify-center gap-2 px-8 py-4 rounded-2xl border border-neutral-300 dark:border-white/10 text-neutral-700 dark:text-white/70 hover:bg-neutral-100 dark:hover:bg-white/5 font-medium tracking-wider text-sm uppercase transition-all"
                            >
                                Sign In
                            </Link>
                        </div>
                    </div>

                    {/* Right Column: Hero Image Container */}
                    <div className="relative w-full aspect-square md:aspect-[4/3] lg:aspect-square max-w-lg mx-auto flex items-center justify-center">
                        {/* 
                            This is the placeholder container for the new Hero Image.
                            Once you have your image (e.g., 'hero-image.png' in the public folder),
                            replace this div with the Next.js <Image /> component.
                        */}
                        <div className="relative w-full h-full rounded-3xl overflow-hidden flex items-center justify-center border border-dashed border-neutral-300 dark:border-white/20 bg-neutral-100/50 dark:bg-white/5">
                            <span className="text-sm font-medium text-neutral-400 dark:text-white/40 tracking-wider uppercase text-center px-6">
                                Replace this with your<br/>Creative Hero Image
                            </span>
                            
                            {/* Example of how the Image tag will look:
                            <Image
                                src="/hero-image.png"
                                alt="Harvesters Attendance App"
                                fill
                                className="object-contain drop-shadow-2xl"
                                priority
                            />
                            */}
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 py-20">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FeatureCard
                        icon={<MapPin className="w-5 h-5" />}
                        title="Location Verified"
                        description="GPS-powered geofencing ensures you're physically present at the church premises before checking in. No spoofing, no shortcuts."
                    />
                    <FeatureCard
                        icon={<Clock className="w-5 h-5" />}
                        title="Real-Time Tracking"
                        description="Instant check-in and check-out with precise timestamps. View your full attendance history at a glance."
                    />
                    <FeatureCard
                        icon={<Users className="w-5 h-5" />}
                        title="Live Feed"
                        description="See who's checking in across all departments in real-time. Build community and accountability together."
                    />
                    <FeatureCard
                        icon={<Shield className="w-5 h-5" />}
                        title="Enterprise Security"
                        description="Built on Supabase with end-to-end encryption, secure authentication, and strict data privacy policies."
                    />
                </div>
            </section>

            {/* How It Works */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 py-20">
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-neutral-900 dark:text-white mb-12 text-center">
                    How It Works
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <StepCard
                        step="01"
                        title="Sign Up"
                        description="Create your account with email or Google Sign-In, then complete your profile with your department and photo."
                    />
                    <StepCard
                        step="02"
                        title="Check In"
                        description="When you arrive at church, open the app and tap Check In. Your location is verified automatically."
                    />
                    <StepCard
                        step="03"
                        title="Stay Accountable"
                        description="Track your attendance history, view the live feed, and request leave when needed — all in one place."
                    />
                </div>
            </section>

            {/* CTA Section */}
            <section className="relative z-10 max-w-6xl mx-auto px-6 py-20">
                <div className="relative rounded-3xl bg-gradient-to-br from-[#34A853]/10 to-[#34A853]/5 border border-[#34A853]/20 p-12 md:p-16 text-center overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute top-0 right-0 w-60 h-60 bg-[#34A853]/10 rounded-full filter blur-[80px]" />
                    </div>
                    <div className="relative z-10">
                        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-neutral-900 dark:text-white mb-4">
                            Ready to Get Started?
                        </h2>
                        <p className="text-neutral-500 dark:text-white/50 max-w-md mx-auto mb-8">
                            Join your fellow workers and start tracking your attendance today.
                        </p>
                        <Link
                            href="/auth/signup"
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-[#34A853] hover:bg-[#2e9347] text-white font-semibold tracking-wider text-sm uppercase transition-all shadow-xl shadow-[#34A853]/25"
                        >
                            Create Your Account
                            <ChevronRight className="w-4 h-4" />
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
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
        </main>
    );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
    return (
        <div className="group p-6 md:p-8 rounded-2xl bg-neutral-100/50 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/5 hover:border-[#34A853]/30 dark:hover:border-[#34A853]/20 transition-all duration-300">
            <div className="w-10 h-10 rounded-xl bg-[#34A853]/10 flex items-center justify-center text-[#34A853] mb-4 group-hover:scale-110 transition-transform duration-300">
                {icon}
            </div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white mb-2 tracking-tight">{title}</h3>
            <p className="text-sm text-neutral-500 dark:text-white/50 leading-relaxed">{description}</p>
        </div>
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
