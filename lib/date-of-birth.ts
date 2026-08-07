const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateDateOfBirth(value: unknown): { dateOfBirth?: string; error?: string } {
    if (typeof value !== "string" || !DATE_ONLY_PATTERN.test(value)) {
        return { error: "Please enter a valid birthday." };
    }

    const [yearRaw, monthRaw, dayRaw] = value.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const parsed = new Date(Date.UTC(year, month - 1, day));

    if (
        parsed.getUTCFullYear() !== year
        || parsed.getUTCMonth() !== month - 1
        || parsed.getUTCDate() !== day
    ) {
        return { error: "Please enter a valid birthday." };
    }

    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const earliestAllowed = new Date(Date.UTC(1900, 0, 1));

    if (parsed > todayUtc) {
        return { error: "Birthday cannot be in the future." };
    }

    if (parsed < earliestAllowed) {
        return { error: "Please enter a realistic birthday." };
    }

    return { dateOfBirth: value };
}
