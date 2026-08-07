"use server";

import { requireSuperAdminAuth } from "@/lib/rbac";
import { sendEventReminderEmail } from "@/lib/email";

function assertEmailTestIsAvailable() {
    if (process.env.NODE_ENV !== "development") {
        throw new Error("Email test tools are only available in development.");
    }
}

export type EmailTestState = {
    status: "idle" | "success" | "error";
    message: string;
    deliveryReference?: string;
};

export async function sendReminderTestEmail(
    _previousState: EmailTestState,
): Promise<EmailTestState> {
    void _previousState;

    try {
        assertEmailTestIsAvailable();

        // Server Actions are public mutation endpoints. Always authorize here,
        // even though the page and navigation are also access-controlled.
        const scope = await requireSuperAdminAuth();
        const recipient = scope.user.email;

        if (!recipient) {
            return {
                status: "error",
                message: "Your administrator account does not have an email address.",
            };
        }

        const result = await sendEventReminderEmail({
            toEmail: recipient,
            firstName: scope.profile.first_name?.trim() || "there",
            eventTitle: "Sunday Service (Delivery Test)",
            eventStart: new Date(Date.now() + 30 * 60 * 1_000),
            timezone: "Africa/Lagos",
            locationName: "Harvesters Globe — Test Location",
            isTest: true,
        });

        if (!result.success) {
            return {
                status: "error",
                message: "The SMTP provider did not accept the test email. Check the server logs for the diagnostic details.",
            };
        }

        return {
            status: "success",
            message: "The SMTP provider accepted one test reminder for delivery. Check your inbox and spam folder.",
            deliveryReference: result.emailId,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown email test failure";
        console.error("[EmailTest] Test reminder failed.", { message });

        return {
            status: "error",
            message: "The test email could not be sent. Check the server logs and SMTP configuration.",
        };
    }
}

import { processDueEmailNotifications } from "@/lib/email-notification-processor";

export async function triggerScheduledEmailProcessorAction() {
    try {
        assertEmailTestIsAvailable();

        await requireSuperAdminAuth();
        const summary = await processDueEmailNotifications();
        return {
            success: true,
            summary,
            message: `Scheduler completed successfully! ${summary.sent} email(s) sent, ${summary.claimed} job(s) claimed.`,
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to run email scheduler.";
        return { error: msg };
    }
}
