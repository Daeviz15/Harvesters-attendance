"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { 
    MapPin, WifiOff, Clock, Calendar, CheckCircle2, 
    CircleDashed, LogOut, Menu, X, Users, CalendarDays 
} from "lucide-react";
import LeaveRequestModal from "@/components/LeaveRequestModal";
import { logout } from "@/app/auth/actions";

// Mock data for personal history
const personalHistory = [
    { id: 1, date: "Today", checkIn: "08:45 AM", checkOut: "--:--", status: "synced" },
    { id: 2, date: "Yesterday", checkIn: "08:50 AM", checkOut: "05:15 PM", status: "synced" },
    { id: 3, date: "Mon, Jun 12", checkIn: "09:02 AM", checkOut: "05:00 PM", status: "synced" },
];

// Mock data for live feed
const liveFeed = [
    { id: 101, name: "Sarah Johnson", role: "Usher", time: "Just now", initial: "SJ" },
    { id: 102, name: "Michael Adebayo", role: "Choir", time: "5 mins ago", initial: "MA" },
    { id: 103, name: "Grace Chukwu", role: "Media", time: "12 mins ago", initial: "GC" },
    { id: 104, name: "Emmanuel Okafor", role: "Protocol", time: "28 mins ago", initial: "EO" },
];

interface SidebarContentProps {
    setIsMobileMenuOpen: (open: boolean) => void;
    setIsLeaveModalOpen: (open: boolean) => void;
}

const SidebarContent = ({ setIsMobileMenuOpen, setIsLeaveModalOpen }: SidebarContentProps) => (
    <div className="flex flex-col h-full w-full">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between mb-12">
            <div className="relative h-12 w-28 -ml-2">
                <Image 
                    src="/logo.png" 
                    alt="Harvesters Logo" 
                    fill
                    sizes="112px"
                    className="object-contain object-left opacity-90"
                    priority
                />
            </div>
            {/* Mobile Close Button */}
            <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="md:hidden p-2 text-white/50 hover:text-white"
            >
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* User Profile Mini */}
        <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/10 mb-10">
            <div className="w-12 h-12 rounded-full bg-[#34A853]/20 border border-[#34A853]/30 flex items-center justify-center text-lg font-bold text-[#34A853]">
                DD
            </div>
            <div>
                <p className="text-[15px] font-semibold text-white/90">David Doe</p>
                <p className="text-[12px] text-[#34A853] tracking-widest uppercase font-medium">Worker</p>
            </div>
        </div>

        {/* Personal History */}
        <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-[0.2em]">Your History</h3>
            </div>
            
            <div className="space-y-4 overflow-y-auto pr-2 no-scrollbar flex-1">
                {personalHistory.map((activity) => (
                    <div key={activity.id} className="w-full flex items-start gap-4 cursor-none group">
                        <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mt-1 group-hover:bg-white/10 transition-colors">
                            <Calendar className="w-3.5 h-3.5 text-white/40" />
                        </div>
                        <div className="flex-1 border-b border-white/5 pb-4">
                            <div className="flex justify-between items-start mb-1">
                                <p className="text-[14px] font-medium text-white/80">{activity.date}</p>
                                {activity.status === "synced" ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-[#34A853] mt-0.5" />
                                ) : (
                                    <CircleDashed className="w-3.5 h-3.5 text-orange-400 animate-spin-slow mt-0.5" />
                                )}
                            </div>
                            <p className="text-[12px] text-white/40 font-mono">
                                {activity.checkIn} — {activity.checkOut}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Actions */}
        <div className="pt-6 mt-auto space-y-2">
            <button 
                onClick={() => {
                    setIsLeaveModalOpen(true);
                    setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 text-white/50 hover:text-[#34A853] transition-colors py-3 group cursor-none w-full"
            >
                <CalendarDays className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="text-[13px] font-semibold tracking-wider uppercase">Request Leave</span>
            </button>
            <button onClick={() => logout()} className="flex items-center gap-3 text-white/50 hover:text-red-400 transition-colors py-3 group cursor-none w-full text-left">
                <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                <span className="text-[13px] font-semibold tracking-wider uppercase">Log Out</span>
            </button>
        </div>
    </div>
);

export default function DashboardPage() {
    const [isCheckedIn, setIsCheckedIn] = useState(false);
    const [isOffline, setIsOffline] = useState(false);
    const [isWithinPerimeter, setIsWithinPerimeter] = useState(true);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    
    // Timer state for demonstration
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // Simulated Timer
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isCheckedIn) {
            interval = setInterval(() => {
                setElapsedSeconds(prev => prev + 1);
            }, 1000);
        } else {
            setElapsedSeconds(0);
        }
        return () => clearInterval(interval);
    }, [isCheckedIn]);

    const formatTime = (totalSeconds: number) => {
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        return `${m}m ${s}s`;
    };

    const toggleCheckIn = () => {
        if (!isWithinPerimeter && !isCheckedIn) return; // Prevent check-in if outside zone
        setIsCheckedIn(!isCheckedIn);
    };

    return (
        <main className="min-h-screen w-full bg-[#0a0a0a] text-[#ededed] relative overflow-hidden font-sans flex">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 pointer-events-none opacity-20 z-0">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full mix-blend-screen filter blur-[150px]"></div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#34A853]/5 rounded-full mix-blend-screen filter blur-[150px]"></div>
            </div>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex w-80 h-screen border-r border-white/10 bg-black/40 backdrop-blur-xl p-8 flex-col relative z-20">
                <SidebarContent setIsMobileMenuOpen={setIsMobileMenuOpen} setIsLeaveModalOpen={setIsLeaveModalOpen} />
            </aside>

            {/* Mobile Drawer */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                        />
                        <motion.aside 
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                            className="fixed inset-y-0 left-0 w-[280px] bg-[#0f0f0f] border-r border-white/10 p-6 flex flex-col z-50 md:hidden shadow-2xl"
                        >
                            <SidebarContent setIsMobileMenuOpen={setIsMobileMenuOpen} setIsLeaveModalOpen={setIsLeaveModalOpen} />
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-screen overflow-y-auto overflow-x-hidden relative z-10 scroll-smooth no-scrollbar">
                {/* Offline Banner */}
                <AnimatePresence>
                    {isOffline && (
                        <motion.div 
                            initial={{ y: -50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -50, opacity: 0 }}
                            className="w-full bg-orange-500/10 border-b border-orange-500/20 py-2.5 px-6 flex items-center justify-center gap-2 sticky top-0 z-30 backdrop-blur-md"
                        >
                            <WifiOff className="w-4 h-4 text-orange-400" />
                            <span className="text-[12px] font-medium text-orange-400 tracking-wide">
                                Offline Mode: Check-ins will sync automatically.
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Mobile Header */}
                <div className="md:hidden flex items-center justify-between p-6">
                    <button 
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="p-2 -ml-2 text-white/70 hover:text-white cursor-none"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <div className="w-8 h-8 rounded-full bg-[#34A853]/20 border border-[#34A853]/30 flex items-center justify-center text-xs font-bold text-[#34A853]">
                        DD
                    </div>
                </div>

                <div className="flex-1 w-full max-w-4xl mx-auto px-6 md:px-12 pt-4 md:pt-16 pb-12 flex flex-col lg:flex-row gap-16 lg:gap-12 xl:gap-24">
                    
                    {/* Left Column: Action & Welcome */}
                    <div className="flex-1 flex flex-col">
                        <div className="mb-12">
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white/90 mb-2">Good Morning, David.</h1>
                            <p className="text-[15px] text-white/50">Ready to serve today? Mark your attendance below.</p>
                        </div>

                        {/* Status Pill */}
                        <div className="flex justify-start mb-10">
                            <motion.div 
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-md transition-colors ${
                                    isWithinPerimeter 
                                        ? "bg-[#34A853]/10 border-[#34A853]/20 text-[#34A853]" 
                                        : "bg-red-500/10 border-red-500/20 text-red-400"
                                }`}
                            >
                                <MapPin className="w-3.5 h-3.5" />
                                <span className="text-[12px] font-medium tracking-wide">
                                    {isWithinPerimeter ? "Detected at Ologolo, Lekki" : "Outside Perimeter"}
                                </span>
                            </motion.div>
                        </div>

                        {/* Action Center */}
                        <div className="flex justify-center lg:justify-start py-8">
                            <div className="relative">
                                {/* Outer pulsating ring for Check In state */}
                                {!isCheckedIn && isWithinPerimeter && (
                                    <div className="absolute inset-0 bg-[#34A853]/20 rounded-full animate-ping opacity-75 duration-1000"></div>
                                )}
                                
                                <button
                                    onClick={toggleCheckIn}
                                    disabled={!isWithinPerimeter && !isCheckedIn}
                                    className={`relative w-56 h-56 sm:w-64 sm:h-64 md:w-72 md:h-72 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-500 cursor-none shadow-2xl
                                        ${isCheckedIn 
                                            ? "bg-white/5 border border-white/10 hover:bg-white/10 text-white" 
                                            : isWithinPerimeter
                                                ? "bg-[#34A853] hover:bg-[#2e9347] text-white shadow-[#34A853]/20"
                                                : "bg-white/5 border border-white/10 text-white/30 cursor-not-allowed"
                                        }
                                    `}
                                >
                                    <AnimatePresence mode="wait">
                                        <motion.div
                                            key={isCheckedIn ? "out" : "in"}
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0.8, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="flex flex-col items-center"
                                        >
                                            <span className="text-[32px] md:text-[40px] font-bold tracking-tight mb-1">
                                                {isCheckedIn ? "Check Out" : "Check In"}
                                            </span>
                                            {isCheckedIn && (
                                                <div className="flex items-center gap-2 text-white/60 mt-2">
                                                    <Clock className="w-4 h-4" />
                                                    <span className="text-base md:text-lg font-mono tracking-wider">{formatTime(elapsedSeconds)}</span>
                                                </div>
                                            )}
                                            {!isCheckedIn && (
                                                <span className="text-[14px] font-medium opacity-80 tracking-wider uppercase mt-2">
                                                    {isWithinPerimeter ? "Tap to record" : "Zone locked"}
                                                </span>
                                            )}
                                        </motion.div>
                                    </AnimatePresence>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Live Feed */}
                    <div className="w-full lg:w-80 flex flex-col border-t lg:border-t-0 lg:border-l border-white/10 pt-10 lg:pt-0 lg:pl-10 xl:pl-16">
                        <div className="flex items-center gap-2 mb-8">
                            <Users className="w-4 h-4 text-[#34A853]" />
                            <h3 className="text-[12px] font-bold text-white/80 uppercase tracking-[0.2em]">Live Feed</h3>
                            <div className="ml-auto flex items-center gap-3">
                                {/* Dev Toggles */}
                                <div className="flex gap-2">
                                    <button onClick={() => setIsOffline(!isOffline)} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-white/40 hover:text-white cursor-none transition-colors">Offline</button>
                                    <button onClick={() => setIsWithinPerimeter(!isWithinPerimeter)} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-[10px] text-white/40 hover:text-white cursor-none transition-colors">Zone</button>
                                </div>
                                <div className="w-1.5 h-1.5 rounded-full bg-[#34A853] animate-pulse"></div>
                            </div>
                        </div>

                        <div className="space-y-6">
                            {liveFeed.map((feed) => (
                                <div key={feed.id} className="flex items-start gap-4 group">
                                    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-white/70 group-hover:bg-[#34A853]/10 group-hover:text-[#34A853] group-hover:border-[#34A853]/30 transition-colors">
                                        {feed.initial}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-baseline justify-between mb-0.5">
                                            <p className="text-[14px] font-medium text-white/90">{feed.name}</p>
                                            <span className="text-[11px] text-[#34A853] font-medium">{feed.time}</span>
                                        </div>
                                        <p className="text-[12px] text-white/40">{feed.role} • Checked In</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>



            </div>

            {/* Leave Request Modal */}
            <LeaveRequestModal isOpen={isLeaveModalOpen} onClose={() => setIsLeaveModalOpen(false)} />
        </main>
    );
}
