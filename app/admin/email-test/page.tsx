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

export default async function EmailTestPage() {
    const scope = await requireSuperAdminAuth();
    const maskedRecipient = scope.user.email
        ? maskEmail(scope.user.email)
        : "no email address configured";

    return <EmailTestClient maskedRecipient={maskedRecipient} />;
}
