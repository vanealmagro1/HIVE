# Beacons Estimote · lector en vivo de HIVE

En la demo, **cada beacon hace de etiqueta de una caja** (sustituto de la etiqueta RFID del producto final)
y el **celular hace de lector de mano**: al acercarlo a una caja, HIVE la verifica en el Dashboard en 1–2 s.
Los beacons son Bluetooth Low Energy, no RFID.

| Beacon | Caja | Producto | Su ubicación |
|---|---|---|---|
| 4 | CJ-0003 | Cuaderno universitario 100 h cuadros grandes | B-05-03 |
| 7 | CJ-0022 | Esferográfico punta fina negro | B-01-03 |
| 02 | CJ-0086 | Lápices de colores 12 colores | A-08-03 |
| 11 | CJ-0138 | Regla 30 cm estándar | B-08-02 |
| 01 | CJ-0164 | Borrador blanco escolar | A-03-02 |

El catálogo está en `beacons.json` (lo usan el celular, la app y el escáner). Etiquetas para imprimir: `etiquetas.html`.

## Día del pitch · arranque (5 min antes)
1. **Red:** laptop y celular en la misma red. Si el Wi‑Fi del aula falla, activa el **hotspot del celular** y conecta la laptop a él.
2. **Laptop:** `cd frontend` y `npm run dev:red`. Abre `http://127.0.0.1:5174` en el proyector (Dashboard).
   El chip debe decir **"Lector en vivo · conectado"**.
3. **IP de la laptop:** en la terminal, `ipconfig` → "Dirección IPv4" del Wi‑Fi (hoy: `192.168.100.79`).
4. **Celular (Chrome):** abre `http://<IP>:5174/lector.html`. Arriba debe decir **"HIVE conectado"**.
   - Si la IP cambió (otra red/hotspot): en `chrome://flags` → *Insecure origins treated as secure* agrega
     `http://<IP nueva>:5174` y toca Relaunch.
   - Bluetooth y Ubicación encendidos; Chrome con permiso "Dispositivos cercanos".
5. Toca **Empezar a leer**. Prueba una caja y luego **reinicia la demo** (botón ↺ en "Modo simulación").

## En vivo
- En el celular elige **dónde estás** (p. ej. `B-05-03`) y acerca el celular a la caja (a pocos cm).
  Se envía sola cuando esa caja queda pegada al celular (o toca **Enviar lectura**). Vibra al enviar.
- Caja en su lugar → **Verificada** (verde) y fila nueva en *Actividad reciente*.
- Elige otra ubicación (p. ej. `A-02-01`) y lee una caja → **Fuera de lugar** + alerta en *Requiere atención*.
- Clic en una caja del Dashboard → el gemelo 3D la enfoca.

## Plan B
- **Sin celular:** el lector puede ser la laptop. Pega la caja a la laptop con
  `python scan_beacons.py --enviar --ubicacion B-05-03` (desde `beacons/`).
- **Sin Bluetooth:** atajos ocultos en la laptop (con HIVE abierto):
  `Alt+1…5` = beacon 4/7/02/11/01 leído en su ubicación · `Alt+Shift+1…5` = leído fuera de lugar.

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
