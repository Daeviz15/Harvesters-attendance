import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedHomePath } from "@/lib/auth-home";

export default async function HomePage() {
    const supabase = await createClient();
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        redirect("/workers-attendance");
    }

    redirect(await getAuthenticatedHomePath(supabase, user));
}
