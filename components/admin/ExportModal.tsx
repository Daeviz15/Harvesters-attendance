"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, CalendarDays, Loader2, FileDown, CheckCircle2 } from "lucide-react";

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ExportModal({ isOpen, onClose }: ExportModalProps) {
    const [exportType, setExportType] = useState<"date" | "all">("date");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [isExporting, setIsExporting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleStartDateChange = (val: string) => {
        setStartDate(val);
        if (!endDate || endDate < val) {
            setEndDate(val);
        }
    };

    const handleExport = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsExporting(true);

        try {
            
            const url = new URL("/api/export/attendance", window.location.origin);
            url.searchParams.set("type", exportType);
            url.searchParams.set("tzOffset", new Date().getTimezoneOffset().toString());
            
            if (exportType === "date") {
                url.searchParams.set("startDate", startDate);
                url.searchParams.set("endDate", endDate || startDate);
            }

            
            const response = await fetch(url.toString());
            
            if (!response.ok) {
                throw new Error("Failed to export data");
            }

            
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            
            
            const disposition = response.headers.get("Content-Disposition");
            const finalEnd = endDate || startDate;
            let filename = `attendance-${exportType === "date" ? (startDate === finalEnd ? startDate : `${startDate}-to-${finalEnd}`) : "all"}.csv`;
            if (disposition && disposition.includes("filename=")) {
                filename = disposition.split("filename=")[1].replace(/"/g, "");
            }
            
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(downloadUrl);
            document.body.removeChild(a);

            setIsSuccess(true);
            setTimeout(() => {
                setIsSuccess(false);
                onClose();
            }, 2000);

        } catch (error) {
            console.error(error);
            alert("Failed to export attendance data. Please try again.");
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-neutral-900/40 dark:bg-black/70 backdrop-blur-sm z-[60]"
                    />

                    {}
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-full max-w-md max-h-[90vh] z-[70] flex flex-col"
                    >
                        <div className="bg-white dark:bg-[#111111] border border-neutral-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-full">
                            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-neutral-100 dark:border-white/5 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-[#34A853]/10 flex items-center justify-center shrink-0">
                                        <FileDown className="w-5 h-5 text-[#34A853]" />
                                    </div>
                                    <div>
                                        <h2 className="text-[16px] font-bold text-neutral-800 dark:text-white/90 tracking-tight">Export Data</h2>
                                        <p className="text-[12px] text-neutral-500 dark:text-white/40">Download attendance to CSV</p>
                                    </div>
                                </div>
                                <button onClick={onClose} className="p-1.5 sm:p-2 text-neutral-400 dark:text-white/40 hover:text-neutral-800 dark:hover:text-white transition-colors rounded-full hover:bg-neutral-100 dark:hover:bg-white/5 shrink-0">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                                <AnimatePresence mode="wait">
                                    {isSuccess ? (
                                        <motion.div
                                            key="success"
                                            initial={{ scale: 0.9, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            className="flex flex-col items-center justify-center py-8 gap-4"
                                        >
                                            <div className="w-16 h-16 rounded-full bg-[#34A853]/10 flex items-center justify-center">
                                                <CheckCircle2 className="w-8 h-8 text-[#34A853]" />
                                            </div>
                                            <p className="text-[16px] font-semibold text-neutral-800 dark:text-white/90">Export Successful</p>
                                            <p className="text-[13px] text-neutral-500 dark:text-white/40 text-center">Your CSV file is downloading securely.</p>
                                        </motion.div>
                                    ) : (
                                        <motion.form
                                            key="form"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            onSubmit={handleExport} 
                                            className="space-y-6"
                                        >
                                            {}
                                            <div className="grid grid-cols-2 gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => setExportType("date")}
                                                    className={`py-3 px-4 rounded-xl border text-left transition-all ${
                                                        exportType === "date"
                                                            ? "bg-[#34A853]/10 border-[#34A853]/30 text-[#34A853]"
                                                            : "bg-neutral-50 dark:bg-white/5 border-transparent text-neutral-600 dark:text-white/60 hover:bg-neutral-100 dark:hover:bg-white/10"
                                                    }`}
                                                >
                                                    <span className="text-[13px] font-semibold block mb-0.5">Date Range</span>
                                                    <span className="text-[11px] opacity-70">Custom range</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setExportType("all")}
                                                    className={`py-3 px-4 rounded-xl border text-left transition-all ${
                                                        exportType === "all"
                                                            ? "bg-[#34A853]/10 border-[#34A853]/30 text-[#34A853]"
                                                            : "bg-neutral-50 dark:bg-white/5 border-transparent text-neutral-600 dark:text-white/60 hover:bg-neutral-100 dark:hover:bg-white/10"
                                                    }`}
                                                >
                                                    <span className="text-[13px] font-semibold block mb-0.5">All Time</span>
                                                    <span className="text-[11px] opacity-70">Full database</span>
                                                </button>
                                            </div>

                                            {/* Date Pickers (Only if type === date) */}
                                            {exportType === "date" && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: "auto" }}
                                                    className="overflow-hidden space-y-4"
                                                >
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-white/50 block mb-2">
                                                                Start Date
                                                            </label>
                                                            <div className="relative">
                                                                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-white/30" />
                                                                <input
                                                                    type="date"
                                                                    required
                                                                    value={startDate}
                                                                    onChange={(e) => handleStartDateChange(e.target.value)}
                                                                    className="w-full pl-10 pr-3 py-3 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-[13px] text-neutral-800 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all [color-scheme:light] dark:[color-scheme:dark]"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-white/50 block mb-2">
                                                                End Date
                                                            </label>
                                                            <div className="relative">
                                                                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 dark:text-white/30" />
                                                                <input
                                                                    type="date"
                                                                    required
                                                                    min={startDate}
                                                                    value={endDate}
                                                                    onChange={(e) => setEndDate(e.target.value)}
                                                                    className="w-full pl-10 pr-3 py-3 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-[13px] text-neutral-800 dark:text-white/90 focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all [color-scheme:light] dark:[color-scheme:dark]"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}

                                            {/* Submit */}
                                            <button
                                                type="submit"
                                                disabled={isExporting || (exportType === "date" && (!startDate || !endDate))}
                                                className="w-full flex items-center justify-center gap-2 bg-[#34A853] hover:bg-[#2e9347] disabled:opacity-40 disabled:hover:bg-[#34A853] text-white py-4 rounded-xl font-semibold tracking-wider text-[13px] uppercase transition-colors shadow-lg cursor-pointer disabled:cursor-not-allowed"
                                            >
                                                {isExporting ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Generating CSV...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Download className="w-4 h-4" />
                                                        Download CSV
                                                    </>
                                                )}
                                            </button>
                                        </motion.form>
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
