"use client";

import { useMemo, useState } from "react";
import { Search, X, CheckSquare, Square, Filter, Users, Check } from "lucide-react";

export type WorkerBasic = {
    id: string;
    first_name: string;
    last_name: string;
    worker_id: string;
    department?: string | null;
};

interface WorkerPickerProps {
    workers: WorkerBasic[];
    selectedWorkerIds: string[];
    onChange: (selectedIds: string[]) => void;
    label?: string;
    description?: string;
}

export default function WorkerPicker({
    workers,
    selectedWorkerIds,
    onChange,
    label = "Target Specific Workers",
    description = "Leave empty to select all workers automatically.",
}: WorkerPickerProps) {
    const [search, setSearch] = useState("");
    const [selectedDepartment, setSelectedDepartment] = useState<string>("all");

    // Extract unique department list dynamically from workers
    const departments = useMemo(() => {
        const set = new Set<string>();
        workers.forEach((w) => {
            if (w.department) set.add(w.department);
        });
        return Array.from(set).sort();
    }, [workers]);

    // Filter workers based on search query & department selection
    const filteredWorkers = useMemo(() => {
        const query = search.toLowerCase().trim();
        return workers.filter((w) => {
            const matchesDept = selectedDepartment === "all" || w.department === selectedDepartment;
            if (!matchesDept) return false;

            if (!query) return true;
            const fullName = `${w.first_name} ${w.last_name}`.toLowerCase();
            const workerId = (w.worker_id || "").toLowerCase();
            const dept = (w.department || "").toLowerCase();

            return fullName.includes(query) || workerId.includes(query) || dept.includes(query);
        });
    }, [workers, search, selectedDepartment]);

    const allFilteredSelected = useMemo(() => {
        if (filteredWorkers.length === 0) return false;
        return filteredWorkers.every((w) => selectedWorkerIds.includes(w.id));
    }, [filteredWorkers, selectedWorkerIds]);

    const toggleWorker = (id: string) => {
        if (selectedWorkerIds.includes(id)) {
            onChange(selectedWorkerIds.filter((item) => item !== id));
        } else {
            onChange([...selectedWorkerIds, id]);
        }
    };

    const toggleSelectAllFiltered = () => {
        const filteredIds = filteredWorkers.map((w) => w.id);
        if (allFilteredSelected) {
            // Deselect all filtered workers
            onChange(selectedWorkerIds.filter((id) => !filteredIds.includes(id)));
        } else {
            // Select all filtered workers
            const newSet = new Set([...selectedWorkerIds, ...filteredIds]);
            onChange(Array.from(newSet));
        }
    };

    const clearAll = () => {
        onChange([]);
    };

    return (
        <div className="space-y-3">
            {/* Header & Label */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div>
                    <label className="block text-sm font-semibold text-neutral-900 dark:text-white">
                        {label}
                    </label>
                    {description && (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            {description}
                        </p>
                    )}
                </div>

                {/* Selected Counter Badge */}
                <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                        selectedWorkerIds.length > 0
                            ? "bg-[#34A853]/10 text-[#34A853] border-[#34A853]/30"
                            : "bg-neutral-100 dark:bg-white/5 text-neutral-500 dark:text-neutral-400 border-neutral-200 dark:border-white/10"
                    }`}>
                        <Users className="w-3.5 h-3.5" />
                        {selectedWorkerIds.length === 0
                            ? "All Workers (Default)"
                            : `${selectedWorkerIds.length} worker${selectedWorkerIds.length === 1 ? "" : "s"} selected`}
                    </span>

                    {selectedWorkerIds.length > 0 && (
                        <button
                            type="button"
                            onClick={clearAll}
                            className="text-xs text-red-500 hover:text-red-600 font-medium hover:underline transition-colors"
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>

            {/* Filter & Search Bar Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                {/* Search Input */}
                <div className="sm:col-span-7 relative">
                    <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search worker by name, ID, or department..."
                        className="w-full pl-9 pr-8 py-2 bg-white dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#34A853]/50"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Department Filter */}
                <div className="sm:col-span-5 relative">
                    <Filter className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                        value={selectedDepartment}
                        onChange={(e) => setSelectedDepartment(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 bg-white dark:bg-black border border-neutral-200 dark:border-white/10 rounded-xl text-xs text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50"
                    >
                        <option value="all">All Departments ({workers.length})</option>
                        {departments.map((dept) => (
                            <option key={dept} value={dept}>
                                {dept}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Selection Toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-100 dark:bg-neutral-900/60 rounded-lg text-xs">
                <button
                    type="button"
                    onClick={toggleSelectAllFiltered}
                    className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300 hover:text-[#34A853] dark:hover:text-[#34A853] font-medium transition-colors"
                >
                    {allFilteredSelected ? (
                        <>
                            <CheckSquare className="w-3.5 h-3.5 text-[#34A853]" />
                            Deselect visible ({filteredWorkers.length})
                        </>
                    ) : (
                        <>
                            <Square className="w-3.5 h-3.5 text-neutral-400" />
                            Select visible ({filteredWorkers.length})
                        </>
                    )}
                </button>
                <span className="text-neutral-400 text-[11px]">
                    Showing {filteredWorkers.length} of {workers.length}
                </span>
            </div>

            {/* Worker Checkbox Scroll List */}
            <div className="max-h-44 sm:max-h-56 overflow-y-auto border border-neutral-200 dark:border-white/10 rounded-xl divide-y divide-neutral-100 dark:divide-white/5 bg-white dark:bg-black/60">
                {filteredWorkers.length === 0 ? (
                    <div className="p-6 text-center text-xs text-neutral-400">
                        No workers found matching your search.
                    </div>
                ) : (
                    filteredWorkers.map((worker) => {
                        const isSelected = selectedWorkerIds.includes(worker.id);
                        const initials = `${worker.first_name[0] || ""}${worker.last_name[0] || ""}`.toUpperCase();

                        return (
                            <div
                                key={worker.id}
                                onClick={() => toggleWorker(worker.id)}
                                className={`flex items-center justify-between p-2.5 cursor-pointer transition-colors ${
                                    isSelected
                                        ? "bg-[#34A853]/5 dark:bg-[#34A853]/10"
                                        : "hover:bg-neutral-50 dark:hover:bg-white/5"
                                }`}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                        isSelected
                                            ? "bg-[#34A853] border-[#34A853] text-white"
                                            : "border-neutral-300 dark:border-neutral-600"
                                    }`}>
                                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                    </div>

                                    {/* Initials Avatar */}
                                    <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold text-xs flex items-center justify-center shrink-0">
                                        {initials || "W"}
                                    </div>

                                    <div className="min-w-0">
                                        <div className="text-xs font-medium text-neutral-900 dark:text-white truncate">
                                            {worker.first_name} {worker.last_name}
                                        </div>
                                        <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
                                            <span className="font-mono text-neutral-500 dark:text-neutral-400">
                                                {worker.worker_id || "No ID"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {worker.department && (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-white/5 shrink-0">
                                        {worker.department}
                                    </span>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
