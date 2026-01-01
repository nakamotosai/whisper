import { ScaleLevel, LocationState } from '../types';

const ZOOM_THRESHOLD_DISTRICT = 12;
const ZOOM_THRESHOLD_CITY = 8;

export const BUCKET_SIZES = {
    [ScaleLevel.DISTRICT]: 0.04,
    [ScaleLevel.CITY]: 0.2,
    [ScaleLevel.WORLD]: 0
};

export const MAJOR_COUNTRIES = [
    { id: 'CN', name: '中国', lat: 35.8617, lng: 104.1954, radius: 20 },
    { id: 'US', name: '美国', lat: 37.0902, lng: -95.7129, radius: 25 },
    { id: 'JP', name: '日本', lat: 36.2048, lng: 138.2529, radius: 8 },
    { id: 'GB', name: '英国', lat: 55.3781, lng: -3.4360, radius: 5 },
    { id: 'FR', name: '法国', lat: 46.2276, lng: 2.2137, radius: 6 },
    { id: 'DE', name: '德国', lat: 51.1657, lng: 10.4515, radius: 5 },
    { id: 'RU', name: '俄罗斯', lat: 61.5240, lng: 105.3188, radius: 40 },
    { id: 'IN', name: '印度', lat: 20.5937, lng: 78.9629, radius: 15 },
    { id: 'BR', name: '巴西', lat: -14.2350, lng: -51.9253, radius: 25 },
    { id: 'AU', name: '澳大利亚', lat: -25.2744, lng: 133.7751, radius: 20 },
    { id: 'CA', name: '加拿大', lat: 56.1304, lng: -106.3468, radius: 30 },
    { id: 'ZA', name: '南非', lat: -30.5595, lng: 22.9375, radius: 10 },
    { id: 'EG', name: '埃及', lat: 26.8206, lng: 30.8025, radius: 8 },
    { id: 'KR', name: '韩国', lat: 35.9078, lng: 127.7669, radius: 3 },
    { id: 'ID', name: '印度尼西亚', lat: -0.7893, lng: 113.9213, radius: 15 },
    { id: 'MX', name: '墨西哥', lat: 23.6345, lng: -102.5528, radius: 12 },
    { id: 'TR', name: '土耳其', lat: 38.9637, lng: 35.2433, radius: 8 },
    { id: 'SA', name: '沙特阿拉伯', lat: 23.8859, lng: 45.0792, radius: 12 },
    { id: 'AR', name: '阿根廷', lat: -38.4161, lng: -63.6167, radius: 15 },
    { id: 'NG', name: '尼日利亚', lat: 9.0820, lng: 8.6753, radius: 7 },
];

export const getScaleLevel = (zoom: number): ScaleLevel => {
    if (zoom >= ZOOM_THRESHOLD_DISTRICT) return ScaleLevel.DISTRICT;
    if (zoom >= ZOOM_THRESHOLD_CITY) return ScaleLevel.CITY;
    return ScaleLevel.WORLD;
};

const snapToGrid = (coord: number, size: number): string => (Math.floor(coord / size) * size).toFixed(3);

export const getNearestCountry = (lat: number, lng: number) => {
    let closest = MAJOR_COUNTRIES[0];
    let minDist = Number.MAX_VALUE;
    for (const c of MAJOR_COUNTRIES) {
        const dist = Math.sqrt(Math.pow(lat - c.lat, 2) + Math.pow(lng - c.lng, 2));
        if (dist < minDist) { minDist = dist; closest = c; }
    }
    return closest;
};

export const getBucket = (lat: number, lng: number, scale: ScaleLevel) => {
    if (scale === ScaleLevel.WORLD) return getNearestCountry(lat, lng);
    const size = BUCKET_SIZES[scale];
    const snapLat = Math.floor(lat / size) * size + (size / 2);
    const snapLng = Math.floor(lng / size) * size + (size / 2);
    return { lat: snapLat, lng: snapLng };
};

export const getRoomId = (location: LocationState): string => {
    const scale = getScaleLevel(location.zoom);
    if (scale === ScaleLevel.WORLD) return 'world_global';
    const size = BUCKET_SIZES[scale];
    const prefix = scale === ScaleLevel.DISTRICT ? 'district' : 'city';
    return `${prefix}_${snapToGrid(location.lat, size)}_${snapToGrid(location.lng, size)}`;
};
