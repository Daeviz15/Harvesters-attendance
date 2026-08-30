"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Loader2,
    Search,
    UserRound,
    XCircle,
} from "lucide-react";
import { reviewLeaveRequest, type AdminLeaveRequestRow } from "./actions";
import type { LeaveStatus } from "@/lib/types";

interface LeaveRequestsClientProps {
    requests: AdminLeaveRequestRow[];
    totalCount: number;
    page: number;
    pageSize: number;
    initialStatus: LeaveStatus | "all";
    initialSearch: string;
    scopeSummary: string;
    statusCounts: {
        pending: number;
        approved: number;
        rejected: number;
    };
}

function formatDate(date: string) {
    return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function getDurationDays(startDate: string, endDate: string) {
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const diff = end.getTime() - start.getTime();
    return Math.max(1, Math.floor(diff / 86_400_000) + 1);
}

function StatusBadge({ status }: { status: LeaveStatus }) {
    if (status === "approved") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#34A853]/20 bg-[#34A853]/10 px-2.5 py-1 text-xs font-semibold text-[#34A853]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approved
            </span>
        );
    }

    if (status === "rejected") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400">
                <XCircle className="h-3.5 w-3.5" />
                Rejected
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-400">
            <Clock className="h-3.5 w-3.5" />
            Pending
        </span>
    );
}

export default function LeaveRequestsClient({
    requests,
    totalCount,
    page,
    pageSize,
    initialStatus,
    initialSearch,
    scopeSummary,
    statusCounts,
}: LeaveRequestsClientProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [search, setSearch] = useState(initialSearch);
    const [reviewNoteById, setReviewNoteById] = useState<Record<string, string>>({});
    const [actionError, setActionError] = useState<string | null>(null);
    const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    const setQuery = (updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(updates).forEach(([key, value]) => {
            if (!value) params.delete(key);
            else params.set(key, value);
        });
        params.delete("page");
        router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    };

    const goToPage = (nextPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", String(nextPage));
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleReview = (requestId: string, status: "approved" | "rejected") => {
        setActionError(null);
        setActiveReviewId(requestId);
        const formData = new FormData();
        formData.set("requestId", requestId);
        formData.set("status", status);
        formData.set("reviewNote", reviewNoteById[requestId] || "");

        startTransition(async () => {
            const result = await reviewLeaveRequest(formData);
            if (result.error) {
                setActionError(result.error);
                setActiveReviewId(null);
                return;
            }
            setReviewNoteById((current) => ({ ...current, [requestId]: "" }));
            setActiveReviewId(null);
            router.refresh();
        });
    };

    return (
        <div className="mx-auto w-full max-w-7xl space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#34A853]">
                        {scopeSummary}
                    </p>
                    <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
                        Leave Requests
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-white/50">
                        Review and manage time-off requests within your authorized scope.
                    </p>
                </div>

                <div className="grid grid-cols-3 gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-[#101010]">
                    <button
                        onClick={() => setQuery({ status: null })}
                        className={`rounded-xl px-4 py-3 text-center transition-all ${
                            initialStatus === "pending"
                                ? "bg-orange-500/20 ring-1 ring-orange-500/40"
                                : "bg-orange-500/10 hover:bg-orange-500/15"
                        }`}
                    >
                        <p className="text-lg font-bold text-orange-500">{statusCounts.pending}</p>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Pending</p>
                    </button>
                    <button
                        onClick={() => setQuery({ status: "approved" })}
                        className={`rounded-xl px-4 py-3 text-center transition-all ${
                            initialStatus === "approved"
                                ? "bg-[#34A853]/20 ring-1 ring-[#34A853]/40"
                                : "bg-[#34A853]/10 hover:bg-[#34A853]/15"
                        }`}
                    >
                        <p className="text-lg font-bold text-[#34A853]">{statusCounts.approved}</p>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Approved</p>
                    </button>
                    <button
                        onClick={() => setQuery({ status: "rejected" })}
                        className={`rounded-xl px-4 py-3 text-center transition-all ${
                            initialStatus === "rejected"
                                ? "bg-red-500/20 ring-1 ring-red-500/40"
                                : "bg-red-500/10 hover:bg-red-500/15"
                        }`}
                    >
                        <p className="text-lg font-bold text-red-400">{statusCounts.rejected}</p>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Rejected</p>
                    </button>
                </div>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#0f0f0f]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                        {(["pending", "all", "approved", "rejected"] as const).map((status) => (
                            <button
                                key={status}
                                onClick={() => setQuery({ status: status === "pending" ? null : status })}
                                className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition-colors ${
                                    initialStatus === status
                                        ? "bg-[#34A853] text-white"
                                        : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10"
                                }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>

                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            setQuery({ search: search.trim() || null });
                        }}
                        className="flex w-full gap-2 lg:max-w-md"
                    >
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search worker, department, team, ID..."
                                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-[#34A853] focus:ring-2 focus:ring-[#34A853]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                            />
                        </div>
                        <button className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-white/80">
                            Search
                        </button>
                    </form>
                </div>
            </div>

            {actionError && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm font-medium text-red-400">
                    {actionError}
                </div>
            )}

            <div className="space-y-4">
                {requests.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-white/10 dark:bg-[#0f0f0f]">
                        <CalendarDays className="mx-auto h-10 w-10 text-neutral-400" />
                        <h2 className="mt-4 text-lg font-bold text-neutral-900 dark:text-white">No leave requests found</h2>
                        <p className="mt-1 text-sm text-neutral-500 dark:text-white/50">
                            New requests submitted by workers in your scope will appear here.
                        </p>
                    </div>
                ) : (
                    requests.map((request) => {
                        const requesterName = request.requester
                            ? `${request.requester.first_name || ""} ${request.requester.last_name || ""}`.trim() || "Unknown worker"
                            : "Unknown worker";
                        const duration = getDurationDays(request.start_date, request.end_date);
                        const isReviewingThis = isPending && activeReviewId === request.id;

                        return (
                            <article
                                key={request.id}
                                className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-[#34A853]/30 dark:border-white/10 dark:bg-[#0f0f0f]"
                            >
                                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="flex gap-4">
                                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-[#34A853]/10 text-[#34A853]">
                                            {request.requester?.avatar_url ? (
                                                <Image src={request.requester.avatar_url} alt={requesterName} fill unoptimized className="object-cover" sizes="48px" />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center">
                                                    <UserRound className="h-6 w-6" />
                                                </div>
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="text-lg font-bold text-neutral-900 dark:text-white">{requesterName}</h2>
                                                <StatusBadge status={request.status} />
                                            </div>
                                            <p className="mt-1 text-sm text-neutral-500 dark:text-white/50">
                                                {request.requester?.worker_id || "No worker ID"} · {request.requester?.department || "No department"} · {request.requester?.team || "No team"}
                                            </p>
                                            <div className="mt-4 grid gap-3 text-sm text-neutral-600 dark:text-white/60 sm:grid-cols-3">
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Leave Type</p>
                                                    <p className="mt-1 font-semibold text-neutral-900 dark:text-white">{request.leave_type}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Dates</p>
                                                    <p className="mt-1 font-semibold text-neutral-900 dark:text-white">
                                                        {formatDate(request.start_date)} — {formatDate(request.end_date)}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Duration</p>
                                                    <p className="mt-1 font-semibold text-neutral-900 dark:text-white">
                                                        {duration} day{duration === 1 ? "" : "s"}
                                                    </p>
                                                </div>
                                            </div>
                                            <p className="mt-4 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-white/60">
                                                {request.reason}
                                            </p>
                                            {request.reviewed_at && (
                                                <p className="mt-3 text-xs text-neutral-500 dark:text-white/40">
                                                    Reviewed {new Date(request.reviewed_at).toLocaleString()} by{" "}
                                                    {request.reviewer
                                                        ? `${request.reviewer.first_name} ${request.reviewer.last_name}`.trim()
                                                        : "an admin"}
                                                    {request.review_note ? ` — ${request.review_note}` : ""}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {request.status === "pending" && (
                                        <div className="w-full shrink-0 space-y-3 lg:w-80">
                                            <textarea
                                                value={reviewNoteById[request.id] || ""}
                                                onChange={(event) => setReviewNoteById((current) => ({ ...current, [request.id]: event.target.value }))}
                                                maxLength={500}
                                                placeholder="Optional review note..."
                                                className="h-24 w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 p-3 text-sm outline-none transition focus:border-[#34A853] focus:ring-2 focus:ring-[#34A853]/20 dark:border-white/10 dark:bg-white/5 dark:text-white"
                                            />
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => handleReview(request.id, "rejected")}
                                                    disabled={isPending}
                                                    className="flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-400 transition hover:bg-red-500/15 disabled:opacity-50"
                                                >
                                                    {isReviewingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                                    Reject
                                                </button>
                                                <button
                                                    onClick={() => handleReview(request.id, "approved")}
                                                    disabled={isPending}
                                                    className="flex items-center justify-center gap-2 rounded-xl bg-[#34A853] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#2e9347] disabled:opacity-50"
                                                >
                                                    {isReviewingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                                    Approve
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </article>
                        );
                    })
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-3 dark:border-white/10 dark:bg-[#0f0f0f]">
                    <p className="text-sm text-neutral-500 dark:text-white/50">
                        Page {page} of {totalPages} · {totalCount} request{totalCount === 1 ? "" : "s"}
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => goToPage(page - 1)}
                            disabled={page <= 1}
                            className="rounded-xl border border-neutral-200 p-2 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => goToPage(page + 1)}
                            disabled={page >= totalPages}
                            className="rounded-xl border border-neutral-200 p-2 text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-40 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/5"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
