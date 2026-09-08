import { readFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_FROM_NAME = "Harvesters Globe Attendance";
const DEFAULT_FROM_ADDRESS = "admin@globeattendance.org";
const DEFAULT_APP_URL = "https://www.globeattendance.org";

export interface SendPasswordResetEmailParams {
    toEmail: string;
    resetUrl: string;
    userName?: string;
    appOrigin?: string;
}

export interface PasswordResetEmailResult {
    success: boolean;
    emailId?: string;
    error?: string;
}

let cachedLogoBase64: string | null = null;

async function getLogoBase64(): Promise<string | null> {
    if (cachedLogoBase64) return cachedLogoBase64;

    try {
        const logoPath = path.join(process.cwd(), "public", "Harvester-icon.png");
        const buffer = await readFile(logoPath);
        cachedLogoBase64 = buffer.toString("base64");
        return cachedLogoBase64;
    } catch (err) {
        console.warn("[AuthEmail] Unable to read local Harvester-icon.png:", err);
        return null;
    }
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>'"]/g, (char) => {
        const entities: Record<string, string> = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;",
        };
        return entities[char] || char;
    });
}

function renderPasswordResetHtml({
    userName,
    resetUrl,
    remoteLogoUrl,
    hasCidLogo,
}: {
    userName?: string;
    resetUrl: string;
    remoteLogoUrl: string;
    hasCidLogo: boolean;
}): string {
    const safeName = userName ? escapeHtml(userName) : null;
    const greeting = safeName ? `Hello <span style="color:#34A853;">${safeName}</span>,` : "Hello,";
    const logoSrc = hasCidLogo ? "cid:harvesters-globe-logo" : remoteLogoUrl;
    const preheader = "Reset your Harvesters Globe Attendance password.";

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${preheader}</title>
</head>
<body style="margin:0;padding:0;background-color:#000000;color:#ffffff;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#000000;padding:40px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:540px;background-color:#0a0a0a;border-radius:16px;border:1px solid #1f1f1f;overflow:hidden;">
                    <tr>
                        <td align="center" style="padding:36px 30px 24px;border-bottom:1px solid #1f1f1f;">
                            <img src="${logoSrc}" alt="Harvesters Globe Attendance" width="56" style="display:block;width:56px;height:auto;margin:0 auto 14px;border:0;" />
                            <div style="font-size:11px;font-weight:700;color:#34A853;text-transform:uppercase;letter-spacing:2px;">GLOBE ATTENDANCE SYSTEM</div>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:32px 32px 36px;background-color:#0a0a0a;">
                            <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#ffffff;text-align:left;">Reset Your Password</h1>
                            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#e4e4e7;">${greeting}</p>
                            <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#a1a1aa;">
                                We received a request to reset the password for your Harvesters Globe Attendance account. Click the button below to choose a new, secure password:
                            </p>
                            
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                                <tr>
                                    <td align="center">
                                        <a href="${resetUrl}" target="_blank" style="display:inline-block;width:100%;max-width:320px;background-color:#34A853;color:#ffffff;font-size:15px;font-weight:700;text-align:center;text-decoration:none;padding:14px 24px;border-radius:8px;box-sizing:border-box;letter-spacing:0.5px;">
                                            Reset Password &rarr;
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <div style="background-color:#141414;border-radius:10px;border:1px solid #262626;padding:16px;margin-bottom:24px;">
                                <div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Security Notice</div>
                                <p style="margin:0;font-size:13px;line-height:1.5;color:#a1a1aa;">
                                    This link will expire in <strong style="color:#ffffff;">1 hour</strong>. If you did not make this request, you can safely ignore this email. Your password will remain unchanged.
                                </p>
                            </div>

                            <p style="margin:0;font-size:12px;line-height:1.5;color:#71717a;">
                                If the button above does not work, copy and paste this link into your browser:<br />
                                <a href="${resetUrl}" target="_blank" style="color:#34A853;text-decoration:underline;word-break:break-all;">${resetUrl}</a>
                            </p>
                        </td>
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

function renderPasswordResetText({
    userName,
    resetUrl,
}: {
    userName?: string;
    resetUrl: string;
}): string {
    const greeting = userName ? `Hello ${userName},` : "Hello,";
    return [
        "Reset Your Password | Harvesters Globe Attendance",
        "",
        greeting,
        "",
        "We received a request to reset the password for your Harvesters Globe Attendance account.",
        "",
        "To choose a new password, open the link below in your browser:",
        resetUrl,
        "",
        "Security Notice: This link is valid for 1 hour. If you did not request this password reset, you can safely ignore this email. Your password will remain unchanged.",
        "",
        "Harvesters International Christian Centre",
        "Changing Lives • Changing the World",
    ].join("\n");
}

/**
 * Sends a branded password reset email strictly using the Resend REST API.
 * This is used ONLY for the forgot password flow.
 */
export async function sendPasswordResetEmail({
    toEmail,
    resetUrl,
    userName,
    appOrigin,
}: SendPasswordResetEmailParams): Promise<PasswordResetEmailResult> {
    const apiKey = process.env.RESEND_API_KEY?.trim();

    if (!apiKey) {
        console.error("[AuthEmail] RESEND_API_KEY is not configured in the environment.");
        return {
            success: false,
            error: "Password reset email service is currently unavailable. Please contact an administrator.",
        };
    }

    const fromName = process.env.EMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim() || DEFAULT_FROM_ADDRESS;
    const replyTo = process.env.EMAIL_REPLY_TO?.trim() || fromAddress;
    const origin = appOrigin || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || DEFAULT_APP_URL;
    const remoteLogoUrl = `${origin.replace(/\/+$/, "")}/Harvester-icon.png`;

    const logoBase64 = await getLogoBase64();
    const hasCidLogo = Boolean(logoBase64);

    const html = renderPasswordResetHtml({
        userName,
        resetUrl,
        remoteLogoUrl,
        hasCidLogo,
    });

    const text = renderPasswordResetText({
        userName,
        resetUrl,
    });

    const attachments: Array<{ filename: string; content: string; cid?: string }> = [];
    if (logoBase64) {
        attachments.push({
            filename: "harvester-icon.png",
            content: logoBase64,
            cid: "harvesters-globe-logo",
        });
    }

    const payload = {
        from: `${fromName} <${fromAddress}>`,
        to: [toEmail],
        reply_to: replyTo,
        subject: "Reset Your Password | Harvesters Globe Attendance",
        html,
        text,
        attachments: attachments.length > 0 ? attachments : undefined,
    };

    try {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(12000),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const errorMessage = data?.message || data?.error || `Resend API returned status ${response.status}`;
            console.error("[AuthEmail] Resend API error dispatching password reset:", errorMessage);
            return {
                success: false,
                error: errorMessage,
            };
        }

        console.info("[AuthEmail] Password reset email accepted by Resend:", {
            emailId: data?.id,
            recipient: toEmail,
        });

        return {
            success: true,
            emailId: data?.id,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to connect to email provider.";
        console.error("[AuthEmail] Resend network dispatch failed:", message);
        return {
            success: false,
            error: message,
        };
    }
}
