// Explorador: mapa coroplético por municipio + series de tiempo comparativas.
import { maplibregl, creaMapaBase } from './mapa.js';
import {
  cargaJSON, filas, fmt, cortesCuantiles, claseDe, coloresPara, SERIES, descargaCSV,
  baseGrafica, EJE,
} from './comun.js';
import { creaGrafica } from './graficas.js';

const MAX_SEL = SERIES.length;
const $ = (id) => document.getElementById(id);

async function main() {
const [cat, indicadores, geo, fuentes] = await Promise.all([
  cargaJSON('datos/agricola/catalogos.json'),
  cargaJSON('datos/indicadores.json'),
  cargaJSON('datos/geo/municipios.geojson'),
  cargaJSON('datos/fuentes.json'),
]);
const inds = indicadores.filter((i) => i.escala === 'municipio');
// Cada indicador declara su archivo (registro de indicadores); se cargan todos los archivos de tablas municipales.
const DIMS = new Set(['anio', 'cvegeo', 'ciclo', 'modalidad', 'cultivo', 'unidad', 'rotacion']);
const tablas = {};
const camposNum = {};
await Promise.all([...new Set(inds.filter((i) => i.estado === 'publicado').map((i) => i.archivo))].map(async (a) => {
  const t = await cargaJSON(`datos/${a}`);
  tablas[a] = filas(t);
  camposNum[a] = t.campos.filter((c) => !DIMS.has(c));
}));
const ARCH_SIAP = 'agricola/cierre_municipal.json';
const registros = tablas[ARCH_SIAP];
const regs = (ind) => tablas[ind.archivo];
const indPorId = Object.fromEntries(inds.map((i) => [i.id, i]));
const nomMun = Object.fromEntries(cat.municipios.map((m) => [m.cvegeo, m.nombre]));
const nomCul = Object.fromEntries(cat.cultivos.map((c) => [c.id, c.nombre]));
const uniCul = Object.fromEntries(cat.cultivos.map((c) => [c.id, Array.isArray(c.unidad) ? c.unidad.join('/') : c.unidad]));
const fuentePorId = Object.fromEntries(fuentes.map((f) => [f.id, f]));
const anios = cat.anios;

// Superficie promedio por cultivo para ordenar la lista de cultivos
const supCul = {};
for (const r of registros) supCul[r.cultivo] = (supCul[r.cultivo] || 0) + (r.sembrada_ha || 0);

// ---------------------------------------------------------------- estado
const estado = {
  ind: 'sembrada_ha', anio: anios[anios.length - 1], ciclo: 'todos', mod: 'todas', cultivo: 'todos',
  rot: 'todas', sel: [], foco: null,
};
const colorSel = {}; // cvegeo → color; se conserva mientras siga seleccionado
function leeHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (indPorId[p.get('ind')]?.estado === 'publicado') estado.ind = p.get('ind');
  if (anios.includes(+p.get('anio'))) estado.anio = +p.get('anio');
  if (['OI', 'PV', 'PER'].includes(p.get('ciclo'))) estado.ciclo = p.get('ciclo');
  if (['R', 'T'].includes(p.get('mod'))) estado.mod = p.get('mod');
  if (nomCul[p.get('cultivo')]) estado.cultivo = +p.get('cultivo');
  if (['primero', 'segundo', 'perenne', 'no_identificado'].includes(p.get('rot'))) estado.rot = p.get('rot');
  const sel = (p.get('mun') || '').split(',').filter((c) => nomMun[c]).slice(0, MAX_SEL);
  estado.sel = sel;
  estado.foco = sel[sel.length - 1] || null;
  asignaColores();
}
function escribeHash() {
  const p = new URLSearchParams();
  p.set('ind', estado.ind); p.set('anio', estado.anio);
  if (estado.ciclo !== 'todos') p.set('ciclo', estado.ciclo);
  if (estado.mod !== 'todas') p.set('mod', estado.mod);
  if (estado.cultivo !== 'todos') p.set('cultivo', estado.cultivo);
  if (estado.rot !== 'todas' && conRotacion()) p.set('rot', estado.rot);
  if (estado.sel.length) p.set('mun', estado.sel.join(','));
  history.replaceState(null, '', '#' + p.toString());
}
function asignaColores() {
  for (const c of Object.keys(colorSel)) if (!estado.sel.includes(c)) delete colorSel[c];
  for (const c of estado.sel) {
    if (!colorSel[c]) colorSel[c] = SERIES.find((s) => !Object.values(colorSel).includes(s));
  }
}

// ---------------------------------------------------------------- cálculo
function pasa(r, { anio = estado.anio, cultivo = estado.cultivo } = {}) {
  return (anio === null || r.anio === anio)
    && (estado.ciclo === 'todos' || r.ciclo === estado.ciclo)
    && (estado.mod === 'todas' || r.modalidad === estado.mod)
    && (cultivo === 'todos' || r.cultivo === cultivo)
    && (estado.rot === 'todas' || r.rotacion === undefined || r.rotacion === estado.rot);
}
const conRotacion = () => (indPorId[estado.ind].dimensiones || []).includes('rotacion');
function suma(acc, r) {
  for (const c in r) if (typeof r[c] === 'number' && !DIMS.has(c)) acc[c] = (acc[c] || 0) + r[c];
  acc._n = (acc._n || 0) + 1;
  return acc;
}
// extremo: null (estimación central), 'min' o 'max' (banda de sensibilidad del indicador)
function valor(ind, s, extremo = null) {
  if (!s) return null;
  const num = extremo ? ind.banda?.[extremo] : (ind.tipo === 'suma' ? ind.campo : ind.numerador);
  if (!num) return null;
  if (ind.tipo === 'suma') return (s[num] || 0) * (ind.factor ?? 1);
  const den = s[ind.denominador] || 0;
  return den > 0 ? ((s[num] || 0) / den) * (ind.factor ?? 1) : null;
}
function porMunicipio(ind, opts) {
  const m = {};
  for (const r of regs(ind)) if (pasa(r, opts)) suma(m[r.cvegeo] ||= {}, r);
  return m;
}
// Producción, rendimiento y precio se expresan en la unidad del cultivo (casi siempre toneladas)
function unidadDe(ind, cultivo = estado.cultivo) {
  if (cultivo === 'todos' || uniCul[cultivo] === 'Tonelada' || !/(^t\b|\/t$)/.test(ind.unidad)) return ind.unidad;
  return ind.unidad.replace(/^t\b/, 'manojos').replace(/\/t$/, '/manojo');
}
const requiereCultivo = () => indPorId[estado.ind].requiere_cultivo && estado.cultivo === 'todos';

// ---------------------------------------------------------------- controles
function llenaControles() {
  const sInd = $('f-ind');
  const grupos = {};
  for (const i of inds) (grupos[i.grupo || 'Agricultura (SIAP)'] ||= []).push(i);
  sInd.innerHTML = Object.entries(grupos).map(([g, lista]) => `<optgroup label="${g}">`
    + lista.map((i) => `<option value="${i.id}" ${i.estado !== 'publicado' ? 'disabled' : ''}>${i.nombre} (${i.unidad})${i.estado !== 'publicado' ? ' — próximamente' : ''}</option>`).join('')
    + '</optgroup>').join('');
  $('f-anio').innerHTML = anios.slice().reverse().map((a) => `<option value="${a}">${a}</option>`).join('');
  const culOrden = cat.cultivos.slice().sort((a, b) => (supCul[b.id] || 0) - (supCul[a.id] || 0));
  $('f-cultivo').innerHTML = '<option value="todos">Todos los cultivos</option>'
    + '<optgroup label="Por superficie sembrada (2019–2025)">'
    + culOrden.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('') + '</optgroup>';
  sincronizaControles();
  for (const [id, k, conv] of [['f-ind', 'ind', String], ['f-anio', 'anio', Number], ['f-ciclo', 'ciclo', String], ['f-mod', 'mod', String], ['f-cultivo', 'cultivo', (v) => (v === 'todos' ? v : +v)], ['f-rot', 'rot', String]]) {
    $(id).addEventListener('change', (e) => { estado[k] = conv(e.target.value); actualiza(); });
  }
  $('b-limpiar').addEventListener('click', () => { estado.sel = []; estado.foco = null; asignaColores(); actualiza(); });
  $('b-csv').addEventListener('click', descarga);
}
function sincronizaControles() {
  $('f-ind').value = estado.ind; $('f-anio').value = estado.anio; $('f-ciclo').value = estado.ciclo;
  $('f-mod').value = estado.mod; $('f-cultivo').value = estado.cultivo;
  $('f-rot').value = estado.rot; $('f-rot').disabled = !conRotacion();
  $('f-rot').title = conRotacion() ? '' : 'Sólo para las capas de huella hídrica';
}

// ---------------------------------------------------------------- mapa
let mapa;
let popup;
let listo = false;
function creaMapa() {
  mapa = creaMapaBase('mapa', (m) => {
    if (m.getSource('mun')) return;
    m.addSource('mun', { type: 'geojson', data: geo, promoteId: 'cvegeo' });
    const primeraEtiqueta = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    m.addLayer({ id: 'mun-fill', type: 'fill', source: 'mun', paint: {
      'fill-color': ['coalesce', ['feature-state', 'color'], '#e4e4e4'],
      'fill-opacity': 0.86,
    } }, primeraEtiqueta);
    m.addLayer({ id: 'mun-borde', type: 'line', source: 'mun', paint: { 'line-color': '#ffffff', 'line-width': 0.8 } }, primeraEtiqueta);
    m.addLayer({ id: 'mun-hover', type: 'line', source: 'mun', paint: {
      'line-color': '#410324', 'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2, 0],
    } });
    m.addLayer({ id: 'mun-sel', type: 'line', source: 'mun', paint: {
      'line-color': ['coalesce', ['feature-state', 'sel'], 'rgba(0,0,0,0)'], 'line-width': 3,
    } });
    listo = true;
    pintaMapa();
  });
  popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
  let hoverId = null;
  mapa.on('mousemove', 'mun-fill', (e) => {
    const f = e.features[0];
    if (hoverId !== null) mapa.setFeatureState({ source: 'mun', id: hoverId }, { hover: false });
    hoverId = f.id;
    mapa.setFeatureState({ source: 'mun', id: hoverId }, { hover: true });
    mapa.getCanvas().style.cursor = 'pointer';
    popup.setLngLat(e.lngLat).setHTML(textoPopup(f.id)).addTo(mapa);
  });
  mapa.on('mouseleave', 'mun-fill', () => {
    if (hoverId !== null) mapa.setFeatureState({ source: 'mun', id: hoverId }, { hover: false });
    hoverId = null; mapa.getCanvas().style.cursor = ''; popup.remove();
  });
  mapa.on('click', 'mun-fill', (e) => alterna(e.features[0].id));
}
let valoresMapa = {};
function textoPopup(cv) {
  const ind = indPorId[estado.ind];
  const v = valoresMapa[cv];
  const txt = requiereCultivo() ? 'Elige un cultivo' : v === null || v === undefined ? 'Sin registro' : `${fmt(v)} ${unidadDe(ind)}`;
  return `<strong>${nomMun[cv]}</strong><br>${ind.nombre}: ${txt}<br><span style="color:#777">Clic para comparar</span>`;
}
function alterna(cv) {
  const i = estado.sel.indexOf(cv);
  if (i >= 0) { estado.sel.splice(i, 1); if (estado.foco === cv) estado.foco = estado.sel[estado.sel.length - 1] || null; }
  else {
    if (estado.sel.length >= MAX_SEL) { aviso(`Se pueden comparar hasta ${MAX_SEL} municipios.`); return; }
    estado.sel.push(cv); estado.foco = cv;
  }
  asignaColores();
  actualiza();
}
function aviso(t) { const a = $('aviso-sel'); a.textContent = t; setTimeout(() => { a.textContent = ''; }, 3500); }

let cortes = [];
let colores = [];
function pintaMapa() {
  const ind = indPorId[estado.ind];
  const porMun = porMunicipio(ind);
  valoresMapa = {};
  for (const f of geo.features) {
    const cv = f.properties.cvegeo;
    valoresMapa[cv] = requiereCultivo() ? null : valor(ind, porMun[cv]);
  }
  const vals = Object.values(valoresMapa).filter((v) => v !== null && v > 0);
  cortes = cortesCuantiles(vals, 7);
  colores = coloresPara(ind.escala_color, cortes.length + 1);
  if (listo) {
    for (const f of geo.features) {
      const cv = f.properties.cvegeo;
      const v = valoresMapa[cv];
      const color = v === null || v === undefined || v <= 0 ? null : colores[claseDe(v, cortes)];
      mapa.setFeatureState({ source: 'mun', id: cv }, { color, sel: colorSel[cv] || null });
    }
  }
  pintaLeyenda(ind, vals.length);
}
function pintaLeyenda(ind, n) {
  const el = $('leyenda');
  $('leyenda-titulo').textContent = `${ind.nombre} (${unidadDe(ind)}) · ${descripcionFiltro()}`;
  if (requiereCultivo()) { el.innerHTML = `<p class="nota">Este indicador sólo tiene sentido para un cultivo: elige uno en «Cultivo».</p>`; return; }
  if (!n) { el.innerHTML = '<p class="nota">No hay registros con este filtro.</p>'; return; }
  const etq = (i) => (i < cortes.length ? `≤ ${fmt(cortes[i])}` : `> ${fmt(cortes[cortes.length - 1] ?? 0)}`);
  el.innerHTML = colores.map((c, i) => `<div class="clase"><i style="background:${c}"></i><span>${etq(i)}</span></div>`).join('')
    + '<div class="clase"><i style="background:#e4e4e4"></i><span>sin registro</span></div>';
}
function descripcionFiltro() {
  const partes = [estado.anio];
  partes.push(estado.cultivo === 'todos' ? 'todos los cultivos' : nomCul[estado.cultivo]);
  if (estado.ciclo !== 'todos') partes.push({ OI: 'otoño-invierno', PV: 'primavera-verano', PER: 'perennes' }[estado.ciclo]);
  if (estado.mod !== 'todas') partes.push(estado.mod === 'R' ? 'riego' : 'temporal');
  return partes.join(' · ');
}

// ---------------------------------------------------------------- gráficas
let gSerie;
let gCultivos;
function pintaSerie() {
  const ind = indPorId[estado.ind];
  const porAnio = {};
  for (const r of regs(ind)) {
    if (!pasa(r, { anio: null })) continue;
    const k = estado.sel.length ? r.cvegeo : 'Sonora';
    if (estado.sel.length && !estado.sel.includes(k)) continue;
    suma(((porAnio[k] ||= {})[r.anio] ||= {}), r);
  }
  const claves = estado.sel.length ? estado.sel : ['Sonora'];
  const series = claves.map((k) => ({
    name: k === 'Sonora' ? 'Sonora (total)' : nomMun[k],
    type: 'line', smooth: false, symbol: 'circle', symbolSize: 8, showSymbol: true,
    lineStyle: { width: 2 }, itemStyle: { color: k === 'Sonora' ? '#960E53' : colorSel[k], borderColor: '#fff', borderWidth: 2 },
    data: anios.map((a) => (requiereCultivo() ? null : valor(ind, porAnio[k]?.[a]))),
    connectNulls: false, z: 3,
  }));
  // Banda de sensibilidad (mínimo y máximo de las variantes) cuando hay una sola serie
  const banda = {};
  if (ind.banda && claves.length === 1 && !requiereCultivo()) {
    const k = claves[0];
    const color = k === 'Sonora' ? '#960E53' : colorSel[k];
    for (const a of anios) banda[a] = [valor(ind, porAnio[k]?.[a], 'min'), valor(ind, porAnio[k]?.[a], 'max')];
    const lo = anios.map((a) => banda[a][0]);
    series.unshift(
      { name: '_min', type: 'line', stack: 'banda', data: lo, symbol: 'none', lineStyle: { opacity: 0 }, silent: true, z: 1 },
      { name: 'Intervalo de sensibilidad', type: 'line', stack: 'banda', symbol: 'none', lineStyle: { opacity: 0 }, silent: true, z: 1,
        areaStyle: { color, opacity: 0.14 }, data: anios.map((a) => (banda[a][1] === null || banda[a][0] === null ? null : banda[a][1] - banda[a][0])) },
    );
  }
  $('nota-banda').textContent = ind.banda
    ? (claves.length === 1 ? 'Área sombreada: mínimo y máximo de las variantes de sensibilidad (no es un intervalo de confianza).'
      : 'Con un solo municipio seleccionado se muestra el intervalo de sensibilidad.')
    : '';
  $('titulo-serie').textContent = `${ind.nombre} por año (${unidadDe(ind)})`;
  gSerie.setOption({
    ...baseGrafica(),
    legend: { show: false }, // las fichas de arriba son la leyenda (con color y nombre)
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis', confine: true, formatter: (ps) => {
      const a = +ps[0].axisValue;
      const lineas = ps.filter((p) => !p.seriesName.startsWith('_') && p.seriesName !== 'Intervalo de sensibilidad')
        .map((p) => `${p.marker}${p.seriesName}: ${p.value === null || p.value === undefined ? 'sin registro' : `${fmt(p.value)} ${unidadDe(ind)}`}`);
      if (banda[a] && banda[a][0] !== null) lineas.push(`<span style="color:#777">Intervalo: ${fmt(banda[a][0])} – ${fmt(banda[a][1])}</span>`);
      return `${a}<br>${lineas.join('<br>')}`;
    } },
    xAxis: { type: 'category', data: anios.map(String), boundaryGap: false, ...EJE, splitLine: { show: false } },
    yAxis: { type: 'value', ...EJE, axisLabel: { ...EJE.axisLabel, formatter: (v) => fmt(v) } },
    series,
  }, true);
  const chips = $('chips');
  chips.innerHTML = estado.sel.length
    ? estado.sel.map((c) => `<span class="chip"><i style="background:${colorSel[c]}"></i>${nomMun[c]}<button type="button" data-quita="${c}" aria-label="Quitar ${nomMun[c]}">×</button></span>`).join('')
    : '<span class="nota">Total del estado. Haz clic en los municipios del mapa (o en la tabla) para comparar hasta seis.</span>';
  chips.querySelectorAll('[data-quita]').forEach((b) => b.addEventListener('click', () => alterna(b.dataset.quita)));
}
function pintaCultivos() {
  // Producción, rendimiento y precio no se comparan entre cultivos (productos y unidades distintos):
  // en ese caso se muestra la superficie sembrada de cada cultivo.
  const sel = indPorId[estado.ind];
  const ind = sel.requiere_cultivo && !sel.compara_cultivos ? indPorId.sembrada_ha : sel;
  const porCul = {};
  for (const r of regs(ind)) {
    if (!pasa(r, { cultivo: 'todos' })) continue;
    if (estado.foco && r.cvegeo !== estado.foco) continue;
    suma((porCul[r.cultivo] ||= {}), r);
  }
  const lista = Object.entries(porCul).map(([c, s]) => [+c, valor(ind, s), s.sembrada_ha || 0])
    .filter(([, v]) => v !== null && v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 10).reverse();
  const donde = estado.foco ? nomMun[estado.foco] : 'Sonora';
  $('titulo-cultivos').textContent = `Cultivos principales — ${donde}, ${estado.anio}`;
  $('nota-cultivos').textContent = ind !== sel
    ? `${sel.nombre} no se compara entre cultivos; se muestra la superficie sembrada (ha). Ciclo y modalidad según el filtro.`
    : `${ind.nombre} (${ind.unidad}); los 10 cultivos con mayor valor. Ciclo y modalidad según el filtro.`;
  gCultivos.setOption({
    ...baseGrafica(),
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: 'item', confine: true, formatter: (p) => `${p.name}<br>${fmt(p.value)} ${ind.unidad}` },
    xAxis: { type: 'value', ...EJE, axisLabel: { ...EJE.axisLabel, formatter: (v) => fmt(v) } },
    yAxis: { type: 'category', data: lista.map(([c]) => nomCul[c]), ...EJE, axisLabel: { ...EJE.axisLabel, width: 150, overflow: 'truncate' } },
    series: [{ type: 'bar', data: lista.map(([, v]) => v), barMaxWidth: 18, itemStyle: { color: estado.foco ? colorSel[estado.foco] : '#960E53', borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: '#5f5f5f', fontSize: 11, formatter: (p) => fmt(p.value) } }],
  }, true);
  if (!lista.length) gCultivos.setOption({ title: { text: 'Sin registros con este filtro', left: 'center', top: 'middle', textStyle: { color: '#777', fontSize: 13, fontWeight: 500 } } });
}
function pintaTabla() {
  const ind = indPorId[estado.ind];
  const filasT = Object.entries(valoresMapa).filter(([, v]) => v !== null && v > 0).sort((a, b) => b[1] - a[1]);
  const total = filasT.reduce((s, [, v]) => s + v, 0);
  const todos = $('tabla-todos').checked;
  const mostrar = todos ? filasT : filasT.slice(0, 12);
  $('tabla-mun').innerHTML = `<thead><tr><th>#</th><th>Municipio</th><th class="num">${ind.nombre} (${unidadDe(ind)})</th>${ind.tipo === 'suma' ? '<th class="num">% del total</th>' : ''}<th></th></tr></thead><tbody>`
    + (requiereCultivo() ? '<tr><td colspan="5" class="nota">Elige un cultivo.</td></tr>'
      : mostrar.map(([cv, v], i) => `<tr><td>${i + 1}</td><td>${nomMun[cv]}</td><td class="num">${fmt(v)}</td>${ind.tipo === 'suma' ? `<td class="num">${fmt((100 * v) / total, 1)}</td>` : ''}<td><button type="button" class="etiqueta" data-alterna="${cv}">${estado.sel.includes(cv) ? 'quitar' : 'comparar'}</button></td></tr>`).join(''))
    + '</tbody>';
  $('tabla-mun').querySelectorAll('[data-alterna]').forEach((b) => b.addEventListener('click', () => alterna(b.dataset.alterna)));
  $('tabla-cuenta').textContent = requiereCultivo() ? '' : `${filasT.length} municipios con registro`;
}
function pintaFuente() {
  const ind = indPorId[estado.ind];
  const f = fuentePorId[ind.fuente];
  const etq = ind.verificacion === 'V'
    ? '<span class="etiqueta v" title="Verificado en la fuente">Verificado</span>'
    : `<span class="etiqueta pronto" title="Resultado de un estudio en curso; puede cambiar">${ind.verificacion === 'preliminar' ? 'Preliminar' : ind.verificacion}</span>`;
  $('fuente').innerHTML = `Fuente: ${f.institucion}, <a href="${f.url}" rel="noopener" target="_blank">${f.nombre}</a> (${ind.verificacion === 'V' ? 'consulta' : 'versión'} ${f.consulta}). `
    + `${etq} ${ind.descripcion}${ind.nota_mapa ? ` ${ind.nota_mapa}` : ''}`;
}

function descarga() {
  const ind = indPorId[estado.ind];
  if (ind.archivo !== ARCH_SIAP) {
    const t = regs(ind);
    const campos = ['anio', 'cvegeo', 'ciclo', 'modalidad', 'cultivo', 'rotacion', ...camposNum[ind.archivo]];
    const rs = t.filter((r) => pasa(r, { anio: null }) && (!estado.sel.length || estado.sel.includes(r.cvegeo)))
      .map((r) => [r.anio, r.cvegeo, nomMun[r.cvegeo], r.ciclo, r.modalidad, r.cultivo, nomCul[r.cultivo], ...campos.slice(5).map((c) => r[c])]);
    descargaCSV(`observatorio_${ind.archivo.split('/')[0]}_filtro.csv`, ['anio', 'cvegeo', 'municipio', 'ciclo', 'modalidad', 'id_cultivo', 'cultivo', ...campos.slice(5)], rs);
    return;
  }
  const enc = ['anio', 'cvegeo', 'municipio', 'ciclo', 'modalidad', 'id_cultivo', 'cultivo', 'unidad', 'sembrada_ha', 'cosechada_ha', 'siniestrada_ha', 'produccion', 'valor_pesos'];
  const rs = registros.filter((r) => pasa(r, { anio: null }) && (!estado.sel.length || estado.sel.includes(r.cvegeo)))
    .map((r) => [r.anio, r.cvegeo, nomMun[r.cvegeo], r.ciclo, r.modalidad, r.cultivo, nomCul[r.cultivo], r.unidad, r.sembrada_ha, r.cosechada_ha, r.siniestrada_ha, r.produccion, r.valor_pesos]);
  descargaCSV('observatorio_siap_filtro.csv', enc, rs);
}

function actualiza() {
  sincronizaControles();
  escribeHash();
  pintaMapa();
  pintaSerie();
  pintaCultivos();
  pintaTabla();
  pintaFuente();
}

leeHash();
llenaControles();
gSerie = creaGrafica($('g-serie'));
gCultivos = creaGrafica($('g-cultivos'));
$('tabla-todos').addEventListener('change', pintaTabla);
creaMapa();
actualiza();
$('cargando').hidden = true;
}

main().catch((e) => {
  console.error(e);
  const c = document.getElementById('cargando');
  c.hidden = false;
  c.textContent = 'No se pudieron cargar los datos. Recarga la página.';
});
