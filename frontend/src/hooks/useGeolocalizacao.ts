import { useCallback, useState } from 'react';
import type { Ponto } from '../types';

export class ErroGeolocalizacao extends Error {}

function mensagemErro(e: GeolocationPositionError): string {
  switch (e.code) {
    case e.PERMISSION_DENIED:
      return 'Permissão de localização negada. Digite o endereço de origem ou toque no mapa.';
    case e.POSITION_UNAVAILABLE:
      return 'Não foi possível determinar sua localização. Digite o endereço ou toque no mapa.';
    case e.TIMEOUT:
      return 'A localização demorou demais para responder. Tente novamente ou toque no mapa.';
    default:
      return 'Não foi possível obter sua localização.';
  }
}

/** Obtém a posição atual do dispositivo com tratamento de falhas. */
export function useGeolocalizacao() {
  const [carregando, setCarregando] = useState(false);

  const obter = useCallback((): Promise<Ponto> => {
    if (!('geolocation' in navigator)) {
      return Promise.reject(new ErroGeolocalizacao('Seu navegador não oferece geolocalização. Digite o endereço ou toque no mapa.'));
    }
    if (!window.isSecureContext) {
      return Promise.reject(new ErroGeolocalizacao('A geolocalização exige conexão segura (HTTPS). Digite o endereço ou toque no mapa.'));
    }
    setCarregando(true);
    return new Promise<Ponto>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCarregando(false);
          resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        (err) => {
          setCarregando(false);
          reject(new ErroGeolocalizacao(mensagemErro(err)));
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
      );
    });
  }, []);

  return { obter, carregando };
}
