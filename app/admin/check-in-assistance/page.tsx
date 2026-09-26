import { requireAdminManagementAuth } from "@/lib/rbac";
import { getCheckInAssistanceRequests } from "@/lib/check-in-assistance";
import CheckInAssistanceClient from "./CheckInAssistanceClient";

export const dynamic = "force-dynamic";

export default async function CheckInAssistancePage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  await requireAdminManagementAuth();
  const [{ request }, requests] = await Promise.all([
    searchParams,
    getCheckInAssistanceRequests(50),
  ]);

  return (
    <CheckInAssistanceClient
      initialRequests={requests}
      highlightedRequestId={request ?? null}
    />
  );
}
