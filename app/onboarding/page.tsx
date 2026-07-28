import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import OnboardingClient from './OnboardingClient';

export default async function OnboardingPage() {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        redirect('/auth/login');
    }

    
    if (user.user_metadata?.onboarding_complete) {
        redirect('/dashboard');
    }

    
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, worker_id, avatar_url, phone, department_id')
        .eq('id', user.id)
        .maybeSingle();

    
    let initialFirstName = profile?.first_name || user.user_metadata?.first_name || (user.user_metadata?.full_name?.split(' ')[0]) || '';
    let initialLastName = profile?.last_name || user.user_metadata?.last_name || (user.user_metadata?.full_name?.split(' ').slice(1).join(' ')) || '';
    
    if (!initialFirstName && user.email) {
        const emailName = user.email.split('@')[0];
        initialFirstName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
    }

    
    const workerId = profile?.worker_id || '';

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
            initialDepartmentId={profile?.department_id || null}
            departments={departments || []}
        />
    );
}
