import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import DashboardClient from './DashboardClient';

export default async function DashboardServerPage() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/auth/login');
    }

    // Default values if metadata is somehow missing
    let firstName = "User";
    let fullName = "User";
    let initials = "U";
    let department = "Worker";

    if (user.user_metadata?.department) {
        department = user.user_metadata.department as string;
    }

    if (user.user_metadata?.name) {
        fullName = user.user_metadata.name as string;
        const nameParts = fullName.trim().split(' ');
        firstName = nameParts[0];
        
        if (nameParts.length > 1) {
            initials = `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
        } else {
            initials = `${nameParts[0][0]}${nameParts[0][1] || ''}`.toUpperCase();
        }
    } else if (user.email) {
        firstName = user.email.split('@')[0];
        fullName = firstName;
        initials = firstName.substring(0, 2).toUpperCase();
    }

    return (
        <DashboardClient 
            firstName={firstName}
            fullName={fullName}
            initials={initials}
            department={department}
        />
    );
}
