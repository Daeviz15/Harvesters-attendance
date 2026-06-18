import { useState, useEffect } from 'react';
import { calculateDistanceInMeters } from '@/lib/geolocation';
import { TARGET_LAT, TARGET_LNG, MAX_DISTANCE_METERS } from '@/lib/constants';

interface GeolocationState {
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    isWithinPerimeter: boolean;
    distance: number | null;
    error: string | null;
    isLoading: boolean;
}

export function useGeolocation() {
    const [state, setState] = useState<GeolocationState>({
        lat: null,
        lng: null,
        accuracy: null,
        isWithinPerimeter: false,
        distance: null,
        error: null,
        isLoading: true,
    });

    useEffect(() => {
        if (!("geolocation" in navigator)) {
            setState(s => ({ ...s, error: "Geolocation is not supported by your browser", isLoading: false }));
            return;
        }

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                
                // Calculate distance on the client purely for UI responsiveness
                const distance = calculateDistanceInMeters(latitude, longitude, TARGET_LAT, TARGET_LNG);
                
                // Accuracy-aware geofencing (industry standard):
                // If the GPS accuracy circle overlaps with the geofence circle, 
                // the user is likely inside. We cap the max acceptable accuracy
                // at 300m to prevent abuse from extremely inaccurate readings.
                const MAX_ACCEPTABLE_ACCURACY = 300;
                const effectiveAccuracy = Math.min(accuracy ?? 0, MAX_ACCEPTABLE_ACCURACY);
                const isWithinPerimeter = (distance - effectiveAccuracy) <= MAX_DISTANCE_METERS;

                // Debug logging — remove after testing
                console.log(`[GEO DEBUG] Your GPS: ${latitude}, ${longitude}`);
                console.log(`[GEO DEBUG] Target:   ${TARGET_LAT}, ${TARGET_LNG}`);
                console.log(`[GEO DEBUG] Distance: ${distance.toFixed(1)}m | Accuracy: ±${accuracy?.toFixed(0)}m | Effective: ${(distance - effectiveAccuracy).toFixed(1)}m | Within: ${isWithinPerimeter}`);

                setState({
                    lat: latitude,
                    lng: longitude,
                    accuracy,
                    isWithinPerimeter,
                    distance,
                    error: null,
                    isLoading: false,
                });
            },
            (error) => {
                let errorMessage = "Unable to retrieve your location";
                
                if (error.code === error.PERMISSION_DENIED) {
                    errorMessage = "Location access denied. Please enable location services in your browser settings.";
                    setState(s => ({
                        ...s,
                        lat: null,
                        lng: null,
                        isWithinPerimeter: false,
                        distance: null,
                        error: errorMessage,
                        isLoading: false
                    }));
                } else if (error.code === error.POSITION_UNAVAILABLE) {
                    errorMessage = "GPS signal lost. Please ensure you are outdoors or near a window.";
                    setState(s => ({
                        ...s,
                        error: errorMessage,
                        isLoading: false
                    }));
                } else if (error.code === error.TIMEOUT) {
                    // Timeout errors are common and temporary. We do not clear the coordinates or set a scary error
                    // unless we haven't loaded any position yet.
                    setState(s => {
                        if (s.lat === null) {
                            return {
                                ...s,
                                error: "Searching for GPS signal...",
                                isLoading: false
                            };
                        }
                        return s; // Keep existing state if we already have coordinates
                    });
                }
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000,
            }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    return state;
}

