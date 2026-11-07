import { requireAdminManagementAuth } from "@/lib/rbac";
import { z } from "zod";
import { getAssistanceHistoryPage } from "@/lib/check-in-assistance";
import CheckInAssistanceClient from "./CheckInAssistanceClient";

export const dynamic = "force-dynamic";

export default async function CheckInAssistancePage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string; status?: string; page?: string }>;
}) {
  await requireAdminManagementAuth();
  const params = await searchParams;
  const parsedId = z.string().uuid().safeParse(params.request);
  const requestId = parsedId.success ? parsedId.data : null;
  const parsedStatus = z.enum(["unresolved", "resolved", "closed", "all"]).safeParse(params.status);
  const status = requestId ? "all" : parsedStatus.success ? parsedStatus.data : "unresolved";
  const parsedPage = z.coerce.number().int().min(1).max(100000).safeParse(params.page ?? 1);
  const page = parsedPage.success ? parsedPage.data : 1;
  const history = await getAssistanceHistoryPage(status, page, requestId).catch((error: unknown) => {
    console.error("[CheckInAssistance] History unavailable", error);
    return null;
  });
  if (!history) return (
    <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
      <h1 className="font-bold">Complaint history is temporarily unavailable</h1>
      <p className="mt-2 text-sm">Refresh the page to try again. If this continues, contact your administrator.</p>
    </div>
  );

  return (
    <CheckInAssistanceClient
      history={history}
      statusFilter={status}
      highlightedRequestId={requestId}
    />
  );
}
