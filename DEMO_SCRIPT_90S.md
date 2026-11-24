# HIVE — Guion de demo de 90 segundos (UI v1.1)

**Mensaje:** *De los datos de tu bodega a mejores decisiones.* Primero se ve **qué producto** está involucrado,
luego **qué pallet** lo contiene y al final **qué acción** requiere.

**Escenario (ficticio):** Bodega Quito Norte, una bodega de papelería y tecnología con 13.599 unidades, 247
productos, 6 pasillos (A–F) y muelles D1/D2 con portal RFID. Las lecturas RFID son simuladas. La interfaz muestra
una sola etiqueta, "Demo simulada"; la procedencia de cada evento está en "Ver detalle".

**Preparación:**
1. Ejecutar `cd frontend; npm run demo`.
2. Abrir http://127.0.0.1:4173/ y pulsar `F11`.
3. Comprobar que dice **"Paso 1 de 6"** y que el indicador marca **13.599 unidades**. Si no, pulsar **↺** en la barra de pasos.

**Navegación:**
- El panel derecho muestra solo el paso actual, con una acción principal.
- Las flechas ‹ › o la barra inferior cambian de paso.
- **Avanzar nunca aprueba nada.**

| Tiempo | Paso · acción | Qué se ve | Qué decir |
|---|---|---|---|
| 0–20 s | **1 Visualizar** · *Recibir camión* | Bodega isométrica con racks, pasillos y montacargas. El portal RFID de D1 destella en cada lectura y el pallet avanza; las cajas se apilan en recepción. Unidades: 13.599 → **13.863**. Resultado: **12 esperadas (288 u) · 11 detectadas (264 u) · 1 faltante (24 u)**. | "Tu bodega en tiempo real. Llega un camión: el portal lee cada caja al pasar. Solo entra al inventario lo leído y HIVE detecta que falta una caja." |
| 20–35 s | **2 Detectar** · *Contar pasillo D* | Un operario con lector de mano recorre el pasillo D. Aparece **Mochila escolar básica · MOC-001 · PAL-001**, con nueva evidencia en **D-07-02**. | "Un lector de mano detecta las mochilas del pallet 001 en otro pasillo." |
| 35–48 s | **3 Alertar** | **Ubicación por verificar.** Esperada **B-03-01** → detectada **D-07-02**. Pendiente de verificación, en ámbar. | "HIVE no mueve el inventario oficial: pide verificar. *Ver detalle* muestra la evidencia y su procedencia." |
| 48–65 s | **4 Analizar** | Mochilas: **60 días** de cobertura, **300 unidades** excedentes y **USD 2.400** de exposición estimada. | "Aparte de eso, las mochilas tienen stock para 60 días cuando el objetivo es 30. Son 2.400 dólares de exposición estimada; el cálculo es transparente." |
| 65–80 s | **5 Recomendar** · *Aprobar acción* | "Redistribuir 300 unidades" pasa a **Aprobada**. | "HIVE recomienda y una persona aprueba." |
| 80–90 s | **6 Registrar** | Tarea `task-rec-moc-001`, **pendiente de ejecución**, con su referencia de auditoría. | "Queda registrada y auditable. La aprobación no mueve nada físicamente: crea la tarea." |

## Frases que NO se deben decir

- "Lectura real" o "RFID instalado" → son lecturas RFID **simuladas**.
- "El pallet se movió" → es una **ubicación por verificar**.
- "El movimiento causó la exposición" → el sobrestock es un **análisis independiente**.
- "Ahorramos USD 2.400" → es **exposición estimada**, no ahorro.
- "Posición exacta" → RFID con portal y lector de mano no es RTLS.

## Plan B

- **Si la animación tarda:** en *Ver lecturas RFID* (paso 1) o en la sección **Eventos** están los botones *Completar recepción* y *Completar conteo*, que dan el mismo resultado al instante.
- **Si el 3D va lento:** usa el botón del cubo (vista 2D) o *Capas → Animación ambiental* (desactivar).
- **Respaldo:** el video `docs/evidencia/HIVE_demo_90s.webm` corresponde a la UI anterior. Hay que regrabarlo con esta versión.
