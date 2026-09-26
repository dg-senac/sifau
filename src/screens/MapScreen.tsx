import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Occurrence } from '@/lib/types';
import { PageTitle } from '@/components/ui';

const STATUS_COLOR: Record<string, string> = {
  Aberta: '#4f8fe1',
  Triada: '#4f8fe1',
  Atribuída: '#f0a428',
  'Em vistoria': '#f0a428',
  Resolvida: '#2aaf75',
  Arquivada: '#9aa8b8',
  Escalonada: '#be4d4d',
};

export function MapScreen() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const [items, setItems] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('ocorrencias')
      .select('*')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('created_at', { ascending: false })
      .limit(150)
      .then(({ data }) => {
        setItems(data ?? []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    leafletMap.current = L.map(mapRef.current, { zoomControl: true }).setView([-8.0476, -34.877], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(leafletMap.current);
    return () => {
      leafletMap.current?.remove();
      leafletMap.current = null;
    };
  }, []);

  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !items.length) return;
    const markers: L.CircleMarker[] = [];
    items.forEach((item) => {
      if (item.latitude == null || item.longitude == null) return;
      const marker = L.circleMarker([item.latitude, item.longitude], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: STATUS_COLOR[item.status] ?? '#4f8fe1',
        fillOpacity: 0.95,
      }).bindPopup(
        `<b>${item.categoria}</b><br/>${item.bairro}<br/><span style="color:#8090a3">${item.status}</span>`,
      );
      marker.addTo(map);
      markers.push(marker);
    });
    if (markers.length) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds().pad(0.2));
    }
    return () => { markers.forEach((m) => m.remove()); };
  }, [items]);

  return (
    <>
      <PageTitle
        eyebrow="Visão geográfica"
        title="Mapa da cidade"
        action={loading ? <Loader2 className="spin" size={18} /> : <span className="result-count">{items.length} pontos</span>}
      />
      <div className="leaflet-container-wrap">
        <div ref={mapRef} className="leaflet-map" />
      </div>
      <div className="map-legend">
        <span><i style={{ background: '#4f8fe1' }} /> Aberta / triada</span>
        <span><i style={{ background: '#f0a428' }} /> Em andamento</span>
        <span><i style={{ background: '#2aaf75' }} /> Resolvida</span>
        <span><i style={{ background: '#be4d4d' }} /> Escalonada</span>
      </div>
      {!loading && items.length === 0 && (
        <div className="empty-state"><MapPin size={27} /><b>Sem ocorrências geolocalizadas</b><span>Registros com localização aparecerão aqui.</span></div>
      )}
    </>
  );
}
