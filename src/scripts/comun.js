// Utilidades compartidas del Observatorio: carga de datos, formato y clases de color.

export const BASE = import.meta.env.BASE_URL;

const cache = new Map();
export function cargaJSON(ruta) {
  if (!cache.has(ruta)) {
    cache.set(ruta, fetch(BASE + ruta).then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar ${ruta} (${r.status})`);
      return r.json();
    }));
  }
  return cache.get(ruta);
}

// Tabla columnar {campos, n, datos:{campo:[...]}} → arreglo de objetos
export function filas(tabla) {
  const { campos, n, datos } = tabla;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const o = {};
    for (const c of campos) o[c] = datos[c][i];
    out[i] = o;
  }
  return out;
}

const nf = (d, min = 0) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: d, minimumFractionDigits: min });
export function fmt(x, dec) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  const a = Math.abs(x);
  if (dec !== undefined) return nf(dec, dec).format(x);
  const d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : 3;
  return nf(d).format(x);
}
export function fmtCorto(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1e6) return `${fmt(x / 1e6, 1)} M`;
  if (a >= 1e4) return `${fmt(x / 1e3, 0)} mil`;
  return fmt(x);
}

// Cortes por cuantiles (k clases) sobre valores positivos; redondeados a 2 cifras significativas
export function cortesCuantiles(valores, k) {
  const v = valores.filter((x) => x > 0 && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return [];
  const cortes = [];
  for (let i = 1; i < k; i++) {
    const q = v[Math.min(v.length - 1, Math.floor((i * v.length) / k))];
    cortes.push(redondea2(q));
  }
  return [...new Set(cortes)].filter((c) => c > 0);
}
function redondea2(x) {
  if (x <= 0) return x;
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}
export function claseDe(x, cortes) {
  let i = 0;
  while (i < cortes.length && x > cortes[i]) i++;
  return i;
}
// Escoge colores de la escala (7) repartidos para n clases
export function coloresPara(escala, n) {
  if (n >= escala.length) return escala.slice(0, n);
  const out = [];
  for (let i = 0; i < n; i++) out.push(escala[Math.round((i * (escala.length - 1)) / Math.max(1, n - 1))]);
  return out;
}

// Paleta categórica validada (6 series; orden fijo, no se recicla)
export const SERIES = ['#2a6fc4', '#e0662e', '#1a9e74', '#b8860b', '#c2356f', '#6b4fbf'];

export function descargaCSV(nombre, encabezado, renglones) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = [encabezado, ...renglones].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// Estilo del mapa base (OpenFreeMap, sin clave). Si no carga, se usa un fondo liso.
export const ESTILO_BASE = 'https://tiles.openfreemap.org/styles/positron';
export const ESTILO_LISO = { version: 8, sources: {}, layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#eef1f4' } }] };
export const CAJA_SONORA = [[-115.1, 26.25], [-108.4, 32.55]];

// El estilo de OpenFreeMap ya trae su propia atribución (OpenFreeMap, OpenMapTiles, OpenStreetMap)
export const ATRIBUCION = 'Límites: INEGI · Distritos de Riego: SIAP';

// Opciones comunes de ECharts (texto en tinta neutra, rejilla recesiva)
export function baseGrafica() {
  return {
    textStyle: { fontFamily: 'Montserrat, system-ui, sans-serif', color: '#333' },
    grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', confine: true },
    animationDuration: 300,
  };
}
export const EJE = {
  axisLine: { lineStyle: { color: '#bbb' } },
  axisTick: { show: false },
  axisLabel: { color: '#5f5f5f', fontSize: 11 },
  splitLine: { lineStyle: { color: '#eee' } },
};
