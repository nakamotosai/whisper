import React, { useEffect, useState, useRef, memo, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Polygon, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationState, ActivityMarker, ScaleLevel, ThemeType, UserPresence } from '@/types';
import { getScaleLevel, getH3Boundary, getH3Center, getUserH3Index } from '@/lib/spatialService';
import * as h3 from 'h3-js';

const ZOOM_LEVELS_CONFIG = [
    { zoom: 14, hex: '#22d3ee', scale: ScaleLevel.DISTRICT },
    { zoom: 10, hex: '#fbbf24', scale: ScaleLevel.CITY },
    { zoom: 5, hex: '#818cf8', scale: ScaleLevel.WORLD },
];

// Custom SVG renderer with padding to prevent hexagon clipping
const PaddedSvgRenderer = () => {
    const map = useMap();
    useEffect(() => {
        // Create a new SVG renderer with 50% padding to prevent clipping at edges
        const svgRenderer = L.svg({ padding: 0.5 });
        // Set it as the default renderer for the map
        (map.options as any).renderer = svgRenderer;
        // Force redraw of all vector layers
        map.eachLayer((layer: any) => {
            if (layer.setStyle) {
                layer.setStyle(layer.options);
            }
        });
    }, [map]);
    return null;
};

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

// User's own hexagon - always visible
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

// Hover hexagon - shows when mouse moves over any area
const HoverHexagon = memo(({ hoveredH3Index, userH3Index, zoom }: {
    hoveredH3Index: string | null,
    userH3Index: string | null,
    zoom: number
}) => {
    const currentScale = getScaleLevel(zoom);

    const hexPath = useMemo(() => {
        if (!hoveredH3Index || currentScale === ScaleLevel.WORLD) return null;
        if (hoveredH3Index === userH3Index) return null; // User hex already shown

        try {
            return getH3Boundary(hoveredH3Index);
        } catch {
            return null;
        }
    }, [hoveredH3Index, userH3Index, currentScale]);

    if (!hexPath || hexPath.length === 0) return null;
    const config = ZOOM_LEVELS_CONFIG.find(l => l.scale === currentScale) || ZOOM_LEVELS_CONFIG[0];

    return (
        <Polygon
            positions={hexPath}
            interactive={false}
            pathOptions={{
                color: config.hex,
                weight: 1.5,
                fillColor: 'transparent',
                fillOpacity: 0,
                dashArray: '5, 5',
                className: 'hover-hex-outline'
            }}
        />
    );
});

// Mouse hover handler - tracks mouse position and converts to H3 index
const MouseHoverHandler = ({ onHover, zoom }: {
    onHover: (h3Index: string | null) => void,
    zoom: number
}) => {
    const map = useMap();
    const currentScale = getScaleLevel(zoom);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (currentScale === ScaleLevel.WORLD) {
            onHover(null);
            return;
        }

        const res = currentScale === ScaleLevel.CITY ? 4 : 6;

        const handleMouseMove = (e: L.LeafletMouseEvent) => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
                try {
                    const h3Index = h3.latLngToCell(e.latlng.lat, e.latlng.lng, res);
                    onHover(h3Index);
                } catch {
                    onHover(null);
                }
            }, 50); // 50ms debounce for smoother performance
        };

        const handleMouseOut = () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            onHover(null);
        };

        map.on('mousemove', handleMouseMove);
        map.on('mouseout', handleMouseOut);

        return () => {
            map.off('mousemove', handleMouseMove);
            map.off('mouseout', handleMouseOut);
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [map, currentScale, onHover]);

    return null;
};

// Active room markers - shows center dots for hexagons that have chatrooms
const ActiveRoomMarkers = memo(({
    existingRoomIds,
    zoom,
    isMoving,
    onHexClick,
    userH3Index,
    activeRoomId
}: {
    existingRoomIds: string[],
    zoom: number,
    isMoving: boolean,
    onHexClick: (roomId: string, lat: number, lng: number) => void,
    userH3Index: string | null,
    activeRoomId?: string
}) => {
    const currentScale = getScaleLevel(zoom);

    const markers = useMemo(() => {
        if (currentScale === ScaleLevel.WORLD || isMoving) return [];

        const prefix = currentScale.toLowerCase();
        return existingRoomIds
            .filter(rid => rid.startsWith(`${prefix}_`))
            .map(rid => {
                try {
                    const h3Index = rid.split('_')[1];
                    if (!h3Index) return null;
                    if (h3Index === userH3Index) return null; // User hex has user marker
                    const center = getH3Center(h3Index);
                    if (!center || (center[0] === 0 && center[1] === 0)) return null;
                    return { roomId: rid, h3Index, lat: center[0], lng: center[1] };
                } catch {
                    return null;
                }
            })
            .filter(Boolean) as { roomId: string, h3Index: string, lat: number, lng: number }[];
    }, [existingRoomIds, currentScale, isMoving, userH3Index]);

    if (currentScale === ScaleLevel.WORLD) return null;
    const config = ZOOM_LEVELS_CONFIG.find(l => l.scale === currentScale) || ZOOM_LEVELS_CONFIG[0];

    return (
        <>
            {markers.map(m => (
                <CircleMarker
                    key={m.roomId}
                    center={[m.lat, m.lng]}
                    radius={6}
                    pathOptions={{
                        fillColor: activeRoomId === m.roomId ? '#ffffff' : config.hex,
                        fillOpacity: 0.9,
                        color: activeRoomId === m.roomId ? config.hex : 'white',
                        weight: 2,
                        className: 'room-center-dot'
                    }}
                    eventHandlers={{
                        click: () => onHexClick(m.roomId, m.lat, m.lng)
                    }}
                />
            ))}
        </>
    );
});

interface MapBackgroundProps {
    initialPosition: [number, number];
    userLocation: [number, number] | null;
    onLocationChange: (loc: any) => void;
    onMarkerClick: (marker: ActivityMarker) => void;
    forcedZoom: number | null;
    fetchActivity: (lat: number, lng: number, zoom: number) => Promise<ActivityMarker[]>;
    theme?: ThemeType;
    existingRoomIds?: string[];
    onHexClick?: (roomId: string, lat: number, lng: number) => void;
    activeRoomId?: string;
    onlineUsers?: UserPresence[];
    currentUserId?: string;
}

export const MapBackground = memo(({
    initialPosition,
    userLocation,
    onLocationChange,
    onMarkerClick,
    forcedZoom,
    fetchActivity,
    theme = 'dark',
    existingRoomIds = [],
    onHexClick,
    activeRoomId,
    onlineUsers,
    currentUserId
}: MapBackgroundProps) => {
    const [zoom, setZoom] = useState(5);
    const [isMoving, setIsMoving] = useState(false);
    const [domReady, setDomReady] = useState(false);
    const [hoveredH3Index, setHoveredH3Index] = useState<string | null>(null);

    const fuzzedLocation = useMemo(() => {
        if (!userLocation) return null;
        const offLat = (Math.random() - 0.5) * 0.005;
        const offLng = (Math.random() - 0.5) * 0.005;
        return [userLocation[0] + offLat, userLocation[1] + offLng] as [number, number];
    }, [userLocation]);

    // Calculate user's H3 index for current scale
    const userH3Index = useMemo(() => {
        if (!userLocation) return null;
        const currentScale = getScaleLevel(zoom);
        return getUserH3Index(userLocation[0], userLocation[1], currentScale);
    }, [userLocation, zoom]);

    useEffect(() => { setDomReady(true); }, []);
    useEffect(() => { if (forcedZoom !== null) setZoom(forcedZoom); }, [forcedZoom]);

    const onAnimationComplete = useCallback(() => {
        onLocationChange({ lat: initialPosition[0], lng: initialPosition[1], zoom: forcedZoom });
    }, [initialPosition, forcedZoom, onLocationChange]);

    const handleMouseHover = useCallback((h3Index: string | null) => {
        // Disable H3 hover on touch devices to save CPU
        if (typeof window !== 'undefined' && 'ontouchstart' in window) return;
        setHoveredH3Index(h3Index);
    }, []);

    const handleHexClickInternal = useCallback((roomId: string, lat: number, lng: number) => {
        if (onHexClick) {
            onHexClick(roomId, lat, lng);
        }
    }, [onHexClick]);

    if (!domReady) return <div className="absolute inset-0 bg-black" />;

    const selfIcon = (color: string) => L.divIcon({
        className: 'self-marker',
        html: `
            <div style="position:relative;width:50px;height:50px;display:flex;align-items:center;justify-content:center;">
                <div style="position:absolute;width:100%;height:100%;border-radius:50%;background:white;opacity:0.1;"></div>
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
                
                /* Optimized tile loading - removed heavy filters */
                .leaflet-tile {
                    will-change: transform;
                }
                
                .user-hex-outline { 
                   filter: drop-shadow(0 0 10px ${activeConfig.hex}); 
                }
                .hover-hex-outline {
                    pointer-events: none;
                    transition: opacity 0.2s ease;
                }
                .activity-dot {
                    filter: drop-shadow(0 0 8px ${activeConfig.hex});
                    cursor: pointer;
                }
                .room-center-dot {
                    filter: drop-shadow(0 0 8px ${activeConfig.hex});
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .room-center-dot:hover {
                    transform: scale(1.2);
                }
            `}</style>
            <MapContainer
                center={initialPosition}
                zoom={5}
                zoomControl={false}
                attributionControl={false}
                className="w-full h-full"
                scrollWheelZoom={false}
                doubleClickZoom={false}
                touchZoom={false}
                zoomSnap={0}
                zoomDelta={0}
            >
                <MapInvalidator />
                <PaddedSvgRenderer />
                <TileLayer
                    url={isDark
                        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"}
                    subdomains="abcd"
                    maxZoom={20}
                    keepBuffer={2}
                    updateWhenIdle={true}
                    updateWhenZooming={false}
                />
                <MapEvents onMove={onLocationChange} onZoomChange={setZoom} onInteraction={() => onLocationChange({ lat: 0, lng: 0, zoom: 0, isInteraction: true })} onMoveStateChange={setIsMoving} isControlled={forcedZoom !== null} />
                <MapController center={initialPosition} forcedZoom={forcedZoom} onAnimationComplete={onAnimationComplete} />
                <DiscreteZoomController />
                <MouseHoverHandler onHover={handleMouseHover} zoom={zoom} />
                <ActivityLayer fetchActivity={fetchActivity} onMarkerClick={onMarkerClick} zoom={zoom} isMoving={isMoving} />

                {/* Hover hexagon - shows on mouse move */}
                <HoverHexagon hoveredH3Index={hoveredH3Index} userH3Index={userH3Index} zoom={zoom} />

                {/* Active room markers - shows center dots for existing chatrooms */}
                <ActiveRoomMarkers
                    existingRoomIds={existingRoomIds}
                    zoom={zoom}
                    isMoving={isMoving}
                    onHexClick={handleHexClickInternal}
                    userH3Index={userH3Index}
                    activeRoomId={activeRoomId}
                />

                {fuzzedLocation && (
                    <>
                        {/* Self marker */}
                        <UserHexagon location={userLocation as [number, number]} zoom={zoom} isHidden={isMoving} />
                        <Marker position={fuzzedLocation as [number, number]} icon={selfIcon(activeConfig.hex)} zIndexOffset={1001} />

                        {/* Other online users markers - Hide when moving */}
                        {!isMoving && onlineUsers && onlineUsers.map(u => {
                            if (u.user_id === currentUserId) return null;
                            if (typeof u.lat !== 'number' || typeof u.lng !== 'number') return null;
                            return (
                                <CircleMarker
                                    key={`user-${u.user_id}`}
                                    center={[u.lat, u.lng]}
                                    radius={3}
                                    pathOptions={{
                                        fillColor: '#ffffff',
                                        fillOpacity: 0.8,
                                        stroke: false,
                                        className: 'online-user-dot'
                                    }}
                                />
                            );
                        })}
                    </>
                )}
            </MapContainer>
        </div>
    );
});

MapBackground.displayName = 'MapBackground';
ActivityLayer.displayName = 'ActivityLayer';
HoverHexagon.displayName = 'HoverHexagon';
ActiveRoomMarkers.displayName = 'ActiveRoomMarkers';
