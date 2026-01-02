import React, { useEffect, useState, useRef, memo, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Polygon, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationState, ActivityMarker, ScaleLevel } from '@/types';
import { getScaleLevel } from '@/lib/spatialService';
import * as h3 from 'h3-js';

const ZOOM_LEVELS_CONFIG = [
    { zoom: 14, hex: '#22d3ee', scale: ScaleLevel.DISTRICT },
    { zoom: 10, hex: '#fbbf24', scale: ScaleLevel.CITY },
    { zoom: 5, hex: '#818cf8', scale: ScaleLevel.WORLD },
];

// --- Sub Components ---

const MapEvents = ({ onMove, onZoomChange, onInteraction, onMoveStateChange, isControlled }: { onMove: any, onZoomChange: any, onInteraction: () => void, onMoveStateChange: (moving: boolean) => void, isControlled: boolean }) => {
    const map = useMap();
    const lastZoomRef = useRef(map.getZoom());
    const isControlledRef = useRef(isControlled);
    useEffect(() => { isControlledRef.current = isControlled; }, [isControlled]);

    useEffect(() => {
        const update = () => {
            if (isControlledRef.current) return;
            onMove({ lat: map.getCenter().lat, lng: map.getCenter().lng, zoom: map.getZoom() });
        };
        const updateZoom = () => {
            if (isControlledRef.current) return;
            const currentZoom = map.getZoom();
            if (currentZoom !== lastZoomRef.current) {
                lastZoomRef.current = currentZoom;
                onZoomChange(currentZoom);
            }
        };

        const handleInteraction = () => {
            if (isControlledRef.current) onInteraction();
        };

        const handleMoveStart = () => onMoveStateChange(true);
        const handleMoveEnd = () => {
            onMoveStateChange(false);
            update();
            updateZoom();
        };

        map.on('movestart', handleMoveStart);
        map.on('moveend', handleMoveEnd);
        map.on('zoomstart', handleMoveStart);
        map.on('zoomend', handleMoveEnd);
        map.on('mousedown touchstart wheel', handleInteraction);

        return () => {
            map.off('movestart', handleMoveStart);
            map.off('moveend', handleMoveEnd);
            map.off('zoomstart', handleMoveStart);
            map.off('zoomend', handleMoveEnd);
            map.off('mousedown touchstart wheel', handleInteraction);
        };
    }, [map, onMove, onZoomChange, onInteraction, onMoveStateChange]);
    return null;
};

const MapController = ({ center, forcedZoom, onAnimationComplete }: { center: [number, number], forcedZoom: number | null, onAnimationComplete: () => void }) => {
    const map = useMap();
    const lastTriggerRef = useRef<string>('');

    useEffect(() => {
        if (forcedZoom === null) {
            lastTriggerRef.current = '';
            return;
        }
        const triggerKey = `${center[0]}_${center[1]}_${forcedZoom}`;
        if (lastTriggerRef.current === triggerKey) return;
        lastTriggerRef.current = triggerKey;

        map.flyTo(center, forcedZoom, { duration: 1.2, easeLinearity: 0.2 });
        const timer = setTimeout(() => { onAnimationComplete(); }, 1300);
        return () => clearTimeout(timer);
    }, [forcedZoom, center, map, onAnimationComplete]);
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

const ActivityLayer = memo(({ fetchActivity, onMarkerClick, zoom, isMoving }: any) => {
    const map = useMap();
    const [markers, setMarkers] = useState<ActivityMarker[]>([]);
    const fetchTimerRef = useRef<NodeJS.Timeout | null>(null);

    const performFetch = useCallback(async () => {
        const currentZoom = map.getZoom();
        const res = await fetchActivity(map.getCenter().lat, map.getCenter().lng, currentZoom);
        setMarkers(res || []);
    }, [map, fetchActivity]);

    useEffect(() => {
        const debouncedFetch = () => {
            if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
            fetchTimerRef.current = setTimeout(performFetch, 300);
        };
        debouncedFetch();
        map.on('moveend zoomend', debouncedFetch);
        return () => {
            if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
            map.off('moveend zoomend', debouncedFetch);
        };
    }, [map, performFetch]);

    const currentScale = getScaleLevel(zoom);
    const activeConfig = ZOOM_LEVELS_CONFIG.find(l => l.scale === currentScale) || ZOOM_LEVELS_CONFIG[0];

    if (isMoving) return null;

    return (
        <>
            {markers.map(m => {
                if (!m || typeof m.lat !== 'number' || typeof m.lng !== 'number') return null;
                const markerPrefix = m.id.split('_')[0].toUpperCase();
                if (markerPrefix !== currentScale) return null;

                return (
                    <CircleMarker
                        key={m.id}
                        center={[m.lat, m.lng]}
                        radius={6}
                        pathOptions={{
                            fillColor: activeConfig.hex,
                            fillOpacity: 0.8,
                            color: 'white',
                            weight: 2,
                            className: 'activity-dot'
                        }}
                        eventHandlers={{ click: () => onMarkerClick(m) }}
                    />
                );
            })}
        </>
    );
});

const MapInvalidator = () => {
    const map = useMap();
    useEffect(() => { map.invalidateSize(); }, [map]);
    return null;
};

const UserHexagon = ({ location, zoom, isHidden }: { location: [number, number] | null, zoom: number, isHidden: boolean }) => {
    const currentScale = getScaleLevel(zoom);
    const hexPath = useMemo(() => {
        if (!location || currentScale === ScaleLevel.WORLD) return null;
        const res = currentScale === ScaleLevel.CITY ? 4 : 6;
        const h3Index = h3.latLngToCell(location[0], location[1], res);
        const boundary = h3.cellToBoundary(h3Index);
        return boundary.map(b => b as [number, number]);
    }, [location, currentScale]);

    if (!hexPath || isHidden) return null;
    const config = ZOOM_LEVELS_CONFIG.find(l => l.scale === currentScale) || ZOOM_LEVELS_CONFIG[0];

    return (
        <Polygon
            positions={hexPath}
            interactive={false}
            pathOptions={{
                color: config.hex,
                weight: 2,
                fillColor: 'transparent',
                fillOpacity: 0,
                className: 'user-hex-outline'
            }}
        />
    );
};

export const MapBackground = memo(({ initialPosition, userLocation, onLocationChange, onMarkerClick, forcedZoom, fetchActivity, theme }: any) => {
    const [zoom, setZoom] = useState(5);
    const [isMoving, setIsMoving] = useState(false);
    const [domReady, setDomReady] = useState(false);

    const fuzzedLocation = useMemo(() => {
        if (!userLocation) return null;
        const offLat = (Math.random() - 0.5) * 0.005;
        const offLng = (Math.random() - 0.5) * 0.005;
        return [userLocation[0] + offLat, userLocation[1] + offLng] as [number, number];
    }, [userLocation]);

    useEffect(() => { setDomReady(true); }, []);
    useEffect(() => { if (forcedZoom !== null) setZoom(forcedZoom); }, [forcedZoom]);

    const onAnimationComplete = useCallback(() => {
        onLocationChange({ lat: initialPosition[0], lng: initialPosition[1], zoom: forcedZoom });
    }, [initialPosition, forcedZoom, onLocationChange]);

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
    const currentScale = getScaleLevel(zoom);
    const activeConfig = ZOOM_LEVELS_CONFIG.find(l => l.scale === currentScale) || ZOOM_LEVELS_CONFIG[0];

    return (
        <div className={`absolute inset-0 overflow-hidden ${isDark ? 'bg-black' : 'bg-gray-100'}`}>
            <style>{`
                @keyframes self-wave { 0% {transform:scale(0.3);opacity:0.6;} 100% {transform:scale(1.4);opacity:0;} }
                .leaflet-container { background: ${isDark ? '#090909' : '#f3f4f6'} !important; outline: none !important; }
                
                ${isDark ? `
                .leaflet-tile-pane { 
                    filter: invert(1) grayscale(1) brightness(0.9) contrast(0.85);
                    opacity: 1;
                    transition: filter 0.5s ease;
                    transform: translateZ(0);
                    backface-visibility: hidden;
                }
                ` : `
                .leaflet-tile-pane {
                    filter: grayscale(0.2) contrast(1.1);
                    opacity: 0.99;
                    transition: filter 0.5s ease;
                    transform: translateZ(0);
                }
                `}

                .user-hex-outline { 
                   filter: drop-shadow(0 0 10px ${activeConfig.hex}); 
                }
                .activity-dot {
                    filter: drop-shadow(0 0 8px ${activeConfig.hex});
                    cursor: pointer;
                }
            `}</style>
            <MapContainer center={initialPosition} zoom={5} zoomControl={false} attributionControl={false} className="w-full h-full" scrollWheelZoom={false} doubleClickZoom={false}>
                <MapInvalidator />
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    subdomains="abcd"
                    maxZoom={20}
                    keepBuffer={6}
                />
                <MapEvents onMove={onLocationChange} onZoomChange={setZoom} onInteraction={() => onLocationChange({ lat: 0, lng: 0, zoom: 0, isInteraction: true })} onMoveStateChange={setIsMoving} isControlled={forcedZoom !== null} />
                <MapController center={initialPosition} forcedZoom={forcedZoom} onAnimationComplete={onAnimationComplete} />
                <DiscreteZoomController />
                <ActivityLayer fetchActivity={fetchActivity} onMarkerClick={onMarkerClick} zoom={zoom} isMoving={isMoving} />
                {fuzzedLocation && (
                    <>
                        <UserHexagon location={userLocation as [number, number]} zoom={zoom} isHidden={isMoving} />
                        <Marker position={fuzzedLocation as [number, number]} icon={selfIcon(activeConfig.hex)} zIndexOffset={1001} />
                    </>
                )}
            </MapContainer>
        </div>
    );
});

MapBackground.displayName = 'MapBackground';
