# Observatorio del Agua Agrícola de Sonora

Sitio web: https://juliowaissman.github.io/observatorio-agua-agricola-sonora/

Datos abiertos sobre la agricultura y el riego de Sonora y, en próximas etapas, la huella hídrica
verde, azul y gris de los principales cultivos de cada municipio.

Departamento de Matemáticas, Universidad de Sonora · Proyecto DataAqua (Laboratorios Nacionales) ·
Producto para la Agencia de Transformación Digital y Telecomunicaciones (ATDT) del Gobierno de Sonora.

## Contenido

| Ruta | Qué es |
|---|---|
| `src/pages/` | Páginas: Inicio, Explorador, Distritos de Riego, Metodología, Documentos, Datos abiertos, Acerca de, Privacidad |
| `src/scripts/` | Mapa (MapLibre GL), gráficas (ECharts) y utilidades |
| `src/data/documentos.json` | Registro de documentos PDF, con versión e historial |
| `public/datos/` | Datos agregados y verificados (ver `public/datos/LEEME.md`) |
| `public/documentos/` | PDF públicos |
| `public/logos/` | Logotipos institucionales (pertenecen a sus titulares) |

Los datos de `public/datos/` y los PDF **no se editan aquí**: se generan y verifican en el repositorio
de cálculo del proyecto y se copian con `pipeline/publica_web.sh`.

## Desarrollo

```bash
npm ci
npm run dev       # http://localhost:4321/observatorio-agua-agricola-sonora/
npm run build     # sitio estático en dist/
```

Cada `push` a `main` publica el sitio con GitHub Actions (`.github/workflows/despliegue.yml`).

## Agregar una capa al mapa

Cada capa es una entrada de `public/datos/indicadores.json` (nombre, unidad, archivo, campos y escala de color).
Las capas de huella hídrica ya están registradas como `planeado`; para publicarlas basta generar su archivo
de datos y cambiar su estado.

## Fuentes

SIAP (cierre agrícola municipal), CONAGUA (estadísticas de los Distritos de Riego), INEGI (Marco Geoestadístico).
Mapa base © OpenFreeMap, © OpenMapTiles, datos © colaboradores de OpenStreetMap.
