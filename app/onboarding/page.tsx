import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import OnboardingClient from './OnboardingClient';

// Server Component

export default async function OnboardingPage() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/auth/login');
    }

    // Double check if onboarding is already complete
    if (user.user_metadata?.onboarding_complete) {
        redirect('/dashboard');
    }

    // Parse initial username
    let initialUsername = "";
    if (user.user_metadata?.name) {
        initialUsername = user.user_metadata.name as string;
    } else if (user.email) {
        initialUsername = user.email.split('@')[0];
    }

    return <OnboardingClient initialUsername={initialUsername} userId={user.id} />;
}
