import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

export interface SendWelcomeEmailParams {
    toEmail: string;
    firstName: string;
    lastName?: string;
    workerId: string;
    department: string;
    team?: string | null;
}

export async function sendWelcomeEmail({
    toEmail,
    firstName,
    lastName = '',
    workerId,
    department,
    team,
}: SendWelcomeEmailParams) {
    if (!resend) {
        console.warn('[Email] RESEND_API_KEY is not configured in .env. Skipping welcome email.');
        return { success: false, error: 'Resend API key missing' };
    }

    const fullName = `${firstName} ${lastName}`.trim();
    const teamDisplay = team ? `${team} (${department})` : department;
    const appDashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://globeattendance.org/dashboard';

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Harvesters Globe Attendance</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; padding: 40px 10px;">
        <tr>
            <td align="center">
                <!-- Main Email Container -->
                <table role="presentation" width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);">
                    
                    <!-- Header Banner -->
                    <tr>
                        <td align="center" style="background: linear-gradient(135deg, #0284c7 0%, #16a34a 100%); padding: 36px 20px; text-align: center;">
                            <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                                HARVESTERS
                            </h1>
                            <p style="margin: 6px 0 0 0; font-size: 13px; font-weight: 600; color: rgba(255, 255, 255, 0.9); text-transform: uppercase; letter-spacing: 2px;">
                                Globe Attendance System
                            </p>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 32px 28px;">
                            <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #ffffff;">
                                Welcome to the Team, ${firstName}! 👋
                            </h2>
                            <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                                We are thrilled to welcome you to the Harvesters Workforce. Your account has been successfully set up on the Harvesters Globe Attendance platform.
                            </p>
                            <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
                                Thank you for your commitment to serving with excellence. Below are your official worker credentials:
                            </p>

                            <!-- Credentials Badge Box -->
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0f172a; border-radius: 12px; border: 1px solid #334155; padding: 20px; margin-bottom: 28px;">
                                <tr>
                                    <td>
                                        <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 4px;">
                                            Official Worker ID
                                        </div>
                                        <div style="font-family: 'Courier New', Courier, monospace; font-size: 20px; font-weight: 700; color: #38bdf8; letter-spacing: 1px; margin-bottom: 16px;">
                                            ${workerId}
                                        </div>

                                        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                                            <tr>
                                                <td width="50%" style="padding-right: 10px;">
                                                    <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Name</div>
                                                    <div style="font-size: 14px; font-weight: 600; color: #f1f5f9; margin-top: 2px;">${fullName}</div>
                                                </td>
                                                <td width="50%" style="padding-left: 10px;">
                                                    <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">Team / Department</div>
                                                    <div style="font-size: 14px; font-weight: 600; color: #22c55e; margin-top: 2px;">${teamDisplay}</div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA Button -->
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                                <tr>
                                    <td align="center">
                                        <a href="${appDashboardUrl}" target="_blank" style="display: inline-block; background-color: #16a34a; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.4);">
                                            Go to Attendance Dashboard &rarr;
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
                                If you have any questions or need assistance marking your attendance, please reach out to your department head or system administrator.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td align="center" style="background-color: #0f172a; padding: 24px 20px; border-top: 1px solid #334155; text-align: center;">
                            <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 600; color: #64748b;">
                                Harvesters International Christian Centre &bull; Globe Attendance
                            </p>
                            <p style="margin: 0; font-size: 11px; color: #475569;">
                                Changing Lives, Changing the World.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    try {
        const { data, error } = await resend.emails.send({
            from: 'Harvesters Attendance <welcome@globeattendance.org>',
            to: [toEmail],
            subject: `Welcome to the Team, ${firstName}! | Harvesters Globe Attendance`,
            html: htmlContent,
        });

        if (error) {
            console.error('[Email] Failed to send welcome email via Resend:', error);
            return { success: false, error: error.message };
        }

        console.log('[Email] Welcome email sent successfully:', data?.id);
        return { success: true, emailId: data?.id };
    } catch (err: any) {
        console.error('[Email] Exception during email dispatch:', err);
        return { success: false, error: err.message || 'Email dispatch failed' };
    }
}
