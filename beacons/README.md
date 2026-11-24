# Beacons Estimote · lector en vivo de HIVE

En la demo, **cada beacon hace de etiqueta de una caja** (sustituto de la etiqueta RFID del producto final)
y el **celular hace de lector de mano**: al acercarlo a una caja, HIVE la verifica en el Dashboard en 1–2 s.
Los beacons son Bluetooth Low Energy, no RFID.

| Beacon | Caja | Producto | Su ubicación |
|---|---|---|---|
| 4 | CJ-0003 | Cuaderno universitario 100 h cuadros grandes | B-05-03 |
| 7 | CJ-0022 | Esferográfico punta fina negro | B-01-03 |
| 5 | CJ-0086 | Lápices de colores 12 colores | A-08-03 |
| 11 | CJ-0138 | Regla 30 cm estándar | B-08-02 |
| 01 | CJ-0164 | Borrador blanco escolar | A-03-02 |

El catálogo está en `beacons.json` (lo usan el celular, la app y el escáner). Etiquetas para imprimir: `etiquetas.html`.

## Día del pitch · en Cloudflare (recomendado)
HIVE queda publicado con **dirección fija**: `https://hive.<tu-subdominio>.workers.dev`
(no necesita servidor en la laptop, ni túnel, ni la misma red, ni ajustes de Chrome: es HTTPS).

1. **Laptop (proyector):** abre `https://hive.<tu-subdominio>.workers.dev` → Dashboard.
   El chip debe decir **"Lector en vivo · conectado"**.
2. **Celular (Chrome):** abre `https://hive.<tu-subdominio>.workers.dev/lector` → arriba debe decir
   **"HIVE conectado"**. Bluetooth y Ubicación encendidos.
3. Toca **Empezar a leer**, prueba una caja y **reinicia la demo** (↺ en "Modo simulación").

Publicar cambios (desde `frontend/`): `npm run deploy`. La primera vez: `npx wrangler login`.

## Respaldo · servidor local (sin internet)
1. Laptop y celular en la misma red (o hotspot). `cd frontend` y `npm run dev:red`.
2. Laptop: `http://127.0.0.1:5174`. Celular: `http://<IP de la laptop>:5174/lector.html`
   (requiere en `chrome://flags` → *Insecure origins treated as secure* la dirección `http://<IP>:5174`,
   y que la red de Windows sea **Privada** con Node.js permitido en el firewall).

## En vivo
- En el celular elige **dónde estás** (p. ej. `B-05-03`) y acerca el celular a la caja (a pocos cm).
  Se envía sola cuando esa caja queda pegada al celular (o toca **Enviar lectura**). Vibra al enviar.
- Caja en su lugar → **Verificada** (verde) y fila nueva en *Actividad reciente*.
- Elige otra ubicación (p. ej. `A-02-01`) y lee una caja → **Fuera de lugar** + alerta en *Requiere atención*.
- Clic en una caja del Dashboard → el gemelo 3D la enfoca.

## Plan B
- **Sin celular:** el lector puede ser la laptop. Pega la caja a la laptop con
  `python scan_beacons.py --enviar https://hive.<tu-subdominio>.workers.dev/api/lecturas --ubicacion B-05-03`
  (o `--enviar` solo, con el servidor local).
- **Sin Bluetooth:** atajos ocultos en la laptop (con HIVE abierto):
  `Alt+1…5` = beacon 4/7/5/11/01 leído en su ubicación · `Alt+Shift+1…5` = leído fuera de lugar.

## Escáner de la laptop (diagnóstico)
Requisitos: Bluetooth encendido y `python -m pip install bleak`.

| Comando | Qué hace |
|---|---|
| `python scan_beacons.py` | Tabla en vivo con los beacons (señal, proximidad). |
| `python scan_beacons.py --todos` | Cualquier dispositivo Bluetooth (si no aparece ningún Estimote). |
| `python scan_beacons.py --aprender` | Acerca **un** beacon y guarda su número en `beacons.json`. |
| `python scan_beacons.py --enviar --ubicacion B-05-03` | La laptop actúa de lector y envía a HIVE. |
| `python scan_beacons.py --json` | Una línea JSON por detección. |

La distancia es una estimación: la señal BLE varía mucho. Lo fiable es el contraste **pegado (≈ −35 dBm)
frente a resto (−60 a −90)**, por eso solo se registra una caja cuando está pegada al lector.

## Pruebas
```
python -m unittest discover -s .
```
