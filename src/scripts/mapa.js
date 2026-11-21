// MapLibre para las páginas con mapa (sólo se carga donde se usa)
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 carga su worker desde un archivo aparte; Vite lo copia al build con ?url
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

maplibregl.setWorkerUrl(workerUrl);
export { maplibregl };

import { ESTILO_BASE, ESTILO_LISO, CAJA_SONORA, ATRIBUCION } from './comun.js';

// Etiquetas del mapa base en español cuando existan
function etiquetasEnEspanol(mapa) {
  for (const capa of mapa.getStyle().layers) {
    if (capa.type !== 'symbol' || !mapa.getLayoutProperty(capa.id, 'text-field')) continue;
    mapa.setLayoutProperty(capa.id, 'text-field', ['coalesce', ['get', 'name:es'], ['get', 'name']]);
  }
}

// Mapa centrado en Sonora. alListo(mapa) se llama cada vez que el estilo termina de cargar
// (también si se cambia al fondo liso porque el mapa base no respondió).
export function creaMapaBase(contenedor, alListo) {
  let listo = false;
  const mapa = new maplibregl.Map({
    container: contenedor, style: ESTILO_BASE, bounds: CAJA_SONORA, fitBoundsOptions: { padding: 16 },
    attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
  });
  mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  mapa.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ATRIBUCION }), 'bottom-right');
  mapa.touchZoomRotate.disableRotation();
  const alFondoLiso = () => { if (!listo) { listo = true; mapa.setStyle(ESTILO_LISO); } };
  const respaldo = setTimeout(alFondoLiso, 8000);
  mapa.on('error', (e) => { if (!listo && /style|fetch|load/i.test(String(e?.error?.message || ''))) alFondoLiso(); });
  mapa.on('style.load', () => {
    clearTimeout(respaldo);
    listo = true;
    try { etiquetasEnEspanol(mapa); } catch { /* estilo sin etiquetas */ }
    mapa.resize();
    mapa.fitBounds(CAJA_SONORA, { padding: 16, animate: false });
    alListo(mapa);
  });
  return mapa;
}
