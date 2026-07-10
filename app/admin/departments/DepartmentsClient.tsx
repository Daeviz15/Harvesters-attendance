"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Building2, Edit2, Loader2, Plus, Power, PowerOff, Search, Trash2, X, Filter } from "lucide-react";
import { createDepartment, deleteDepartment, setDepartmentActive, updateDepartment } from "./actions";
import type { DepartmentRow } from "./page";

export default function DepartmentsClient({ initialDepartments }: { initialDepartments: DepartmentRow[] }) {
    const router = useRouter();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<DepartmentRow | null>(null);
    const [departmentToDelete, setDepartmentToDelete] = useState<DepartmentRow | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [busyDepartmentId, setBusyDepartmentId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [teamFilter, setTeamFilter] = useState<string>("All");

    const openCreateModal = () => {
        setEditingDepartment(null);
        setError(null);
        setIsModalOpen(true);
    };

    const openEditModal = (department: DepartmentRow) => {
        setEditingDepartment(department);
        setError(null);
        setIsModalOpen(true);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const formData = new FormData(event.currentTarget);
        if (editingDepartment) formData.append("id", editingDepartment.id);

        const result = editingDepartment
            ? await updateDepartment(formData)
            : await createDepartment(formData);

        if (result.error) {
            setError(result.error);
            setIsSubmitting(false);
            return;
        }

        setIsSubmitting(false);
        setIsModalOpen(false);
        setEditingDepartment(null);
        router.refresh();
    };

    const handleToggleActive = async (department: DepartmentRow) => {
        setBusyDepartmentId(department.id);
        const result = await setDepartmentActive(department.id, !department.is_active);

        if (result.error) {
            setError(result.error);
        } else {
            router.refresh();
        }

        setBusyDepartmentId(null);
    };

    const confirmDelete = async () => {
        if (!departmentToDelete) return;

        setBusyDepartmentId(departmentToDelete.id);
        const result = await deleteDepartment(departmentToDelete.id);

        if (result.error) {
            setError(result.error);
        } else {
            setDepartmentToDelete(null);
            router.refresh();
        }

        setBusyDepartmentId(null);
    };

    const activeCount = initialDepartments.filter((department) => department.is_active).length;

    const availableTeams = new Set(initialDepartments.map(d => d.team).filter(Boolean));
    const allTeams = ["PROGRAMS", "MINISTRY", "MATURITY", "MEMBERSHIP", "MISSIONS", "NEXT GEN"]
        .filter(team => availableTeams.has(team));

    const filteredDepartments = initialDepartments.filter((dept) => {
        const matchesSearch = dept.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesTeam = teamFilter === "All" || dept.team === teamFilter;
        return matchesSearch && matchesTeam;
    });

    return (
        <div className="w-full max-w-6xl mx-auto space-y-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-800 dark:text-white/90">Departments</h1>
                    <p className="text-neutral-500 dark:text-white/50 mt-1">
                        Manage the departments workers can choose during onboarding.
                    </p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="inline-flex items-center justify-center gap-2 bg-[#34A853] hover:bg-[#2b8a44] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors shadow-sm"
                >
                    <Plus className="w-4 h-4" />
                    Add Department
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0f0f0f] p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-white/40">Total Departments</p>
                    <p className="mt-2 text-3xl font-bold text-neutral-900 dark:text-white">{initialDepartments.length}</p>
                </div>
                <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0f0f0f] p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-white/40">Active for Onboarding</p>
                    <p className="mt-2 text-3xl font-bold text-[#34A853]">{activeCount}</p>
                </div>
                <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#0f0f0f] p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-white/40">Assigned Workers</p>
                    <p className="mt-2 text-3xl font-bold text-neutral-900 dark:text-white">
                        {initialDepartments.reduce((total, department) => total + department.worker_count, 0)}
                    </p>
                </div>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <input
                        type="text"
                        placeholder="Search departments..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-xl text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all"
                    />
                </div>
                <div className="relative w-full sm:w-64 shrink-0">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
                    <select
                        value={teamFilter}
                        onChange={(e) => setTeamFilter(e.target.value)}
                        className="w-full pl-11 pr-10 py-3 bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-xl text-neutral-900 dark:text-white appearance-none focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all cursor-pointer"
                    >
                        <option value="All">All Teams</option>
                        {allTeams.map(team => (
                            <option key={team} value={team}>{team}</option>
                        ))}
                    </select>
                </div>
            </div>

            {filteredDepartments.length === 0 ? (
                <div className="bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-white/5 flex items-center justify-center text-neutral-400 mb-4">
                        <Building2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-2">No Departments Yet</h3>
                    <p className="text-neutral-500 dark:text-neutral-400 max-w-sm mx-auto mb-6">
                        Add departments so workers can choose the right team during onboarding.
                    </p>
                    <button onClick={openCreateModal} className="text-[#34A853] font-medium hover:underline">
                        Add your first department
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {filteredDepartments.map((department) => (
                        <div
                            key={department.id}
                            className={`rounded-2xl border bg-white dark:bg-[#0f0f0f] p-5 transition-colors ${
                                department.is_active
                                    ? "border-neutral-200 dark:border-white/10"
                                    : "border-amber-500/30 dark:border-amber-500/20 opacity-85"
                            }`}
                        >
                            <div className="flex items-start justify-between gap-4 mb-5">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                        department.is_active ? "bg-[#34A853]/10 text-[#34A853]" : "bg-amber-500/10 text-amber-500"
                                    }`}>
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-semibold text-neutral-900 dark:text-white break-words">{department.name}</h3>
                                        <p className="text-xs text-neutral-500 dark:text-white/40 mt-1">
                                            {department.team ? <span className="font-medium text-[#34A853] mr-1">{department.team} &bull;</span> : null}
                                            {department.worker_count} assigned worker{department.worker_count === 1 ? "" : "s"}
                                        </p>
                                    </div>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-1 ${
                                    department.is_active
                                        ? "bg-[#34A853]/10 text-[#34A853]"
                                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                }`}>
                                    {department.is_active ? "Active" : "Inactive"}
                                </span>
                            </div>

                            <p className="min-h-10 text-sm text-neutral-500 dark:text-white/50">
                                {department.description || "No description added."}
                            </p>

                            <div className="flex items-center justify-between gap-3 pt-5 mt-5 border-t border-neutral-100 dark:border-white/5">
                                <button
                                    onClick={() => handleToggleActive(department)}
                                    disabled={busyDepartmentId === department.id}
                                    className={`inline-flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                                        department.is_active
                                            ? "text-amber-600 hover:text-amber-700 dark:text-amber-400"
                                            : "text-[#34A853] hover:text-[#2b8a44]"
                                    }`}
                                >
                                    {busyDepartmentId === department.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : department.is_active ? (
                                        <PowerOff className="w-4 h-4" />
                                    ) : (
                                        <Power className="w-4 h-4" />
                                    )}
                                    {department.is_active ? "Deactivate" : "Activate"}
                                </button>

                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openEditModal(department)}
                                        className="p-2 text-neutral-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-lg transition-colors"
                                        aria-label={`Edit ${department.name}`}
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setDepartmentToDelete(department)}
                                        className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                                        aria-label={`Delete ${department.name}`}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

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
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-lg bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                        >
                            <div className="p-6 border-b border-neutral-100 dark:border-white/5 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">
                                    {editingDepartment ? "Edit Department" : "Add Department"}
                                </h2>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors"
                                    aria-label="Close department form"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6 space-y-5">
                                {error && (
                                    <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                                        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-neutral-700 dark:text-white/80">Department Name</label>
                                    <input
                                        name="name"
                                        type="text"
                                        required
                                        maxLength={80}
                                        defaultValue={editingDepartment?.name || ""}
                                        placeholder="e.g. Hospitality"
                                        className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-neutral-700 dark:text-white/80">Team</label>
                                    <select
                                        name="team"
                                        required
                                        defaultValue={editingDepartment?.team || ""}
                                        className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all cursor-pointer"
                                    >
                                        <option value="" disabled>Select a Team</option>
                                        <option value="PROGRAMS">PROGRAMS</option>
                                        <option value="MINISTRY">MINISTRY</option>
                                        <option value="MATURITY">MATURITY</option>
                                        <option value="MEMBERSHIP">MEMBERSHIP</option>
                                        <option value="MISSIONS">MISSIONS</option>
                                        <option value="NEXT GEN">NEXT GEN</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-neutral-700 dark:text-white/80">Description</label>
                                    <textarea
                                        name="description"
                                        rows={3}
                                        maxLength={180}
                                        defaultValue={editingDepartment?.description || ""}
                                        placeholder="Optional short note for admins and onboarding."
                                        className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-black/40 border border-neutral-200 dark:border-white/10 rounded-xl text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#34A853]/50 transition-all resize-none"
                                    />
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
                                        {editingDepartment ? "Save Changes" : "Create"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {departmentToDelete && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setDepartmentToDelete(null)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md bg-white dark:bg-[#0f0f0f] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden"
                        >
                            <div className="p-6 border-b border-neutral-100 dark:border-white/5 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Delete Department</h2>
                                <button
                                    onClick={() => setDepartmentToDelete(null)}
                                    className="p-2 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors"
                                    aria-label="Close delete department dialog"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-6">
                                <p className="text-neutral-600 dark:text-neutral-400 mb-6">
                                    Delete <strong className="text-neutral-900 dark:text-white">{departmentToDelete.name}</strong>? Departments with assigned workers cannot be deleted.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setDepartmentToDelete(null)}
                                        className="flex-1 py-2.5 border border-neutral-200 dark:border-white/10 text-neutral-700 dark:text-white/70 hover:bg-neutral-50 dark:hover:bg-white/5 rounded-xl font-medium transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDelete}
                                        disabled={busyDepartmentId === departmentToDelete.id}
                                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {busyDepartmentId === departmentToDelete.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
