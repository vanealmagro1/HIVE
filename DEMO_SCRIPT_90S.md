# HIVE — Guion de demo de 90 segundos

**Preparación (antes de subir al escenario):** `cd frontend; npm run demo` → abrir http://127.0.0.1:4173/ en
Chrome/Edge → `F11`. Comprobar que el panel izquierdo muestra "➜ Seleccionar PAL-001" (estado semilla).
Si no, pulsar **↺ Reiniciar demo**. No requiere internet ni hardware.

Atajo: el botón **Siguiente paso ▶** ejecuta en orden los pasos 1–5. Se pueden usar indistintamente los
botones numerados o ese botón.

| Tiempo | Acción exacta (clic) | Qué se ve | Qué decir |
|---|---|---|---|
| 0–15 s | Ninguna (vista inicial). Opcional: arrastrar para orbitar. | Bodega 3D: Zonas A/B/C, 6 racks, 18 ubicaciones, 8 pallets; banner amarillo de simulación. | "Esta es una bodega representada en nuestro gemelo digital 3D. Cada zona, rack y pallet está conectado con información estructurada de inventario. Todo lo que verán son datos sintéticos." |
| 15–25 s | Clic sobre el pallet **PAL-001** en el rack A1 (o botón **1 · Seleccionar PAL-001**). | Ficha: SKU-A, lote LOT-A-01, 150 u (suma de 2 cajas), USD 8/u, ubicación esperada LOC-A1. | "Seleccionamos este pallet y vemos su SKU, lote, cantidad, costo y ubicación registrada." |
| 25–40 s | **2 · Ejecutar evento simulado**. | Panel Alertas. En 3D: marco azul en LOC-A1 (esperada), fantasma ámbar en LOC-B2 (observada), línea discontinua. Evento `evt-demo-001` con etiqueta **SIMULATED**. | "Ejecutamos un evento simulado: una lectura asocia el pallet a LOC-B2. HIVE conserva el origen del evento y lo muestra como **observación**, no como traslado confirmado." |
| 40–55 s | Señalar la tarjeta de alerta. Opcional: **Reenviar evento** para mostrar idempotencia. | Alerta **PRIORIDAD ALTA · NUEVA**, discrepancia `disc-demo-001` **PENDIENTE DE VERIFICACIÓN**, evidencia con horas de captura y recepción. Al reenviar: "reenvío ignorado (idempotente)" y sigue habiendo 1 alerta. | "HIVE compara lo esperado con la evidencia disponible. No afirma que el producto se perdió ni que se movió: crea una alerta que requiere verificación humana. Si el mismo evento llega dos veces, no se duplica." |
| 55–75 s | **3 · Ver predicción**. | SKU-A: **60 días** de cobertura, **300 unidades** de exceso potencial, **USD 2.400** de valor potencial en riesgo, con fórmulas y supuestos. SKU-B: 60 u / USD 720 al vencer (FEFO). SKU-C: "Sin datos suficientes para pronosticar". | "Con 600 unidades y un consumo de 10 al día, hay 60 días de cobertura frente a un objetivo de 30: 300 unidades de exceso potencial, unos 2.400 dólares estimados. Son cálculos explicables sobre datos sintéticos, no ahorro realizado." |
| 75–90 s | **4 · Aprobar recomendación**. | `rec-sku-a` pasa a **APROBADA**; aparece **Tarea task-rec-sku-a · ABIERTA**. El stock no cambia. | "HIVE no solo detecta: propone qué hacer. Al aprobar se crea una tarea para el equipo; el inventario y el ERP no se modifican automáticamente." |
| Cierre | **↺ Reiniciar demo** (si hay que repetir). | Vuelve al estado semilla. | — |

## Frases que NO se deben decir

- "Esto es RFID" / "lectura real" → es un evento **SIMULADO**.
- "El pallet se movió a LOC-B2" → es una **observación pendiente de verificación**.
- "Ahorramos USD 2.400" → es **impacto estimado** sobre datos sintéticos.
- "Precisión del X %" / "probabilidad" → no hay modelo estadístico; la cobertura de datos es cualitativa.

## Plan B

- Si el 3D no carga o va lento: botón **Vista 2D** (mismas acciones y mismo estado).
- Si algo queda en un estado inesperado: **↺ Reiniciar demo** o `F5`.
- Capturas de respaldo de cada paso: `docs/evidencia/01_bodega.png` … `07_vista2d.png`.
  **No existe aún un video de respaldo**: grabarlo con la Grabadora de pantalla de Windows (`Win + Shift + R`, Recortes) o con Xbox Game Bar (`Win + Alt + R`).
