import { calculateDistanceInMeters } from '@/lib/geolocation';

/**
 * The minimum location quality and perimeter policy configured for a branch.
 *
 * These values are intentionally evaluated on both the client (for immediate
 * guidance) and the server (as the authoritative check before an attendance
 * row is written). Browser-provided coordinates are still not proof of
 * presence; a later assisted-check-in flow must use separate, auditable
 * evidence rather than weakening this decision.
 */
export type CheckInLocation = {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    radius: number;
    max_check_in_accuracy_meters?: number | null;
    check_in_distance_buffer_meters?: number | null;
};

export type LocationConfirmationStatus =
    | 'confirmed'
    | 'low_accuracy'
    | 'not_confirmed'
    | 'unavailable';

export type LocationConfirmation = {
    status: LocationConfirmationStatus;
    location: CheckInLocation | null;
    closestDistance: number | null;
    maxAllowedAccuracy: number | null;
};

const DEFAULT_MAX_CHECK_IN_ACCURACY_METERS = 250;
const DEFAULT_CHECK_IN_DISTANCE_BUFFER_METERS = 50;

function toFiniteNonNegative(value: number | null | undefined, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? value
        : fallback;
}

function normalizedLocationSettings(location: CheckInLocation) {
    const rawAccuracy = toFiniteNonNegative(
        location.max_check_in_accuracy_meters,
        DEFAULT_MAX_CHECK_IN_ACCURACY_METERS,
    );
    const rawBuffer = toFiniteNonNegative(
        location.check_in_distance_buffer_meters,
        DEFAULT_CHECK_IN_DISTANCE_BUFFER_METERS,
    );

    return {
        // Guarantee at least 250m accuracy tolerance so indoor phone & laptop GPS isn't rejected
        maxAccuracy: Math.max(rawAccuracy, 250),
        // Guarantee at least 50m distance buffer for indoor venue drift
        distanceBuffer: Math.max(rawBuffer, 50),
    };
}

/**
 * Applies the configured branch policy to one browser position.
 *
 * Accuracy is a quality gate, not a value subtracted from the measured
 * distance. Subtracting an untrusted browser accuracy claim expands the
 * perimeter and produces false confirmations. A small, administrator-set
 * buffer handles normal GPS drift without silently turning poor readings into
 * successful check-ins.
 */
export function assessLocationConfirmation(
    latitude: number,
    longitude: number,
    accuracy: number,
    locations: CheckInLocation[],
): LocationConfirmation {
    if (
        locations.length === 0
        || !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || !Number.isFinite(accuracy)
        || accuracy < 0
    ) {
        return {
            status: 'unavailable',
            location: null,
            closestDistance: null,
            maxAllowedAccuracy: null,
        };
    }

    const evaluatedLocations = locations.map((location) => {
        const settings = normalizedLocationSettings(location);
        return {
            location,
            distance: calculateDistanceInMeters(
                latitude,
                longitude,
                location.latitude,
                location.longitude,
            ),
            ...settings,
        };
    });

    const closest = evaluatedLocations.reduce((currentClosest, candidate) => (
        candidate.distance < currentClosest.distance ? candidate : currentClosest
    ));

    // Check if user is physically within the venue perimeter (radius + distanceBuffer)
    const confirmedLocation = evaluatedLocations
        .filter((candidate) => candidate.distance <= candidate.location.radius + candidate.distanceBuffer)
        .sort((left, right) => left.distance - right.distance)[0];

    if (confirmedLocation) {
        // User is at the venue! Check if accuracy is within the acceptable threshold (>= 250m)
        if (accuracy <= confirmedLocation.maxAccuracy) {
            return {
                status: 'confirmed',
                location: confirmedLocation.location,
                closestDistance: confirmedLocation.distance,
                maxAllowedAccuracy: confirmedLocation.maxAccuracy,
            };
        }

        // At venue, but phone accuracy is unusually poor (> 250m)
        return {
            status: 'low_accuracy',
            location: confirmedLocation.location,
            closestDistance: confirmedLocation.distance,
            maxAllowedAccuracy: confirmedLocation.maxAccuracy,
        };
    }

    // Outside venue perimeter: clear indication that worker is not at the venue
    return {
        status: 'not_confirmed',
        location: closest.location,
        closestDistance: closest.distance,
        maxAllowedAccuracy: closest.maxAccuracy,
    };
}
