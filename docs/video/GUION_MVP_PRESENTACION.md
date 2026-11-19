# HIVE · Guion del video del MVP (presentación)

**Video:** `salida/HIVE_MVP_presentacion.mp4` · 1920×1080 · **68,7 s** (máximo pedido: 75 s) · sin audio.
**Uso previsto:** se reproduce en la presentación mientras una persona narra en vivo. Los rótulos morados de la parte inferior indican cuándo pasar a la siguiente frase.
**Ritmo:** unas 150 palabras en 68 s, a un ritmo tranquilo (~2,3 palabras por segundo). Si te atrasas, omite lo que está entre corchetes.
**Subtítulos opcionales:** `salida/HIVE_MVP_presentacion.srt` (mismo texto, sincronizado).

## Guion con tiempos

| Tiempo | En pantalla (rótulo) | Qué decir |
|---|---|---|
| 0:00–0:03 | Portada: HIVE · MVP | "Este es el MVP de HIVE." |
| 0:03–0:14 | **1 · Visualizar**: el camión pasa por el portal; 11 de 12 cajas | "Llega un camión. El portal RFID lee cada caja y HIVE la compara con la orden de compra: llegaron once de doce; falta una." |
| 0:14–0:23 | **2 · Detectar**: lector de mano en el pasillo D | "En el conteo con lector de mano, las mochilas del pallet cero cero uno aparecen en el pasillo D, [no donde estaban registradas]." |
| 0:23–0:27 | **3 · Alertar**: ubicación por verificar | "HIVE no corrige solo: pide verificarlo." |
| 0:27–0:35 | **4 · Analizar**: 600 u ÷ 10/día = 60 días → USD 2.400 | "Aparte, calcula la cobertura: sesenta días frente a un objetivo de treinta; dos mil cuatrocientos dólares de exposición estimada." |
| 0:35–0:41 | **5 · Recomendar**: clic en *Aprobar acción* | "Recomienda redistribuir trescientas unidades, y una persona aprueba." |
| 0:41–0:56 | **6 · Registrar**: montacargas al muelle D2 → *Confirmar recepción* → antes/después | "La aprobación crea una tarea. Simulamos la ejecución: el montacargas lleva dos pallets al muelle. Cuando Quito Sur confirma la recepción, ambas bodegas quedan en treinta días y el total, seiscientas noventa unidades, se conserva." |
| 0:56–1:02 | **Medir**: analítica con demanda, stock y cobertura | "Y la analítica se actualiza con los mismos datos: medir cierra el ciclo." |
| 1:02–1:08 | Cierre: Detectar · Priorizar · Actuar · Medir | "Hoy las lecturas son simuladas; la lógica funciona. El siguiente paso es un piloto en una bodega de Quito." |

## Texto corrido (para practicar)

> Este es el MVP de HIVE.
> Llega un camión. El portal RFID lee cada caja y HIVE la compara con la orden de compra: llegaron once de doce; falta una.
> En el conteo con lector de mano, las mochilas del pallet cero cero uno aparecen en el pasillo D, no donde estaban registradas.
> HIVE no corrige solo: pide verificarlo.
> Aparte, calcula la cobertura: sesenta días frente a un objetivo de treinta; dos mil cuatrocientos dólares de exposición estimada.
> Recomienda redistribuir trescientas unidades, y una persona aprueba.
> La aprobación crea una tarea. Simulamos la ejecución: el montacargas lleva dos pallets al muelle. Cuando Quito Sur confirma la recepción, ambas bodegas quedan en treinta días y el total, seiscientas noventa unidades, se conserva.
> Y la analítica se actualiza con los mismos datos: medir cierra el ciclo.
> Hoy las lecturas son simuladas; la lógica funciona. El siguiente paso es un piloto en una bodega de Quito.

## Si te preguntan después del video

- **¿Qué es real y qué es simulado?** Las lecturas RFID y los datos de la empresa son ficticios. La lógica sí funciona de verdad: la conciliación contra la orden de compra, las alertas, los cálculos de cobertura y exposición, la aprobación con su tarea, el traslado con confirmación y la auditoría. Hay 78 pruebas automáticas.
- **¿Los USD 2.400 son un ahorro?** No. Es la *exposición estimada*: el valor del stock que excede la cobertura objetivo. No es dinero ahorrado ni una pérdida confirmada.
- **¿El traslado reduce el inventario?** No. Pasa 300 unidades de Quito Norte a Quito Sur; el total entre ambas (690 u) no cambia y no cuenta como venta.
- **¿Es inteligencia artificial?** No en esta versión: son cálculos explicables (promedio de 30 días, cobertura = stock ÷ demanda diaria). La fórmula está a la vista en la app.

## Frases a evitar

"RFID instalado", "ahorramos USD 2.400", "precisión del 99 %", "HIVE decide solo", "ubicación exacta en tiempo real", "clientes que ya lo usan". Di en su lugar: "lecturas simuladas", "exposición estimada", "una persona aprueba", "detectado por el lector de mano en D-07-02".

## Regenerar el video

```bash
cd frontend && npm run demo            # app en http://127.0.0.1:4173/
cd docs/video && node grabar.mjs mvp   # requiere playwright-core (PW_DIR) y ffmpeg (FFMPEG); ver cabecera de grabar.mjs
python subtitulos.py                   # subtítulos .srt
```
