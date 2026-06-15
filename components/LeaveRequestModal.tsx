"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CalendarDays, ChevronDown, Send, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type LeaveStatus = "pending" | "approved" | "rejected";

interface LeaveRequest {
    id: number;
    type: string;
    startDate: string;
    endDate: string;
    reason: string;
    status: LeaveStatus;
}

// Mock existing leave requests
const mockLeaveRequests: LeaveRequest[] = [
    { id: 1, type: "Sick Leave", startDate: "Jun 20", endDate: "Jun 21", reason: "Feeling unwell", status: "approved" },
    { id: 2, type: "Travel", startDate: "Jul 5", endDate: "Jul 12", reason: "Family trip to Abuja", status: "pending" },
];

const leaveTypes = ["Sick Leave", "Personal", "Travel", "Family Emergency", "Other"];

interface LeaveRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function LeaveRequestModal({ isOpen, onClose }: LeaveRequestModalProps) {
    const [activeTab, setActiveTab] = useState<"new" | "history">("new");
    const [leaveType, setLeaveType] = useState("");
    const [isTypeOpen, setIsTypeOpen] = useState(false);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [reason, setReason] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        // Simulate submission
        setTimeout(() => {
            setIsSubmitting(false);
            setIsSubmitted(true);
            setTimeout(() => {
                setIsSubmitted(false);
                setLeaveType("");
                setStartDate("");
                setEndDate("");
                setReason("");
                setActiveTab("history");
            }, 2000);
        }, 1500);
    };

    const getStatusBadge = (status: LeaveStatus) => {
        switch (status) {
            case "approved":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#34A853]/10 border border-[#34A853]/20 text-[#34A853] text-[11px] font-medium">
                        <CheckCircle2 className="w-3 h-3" /> Approved
                    </span>
                );
            case "rejected":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-medium">
                        <XCircle className="w-3 h-3" /> Rejected
                    </span>
                );
            case "pending":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[11px] font-medium">
                        <Clock className="w-3 h-3" /> Pending
                    </span>
                );
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, y: 40, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 40, scale: 0.95 }}
                        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                        className="fixed inset-x-4 top-[10%] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md z-[70] max-h-[80vh] overflow-y-auto no-scrollbar"
                    >
                        <div className="bg-[#111111] border border-white/10 rounded-3xl shadow-2xl overflow-hidden">
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-6 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#34A853]/10 flex items-center justify-center">
                                        <CalendarDays className="w-5 h-5 text-[#34A853]" />
                                    </div>
                                    <div>
                                        <h2 className="text-[16px] font-bold text-white/90 tracking-tight">Leave Request</h2>
                                        <p className="text-[12px] text-white/40">Request time off from service</p>
                                    </div>
                                </div>
                                <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors rounded-full hover:bg-white/5">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-white/5">
                                <button
                                    onClick={() => setActiveTab("new")}
                                    className={`flex-1 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] transition-colors relative ${
                                        activeTab === "new" ? "text-[#34A853]" : "text-white/40 hover:text-white/60"
                                    }`}
                                >
                                    New Request
                                    {activeTab === "new" && (
                                        <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#34A853]" />
                                    )}
                                </button>
                                <button
                                    onClick={() => setActiveTab("history")}
                                    className={`flex-1 py-3 text-[12px] font-semibold uppercase tracking-[0.15em] transition-colors relative ${
                                        activeTab === "history" ? "text-[#34A853]" : "text-white/40 hover:text-white/60"
                                    }`}
                                >
                                    My Requests
                                    {activeTab === "history" && (
                                        <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#34A853]" />
                                    )}
                                </button>
                            </div>

                            {/* Tab Content */}
                            <div className="p-6">
                                <AnimatePresence mode="wait">
                                    {activeTab === "new" ? (
                                        <motion.div
                                            key="new"
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            {/* Success State */}
                                            {isSubmitted ? (
                                                <motion.div
                                                    initial={{ scale: 0.9, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    className="flex flex-col items-center justify-center py-12 gap-4"
                                                >
                                                    <div className="w-16 h-16 rounded-full bg-[#34A853]/10 flex items-center justify-center">
                                                        <CheckCircle2 className="w-8 h-8 text-[#34A853]" />
                                                    </div>
                                                    <p className="text-[16px] font-semibold text-white/90">Request Submitted</p>
                                                    <p className="text-[13px] text-white/40 text-center">Your HOD will be notified and review your request.</p>
                                                </motion.div>
                                            ) : (
                                                <form onSubmit={handleSubmit} className="space-y-6">
                                                    {/* Leave Type Dropdown */}
                                                    <div className="relative">
                                                        <label className="text-[11px] font-medium uppercase tracking-wider text-white/50 block mb-2">Leave Type</label>
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsTypeOpen(!isTypeOpen)}
                                                            className="w-full flex items-center justify-between py-3 border-b border-white/10 text-left focus:outline-none focus:border-white/40 transition-colors"
                                                        >
                                                            <span className={`text-[15px] ${leaveType ? "text-white" : "text-white/20"}`}>
                                                                {leaveType || "Select a reason"}
                                                            </span>
                                                            <ChevronDown className={`w-4 h-4 text-white/30 transition-transform ${isTypeOpen ? "rotate-180" : ""}`} />
                                                        </button>
                                                        
                                                        <AnimatePresence>
                                                            {isTypeOpen && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: -8 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    exit={{ opacity: 0, y: -8 }}
                                                                    className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden z-10 shadow-xl"
                                                                >
                                                                    {leaveTypes.map((type) => (
                                                                        <button
                                                                            key={type}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setLeaveType(type);
                                                                                setIsTypeOpen(false);
                                                                            }}
                                                                            className={`w-full text-left px-4 py-3 text-[14px] transition-colors hover:bg-white/5 ${
                                                                                leaveType === type ? "text-[#34A853] bg-[#34A853]/5" : "text-white/70"
                                                                            }`}
                                                                        >
                                                                            {type}
                                                                        </button>
                                                                    ))}
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>

                                                    {/* Date Range */}
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="text-[11px] font-medium uppercase tracking-wider text-white/50 block mb-2">Start Date</label>
                                                            <input
                                                                type="date"
                                                                required
                                                                value={startDate}
                                                                onChange={(e) => setStartDate(e.target.value)}
                                                                className="w-full bg-transparent text-white text-[15px] focus:outline-none border-b border-white/10 focus:border-white/40 transition-colors pb-3 [color-scheme:dark]"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[11px] font-medium uppercase tracking-wider text-white/50 block mb-2">End Date</label>
                                                            <input
                                                                type="date"
                                                                required
                                                                value={endDate}
                                                                onChange={(e) => setEndDate(e.target.value)}
                                                                className="w-full bg-transparent text-white text-[15px] focus:outline-none border-b border-white/10 focus:border-white/40 transition-colors pb-3 [color-scheme:dark]"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Reason */}
                                                    <div>
                                                        <label className="text-[11px] font-medium uppercase tracking-wider text-white/50 block mb-2">Brief Reason</label>
                                                        <textarea
                                                            required
                                                            value={reason}
                                                            onChange={(e) => setReason(e.target.value)}
                                                            rows={3}
                                                            placeholder="Briefly explain why you need time off..."
                                                            className="w-full bg-transparent text-white text-[15px] focus:outline-none border-b border-white/10 focus:border-white/40 transition-colors pb-3 placeholder:text-white/20 resize-none"
                                                        />
                                                    </div>

                                                    {/* Submit */}
                                                    <button
                                                        type="submit"
                                                        disabled={isSubmitting || !leaveType || !startDate || !endDate || !reason}
                                                        className="w-full flex items-center justify-center gap-2 bg-[#34A853] hover:bg-[#2e9347] disabled:opacity-40 disabled:hover:bg-[#34A853] text-white py-4 rounded-xl font-semibold tracking-wider text-[13px] uppercase transition-colors"
                                                    >
                                                        {isSubmitting ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                                Submitting...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Send className="w-4 h-4" />
                                                                Submit Request
                                                            </>
                                                        )}
                                                    </button>
                                                </form>
                                            )}
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="history"
                                            initial={{ opacity: 0, x: 20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: -20 }}
                                            transition={{ duration: 0.2 }}
                                            className="space-y-4"
                                        >
                                            {mockLeaveRequests.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                                    <CalendarDays className="w-10 h-10 text-white/20" />
                                                    <p className="text-[14px] text-white/40">No leave requests yet</p>
                                                </div>
                                            ) : (
                                                mockLeaveRequests.map((req) => (
                                                    <div key={req.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                                                        <div className="flex items-start justify-between mb-3">
                                                            <div>
                                                                <p className="text-[14px] font-medium text-white/90">{req.type}</p>
                                                                <p className="text-[12px] text-white/40 mt-0.5">{req.startDate} — {req.endDate}</p>
                                                            </div>
                                                            {getStatusBadge(req.status)}
                                                        </div>
                                                        <p className="text-[13px] text-white/50 leading-relaxed">{req.reason}</p>
                                                    </div>
                                                ))
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
