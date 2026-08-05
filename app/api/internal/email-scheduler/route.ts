import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processDueEmailNotifications } from "@/lib/email-notification-processor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
    const configuredSecret = process.env.EMAIL_CRON_SECRET;
    const authorization = request.headers.get("authorization");

    if (
        !configuredSecret
        || configuredSecret.length < 32
        || configuredSecret.length > 256
        || !/^[\x21-\x7E]+$/.test(configuredSecret)
        || !authorization?.startsWith("Bearer ")
    ) {
        return false;
    }

    const suppliedSecret = authorization.slice("Bearer ".length);
    if (suppliedSecret.length !== configuredSecret.length) return false;

    const configuredBuffer = Buffer.from(configuredSecret);
    const suppliedBuffer = Buffer.from(suppliedSecret);

    return configuredBuffer.length === suppliedBuffer.length
        && timingSafeEqual(configuredBuffer, suppliedBuffer);
}

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json(
            { error: "Unauthorized" },
            {
                status: 401,
                headers: { "Cache-Control": "no-store" },
            },
        );
    }

    try {
        const summary = await processDueEmailNotifications();

        console.info("[EmailScheduler] Processor run completed.", summary);
        return NextResponse.json(summary, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown scheduler failure";
        console.error("[EmailScheduler] Processor run failed.", { message });

        return NextResponse.json(
            { error: "Email scheduler processing failed" },
            {
                status: 500,
                headers: { "Cache-Control": "no-store" },
            },
        );
    }
}
