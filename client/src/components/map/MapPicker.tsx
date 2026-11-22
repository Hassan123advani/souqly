import { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { LocateFixed } from 'lucide-react';
import { Button } from '@/components/ui';

export type LatLng = { lat: number; lng: number };
export const KARACHI: LatLng = { lat: 24.8607, lng: 67.0011 };

// Brand pin (souq arch + lantern) as a DivIcon: no external marker images to bundle.
const pinIcon = L.divIcon({
  className: '',
  iconSize: [36, 46],
  iconAnchor: [18, 44],
  html: `<svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.3))">
    <path d="M18 45c-1-4-15-17-15-27C3 8 10 2 18 1c8 1 15 7 15 17 0 10-14 23-15 27Z" fill="#0E5E5A" stroke="#fff" stroke-width="2"/>
    <circle cx="18" cy="17" r="6" fill="#F2A93B"/></svg>`,
});

function ClickToMove({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function FlyTo({ to }: { to: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (to) map.flyTo([to.lat, to.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [to, map]);
  return null;
}

/** Leaflet + OpenStreetMap pin picker. Tap the map or drag the pin; "Use my location" uses geolocation. */
export default function MapPicker({
  value,
  onChange,
  className,
}: {
  value?: LatLng | null;
  onChange: (p: LatLng) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const center = value ?? KARACHI;
  const handlers = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const p = (e.target as L.Marker).getLatLng();
        onChange({ lat: p.lat, lng: p.lng });
      },
    }),
    [onChange],
  );

  function locate() {
    if (!('geolocation' in navigator)) return toast.error(t('map.unsupported'));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChange(p);
        setFlyTarget(p);
        setLocating(false);
      },
      () => {
        toast.error(t('map.denied'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className={className}>
      <div className="relative isolate overflow-hidden rounded-lg border border-border" dir="ltr">
        <MapContainer center={[center.lat, center.lng]} zoom={value ? 16 : 12} scrollWheelZoom className="h-64 w-full sm:h-72">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[center.lat, center.lng]} draggable icon={pinIcon} eventHandlers={handlers} />
          <ClickToMove onPick={onChange} />
          <FlyTo to={flyTarget} />
        </MapContainer>
        <div className="absolute end-3 top-3 z-[500]">
          <Button size="sm" variant="outline" className="shadow-card" loading={locating} onClick={locate} leftIcon={<LocateFixed className="size-4" />}>
            {t('map.useMyLocation')}
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-fg-muted">
        {value ? (
          <span className="latin tabular" dir="ltr">
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
          </span>
        ) : (
          t('map.hint')
        )}
      </p>
    </div>
  );
}
