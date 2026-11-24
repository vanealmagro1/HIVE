# Beacons Estimote · escáner de prueba

Muestra en la terminal qué beacons Estimote detecta la laptop, su señal (RSSI) y qué tan cerca están.
En la demo, **cada beacon hace de etiqueta de una caja** (sustituto de la etiqueta RFID) y la laptop
hace de lector. Los beacons son Bluetooth Low Energy, no RFID.

## Requisitos (Windows)
1. Bluetooth encendido: *Configuración → Bluetooth y dispositivos*. No hace falta emparejar los beacons.
2. Python 3 y la librería **bleak**:
   ```
   python -m pip install bleak
   ```

## Uso (desde esta carpeta `beacons/`)
| Comando | Qué hace |
|---|---|
| `python scan_beacons.py` | Tabla en vivo con los beacons Estimote (se refresca cada segundo). |
| `python scan_beacons.py --todos` | Muestra cualquier dispositivo Bluetooth (si no aparece ningún Estimote). |
| `python scan_beacons.py --aprender` | Acercas **un** beacon, lo detecta por la señal más fuerte y guardas su etiqueta (7, 4, 06…) en `beacons.json`. |
| `python scan_beacons.py --json` | Una línea JSON por detección (lo que usará el puente hacia HIVE). |

Columnas: etiqueta (de `beacons.json`), dirección Bluetooth, identificador (iBeacon `major:minor`,
id Estimote o Eddystone), paquetes vistos, RSSI suavizado, distancia estimada, proximidad
(Inmediato < 0,5 m · Cerca < 3 m · Lejos) y hace cuánto se vio. Si un beacon no se ve por más de
10 s aparece como *fuera de alcance*.

La distancia es una **estimación**: paredes, el cuerpo o el metal la alteran. Para la demo importa
más la proximidad y el cambio de señal que el número exacto.

## Si no aparece ningún beacon
- Prueba `--todos`: si salen otros dispositivos, el Bluetooth funciona y el problema es el beacon.
- Abre la app **Estimote** en el celular: confirma que el beacon está encendido y que emite iBeacon
  o Eddystone (se activan desde la app o desde cloud.estimote.com).

## Pruebas
```
python -m unittest discover -s .
```
