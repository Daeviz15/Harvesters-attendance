"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DoorOpen, ShieldOff, UserPlus, ExternalLink, Ticket } from "lucide-react";
import WorkerPicker, { type WorkerBasic } from "@/components/ui/WorkerPicker";
import { grantFrontDeskAccess, revokeFrontDeskAccess } from "./actions";

export default function FrontDeskClient({ staff, workers, registeredCount, admittedCount, loadError }: {
    staff: WorkerBasic[];
    workers: WorkerBasic[];
    registeredCount: number;
    admittedCount: number;
    loadError: boolean;
}) {
    const [selected, setSelected] = useState<string[]>([]);
    const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
    const [isPending, startTransition] = useTransition();

    const staffIds = new Set(staff.map((s) => s.id));
    const pickable = workers.filter((w) => !staffIds.has(w.id));

    const run = (fn: () => Promise<{ error?: string; success?: string }>, after?: () => void) => {
        setMessage(null);
        startTransition(async () => {
            const res = await fn();
            if (res.error) setMessage({ type: "error", text: res.error });
            else {
                setMessage({ type: "ok", text: res.success ?? "Done." });
                after?.();
            }
        });
    };

    return (
        <div className="mx-auto w-full max-w-4xl space-y-8">
            <header>
                <div className="flex items-center gap-2 text-[#34A853]">
                    <DoorOpen className="h-5 w-5" />
                    <span className="text-xs font-bold uppercase tracking-[0.18em]">Workers Ball 2026</span>
                </div>
                <h1 className="mt-2 text-2xl font-bold tracking-tight">Front Desk Access</h1>
                <p className="mt-1 max-w-2xl text-sm text-neutral-500 dark:text-white/50">
                    Give volunteers temporary access to the gate check-in page. They can scan QR codes or type 5-digit codes to admit guests.
                    Each ticket admits one person, once. Their normal role stays the same, and access stays on until you remove it here — remember to remove it after the event.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                    <Link href="/workers-ball/checkin" target="_blank"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-semibold transition hover:bg-neutral-100 dark:border-white/10 dark:hover:bg-white/5">
                        Open check-in page <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#34A853]/10 px-3 py-2 text-sm font-semibold text-[#34A853]">
                        <Ticket className="h-4 w-4" /> {admittedCount} of {registeredCount} guests admitted
                    </span>
                </div>
            </header>

            {loadError && (
                <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                    Some data could not be loaded. If the database update for front desk access hasn&apos;t been run yet, run the latest migrations.
                </div>
            )}

            {message && (
                <div role="status" className={`rounded-xl border p-3 text-sm ${message.type === "ok" ? "border-[#34A853]/30 bg-[#34A853]/10 text-[#34A853]" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>
                    {message.text}
                </div>
            )}

            {/* Current front desk staff */}
            <section className="rounded-2xl border border-neutral-200 bg-white/60 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-bold uppercase tracking-wider">Front desk staff ({staff.length})</h2>
                    {staff.length > 0 && (
                        <button type="button" disabled={isPending}
                            onClick={() => { if (window.confirm("Remove front desk access from everyone now?")) run(() => revokeFrontDeskAccess()); }}
                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-500/10 disabled:opacity-50">
                            <ShieldOff className="h-3.5 w-3.5" /> Remove all
                        </button>
                    )}
                </div>
                {staff.length === 0 ? (
                    <p className="py-6 text-center text-sm text-neutral-500 dark:text-white/40">No one has front desk access yet.</p>
                ) : (
                    <ul className="divide-y divide-neutral-200 dark:divide-white/5">
                        {staff.map((s) => (
                            <li key={s.id} className="flex items-center gap-3 py-3">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold">{s.first_name} {s.last_name}</p>
                                    <p className="truncate text-xs text-neutral-500 dark:text-white/40">
                                        {[s.worker_id, s.department].filter(Boolean).join(" · ")}
                                    </p>
                                </div>
                                <button type="button" disabled={isPending}
                                    onClick={() => run(() => revokeFrontDeskAccess(s.id))}
                                    className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold transition hover:border-red-500/40 hover:text-red-500 disabled:opacity-50 dark:border-white/10">
                                    Remove
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Give access */}
            <section className="rounded-2xl border border-neutral-200 bg-white/60 p-5 dark:border-white/10 dark:bg-white/[0.03]">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wider">Give front desk access</h2>
                {(
                    <>
                        <WorkerPicker
                            workers={pickable}
                            selectedWorkerIds={selected}
                            onChange={setSelected}
                            label="Choose workers"
                            description="Search by name or worker ID, then select the volunteers who will run the gate."
                        />
                        <button type="button" disabled={isPending || selected.length === 0}
                            onClick={() => run(() => grantFrontDeskAccess(selected), () => setSelected([]))}
                            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#34A853] px-4 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50 sm:w-auto">
                            <UserPlus className="h-4 w-4" />
                            {selected.length > 0 ? `Give access to ${selected.length} worker${selected.length === 1 ? "" : "s"}` : "Give access"}
                        </button>
                        <p className="mt-3 text-xs text-neutral-500 dark:text-white/40">
                            Tell them to sign in from the Workers Ball page using &ldquo;Front desk sign in&rdquo; at the bottom, or go to <span className="font-mono">/workers-ball/checkin</span>.
                        </p>
                    </>
                )}
            </section>
        </div>
    );
}
