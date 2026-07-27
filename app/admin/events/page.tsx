import { createClient } from "@/utils/supabase/server";
import EventsClient from "./EventsClient";

export const metadata = {
    title: "Events Management | Admin Portal",
};

export default async function AdminEventsPage() {
    const supabase = await createClient();

    // Parallelize events and locations queries to eliminate waterfalls
    const [eventsRes, locationsRes] = await Promise.all([
        supabase
            .from('events')
            .select('*')
            .order('created_at', { ascending: false }),
        supabase
            .from('locations')
            .select('id, name')
            .eq('is_active', true)
            .order('name', { ascending: true }),
    ]);

    if (eventsRes.error) {
        console.error("Failed to fetch events:", eventsRes.error);
    }
    if (locationsRes.error) {
        console.error("Failed to fetch locations:", locationsRes.error);
    }

    const events = eventsRes.data || [];
    const locations = locationsRes.data || [];

    return (
        <EventsClient initialEvents={events || []} activeLocations={locations || []} />
    );
}
