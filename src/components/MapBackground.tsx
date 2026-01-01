import React, { useEffect, useState, useRef, memo, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Polygon, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationState, ActivityMarker, ScaleLevel } from '@/types';
import { getScaleLevel } from '@/lib/spatialService';
import * as h3 from 'h3-js';

const ZOOM_LEVELS_CONFIG = [
    { zoom: 14, hex: '#22d3ee' }, // Cyan
    { zoom: 10, hex: '#fbbf24' }, // Amber
    { zoom: 5, hex: '#818cf8' },  // Indigo
];

// --- Sub Components ---

const MapEvents = ({ onMove, onZoomChange }: any) => {
    const map = useMap();
    useEffect(() => {
        const update = () => { onMove({ lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() }); };
        map.on('moveend', update);
        map.on('zoomend', () => { update(); onZoomChange(map.getZoom()); });
        return () => { map.off('moveend', update); map.off('zoomend'); };
    }, [map, onMove, onZoomChange]);
    return null;
};

const MapController = ({ center, forcedZoom }: { center: [number, number], forcedZoom: number | null }) => {
    const map = useMap();
    useEffect(() => {
        if (forcedZoom !== null) {
            map.flyTo(center, forcedZoom, { duration: 1.2, easeLinearity: 0.2 });
        }
    }, [forcedZoom, center, map]);
    return null;
};

const DiscreteZoomController = () => {
    const map = useMap();
    const isZoomingRef = useRef(false);
    useEffect(() => {
        map.scrollWheelZoom.disable();
        map.doubleClickZoom.disable();
        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            if (isZoomingRef.current) return;
            const currentZoom = map.getZoom();
            const direction = e.deltaY > 0 ? -1 : 1;
            const levels = [5, 10, 14];
            let targetZoom = currentZoom;
            if (direction === 1) {
                const next = levels.find(z => z > currentZoom + 0.1);
                targetZoom = next !== undefined ? next : 14;
            } else {
                const next = [...levels].reverse().find(z => z < currentZoom - 0.1);
                targetZoom = next !== undefined ? next : 5;
            }
            if (targetZoom !== currentZoom) {
                isZoomingRef.current = true;
                map.flyTo(map.getCenter(), targetZoom, { duration: 0.8 });
                setTimeout(() => { isZoomingRef.current = false; }, 900);
            }
        };
        const container = map.getContainer();
        container.addEventListener('wheel', handleWheel, { passive: false });
        return () => container.removeEventListener('wheel', handleWheel);
    }, [map]);
    return null;
};

const ActivityLayer = ({ fetchActivity, onMarkerClick, zoom }: any) => {
    const map = useMap();
    const [markers, setMarkers] = useState<ActivityMarker[]>([]);

    useEffect(() => {
        const fetch = async () => {
            const res = await fetchActivity(map.getCenter().lat, map.getCenter().lng, zoom);
            setMarkers(res || []);
        };
        fetch();
        map.on('moveend zoomend', fetch);
        return () => { map.off('moveend zoomend', fetch); };
    }, [map, fetchActivity, zoom]);

    return (
        <>{markers.map(m => {
            if (!m || typeof m.lat !== 'number' || typeof m.lng !== 'number') return null;
            const config = ZOOM_LEVELS_CONFIG.find(l => Math.abs(l.zoom - zoom) < 1.5) || ZOOM_LEVELS_CONFIG[0];
            return (
                <CircleMarker
                    key={m.id}
                    center={[m.lat, m.lng]}
                    radius={6}
                    pathOptions={{
                        fillColor: config.hex,
                        fillOpacity: 0.8,
                        color: 'white',
                        weight: 2,
                        className: 'activity-dot'
                    }}
                    eventHandlers={{ click: () => onMarkerClick(m) }}
                >
                    <style>{`
                        .activity-dot {
                            filter: drop-shadow(0 0 8px ${config.hex});
                            cursor: pointer;
                        }
                    `}</style>
                </CircleMarker>
            );
        })}</>
    );
};

const MapInvalidator = () => {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize();
    }, [map]);
    return null;
};

const UserHexagon = ({ location, zoom }: { location: [number, number] | null, zoom: number }) => {
    const currentScale = getScaleLevel(zoom);
    const hexPath = useMemo(() => {
        if (!location || currentScale === ScaleLevel.WORLD) return null;
        const res = currentScale === ScaleLevel.CITY ? 4 : 6;
        const h3Index = h3.latLngToCell(location[0], location[1], res);
        const boundary = h3.cellToBoundary(h3Index);
        return boundary.map(b => b as [number, number]);
    }, [location, currentScale]);

    if (!hexPath) return null;

    const config = ZOOM_LEVELS_CONFIG.find(l => Math.abs(l.zoom - zoom) < 1.5) || ZOOM_LEVELS_CONFIG[0];

    return (
        <Polygon
            positions={hexPath}
            pathOptions={{
                color: config.hex,
                weight: 2,
                fillColor: config.hex,
                fillOpacity: 0.05,
                className: 'user-hex-outline'
            }}
        />
    );
};

export const MapBackground = memo(({ initialPosition, userLocation, onLocationChange, onMarkerClick, forcedZoom, fetchActivity, theme }: any) => {
    const [zoom, setZoom] = useState(5);
    const [domReady, setDomReady] = useState(false);

    const fuzzedLocation = useMemo(() => {
        if (!userLocation) return null;
        const offLat = (Math.random() - 0.5) * 0.005;
        const offLng = (Math.random() - 0.5) * 0.005;
        return [userLocation[0] + offLat, userLocation[1] + offLng] as [number, number];
    }, [userLocation]);

    useEffect(() => { setDomReady(true); }, []);

    if (!domReady) return <div className="absolute inset-0 bg-black" />;

    const selfIcon = (color: string) => L.divIcon({
        className: 'self-marker',
        html: `
            <div style="position:relative;width:50px;height:50px;display:flex;align-items:center;justify-content:center;">
                <div style="position:absolute;width:100%;height:100%;border-radius:50%;background:white;opacity:0.1;animation:self-wave 3s infinite;"></div>
                <div style="width:14px;height:14px;background:white;border-radius:50%;box-shadow:0 0 20px white, 0 0 8px ${color};border:2px solid ${color};z-index:10;"></div>
            </div>
        `,
        iconSize: [50, 50],
        iconAnchor: [25, 25]
    });

    const isDark = theme === 'dark';

    const activeConfig = ZOOM_LEVELS_CONFIG.find(l => Math.abs(l.zoom - zoom) < 1.5) || ZOOM_LEVELS_CONFIG[0];

    return (
        <div className={`absolute inset-0 overflow-hidden ${isDark ? 'bg-black' : 'bg-gray-100'}`}>
            <style>{`
                @keyframes self-wave { 0% {transform:scale(0.3);opacity:0.6;} 100% {transform:scale(1.4);opacity:0;} }
                .leaflet-container { background: ${isDark ? '#000' : '#f3f4f6'} !important; outline: none !important; }
                
                /* Dark Mode: Invert Everything for that "Terminal" look */
                ${isDark ? `
                .leaflet-tile-pane { 
                    /* Charcoal Grey Theme (Refined): Greyer ocean, fewer details */
                    filter: invert(1) grayscale(1) brightness(0.9) contrast(0.8);
                    opacity: 1;
                    transition: filter 0.5s ease;
                }
                ` : `
                /* Light Mode: Clean, slightly desaturated for professionalism */
                .leaflet-tile-pane {
                    filter: grayscale(0.2) contrast(1.1);
                    opacity: 1;
                    transition: filter 0.5s ease;
                }
                `}
                .user-hex-outline {
                    filter: drop-shadow(0 0 10px ${activeConfig.hex});
                }
            `}</style>
            <MapContainer center={initialPosition} zoom={5} zoomControl={false} attributionControl={false} className="w-full h-full" scrollWheelZoom={false} doubleClickZoom={false}>
                <MapInvalidator />
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                <MapEvents onMove={onLocationChange} onZoomChange={setZoom} />
                <MapController center={initialPosition} forcedZoom={forcedZoom} />
                <DiscreteZoomController />
                <ActivityLayer fetchActivity={fetchActivity} onMarkerClick={onMarkerClick} zoom={zoom} />
                {fuzzedLocation && (
                    <>
                        <UserHexagon location={fuzzedLocation as [number, number]} zoom={zoom} />
                        <Marker position={fuzzedLocation as [number, number]} icon={selfIcon(activeConfig.hex)} zIndexOffset={1001} />
                    </>
                )}
            </MapContainer>
        </div>
    );
});

MapBackground.displayName = 'MapBackground';

