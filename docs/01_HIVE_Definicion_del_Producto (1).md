# HIVE — Definición del producto

**Versión:** 0.7 — arquitectura complementaria ERP/WMS confirmada; incorpora investigación de mercado y referencia TSC Printronix; borrador para revisión  
**Fecha:** 18 de noviembre de 2026  
**Estado:** Pendiente de aprobación; no es una especificación de desarrollo.

## 1. ¿Qué es HIVE?

**HIVE es una plataforma B2B de inteligencia operativa de inventarios para grandes bodegas industriales**, que integra identificación automática de unidades logísticas, conciliación del inventario físico, gemelo digital 3D y analítica predictiva para detectar discrepancias y proponer decisiones económicas accionables. **Por decisión confirmada, HIVE es una capa complementaria a los ERP/WMS existentes, con capacidad de operación independiente cuando el cliente lo necesite.**

La oferta prevista integra **infraestructura de captura (RFID), plataforma de software, implementación, conectores y soporte**. **Mercado inicial confirmado:** empresas con grandes bodegas industriales en Ecuador, **sin restricción por sector económico**. La selección de clientes se basará en necesidades operativas y retorno potencial, no en pertenecer a una industria determinada.

**Promesa resumida:** «HIVE ayuda a verificar qué inventario existe realmente, dónde se encuentra según la evidencia disponible y qué acciones podrían evitar pérdidas».

**No es:** un fabricante de etiquetas o lectores; un reemplazo obligatorio de SAP/ERP/WMS; ni una garantía de ubicación exacta o lectura total sin pruebas de campo. La capacidad independiente no significa que el MVP sea un WMS empresarial completo.

## 2. Problema del cliente

- Los conteos manuales con códigos de barras consumen horas de personal y pueden interrumpir operaciones.
- Los registros del sistema pueden diferir del inventario físico.
- Sin inventario confirmado y datos de demanda confiables, es difícil anticipar sobrantes, inventario inmovilizado y, cuando aplique, vencimientos por lote.

**Caso de referencia (no validado comercialmente):** en el trabajo previo sobre Nestlé Fábrica Sur se reportaron 20 personas, 2 horas diarias de bloqueo, 730 horas anuales equivalentes y una estimación de USD 197.000 de impacto anual. La metodología y los costos deben verificarse; estas cifras no constituyen ahorro prometido.

## 3. Usuarios y clientes

**Cliente que contrata:** empresa de cualquier sector con una **bodega industrial de gran escala** y costos significativos de conteo, discrepancias de inventario, baja visibilidad o pérdidas evitables. No se limita a alimentos y bebidas, farmacéutica ni distribución.

**Criterios de priorización comercial (hipótesis a validar):** volumen de unidades y movimientos, horas-persona de conteo, frecuencia de interrupciones, valor de inventario, costo de errores, complejidad de ubicaciones y capacidad de financiar un piloto. Los productos sin fecha de vencimiento podrán beneficiarse de conciliación, trazabilidad, detección de inventario inmovilizado y análisis de sobrestock; las alertas de caducidad solo se activarán cuando correspondan.

**Usuarios operativos:** responsable de bodega, supervisor de inventarios, personal de recepción/despacho y analista de planificación. **Decisor económico:** dirección de operaciones, logística o finanzas (hipótesis por validar en entrevistas).

## 4. Propuesta de valor

1. **Verificar:** reducir trabajo de identificación individual mediante captura automática donde sea técnicamente viable.
2. **Conciliar:** distinguir unidades observadas, pendientes de verificación y discrepancias confirmadas, con trazabilidad de evidencia.
3. **Visualizar:** representar zonas, unidades y movimientos en un mapa operativo; indicar la confiabilidad y antigüedad de cada ubicación.
4. **Anticipar:** estimar excedentes, inventario inmovilizado y exposición económica usando existencias verificadas, demanda y, cuando corresponda, vencimientos por lote.
5. **Actuar:** sugerir acciones para revisión humana, medir resultados y documentar decisiones.

## 5. Cómo funciona la solución industrial propuesta

1. **Preparación de datos e interoperabilidad:** aprovechar catálogo, SKU, lotes, vencimientos y cantidades ya registrados por la empresa, mediante importación o integración. Cuando exista ERP/WMS, mantenerlo como sistema maestro de los datos que le correspondan; HIVE aporta eventos, verificación y análisis, evitando doble digitación. Sin ERP/WMS, HIVE podrá operar con catálogo y registros propios de alcance delimitado.
2. **Identificación y codificación:** asignar un EPC único a cada unidad logística etiquetada; imprimir, codificar, validar y vincularlo con los datos existentes durante fabricación, empaquetado o recepción, cuando el proceso del cliente lo permita. Se adopta un **modelo híbrido de etiquetado**: por caja, por pallet o combinado, según trazabilidad requerida y costo-beneficio.
3. **Lectura:** lectores RFID UHF portátiles, portales, montacargas o RTLS capturan eventos de identificación.
4. **Conciliación:** comparar unidades detectadas con el inventario esperado; una falta de lectura se marca **pendiente**, no como pérdida confirmada.
5. **Gemelo digital operativo:** actualizar estados y ubicaciones observadas o estimadas; la precisión depende de la infraestructura y cobertura.
6. **Analítica:** combinar existencias confirmadas con demanda, costos y vencimientos cuando existan para calcular riesgos y recomendaciones adaptadas al tipo de producto.

**Principio:** el EPC identifica la unidad; los atributos del producto se consultan en una base de datos. La señal RFID no contiene por sí sola toda la información comercial.

### 5.1 Política de etiquetado híbrido — decisión confirmada

**Decisión de producto:** HIVE soportará etiquetas RFID UHF por **caja**, por **pallet** o en **ambos niveles**, según el proceso del cliente. No impondrá el etiquetado individual de todas las cajas.

- **Por caja:** para trazabilidad individual, mezcla de lotes, preparación de pedidos o conteos donde se necesita confirmar cada caja. Implica más etiquetas y puede aumentar el esfuerzo de aplicación.
- **Por pallet:** para unidades logísticas completas y movimientos de carga; permite detectar el pallet y consultar el contenido **declarado**, pero no confirmar físicamente cada caja interior.
- **Combinado:** un EPC del pallet y EPC individuales de las cajas cuando se justifique; HIVE mantendrá una relación jerárquica pallet–cajas y evitará sumar dos veces las existencias.

**Regla de asociación:** cada EPC debe vincularse con una unidad logística única, su nivel de embalaje y sus productos/lotes mediante registros existentes, codificación en producción o recepción. El conteo se expresa en unidades base y se calcula según el contenido declarado y el nivel realmente verificado. Una lectura de pallet **no equivale** a una verificación individual de todas sus cajas.

**Implementación operativa:** priorizar etiquetas aplicadas durante fabricación/empaquetado o procesos ya existentes. Se podrán evaluar impresoras/codificadoras RFID industriales como TSC Printronix Auto ID T800, T4000 y T6000e (4 o 6 pulgadas), según volumen, formato y material. La impresión y codificación **no implican aplicación física automática**: para ello se requiere evaluar un sistema de impresión-aplicación y su integración. Verificar EPC, legibilidad, asociación con la unidad y manejo de etiquetas defectuosas. Si se etiquetan en recepción, medir el tiempo adicional. No dar por automática la vinculación correcta de cada etiqueta sin un proceso de validación.

**Criterio para elegir nivel:** valor y riesgo del producto, necesidad de trazabilidad por lote, composición de pallets, velocidad operativa, tasa de lectura, costo por etiqueta, costo de aplicación y retorno económico. La decisión específica por cliente se toma en el diagnóstico y piloto.

## 6. Funcionalidades del producto completo (visión)

| Módulo | Función | Condición relevante |
|---|---|---|
| Catálogo y lotes | SKU, lotes, fechas, costos y cantidades | Requiere datos de origen confiables |
| Identificadores | Vincular EPC con caja, pallet o ambos según modelo híbrido | Debe evitar errores de asociación y doble conteo |
| Captura RFID | Registrar lecturas, deduplicar y auditar | Depende de hardware y cobertura |
| Inventario | Conciliar esperado vs. observado y verificar excepciones | Ausencia de lectura ≠ faltante |
| Movimientos | Recepción, traslado y despacho | Confirmación y reglas por operación |
| Gemelo digital | Mapa de zonas, estanterías y ubicaciones | Ubicación exacta no garantizada |
| Alertas | Discrepancias, sobrestock, inventario inmovilizado y vencimientos cuando apliquen | Umbrales configurables por cliente y tipo de producto |
| Predicción | Excedentes, rotación, inventario inmovilizado y valor en riesgo; vencimientos cuando apliquen | Necesita historial de demanda y supuestos |
| Recomendaciones | FEFO, transferencias y otras acciones | Aprobación humana |
| Integraciones | CSV/Excel, API y conectores ERP/WMS | Integración empresarial es prioridad industrial; no obligatoria para MVP |
| Impresión y codificación | Alta, impresión/codificación, verificación y asociación EPC | Integrar equipos compatibles según diagnóstico; no asumir aplicador automático |
| Auditoría y confianza | Procedencia de eventos, deduplicación, confiabilidad y resolución de excepciones | No equiparar lectura aislada a movimiento confirmado |

## 7. MVP demostrativo (hardware y respaldo confirmados)

**Objetivo:** demostrar el flujo de identificación → consulta de datos → inventario observado → gemelo digital 3D interactivo → alerta/predicción, sin afirmar que se ha validado el rendimiento industrial RFID.

**Decisión confirmada de hardware para el MVP:** utilizar los Estimote Location Beacons disponibles (Bluetooth Low Energy, BLE) como fuente real de eventos, con un **simulador de respaldo obligatorio** para que la demostración funcione aunque los dispositivos no emitan, tengan batería agotada o Windows no los detecte. **Entorno:** Windows y Python; se propone `bleak` para escanear anuncios BLE. Esta decisión no sustituye la arquitectura RFID UHF prevista para la solución industrial.

**Incluye:** registro de productos/lotes, asociación beacon-unidad, detector BLE, historial de observaciones, inventario esperado/observado, **gemelo digital 3D interactivo desde la primera versión**, alertas, predicción ilustrativa con datos identificados como simulados y recomendaciones básicas. El 3D representará suelo, zonas, pasillos, estanterías y unidades logísticas; permitirá navegar (orbitar, zoom, selección), consultar una unidad y resaltar alertas. Las ubicaciones podrán asignarse manualmente o mediante eventos simulados; las detecciones BLE reales actualizarán presencia/última observación, **no coordenadas 3D exactas**.

**No incluye como capacidad validada:** RFID UHF, lectura industrial de miles de cajas, posicionamiento automático exacto por estantería, sincronización espacial en tiempo real, integración SAP ni resultados financieros reales. La visualización 3D sí forma parte del MVP, pero no implica localización RTLS validada.

**Estado real:** los beacons se observaron físicamente en fotografías; aún **no se ha confirmado** que transmitan ni que Windows los detecte. El MVP **debe** poder ejecutarse en modo simulación si la prueba BLE falla o no hay hardware conectado. El simulador debe generar eventos de identificación, movimientos y cambios de estado con una marca explícita de origen `SIMULADO`, sin hacerlos pasar por observaciones reales. El gemelo 3D debe funcionar independientemente del hardware y distinguir visualmente datos reales, manuales y simulados.

### 7.1 Gemelo digital 3D — decisión confirmada

**Decisión de producto:** el MVP de HIVE tendrá una representación **tridimensional interactiva** de una bodega de demostración desde la primera versión. No se pospone el 3D a la fase industrial.

**Funciones mínimas:** (a) modelo 3D navegable de zonas, pasillos y estanterías; (b) representación seleccionable de cajas y pallets con vínculo a identificadores y lotes; (c) panel de detalles de producto, cantidad, vencimiento, estado y última observación; (d) filtros y resaltado de discrepancias y riesgos; (e) actualización de estado ante eventos BLE o simulados; (f) señalización clara de la procedencia y confiabilidad de la ubicación.

**Límite técnico:** el gemelo será **visual y operativo**, pero no se anunciará como localización física 3D automática de precisión. Un beacon observado por un único receptor BLE no permite inferir una posición exacta en la estantería. Para el MVP, las posiciones se asignarán en el sistema o se simularán; el RTLS espacial será una fase de validación industrial.

**Criterio de aceptación:** al seleccionar una caja en la escena 3D, debe abrirse su ficha; una lectura BLE válida debe cambiar su estado y hora de última detección sin inventar coordenadas; una alerta de vencimiento debe resaltarse en la escena; y el modo demo debe funcionar sin beacons activos.

## 8. Arquitectura industrial futura: opciones abiertas

- **Portátil RFID:** menor barrera inicial, requiere recorridos.
- **RFID en montacargas:** aprovecha recorridos existentes; cobertura no garantizada.
- **Portales fijos:** detectan pasos por puntos controlados, no toda la bodega.
- **RTLS / Zebra ATR7000:** potencial de seguimiento espacial, sujeto a cobertura, interferencias, middleware y costos.

La transcripción aportada del video Zebra anuncia cobertura circular de **40 pies de diámetro** y precisión de **2 pies** para ATR7000; son cifras de demostración/fabricante, **no desempeño validado para HIVE**. El video muestra un flujo de impresión-codificación-vinculación de etiquetas y software de seguimiento; esas funciones no son exclusivas de HIVE.

### 8.1 Integración con ERP/WMS — decisión confirmada

**Modo complementario (predeterminado en empresas con sistemas existentes):** el ERP/WMS conserva la autoridad sobre sus registros maestros y transacciones oficiales. HIVE consume catálogo, lotes, ubicaciones y órdenes autorizadas; incorpora observaciones RFID y evidencias; concilia discrepancias; presenta el gemelo digital y genera análisis y recomendaciones. **No modifica saldos o movimientos oficiales sin reglas de autorización, validación y sincronización acordadas.** Se diseñarán conectores reutilizables y mecanismos de reintento, auditoría e idempotencia.

**Modo independiente (cuando sea necesario):** HIVE administra su propio catálogo, unidades logísticas, ubicaciones, movimientos y conteos para operaciones de alcance definido, con importación/exportación CSV/Excel y APIs. No se promete reemplazar desde el MVP funcionalidades empresariales de compras, facturación, contabilidad, transporte o planeación avanzada.

**Arquitectura de referencia industrial:** etiquetas EPC → lectores → edge/middleware → registro de eventos → deduplicación e inferencia → conciliación/inventario operacional HIVE → gemelo digital 3D y analítica → API/conectores → ERP/WMS. La dirección y autoridad de cada sincronización se documentarán por cliente.

### 8.2 Impresión, codificación y aplicación de etiquetas — hallazgo TSC Printronix

La página oficial de TSC Printronix Auto ID describe impresoras RFID de escritorio e industriales, formatos de 4 y 6 pulgadas, soporte para etiquetas estándar y sobre metal, verificación de compatibilidad de inlays y administración remota. Menciona las familias **T800, T4000 y T6000e**; la T6000e dispone de codificación RFID de alta velocidad y opciones de verificación de código de barras en línea. Esto demuestra que el flujo de impresión/codificación es una tecnología comercial existente, no una invención de HIVE.

**Aplicación a HIVE:** seleccionar impresora/encoder, inlay, etiqueta y procedimiento de asociación EPC según el material y la cadencia del cliente. Validar la codificación y el vínculo EPC–unidad antes de aceptar el evento de alta. La página consultada **no ofrece una cotización ecuatoriana** ni demuestra que las impresoras, por sí solas, apliquen físicamente las etiquetas a las cajas.

Fuente: https://emea.tscprinters.com/es/soluciones-rfid (consultada 18-11-2026).

## 9. Innovación, competencia y posicionamiento — actualizado con investigación

La investigación adjunta concluye que **RFID + ERP/WMS + analítica predictiva no es una innovación tecnológica radical por sí misma**. Existen capacidades comparables en proveedores globales como Zebra, SAP, Oracle y RELEX, y oferta RFID/inventarios/integración en Ecuador anunciada por iTech, Cayman Systems, Integra RFID, LCSA y otros integradores. **HIVE no afirmará ser la primera solución RFID de Ecuador ni tener exclusividad tecnológica.**

**Hipótesis de diferenciación a validar:** (1) convertir lecturas imperfectas en eventos auditables y conciliación confiable; (2) vincular existencias, ubicación, lote y costo para estimar *valor económico en riesgo*; (3) emitir recomendaciones accionables sujetas a aprobación; (4) desarrollar conectores ERP/WMS reutilizables; (5) desplegar infraestructura multimarca con soporte local y ambas modalidades comerciales; (6) ofrecer un gemelo digital 3D útil para supervisión, sin confundir visualización con RTLS de precisión.

**Posicionamiento propuesto:** «HIVE convierte eventos de identificación automática en inventario confiable y decisiones económicas accionables, mediante una plataforma complementaria a los sistemas empresariales, con gemelo digital 3D, integración y soporte local».

**Criterio de evidencia:** estos diferenciadores son objetivos de producto y negocio, no ventajas competitivas demostradas. La investigación recomienda avanzar con pilotos medibles y evitar expansión amplia antes de comprobar exactitud, integración repetible, ROI y disposición a pagar.

**Mercado:** se mantiene la decisión de atender grandes bodegas industriales de **cualquier sector**. La investigación señala diferencias en el ajuste operativo por industria; estas diferencias se usarán para priorizar prospectos, sin excluir sectores del mercado objetivo.

## 10. Modelo comercial confirmado: dos modalidades (precios pendientes)

**Decisión confirmada:** HIVE ofrecerá **ambas modalidades comerciales**, según la operación, el presupuesto y las preferencias contractuales de cada empresa. No se ha aprobado una tarifa definitiva.

### Modalidad A — Implementación + hardware + suscripción

- **Pago inicial:** diagnóstico, diseño de cobertura, instalación, configuración, integración, capacitación y puesta en marcha, según alcance contratado.
- **Infraestructura:** el cliente adquiere los equipos y etiquetas; HIVE puede suministrarlos o integrarlos, con propiedad y garantías definidas en contrato.
- **Pago recurrente:** suscripción a la plataforma HIVE y servicios de mantenimiento/soporte definidos por nivel de servicio.
- **Ventaja para el cliente:** mayor claridad sobre la propiedad de los activos y separación entre inversión inicial y gasto recurrente.

### Modalidad B — Servicio integral recurrente (HIVE como servicio)

- **Cuota periódica:** agrupa acceso al software, disponibilidad de infraestructura acordada, operación técnica, mantenimiento y soporte dentro de un alcance contractual explícito.
- **Propiedad y reposición de equipos:** deben definirse en contrato; no asumir que el cliente es propietario del hardware.
- **Implementación inicial:** puede incluirse en la cuota o cobrarse aparte, según la evaluación financiera y duración mínima del contrato.
- **Condiciones críticas:** plazo contractual, cobertura, volumen de etiquetas consumibles, reposición, SLA, visitas técnicas y terminación anticipada.
- **Ventaja para el cliente:** reduce o distribuye la inversión inicial, pero puede generar un costo acumulado mayor según plazo y condiciones.

### Reglas de cotización y comparación

1. Ofrecer las dos modalidades con **alcance funcional comparable** y desglose explícito de hardware, instalación, software, soporte y consumibles.
2. Comparar **costo total de propiedad a 12, 24 y 36 meses**; no comparar solo el pago inicial o la cuota mensual.
3. Considerar costos de financiamiento del hardware, reposición, importación, impuestos aplicables, licencias de terceros, soporte y riesgo de fallos.
4. Dimensionar la solución según número de ubicaciones, unidades etiquetadas, lectores, cobertura y frecuencia de movimientos; no fijar una tarifa universal por bodega sin esos datos.
5. Calcular márgenes de contribución y recuperación de inversión para HIVE; comprobar el retorno para el cliente con mediciones de piloto.

**Estado de precios:** no existen precios finales de venta, cuotas recurrentes ni márgenes aprobados. Las referencias de la sección 11 son supuestos presupuestarios, **no tarifas de HIVE**. El archivo `04_HIVE_Modelo_Economico.xlsx` deberá modelar ambas modalidades por separado.

## 11. Referencias presupuestarias y economía preliminar (NO cotizaciones)

La investigación de mercado aporta referencias internacionales observadas en noviembre de 2026. No incluyen necesariamente importación, tributos, instalación, licencias, mantenimiento ni margen comercial ecuatoriano. Se sustituyen las referencias genéricas previas por cifras identificables **sin presentarlas como precios aprobados de HIVE**.

| Componente | Referencia de investigación (USD) | Alcance y cautela |
|---|---:|---|
| Etiqueta UHF estándar, alto volumen | Desde 0,06–0,12/unidad | Depende de volumen y formato |
| Etiqueta especial sobre metal | 0,98–1,38/unidad | Ejemplo comercial; no extrapolar a todo el catálogo |
| Zebra FX9600 | 1.669–2.976 | Lector, no portal instalado |
| Impinj R700 | ~1.273 | Referencia comercial de lector |
| Zebra MC3330xR | ~5.211 | Lector portátil industrial; sustituye estimación genérica anterior |
| Zebra AN480 | ~400–510 | Antena, pueden requerirse varias |
| Zebra ATR7000 | ~4.065 | Equipo de referencia, sin instalación ni middleware |
| Impresora/encoder RFID y accesorios | 3.000–6.000 | **Presupuesto de escenario**, no precio verificado de TSC |
| TSC Printronix T800/T4000/T6000e | Por cotizar | Sitio oficial no publica precios locales |

**Escenario ilustrativo de una bodega mediana/grande (investigación):** 4 lectores fijos con infraestructura (USD 12k–18k); 2 portátiles (8k–11k); impresora/encoder (3k–6k); integración ERP/WMS (15k–30k); configuración y despliegue (10k–20k); software primer año (12k–30k); 200.000 etiquetas anuales (16k–30k). **Costo total estimado del año 1: USD 76k–145k.** Software/soporte desde año 2: USD 15k–40k/año, más etiquetas. Son supuestos de modelación y **no una propuesta de venta de HIVE**.

**Implicaciones para las dos modalidades comerciales:** desglosar CAPEX/OPEX, financiación y propiedad del hardware, consumibles, mantenimiento, licencias, integración, garantías, soporte y TCO a 12/24/36 meses. El archivo financiero deberá separar ingresos por hardware, implementación y ARR de software/servicio; evitar contar ingresos de hardware como recurrentes. La investigación propone usar un payback inferior a 18 meses como objetivo comercial de validación, no como resultado garantizado.

**Nota:** las referencias de TSC y las de la investigación no son cotizaciones homogéneas ni verifican compatibilidad de un modelo específico con la banda, etiquetas o normativa ecuatoriana. Antes de comprar lectores UHF se deben revisar banda/región, homologación ARCOTEL, entorno RF y compatibilidad.

## 12. Decisiones abiertas que requieren aprobación o validación

1. **Unidad de identificación industrial — CONFIRMADO:** modelo híbrido (caja, pallet o ambos). **Por validar:** reglas de selección y costos por tipo de operación.
2. **Cliente inicial — CONFIRMADO:** grandes bodegas industriales de cualquier sector en Ecuador. **Por validar:** segmentos prioritarios por intensidad del problema, tamaño de operación y capacidad de compra.
3. **Gemelo digital MVP — CONFIRMADO:** representación 3D interactiva desde el MVP. **Por validar:** diseño visual y mecanismo de asignación de ubicaciones; no prometer localización automática exacta.
4. **MVP de hardware — CONFIRMADO:** Estimote BLE como fuente de identificación real y simulador de respaldo obligatorio. **Por validar:** estado de baterías, recepción BLE en Windows, estabilidad de identificadores y formato de anuncios.
5. **Modelo comercial — CONFIRMADO:** ofrecer ambas modalidades: (A) implementación + hardware + suscripción y (B) servicio integral recurrente. **Por validar:** tarifas, propiedad contractual de equipos, SLA, plazos, cotizaciones, costos y márgenes.
6. **Investigación de mercado — RECIBIDA Y ANALIZADA:** se identificó oferta local e internacional comparable; por verificar mediante entrevistas y pilotos la disposición a pagar, el rendimiento, la ventaja competitiva y el ROI de HIVE.
7. **Integración ERP/WMS — CONFIRMADO:** plataforma complementaria por defecto y operación independiente cuando sea necesario. **Por definir:** conectores prioritarios, reglas de autoridad de datos, alcance funcional del modo independiente y sincronización.
8. **Etiquetado industrial — TSC ANALIZADO:** familias de impresoras/encoders disponibles como referencia; por cotizar impresora, aplicador, etiquetas y proceso de validación.

## 13. Criterios de éxito del producto

**MVP:** presentar una bodega 3D navegable con estanterías y unidades seleccionables; detectar al menos un beacon real si funciona; asociar identificador con una unidad; mostrar la observación con hora y nivel de certeza; reflejar el cambio de estado en la escena 3D sin inventar ubicación; registrar una discrepancia como pendiente; resaltar un lote con riesgo y mostrar una predicción ilustrativa con supuestos explícitos. Si no se detectan beacons, ejecutar la misma demostración con eventos simulados claramente etiquetados. **Prueba adicional obligatoria:** alternar entre modo BLE y modo simulación sin perder consistencia del inventario ni confundir la procedencia de los eventos.

**Piloto industrial futuro:** medir tasa de lectura por zona, falsos positivos, tiempo de conteo antes/después, tiempo de bloqueo, horas-persona, discrepancias confirmadas, costo total de propiedad, calidad de integración ERP/WMS y valor económico atribuible sin doble contabilización. La investigación sugiere como metas de diseño, no garantías, captura >98–99 % en zona controlada, reducción de conteo >50 % y payback <18 meses; los umbrales definitivos dependen del caso.

---

**Fuentes:** `HIVE_Documento_Final_Actualizado.md`; decisiones confirmadas en la conversación; `Investigación de mercado y validación de innovación de HIVE en Ecuador.docx` (25 páginas, 18-11-2026, con referencias de terceros); página oficial TSC Printronix Auto ID https://emea.tscprinters.com/es/soluciones-rfid (consultada 18-11-2026). Los datos de mercado y precios tomados de la investigación deben verificarse con sus fuentes primarias antes de una propuesta comercial; este documento no sustituye cotizaciones ni pruebas de campo.
