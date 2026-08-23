import { useState, useEffect } from 'react';
import { calculateDistanceInMeters } from '@/lib/geolocation';

interface GeolocationState {
    lat: number | null;
    lng: number | null;
    accuracy: number | null;
    isWithinPerimeter: boolean;
    locationName: string | null;
    distance: number | null;
    error: string | null;
    isLoading: boolean;
}

type ActiveLocation = { id: string, name: string, latitude: number, longitude: number, radius: number };

export function useGeolocation(activeLocations: ActiveLocation[] = []) {
    const activeLocationsKey = JSON.stringify(activeLocations);
    const [state, setState] = useState<GeolocationState>({
        lat: null,
        lng: null,
        accuracy: null,
        isWithinPerimeter: false,
        locationName: null,
        distance: null,
        error: null,
        isLoading: true,
    });

    useEffect(() => {
        const hasGeolocation = "geolocation" in navigator;
        if (!hasGeolocation) {
            const timeoutId = window.setTimeout(() => {
                setState((current) => ({
                    ...current,
                    error: "Geolocation is not supported by your browser",
                    isLoading: false,
                }));
            }, 0);
            return () => window.clearTimeout(timeoutId);
        }
        const monitoredLocations = JSON.parse(activeLocationsKey) as ActiveLocation[];

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                
                
                let minDistance = Infinity;
                let isWithinPerimeter = false;
                let locationName: string | null = null;
                
                const MAX_ACCEPTABLE_ACCURACY = 300;
                const effectiveAccuracy = Math.min(accuracy ?? 0, MAX_ACCEPTABLE_ACCURACY);

                if (monitoredLocations.length > 0) {
                    for (const loc of monitoredLocations) {
                        const distance = calculateDistanceInMeters(latitude, longitude, loc.latitude, loc.longitude);
                        if (distance < minDistance) minDistance = distance;
                        if ((distance - effectiveAccuracy) <= loc.radius) {
                            isWithinPerimeter = true;
                            locationName = loc.name;
                        }
                    }
                }

                
                const finalDistance = minDistance === Infinity ? null : minDistance;

                
                console.log(`[GEO DEBUG] Your GPS: ${latitude}, ${longitude}`);
                console.log(`[GEO DEBUG] Distance: ${finalDistance?.toFixed(1)}m | Accuracy: ±${accuracy?.toFixed(0)}m | Within: ${isWithinPerimeter}`);

                setState({
                    lat: latitude,
                    lng: longitude,
                    accuracy,
                    isWithinPerimeter,
                    locationName,
                    distance: finalDistance,
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
    }, [activeLocationsKey]);

    return state;
}

