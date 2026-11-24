# Datos del Observatorio del Agua Agrícola de Sonora (v1)

Departamento de Matemáticas, Universidad de Sonora · Proyecto DataAqua · Producto para la ATDT Sonora

Datos **agregados y públicos** que usa el sitio web. Se generan con `pipeline/exporta_web.py`
y se verifican con `pipeline/verifica_web.py` (resultado en `verificacion.json`).
No editar a mano.

## Archivos

| Archivo | Contenido |
|---|---|
| `manifiesto.json` | Versión, fecha, lista de archivos con tamaño y sha256 |
| `fuentes.json` | Fuentes: institución, URL, fecha de consulta, licencia, nivel de verificación y notas |
| `indicadores.json` | Registro de indicadores (capas del mapa). Ver abajo |
| `verificacion.json` | Resultado de los chequeos contra las fuentes |
| `geo/municipios.geojson` | 72 municipios (INEGI, Marco Geoestadístico dic. 2025), simplificados ≈ 400 m |
| `geo/distritos_riego.geojson` | 7 Distritos de Riego con estadística de Sonora (SIAP), simplificados ≈ 100 m |
| `agricola/cierre_municipal.json` / `.csv` | SIAP, cierre agrícola 2019–2025: año × municipio × ciclo × modalidad × cultivo |
| `agricola/catalogos.json` | Años, ciclos, modalidades, cultivos (id, nombre, unidad) y municipios (DDR, CADER, población 2020) |
| `resumen/estatal_anual.json` | Totales estatales por año y 10 cultivos principales por valor y por superficie |
| `distritos/volumenes.json` / `.csv` | CONAGUA 1998–2025: usuarios, superficie física regada, volumen bruto y lámina por DR, año, número de cultivos y tipo de fuente |
| `distritos/cultivos.json` / `.csv` | CONAGUA 1998–2025: superficie, producción y valor por DR × ciclo × modalidad × cultivo |
| `distritos/catalogo.json` | Ficha de cada DR (fuente de abastecimiento, superficie, eficiencia, municipios probables) |
| `hh/hh_municipal.json` / `.csv` | **Huella hídrica (preliminar)**, 2019–2025: año × municipio × ciclo × modalidad × cultivo × rotación; superficie cosechada, producción y volúmenes verde, azul y gris (m³) con su mínimo y máximo |
| `hh/resumen_cultivo.json` | Huella por cultivo (m³/t, media 2019–2025 ponderada por la producción) con intervalos, azul con riego pleno y comparación con Mekonnen y Hoekstra 2010 (Sonora) y 2014 (percentiles mundiales) |

## Formato columnar (`*.json` de tablas)

```json
{"campos": ["anio", "cvegeo", ...], "n": 7990, "datos": {"anio": [2019, ...], "cvegeo": ["26048", ...]}}
```

Códigos: ciclo `OI` otoño-invierno, `PV` primavera-verano, `PER` perennes; modalidad `R` riego,
`T` temporal; `cultivo` es el `Idcultivo` del SIAP (nombre en `catalogos.json`).
`n_cultivos` (CONAGUA): 1 = primer cultivo, 2 = segundo cultivo en la misma tierra (en 1998 la suma de ambos
rebasa la superficie regable del DR 041, por eso se interpreta así). Superficie física, usuarios y lámina se
toman del renglón 1 (`filtro` en `indicadores.json`); el volumen suma ambos.

## Unidades y advertencias

- `valor_pesos`: pesos **corrientes** (sin ajustar por inflación).
- `produccion`: en la unidad del cultivo (casi todos toneladas; *Mano de león* en manojos).
  Sólo se suma dentro de un mismo cultivo.
- Rendimiento y precio medio rural **no se guardan**: se calculan como cociente de totales del filtro
  (producción / cosechada; valor / producción).
- `volumen_bruto_hm3`: volumen **bruto** distribuido (incluye pérdidas); no es agua consumida.
  La fuente lo da en miles de m³; aquí se divide entre 1 000.
- Año agrícola: SIAP N incluye el otoño-invierno sembrado desde octubre de N−1; CONAGUA identifica
  el año agrícola (1 oct – 30 sep) por el año en que termina.
- **2025:** el otoño-invierno de riego cae a 142 mil ha (342 mil en 2024); coincide con CONAGUA
  (DR 041: 181 553 → 22 198 ha).
- DR 014 Río Colorado incluye Baja California; CONAGUA no desglosa la parte sonorense.
- Los municipios de cada DR en `distritos/catalogo.json` son probables (`NV`).
- *Nacozari de García* no tiene registros en el cierre SIAP 2019–2025.

## Registro de indicadores (`indicadores.json`)

Cada entrada describe una capa: `id`, `nombre`, `unidad`, `escala` (`municipio` o
`distrito_riego`), `tipo` (`suma` de un `campo`; `cociente` de `numerador`/`denominador` × `factor`),
`requiere_cultivo` (sólo tiene sentido con un cultivo elegido), `dimensiones`, `anios`,
`escala_color` (7 clases), `fuente`, `verificacion`, `archivo` y `estado` (`publicado` o `planeado`).
Las capas de huella hídrica están registradas como `planeado` (paso 8 del plan); para publicarlas
basta agregar su archivo de datos y cambiar el estado.

Las capas de HH llevan además la dimensión `rotacion` (`valores_rotacion`: `primero`, `segundo`,
`perenne`, `no_identificado`): hay una huella por cultivo y periodo de crecimiento, así que donde la
misma tierra se siembra dos veces en el año aparecen dos huellas. Al agregar, los volúmenes se suman
pero las superficies de primer y segundo cultivo no (es la misma tierra).

## Huella hídrica (`hh/`, preliminar)

- Cálculo propio (metodología v0.7): balance hídrico diario FAO-56; sólo las 275 combinaciones de la selección del inventario.
  Fuera de ella (municipios con menos de 1 000 ha, cultivos menores) no hay registro.
- Unidades con producción y huella calculada (1 786); no incluye unidades sin cosecha.
- Huella por tonelada = Σ volumen / Σ producción del filtro (media ponderada por la producción); agua por hectárea = Σ volumen / Σ cosechada.
- `*_min_m3` / `*_max_m3`: mínimo y máximo de la unidad entre las variantes de sensibilidad (verde y azul: 8 variantes de
  `hh.corrida`; gris: α 0.01 con cmax 11 mg N/L y α 0.25 con cmax 2.9). Al sumar unidades se obtiene una envolvente más amplia
  que la de cualquier variante única. No son intervalos de confianza.
- `vol_gris_m3` vacío: dátil (sin dosis de nitrógeno publicada).
- `rotacion`: hoy sólo `perenne` y `no_identificado` (los segundos cultivos de CONAGUA aún no se asignan).
- Volúmenes azules = evapotranspiración del agua de riego, no agua entregada (sin pérdidas de conducción ni aplicación).
