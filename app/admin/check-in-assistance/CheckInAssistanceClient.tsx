"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useTransition } from "react";
import {
  CheckCircle2,
  CircleHelp,
  Clock3,
  ExternalLink,
  Loader2,
  MapPin,
  ShieldAlert,
  XCircle,
  Navigation,
  Trash2,
  Info,
  Calendar,
  AlertTriangle,
  MessageSquare,
  Send,
  Check,
} from "lucide-react";
import type { CheckInAssistanceRequest } from "@/lib/types";
import {
  acknowledgeCheckInAssistance,
  closeCheckInAssistance,
  verifyAndProxyCheckIn,
  clearFinishedCheckInAssistance,
  sendLeaderNote,
} from "./actions";
import { getVicinityName } from "@/lib/reverse-geocoding";

interface Props {
  initialRequests: CheckInAssistanceRequest[];
  highlightedRequestId: string | null;
}

const statusConfig: Record<
  CheckInAssistanceRequest["status"],
  { label: string; badgeClass: string; dotClass: string }
> = {
  open: {
    label: "Open · Needs Review",
    badgeClass: "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400",
    dotClass: "bg-rose-500 animate-ping",
  },
  acknowledged: {
    label: "Leader Reviewing",
    badgeClass: "border-sky-500/25 bg-sky-500/10 text-sky-600 dark:text-sky-400",
    dotClass: "bg-sky-500 animate-pulse",
  },
  resolved: {
    label: "Resolved · Checked In",
    badgeClass: "border-[#34A853]/25 bg-[#34A853]/10 text-[#34A853]",
    dotClass: "bg-[#34A853]",
  },
  dismissed: {
    label: "Dismissed",
    badgeClass: "border-neutral-400/25 bg-neutral-400/10 text-neutral-500 dark:text-neutral-400",
    dotClass: "bg-neutral-400",
  },
  expired: {
    label: "Expired (Session Ended)",
    badgeClass: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dotClass: "bg-amber-500",
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(value));
}

function getInitials(name: string) {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function diagnosticLabel(value: CheckInAssistanceRequest["reported_status"]) {
  if (value === "low_accuracy") return "GPS accuracy was too low";
  if (value === "not_confirmed") return "Venue location was not confirmed";
  return "Location service was unavailable";
}

function extractCoordsAndMessage(rawMessage: string | null) {
  if (!rawMessage) return { lat: null, lng: null, cleanMessage: null };
  const match = rawMessage.match(/\[Coords:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\]/);
  if (!match) return { lat: null, lng: null, cleanMessage: rawMessage };
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  const cleanMessage = rawMessage.replace(/\[Coords:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\]/, "").trim();
  return { lat, lng, cleanMessage: cleanMessage || null };
}

const DISMISS_PRESETS = [
  "Verified physical presence & checked in",
  "You are not presently at the church venue",
  "Outside geofence area. Please report to attendance desk",
];

export default function CheckInAssistanceClient({
  initialRequests,
  highlightedRequestId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<{
    id: string;
    action: "verify" | "dismiss" | "acknowledge" | "send-note";
  } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteSentId, setNoteSentId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [isClearing, setIsClearing] = useState(false);
  const [vicinities, setVicinities] = useState<Record<string, string>>({});
  const [resolvingVicinities, setResolvingVicinities] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let isMounted = true;
    async function resolveAll() {
      for (const req of initialRequests) {
        if (!isMounted) break;
        const { lat, lng } = extractCoordsAndMessage(req.worker_message);
        if (lat !== null && lng !== null && !vicinities[req.id]) {
          setResolvingVicinities((prev) => ({ ...prev, [req.id]: true }));
          try {
            const name = await getVicinityName(lat, lng);
            if (isMounted && name) {
              setVicinities((prev) => ({ ...prev, [req.id]: name }));
            }
          } finally {
            if (isMounted) {
              setResolvingVicinities((prev) => ({ ...prev, [req.id]: false }));
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    }
    resolveAll();
    return () => {
      isMounted = false;
    };
  }, [initialRequests]);

  const activeCount = initialRequests.filter(
    (item) => item.status === "open" || item.status === "acknowledged"
  ).length;

  const finishedCount = initialRequests.filter(
    (item) => item.status === "resolved" || item.status === "dismissed" || item.status === "expired"
  ).length;

  const filteredRequests = statusFilter === "active"
    ? initialRequests.filter((item) => item.status === "open" || item.status === "acknowledged")
    : initialRequests;

  const acknowledge = (requestId: string) => {
    setPendingAction({ id: requestId, action: "acknowledge" });
    setErrors((current) => ({ ...current, [requestId]: "" }));
    startTransition(async () => {
      try {
        const note = notes[requestId]?.trim() || undefined;
        const result = await acknowledgeCheckInAssistance(requestId, note);
        if (result.error) {
          setErrors((current) => ({ ...current, [requestId]: result.error ?? "Request failed." }));
          return;
        }
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleVerifyAndCheckIn = (requestId: string) => {
    setPendingAction({ id: requestId, action: "verify" });
    setErrors((current) => ({ ...current, [requestId]: "" }));
    startTransition(async () => {
      try {
        const customNote = notes[requestId]?.trim() || "Verified physical presence at venue & checked in by Leader";
        const result = await verifyAndProxyCheckIn(requestId, customNote);
        if (result.error) {
          setErrors((current) => ({ ...current, [requestId]: result.error ?? "Failed to check in worker." }));
          return;
        }
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleSendNote = (requestId: string) => {
    const note = (notes[requestId] ?? "").trim();
    if (!note) return;

    setPendingAction({ id: requestId, action: "send-note" });
    setErrors((current) => ({ ...current, [requestId]: "" }));
    startTransition(async () => {
      try {
        const result = await sendLeaderNote(requestId, note);
        if (result.error) {
          setErrors((current) => ({ ...current, [requestId]: result.error ?? "Failed to send note." }));
          return;
        }
        setNoteSentId(requestId);
        setTimeout(() => {
          setNoteSentId((prev) => (prev === requestId ? null : prev));
        }, 3500);
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  };

  const closeWithStatus = (requestId: string, status: "resolved" | "dismissed") => {
    const defaultNote = status === "dismissed"
      ? "You are not presently at the church venue based on GPS reading."
      : "Verified and resolved by Leader";

    const note = (notes[requestId] ?? "").trim() || defaultNote;
    const formData = new FormData();
    formData.set("requestId", requestId);
    formData.set("status", status);
    formData.set("resolutionNote", note);

    setPendingAction({ id: requestId, action: status === "dismissed" ? "dismiss" : "verify" });
    setErrors((current) => ({ ...current, [requestId]: "" }));
    startTransition(async () => {
      try {
        const result = await closeCheckInAssistance(formData);
        if (result.error) {
          setErrors((current) => ({ ...current, [requestId]: result.error ?? "Request failed." }));
          return;
        }
        router.refresh();
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleClearFinished = () => {
    if (!confirm("Clear all finished (resolved, dismissed, expired) assistance requests from the database?")) {
      return;
    }

    setIsClearing(true);
    startTransition(async () => {
      try {
        const res = await clearFinishedCheckInAssistance();
        if (res.error) {
          alert(res.error);
        } else {
          router.refresh();
        }
      } finally {
        setIsClearing(false);
      }
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full max-w-6xl mx-auto">
      {/* Pinned Top Header & Controls */}
      <div className="shrink-0 space-y-3 sm:space-y-4 mb-3 sm:mb-4">
        {/* Title, Counts & Clear Button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#34A853] bg-[#34A853]/10 px-2 py-0.5 rounded-md">
                Attendance Support
              </span>
              {activeCount > 0 && (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-rose-500 dark:text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  {activeCount} Action Needed
                </span>
              )}
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Check-in Help
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-2xl leading-relaxed">
              Verify worker location coordinates, view on Google Maps, and approve proxy check-in or dismiss with notes.
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {finishedCount > 0 && (
              <button
                type="button"
                onClick={handleClearFinished}
                disabled={isClearing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-300 transition hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
              >
                {isClearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Clear Finished ({finishedCount})
              </button>
            )}

            <div className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 shadow-sm">
              <span className={`h-2 w-2 rounded-full ${activeCount > 0 ? "bg-amber-500 animate-pulse" : "bg-[#34A853]"}`} />
              <span className="font-bold text-neutral-900 dark:text-white">{activeCount}</span>
              <span className="text-neutral-500 dark:text-neutral-400">active {activeCount === 1 ? "request" : "requests"}</span>
            </div>
          </div>
        </div>

        {/* Filter Pills and Helper Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                statusFilter === "active"
                  ? "bg-[#34A853] text-white shadow-sm"
                  : "border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10"
              }`}
            >
              Active Requests ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                statusFilter === "all"
                  ? "bg-[#34A853] text-white shadow-sm"
                  : "border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/10"
              }`}
            >
              All Requests ({initialRequests.length})
            </button>
          </div>

          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] sm:text-xs text-amber-700 dark:text-amber-200/90 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>Clicking <strong>Verify &amp; Check In</strong> automatically marks attendance for the worker.</span>
          </div>
        </div>
      </div>

      {/* Scrollable Requests Cards Queue */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 sm:pr-2 focus:outline-none">
        {filteredRequests.length === 0 ? (
          <div className="rounded-2xl sm:rounded-3xl border border-dashed border-neutral-300 dark:border-white/10 px-6 py-12 text-center bg-white/40 dark:bg-white/[0.01]">
            <CircleHelp className="mx-auto h-9 w-9 text-neutral-400" />
            <p className="mt-3 text-sm sm:text-base font-semibold text-neutral-800 dark:text-neutral-200">
              {statusFilter === "active" ? "No active check-in requests" : "No check-in requests found"}
            </p>
            <p className="mt-1 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
              {statusFilter === "active"
                ? "All worker check-in trouble requests have been resolved or dismissed."
                : "New requests will appear here when workers notify leaders during check-in."}
            </p>
          </div>
        ) : (
          filteredRequests.map((request) => {
            const isActive = request.status === "open" || request.status === "acknowledged";
            const isHighlighted = request.id === highlightedRequestId;
            const isRowPending = isPending && pendingAction?.id === request.id;
            const { lat, lng, cleanMessage } = extractCoordsAndMessage(request.worker_message);
            const cfg = statusConfig[request.status];

            return (
              <article
                key={request.id}
                className={`rounded-2xl sm:rounded-3xl border bg-white dark:bg-[#111113] p-4 sm:p-5 shadow-sm transition hover:shadow-md ${
                  isHighlighted
                    ? "border-blue-500 ring-4 ring-blue-500/10"
                    : "border-neutral-200 dark:border-white/10"
                }`}
              >
                {/* Worker Header Info */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-xl bg-[#34A853]/15 text-[#34A853] border border-[#34A853]/25 flex items-center justify-center font-bold text-sm shrink-0 mt-0.5">
                      {getInitials(request.worker_name)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-white leading-tight">
                          {request.worker_name}
                        </h2>
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${cfg.badgeClass}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} />
                          {cfg.label}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                        {request.worker_code && (
                          <span className="font-mono bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-white/80 px-1.5 py-0.5 rounded text-[11px]">
                            {request.worker_code}
                          </span>
                        )}
                        {request.department_name && (
                          <span className="font-medium text-neutral-600 dark:text-neutral-300">
                            {request.department_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-white/40 shrink-0 self-start sm:self-auto">
                    <Clock3 className="h-3.5 w-3.5" />
                    <span>{formatDate(request.created_at)}</span>
                  </div>
                </div>

                {/* Event & Reported Issue Strip */}
                <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-xl border border-neutral-200/80 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.03] p-3 flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-neutral-200/60 dark:bg-white/10 flex items-center justify-center shrink-0">
                      <Calendar className="h-3.5 w-3.5 text-neutral-600 dark:text-white/70" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-white/40 block">Event</span>
                      <p className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white truncate" title={request.event_title}>
                        {request.event_title}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-neutral-200/80 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.03] p-3 flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-neutral-200/60 dark:bg-white/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="h-3.5 w-3.5 text-neutral-600 dark:text-white/70" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-white/40 block">Reported Problem</span>
                      <p className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white">
                        {diagnosticLabel(request.reported_status)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Worker GPS & Google Maps Location Verification */}
                {lat !== null && lng !== null ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Navigation className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                          GPS: {lat.toFixed(5)}, {lng.toFixed(5)}
                        </span>
                        {request.reported_accuracy_meters !== null && (
                          <span className="text-neutral-500 dark:text-neutral-400">
                            (±{Math.round(request.reported_accuracy_meters)}m)
                          </span>
                        )}

                        {/* Human-readable Vicinity Name */}
                        {vicinities[request.id] ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                            <MapPin className="h-3 w-3 text-blue-500 shrink-0" />
                            <span>Near {vicinities[request.id]}</span>
                          </span>
                        ) : resolvingVicinities[request.id] ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-neutral-300/30 bg-neutral-500/10 px-2 py-0.5 text-[10px] text-neutral-500">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            <span>Finding vicinity…</span>
                          </span>
                        ) : null}

                        {/* Nearest assigned venue distance */}
                        {request.nearest_location_name && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              (request.nearest_distance_meters ?? 9999) <= 250
                                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            }`}
                          >
                            <MapPin className="h-3 w-3" />
                            {request.nearest_distance_meters !== null
                              ? request.nearest_distance_meters <= 250
                                ? `Near venue (~${Math.round(request.nearest_distance_meters)}m from ${request.nearest_location_name})`
                                : `Off-site (~${
                                    request.nearest_distance_meters > 1000
                                      ? `${(request.nearest_distance_meters / 1000).toFixed(1)}km`
                                      : `${Math.round(request.nearest_distance_meters)}m`
                                  } from ${request.nearest_location_name})`
                              : request.nearest_location_name}
                          </span>
                        )}
                      </div>
                      <a
                        href={`https://www.google.com/maps?q=${lat},${lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-600 dark:text-blue-400 transition hover:bg-blue-500/20 shrink-0"
                      >
                        <span>View on Google Maps</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ) : (
                  (request.reported_accuracy_meters !== null || request.nearest_location_name) && (
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-neutral-500">
                      {request.reported_accuracy_meters !== null && (
                        <span>Reported accuracy: ~{Math.round(request.reported_accuracy_meters)}m</span>
                      )}
                      {request.nearest_location_name && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          Nearest assigned venue: {request.nearest_location_name}
                          {request.nearest_distance_meters !== null
                            ? ` (~${Math.round(request.nearest_distance_meters)}m)`
                            : ""}
                        </span>
                      )}
                    </div>
                  )
                )}

                {/* Worker Message */}
                {cleanMessage && (
                  <div className="mt-3 rounded-xl border border-neutral-200/80 dark:border-white/5 bg-neutral-50 dark:bg-white/[0.02] p-3 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1">
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Worker Note:</span>
                    </div>
                    <p className="italic leading-relaxed text-neutral-800 dark:text-neutral-200">
                      &ldquo;{cleanMessage}&rdquo;
                    </p>
                  </div>
                )}

                {/* Existing Outcome/Resolution Note */}
                {request.resolution_note && (
                  <div
                    className={`mt-3 rounded-xl border p-3 text-xs sm:text-sm ${
                      request.status === "resolved"
                        ? "border-[#34A853]/25 bg-[#34A853]/10 text-neutral-800 dark:text-neutral-200"
                        : "border-amber-500/25 bg-amber-500/10 text-neutral-800 dark:text-neutral-200"
                    }`}
                  >
                    <span className="font-semibold">
                      {request.status === "resolved" ? "Resolution Note:" : "Dismissal Note Sent to Worker:"}
                    </span>{" "}
                    {request.resolution_note}
                    {request.resolved_at && (
                      <span className="block mt-1 text-[11px] opacity-70">
                        {formatDate(request.resolved_at)}
                      </span>
                    )}
                  </div>
                )}

                {errors[request.id] && (
                  <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-500">
                    {errors[request.id]}
                  </div>
                )}

                {/* Active Leader Action Panel */}
                {isActive && (
                  <div className="mt-4 border-t border-neutral-200 dark:border-white/10 pt-3.5 space-y-3">
                    <div>
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor={`resolution-${request.id}`}
                          className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
                        >
                          Leader Note (visible on worker&apos;s dashboard)
                        </label>
                        {noteSentId === request.id && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#34A853] animate-pulse">
                            <Check className="h-3.5 w-3.5" /> Note sent to worker!
                          </span>
                        )}
                      </div>

                      <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                        Notes written here appear directly on the worker&apos;s dashboard. Click &ldquo;Send Note&rdquo; to send immediately, or perform an action below.
                      </p>

                      {/* Quick Presets */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] text-neutral-400 font-medium mr-1">Quick note:</span>
                        {DISMISS_PRESETS.map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() =>
                              setNotes((current) => ({ ...current, [request.id]: preset }))
                            }
                            className="rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-100 dark:bg-white/5 px-2 py-0.5 text-[11px] text-neutral-600 dark:text-neutral-300 transition hover:bg-neutral-200 dark:hover:bg-white/10"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>

                      <div className="mt-2 flex flex-col sm:flex-row gap-2">
                        <textarea
                          id={`resolution-${request.id}`}
                          value={notes[request.id] ?? ""}
                          onChange={(event) =>
                            setNotes((current) => ({ ...current, [request.id]: event.target.value }))
                          }
                          maxLength={500}
                          rows={2}
                          placeholder="Write a note to worker (e.g. 'Verified physical presence at venue' or 'Outside venue boundary')."
                          className="flex-1 resize-none rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/20 p-2.5 text-xs sm:text-sm outline-none transition focus:border-[#34A853] focus:ring-2 focus:ring-[#34A853]/15"
                        />
                        <button
                          type="button"
                          onClick={() => handleSendNote(request.id)}
                          disabled={isRowPending || !notes[request.id]?.trim()}
                          className="self-stretch sm:self-end shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-neutral-900 dark:bg-white/10 hover:bg-neutral-800 dark:hover:bg-white/20 text-white px-3.5 py-2.5 text-xs font-bold transition disabled:opacity-40"
                          title="Send note to worker's dashboard"
                        >
                          {isRowPending && pendingAction?.action === "send-note" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          <span>Send Note</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                      {/* Verify & Check In Worker Button */}
                      <button
                        type="button"
                        onClick={() => handleVerifyAndCheckIn(request.id)}
                        disabled={isRowPending}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#34A853] px-3.5 py-2 text-xs sm:text-sm font-bold text-white transition hover:bg-[#2e9347] disabled:opacity-50 shadow-sm"
                      >
                        {isRowPending && pendingAction?.action === "verify" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Verify &amp; Check In Worker
                      </button>

                      {/* Dismiss Request Button */}
                      <button
                        type="button"
                        onClick={() => closeWithStatus(request.id, "dismissed")}
                        disabled={isRowPending}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 dark:border-white/10 px-3.5 py-2 text-xs sm:text-sm font-bold text-neutral-700 dark:text-neutral-300 transition hover:bg-neutral-100 dark:hover:bg-white/5 disabled:opacity-50"
                      >
                        {isRowPending && pendingAction?.action === "dismiss" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        {notes[request.id]?.trim() ? "Dismiss with Note" : "Dismiss Request"}
                      </button>

                      {/* Acknowledge Button */}
                      {request.status === "open" && (
                        <button
                          type="button"
                          onClick={() => acknowledge(request.id)}
                          disabled={isRowPending}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-blue-500 px-3.5 py-2 text-xs sm:text-sm font-bold text-white transition hover:bg-blue-400 disabled:opacity-50 shadow-sm"
                        >
                          {isRowPending && pendingAction?.action === "acknowledge" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ShieldAlert className="h-4 w-4" />
                          )}
                          Acknowledge
                        </button>
                      )}

                      <Link
                        href="/admin/sessions"
                        className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[#34A853] hover:underline"
                      >
                        <span>Live session</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
