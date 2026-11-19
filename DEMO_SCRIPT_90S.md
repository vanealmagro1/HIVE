# HIVE — Guion de demo de 90 segundos

**Mensaje central (análisis estratégico):** *De los datos de tu bodega a mejores decisiones* — HIVE **detecta,
prioriza, actúa y mide**. El inventario llega por RFID (hoy simulado; luego, portal y lector reales, y más
adelante beacons BLE de ubicación).

**Escenario (ficticio):** Distribuidora Andina · Papelería y Tecnología, Bodega Quito Norte. 13.599 unidades,
247 productos, 3 zonas y 6 pasillos, con un andén que tiene un portal RFID. Es el tipo de cliente del segmento
objetivo, retail de papelería y tecnología con 10.000 a 20.000 unidades. No se usan nombres ni datos de empresas
reales.

**Preparación:**
1. Ejecutar `cd frontend; npm run demo`.
2. Abrir http://127.0.0.1:4173/ en Chrome o Edge y pulsar `F11`.
3. Comprobar que la barra inferior dice **"Paso 1 de 6"** y que el indicador muestra **13.599 unidades**. Si no,
   pulsar **↺ Reiniciar demo**.

**Pantalla:**
- **Centro:** la bodega en 3D, siempre visible.
- **Arriba:** los indicadores, que cambian en vivo.
- **Derecha:** las pestañas RFID · Detalle · Inventario · Alertas · Predicción · Resultados.
- **Abajo:** los 6 pasos en 4 fases. El paso actual se marca en lima y **Siguiente paso ▶** lo ejecuta.

| Tiempo | Fase · acción | Qué se ve | Qué decir |
|---|---|---|---|
| 0–10 s | Vista inicial | 6 pasillos en 3 zonas y el andén con portal RFID y camión. Indicadores: 13.599 u, USD 44.509. | "Esta es una bodega de papelería y tecnología digitalizada en HIVE. Cada caja tiene una etiqueta RFID. Todo lo que verán son datos simulados." |
| 10–30 s | **Detectar · 1 Recibir camión** | El portal destella en cada lectura. Las cajas se apilan en el andén y el contador sube hasta 11 de 12. Las unidades suben a 13.863. Al cerrar: **"Falta 1 caja · 24 u · USD 86,40"**. | "Llega la orden de compra con 12 cajas. El portal las lee al pasar, sin escanear una por una. Las lecturas repetidas se cuentan una vez. Solo entra al inventario lo que se leyó, y HIVE detecta en el acto que falta una caja." |
| 30–45 s | **Detectar · 2 Contar pasillo 4** | Un operario con lector de mano recorre el pasillo 4. 56 de 57 etiquetas están en su lugar. PAL-001 (mochilas, registrado en el pasillo 2) aparece en P4: marco azul, marcador ámbar y línea. | "Un operario recorre el pasillo con el lector de mano. HIVE compara cada etiqueta con su ubicación. Encuentra un pallet de mochilas fuera de lugar. No dice que se movió ni que se perdió: pide verificarlo." |
| 45–55 s | **Priorizar · 3 Revisar alertas** | Dos alertas ALTAS, cada una con qué pasó, cuánto vale y qué hacer. | "Cada hallazgo viene con su valor y la acción sugerida." |
| 55–70 s | **Priorizar · 4 Ver predicción** | Mochilas: **60 días** de stock frente a 30 → **300 u · USD 2.400**. Tinta que vence: **USD 720**. Calculadoras: sin datos suficientes. | "Fin de temporada escolar: hay mochilas para 60 días, el doble del objetivo. Son 2.400 dólares en riesgo. HIVE ordena los 247 productos por dinero en riesgo con cálculos explicables, no con una caja negra." |
| 70–80 s | **Actuar · 5 Aprobar acciones** | Se crean 2 tareas: reclamar el faltante y revisar el stock de mochilas. El inventario no cambia. | "HIVE propone y una persona aprueba. Se crean tareas para el equipo; nada se ajusta solo en el ERP." |
| 80–90 s | **Medir · 6 Ver resultados** | 11/12 cajas en 13 s, 98,2 % de etiquetas en su lugar en el pasillo 4, 2 hallazgos (USD 1.286,40) y 2 tareas. | "Y se mide: los indicadores salen de las propias lecturas. En un piloto se comparan con la línea base del cliente." |

## Frases que NO se deben decir

- "Esto es una lectura real" → las lecturas son **RFID simuladas**. Los equipos reales y los beacons se conectan después, en el mismo punto de ingesta.
- "El pallet se movió al pasillo 4" → es una **lectura pendiente de verificación**.
- "Ahorramos USD 2.400" → es **dinero en riesgo estimado** sobre datos sintéticos.
- "Sabemos la posición exacta" → RFID con portal y lector de mano **no es localización RTLS**. Eso llegará con los beacons.
- "Precisión del X %" o "probabilidad" → no hay modelo estadístico. El 98,2 % es un conteo de esta sesión simulada.

## Plan B

- Si la animación tarda, en la pestaña **RFID** están los botones **Completar recepción** y **Completar conteo**: dan el mismo resultado al instante.
- Si el 3D no carga o va lento, usar el botón **Vista 2D**: tiene las mismas acciones y el mismo estado.
- Si algo queda en un estado inesperado, pulsar **↺ Reiniciar demo** o `F5`.
- Capturas de cada paso: `docs/evidencia/01_bodega.png` … `10_vista2d.png`. **Aún no hay video de respaldo.** Grabarlo con `Win + Shift + R` o con `Win + Alt + R`.
