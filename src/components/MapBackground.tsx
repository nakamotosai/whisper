import React, { useEffect, useState, useRef, memo, useMemo } from 'react';
import { MapContainer, TileLayer, useMap, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocationState, ActivityMarker, ScaleLevel } from '@/types';
import { getScaleLevel } from '@/lib/spatialService';

const ZOOM_LEVELS_CONFIG = [
    { zoom: 14, hex: '#22d3ee' }, // Cyan
    { zoom: 10, hex: '#fbbf24' }, // Amber
    { zoom: 5, hex: '#818cf8' }, // Indigo
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

const ActivityLayer = ({ fetchActivity, onMarkerClick }: any) => {
    const map = useMap();
    const [markers, setMarkers] = useState<ActivityMarker[]>([]);
    useEffect(() => {
        const fetch = async () => {
            const res = await fetchActivity(map.getCenter().lat, map.getCenter().lng, map.getZoom());
            setMarkers(res || []);
        };
        fetch();
        map.on('moveend zoomend', fetch);
        return () => { map.off('moveend zoomend', fetch); };
    }, [map, fetchActivity]);

    const hotspotIcon = (color: string) => L.divIcon({
        className: 'hotspot-marker',
        html: `<div style="width:16px;height:16px;background:${color};border-radius:50%;box-shadow:0 0 15px ${color};border:2px solid white;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });

    return (
        <>{markers.map(m => {
            const z = map.getZoom();
            const config = ZOOM_LEVELS_CONFIG.find(l => Math.abs(l.zoom - z) < 1.5) || ZOOM_LEVELS_CONFIG[0];
            return (<Marker key={m.id} position={[m.lat, m.lng]} icon={hotspotIcon(config.hex)} eventHandlers={{ click: () => onMarkerClick(m) }} />);
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

export const MapBackground = memo(({ initialPosition, userLocation, onLocationChange, onMarkerClick, forcedZoom, fetchActivity }: any) => {
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

    return (
        <div className="absolute inset-0 bg-black overflow-hidden">
            <style>{`
                @keyframes self-wave { 0% {transform:scale(0.3);opacity:0.6;} 100% {transform:scale(1.4);opacity:0;} }
                .leaflet-container { background: #000 !important; outline: none !important; }
                
                /* 为了达成“灰色陆地、黑色海洋、灰色文字”，我们采用对 Light 模式的全量重映射 */
                .leaflet-tile-pane { 
                    /* 1. Invert: 海洋(白->黑), 陆地(浅灰->深灰), 文字(黑->白) */
                    /* 2. Brightness(6): 陆地(0.1*6=0.6 灰色), 文字(1*6=1 白色) */
                    /* 3. Brightness(0.6): 陆地(0.6*0.6=0.36 中灰色), 文字(1*0.6=0.6 灰色) */
                    filter: invert(1) grayscale(1) brightness(6) contrast(1.2) brightness(0.5);
                    opacity: 1;
                    transition: filter 0.5s ease;
                }
            `}</style>
            <MapContainer center={initialPosition} zoom={5} zoomControl={false} attributionControl={false} className="w-full h-full" scrollWheelZoom={false} doubleClickZoom={false}>
                <MapInvalidator />
                {/* 必须使用基准亮度最高的 Light 版瓦片，反转后才能得到最纯净的黑色 */}
                <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                <MapEvents onMove={onLocationChange} onZoomChange={setZoom} />
                <MapController center={initialPosition} forcedZoom={forcedZoom} />
                <DiscreteZoomController />
                <ActivityLayer fetchActivity={fetchActivity} onMarkerClick={onMarkerClick} />
                {fuzzedLocation && (
                    <Marker position={fuzzedLocation as [number, number]} icon={selfIcon(ZOOM_LEVELS_CONFIG.find(l => Math.abs(l.zoom - zoom) < 1.5)?.hex || '#fff')} zIndexOffset={1001} />
                )}
            </MapContainer>
        </div>
    );
});

MapBackground.displayName = 'MapBackground';
