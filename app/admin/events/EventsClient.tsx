"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2, X, AlertCircle, Loader2, Calendar, AlertTriangle, Clock, Repeat, Timer } from "lucide-react";
import { createEvent, updateEvent, deleteEvent } from "./actions";

type ScheduleFrequency = "once" | "daily" | "weekly" | "monthly" | "yearly";

type EventType = {
    id: string;
    title: string;
    description: string | null;
    recurrence_day: string | null;
    recurrence_month: number | null;
    recurrence_month_day: number | null;
    schedule_frequency: ScheduleFrequency | null;
    start_date: string | null;
    start_time: string | null;
    end_time: string | null;
    timezone: string | null;
    recurrence_rule: string | null;
    location_ids: string[] | null;
    department_id: string | null;
    created_by: string | null;
    created_at: string;
};

const defaultTimezone = "Africa/Lagos";
const recurrenceDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const monthOptions = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
];
const frequencyLabels: Record<ScheduleFrequency, string> = {
    once: "One-time",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
};

function getTodayDate() {
    return new Date().toISOString().slice(0, 10);
}

function getDatePart(value: string | null, part: "month" | "day") {
    const date = value || getTodayDate();
    const [, month, day] = date.split("-").map(Number);
    return part === "month" ? month : day;
}

function normalizeTime(value: string | null) {
    return value ? value.slice(0, 5) : "09:00";
}

function normalizeEndTime(value: string | null) {
    return value ? value.slice(0, 5) : "11:00";
}

function formatScheduleDate(value: string | null) {
    if (!value) return "Not scheduled";
    return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function formatScheduleTime(value: string | null) {
    if (!value) return "09:00";
    const [hours, minutes] = normalizeTime(value).split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
    });
}

function formatTimeRange(event: EventType) {
    return `${formatScheduleTime(event.start_time)} - ${formatScheduleTime(event.end_time || "11:00")}`;
}

function getFrequency(event: EventType): ScheduleFrequency {
    if (event.schedule_frequency) return event.schedule_frequency;
    return event.recurrence_day ? "weekly" : "once";
}

function getScheduleSummary(event: EventType) {
    const frequency = getFrequency(event);
    if (frequency === "once") return `One-time on ${formatScheduleDate(event.start_date)}`;
    if (frequency === "daily") return "Repeats every day";
    if (frequency === "weekly") return event.recurrence_day ? `Repeats every ${event.recurrence_day}` : "Repeats weekly";
    if (frequency === "monthly") return event.recurrence_month_day ? `Repeats on day ${event.recurrence_month_day} of every month` : "Repeats monthly";
    if (event.recurrence_month && event.recurrence_month_day) {
        const month = monthOptions.find((option) => option.value === event.recurrence_month)?.label;
        return `Repeats every ${month} ${event.recurrence_month_day}`;
    }
    return "Repeats yearly";
}

function getStartDateLabel(frequency: ScheduleFrequency) {
    if (frequency === "once") return "Event Date";
    return "Schedule Starts";
}

function getStartDateHint(frequency: ScheduleFrequency) {
    if (frequency === "once") return "The exact date this event holds.";
    return "The schedule becomes active from this date.";
}

function getRuleLabel(frequency: ScheduleFrequency) {
    if (frequency === "daily") return "Every day";
    if (frequency === "weekly") return "Repeats on a weekday";
    if (frequency === "monthly") return "Repeats on a day of the month";
    if (frequency === "yearly") return "Repeats on a month and day";
    return "Single event";
}

export type LocationBasic = {
    id: string;
    name: string;
};

type ManagedDepartment = {
    id: string;
    name: string;
};

export default function EventsClient({ initialEvents, activeLocations, isSuperAdmin, managedDepartments, activeEventIds = [] }: {
    initialEvents: EventType[],
    activeLocations: LocationBasic[],
    isSuperAdmin: boolean,
    managedDepartments: ManagedDepartment[],
    activeEventIds?: string[],
}) {
    const router = useRouter();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<EventType | null>(null);
    const [scheduleFrequency, setScheduleFrequency] = useState<ScheduleFrequency>("weekly");
    const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // For deleting
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [eventToDelete, setEventToDelete] = useState<EventType | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const formRef = useRef<HTMLFormElement>(null);
    const cancelDeleteButtonRef = useRef<HTMLButtonElement>(null);

    const closeDeleteModal = useCallback(() => {
        if (deletingId) return;
        setEventToDelete(null);
        setDeleteError(null);
    }, [deletingId]);

    useEffect(() => {
        if (!eventToDelete) return;

        cancelDeleteButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !deletingId) {
                closeDeleteModal();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [eventToDelete, deletingId, closeDeleteModal]);

    const openCreateModal = () => {
        setEditingEvent(null);
        setScheduleFrequency("weekly");
        setSelectedLocations([]);
        setSelectedDepartmentId(!isSuperAdmin && managedDepartments.length === 1 ? managedDepartments[0].id : "");
        setError(null);
        setIsModalOpen(true);
    };

    const openEditModal = (event: EventType) => {
        setEditingEvent(event);
        setScheduleFrequency(getFrequency(event));
        setSelectedLocations(event.location_ids || []);
        setSelectedDepartmentId(event.department_id || "");
        setError(null);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        if (isSubmitting) return;
        setIsModalOpen(false);
        setEditingEvent(null);
        setError(null);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (selectedLocations.length === 0) {
            setError("You must select at least one location.");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        // Append selected locations as JSON
        formData.append("location_ids", JSON.stringify(selectedLocations));
        // Append selected department
        if (selectedDepartmentId) {
            formData.append("department_id", selectedDepartmentId);
        }

        let result;
        if (editingEvent) {
            result = await updateEvent(editingEvent.id, formData);
        } else {
            result = await createEvent(formData);
        }

        if (result.error) {
            setError(result.error);
            setIsSubmitting(false);
        } else {
            setIsSubmitting(false);
            closeModal();
            router.refresh();
        }
    };

    const handleDelete = (event: EventType) => {
        setEventToDelete(event);
        setDeleteError(null);
    };

    const confirmDelete = async () => {
        if (!eventToDelete) return;

        setDeletingId(eventToDelete.id);
        setDeleteError(null);
        const result = await deleteEvent(eventToDelete.id);

        if (result.error) {
            setDeleteError(result.error);
            setDeletingId(null);
        } else {
            setDeletingId(null);
            setEventToDelete(null);
            router.refresh();
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Event Types</h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                        Manage scheduled events where attendance will be taken.
                    </p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 bg-[#34A853] hover:bg-[#2b8a44] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Create Event
                </button>
            </div>

            {/* Events Grid */}
            {initialEvents.length === 0 ? (
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-white/5 flex items-center justify-center text-neutral-400 mb-4">
                        <Calendar className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">No Events Found</h3>
                    <p className="text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto mb-6">
                        You haven&apos;t created any scheduled events yet. Create your first event to start taking attendance.
                    </p>
                    <button
                        onClick={openCreateModal}
                        className="text-[#34A853] font-medium hover:underline"
                    >
                        + Create your first event
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {initialEvents.map((event) => {
                        const isLive = activeEventIds.includes(event.id);
                        return (
                            <div
                                key={event.id}
                                className={`bg-white dark:bg-neutral-900 border rounded-2xl p-6 shadow-sm flex flex-col group transition-all ${
                                    isLive ? "border-red-500/30 dark:border-red-500/30" : "border-neutral-200 dark:border-white/10"
                                }`}
                            >
                                <div className="flex-1">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <h3 className="font-semibold text-lg text-neutral-900 dark:text-white line-clamp-1">
                                            {event.title}
                                        </h3>
                                        {isLive && (
                                            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-bold text-red-500 shrink-0 animate-pulse">
                                                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                                LIVE
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-3">
                                        {event.description || "No description provided."}
                                    </p>
                                    <div className="mt-5 space-y-3">
                                        <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                                            <Clock className="w-4 h-4 text-[#34A853]" />
                                            <span>{formatScheduleDate(event.start_date)} · {formatTimeRange(event)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                                            <Repeat className="w-4 h-4 text-[#34A853]" />
                                            <span>{getScheduleSummary(event)}</span>
                                        </div>
                                        <div className="inline-flex items-center gap-1.5 rounded-full bg-[#34A853]/10 px-3 py-1 text-xs font-semibold text-[#34A853]">
                                            <Timer className="w-3.5 h-3.5" />
                                            {frequencyLabels[getFrequency(event)]}
                                        </div>
                                        {event.department_id && (
                                            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-500 dark:text-blue-400 ml-2">
                                                {managedDepartments.find(d => d.id === event.department_id)?.name || "Dept Event"}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-6 pt-6 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between">
                                    <span className="text-xs text-neutral-400">
                                        Added {new Date(event.created_at).toLocaleDateString()}
                                    </span>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => {
                                                if (isLive) {
                                                    alert("Cannot edit this event while a live session is active. Extend time from the Live Session controller instead.");
                                                    return;
                                                }
                                                openEditModal(event);
                                            }}
                                            disabled={isLive}
                                            className={`p-2 rounded-lg transition-colors ${
                                                isLive
                                                    ? "text-neutral-300 dark:text-neutral-600 cursor-not-allowed"
                                                    : "text-neutral-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10"
                                            }`}
                                            title={isLive ? "Cannot edit event while a live session is active" : "Edit Event"}
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (isLive) {
                                                    alert("Cannot delete this event while a live session is active. Please end the live session first.");
                                                    return;
                                                }
                                                handleDelete(event);
                                            }}
                                            disabled={isLive || deletingId === event.id}
                                            className={`p-2 rounded-lg transition-colors ${
                                                isLive
                                                    ? "text-neutral-300 dark:text-neutral-600 cursor-not-allowed"
                                                    : "text-neutral-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                                            }`}
                                            title={isLive ? "Cannot delete event while a live session is active" : "Delete Event"}
                                            aria-label={`Delete ${event.title}`}
                                        >
                                            {deletingId === event.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Create/Edit Modal */}
            <AnimatePresence>
                {isModalOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeModal}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                        />
                        <div className="fixed inset-0 flex items-center justify-center z-[101] p-4 pointer-events-none">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="event-form-title"
                                className="w-full max-w-2xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl shadow-xl pointer-events-auto flex flex-col max-h-[90vh]"
                            >
                                <div className="p-4 sm:p-6 border-b border-neutral-100 dark:border-white/10 flex items-center justify-between shrink-0">
                                    <h2 id="event-form-title" className="text-lg sm:text-xl font-semibold text-neutral-900 dark:text-white">
                                        {editingEvent ? "Edit Event" : "Create Event"}
                                    </h2>
                                    <button
                                        onClick={closeModal}
                                        className="p-1.5 sm:p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <form ref={formRef} onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto">
                                    {error && (
                                        <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-start gap-3">
                                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                                                {error}
                                            </p>
                                        </div>
                                    )}

                                    <div className="space-y-5">
                                        <div>
                                            <label htmlFor="title" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                Event Title <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                id="title"
                                                name="title"
                                                required
                                                defaultValue={editingEvent?.title}
                                                placeholder="e.g. Sunday Service"
                                                className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white placeholder:text-neutral-400"
                                            />
                                        </div>

                                        <div>
                                            <label htmlFor="description" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                Description <span className="text-neutral-400 font-normal">(Optional)</span>
                                            </label>
                                            <textarea
                                                id="description"
                                                name="description"
                                                defaultValue={editingEvent?.description || ""}
                                                placeholder="A brief description of this event..."
                                                rows={4}
                                                className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white placeholder:text-neutral-400 resize-none"
                                            />
                                        </div>

                                        {/* Department Selector */}
                                        {managedDepartments.length > 0 && (
                                            <div>
                                                <label htmlFor="event_department" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                    Department {!isSuperAdmin && <span className="text-red-500">*</span>}
                                                    {isSuperAdmin && <span className="text-neutral-400 font-normal"> (Optional — leave blank for global event)</span>}
                                                </label>
                                                <select
                                                    id="event_department"
                                                    value={selectedDepartmentId}
                                                    onChange={(e) => setSelectedDepartmentId(e.target.value)}
                                                    required={!isSuperAdmin}
                                                    className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white"
                                                >
                                                    {isSuperAdmin && <option value="">Global Event (All Departments)</option>}
                                                    {!isSuperAdmin && managedDepartments.length > 1 && <option value="" disabled>-- Select Department --</option>}
                                                    {managedDepartments.map((dept) => (
                                                        <option key={dept.id} value={dept.id}>
                                                            {dept.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-black/40 p-4">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="w-9 h-9 rounded-full bg-[#34A853]/10 text-[#34A853] flex items-center justify-center">
                                                    <Calendar className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Event Schedule</h3>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label htmlFor="schedule_frequency" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                        Occurs <span className="text-red-500">*</span>
                                                    </label>
                                                    <select
                                                        id="schedule_frequency"
                                                        name="schedule_frequency"
                                                        value={scheduleFrequency}
                                                        onChange={(event) => setScheduleFrequency(event.target.value as ScheduleFrequency)}
                                                        className="w-full px-4 py-2.5 bg-white dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white"
                                                    >
                                                        <option value="once">Once</option>
                                                        <option value="daily">Every day</option>
                                                        <option value="weekly">Every week</option>
                                                        <option value="monthly">Every month</option>
                                                        <option value="yearly">Every year</option>
                                                    </select>
                                                </div>

                                                <div>
                                                    <label htmlFor="timezone" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                        Timezone <span className="text-red-500">*</span>
                                                    </label>
                                                    <select
                                                        id="timezone"
                                                        name="timezone"
                                                        defaultValue={editingEvent?.timezone || defaultTimezone}
                                                        className="w-full px-4 py-2.5 bg-white dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white"
                                                    >
                                                        <option value="Africa/Lagos">Africa/Lagos</option>
                                                        <option value="UTC">UTC</option>
                                                    </select>
                                                </div>

                                                <div>
                                                    <label htmlFor="start_date" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                        {getStartDateLabel(scheduleFrequency)} <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="date"
                                                        id="start_date"
                                                        name="start_date"
                                                        required
                                                        defaultValue={editingEvent?.start_date || getTodayDate()}
                                                        className="w-full px-4 py-2.5 bg-white dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white"
                                                    />
                                                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                                                        {getStartDateHint(scheduleFrequency)}
                                                    </p>
                                                </div>

                                                <div>
                                                    <label htmlFor="start_time" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                        Start Time <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="time"
                                                        id="start_time"
                                                        name="start_time"
                                                        required
                                                        defaultValue={normalizeTime(editingEvent?.start_time || null)}
                                                        className="w-full px-4 py-2.5 bg-white dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white"
                                                    />
                                                </div>

                                                <div>
                                                    <label htmlFor="end_time" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                        End Time <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="time"
                                                        id="end_time"
                                                        name="end_time"
                                                        required
                                                        defaultValue={normalizeEndTime(editingEvent?.end_time || null)}
                                                        className="w-full px-4 py-2.5 bg-white dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white"
                                                    />
                                                </div>

                                                <div className="sm:col-span-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-black p-4">
                                                    <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-neutral-900 dark:text-white">
                                                        <Repeat className="w-4 h-4 text-[#34A853]" />
                                                        {getRuleLabel(scheduleFrequency)}
                                                    </div>

                                                    {scheduleFrequency === "once" && (
                                                        <input type="hidden" name="recurrence_month_day" value="" />
                                                    )}

                                                    {scheduleFrequency === "daily" && (
                                                        <input type="hidden" name="recurrence_month_day" value="" />
                                                    )}

                                                    {scheduleFrequency === "weekly" && (
                                                        <div>
                                                            <label htmlFor="recurrence_day" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                                Weekday <span className="text-red-500">*</span>
                                                            </label>
                                                            <select
                                                                id="recurrence_day"
                                                                name="recurrence_day"
                                                                defaultValue={editingEvent?.recurrence_day || "Sunday"}
                                                                className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white"
                                                            >
                                                                {recurrenceDays.map((day) => (
                                                                    <option key={day} value={day}>
                                                                        {day}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}

                                                    {scheduleFrequency === "monthly" && (
                                                        <div>
                                                            <label htmlFor="recurrence_month_day" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                                Day of Month <span className="text-red-500">*</span>
                                                            </label>
                                                            <select
                                                                id="recurrence_month_day"
                                                                name="recurrence_month_day"
                                                                defaultValue={editingEvent?.recurrence_month_day || getDatePart(editingEvent?.start_date || null, "day")}
                                                                className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white"
                                                            >
                                                                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                                                                    <option key={day} value={day}>
                                                                        Day {day}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}

                                                    {scheduleFrequency === "yearly" && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            <div>
                                                                <label htmlFor="recurrence_month" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                                    Month <span className="text-red-500">*</span>
                                                                </label>
                                                                <select
                                                                    id="recurrence_month"
                                                                    name="recurrence_month"
                                                                    defaultValue={editingEvent?.recurrence_month || getDatePart(editingEvent?.start_date || null, "month")}
                                                                    className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white"
                                                                >
                                                                    {monthOptions.map((month) => (
                                                                        <option key={month.value} value={month.value}>
                                                                            {month.label}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>

                                                            <div>
                                                                <label htmlFor="yearly_month_day" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                                                                    Day <span className="text-red-500">*</span>
                                                                </label>
                                                                <select
                                                                    id="yearly_month_day"
                                                                    name="recurrence_month_day"
                                                                    defaultValue={editingEvent?.recurrence_month_day || getDatePart(editingEvent?.start_date || null, "day")}
                                                                    className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 text-neutral-900 dark:text-white"
                                                                >
                                                                    {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                                                                        <option key={day} value={day}>
                                                                            {day}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Locations Selection (Mandatory) */}
                                    <div className="mt-8 border-t border-neutral-100 dark:border-white/10 pt-6">
                                        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white mb-3">
                                            Event Locations <span className="text-red-500">*</span>
                                        </h3>
                                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
                                            Select which branch locations are allowed for this event. Workers must be physically at one of these locations to check in.
                                        </p>

                                        {activeLocations.length === 0 ? (
                                            <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 flex gap-3">
                                                <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />
                                                <p className="text-sm text-orange-800 dark:text-orange-200">
                                                    You haven't created any active branch locations yet. You must add at least one location before creating an event.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto p-2 bg-neutral-50 dark:bg-neutral-900/50 rounded-xl border border-neutral-100 dark:border-white/5">
                                                {activeLocations.map((loc) => (
                                                    <label key={loc.id} className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-black border border-neutral-200 dark:border-white/10 cursor-pointer hover:border-[#34A853]/50 transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            className="w-4 h-4 text-[#34A853] rounded border-neutral-300 dark:border-neutral-600 focus:ring-[#34A853]"
                                                            checked={selectedLocations.includes(loc.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedLocations(prev => [...prev, loc.id]);
                                                                } else {
                                                                    setSelectedLocations(prev => prev.filter(id => id !== loc.id));
                                                                }
                                                                setError(null);
                                                            }}
                                                        />
                                                        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-200">{loc.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-8 flex items-center justify-end gap-3 pt-6 border-t border-neutral-100 dark:border-white/10">
                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            className="px-4 py-2.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-xl transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="flex items-center gap-2 bg-[#34A853] hover:bg-[#2b8a44] text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-70"
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Saving...
                                                </>
                                            ) : (
                                                "Save Event"
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {eventToDelete && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeDeleteModal}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110]"
                        />
                        <div className="fixed inset-0 flex items-center justify-center z-[111] p-4 pointer-events-none">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                role="alertdialog"
                                aria-modal="true"
                                aria-labelledby="delete-event-title"
                                aria-describedby="delete-event-description"
                                className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl shadow-xl pointer-events-auto overflow-hidden"
                            >
                                <div className="p-6 border-b border-neutral-100 dark:border-white/10 flex items-center justify-between">
                                    <h2 id="delete-event-title" className="text-xl font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5 text-red-500" />
                                        Delete Event
                                    </h2>
                                    <button
                                        onClick={closeDeleteModal}
                                        disabled={!!deletingId}
                                        className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
                                        aria-label="Close delete confirmation"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="p-6">
                                    {deleteError && (
                                        <div className="mb-5 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-start gap-3">
                                            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                                                {deleteError}
                                            </p>
                                        </div>
                                    )}

                                    <p id="delete-event-description" className="text-sm text-neutral-600 dark:text-neutral-400">
                                        Are you sure you want to delete <strong className="text-neutral-900 dark:text-white">{eventToDelete.title}</strong>? This action cannot be undone.
                                    </p>

                                    <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                                        <button
                                            ref={cancelDeleteButtonRef}
                                            type="button"
                                            onClick={closeDeleteModal}
                                            disabled={!!deletingId}
                                            className="px-4 py-2.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-xl transition-colors disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={confirmDelete}
                                            disabled={deletingId === eventToDelete.id}
                                            className="flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm disabled:opacity-70"
                                        >
                                            {deletingId === eventToDelete.id ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Deleting...
                                                </>
                                            ) : (
                                                <>
                                                    <Trash2 className="w-4 h-4" />
                                                    Delete Event
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
