"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CalendarDays, ChevronDown, Send, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { submitLeaveRequest, fetchMyLeaveRequests } from "@/app/dashboard/actions";
import type { LeaveRequest, LeaveStatus } from "@/lib/types";

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
    const [showConfirmation, setShowConfirmation] = useState(false);
    
    // Server data state
    const [history, setHistory] = useState<LeaveRequest[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fetchHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const data = await fetchMyLeaveRequests();
            setHistory(data as LeaveRequest[]);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (isOpen && activeTab === "history") {
            fetchHistory();
        }
    }, [isOpen, activeTab]);

    const calculateDuration = () => {
        if (!startDate || !endDate) return 0;
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        
        // Logical date validation
        if (new Date(startDate) < new Date(new Date().setHours(0, 0, 0, 0))) {
            setErrorMsg("Start Date cannot be in the past.");
            return;
        }
        
        if (new Date(endDate) < new Date(startDate)) {
            setErrorMsg("End Date cannot be earlier than Start Date.");
            return;
        }

        setShowConfirmation(true);
    };

    const confirmSubmission = async () => {
        setIsSubmitting(true);
        setErrorMsg(null);

        const formData = new FormData();
        formData.append("leaveType", leaveType);
        formData.append("startDate", startDate);
        formData.append("endDate", endDate);
        formData.append("reason", reason);

        try {
            const result = await submitLeaveRequest(formData);
            if (result.error) {
                setErrorMsg(result.error);
                setShowConfirmation(false);
            } else {
                setShowConfirmation(false);
                setIsSubmitted(true);
                setTimeout(() => {
                    setIsSubmitted(false);
                    setLeaveType("");
                    setStartDate("");
                    setEndDate("");
                    setReason("");
                    setActiveTab("history");
                }, 2000);
            }
        } catch (err) {
            setErrorMsg("An unexpected error occurred.");
            setShowConfirmation(false);
        } finally {
            setIsSubmitting(false);
        }
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
                                            ) : showConfirmation ? (
                                                <motion.div
                                                    initial={{ scale: 0.95, opacity: 0 }}
                                                    animate={{ scale: 1, opacity: 1 }}
                                                    className="flex flex-col items-center justify-center py-8 gap-4 px-4 text-center"
                                                >
                                                    <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-2">
                                                        <Clock className="w-8 h-8 text-orange-400" />
                                                    </div>
                                                    <h3 className="text-[18px] font-semibold text-white/90 tracking-tight">Confirm Request</h3>
                                                    <p className="text-[14px] text-white/60 leading-relaxed max-w-[280px]">
                                                        You are about to request <strong className="text-white font-medium">{leaveType}</strong> for <strong className="text-white font-medium">{calculateDuration()} day{calculateDuration() > 1 ? 's' : ''}</strong> from <span className="text-white">{startDate}</span> to <span className="text-white">{endDate}</span>.
                                                    </p>
                                                    
                                                    <div className="flex w-full gap-3 mt-6">
                                                        <button 
                                                            type="button"
                                                            onClick={() => setShowConfirmation(false)}
                                                            disabled={isSubmitting}
                                                            className="flex-1 py-3.5 rounded-xl border border-white/10 text-white/70 font-semibold tracking-wider text-[12px] uppercase hover:bg-white/5 transition-colors disabled:opacity-50"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={confirmSubmission}
                                                            disabled={isSubmitting}
                                                            className="flex-1 py-3.5 rounded-xl bg-[#34A853] hover:bg-[#2e9347] text-white font-semibold tracking-wider text-[12px] uppercase transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                                        >
                                                            {isSubmitting ? <><Loader2 className="w-4 h-4 animate-spin"/> Submitting</> : 'Confirm'}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            ) : (
                                                <form onSubmit={handleSubmit} className="space-y-6">
                                                    {errorMsg && (
                                                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[13px] p-3 rounded-lg text-center">
                                                            {errorMsg}
                                                        </div>
                                                    )}
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
                                                                min={new Date().toISOString().split('T')[0]}
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
                                                                min={startDate || new Date().toISOString().split('T')[0]}
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
                                            {isLoadingHistory ? (
                                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                                    <Loader2 className="w-8 h-8 animate-spin text-white/20" />
                                                    <p className="text-[13px] text-white/40">Loading history...</p>
                                                </div>
                                            ) : history.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center py-12 gap-3">
                                                    <CalendarDays className="w-10 h-10 text-white/20" />
                                                    <p className="text-[14px] text-white/40">No leave requests yet</p>
                                                </div>
                                            ) : (
                                                history.map((req) => (
                                                    <div key={req.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                                                        <div className="flex items-start justify-between mb-3">
                                                            <div>
                                                                <p className="text-[14px] font-medium text-white/90">{req.leave_type}</p>
                                                                <p className="text-[12px] text-white/40 mt-0.5">{req.start_date} — {req.end_date}</p>
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
