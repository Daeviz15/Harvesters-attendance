import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import OnboardingClient from './OnboardingClient';

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

    // Fetch existing profile if present
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, worker_id, avatar_url, phone, department_id')
        .eq('id', user.id)
        .maybeSingle();

    // Determine initial first and last names from profile or user metadata
    let initialFirstName = profile?.first_name || user.user_metadata?.first_name || (user.user_metadata?.full_name?.split(' ')[0]) || '';
    let initialLastName = profile?.last_name || user.user_metadata?.last_name || (user.user_metadata?.full_name?.split(' ').slice(1).join(' ')) || '';
    
    if (!initialFirstName && user.email) {
        const emailName = user.email.split('@')[0];
        initialFirstName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }

    // Determine or generate unique Worker ID (HRV-XXXX)
    let workerId = profile?.worker_id || '';
    if (!workerId) {
        const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        for (let attempt = 0; attempt < 5; attempt++) {
            let code = "";
            for (let i = 0; i < 4; i++) {
                code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
            }
            const candidateId = `HRV-${code}`;
            const { data: existing } = await supabase
                .from('profiles')
                .select('id')
                .eq('worker_id', candidateId)
                .maybeSingle();
            if (!existing) {
                workerId = candidateId;
                break;
            }
        }
        if (!workerId) {
            workerId = `HRV-${Date.now().toString(36).toUpperCase().slice(-5)}`;
        }
    }

    const { data: departments, error: departmentsError } = await supabase
        .from('departments')
        .select('id, name, description, team')
        .eq('is_active', true)
        .order('name', { ascending: true });

    if (departmentsError) {
        console.error('Failed to fetch departments:', departmentsError);
    }

    return (
        <OnboardingClient
            initialFirstName={initialFirstName}
            initialLastName={initialLastName}
            workerId={workerId}
            userId={user.id}
            initialAvatarUrl={profile?.avatar_url || user.user_metadata?.avatar_url || null}
            initialPhone={profile?.phone ? profile.phone.replace('+234', '') : ''}
            departments={departments || []}
        />
    );
}
