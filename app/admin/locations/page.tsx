import { createClient } from "@/utils/supabase/server";
import LocationsClient from "./LocationsClient";

export const metadata = {
    title: "Manage Locations | Admin Portal",
};

export default async function LocationsPage() {
    const supabase = await createClient();

    const { data: locations, error } = await supabase
        .from('locations')
        .select('*')
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Error fetching locations:", error);
    }

    return (
        <LocationsClient initialLocations={locations || []} />
    );
}
