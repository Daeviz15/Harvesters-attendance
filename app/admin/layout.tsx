import { requireAdminAuth } from "@/lib/rbac";
import AdminNavigation from "@/components/AdminNavigation";
import BirthdayPrompt from "@/components/BirthdayPrompt";
import { AdminBirthdayAnnouncement } from "@/components/BirthdayAnnouncements";
import { getUpcomingBirthdays } from "@/lib/upcoming-birthdays";
import { getAdminNotificationSnapshot } from "@/lib/admin-notifications";

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Zero-Trust Server-Side RBAC Verification
    const { initials, isSuperAdmin, isReportsOnlyAdmin, scopeSummary, profile } = await requireAdminAuth();
    const [upcomingBirthdays, notificationSnapshot] = isReportsOnlyAdmin
        ? [[], { notifications: [], unreadCount: 0 }]
        : await Promise.all([
            getUpcomingBirthdays({ adminView: true, daysAhead: 45, limit: 8 }),
            getAdminNotificationSnapshot(20),
        ]);

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-background text-foreground overflow-x-hidden max-w-full">
            {/* Navigation Sidebar & Mobile Header */}
            <AdminNavigation 
                initial={initials} 
                userId={profile.id}
                initialNotifications={notificationSnapshot.notifications}
                initialUnreadCount={notificationSnapshot.unreadCount}
                isSuperAdmin={isSuperAdmin}
                isReportsOnlyAdmin={isReportsOnlyAdmin}
                scopeSummary={scopeSummary}
            />

            {/* Main Content Area */}
            <div className="relative z-10 flex min-h-screen min-w-0 max-w-full flex-col overflow-x-hidden pt-20 md:pl-64">
                <AdminBirthdayAnnouncement birthdays={upcomingBirthdays} />

                {/* Page Content */}
                <main className="flex-1 w-full min-w-0 max-w-full p-4 sm:p-6 lg:p-8">
                    {children}
                </main>
            </div>
            <BirthdayPrompt initialOpen={!profile.date_of_birth} />
        </div>
    );
}
