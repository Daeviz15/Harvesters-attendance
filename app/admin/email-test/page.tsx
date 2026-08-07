import { requireSuperAdminAuth } from "@/lib/rbac";
import EmailTestClient from "./EmailTestClient";

export const metadata = {
    title: "Email Delivery Test | Admin Portal",
};

function maskEmail(email: string) {
    const [localPart, domain] = email.split("@");
    if (!localPart || !domain) return "your administrator email";

    const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length));
    return `${visiblePrefix}${"•".repeat(Math.max(3, localPart.length - visiblePrefix.length))}@${domain}`;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value || "", 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function EmailTestPage() {
    const scope = await requireSuperAdminAuth();
    const maskedRecipient = scope.user.email
        ? maskEmail(scope.user.email)
        : "no email address configured";
    const reminderLeadMinutes = parsePositiveInteger(process.env.EMAIL_REMINDER_LEAD_MINUTES, 30);
    const followupDelayMinutes = parsePositiveInteger(process.env.EMAIL_FOLLOWUP_DELAY_MINUTES, 60);

    return (
        <EmailTestClient
            maskedRecipient={maskedRecipient}
            reminderLeadMinutes={reminderLeadMinutes}
            followupDelayMinutes={followupDelayMinutes}
        />
    );
}
