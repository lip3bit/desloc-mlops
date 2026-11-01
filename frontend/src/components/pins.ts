import L from 'leaflet';

/** Pin de origem: anel com núcleo, ancorado no centro. */
export const pinOrigem = L.divIcon({
  className: 'pin-wrap',
  html: '<span class="pin pin--origem" aria-hidden="true"><span class="pin__nucleo"></span></span>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -16],
});

/** Pin de destino: gota com quadrado central, ancorada na ponta. */
export const pinDestino = L.divIcon({
  className: 'pin-wrap',
  html: '<span class="pin pin--destino" aria-hidden="true"><span class="pin__gota"><span class="pin__miolo"></span></span></span>',
  iconSize: [34, 40],
  iconAnchor: [17, 37],
  popupAnchor: [0, -36],
});
