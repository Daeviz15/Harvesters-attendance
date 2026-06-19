import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Terms of Service — Harvesters Globe Attendance",
    description: "Read the terms and conditions for using the Harvesters Globe Attendance application.",
};

export default function TermsOfServicePage() {
    return (
        <main className="min-h-screen bg-background text-foreground relative overflow-hidden">
            {/* Ambient Glow */}
            <div className="absolute inset-0 pointer-events-none opacity-15">
                <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-[#34A853]/20 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[150px]" />
                <div className="absolute -bottom-40 -right-40 w-[400px] h-[400px] bg-[#34A853]/10 rounded-full mix-blend-multiply dark:mix-blend-screen filter blur-[150px]" />
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
                        Terms of Service
                    </h1>
                    <p className="text-neutral-500 dark:text-white/50 text-base max-w-2xl">
                        Last updated: June 19, 2026
                    </p>
                </div>

                {/* Terms Content */}
                <div className="space-y-12">
                    <Section title="1. Acceptance of Terms">
                        <p>
                            By accessing or using Harvesters Globe Attendance (&quot;the App&quot;), you agree to be bound by these
                            Terms of Service. If you do not agree with any part of these terms, you may not use the App.
                        </p>
                    </Section>

                    <Section title="2. Description of Service">
                        <p>
                            Harvesters Globe Attendance is an attendance management application designed exclusively for
                            church workers at The Harvesters International Christian Centre. The App provides:
                        </p>
                        <ul>
                            <li>Location-verified attendance check-in and check-out</li>
                            <li>Personal attendance history and records</li>
                            <li>Real-time live feed of attendance events</li>
                            <li>Leave request management</li>
                            <li>Profile and department management</li>
                        </ul>
                    </Section>

                    <Section title="3. User Accounts">
                        <p>To use the App, you must:</p>
                        <ul>
                            <li>Create an account using a valid email address or Google Sign-In</li>
                            <li>Complete the onboarding process, including providing your name, phone number, department, and profile photograph</li>
                            <li>Provide accurate, current, and complete information</li>
                            <li>Maintain the security of your account credentials</li>
                        </ul>
                        <p>
                            You are responsible for all activities that occur under your account. You must notify us immediately
                            of any unauthorized use of your account.
                        </p>
                    </Section>

                    <Section title="4. Acceptable Use">
                        <p>You agree not to:</p>
                        <ul>
                            <li>Use the App for any purpose other than legitimate attendance tracking</li>
                            <li>Attempt to spoof your location or manipulate GPS data to fraudulently record attendance</li>
                            <li>Share your account credentials with any other person</li>
                            <li>Attempt to access another user&apos;s account or data</li>
                            <li>Interfere with or disrupt the App&apos;s infrastructure or services</li>
                            <li>Upload malicious files, offensive content, or inappropriate profile images</li>
                            <li>Reverse engineer, decompile, or attempt to extract the source code of the App</li>
                        </ul>
                    </Section>

                    <Section title="5. Location Services">
                        <p>
                            The App requires access to your device&apos;s location services to verify your physical presence at
                            the church premises during check-in. By using the check-in feature, you consent to the collection
                            of your location data at the time of check-in.
                        </p>
                        <p>
                            You may revoke location access at any time through your device settings. However, this will
                            prevent you from using the check-in functionality.
                        </p>
                    </Section>

                    <Section title="6. Profile Pictures">
                        <p>
                            You are required to upload a profile photograph during onboarding. By uploading an image, you
                            confirm that:
                        </p>
                        <ul>
                            <li>The image is of yourself and accurately represents your appearance</li>
                            <li>You have the right to use the image</li>
                            <li>The image does not contain offensive, inappropriate, or misleading content</li>
                        </ul>
                        <p>
                            Your profile picture will be visible to other users of the App in the live attendance feed.
                        </p>
                    </Section>

                    <Section title="7. Intellectual Property">
                        <p>
                            The App, including its design, code, graphics, and branding, is the property of
                            The Harvesters International Christian Centre and its developers. You may not reproduce,
                            distribute, or create derivative works without prior written consent.
                        </p>
                    </Section>

                    <Section title="8. Availability & Modifications">
                        <p>
                            We strive to keep the App available at all times. However, we do not guarantee uninterrupted
                            access and may temporarily suspend the service for maintenance, updates, or unforeseen circumstances.
                        </p>
                        <p>
                            We reserve the right to modify, update, or discontinue any feature of the App at any time
                            without prior notice.
                        </p>
                    </Section>

                    <Section title="9. Limitation of Liability">
                        <p>
                            The App is provided &quot;as is&quot; without warranties of any kind, whether express or implied.
                            To the fullest extent permitted by law, we shall not be liable for any indirect, incidental,
                            special, consequential, or punitive damages arising from your use of the App.
                        </p>
                    </Section>

                    <Section title="10. Termination">
                        <p>
                            We reserve the right to suspend or terminate your account if you violate these Terms of Service
                            or engage in activity that is harmful to the App, its users, or the church community. Upon
                            termination, your right to use the App will immediately cease.
                        </p>
                    </Section>

                    <Section title="11. Changes to Terms">
                        <p>
                            We may update these Terms of Service from time to time. Changes will be reflected on this page
                            with an updated &quot;Last updated&quot; date. Continued use of the App after changes constitutes
                            acceptance of the revised terms.
                        </p>
                    </Section>

                    <Section title="12. Contact Us">
                        <p>
                            For questions about these Terms of Service, please contact us at:
                        </p>
                        <div className="mt-4 p-4 rounded-xl bg-neutral-100/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10">
                            <p className="text-sm text-neutral-700 dark:text-white/70 mb-1">
                                <strong>Email:</strong> daeviz17@gmail.com
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
                    <Link href="/privacy" className="text-xs text-[#34A853] hover:underline font-medium">
                        ← Privacy Policy
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
