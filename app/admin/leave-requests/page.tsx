import { requireAdminManagementAuth } from "@/lib/rbac";
import { getAdminLeaveRequests } from "./actions";
import LeaveRequestsClient from "./LeaveRequestsClient";
import type { LeaveStatus } from "@/lib/types";

export const metadata = {
    title: "Leave Requests | Admin Portal",
};

function normalizeStatus(value: string | string[] | undefined): LeaveStatus | "all" {
    return value === "approved" || value === "rejected" || value === "pending" || value === "all"
        ? value
        : "pending";
}

export default async function LeaveRequestsPage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const scope = await requireAdminManagementAuth();
    const searchParams = await props.searchParams;
    const result = await getAdminLeaveRequests(searchParams);

    if (result.error || !result.data) {
        return (
            <div className="mx-auto w-full max-w-4xl rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center text-sm font-medium text-red-400">
                {result.error || "Could not load leave requests."}
            </div>
        );
    }

    return (
        <LeaveRequestsClient
            requests={result.data.requests}
            totalCount={result.data.totalCount}
            page={result.data.page}
            pageSize={result.data.pageSize}
            initialStatus={normalizeStatus(searchParams.status)}
            initialSearch={typeof searchParams.search === "string" ? searchParams.search : ""}
            scopeSummary={scope.scopeSummary}
            statusCounts={result.data.statusCounts}
        />
    );
}
