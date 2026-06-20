"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2, X, AlertCircle, Loader2, Calendar } from "lucide-react";
import { createEvent, updateEvent, deleteEvent } from "./actions";

type EventType = {
    id: string;
    title: string;
    description: string | null;
    created_at: string;
};

export default function EventsClient({ initialEvents }: { initialEvents: EventType[] }) {
    const [events, setEvents] = useState<EventType[]>(initialEvents);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<EventType | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // For deleting
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const formRef = useRef<HTMLFormElement>(null);

    const openCreateModal = () => {
        setEditingEvent(null);
        setError(null);
        setIsModalOpen(true);
    };

    const openEditModal = (event: EventType) => {
        setEditingEvent(event);
        setError(null);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingEvent(null);
        setError(null);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        
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
            // Success: Close modal and reset state. 
            // Next.js revalidatePath will handle the server-side data refresh, 
            // but for immediate UI feedback we could also just let Server Components reload it
            // For now, we just close the modal and let the page refresh naturally.
            window.location.reload(); 
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this event? This action cannot be undone.")) return;
        
        setDeletingId(id);
        const result = await deleteEvent(id);
        
        if (result.error) {
            alert(result.error);
            setDeletingId(null);
        } else {
            window.location.reload();
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">Event Types</h1>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                        Manage all the events where attendance will be taken.
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
                        You haven't created any event types yet. Create your first event to start taking attendance.
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
                    {initialEvents.map((event) => (
                        <div 
                            key={event.id}
                            className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-6 shadow-sm flex flex-col group"
                        >
                            <div className="flex-1">
                                <h3 className="font-semibold text-lg text-neutral-900 dark:text-white mb-2 line-clamp-1">
                                    {event.title}
                                </h3>
                                <p className="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-3">
                                    {event.description || "No description provided."}
                                </p>
                            </div>
                            
                            <div className="mt-6 pt-6 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between">
                                <span className="text-xs text-neutral-400">
                                    Added {new Date(event.created_at).toLocaleDateString()}
                                </span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => openEditModal(event)}
                                        className="p-2 text-neutral-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors"
                                        title="Edit Event"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(event.id)}
                                        disabled={deletingId === event.id}
                                        className="p-2 text-neutral-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                                        title="Delete Event"
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
                    ))}
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
                                className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl shadow-xl pointer-events-auto flex flex-col max-h-[90vh]"
                            >
                                <div className="p-6 border-b border-neutral-100 dark:border-white/10 flex items-center justify-between shrink-0">
                                    <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
                                        {editingEvent ? "Edit Event" : "Create Event"}
                                    </h2>
                                    <button 
                                        onClick={closeModal}
                                        className="p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <form ref={formRef} onSubmit={handleSubmit} className="p-6 overflow-y-auto">
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
        </div>
    );
}
