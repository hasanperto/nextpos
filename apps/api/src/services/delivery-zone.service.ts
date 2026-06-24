import axios from 'axios';

async function geocodeAddress(address: string): Promise<[number, number] | null> {
    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: address,
                format: 'json',
                limit: 1
            },
            headers: {
                'User-Agent': 'NextPOS-DeliveryZone-Validator/1.0'
            },
            timeout: 3500 // 3.5 seconds timeout
        });
        if (response.data && response.data.length > 0) {
            const item = response.data[0];
            const lat = Number(item.lat);
            const lon = Number(item.lon);
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
                return [lon, lat]; // [longitude, latitude] for GeoJSON polygon point checking
            }
        }
    } catch (e) {
        console.error('OSM Geocoding failed for address:', address, e);
    }
    return null;
}

function isPointInRing(point: [number, number], ring: number[][]): boolean {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function isPointInPolygon(point: [number, number], polygon: any): boolean {
    if (!polygon || !polygon.coordinates) return false;
    const [lng, lat] = point;
    if (polygon.type === 'Polygon') {
        const rings = polygon.coordinates;
        if (!Array.isArray(rings) || rings.length === 0) return false;
        return isPointInRing([lng, lat], rings[0]);
    } else if (polygon.type === 'MultiPolygon') {
        if (!Array.isArray(polygon.coordinates)) return false;
        for (const polyCoords of polygon.coordinates) {
            if (Array.isArray(polyCoords) && polyCoords.length > 0) {
                if (isPointInRing([lng, lat], polyCoords[0])) {
                    return true;
                }
            }
        }
    }
    return false;
}

export class DeliveryZoneService {
    static async validateAddress(
        connection: any,
        address: string,
        totalAmount: number
    ): Promise<{
        allowed: boolean;
        reason?: 'AddressOutsideDeliveryArea' | 'MinOrderNotReached';
        zoneName?: string;
        minOrder?: number;
        deliveryFee?: number;
    }> {
        // Fetch active delivery zones
        const [zones]: any = await connection.query(
            'SELECT id, name, min_order, delivery_fee, polygon, is_active FROM delivery_zones WHERE is_active = true'
        );

        if (!zones || zones.length === 0) {
            // If no delivery zones are configured, allow the order
            return { allowed: true };
        }

        // Try geocoding the address
        const point = await geocodeAddress(address);
        
        let matchedZone: any = null;

        if (point) {
            for (const z of zones) {
                if (z.polygon) {
                    let polyObj = z.polygon;
                    if (typeof polyObj === 'string') {
                        try {
                            polyObj = JSON.parse(polyObj);
                        } catch {
                            continue;
                        }
                    }
                    if (isPointInPolygon(point, polyObj)) {
                        matchedZone = z;
                        break;
                    }
                }
            }
        }

        // Fallback: match by postcode / keyword
        if (!matchedZone) {
            for (const z of zones) {
                const nameClean = String(z.name).trim().toLowerCase();
                if (nameClean.length >= 3 && address.toLowerCase().includes(nameClean)) {
                    matchedZone = z;
                    break;
                }
            }
        }

        // Address is outside all delivery zones
        if (!matchedZone) {
            return {
                allowed: false,
                reason: 'AddressOutsideDeliveryArea'
            };
        }

        // Check minimum order amount threshold
        const minOrder = Number(matchedZone.min_order) || 0;
        if (totalAmount < minOrder) {
            return {
                allowed: false,
                reason: 'MinOrderNotReached',
                zoneName: matchedZone.name,
                minOrder,
                deliveryFee: Number(matchedZone.delivery_fee) || 0
            };
        }

        return {
            allowed: true,
            zoneName: matchedZone.name,
            minOrder,
            deliveryFee: Number(matchedZone.delivery_fee) || 0
        };
    }
}
