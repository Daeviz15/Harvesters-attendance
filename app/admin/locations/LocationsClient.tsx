"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Plus, Edit2, Trash2, X, AlertCircle, Loader2, Navigation, Power, PowerOff } from "lucide-react";
import { createLocation, updateLocation, deleteLocation, toggleLocationActive } from "./actions";

type LocationType = {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
    is_active: boolean;
    created_at: string;
};

export default function LocationsClient({ initialLocations }: { initialLocations: LocationType[] }) {
    const [locations, setLocations] = useState<LocationType[]>(initialLocations);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editingLocation, setEditingLocation] = useState<LocationType | null>(null);

    const formRef = useRef<HTMLFormElement>(null);

    const openCreateModal = () => {
        setEditingLocation(null);
        setError(null);
        setIsModalOpen(true);
    };

    const openEditModal = (loc: LocationType) => {
        setEditingLocation(loc);
        setError(null);
        setIsModalOpen(true);
    };

    const handleToggleActive = async (id: string, currentStatus: boolean) => {
        const originalLocations = [...locations];
        setLocations(locations.map(loc => loc.id === id ? { ...loc, is_active: !currentStatus } : loc));
        
        const result = await toggleLocationActive(id, currentStatus);
        if (result.error) {
            setLocations(originalLocations);
            alert(result.error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Are you sure you want to delete this location? Users will no longer be able to check in here.")) return;
        
        const originalLocations = [...locations];
        setLocations(locations.filter(loc => loc.id !== id));
        
        const result = await deleteLocation(id);
        if (result.error) {
            setLocations(originalLocations);
            alert(result.error);
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        
        let result;
        if (editingLocation) {
            formData.append("id", editingLocation.id);
            result = await updateLocation(formData);
        } else {
            result = await createLocation(formData);
        }

        if (result.error) {
            setError(result.error);
            setIsSubmitting(false);
            return;
        }

        // We could just reload or rely on Next.js revalidatePath, but manually updating state makes it snappy.
        // Actually, since revalidatePath triggers a re-render from server, we can just let it reload the page data.
        window.location.reload();
    };

    return (
        <div className="w-full max-w-5xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-800 dark:text-white/90">Branch Locations</h1>
                    <p className="text-neutral-500 dark:text-white/50 mt-1">Manage geofencing perimeters for different branches</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 bg-[#34A853] hover:bg-[#2b8a44] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Add Location
                </button>
            </div>

            {/* Locations Grid */}
            {locations.length === 0 ? (
                <div className="bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-white/5 flex items-center justify-center text-neutral-400 mb-4">
                        <MapPin className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">No Locations Set</h3>
                    <p className="text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto mb-6">
                        You haven't added any branch locations yet. Add a location to enable geofencing check-ins.
                    </p>
                    <button
                        onClick={openCreateModal}
                        className="text-[#34A853] font-medium hover:underline"
                    >
                        Add your first location
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {locations.map((loc) => (
                        <div 
                            key={loc.id}
                            className={`bg-white dark:bg-[#0f0f0f] border rounded-2xl p-6 transition-all relative overflow-hidden ${
                                loc.is_active 
                                    ? "border-neutral-200 dark:border-white/10 hover:border-[#34A853]/50" 
                                    : "border-red-200 dark:border-red-500/20 opacity-80"
                            }`}
                        >
                            {!loc.is_active && (
                                <div className="absolute top-0 right-0 bg-red-500/10 text-red-600 dark:text-red-400 text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                                    Disabled
                                </div>
                            )}
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                        loc.is_active ? 'bg-[#34A853]/10 text-[#34A853]' : 'bg-neutral-100 dark:bg-white/5 text-neutral-400'
                                    }`}>
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="font-semibold text-neutral-900 dark:text-white/90 text-lg break-words">{loc.name}</h3>
                                        <p className="text-sm text-neutral-500 dark:text-white/50">{loc.radius} meters radius</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                                <div className="bg-neutral-50 dark:bg-white/5 rounded-xl p-3 min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-white/40 mb-1">Latitude</p>
                                    <p className="font-mono text-sm text-neutral-700 dark:text-white/70 break-all">{loc.latitude}</p>
                                </div>
                                <div className="bg-neutral-50 dark:bg-white/5 rounded-xl p-3 min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-white/40 mb-1">Longitude</p>
                                    <p className="font-mono text-sm text-neutral-700 dark:text-white/70 break-all">{loc.longitude}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-neutral-100 dark:border-white/5">
                                <button
                                    onClick={() => handleToggleActive(loc.id, loc.is_active)}
                                    className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                                        loc.is_active 
                                            ? "text-red-500 hover:text-red-600" 
                                            : "text-[#34A853] hover:text-[#2b8a44]"
                                    }`}
                                >
                                    {loc.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                                    {loc.is_active ? "Disable Branch" : "Enable Branch"}
                                </button>
                                
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => openEditModal(loc)}
                                        className="p-2 text-neutral-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(loc.id)}
                                        className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
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
                            onClick={() => setIsModalOpen(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                        >
                            <div className="p-6 border-b border-neutral-100 dark:border-white/5 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                                    {editingLocation ? "Edit Branch Location" : "Add Branch Location"}
                                </h2>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form ref={formRef} onSubmit={handleSubmit} className="p-6 space-y-5">
                                {error && (
                                    <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-neutral-700 dark:text-white/80">Branch Name</label>
                                    <input
                                        name="name"
                                        type="text"
                                        required
                                        defaultValue={editingLocation?.name || ""}
                                        placeholder="e.g. Lekki Phase 1"
                                        className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold text-neutral-700 dark:text-white/80">Latitude</label>
                                        <input
                                            name="latitude"
                                            type="number"
                                            step="any"
                                            required
                                            defaultValue={editingLocation?.latitude || ""}
                                            placeholder="6.4369"
                                            className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all font-mono text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-semibold text-neutral-700 dark:text-white/80">Longitude</label>
                                        <input
                                            name="longitude"
                                            type="number"
                                            step="any"
                                            required
                                            defaultValue={editingLocation?.longitude || ""}
                                            placeholder="3.5185"
                                            className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all font-mono text-sm"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-neutral-700 dark:text-white/80">Radius (Meters)</label>
                                    <input
                                        name="radius"
                                        type="number"
                                        required
                                        min="10"
                                        defaultValue={editingLocation?.radius || 100}
                                        placeholder="100"
                                        className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all font-mono text-sm"
                                    />
                                    <p className="text-xs text-neutral-500 dark:text-white/40 mt-1">Recommended: 100 meters to account for GPS drift.</p>
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="flex-1 py-2.5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-white/70 hover:bg-neutral-50 dark:hover:bg-white/5 rounded-xl font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex-1 py-2.5 bg-[#34A853] hover:bg-[#2b8a44] text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {editingLocation ? "Save Changes" : "Create Location"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
