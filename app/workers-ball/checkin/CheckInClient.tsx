"use client";

import { useActionState, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { lookupByCode, confirmCheckIn, type CheckInState } from "./actions";

interface Props {
    preloaded: CheckInState;
    preloadedToken: string | null;
}

export default function CheckInClient({ preloaded, preloadedToken }: Props) {
    const [codeState, codeAction, isCodePending] = useActionState<CheckInState, FormData>(
        lookupByCode,
        null
    );

    const [confirmState, setConfirmState] = useState<CheckInState>(null);
    const [isConfirming, startConfirm] = useTransition();

    // The "active" lookup result: either from QR preload or manual code lookup
    const lookupResult = preloaded ?? codeState;

    const attendee = confirmState?.attendee ?? lookupResult?.attendee;
    const isAlreadyCheckedIn = confirmState?.alreadyCheckedIn ?? lookupResult?.alreadyCheckedIn;
    const checkInSuccess = confirmState?.success;

    function handleConfirm() {
        if (!attendee?.id) return;
        startConfirm(async () => {
            const result = await confirmCheckIn(attendee.id);
            setConfirmState(result);
        });
    }

    function handleReset() {
        setConfirmState(null);
        // If this was a QR scan, navigate back to the base check-in page
        if (preloadedToken) {
            window.location.href = "/workers-ball/checkin";
        }
    }

    // ── Determine what time to show for already-checked-in ───────────────────
    const checkedInTime = attendee?.checkedInAt
        ? new Intl.DateTimeFormat("en-NG", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Africa/Lagos",
        }).format(new Date(attendee.checkedInAt))
        : null;

    return (
        <main className="min-h-screen bg-black text-white px-4 py-10 flex flex-col items-center">
            {/* Header */}
            <div className="w-full max-w-sm mb-10 text-center">
                <div className="flex justify-center mb-4">
                    <div className="relative h-10 w-16">
                        <Image src="/logo.png" alt="Harvesters Globe" fill sizes="64px" className="object-contain invert" />
                    </div>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-bold uppercase tracking-widest mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Event Check-in
                </div>
                <h1 className="text-xl font-bold text-white">Workers&apos; Ball 2026</h1>
                <p className="text-neutral-500 text-xs mt-1">22nd November 2026 &bull; Harvesters Globe Ologolo</p>
            </div>

            <div className="w-full max-w-sm space-y-4">
                {/* ── Success state ── */}
                <AnimatePresence mode="wait">
                    {checkInSuccess && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-[#0a1a0a] border border-green-500/40 rounded-2xl p-6 text-center"
                        >
                            <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-4">
                                <svg className="w-7 h-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div className="text-green-400 font-bold text-lg mb-1">Checked In!</div>
                            <div className="text-white font-semibold text-xl mb-1">{attendee?.name}</div>
                            <div className="text-amber-400/80 text-sm font-medium mb-1">
                                {attendee?.team ? `${attendee.team} — ${attendee?.department}` : attendee?.department}
                            </div>
                            <div className="text-neutral-500 text-xs mb-4">{attendee?.registrationId}</div>
                            {checkedInTime && (
                                <div className="text-green-400/70 text-xs mb-4">Checked in at {checkedInTime}</div>
                            )}
                            <button
                                onClick={handleReset}
                                className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-semibold transition-colors"
                            >
                                Check in next attendee
                            </button>
                        </motion.div>
                    )}

                    {/* ── Already checked in ── */}
                    {!checkInSuccess && isAlreadyCheckedIn && (
                        <motion.div
                            key="already"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#1a1500] border border-amber-500/40 rounded-2xl p-6 text-center"
                        >
                            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto mb-4">
                                <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div className="text-amber-400 font-bold text-base mb-1">Already Checked In</div>
                            {attendee && (
                                <>
                                    <div className="text-white font-semibold text-lg mb-1">{attendee.name}</div>
                                    <div className="text-amber-400/70 text-sm mb-1">
                                        {attendee.team ? `${attendee.team} — ${attendee.department}` : attendee.department}
                                    </div>
                                </>
                            )}
                            {checkedInTime && (
                                <div className="text-neutral-400 text-xs mb-4">Previously checked in at {checkedInTime}</div>
                            )}
                            <button
                                onClick={handleReset}
                                className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-semibold transition-colors"
                            >
                                Check in next attendee
                            </button>
                        </motion.div>
                    )}

                    {/* ── Attendee found — awaiting confirmation ── */}
                    {!checkInSuccess && !isAlreadyCheckedIn && attendee && (
                        <motion.div
                            key="confirm"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#0a0a0a] border border-white/15 rounded-2xl p-6"
                        >
                            <div className="text-center mb-4">
                                <div className="text-xs text-neutral-500 uppercase tracking-widest mb-2">Registration Found</div>
                                <div className="text-white font-bold text-2xl">{attendee.name}</div>
                                <div className="text-amber-400 text-sm font-medium mt-1">
                                    {attendee.team ? `${attendee.team} — ${attendee.department}` : attendee.department}
                                </div>
                                <div className="text-neutral-600 text-xs mt-1 font-mono">{attendee.registrationId}</div>
                            </div>
                            <button
                                onClick={handleConfirm}
                                disabled={isConfirming}
                                className="w-full py-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-50 text-black font-black text-sm uppercase tracking-widest transition-all"
                            >
                                {isConfirming ? "Recording..." : "Confirm Check-in ✓"}
                            </button>
                            <button
                                onClick={handleReset}
                                className="w-full mt-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                        </motion.div>
                    )}

                    {/* ── Not found ── */}
                    {!checkInSuccess && (lookupResult?.notFound || confirmState?.notFound) && (
                        <motion.div
                            key="notfound"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-[#1a0a0a] border border-red-500/30 rounded-2xl p-6 text-center"
                        >
                            <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                                <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </div>
                            <div className="text-red-400 font-bold text-base mb-2">Registration Not Found</div>
                            <p className="text-neutral-400 text-sm mb-4">
                                No registration matched that QR code or attendance code. Please verify and try again.
                            </p>
                            <button
                                onClick={handleReset}
                                className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-semibold transition-colors"
                            >
                                Try again
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Error messages ── */}
                {(codeState?.error || confirmState?.error) && !checkInSuccess && !isAlreadyCheckedIn && !attendee && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm text-center">
                        {codeState?.error || confirmState?.error}
                    </div>
                )}

                {/* ── Code entry form (shown when no attendee is pending confirmation) ── */}
                {!checkInSuccess && !attendee && !isAlreadyCheckedIn && !preloadedToken && (
                    <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl p-6">
                        <h2 className="text-sm font-bold text-white mb-1">Enter Attendance Code</h2>
                        <p className="text-neutral-500 text-xs mb-4">
                            Type the attendee&apos;s 5-digit backup code, or ask them to show their QR code for scanning.
                        </p>
                        <form action={codeAction} className="space-y-3">
                            <input
                                type="text"
                                name="code"
                                required
                                pattern="\d{5}"
                                maxLength={5}
                                inputMode="numeric"
                                autoComplete="off"
                                autoFocus
                                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-4 text-white text-center text-3xl font-mono font-bold tracking-[0.5em] focus:outline-none focus:border-amber-500/50 transition-colors placeholder:text-neutral-700 placeholder:tracking-normal placeholder:text-base"
                                placeholder="_ _ _ _ _"
                            />
                            <button
                                type="submit"
                                disabled={isCodePending}
                                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-sm uppercase tracking-widest transition-all"
                            >
                                {isCodePending ? "Looking up..." : "Verify Code"}
                            </button>
                        </form>

                        <div className="mt-5 pt-4 border-t border-white/5 text-center">
                            <p className="text-xs text-neutral-600">
                                To use QR scan: open your camera app, scan the attendee&apos;s gate pass QR code, and confirm check-in on the page that opens.
                            </p>
                        </div>
                    </div>
                )}

                {/* ── QR mode info banner (when arriving via QR token URL) ── */}
                {preloadedToken && !checkInSuccess && !attendee && !isAlreadyCheckedIn && !lookupResult?.notFound && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center text-neutral-400 text-sm">
                        Loading registration details...
                    </div>
                )}
            </div>

            <div className="mt-10 text-center text-xs text-neutral-700">
                Workers Ball 2026 &bull; Administrators only
            </div>
        </main>
    );
}
