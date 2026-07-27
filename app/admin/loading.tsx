import { Loader2 } from "lucide-react";

export default function AdminLoading() {
    return (
        <div className="w-full max-w-7xl mx-auto space-y-6 animate-pulse p-2">
            {/* Header Skeleton */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-white/10 pb-6">
                <div className="space-y-2">
                    <div className="h-7 w-48 bg-neutral-200 dark:bg-white/10 rounded-lg"></div>
                    <div className="h-4 w-72 bg-neutral-100 dark:bg-white/5 rounded-md"></div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="h-10 w-28 bg-neutral-200 dark:bg-white/10 rounded-xl"></div>
                    <div className="h-10 w-32 bg-neutral-200 dark:bg-white/10 rounded-xl"></div>
                </div>
            </div>

            {/* Skeleton Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="h-32 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                    <div className="h-4 w-24 bg-neutral-200 dark:bg-white/10 rounded"></div>
                    <div className="h-8 w-16 bg-neutral-300 dark:bg-white/20 rounded"></div>
                </div>
                <div className="h-32 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                    <div className="h-4 w-28 bg-neutral-200 dark:bg-white/10 rounded"></div>
                    <div className="h-8 w-16 bg-neutral-300 dark:bg-white/20 rounded"></div>
                </div>
                <div className="h-32 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-6 flex flex-col justify-between">
                    <div className="h-4 w-20 bg-neutral-200 dark:bg-white/10 rounded"></div>
                    <div className="h-8 w-16 bg-neutral-300 dark:bg-white/20 rounded"></div>
                </div>
            </div>

            {/* Main Content Area Skeleton */}
            <div className="h-64 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 rounded-2xl p-6 flex items-center justify-center">
                <div className="flex items-center gap-2 text-neutral-400 dark:text-neutral-500 text-sm">
                    <Loader2 className="w-5 h-5 animate-spin text-[#34A853]" />
                    <span>Loading view...</span>
                </div>
            </div>
        </div>
    );
}
