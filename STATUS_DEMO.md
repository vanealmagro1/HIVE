# HIVE — Estado de la demo

Alcance: **prototipo demostrativo vertical**. **No** es el MVP industrial: RF-001…RF-016 y RNF-001…RNF-006
siguen siendo alcance futuro, salvo lo indicado como parcial. La historia sigue el análisis estratégico:
**Detectar → Priorizar → Actuar → Medir**, con el inventario llegando por **RFID simulado**.

## Arquitectura real

- **Frontend:** React 19 + TypeScript 5.9 + Vite 8. 3D con three 0.187, @react-three/fiber 9 y @react-three/drei 10.
- **Sin backend ni base de datos.** El estado vive en la memoria del navegador (`store/demoStore.ts`).
  - `api/demoApi.ts` implementa como funciones tipadas los contratos de la API REST propuesta, más
    `POST /api/receipts/{id}/close`.
  - Simula los códigos 201, 200, 404, 409 y 422. **No existe servidor HTTP.**
- **Ingesta única de lecturas** (`engine/ingest.ts`): portal del andén, lector de mano y, a futuro, beacons BLE
  entran por `demoApi.postEvent`.
  - Las fuentes implementan `ingest/readSource.ts` (`ReadSource`). Hoy solo existe `SimulatedRfidSource`.
  - Conectar el portal y el lector reales (`RfidGatewaySource`) o el gateway BLE (`BeaconSource`) significa
    escribir otra fuente con la misma interfaz. La conciliación no cambia.
- **Una sola fuente de verdad:** 3D, 2D, inventario, RFID, alertas, analítica y resultados leen el mismo estado.

## Checklist

| Requisito | Estado | Evidencia |
|---|---|---|
| Bodega realista: 3 zonas, 6 pasillos con rack a cada lado (5 bahías × 3 niveles), andén con portal RFID | **Implementado** | `seed.test.ts`, `layout.test.ts`; `01_bodega.png` |
| Datos del segmento objetivo: 13.599 u, 246 productos generados + protagonistas, 54 pallets, 660 cajas con EPC | **Implementado** | Generador determinista (`seed/generator.ts`); test de 10.000–20.000 u |
| Recepción por portal RFID contra la OC: idempotente por ID y por EPC; solo lo leído entra al stock | **Implementado** | `receiving.test.ts`; `02/03_recepcion*.png` |
| Faltante en recepción → discrepancia, alerta ALTA y reclamo propuesto (1 caja · 24 u · USD 86,40) | **Implementado** | `receiving.test.ts`, test UI |
| Conteo con lector de mano (pasillo 4): 56/57 en su lugar; PAL-001 leído fuera de lugar → por verificar | **Implementado** | `eventProcessor.test.ts`, test UI; `04_conteo_en_curso.png`, `05_alertas.png` |
| Lectura ≠ traslado; ausencia de lectura ≠ pérdida; ubicación registrada nunca se modifica sola | **Implementado** | Tests del motor |
| Predicción explicable: mochilas 60 días / 300 u / USD 2.400; tinta USD 720 (FEFO); calculadoras sin pronóstico | **Implementado** | `analytics.test.ts`; `07_prediccion.png` |
| Recomendaciones solo sobre USD 250; aprobar crea tareas sin tocar inventario | **Implementado** | Tests de reducer, API y UI; `08_tareas.png` |
| Resultados de la sesión calculados desde el estado (Medir) | **Implementado** | Test UI; `09_resultados.png` |
| Recorrido guiado de 6 pasos en 4 fases; plan B instantáneo; reinicio al estado semilla | **Implementado** | Tests UI, `layout.test.ts` |
| Banner `ENTORNO DE SIMULACIÓN · DATOS SINTÉTICOS` permanente | **Implementado** | Test UI; todas las capturas |
| Sin doble conteo pallet + cajas | **Implementado** | `seed.test.ts`, `inventory.test.ts` |
| Vista 2D si no hay WebGL o falla el 3D | **Implementado** | Los tests de UI corren en 2D (jsdom); `10_vista2d.png` |
| Fecha de referencia fija 2026-11-19 | **Implementado** | `domain/constants.ts` |

## Pruebas ejecutadas (resultados reales)

| Comando | Resultado |
|---|---|
| `npm test` | **9 archivos, 55 pruebas, todas pasan**. Los dos recorridos de UI tardan unos 10 s cada uno en jsdom. |
| `npm run build` | **OK**: `tsc --noEmit` sin errores y build de Vite. El bundle 3D pesa unos 975 kB (260 kB gzip) y se carga de forma diferida. |
| Recorrido en navegador real (Chrome headless, WebGL por software, 1366×768, build de producción) | **OK** (`docs/evidencia/recorrido_navegador.txt`). La consola solo muestra un aviso de deprecación de `THREE.Clock`, interno de la librería e inofensivo. |

## Parcial

- **Simulador (RF-008):** tres escenarios deterministas (recepción, conteo y ausencia de lectura), reproducción en vivo y plan B instantáneo. No hay controles de pausa ni de velocidad.
- **Centro de alertas (RF-011):** prioridades, estados NUEVA → EN REVISIÓN, explicación de negocio y evidencia técnica. No hay responsables, filtros ni resolución.
- **Recomendaciones (RF-013):** aprobar o rechazar, y creación de tareas. No hay asignación editable.
- **Analítica (RF-012):** cálculos deterministas explicables, con el objetivo de cobertura fijo en 30 días.
- **Contrato API:** existe como funciones en memoria, no como servicio HTTP.

## No implementado (alcance futuro)

- Conexión a equipos RFID reales (portal y lector de mano) y beacons BLE.
- Backend FastAPI + SQLite y persistencia.
- Autenticación, roles y multiempresa.
- Editor 3D.
- Picking guiado y validación de despacho (prioridad del MVP según el análisis).
- Importación CSV/Excel e integración con ERP/WMS.
- Reportes y pruebas de rendimiento.
- Video de respaldo de la demo.

## Limitaciones y riesgos

- **Datos sintéticos:** ninguna cifra representa a un cliente, un ahorro ni una precisión real.
- **Ubicaciones:** son las del registro. El RFID por portal o lector de mano no da posición RTLS; eso llega con los beacons.
- **Estado en memoria:** recargar la página borra el estado, lo que equivale a reiniciar.
- **Modo de presentación:** presentar con `npm run demo` (producción), no con `npm run dev`.
- **Rendimiento:** solo se verificó en headless con WebGL por software. **Falta ensayar en el portátil de la presentación.**
- **OneDrive:** como el repositorio está en OneDrive, la sincronización de `node_modules` puede ralentizar `npm install`.
