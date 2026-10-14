// Leaflet maps (lazy loaded: leaflet is only fetched when a location is shown).

import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// The design's pin: a white disc with the "mappin" icon.
const PIN_SVG =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><path d="M12 7.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z"/></svg>';

const pinIcon = L.divIcon({
  className: "",
  html: `<div class="map-pin">${PIN_SVG}</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

/** Small, non-interactive map for a location bubble. */
export default function LocationMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={15}
      zoomControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
      attributionControl
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <Marker position={[lat, lng]} icon={pinIcon} interactive={false} />
    </MapContainer>
  );
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function FlyTo({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], Math.max(map.getZoom(), zoom), { duration: 0.6 });
  }, [lat, lng, zoom, map]);
  return null;
}

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    // Maps inside modals measure 0x0 on first render.
    const id = window.setTimeout(() => map.invalidateSize(), 200);
    return () => window.clearTimeout(id);
  }, [map]);
  return null;
}

export function PickerMap({
  point,
  focus,
  onPick,
}: {
  point: { lat: number; lng: number } | null;
  /** When set, the map flies there. */
  focus: { lat: number; lng: number } | null;
  onPick: (lat: number, lng: number) => void;
}) {
  const center: [number, number] = point ? [point.lat, point.lng] : [48.2, 12.5];
  return (
    <MapContainer center={center} zoom={point ? 15 : 4} className="picker-map" scrollWheelZoom>
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
      <InvalidateSize />
      <ClickHandler onPick={onPick} />
      {focus && <FlyTo lat={focus.lat} lng={focus.lng} zoom={15} />}
      {point && (
        <Marker
          position={[point.lat, point.lng]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onPick(ll.lat, ll.lng);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
