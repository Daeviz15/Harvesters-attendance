import { createClient } from "@/utils/supabase/server";
import EventsClient from "./EventsClient";
import { redirect } from "next/navigation";

export const metadata = {
    title: "Events Management | Admin Portal",
};

export default async function AdminEventsPage() {
    const supabase = await createClient();

    // Verify authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        redirect("/auth/login");
    }

    // Verify admin role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || profile.role !== 'admin') {
        redirect("/dashboard");
    }

    // Fetch all events, ordered by newest first
    const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Failed to fetch events:", error);
    }

    return (
        <EventsClient initialEvents={events || []} />
    );
}
