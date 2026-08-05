"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Send, X, AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import WorkerPicker, { WorkerBasic } from "@/components/ui/WorkerPicker";
import { sendManualBroadcastEmail } from "@/app/admin/events/actions";

interface ManualBroadcastModalProps {
    isOpen: boolean;
    onClose: () => void;
    event?: { id: string; title: string } | null;
    workers: WorkerBasic[];
}

export default function ManualBroadcastModal({
    isOpen,
    onClose,
    event,
    workers,
}: ManualBroadcastModalProps) {
    const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
    const [subject, setSubject] = useState(
        event ? `[Notice] ${event.title}` : "Important Announcement for Harvesters Workforce"
    );
    const [messageBody, setMessageBody] = useState(
        `This {{event_title}} is not just another service, it is a prophetic moment. We are gathering as a church family for a powerful time of encounters.\n\nAs a member of the workforce, your service is a vital part of what God is doing. Your dedication makes these encounters possible.\n\nCome with faith. Come with expectation. Come with gratitude already in your heart.\n\n**Please remember to check in on the attendance platform upon arrival.** Your promptness and diligence in checking in helps us coordinate effectively.\n\nWe look forward to receiving you as we step into a new wave of testimonies together.\n\nSee you there.\n\nWarm Regards,\n**Harvesters Workforce Communications**`
    );
    const [isSending, setIsSending] = useState(false);
    const [resultMessage, setResultMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    if (!isOpen) return null;

    const handleInsertTag = (tag: string) => {
        setMessageBody((prev) => `${prev} ${tag}`);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!subject.trim()) {
            setResultMessage({ type: "error", text: "Please enter an email subject." });
            return;
        }

        if (!messageBody.trim()) {
            setResultMessage({ type: "error", text: "Please write a message body." });
            return;
        }

        setIsSending(true);
        setResultMessage(null);

        try {
            const res = await sendManualBroadcastEmail({
                eventTitle: event?.title,
                targetWorkerIds: selectedWorkerIds,
                subject,
                messageBody,
            });

            setIsSending(false);

            if (res?.error) {
                setResultMessage({ type: "error", text: res.error });
            } else if (res?.message) {
                setResultMessage({ type: "success", text: res.message });
            }
        } catch (err: unknown) {
            setIsSending(false);
            const msg = err instanceof Error ? err.message : "An unexpected error occurred while sending.";
            setResultMessage({ type: "error", text: msg });
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 overflow-hidden bg-black/75 backdrop-blur-md">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    className="w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col my-auto"
                >
                    {/* Header - Fixed */}
                    <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-neutral-100 dark:border-white/10 bg-neutral-50/80 dark:bg-black/60 shrink-0">
                        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#34A853]/10 text-[#34A853] flex items-center justify-center shrink-0">
                                <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-sm sm:text-base font-bold text-neutral-900 dark:text-white truncate">
                                    Send Manual Broadcast Email
                                </h2>
                                <p className="text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400 truncate">
                                    {event ? `Event: ${event.title}` : "Send a direct message to workers"}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-white rounded-xl hover:bg-neutral-200/50 dark:hover:bg-white/10 transition-colors shrink-0"
                            aria-label="Close modal"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Form Container */}
                    <form onSubmit={handleSend} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                        {/* Scrollable Form Body */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-5">
                            {/* Result Alert */}
                            {resultMessage && (
                                <div
                                    className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border flex items-start gap-2.5 sm:gap-3 text-xs ${
                                        resultMessage.type === "success"
                                            ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20 text-green-700 dark:text-green-300"
                                            : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300"
                                    }`}
                                >
                                    {resultMessage.type === "success" ? (
                                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <p className="font-semibold leading-relaxed break-words">{resultMessage.text}</p>
                                    </div>
                                </div>
                            )}

                            {/* Recipient Worker Picker */}
                            <div className="rounded-xl sm:rounded-2xl border border-neutral-200 dark:border-white/10 p-3.5 sm:p-4 bg-neutral-50/50 dark:bg-neutral-900/30">
                                <WorkerPicker
                                    workers={workers}
                                    selectedWorkerIds={selectedWorkerIds}
                                    onChange={setSelectedWorkerIds}
                                    label="Recipient Audience"
                                    description="Leave unselected to send to all eligible workers."
                                />
                            </div>

                            {/* Subject Input */}
                            <div>
                                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1.5">
                                    Email Subject <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    required
                                    placeholder="Enter email subject line..."
                                    className="w-full px-3.5 sm:px-4 py-2.5 bg-white dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl text-xs sm:text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all"
                                />
                            </div>

                            {/* Message Body Editor */}
                            <div>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1.5">
                                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                                        Message Body <span className="text-red-500">*</span>
                                    </label>

                                    {/* Quick Insert Placeholder Tags */}
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                                            <Sparkles className="w-3 h-3 text-[#34A853]" /> Insert tag:
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleInsertTag("{{first_name}}")}
                                            className="text-[10px] font-mono px-2 py-1 sm:py-0.5 rounded-md bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-[#34A853]/20 hover:text-[#34A853] transition-colors"
                                        >
                                            {"{{first_name}}"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleInsertTag("{{event_title}}")}
                                            className="text-[10px] font-mono px-2 py-1 sm:py-0.5 rounded-md bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 hover:bg-[#34A853]/20 hover:text-[#34A853] transition-colors"
                                        >
                                            {"{{event_title}}"}
                                        </button>
                                    </div>
                                </div>

                                <textarea
                                    value={messageBody}
                                    onChange={(e) => setMessageBody(e.target.value)}
                                    rows={5}
                                    required
                                    placeholder="Type your custom email message here..."
                                    className="w-full px-3.5 sm:px-4 py-3 bg-white dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl text-xs sm:text-sm text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 resize-none font-sans leading-relaxed transition-all"
                                />
                            </div>
                        </div>

                        {/* Modal Footer Actions - Fixed Sticky at Bottom */}
                        <div className="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-neutral-100 dark:border-white/10 bg-neutral-50/90 dark:bg-black/90 backdrop-blur-md flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <span className="text-[11px] text-neutral-400 text-center sm:text-left">
                                Direct SMTP outbox dispatch.
                            </span>
                            <div className="flex items-center gap-2.5 sm:gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 sm:flex-none px-4 py-2.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-white/10 rounded-xl transition-colors min-h-[40px] flex items-center justify-center"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSending}
                                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-[#34A853] hover:bg-[#2b8a44] active:bg-[#237338] text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-[#34A853]/20 disabled:opacity-60 min-h-[40px]"
                                >
                                    {isSending ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Sending Broadcast...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-3.5 h-3.5" />
                                            <span>Send Email Now</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
