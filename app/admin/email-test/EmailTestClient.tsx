"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2, MailCheck, ShieldCheck, TriangleAlert, Clock } from "lucide-react";
import { sendReminderTestEmail, type EmailTestState } from "./actions";

const initialState: EmailTestState = {
    status: "idle",
    message: "",
};

type EmailTestClientProps = {
    maskedRecipient: string;
    reminderLeadMinutes: number;
    followupDelayMinutes: number;
};

export default function EmailTestClient({
    maskedRecipient,
    reminderLeadMinutes,
    followupDelayMinutes,
}: EmailTestClientProps) {
    const [state, formAction, isPending] = useActionState(sendReminderTestEmail, initialState);

    return (
        <div className="w-full max-w-3xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-neutral-800 dark:text-white/90">
                    Email Delivery Test
                </h1>
                <p className="text-neutral-500 dark:text-white/50 mt-1">
                    Validate the event reminder template and SMTP delivery before scheduling is enabled.
                </p>
            </div>

            <section className="bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 sm:p-8 border-b border-neutral-100 dark:border-white/5">
                    <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-xl bg-[#34A853]/10 text-[#34A853] flex items-center justify-center shrink-0">
                            <MailCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                                Send one reminder email
                            </h2>
                            <p className="text-sm text-neutral-500 dark:text-white/50 mt-1 leading-6">
                                The message is sent only to your signed-in super-admin address: <span className="font-medium text-neutral-700 dark:text-white/70">{maskedRecipient}</span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-6 sm:p-8 space-y-6">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
                        <div className="flex gap-3">
                            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-800 dark:text-blue-200 leading-6">
                                <p className="font-semibold">Safe test mode</p>
                                <p className="mt-1 text-blue-700/80 dark:text-blue-200/70">
                                    The subject and email header are marked as a test. No event, attendance session, job, or additional recipient will be created.
                                </p>
                            </div>
                        </div>
                    </div>

                    <form action={formAction}>
                        <button
                            type="submit"
                            disabled={isPending || state.status === "success"}
                            className="inline-flex items-center justify-center gap-2 bg-[#34A853] hover:bg-[#2b8a44] disabled:bg-[#34A853]/60 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm"
                        >
                            {isPending ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Sending test…
                                </>
                            ) : state.status === "success" ? (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    Test email sent
                                </>
                            ) : (
                                <>
                                    <MailCheck className="w-4 h-4" />
                                    Send one test email
                                </>
                            )}
                        </button>
                    </form>

                    <div aria-live="polite">
                        {state.status === "success" && (
                            <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-200">
                                <div className="flex gap-3">
                                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold">Test accepted</p>
                                        <p className="mt-1">{state.message}</p>
                                        {state.deliveryReference && (
                                            <p className="mt-2 font-mono text-xs break-all opacity-70">
                                                Delivery reference: {state.deliveryReference}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {state.status === "error" && (
                            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                                <div className="flex gap-3">
                                    <TriangleAlert className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold">Test failed</p>
                                        <p className="mt-1">{state.message}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Scheduler Processor Section */}
            <SchedulerRunnerSection
                reminderLeadMinutes={reminderLeadMinutes}
                followupDelayMinutes={followupDelayMinutes}
            />
        </div>
    );
}

function SchedulerRunnerSection({
    reminderLeadMinutes,
    followupDelayMinutes,
}: Pick<EmailTestClientProps, "reminderLeadMinutes" | "followupDelayMinutes">) {
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<{
        success?: boolean;
        message?: string;
        error?: string;
        summary?: { claimed: number; sent: number; remindersQueued: number; followUpsQueued: number };
    } | null>(null);
    const schedulerDescription = `On localhost, there is no automated background cron. Click this button to manually trigger the queue processor and send any due reminders (${reminderLeadMinutes} mins prior) or follow-ups (${followupDelayMinutes} mins post-event).`;

    const handleRunScheduler = async () => {
        setRunning(true);
        setResult(null);

        const { triggerScheduledEmailProcessorAction } = await import("./actions");
        const res = await triggerScheduledEmailProcessorAction();

        setRunning(false);
        setResult(res);
    };

    return (
        <section className="bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-6 sm:p-8 border-b border-neutral-100 dark:border-white/5">
                <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                        <Clock className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                            Run Automatic Email Scheduler (Localhost / Testing)
                        </h2>
                        <p className="text-sm text-neutral-500 dark:text-white/50 mt-1 leading-6">
                            {schedulerDescription}
                        </p>
                    </div>
                </div>
            </div>

            <div className="p-6 sm:p-8 space-y-6">
                <button
                    type="button"
                    onClick={handleRunScheduler}
                    disabled={running}
                    className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-colors shadow-sm"
                >
                    {running ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Executing queue processor...
                        </>
                    ) : (
                        <>
                            <Clock className="w-4 h-4" />
                            Run Email Scheduler Now
                        </>
                    )}
                </button>

                {result && (
                    <div className={`rounded-xl border p-4 text-sm ${
                        result.success
                            ? "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20 text-green-800 dark:text-green-200"
                            : "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-800 dark:text-red-200"
                    }`}>
                        {result.success ? (
                            <div className="space-y-2">
                                <p className="font-bold">{result.message}</p>
                                {result.summary && (
                                    <div className="text-xs font-mono bg-black/10 dark:bg-black/40 p-3 rounded-lg space-y-1">
                                        <p>• Reminder Jobs Queued: {result.summary.remindersQueued}</p>
                                        <p>• Follow-Up Jobs Queued: {result.summary.followUpsQueued}</p>
                                        <p>• Jobs Claimed: {result.summary.claimed}</p>
                                        <p>• Emails Sent: {result.summary.sent}</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="font-semibold">{result.error}</p>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
