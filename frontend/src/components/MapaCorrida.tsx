import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { CENTRO_SP, ZOOM_INICIAL } from '../services/geo';
import type { Campo, Local, Ponto, Rota } from '../types';
import { pinDestino, pinOrigem } from './pins';

interface Props {
  origem: Local | null;
  destino: Local | null;
  rota: Rota | null;
  onClicarMapa: (ponto: Ponto) => void;
  onArrastarPino: (campo: Campo, ponto: Ponto) => void;
}

/** Espaço ocupado pelo painel sobre o mapa, para enquadrar a rota sem ficar escondida. */
function margensDoPainel(): { topLeft: L.PointExpression; bottomRight: L.PointExpression } {
  const desktop = window.matchMedia('(min-width: 900px)').matches;
  if (desktop) {
    const painel = document.querySelector<HTMLElement>('.painel');
    const largura = painel ? painel.getBoundingClientRect().right : 420;
    return { topLeft: [largura + 48, 64], bottomRight: [48, 48] };
  }
  const painel = document.querySelector<HTMLElement>('.painel');
  const alturaPainel = painel ? window.innerHeight - painel.getBoundingClientRect().top : window.innerHeight * 0.5;
  return { topLeft: [32, 72], bottomRight: [32, Math.min(alturaPainel + 24, window.innerHeight * 0.7)] };
}

function CliqueNoMapa({ onClicar }: { onClicar: (p: Ponto) => void }) {
  useMapEvents({
    click(e) {
      onClicar({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

function Enquadramento({ origem, destino, rota }: Pick<Props, 'origem' | 'destino' | 'rota'>) {
  const map = useMap();

  const chaveRota = rota ? `${rota.fonte}:${rota.coordenadas.length}:${rota.coordenadas[0]}:${rota.coordenadas.at(-1)}` : '';

  useEffect(() => {
    const { topLeft, bottomRight } = margensDoPainel();
    if (rota && rota.coordenadas.length >= 2) {
      map.flyToBounds(L.latLngBounds(rota.coordenadas), {
        paddingTopLeft: topLeft,
        paddingBottomRight: bottomRight,
        maxZoom: 16,
        duration: 0.6,
      });
      return;
    }
    const unico = origem ?? destino;
    if (unico) {
      const alvo = L.latLng(unico.ponto.lat, unico.ponto.lon);
      // Só recentra se o ponto estiver fora da área útil visível.
      const area = map.getBounds().pad(-0.15);
      if (!area.contains(alvo)) map.flyTo(alvo, Math.max(map.getZoom(), 14), { duration: 0.6 });
    }
  }, [chaveRota, origem?.ponto.lat, origem?.ponto.lon, destino?.ponto.lat, destino?.ponto.lon]);

  return null;
}

export function MapaCorrida({ origem, destino, rota, onClicarMapa, onArrastarPino }: Props) {
  const eventosOrigem = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const ll = (e.target as L.Marker).getLatLng();
        onArrastarPino('origem', { lat: ll.lat, lon: ll.lng });
      },
    }),
    [onArrastarPino],
  );
  const eventosDestino = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const ll = (e.target as L.Marker).getLatLng();
        onArrastarPino('destino', { lat: ll.lat, lon: ll.lng });
      },
    }),
    [onArrastarPino],
  );

  return (
    <div className="mapa" data-testid="mapa" role="region" aria-label="Mapa de São Paulo. Clique para marcar origem e destino.">
      <MapContainer
        center={CENTRO_SP}
        zoom={ZOOM_INICIAL}
        zoomControl={false}
        className="mapa__leaflet"
        attributionControl
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>'
          maxZoom={19}
        />
        <ControleZoom />
        <CliqueNoMapa onClicar={onClicarMapa} />
        <Enquadramento origem={origem} destino={destino} rota={rota} />

        {rota && (
          <>
            <Polyline
              positions={rota.coordenadas}
              pathOptions={{ color: '#0b1220', weight: 9, opacity: 0.18, lineCap: 'round', lineJoin: 'round' }}
              interactive={false}
            />
            <Polyline
              key={rota.fonte}
              positions={rota.coordenadas}
              pathOptions={
                rota.fonte === 'osrm'
                  ? { color: '#4338ca', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }
                  : { color: '#4338ca', weight: 4, opacity: 0.9, dashArray: '2 10', lineCap: 'round' }
              }
              interactive={false}
            />
          </>
        )}

        {origem && (
          <Marker
            position={[origem.ponto.lat, origem.ponto.lon]}
            icon={pinOrigem}
            draggable
            autoPan
            title={`Origem: ${origem.rotulo}`}
            alt={`Origem: ${origem.rotulo}`}
            eventHandlers={eventosOrigem}
            zIndexOffset={500}
          />
        )}
        {destino && (
          <Marker
            position={[destino.ponto.lat, destino.ponto.lon]}
            icon={pinDestino}
            draggable
            autoPan
            title={`Destino: ${destino.rotulo}`}
            alt={`Destino: ${destino.rotulo}`}
            eventHandlers={eventosDestino}
            zIndexOffset={600}
          />
        )}
      </MapContainer>
    </div>
  );
}

/** Controle de zoom posicionado à direita, fora do caminho do painel. */
function ControleZoom() {
  const map = useMap();
  useEffect(() => {
    const ctrl = L.control.zoom({ position: 'topright', zoomInTitle: 'Aproximar', zoomOutTitle: 'Afastar' });
    ctrl.addTo(map);
    return () => {
      ctrl.remove();
    };
  }, [map]);
  return null;
}
