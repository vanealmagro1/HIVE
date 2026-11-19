# HIVE — Estado de la demo (18-11-2026, víspera de la demo)

Alcance: **prototipo demostrativo vertical** para la demo de 90 s del 19-11-2026. **No** es el MVP industrial
(RF-001…RF-016, RNF-001…RNF-006 siguen siendo alcance futuro salvo lo indicado como parcial).

## Arquitectura real

- Frontend React 19 + TypeScript 5.9 + Vite 8; 3D con three 0.187 + @react-three/fiber 9 + @react-three/drei 10.
- **No hay backend ni base de datos.** El estado vive en memoria del navegador (`store/demoStore.ts`).
  `api/demoApi.ts` implementa como funciones tipadas los mismos contratos que la API REST propuesta
  (`GET /api/demo/state`, `POST /api/demo/reset`, `POST /api/demo/events`, `GET /api/inventory`,
  `GET /api/alerts`, `GET /api/analytics`, `POST /api/recommendations/{id}/approve`), con códigos
  201/200/404/409/422 simulados. **No existe servidor HTTP.**
- Una sola fuente de verdad: 3D, vista 2D, inventario, alertas y analítica leen el mismo estado.

## Checklist P0

| # | Requisito | Estado | Evidencia |
|---|---|---|---|
| 1 | Bodega 3D interactiva (racks, ubicaciones, `PAL-001` seleccionable, orbit/zoom/clic, foco, leyenda) | **Implementado** | Clic real en el canvas abre la ficha de PAL-001 (`docs/evidencia/recorrido_navegador.txt`, `02_pal001.png`) |
| 2 | Inventario SKU/lote/cantidad/costo/ubicación esperada | **Implementado** | Panel Inventario; `seed.test.ts` |
| 3 | Evento `SIMULATED` `evt-demo-001`: PAL-001 observado en LOC-B2, esperado sigue en LOC-A1 | **Implementado** | `eventProcessor.test.ts`; `03_evento_alerta.png` |
| 4 | Discrepancia pendiente + alerta HIGH con evidencia; repetir ID no duplica | **Implementado** | Tests de idempotencia (reducer, API y UI); en navegador: reenvío → 1 alerta |
| 5 | Predicción SKU-A 60 días / 300 u / USD 2.400 con fórmulas y supuestos | **Implementado** | `analytics.test.ts`; `04_prediccion.png` |
| 6 | Recomendación aprobable → exactamente 1 tarea, sin modificar inventario | **Implementado** | Tests de reducer, API y UI; `05_tarea.png` |
| 7 | `Reiniciar demo` restaura el estado semilla | **Implementado** | Test de igualdad profunda con la semilla tras el flujo completo; `06_reset.png` |
| 8 | Banner `ENTORNO DE SIMULACIÓN · DATOS SINTÉTICOS` permanente | **Implementado** | Test UI; todas las capturas |
| — | SKU-B: 120 u, 4 u/día, vence en 15 días → 60 u / USD 720 (FEFO) | **Implementado** | `analytics.test.ts` |
| — | SKU-C sin pronóstico inventado | **Implementado** | Muestra "Sin datos suficientes para pronosticar"; regla de inmovilizado (96 días > 60) etiquetada como regla |
| — | Sin doble conteo pallet + cajas | **Implementado** | Stock = suma de cajas hoja (920 u, no 1.840); test explícito |
| — | Ausencia de lectura ≠ pérdida | **Implementado** | Escenario `DEMO_MISSING_001` (PAL-007) → pendiente + alerta MEDIA, stock intacto |
| — | Fallback 2D si no hay WebGL o falla el 3D | **Implementado** | Detección WebGL + error boundary + botón manual; el test de UI corre en 2D (jsdom); `07_vista2d.png` |
| — | Fecha de referencia fija 2026-11-19 | **Implementado** | `domain/constants.ts`; ningún cálculo usa el reloj |

## Pruebas ejecutadas (resultados reales)

| Comando | Resultado |
|---|---|
| `npm test` | **6 archivos, 41 pruebas, todas pasan** (cálculos, semilla, agregación, eventos, idempotencia, ausencia de lectura, validación, recomendaciones/tareas, reset, contrato API, layout, recorrido UI completo con clics) |
| `npm run build` | **OK** (`tsc --noEmit` sin errores + build de Vite). Bundle 3D ≈ 967 kB (257 kB gzip), carga diferida |
| Instalación limpia (`npm ci` + test + build en una copia sin `node_modules`) | **OK** |
| Recorrido en navegador real (Chrome headless, WebGL por software, 1366×768, build de producción) | **OK**: canvas 3D presente, clic 3D selecciona PAL-001, alerta ALTA, 1 fantasma de observación, reenvío idempotente, SKU-A 60 días/300 u/USD 2.400, 1 tarea, reset sin fantasmas, vista 2D activa. Consola: solo un aviso de deprecación de `THREE.Clock` (interno de la librería, inofensivo) |

## Parcial

- **Simulador (RF-008):** dos escenarios deterministas ejecutables bajo demanda y reenvío idempotente. **No** hay iniciar/pausar/reanudar/velocidad (se evitaron temporizadores para no hacer frágil la demo).
- **Centro de alertas (RF-011):** prioridades, estados NUEVA → EN REVISIÓN, evidencia y resaltado 3D. Sin responsables, filtros ni resolución.
- **Recomendaciones (RF-013):** aprobar/rechazar y crear tarea. Sin asignación editable ni medición de resultados.
- **Analítica (RF-012):** cálculos deterministas explicables; umbral de cobertura fijo en 30 días (no editable en la UI).
- **Contrato API:** existe como funciones en memoria, no como servicio HTTP.

## No implementado (alcance futuro)

Backend FastAPI + SQLite (Hito 6), persistencia, autenticación/roles/multiempresa (RF-001, RF-004, RF-005, RNF-003),
editor 3D (RF-002), transferencias (RF-003), importación CSV/Excel (RF-007), integración ERP/WMS (RF-014),
reportes PDF/XLSX (RF-015), dashboard por rol (RF-016), Estimote BLE / gateway (RNF-002), RFID UHF,
pruebas de rendimiento/respaldo (RNF-004 a RNF-006), video de respaldo de la demo.

## Limitaciones y riesgos

- **Datos sintéticos**: ninguna cifra representa un cliente, ahorro ni precisión real.
- Las posiciones 3D son asignadas por el sistema; no hay localización RTLS ni BLE.
- Recargar la página borra el estado (comportamiento esperado: equivale a reiniciar).
- `npm run dev` muestra avisos de consola de React (StrictMode + etiquetas `Html` de drei) que **no** ocurren en el build de producción: presentar con `npm run demo`.
- Rendimiento 3D verificado solo con WebGL por software en headless; **no se ensayó aún en el portátil de la presentación** → ensayar allí antes de la demo.
- El repositorio está dentro de OneDrive: la sincronización de `node_modules` puede ralentizar `npm install`.
- Riesgo residual principal: GPU/driver del equipo de presentación. Mitigación: vista 2D y capturas en `docs/evidencia/`.
