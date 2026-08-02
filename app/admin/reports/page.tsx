import { requireAdminAuth } from "@/lib/rbac";
import { getReportsData } from "./actions";
import ReportsClient from "./ReportsClient";

export const metadata = {
    title: "Attendance Reports | Admin Portal",
    description: "Slice check-ins by date, week, event, worker or department.",
};

export default async function ReportsPage() {
    // Zero-Trust Server-Side RBAC — ensures only admins can access this page
    await requireAdminAuth();

    const { data, error } = await getReportsData();

    if (error || !data) {
        return (
            <div className="w-full max-w-7xl mx-auto p-8">
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-sm p-4 rounded-xl text-center font-medium">
                    {error || "Failed to load reports data."}
                </div>
            </div>
        );
    }

    return (
        <ReportsClient
            logs={data.logs}
            departments={data.departments}
            events={data.events}
            latestSession={data.latestSession}
        />
    );
}
