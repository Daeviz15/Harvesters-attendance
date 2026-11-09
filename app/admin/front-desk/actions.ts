"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdminAuth } from "@/lib/rbac";
import { createAdminClient } from "@/utils/supabase/admin";

type Result = { error?: string; success?: string };

const idsSchema = z.array(z.string().uuid()).min(1, "Pick at least one worker.").max(200);

/** Gives the selected workers front desk access. It stays on until an admin removes it. */
export async function grantFrontDeskAccess(userIds: string[]): Promise<Result> {
    await requireSuperAdminAuth();
    const parsed = idsSchema.safeParse(userIds);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid selection." };

    const { error } = await createAdminClient()
        .from("profiles")
        .update({ wab_front_desk: true })
        .in("id", parsed.data)
        .eq("is_active", true);

    if (error) {
        console.error("[FrontDesk] Grant failed:", error);
        return { error: "Could not give access. Please try again." };
    }
    revalidatePath("/admin/front-desk");
    return { success: `Front desk access given to ${parsed.data.length} worker${parsed.data.length === 1 ? "" : "s"}.` };
}

/** Removes front desk access straight away. Pass no id to remove it from everyone. */
export async function revokeFrontDeskAccess(userId?: string): Promise<Result> {
    await requireSuperAdminAuth();
    let query = createAdminClient().from("profiles").update({ wab_front_desk: false });

    if (userId) {
        const parsed = z.string().uuid().safeParse(userId);
        if (!parsed.success) return { error: "Invalid worker." };
        query = query.eq("id", parsed.data);
    } else {
        query = query.eq("wab_front_desk", true);
    }

    const { error } = await query;
    if (error) {
        console.error("[FrontDesk] Revoke failed:", error);
        return { error: "Could not remove access. Please try again." };
    }
    revalidatePath("/admin/front-desk");
    return { success: userId ? "Access removed." : "Front desk access removed from everyone." };
}
