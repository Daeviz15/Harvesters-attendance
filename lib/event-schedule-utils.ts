import { APP_TIME_ZONE, getDateKeyInTimeZone } from "./business-time";

export const recurrenceDayCodes: Record<string, string> = {
    Sunday: "SU",
    Monday: "MO",
    Tuesday: "TU",
    Wednesday: "WE",
    Thursday: "TH",
    Friday: "FR",
    Saturday: "SA",
};

export function getTimeKeyInTimeZone(
    date: Date = new Date(),
    timeZone: string = APP_TIME_ZONE,
) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(date);

    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;

    if (!hour || !minute) {
        throw new Error(`Unable to determine the current time in ${timeZone}.`);
    }

    return `${hour}:${minute}`;
}

export function getWeekdayInTimeZone(
    date: Date = new Date(),
    timeZone: string = APP_TIME_ZONE,
) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "long",
    }).format(date);
}

export interface QuickStartScheduleResult {
    newStartDate: string;
    newStartTime: string;
    newEndTime: string;
    newWeekday: string;
    durationMinutes: number;
    timezone: string;
}

export function calculateQuickStartSchedule(
    event: {
        start_date?: string | null;
        start_time?: string | null;
        end_time?: string | null;
        timezone?: string | null;
        schedule_frequency?: string | null;
        recurrence_day?: string | null;
    },
    options?: {
        customStartTime?: string;
        customEndTime?: string;
        overrideDurationMinutes?: number;
    }
): QuickStartScheduleResult {
    const tz = event.timezone || APP_TIME_ZONE;
    const now = new Date();
    const todayDate = getDateKeyInTimeZone(now, tz);
    const currentWeekday = getWeekdayInTimeZone(now, tz);
    const nowTime = getTimeKeyInTimeZone(now, tz);

    let newStartTime = options?.customStartTime || nowTime;

    // Boundary check for midnight edge case: if start time is 23:59, clamp to 23:58 to allow at least 1 min before midnight
    if (newStartTime >= "23:59") {
        newStartTime = "23:58";
    }

    // Calculate original duration in minutes
    let durationMinutes = 120; // default 2 hours
    if (options?.overrideDurationMinutes && options.overrideDurationMinutes > 0) {
        durationMinutes = options.overrideDurationMinutes;
    } else if (event.start_time && event.end_time) {
        const [sH, sM] = event.start_time.slice(0, 5).split(":").map(Number);
        const [eH, eM] = event.end_time.slice(0, 5).split(":").map(Number);
        if (!isNaN(sH) && !isNaN(sM) && !isNaN(eH) && !isNaN(eM)) {
            const diff = (eH * 60 + eM) - (sH * 60 + sM);
            if (diff > 0) {
                durationMinutes = diff;
            }
        }
    }

    let newEndTime = options?.customEndTime;
    if (!newEndTime) {
        const [startH, startM] = newStartTime.split(":").map(Number);
        const totalEndMinutes = (startH * 60 + startM) + durationMinutes;
        if (totalEndMinutes >= 1440) {
            newEndTime = "23:59";
        } else {
            const endH = String(Math.floor(totalEndMinutes / 60)).padStart(2, "0");
            const endM = String(totalEndMinutes % 60).padStart(2, "0");
            newEndTime = `${endH}:${endM}`;
        }
    }

    // Strict validation: end time must be later than start time
    if (newEndTime <= newStartTime) {
        // Automatically compute valid end time
        const [sH, sM] = newStartTime.split(":").map(Number);
        const fallbackEndMins = Math.min(1439, (sH * 60 + sM) + Math.max(15, durationMinutes));
        const endH = String(Math.floor(fallbackEndMins / 60)).padStart(2, "0");
        const endM = String(fallbackEndMins % 60).padStart(2, "0");
        newEndTime = `${endH}:${endM}`;
    }

    return {
        newStartDate: todayDate,
        newStartTime,
        newEndTime,
        newWeekday: currentWeekday,
        durationMinutes,
        timezone: tz,
    };
}
