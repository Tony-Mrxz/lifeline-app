'use client';

import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// leaflet's default icon sprites point at broken paths under bundlers — inline a pin instead
const pinIcon = L.divIcon({
  className: '',
  html: `<svg width="34" height="34" viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 2c-6.1 0-11 4.9-11 11 0 8 11 19 11 19s11-11 11-19c0-6.1-4.9-11-11-11z" fill="#dc2626" stroke="#fff" stroke-width="2"/>
    <circle cx="17" cy="13" r="4.5" fill="#fff"/>
  </svg>`,
  iconSize: [34, 34],
  iconAnchor: [17, 32],
});

export default function SosMapView({ lat, lng }) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      scrollWheelZoom={false}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[lat, lng]} icon={pinIcon} />
    </MapContainer>
  );
}
