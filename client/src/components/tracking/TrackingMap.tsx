import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoPoint } from '@souqly/shared';
import { cn } from '@/lib/cn';

/**
 * Map abstraction for live tracking. Always Leaflet + OpenStreetMap (no API key needed); a Google
 * Maps implementation can be swapped in here later behind `VITE_GOOGLE_MAPS_KEY`.
 */
const destIcon = L.divIcon({
  className: '',
  iconSize: [34, 44],
  iconAnchor: [17, 42],
  html: `<svg width="34" height="44" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.3))">
    <path d="M18 45c-1-4-15-17-15-27C3 8 10 2 18 1c8 1 15 7 15 17 0 10-14 23-15 27Z" fill="#0E5E5A" stroke="#fff" stroke-width="2"/>
    <circle cx="18" cy="17" r="6" fill="#F2A93B"/></svg>`,
});

// Rider: saffron disc with a scooter glyph and a soft pulse ring.
const riderIcon = L.divIcon({
  className: '',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  html: `<div style="position:relative;width:44px;height:44px">
    <span class="sq-pulse" style="position:absolute;inset:0;border-radius:999px;background:rgba(242,169,59,.35)"></span>
    <span style="position:absolute;inset:6px;border-radius:999px;background:#F2A93B;border:3px solid #fff;box-shadow:0 4px 10px rgba(0,0,0,.3);display:grid;place-items:center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1b1307" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
    </span></div>`,
});

function FitBounds({ points }: { points: GeoPoint[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView([points[0]!.lat, points[0]!.lng], Math.max(map.getZoom(), 15), { animate: true });
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 16, animate: true });
    // Re-fit only when the rounded points change (not on every tiny GPS jitter).
  }, [key, map]);
  return null;
}

export default function TrackingMap({
  destination,
  rider,
  className,
  interactive = true,
}: {
  destination?: GeoPoint | null;
  rider?: GeoPoint | null;
  className?: string;
  interactive?: boolean;
}) {
  const points = useMemo(() => [destination, rider].filter((p): p is GeoPoint => !!p), [destination, rider]);
  const center = points[0] ?? { lat: 24.8607, lng: 67.0011 };
  return (
    <div className={cn('relative isolate overflow-hidden rounded-lg border border-border', className)} dir="ltr">
      <style>{'@keyframes sqPulse{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.6);opacity:0}}.sq-pulse{animation:sqPulse 1.8s ease-out infinite}@media (prefers-reduced-motion:reduce){.sq-pulse{animation:none}}'}</style>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={14}
        scrollWheelZoom={false}
        dragging={interactive}
        zoomControl={interactive}
        className="size-full min-h-48"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {destination && <Marker position={[destination.lat, destination.lng]} icon={destIcon} />}
        {rider && <Marker position={[rider.lat, rider.lng]} icon={riderIcon} zIndexOffset={500} />}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
