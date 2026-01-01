import { ScaleLevel } from '@/types';
import * as h3 from 'h3-js';
// @ts-ignore
import { iso1A2Code } from 'country-coder';

// H3 Resolutions
const RESOLUTION_CITY = 4;      // ~22km edge
const RESOLUTION_DISTRICT = 6;  // ~3.6km edge

export const getScaleLevel = (zoom: number): ScaleLevel => {
    if (zoom < 6) return ScaleLevel.WORLD;
    if (zoom < 12) return ScaleLevel.CITY;
    return ScaleLevel.DISTRICT;
};

export const getRoomId = (scale: ScaleLevel, lat: number, lng: number): string => {
    if (scale === ScaleLevel.WORLD) return 'world_global';

    try {
        const resolution = scale === ScaleLevel.CITY ? RESOLUTION_CITY : RESOLUTION_DISTRICT;
        const h3Index = h3.latLngToCell(lat, lng, resolution);
        return `${scale.toLowerCase()}_${h3Index}`;
    } catch (e) {
        console.error('H3 conversion failed:', e);
        return 'world_global';
    }
};

export const getBucket = (lat: number, lng: number, scale: ScaleLevel): string => {
    return getRoomId(scale, lat, lng);
};

export const BUCKET_SIZES = {
    [ScaleLevel.WORLD]: 0,
    [ScaleLevel.CITY]: 0, // Not used with H3
    [ScaleLevel.DISTRICT]: 0 // Not used with H3
};

// --- Country & Location Helpers ---

export const getCountryCode = (lat: number, lng: number): string | undefined => {
    try {
        // country-coder returns ISO 3166-1 alpha-2 code
        return iso1A2Code([lng, lat]) || undefined;
    } catch (e) {
        console.error('Country detection failed:', e);
        return undefined;
    }
};

const regionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' });

export const getCountryNameCN = (code?: string): string => {
    if (!code) return '未知';
    try {
        return regionNames.of(code) || code;
    } catch (e) {
        return code;
    }
};

// Helper to get formatted location name for header
// Returns [Country, City, District] based on H3 index or raw coords
export const getLocationName = async (lat: number, lng: number, scale: ScaleLevel): Promise<string> => {
    const countryCode = getCountryCode(lat, lng);
    const countryName = getCountryNameCN(countryCode);

    if (scale === ScaleLevel.WORLD) {
        return countryName;
    }

    // For City/District, we ideally need reverse geocoding.
    // Since we want "offline-first" where possible, but for city names we really need data.
    // We will try a lightweight fetch to OSM Nominatim (free, no key) as a fallback enhancement.
    // If offline or fail, we fallback to H3 Index ID for tech feel.

    try {
        const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=${scale === ScaleLevel.CITY ? 10 : 14}&accept-language=zh-CN`);
        if (!resp.ok) throw new Error('Network error');
        const data = await resp.json();
        const address = data.address;

        const city = address.city || address.town || address.state || '';
        const district = address.suburb || address.district || address.neighbourhood || '';

        if (scale === ScaleLevel.CITY) {
            return `${countryName} - ${city || '未知城市'}`;
        } else {
            return `${countryName} - ${city || '未知城市'} - ${district || '未知区域'}`;
        }
    } catch (e) {
        // Fallback: H3 Index
        const res = scale === ScaleLevel.CITY ? RESOLUTION_CITY : RESOLUTION_DISTRICT;
        const h3Index = h3.latLngToCell(lat, lng, res);
        return `${countryName} - [${h3Index}]`;
    }
};
