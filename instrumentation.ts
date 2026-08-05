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
}
