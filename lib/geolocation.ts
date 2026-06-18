/**
 * Converts degrees to radians.
 */
function degToRad(deg: number): number {
    return (deg * Math.PI) / 180;
}

/**
 * Calculates the great-circle distance between two points on a sphere (the Earth)
 * using the Haversine formula.
 * 
 * @param lat1 Latitude of point 1
 * @param lon1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lon2 Longitude of point 2
 * @returns The distance in meters
 */
export function calculateDistanceInMeters(
    lat1: number, 
    lon1: number, 
    lat2: number, 
    lon2: number
): number {
    const R = 6371000; // Radius of the Earth in meters
    const dLat = degToRad(lat2 - lat1);
    const dLon = degToRad(lon2 - lon1);

    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(degToRad(lat1)) * Math.cos(degToRad(lat2)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
}
