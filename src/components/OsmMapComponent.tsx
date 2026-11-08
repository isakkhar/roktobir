import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { BloodGroup, buildBrowserMapUrl } from '../utils/bloodBankLogic';

export interface MapMarkerItem {
  id: string;
  type: 'request' | 'donor' | 'self';
  title: string;
  subtitle: string;
  bloodGroup?: BloodGroup;
  isUrgent?: boolean;
  lat: number;
  lng: number;
  hospital?: string;
  phone?: string;
  onSelect?: (id: string) => void;
}

interface OsmMapComponentProps {
  mode: 'picker' | 'radar';
  centerLat: number;
  centerLng: number;
  zoom?: number;
  selectedLat?: number;
  selectedLng?: number;
  onPickCoordinate?: (lat: number, lng: number) => void;
  markers?: MapMarkerItem[];
  heightClass?: string;
}

export const OsmMapComponent: React.FC<OsmMapComponentProps> = ({
  mode,
  centerLat,
  centerLng,
  zoom = 13,
  selectedLat,
  selectedLng,
  onPickCoordinate,
  markers = [],
  heightClass = 'h-72',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [centerLat || 23.7389, centerLng || 90.3948],
      zoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = layerGroup;

    if (mode === 'picker' && onPickCoordinate) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        onPickCoordinate(
          Math.round(e.latlng.lat * 100000) / 100000,
          Math.round(e.latlng.lng * 100000) / 100000
        );
      });
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Sync map center when preset hospital or district changes
  useEffect(() => {
    if (!mapRef.current) return;
    if (centerLat && centerLng) {
      mapRef.current.setView([centerLat, centerLng], mapRef.current.getZoom(), {
        animate: true,
      });
    }
  }, [centerLat, centerLng]);

  // Render markers
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (mode === 'picker' && typeof selectedLat === 'number' && typeof selectedLng === 'number' && (selectedLat !== 0 || selectedLng !== 0)) {
      const pinIcon = L.divIcon({
        className: 'custom-osm-pin',
        html: `<div style="background:#C62828;color:#fff;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:3px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,0.35);">📍</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      L.marker([selectedLat, selectedLng], { icon: pinIcon })
        .addTo(group)
        .bindPopup(`Pinned Location: ${selectedLat.toFixed(4)}, ${selectedLng.toFixed(4)}`);
    }

    if (mode === 'radar') {
      markers.forEach((m) => {
        if (!m.lat && !m.lng) return;
        const bgColor =
          m.type === 'request'
            ? m.isUrgent
              ? '#D50000'
              : '#C62828'
            : m.type === 'self'
              ? '#1976D2'
              : '#00796B';

        const badgeLabel = m.bloodGroup || (m.type === 'self' ? 'ME' : 'PIN');
        const icon = L.divIcon({
          className: 'custom-radar-marker',
          html: `<div style="background:${bgColor};color:#ffffff;min-width:36px;height:36px;padding:0 6px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2.5px solid #ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.3);">${badgeLabel}</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const marker = L.marker([m.lat, m.lng], { icon }).addTo(group);
        const mapUrl = buildBrowserMapUrl(m.hospital || m.title, m.lat, m.lng, true);
        const popupHtml = `
          <div style="min-width:190px;font-family:inherit;line-height:1.4;">
            <div style="font-weight:700;font-size:13px;color:#212121;margin-bottom:2px;">${m.title}</div>
            <div style="font-size:12px;color:#616161;margin-bottom:6px;">${m.subtitle}</div>
            <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;font-size:12px;font-weight:600;color:#C62828;text-decoration:underline;">
              Open in Google Maps ↗
            </a>
          </div>
        `;
        marker.bindPopup(popupHtml);
        if (m.onSelect) {
          marker.on('click', () => m.onSelect && m.onSelect(m.id));
        }
      });
    }
  }, [mode, selectedLat, selectedLng, markers]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
      <div ref={containerRef} className={`w-full ${heightClass}`} />
    </div>
  );
};
