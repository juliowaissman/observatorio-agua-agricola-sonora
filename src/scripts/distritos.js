// Distritos de Riego: mapa de los 7 DR con estadística en Sonora y series de CONAGUA 1998-2025.
import { maplibregl, creaMapaBase } from './mapa.js';
import {
  cargaJSON, filas, fmt, cortesCuantiles, claseDe, coloresPara, descargaCSV,
  baseGrafica, EJE,
} from './comun.js';
import { creaGrafica } from './graficas.js';

const $ = (id) => document.getElementById(id);
const FUENTES_AGUA = [
  ['gravedad_presas', 'Gravedad (presas)', '#2a6fc4'],
  ['gravedad_derivacion', 'Gravedad (derivación)', '#1a9e74'],
  ['bombeo_corrientes', 'Bombeo de corrientes', '#e0662e'],
  ['bombeo_pozos', 'Bombeo de pozos', '#b8860b'],
];

async function main() {
  const [vol, catalogo, indicadores, geo, fuentes] = await Promise.all([
    cargaJSON('datos/distritos/volumenes.json'),
    cargaJSON('datos/distritos/catalogo.json'),
    cargaJSON('datos/indicadores.json'),
    cargaJSON('datos/geo/distritos_riego.geojson'),
    cargaJSON('datos/fuentes.json'),
  ]);
  const regs = filas(vol);
  const inds = indicadores.filter((i) => i.escala === 'distrito_riego');
  const indPorId = Object.fromEntries(inds.map((i) => [i.id, i]));
  const dr = Object.fromEntries(catalogo.map((d) => [d.dr, d]));
  const anios = [...new Set(regs.map((r) => r.anio))].sort((a, b) => a - b);
  const fuente = fuentes.find((f) => f.id === 'conagua_dr');

  const estado = { ind: 'volumen_bruto_hm3', anio: anios[anios.length - 1], foco: '041' };

  // Suma por DR y año de las variables, respetando el filtro de n_cultivos del indicador
  function sumas(ind, { porFuente = false } = {}) {
    const out = {};
    const n = ind.filtro?.n_cultivos;
    for (const r of regs) {
      if (n && r.n_cultivos !== n) continue;
      const k = `${r.dr}|${r.anio}`;
      const o = (out[k] ||= {});
      o[r.variable] = (o[r.variable] || 0) + (r.total || 0);
      if (porFuente) for (const [f] of FUENTES_AGUA) o[`${r.variable}:${f}`] = (o[`${r.variable}:${f}`] || 0) + (r[f] || 0);
    }
    return out;
  }
  function valor(ind, s) {
    if (!s) return null;
    if (ind.tipo === 'suma') return s[ind.variable] ?? null;
    const den = s[ind.denominador] || 0;
    return den > 0 ? ((s[ind.numerador] || 0) / den) * (ind.factor ?? 1) : null;
  }

  $('f-ind').innerHTML = inds.map((i) => `<option value="${i.id}">${i.nombre} (${i.unidad})</option>`).join('');
  $('f-anio').innerHTML = anios.slice().reverse().map((a) => `<option value="${a}">${a - 1}–${a}</option>`).join('');
  $('f-dr').innerHTML = catalogo.map((d) => `<option value="${d.dr}">${d.dr} ${d.nombre}</option>`).join('');
  $('f-ind').value = estado.ind; $('f-anio').value = estado.anio; $('f-dr').value = estado.foco;
  $('f-ind').addEventListener('change', (e) => { estado.ind = e.target.value; actualiza(); });
  $('f-anio').addEventListener('change', (e) => { estado.anio = +e.target.value; actualiza(); });
  $('f-dr').addEventListener('change', (e) => { estado.foco = e.target.value; actualiza(); });

  // ------------------------------------------------------------ mapa
  let listo = false;
  const mapa = creaMapaBase('mapa', (m) => {
    if (m.getSource('dr')) return;
    m.addSource('dr', { type: 'geojson', data: geo, promoteId: 'dr' });
    m.addLayer({ id: 'dr-fill', type: 'fill', source: 'dr', paint: { 'fill-color': ['coalesce', ['feature-state', 'color'], '#cccccc'], 'fill-opacity': 0.85 } });
    m.addLayer({ id: 'dr-borde', type: 'line', source: 'dr', paint: {
      'line-color': ['case', ['boolean', ['feature-state', 'foco'], false], '#410324', '#24398A'],
      'line-width': ['case', ['boolean', ['feature-state', 'foco'], false], 3, 0.8],
    } });
    listo = true;
    pintaMapa();
  });
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
  mapa.on('mousemove', 'dr-fill', (e) => {
    const id = e.features[0].id;
    const ind = indPorId[estado.ind];
    const v = valoresMapa[id];
    mapa.getCanvas().style.cursor = 'pointer';
    popup.setLngLat(e.lngLat).setHTML(`<strong>DR ${id} ${dr[id].nombre}</strong><br>${ind.nombre}: ${v == null ? 'sin dato' : `${fmt(v)} ${ind.unidad}`}`).addTo(mapa);
  });
  mapa.on('mouseleave', 'dr-fill', () => { mapa.getCanvas().style.cursor = ''; popup.remove(); });
  mapa.on('click', 'dr-fill', (e) => { estado.foco = e.features[0].id; $('f-dr').value = estado.foco; actualiza(); });

  let valoresMapa = {};
  function pintaMapa() {
    const ind = indPorId[estado.ind];
    const s = sumas(ind);
    valoresMapa = Object.fromEntries(catalogo.map((d) => [d.dr, valor(ind, s[`${d.dr}|${estado.anio}`])]));
    const vals = Object.values(valoresMapa).filter((v) => v > 0);
    const cortes = cortesCuantiles(vals, 4);
    const colores = coloresPara(ind.escala_color.slice(1), cortes.length + 1);
    if (listo) for (const d of catalogo) {
      const v = valoresMapa[d.dr];
      mapa.setFeatureState({ source: 'dr', id: d.dr }, { color: v > 0 ? colores[claseDe(v, cortes)] : null, foco: d.dr === estado.foco });
    }
    $('leyenda-titulo').textContent = `${ind.nombre} (${ind.unidad}) · año agrícola ${estado.anio - 1}–${estado.anio}`;
    $('leyenda').innerHTML = vals.length
      ? colores.map((c, i) => `<div class="clase"><i style="background:${c}"></i><span>${i < cortes.length ? '≤ ' + fmt(cortes[i]) : '> ' + fmt(cortes[cortes.length - 1] ?? 0)}</span></div>`).join('')
        + '<div class="clase"><i style="background:#cccccc"></i><span>sin dato</span></div>'
      : '<p class="nota">Sin datos para este año.</p>';
  }

  // ------------------------------------------------------------ gráficas
  const gComp = creaGrafica($('g-comp'));
  const gSerie = creaGrafica($('g-serie'));
  function pintaComparacion() {
    const ind = indPorId[estado.ind];
    const lista = catalogo.map((d) => [d.dr, valoresMapa[d.dr]]).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]);
    $('titulo-comp').textContent = `${ind.nombre} por Distrito, ${estado.anio - 1}–${estado.anio} (${ind.unidad})`;
    gComp.setOption({
      ...baseGrafica(),
      grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'item', confine: true, formatter: (p) => `${p.name}<br>${fmt(p.value)} ${ind.unidad}` },
      xAxis: { type: 'value', ...EJE, axisLabel: { ...EJE.axisLabel, formatter: (v) => fmt(v) } },
      yAxis: { type: 'category', data: lista.map(([k]) => `${k} ${dr[k].nombre}`), ...EJE, axisLabel: { ...EJE.axisLabel, width: 170, overflow: 'truncate' } },
      series: [{ type: 'bar', barMaxWidth: 18, data: lista.map(([k, v]) => ({ value: v, itemStyle: { color: k === estado.foco ? '#960E53' : '#8DA3C9', borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', color: '#5f5f5f', fontSize: 11, formatter: (p) => fmt(p.value) } }],
    }, true);
  }
  function pintaSerie() {
    const ind = indPorId[estado.ind];
    const nombre = `DR ${estado.foco} ${dr[estado.foco].nombre}`;
    let opt;
    if (ind.id === 'volumen_bruto_hm3') {
      const s = sumas(ind, { porFuente: true });
      const usadas = FUENTES_AGUA.filter(([f]) => anios.some((a) => (s[`${estado.foco}|${a}`]?.[`volumen_bruto_hm3:${f}`] || 0) > 0));
      $('titulo-serie').textContent = `${nombre}: volumen entregado por tipo de fuente (hm³)`;
      opt = {
        legend: { top: 0, left: 0, icon: 'roundRect', itemWidth: 12, textStyle: { color: '#333' } },
        series: usadas.map(([f, n, c], i) => ({
          name: n, type: 'bar', stack: 'v', barMaxWidth: 22,
          itemStyle: { color: c, borderColor: '#fff', borderWidth: 1, borderRadius: i === usadas.length - 1 ? [3, 3, 0, 0] : 0 },
          data: anios.map((a) => s[`${estado.foco}|${a}`]?.[`volumen_bruto_hm3:${f}`] ?? null),
        })),
      };
    } else {
      const s = sumas(ind);
      $('titulo-serie').textContent = `${nombre}: ${ind.nombre.toLowerCase()} (${ind.unidad})`;
      opt = {
        legend: { show: false },
        series: [{ name: ind.nombre, type: 'line', symbol: 'circle', symbolSize: 7, lineStyle: { width: 2 },
          itemStyle: { color: '#960E53', borderColor: '#fff', borderWidth: 2 },
          data: anios.map((a) => valor(ind, s[`${estado.foco}|${a}`])) }],
      };
    }
    gSerie.setOption({
      ...baseGrafica(),
      tooltip: { trigger: 'axis', confine: true, valueFormatter: (v) => (v == null ? 'sin dato' : `${fmt(v)} ${ind.unidad}`) },
      xAxis: { type: 'category', data: anios.map(String), ...EJE, splitLine: { show: false } },
      yAxis: { type: 'value', ...EJE, axisLabel: { ...EJE.axisLabel, formatter: (v) => fmt(v) } },
      ...opt,
    }, true);
  }
  function pintaFicha() {
    const d = dr[estado.foco];
    const fila = (k, v) => (v == null || v === '' ? '' : `<tr><th>${k}</th><td>${v}</td></tr>`);
    $('ficha').innerHTML = `<h3>DR ${d.dr} ${d.nombre}</h3><table class="tabla"><tbody>`
      + fila('Entidad', d.entidad)
      + fila('Fuente de abastecimiento', d.fuente_abastecimiento)
      + fila('Presas o acuíferos', d.presas_o_acuiferos)
      + fila('Superficie física (ha)', d.sup_fisica_ha != null ? fmt(d.sup_fisica_ha, 0) : null)
      + fila('Superficie regable (ha)', d.sup_regable_ha != null ? fmt(d.sup_regable_ha, 0) : null)
      + fila('Eficiencia global (%)', d.eficiencia_global_pct)
      + fila('Municipios (probables, no verificados)', d.municipios_probables)
      + fila('Notas', d.notas)
      + '</tbody></table>'
      + `<p class="fuente-graf">Ficha: ${d.fuente_ficha || '—'}.</p>`;
  }
  function actualiza() {
    pintaMapa(); pintaComparacion(); pintaSerie(); pintaFicha();
    const ind = indPorId[estado.ind];
    $('fuente').innerHTML = `Fuente: ${fuente.institucion}, <a href="${fuente.url}" target="_blank" rel="noopener">${fuente.nombre}</a> (consulta ${fuente.consulta}). <span class="etiqueta v">Verificado</span> ${ind.descripcion}`;
  }
  $('b-csv').addEventListener('click', () => {
    const enc = ['anio_agricola_fin', 'dr', 'n_cultivos', 'variable', ...FUENTES_AGUA.map(([f]) => f), 'total'];
    descargaCSV('observatorio_conagua_dr.csv', enc, regs.map((r) => [r.anio, r.dr, r.n_cultivos, r.variable, ...FUENTES_AGUA.map(([f]) => r[f]), r.total]));
  });
  actualiza();
  $('cargando').hidden = true;
}

main().catch((e) => {
  console.error(e);
  const c = document.getElementById('cargando');
  c.hidden = false;
  c.textContent = 'No se pudieron cargar los datos. Recarga la página.';
});
