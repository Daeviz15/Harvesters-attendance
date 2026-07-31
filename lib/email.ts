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
    const teamDisplay = team ? `${team} — ${department}` : department;
    const appDashboardUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://globeattendance.org/dashboard';
    const logoUrl = 'https://globeattendance.org/logo.png';

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to Harvesters Globe Attendance</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #000000; color: #ffffff; -webkit-font-smoothing: antialiased;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #000000; padding: 40px 16px;">
        <tr>
            <td align="center">
                <!-- Main Email Outer Container (Solid Dark, No Glows) -->
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #0a0a0a; border-radius: 16px; border: 1px solid #1f1f1f; overflow: hidden;">
                    
                    <!-- Header Section with Official Harvesters Logo -->
                    <tr>
                        <td align="center" style="padding: 36px 30px 24px 30px; text-align: center; border-bottom: 1px solid #1f1f1f; background-color: #0a0a0a;">
                            <img src="${logoUrl}" alt="Harvesters Globe Attendance" width="140" style="display: block; width: 140px; height: auto; margin: 0 auto 14px auto; border: 0;" />
                            <div style="font-family: 'Outfit', sans-serif; font-size: 11px; font-weight: 700; color: #34A853; text-transform: uppercase; letter-spacing: 2px;">
                                GLOBE ATTENDANCE SYSTEM
                            </div>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 32px 32px 36px 32px; background-color: #0a0a0a;">
                            <h1 style="margin: 0 0 16px 0; font-family: 'Outfit', sans-serif; font-size: 24px; font-weight: 700; color: #ffffff;">
                                Welcome to the Team, <span style="color: #34A853;">${firstName}</span>!
                            </h1>
                            <p style="margin: 0 0 20px 0; font-family: 'Outfit', sans-serif; font-size: 14px; line-height: 1.6; color: #a1a1aa;">
                                We are excited to welcome you to the Harvesters Workforce. Your account has been successfully set up on the Harvesters Globe Attendance platform.
                            </p>
                            <p style="margin: 0 0 28px 0; font-family: 'Outfit', sans-serif; font-size: 14px; line-height: 1.6; color: #a1a1aa;">
                                Thank you for your commitment to serving with excellence. Below are your official worker credentials:
                            </p>

                            <!-- Credentials Box (Solid Dark background, No Glows) -->
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #141414; border-radius: 12px; border: 1px solid #262626; padding: 20px; margin-bottom: 28px;">
                                <tr>
                                    <td>
                                        <!-- Worker ID Display -->
                                        <div style="font-family: 'Outfit', sans-serif; font-size: 10px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px;">
                                            OFFICIAL WORKER ID
                                        </div>
                                        <div style="font-family: 'Courier New', Courier, monospace; font-size: 22px; font-weight: 700; color: #34A853; letter-spacing: 1px; margin-bottom: 18px;">
                                            ${workerId}
                                        </div>

                                        <!-- Detail Grid -->
                                        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px solid #262626; padding-top: 16px;">
                                            <tr>
                                                <td width="50%" style="padding-right: 8px; vertical-align: top;">
                                                    <div style="font-family: 'Outfit', sans-serif; font-size: 10px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 1px;">NAME</div>
                                                    <div style="font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600; color: #ffffff; margin-top: 4px;">${fullName}</div>
                                                </td>
                                                <td width="50%" style="padding-left: 8px; vertical-align: top;">
                                                    <div style="font-family: 'Outfit', sans-serif; font-size: 10px; font-weight: 700; color: #71717a; text-transform: uppercase; letter-spacing: 1px;">TEAM / DEPARTMENT</div>
                                                    <div style="font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600; color: #34A853; margin-top: 4px;">${teamDisplay}</div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- CTA Button (Solid Green, No Shadows or Glows) -->
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 28px;">
                                <tr>
                                    <td align="center">
                                        <a href="${appDashboardUrl}" target="_blank" style="display: inline-block; width: 100%; max-width: 320px; background-color: #34A853; color: #ffffff; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 700; text-align: center; text-decoration: none; padding: 14px 24px; border-radius: 8px; box-sizing: border-border-box;">
                                            Go to Attendance Dashboard &rarr;
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 13px; line-height: 1.6; color: #71717a; text-align: center;">
                                If you have any questions or need assistance marking attendance, please reach out to your department head.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer Section -->
                    <tr>
                        <td align="center" style="background-color: #000000; padding: 24px 20px; border-top: 1px solid #1f1f1f; text-align: center;">
                            <p style="margin: 0 0 4px 0; font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 600; color: #a1a1aa;">
                                Harvesters International Christian Centre
                            </p>
                            <p style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 11px; color: #52525b;">
                                Changing Lives &bull; Changing the World
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
