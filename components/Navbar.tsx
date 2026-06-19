"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

const navLinks = [
    { label: "Features", href: "#features" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Visit Us", href: "#visit-us" },
];

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    // Track scroll for enhanced navbar styling
    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Lock body scroll when menu is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => { document.body.style.overflow = ""; };
    }, [isOpen]);

    const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
        e.preventDefault();
        setIsOpen(false);
        // Small delay to let menu close before scrolling
        setTimeout(() => {
            const target = document.querySelector(href);
            if (target) {
                const navHeight = 72; // approx navbar height
                const targetPosition = target.getBoundingClientRect().top + window.scrollY - navHeight;
                window.scrollTo({ top: targetPosition, behavior: "smooth" });
            }
        }, 100);
    };

    return (
        <>
        <nav className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl border-b transition-all duration-300 ${scrolled ? "bg-background/90 border-neutral-200/60 dark:border-white/10 shadow-lg shadow-black/5" : "bg-background/70 border-neutral-200/60 dark:border-white/5"}`}>
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                {/* Logo */}
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

                {/* Desktop Nav Links */}
                <div className="hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            onClick={(e) => handleNavClick(e, link.href)}
                            className="text-xs font-medium tracking-wider uppercase text-neutral-500 dark:text-white/50 hover:text-neutral-900 dark:hover:text-white transition-colors"
                        >
                            {link.label}
                        </a>
                    ))}
                </div>

                {/* Desktop Auth Buttons */}
                <div className="hidden md:flex items-center gap-3">
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

                {/* Mobile Hamburger Button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="md:hidden relative w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/5 transition-colors"
                    aria-label="Toggle menu"
                >
                    <div className="w-5 h-4 flex flex-col justify-between">
                        <motion.span
                            animate={isOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="block w-full h-[2px] bg-neutral-800 dark:bg-white rounded-full origin-center"
                        />
                        <motion.span
                            animate={isOpen ? { opacity: 0, x: -10 } : { opacity: 1, x: 0 }}
                            transition={{ duration: 0.2 }}
                            className="block w-full h-[2px] bg-neutral-800 dark:bg-white rounded-full"
                        />
                        <motion.span
                            animate={isOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
                            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                            className="block w-full h-[2px] bg-neutral-800 dark:bg-white rounded-full origin-center"
                        />
                    </div>
                </button>
            </div>
        </nav>

        {/* Mobile Menu — Fixed Full-Screen Overlay */}
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="md:hidden fixed inset-0 top-[72px] z-40 bg-background/98 backdrop-blur-2xl"
                >
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="px-6 py-8 flex flex-col gap-1 h-full"
                    >
                        {navLinks.map((link, idx) => (
                            <motion.a
                                key={link.href}
                                href={link.href}
                                onClick={(e) => handleNavClick(e, link.href)}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.3, delay: idx * 0.06 }}
                                className="text-2xl font-bold text-neutral-800 dark:text-white/80 hover:text-[#34A853] dark:hover:text-[#34A853] py-4 px-4 rounded-xl hover:bg-white/5 transition-all"
                            >
                                {link.label}
                            </motion.a>
                        ))}

                        {/* Divider */}
                        <div className="h-px bg-white/10 my-4" />

                        {/* Auth Buttons */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, delay: 0.25 }}
                            className="flex flex-col gap-3 mt-2"
                        >
                            <Link
                                href="/auth/login"
                                onClick={() => setIsOpen(false)}
                                className="text-center text-sm font-semibold tracking-wider uppercase px-6 py-3.5 rounded-full border border-white/10 text-neutral-600 dark:text-white/70 hover:bg-white/5 transition-colors"
                            >
                                Login
                            </Link>
                            <Link
                                href="/auth/signup"
                                onClick={() => setIsOpen(false)}
                                className="text-center text-sm font-semibold tracking-wider uppercase px-6 py-3.5 rounded-full bg-[#34A853] hover:bg-[#2e9347] text-white transition-colors shadow-lg shadow-[#34A853]/20"
                            >
                                Get Started
                            </Link>
                        </motion.div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
        </>
    );
}
