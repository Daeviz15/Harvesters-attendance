import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy — Harvesters Globe Attendance",
    description: "Learn how Harvesters Globe Attendance collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
    return (
        <main className="min-h-screen bg-background text-foreground relative overflow-hidden">
            {/* Ambient Glow */}
            <div className="absolute inset-0 pointer-events-none opacity-15">
                <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-[#34A853]/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[150px]" />
                <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-[#34A853]/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[150px]" />
            </div>

            {/* Navigation */}
            <nav className="sticky top-0 z-50 backdrop-blur-2xl bg-background/70 border-b border-neutral-200/60 dark:border-white/5">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-2 group">
                        <div className="relative h-10 w-10">
                            <Image
                                src="/logo.png"
                                alt="Harvesters Logo"
                                fill
                                sizes="40px"
                                className="object-contain dark:invert-0 invert transition-all"
                            />
                        </div>
                        <span className="text-sm font-semibold tracking-wide text-neutral-700 dark:text-white/70 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
                            Harvesters Attendance
                        </span>
                    </Link>
                    <Link
                        href="/auth/login"
                        className="text-xs font-medium tracking-wider uppercase px-4 py-2 rounded-full border border-neutral-300 dark:border-white/10 text-neutral-600 dark:text-white/60 hover:bg-neutral-100 dark:hover:bg-white/5 transition-all"
                    >
                        Login
                    </Link>
                </div>
            </nav>

            {/* Content */}
            <div className="relative z-10 max-w-4xl mx-auto px-6 pt-16 pb-24">
                {/* Header */}
                <div className="mb-16">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#34A853]/10 border border-[#34A853]/20 mb-6">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#34A853] animate-pulse" />
                        <span className="text-[11px] font-semibold tracking-widest uppercase text-[#34A853]">Legal</span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 dark:text-white mb-4">
                        Privacy Policy
                    </h1>
                    <p className="text-neutral-500 dark:text-white/50 text-base max-w-2xl">
                        Last updated: June 19, 2026
                    </p>
                </div>

                {/* Policy Content */}
                <div className="space-y-12">
                    <Section title="1. Introduction">
                        <p>
                            Harvesters Globe Attendance (&quot;we&quot;, &quot;our&quot;, or &quot;the App&quot;) is an attendance tracking 
                            application built for church workers at The Harvesters International Christian Centre. We are committed 
                            to protecting your privacy and ensuring the security of your personal information.
                        </p>
                        <p>
                            This Privacy Policy explains what information we collect, how we use it, and the choices you have 
                            regarding your data. By using the App, you agree to the practices described in this policy.
                        </p>
                    </Section>

                    <Section title="2. Information We Collect">
                        <h4 className="font-semibold text-neutral-800 dark:text-white/90 mb-2">Account Information</h4>
                        <ul>
                            <li>Full name</li>
                            <li>Email address</li>
                            <li>Phone number</li>
                            <li>Department / unit assignment</li>
                            <li>Profile photograph</li>
                        </ul>

                        <h4 className="font-semibold text-neutral-800 dark:text-white/90 mt-6 mb-2">Attendance Data</h4>
                        <ul>
                            <li>Check-in and check-out timestamps</li>
                            <li>Attendance history records</li>
                            <li>Leave requests and their statuses</li>
                        </ul>

                        <h4 className="font-semibold text-neutral-800 dark:text-white/90 mt-6 mb-2">Location Data</h4>
                        <ul>
                            <li>GPS coordinates at the time of check-in (used solely to verify your physical presence at the church premises)</li>
                            <li>GPS accuracy data to ensure reliable geofencing</li>
                        </ul>

                        <h4 className="font-semibold text-neutral-800 dark:text-white/90 mt-6 mb-2">Authentication Data</h4>
                        <ul>
                            <li>If you sign in with Google, we receive your name, email, and profile picture from Google. We do not receive or store your Google password.</li>
                        </ul>
                    </Section>

                    <Section title="3. How We Use Your Information">
                        <p>We use your information exclusively to:</p>
                        <ul>
                            <li>Verify your identity and manage your account</li>
                            <li>Record and track attendance at church services and events</li>
                            <li>Verify your physical presence at the church premises via geolocation</li>
                            <li>Display your profile information on the attendance live feed</li>
                            <li>Process and manage leave requests</li>
                            <li>Generate attendance reports for church leadership</li>
                        </ul>
                    </Section>

                    <Section title="4. Data Storage & Security">
                        <p>
                            Your data is stored securely using <strong>Supabase</strong>, an enterprise-grade, SOC 2 compliant 
                            cloud platform. All data is encrypted both in transit (TLS 1.2+) and at rest. Passwords are hashed 
                            using industry-standard cryptographic algorithms and are never stored in plain text.
                        </p>
                        <p>
                            Profile pictures are stored in a secure cloud storage bucket with strict row-level security policies, 
                            ensuring that only you can modify or delete your own avatar.
                        </p>
                    </Section>

                    <Section title="5. Data Sharing">
                        <p>
                            We <strong>do not sell, rent, or share</strong> your personal information with third parties for 
                            marketing or advertising purposes. Your data may only be accessed by:
                        </p>
                        <ul>
                            <li>Authorized church administrators for attendance management purposes</li>
                            <li>Our hosting and infrastructure providers (Supabase, Vercel) solely to operate the service</li>
                        </ul>
                    </Section>

                    <Section title="6. Location Data">
                        <p>
                            Location data is collected <strong>only</strong> at the moment of check-in and is used exclusively 
                            to verify your physical presence at the designated church location. We do not continuously track your 
                            location, and location data is not stored beyond what is necessary for attendance verification.
                        </p>
                    </Section>

                    <Section title="7. Your Rights">
                        <p>You have the right to:</p>
                        <ul>
                            <li>Access the personal information we hold about you</li>
                            <li>Request correction of inaccurate information</li>
                            <li>Request deletion of your account and associated data</li>
                            <li>Withdraw consent for location access at any time (note: this will prevent check-in functionality)</li>
                        </ul>
                    </Section>

                    <Section title="8. Children's Privacy">
                        <p>
                            The App is not directed at individuals under the age of 13. We do not knowingly collect personal 
                            information from children. If you believe a child has provided us with personal data, please contact 
                            us so we can promptly remove it.
                        </p>
                    </Section>

                    <Section title="9. Changes to This Policy">
                        <p>
                            We may update this Privacy Policy from time to time. Any changes will be reflected on this page 
                            with an updated &quot;Last updated&quot; date. We encourage you to review this page periodically.
                        </p>
                    </Section>

                    <Section title="10. Contact Us">
                        <p>
                            If you have questions or concerns about this Privacy Policy or your data, please contact us at:
                        </p>
                        <div className="mt-4 p-4 rounded-xl bg-neutral-100/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                            <p className="text-sm text-neutral-700 dark:text-white/70 mb-1">
                                <strong>Email:</strong> feedback@harvestersng.org
                            </p>
                            <p className="text-sm text-neutral-700 dark:text-white/70">
                                <strong>Organization:</strong> The Harvesters International Christian Centre
                            </p>
                        </div>
                    </Section>
                </div>

                {/* Footer Link */}
                <div className="mt-20 pt-8 border-t border-neutral-200 dark:border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs text-neutral-400 dark:text-white/30">
                        © {new Date().getFullYear()} Harvesters Globe Attendance. All rights reserved.
                    </p>
                    <Link href="/terms" className="text-xs text-[#34A853] hover:underline font-medium">
                        Terms of Service →
                    </Link>
                </div>
            </div>
        </main>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="group">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4 tracking-tight">
                {title}
            </h3>
            <div className="pl-0 md:pl-1 space-y-3 text-[15px] leading-relaxed text-neutral-600 dark:text-white/60 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-neutral-800 dark:[&_strong]:text-white/80">
                {children}
            </div>
        </section>
    );
}
