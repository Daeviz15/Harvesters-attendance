import { createClient } from "@/utils/supabase/server";
import EventsClient from "./EventsClient";
import { redirect } from "next/navigation";

export const metadata = {
    title: "Events Management | Admin Portal",
};

export default async function AdminEventsPage() {
    const supabase = await createClient();

    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        redirect("/auth/login");
    }

    
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || profile.role !== 'admin') {
        redirect("/dashboard");
    }

    
    const { data: events, error } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Failed to fetch events:", error);
    }
    
    
    const { data: locations, error: locationsError } = await supabase
        .from('locations')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
        
    if (locationsError) {
        console.error("Failed to fetch locations:", locationsError);
    }

    return (
        <EventsClient initialEvents={events || []} activeLocations={locations || []} />
    );
}
