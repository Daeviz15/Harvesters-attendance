import { useCallback, useEffect, useRef, useState } from 'react';
import {
    assessLocationConfirmation,
    type CheckInLocation,
    type LocationConfirmationStatus,
} from '@/lib/location-confirmation';

export type ActiveLocation = CheckInLocation;

export type GeolocationState = {
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    positionTimestamp: number | null;
    isWithinPerimeter: boolean;
    locationId: string | null;
    locationName: string | null;
    distance: number | null;
    confirmationStatus: LocationConfirmationStatus | 'idle' | 'acquiring';
    error: string | null;
    isLoading: boolean;
    retry: () => void;
};

const EMPTY_STATE = {
    lat: null,
    lng: null,
    accuracy: null,
    positionTimestamp: null,
    isWithinPerimeter: false,
    locationId: null,
    locationName: null,
    distance: null,
    confirmationStatus: 'idle' as const,
    error: null,
    isLoading: false,
};

/**
 * Ring buffer that keeps the N most recent GPS readings and lets the
 * consumer pick the one with the best (lowest) accuracy. This avoids
 * false "outside perimeter" results from a single bad first fix —
 * standard practice in production geofencing.
 */
const GPS_RING_SIZE = 3;
type GpsReading = { latitude: number; longitude: number; accuracy: number; timestamp: number };

function pickBestReading(readings: GpsReading[]): GpsReading | null {
    if (readings.length === 0) return null;
    return readings.reduce((best, r) => (r.accuracy < best.accuracy ? r : best));
}

/**
 * Watches a location only while a worker can actually check in.
 *
 * The returned confirmation is immediate UI guidance. The server repeats the
 * same branch policy before writing attendance; browser geolocation is not a
 * trusted authorization signal on its own.
 */
export function useGeolocation(activeLocations: ActiveLocation[] = [], enabled = false): GeolocationState {
    const activeLocationsKey = JSON.stringify(activeLocations);
    const [refreshGeneration, setRefreshGeneration] = useState(0);
    const [state, setState] = useState<Omit<GeolocationState, 'retry'>>({
        ...EMPTY_STATE,
        isLoading: enabled && activeLocations.length > 0,
        confirmationStatus: enabled && activeLocations.length > 0 ? 'acquiring' : 'idle',
    });
    const gpsRing = useRef<GpsReading[]>([]);

    const retry = useCallback(() => {
        gpsRing.current = [];
        setState({
            ...EMPTY_STATE,
            confirmationStatus: 'acquiring',
            isLoading: true,
        });
        setRefreshGeneration((generation) => generation + 1);
    }, []);

    useEffect(() => {
        if (!enabled) {
            gpsRing.current = [];
            const clearStateTimer = window.setTimeout(() => setState(EMPTY_STATE), 0);
            return () => window.clearTimeout(clearStateTimer);
        }

        const monitoredLocations = JSON.parse(activeLocationsKey) as ActiveLocation[];
        if (monitoredLocations.length === 0) {
            const unavailableTimer = window.setTimeout(() => {
                setState({
                    ...EMPTY_STATE,
                    confirmationStatus: 'unavailable',
                    error: 'This event doesn\u2019t have a check-in location set up yet. Please let your leader know.',
                });
            }, 0);
            return () => window.clearTimeout(unavailableTimer);
        }

        if (!('geolocation' in navigator)) {
            const unsupportedTimer = window.setTimeout(() => {
                setState({
                    ...EMPTY_STATE,
                    confirmationStatus: 'unavailable',
                    error: 'Your browser doesn\u2019t support location services. Please open this page in Chrome or Safari on your phone.',
                });
            }, 0);
            return () => window.clearTimeout(unsupportedTimer);
        }

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;

                // Push into the ring buffer and evaluate the best reading
                const ring = gpsRing.current;
                ring.push({ latitude, longitude, accuracy, timestamp: position.timestamp });
                if (ring.length > GPS_RING_SIZE) ring.shift();
                const best = pickBestReading(ring)!;

                const confirmation = assessLocationConfirmation(
                    best.latitude,
                    best.longitude,
                    best.accuracy,
                    monitoredLocations,
                );

                setState({
                    lat: best.latitude,
                    lng: best.longitude,
                    accuracy: best.accuracy,
                    positionTimestamp: best.timestamp,
                    isWithinPerimeter: confirmation.status === 'confirmed',
                    locationId: confirmation.location?.id ?? null,
                    locationName: confirmation.location?.name ?? null,
                    distance: confirmation.closestDistance,
                    confirmationStatus: confirmation.status,
                    error: null,
                    isLoading: false,
                });
            },
            (positionError) => {
                if (positionError.code === positionError.PERMISSION_DENIED) {
                    setState({
                        ...EMPTY_STATE,
                        confirmationStatus: 'unavailable',
                        error: 'Location permission is turned off. Please allow location access in your phone settings, then try again.',
                    });
                    return;
                }

                if (positionError.code === positionError.POSITION_UNAVAILABLE) {
                    setState((current) => ({
                        ...current,
                        confirmationStatus: current.lat === null ? 'unavailable' : current.confirmationStatus,
                        error: 'Your phone couldn\u2019t find your location. Try stepping outside briefly or near a window.',
                        isLoading: false,
                    }));
                    return;
                }

                // A watch timeout is transient. Keep the most recent reading
                // if one exists and let the browser continue the watch.
                setState((current) => ({
                    ...current,
                    confirmationStatus: current.lat === null ? 'unavailable' : current.confirmationStatus,
                    error: current.lat === null
                        ? 'Still trying to find you. Step outside or near a window for a better signal.'
                        : current.error,
                    isLoading: false,
                }));
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 10_000,
            },
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [activeLocationsKey, enabled, refreshGeneration]);

    return { ...state, retry };
}
