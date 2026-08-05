import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import type SMTPPool from "nodemailer/lib/smtp-pool";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_SMTP_HOST = "smtp.gmail.com";
const DEFAULT_SMTP_PORT = 587;
const DEFAULT_APP_URL = "https://www.globeattendance.org";
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

type EmailSendResult =
    | { success: true; emailId: string }
    | { success: false; error: string };

type EmailConfig = {
    from: { name: string; address: string };
    transporter: Transporter;
    provider: "gmail" | "google_workspace_relay" | "resend" | "generic";
    authenticatedUser: string;
    authMode: "oauth2" | "password";
    isResendSmtp: boolean;
};

let emailConfig: EmailConfig | null = null;
let logoContentPromise: Promise<Buffer> | null = null;

function parsePositiveInteger(value: string | undefined, fallback: number) {
    if (!value) return fallback;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error("Invalid SMTP numeric configuration.");
    }

    return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
    if (!value) return fallback;

    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;

    throw new Error("SMTP_SECURE must be either true or false.");
}

function getSmtpProvider(host: string): EmailConfig["provider"] {
    if (host === "smtp.gmail.com") return "gmail";
    if (host === "smtp-relay.gmail.com") return "google_workspace_relay";
    if (host === "smtp.resend.com") return "resend";
    return "generic";
}

function isPersonalGoogleAddress(value: string) {
    const domain = value.trim().toLowerCase().split("@").at(-1);
    return domain === "gmail.com" || domain === "googlemail.com";
}

function normalizeGoogleAppPassword(value: string | undefined) {
    return value?.replace(/\s+/g, "");
}

function getAuthorizedGmailFromAddresses(authenticatedUser: string) {
    const configuredAliases = (process.env.EMAIL_GMAIL_AUTHORIZED_FROM_ADDRESSES || "")
        .split(",")
        .map((address) => address.trim().toLowerCase())
        .filter(Boolean);
    const addresses = new Set([authenticatedUser.trim().toLowerCase(), ...configuredAliases]);

    for (const address of addresses) {
        if (!EMAIL_PATTERN.test(address)) {
            throw new Error("EMAIL_GMAIL_AUTHORIZED_FROM_ADDRESSES contains an invalid email address.");
        }
    }

    return addresses;
}

function getEmailConfig(): EmailConfig {
    if (emailConfig) return emailConfig;

    const host = (process.env.SMTP_HOST || DEFAULT_SMTP_HOST).trim().toLowerCase();
    const provider = getSmtpProvider(host);
    const isResendSmtp = provider === "resend";
    const googleSmtp = provider === "gmail" || provider === "google_workspace_relay";
    const user = process.env.SMTP_USER
        || (isResendSmtp ? "resend" : process.env.GOOGLE_EMAIL_ADDRESS?.trim());
    const googleAppPassword = normalizeGoogleAppPassword(process.env.GOOGLE_APP_PASSWORD);
    const password = process.env.SMTP_PASSWORD
        || (isResendSmtp
            ? process.env.RESEND_API_KEY
            : googleAppPassword);
    const oauthValues = [
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REFRESH_TOKEN,
    ];
    const oauthValueCount = oauthValues.filter(Boolean).length;

    if (!user) {
        throw new Error("SMTP username is not configured.");
    }

    if (googleSmtp && oauthValueCount > 0 && oauthValueCount < oauthValues.length) {
        throw new Error("Google OAuth2 SMTP configuration is incomplete.");
    }

    const usesGoogleOauth = googleSmtp && oauthValueCount === oauthValues.length;
    if (!usesGoogleOauth && !password) {
        throw new Error("SMTP credentials are not configured.");
    }

    if (googleSmtp && !EMAIL_PATTERN.test(user)) {
        throw new Error("Google SMTP requires the complete authenticated email address.");
    }

    if (
        googleSmtp
        && !usesGoogleOauth
        && !process.env.SMTP_PASSWORD
        && (googleAppPassword?.length !== 16 || !/^[A-Za-z0-9]+$/.test(googleAppPassword))
    ) {
        throw new Error("GOOGLE_APP_PASSWORD must contain exactly 16 characters without spaces.");
    }

    const port = parsePositiveInteger(process.env.SMTP_PORT, DEFAULT_SMTP_PORT);
    const secure = parseBoolean(process.env.SMTP_SECURE, port === 465);

    if (port === 465 && !secure) {
        throw new Error("SMTP port 465 requires implicit TLS (SMTP_SECURE=true).");
    }

    if (port === 587 && secure) {
        throw new Error("SMTP port 587 requires STARTTLS (SMTP_SECURE=false).");
    }

    if (process.env.NODE_ENV === "production" && port === 25) {
        throw new Error("SMTP port 25 is not allowed for the production sender.");
    }

    if (provider === "gmail" || provider === "google_workspace_relay") {
        if (port !== 465 && port !== 587) {
            throw new Error("Google SMTP must use TLS port 465 or STARTTLS port 587.");
        }
    } else if (isResendSmtp) {
        const implicitTls = port === 465 || port === 2465;
        const startTls = port === 587 || port === 2587;
        if ((!implicitTls && !startTls) || secure !== implicitTls) {
            throw new Error("Resend SMTP port and SMTP_SECURE settings do not match its TLS requirements.");
        }
    }

    const auth = usesGoogleOauth
        ? {
            type: "OAuth2" as const,
            user,
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
            refreshToken: process.env.GOOGLE_REFRESH_TOKEN!,
        }
        : { user, pass: password! };
    const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim() || user;

    if (
        provider === "gmail"
        && !getAuthorizedGmailFromAddresses(user).has(fromAddress.toLowerCase())
    ) {
        throw new Error(
            "EMAIL_FROM_ADDRESS must match the Gmail account or an explicitly authorized Gmail Send As alias.",
        );
    }

    const transportOptions = {
        host,
        port,
        secure,
        requireTLS: !secure,
        auth,
        pool: true,
        maxConnections: parsePositiveInteger(
            process.env.SMTP_MAX_CONNECTIONS,
            googleSmtp ? 1 : 3,
        ),
        maxMessages: parsePositiveInteger(process.env.SMTP_MAX_MESSAGES, 50),
        // Let the durable database outbox own retries. In-memory SMTP pool
        // requeues can outlive a serverless invocation and make delivery ambiguous.
        maxRequeues: 0,
        rateDelta: 1_000,
        rateLimit: parsePositiveInteger(
            process.env.SMTP_RATE_LIMIT,
            googleSmtp ? 1 : 5,
        ),
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
        disableFileAccess: true,
        disableUrlAccess: true,
        tls: {
            minVersion: "TLSv1.2",
            rejectUnauthorized: true,
            servername: host,
        },
    } as SMTPPool.Options & { maxRequeues: number };
    const transporter = nodemailer.createTransport(transportOptions);

    emailConfig = {
        transporter,
        provider,
        authenticatedUser: user,
        authMode: usesGoogleOauth ? "oauth2" : "password",
        isResendSmtp,
        from: {
            name: process.env.EMAIL_FROM_NAME || "Harvesters Globe Attendance",
            address: fromAddress,
        },
    };

    return emailConfig;
}

export function assertAutomaticEmailDeliveryIsProductionSafe() {
    if (process.env.NODE_ENV !== "production") return;

    const config = getEmailConfig();
    const fromAddress = config.from.address;
    const replyTo = (
        process.env.EMAIL_REPLY_TO
        || process.env.GOOGLE_EMAIL_ADDRESS
    )?.trim();
    if (!fromAddress || !EMAIL_PATTERN.test(fromAddress)) {
        throw new Error("EMAIL_FROM_ADDRESS must be an authorized sender address.");
    }

    if (!replyTo || !EMAIL_PATTERN.test(replyTo)) {
        throw new Error("EMAIL_REPLY_TO must be a monitored email address.");
    }

    if (
        config.provider === "gmail"
        && isPersonalGoogleAddress(config.authenticatedUser)
        && process.env.EMAIL_ALLOW_PERSONAL_GMAIL_AUTOMATION !== "true"
    ) {
        throw new Error(
            "Personal Gmail automation is limited to controlled testing. Set up Google Workspace SMTP Relay for production.",
        );
    }

    if (
        config.provider === "google_workspace_relay"
        && isPersonalGoogleAddress(config.authenticatedUser)
    ) {
        throw new Error("Google Workspace SMTP Relay requires a Workspace-domain account.");
    }

    const configuredAppUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (!configuredAppUrl || new URL(configuredAppUrl).protocol !== "https:") {
        throw new Error("The production application URL must be configured with HTTPS.");
    }

    getMessageIdDomain();
}

function escapeHtml(value: string) {
    return value.replace(/[&<>'"]/g, (character) => {
        const entities: Record<string, string> = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;",
        };
        return entities[character];
    });
}

function sanitizeHeaderText(value: string, fallback: string) {
    const sanitized = value.replace(/[\u0000-\u001F\u007F]+/g, " ").trim();
    return (sanitized || fallback).slice(0, 160);
}

function getPublicAssetUrl(path: string) {
    const configuredUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;

    try {
        return new URL(path, configuredUrl).toString();
    } catch {
        throw new Error("APP_URL is not a valid absolute URL.");
    }
}

function renderEmailShell({
    preheader,
    eyebrow,
    content,
}: {
    preheader: string;
    eyebrow: string;
    content: string;
}) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(preheader)}</title>
</head>
<body style="margin:0;padding:0;background-color:#000000;color:#ffffff;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#000000;padding:40px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#0a0a0a;border-radius:16px;border:1px solid #1f1f1f;overflow:hidden;">
                    <tr>
                        <td align="center" style="padding:36px 30px 24px;border-bottom:1px solid #1f1f1f;">
                            <img src="cid:harvesters-globe-logo" alt="Harvesters Globe Attendance" width="56" style="display:block;width:56px;height:auto;margin:0 auto 14px;border:0;" />
                            <div style="font-size:11px;font-weight:700;color:#34A853;text-transform:uppercase;letter-spacing:2px;">${escapeHtml(eyebrow)}</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px 32px 36px;background-color:#0a0a0a;">${content}</td>
                    </tr>
                    <tr>
                        <td align="center" style="background-color:#000000;padding:24px 20px;border-top:1px solid #1f1f1f;">
                            <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#a1a1aa;">Harvesters International Christian Centre</p>
                            <p style="margin:0;font-size:11px;color:#52525b;">Changing Lives &bull; Changing the World</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

function getLogoContent() {
    if (!logoContentPromise) {
        logoContentPromise = readFile(path.join(process.cwd(), "public", "Harvester-icon.png"));
    }

    return logoContentPromise;
}

function getMessageIdDomain() {
    const candidate = (
        process.env.EMAIL_MESSAGE_ID_DOMAIN
        || new URL(
            process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL,
        ).hostname
    ).trim().toLowerCase();

    if (
        candidate.length > 253
        || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(candidate)
    ) {
        throw new Error("EMAIL_MESSAGE_ID_DOMAIN must be a valid hostname.");
    }

    return candidate;
}

async function sendEmail(
    options: Omit<SendMailOptions, "from">,
    notificationId?: string,
): Promise<EmailSendResult> {
    try {
        const config = getEmailConfig();
        const logoContent = await getLogoContent();
        const idempotencyHeaders = notificationId && config.isResendSmtp
            ? { "Resend-Idempotency-Key": notificationId }
            : undefined;
        const messageIdDomain = getMessageIdDomain();
        const info = await config.transporter.sendMail({
            ...options,
            from: config.from,
            replyTo: process.env.EMAIL_REPLY_TO
                || process.env.GOOGLE_EMAIL_ADDRESS
                || options.replyTo,
            messageId: notificationId ? `<${notificationId}@${messageIdDomain}>` : options.messageId,
            headers: {
                ...options.headers,
                ...idempotencyHeaders,
            },
            attachments: [
                ...(options.attachments || []),
                {
                    filename: "harvesters-globe-icon.png",
                    content: logoContent,
                    cid: "harvesters-globe-logo",
                    contentType: "image/png",
                },
            ],
        });

        console.info("[Email] Message accepted by SMTP provider.", { messageId: info.messageId });
        return { success: true, emailId: info.messageId };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Email dispatch failed.";
        console.error("[Email] SMTP dispatch failed.", { message });
        return { success: false, error: message };
    }
}

export interface SendWelcomeEmailParams {
    toEmail: string;
    firstName: string;
    lastName?: string;
    workerId: string;
    department: string;
    team?: string | null;
    notificationId?: string;
}

export async function sendWelcomeEmail({
    toEmail,
    firstName,
    lastName = "",
    workerId,
    department,
    team,
    notificationId,
}: SendWelcomeEmailParams): Promise<EmailSendResult> {
    const safeFirstName = escapeHtml(firstName);
    const safeFullName = escapeHtml(`${firstName} ${lastName}`.trim());
    const safeWorkerId = escapeHtml(workerId);
    const teamDisplay = escapeHtml(team ? `${team} — ${department}` : department);
    const dashboardUrl = getPublicAssetUrl("/dashboard");
    const subjectFirstName = sanitizeHeaderText(firstName, "there");

    const html = renderEmailShell({
        preheader: `Welcome to Harvesters Globe Attendance, ${firstName}.`,
        eyebrow: "Globe Attendance System",
        content: `
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#ffffff;">Welcome to the Team, <span style="color:#34A853;">${safeFirstName}</span>!</h1>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#a1a1aa;">We are excited to welcome you to the Harvesters Workforce. Your account has been successfully set up on the Harvesters Globe Attendance platform.</p>
            <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#a1a1aa;">Thank you for your commitment to serving with excellence. Below are your official worker details:</p>
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#141414;border-radius:12px;border:1px solid #262626;padding:20px;margin-bottom:28px;">
                <tr><td>
                    <div style="font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Official Worker ID</div>
                    <div style="font-family:'Courier New',monospace;font-size:22px;font-weight:700;color:#34A853;letter-spacing:1px;margin-bottom:18px;">${safeWorkerId}</div>
                    <div style="border-top:1px solid #262626;padding-top:16px;">
                        <div style="font-size:14px;font-weight:600;color:#ffffff;">${safeFullName}</div>
                        <div style="font-size:13px;font-weight:600;color:#34A853;margin-top:6px;">${teamDisplay}</div>
                    </div>
                </td></tr>
            </table>
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <tr><td align="center"><a href="${dashboardUrl}" target="_blank" style="display:inline-block;width:100%;max-width:320px;background-color:#34A853;color:#ffffff;font-size:15px;font-weight:700;text-align:center;text-decoration:none;padding:14px 24px;border-radius:8px;box-sizing:border-box;">Go to Attendance Dashboard &rarr;</a></td></tr>
            </table>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a;text-align:center;">If you have any questions or need assistance marking attendance, please reach out to your department head.</p>`,
    });

    const text = [
        `Welcome to the Team, ${firstName}!`,
        "",
        "Your Harvesters Globe Attendance account has been successfully set up.",
        `Worker ID: ${workerId}`,
        `Name: ${`${firstName} ${lastName}`.trim()}`,
        `Team / Department: ${team ? `${team} — ${department}` : department}`,
        "",
        `Open your attendance dashboard: ${dashboardUrl}`,
    ].join("\n");

    return sendEmail({
        to: toEmail,
        subject: `Welcome to the Team, ${subjectFirstName}! | Harvesters Globe Attendance`,
        text,
        html,
    }, notificationId);
}

export interface SendEventReminderEmailParams {
    toEmail: string;
    firstName: string;
    eventTitle: string;
    eventStart: Date;
    timezone: string;
    locationName?: string | null;
    reminderLeadMinutes?: number;
    notificationId?: string;
    isTest?: boolean;
}

export async function sendEventReminderEmail({
    toEmail,
    firstName,
    eventTitle,
    eventStart,
    timezone,
    locationName,
    reminderLeadMinutes = 30,
    notificationId,
    isTest = false,
}: SendEventReminderEmailParams): Promise<EmailSendResult> {
    const formattedStart = new Intl.DateTimeFormat("en-NG", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: timezone,
    }).format(eventStart);
    const safeFirstName = escapeHtml(firstName);
    const safeEventTitle = escapeHtml(eventTitle);
    const safeFormattedStart = escapeHtml(formattedStart);
    const safeLocationName = locationName ? escapeHtml(locationName) : null;
    const dashboardUrl = getPublicAssetUrl("/dashboard");
    const subjectPrefix = isTest ? "[TEST] " : "";
    const subjectEventTitle = sanitizeHeaderText(eventTitle, "Upcoming event");

    const html = renderEmailShell({
        preheader: `${isTest ? "Test reminder: " : "Reminder: "}${eventTitle} starts in ${reminderLeadMinutes} minutes.`,
        eyebrow: isTest ? "Test Email — No Event Scheduled" : "Event Reminder",
        content: `
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#ffffff;">Your event begins in <span style="color:#34A853;">${reminderLeadMinutes} minutes</span></h1>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#a1a1aa;">Hello ${safeFirstName}, this is a reminder that you are expected at the following event. Please remember to check in when you arrive.</p>
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#141414;border-radius:12px;border:1px solid #262626;padding:20px;margin-bottom:28px;">
                <tr><td>
                    <div style="font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Event</div>
                    <div style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px;">${safeEventTitle}</div>
                    <div style="font-size:13px;line-height:1.6;color:#a1a1aa;"><strong style="color:#ffffff;">Starts:</strong> ${safeFormattedStart}</div>
                    ${safeLocationName ? `<div style="font-size:13px;line-height:1.6;color:#a1a1aa;margin-top:4px;"><strong style="color:#ffffff;">Location:</strong> ${safeLocationName}</div>` : ""}
                </td></tr>
            </table>
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr><td align="center"><a href="${dashboardUrl}" target="_blank" style="display:inline-block;width:100%;max-width:320px;background-color:#34A853;color:#ffffff;font-size:15px;font-weight:700;text-align:center;text-decoration:none;padding:14px 24px;border-radius:8px;box-sizing:border-box;">Open Attendance Dashboard &rarr;</a></td></tr>
            </table>`,
    });

    const text = [
        `${isTest ? "TEST — " : ""}Event reminder`,
        "",
        `Hello ${firstName},`,
        `${eventTitle} begins in ${reminderLeadMinutes} minutes. Please remember to check in when you arrive.`,
        `Starts: ${formattedStart}`,
        locationName ? `Location: ${locationName}` : null,
        "",
        `Open your attendance dashboard: ${dashboardUrl}`,
        isTest ? "This is a test email. No event was scheduled and no other recipient was contacted." : null,
    ].filter(Boolean).join("\n");

    return sendEmail({
        to: toEmail,
        subject: `${subjectPrefix}${subjectEventTitle} starts in ${reminderLeadMinutes} minutes | Harvesters Globe Attendance`,
        text,
        html,
    }, notificationId);
}

export interface SendMissedAttendanceEmailParams {
    toEmail: string;
    ccEmails?: string[];
    firstName: string;
    eventTitle: string;
    eventStart: Date;
    eventEnd: Date;
    timezone: string;
    departmentName?: string | null;
    notificationId?: string;
}

export async function sendMissedAttendanceEmail({
    toEmail,
    ccEmails = [],
    firstName,
    eventTitle,
    eventStart,
    eventEnd,
    timezone,
    departmentName,
    notificationId,
}: SendMissedAttendanceEmailParams): Promise<EmailSendResult> {
    const dateFormatter = new Intl.DateTimeFormat("en-NG", {
        dateStyle: "full",
        timeZone: timezone,
    });
    const timeFormatter = new Intl.DateTimeFormat("en-NG", {
        timeStyle: "short",
        timeZone: timezone,
    });
    const eventDate = dateFormatter.format(eventStart);
    const eventTime = `${timeFormatter.format(eventStart)}–${timeFormatter.format(eventEnd)}`;
    const safeFirstName = escapeHtml(firstName);
    const safeEventTitle = escapeHtml(eventTitle);
    const safeEventDate = escapeHtml(eventDate);
    const safeEventTime = escapeHtml(eventTime);
    const safeDepartmentName = departmentName ? escapeHtml(departmentName) : null;
    const dashboardUrl = getPublicAssetUrl("/dashboard");
    const subjectEventTitle = sanitizeHeaderText(eventTitle, "today's event");

    const html = renderEmailShell({
        preheader: `We noticed no attendance was recorded for ${eventTitle}. We hope everything is okay.`,
        eyebrow: "Attendance Follow-up",
        content: `
            <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#ffffff;">Hello ${safeFirstName}, <span style="color:#34A853;">we missed you today</span></h1>
            <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#a1a1aa;">We noticed that no attendance was recorded for you at the event below, and we wanted to check that everything is okay.</p>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#a1a1aa;">If you attended but could not check in, please reply or let your department head know so the attendance record can be reviewed. If you could not attend, you may also reply if there is any support you need.</p>
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#141414;border-radius:12px;border:1px solid #262626;padding:20px;margin-bottom:28px;">
                <tr><td>
                    <div style="font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Event</div>
                    <div style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:16px;">${safeEventTitle}</div>
                    <div style="font-size:13px;line-height:1.6;color:#a1a1aa;"><strong style="color:#ffffff;">Date:</strong> ${safeEventDate}</div>
                    <div style="font-size:13px;line-height:1.6;color:#a1a1aa;margin-top:4px;"><strong style="color:#ffffff;">Time:</strong> ${safeEventTime}</div>
                    ${safeDepartmentName ? `<div style="font-size:13px;line-height:1.6;color:#a1a1aa;margin-top:4px;"><strong style="color:#ffffff;">Department:</strong> ${safeDepartmentName}</div>` : ""}
                </td></tr>
            </table>
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr><td align="center"><a href="${dashboardUrl}" target="_blank" style="display:inline-block;width:100%;max-width:320px;background-color:#34A853;color:#ffffff;font-size:15px;font-weight:700;text-align:center;text-decoration:none;padding:14px 24px;border-radius:8px;box-sizing:border-box;">Review Attendance Dashboard &rarr;</a></td></tr>
            </table>
            <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#71717a;text-align:center;">Relevant attendance leaders have been copied so they can help resolve any check-in issue.</p>`,
    });

    const text = [
        `Hello ${firstName}, we missed you today.`,
        "",
        `No attendance was recorded for you at ${eventTitle}. We hope everything is okay.`,
        `Date: ${eventDate}`,
        `Time: ${eventTime}`,
        departmentName ? `Department: ${departmentName}` : null,
        "",
        "If you attended but could not check in, please reply or let your department head know so the attendance record can be reviewed.",
        "If you could not attend, you may reply if there is any support you need.",
        "",
        `Review your attendance dashboard: ${dashboardUrl}`,
    ].filter(Boolean).join("\n");

    return sendEmail({
        to: toEmail,
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        subject: `We missed you at ${subjectEventTitle} | Harvesters Globe Attendance`,
        text,
        html,
    }, notificationId);
}
