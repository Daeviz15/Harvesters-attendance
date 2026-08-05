export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    // Temporary upstream mitigation for GHSA-f88m-g3jw-g9cj while the current
    // stable Next.js release still depends on Sharp 0.34.x. These decoders are
    // the affected untrusted-input surface identified by Sharp's maintainers.
    const sharp = (await import("sharp")).default;
    sharp.block({
        operation: [
            "VipsForeignLoadNsgif",
            "VipsForeignLoadTiff",
            "VipsForeignLoadVips",
        ],
    });

    // Production-Grade Dev Cron Runner for Localhost Testing
    // Automatically runs the outbox email processor every 60 seconds when running dev server
    if (process.env.NODE_ENV === "development" || process.env.ENABLE_DEV_EMAIL_CRON === "true") {
        console.info("[DevCron] Starting automatic background email ticker (every 60s)...");
        
        // Initial tick after 5 seconds to catch any immediately due jobs
        setTimeout(async () => {
            try {
                const { processDueEmailNotifications } = await import("@/lib/email-notification-processor");
                const summary = await processDueEmailNotifications();
                if (summary.sent > 0 || summary.claimed > 0) {
                    console.info("[DevCron] Automatic email processor run completed:", summary);
                }
            } catch (err) {
                console.error("[DevCron] Ticker run error:", err instanceof Error ? err.message : err);
            }
        }, 5_000);

        setInterval(async () => {
            try {
                const { processDueEmailNotifications } = await import("@/lib/email-notification-processor");
                const summary = await processDueEmailNotifications();
                if (summary.sent > 0 || summary.claimed > 0) {
                    console.info("[DevCron] Automatic email processor run completed:", summary);
                }
            } catch (err) {
                console.error("[DevCron] Ticker run error:", err instanceof Error ? err.message : err);
            }
        }, 60_000);
    }
}
