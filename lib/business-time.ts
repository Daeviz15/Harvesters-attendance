export const APP_TIME_ZONE = "Africa/Lagos";

export function getDateKeyInTimeZone(
    date: Date = new Date(),
    timeZone: string = APP_TIME_ZONE,
) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;

    if (!year || !month || !day) {
        throw new Error(`Unable to determine the current date in ${timeZone}.`);
    }

    return `${year}-${month}-${day}`;
}
