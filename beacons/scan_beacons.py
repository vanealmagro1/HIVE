"""Escáner de beacons Estimote para HIVE.

Usa el Bluetooth de Windows a través de la librería bleak. No hace falta emparejar los beacons.

    python scan_beacons.py              tabla en vivo con los beacons Estimote
    python scan_beacons.py --todos      cualquier dispositivo BLE (diagnóstico)
    python scan_beacons.py --aprender   identificar cada beacon físico y guardar su etiqueta (7, 4, 06…)
    python scan_beacons.py --json       una línea JSON por detección
    python scan_beacons.py --enviar --ubicacion B-05-03
                                        la laptop hace de lector: cuando un beacon queda PEGADO a ella,
                                        envía la lectura a HIVE (npm run dev:red debe estar corriendo)
        --enviar https://hive.hive-demo.workers.dev/api/lecturas   lo mismo, a HIVE en Cloudflare
        --umbral -55                    sensibilidad (más negativo = cuenta desde más lejos)
        --preciso                       modo preciso (mediana + 1 s sostenido) en vez de barrido rápido

Ctrl + C para salir.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
import sys
import time
import urllib.request
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

try:
    from bleak import BleakScanner
except ImportError:  # mensaje claro si falta la dependencia
    sys.exit("Falta la librería bleak. Instálala con:  python -m pip install bleak")

from parsers import Packet, address_family, estimate_distance, fmt_distance, parse_advertisement, proximity

CATALOG = Path(__file__).with_name("beacons.json")
OUT_OF_RANGE_S = 10
NEAR_RSSI = -50      # caja acercada al lector (la antena de la laptop es menos sensible que la del celular)
MARGIN_DB = 6        # debe ganar al segundo beacon por al menos 6 dB
DEBOUNCE_S = 8       # misma caja: una lectura cada 8 s
SWEEP_MARGIN_DB = 3  # barrido: otra caja con señal casi igual en el mismo instante = ambiguo, no se cuenta
SWEEP_WINDOW_S = 0.5
DEFAULT_RELAY = "http://127.0.0.1:5174/api/lecturas"
SMOOTHING = 9  # mediana de las últimas lecturas: ignora los picos típicos de BLE


@dataclass
class Seen:
    """Un beacon físico (agrupa las varias direcciones Bluetooth desde las que emite)."""
    key: str
    addresses: set = field(default_factory=set)
    name: str | None = None
    rssi: deque = field(default_factory=lambda: deque(maxlen=SMOOTHING))
    last: float = 0.0
    raw: float = -100.0  # última lectura sin suavizar (la usa el barrido)
    estimote: bool = False
    kinds: set = field(default_factory=set)
    idents: dict = field(default_factory=dict)  # tipo de paquete -> identificador
    tx_at_1m: int | None = None
    telemetry: dict = field(default_factory=dict)

    @property
    def rssi_avg(self) -> float:
        return statistics.median(self.rssi) if self.rssi else -100.0

    @property
    def distance(self) -> float:
        return estimate_distance(self.rssi_avg, self.tx_at_1m)


def load_catalog() -> list[dict]:
    if CATALOG.exists():
        return json.loads(CATALOG.read_text(encoding="utf-8")).get("beacons", [])
    return []


def save_catalog(entries: list[dict]) -> None:
    CATALOG.write_text(json.dumps({"beacons": entries}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def same_ids(a: list[str] | set[str], b: list[str] | set[str]) -> bool:
    """Coinciden si algún id es igual o prefijo del otro (el id corto de telemetría es prefijo del completo)."""
    return any(x.startswith(y) or y.startswith(x) for x in a for y in b if len(x) >= 3 and len(y) >= 3)


def catalog_entry(seen: Seen, catalog: list[dict]) -> dict | None:
    for e in catalog:
        if e.get("beacon") == seen.key or same_ids(e.get("ids", []), seen.idents.values()):
            return e
    return None


def label_for(seen: Seen, catalog: list[dict]) -> str:
    e = catalog_entry(seen, catalog)
    return str(e.get("etiqueta", "?")) if e else "—"


class Scanner:
    def __init__(self, show_all: bool, as_json: bool):
        self.show_all = show_all
        self.as_json = as_json
        self.devices: dict[str, Seen] = {}
        self.alias: dict[str, str] = {}  # familia de dirección -> beacon al que pertenece
        self.on_read = None  # gancho por lectura: on_read(seen, rssi) (barrido de la laptop)

    def on_advertisement(self, device, adv) -> None:
        packets: list[Packet] = parse_advertisement(adv.manufacturer_data or {}, adv.service_data or {})
        name = adv.local_name or device.name
        is_estimote = any(p.estimote for p in packets) or (name or "").lower().startswith("estimote")
        if not (is_estimote or self.show_all):
            return
        key = self.alias.get(address_family(device.address), address_family(device.address))
        # Si el paquete trae un id que ya conocemos (p. ej. el mismo iBeacon) desde otra dirección, es el mismo beacon.
        ids = {p.ident for p in packets if p.ident}
        for other in self.devices.values():
            if other.key != key and ids & set(other.idents.values()):
                self.alias[address_family(device.address)] = other.key
                key = other.key
                break
        s = self.devices.setdefault(key, Seen(key=key))
        s.addresses.add(device.address)
        s.name = name or s.name
        s.rssi.append(adv.rssi)
        s.last = time.time()
        s.raw = adv.rssi
        s.estimote = s.estimote or is_estimote
        for p in packets:
            s.kinds.add(p.kind)
            if p.ident and len(p.ident) >= len(s.idents.get(p.kind, "")):
                s.idents[p.kind] = p.ident  # se conserva el id más largo (completo frente al corto)
            if p.tx_at_1m is not None and p.kind == "iBeacon":
                s.tx_at_1m = p.tx_at_1m
            elif p.tx_at_1m is not None and s.tx_at_1m is None:
                s.tx_at_1m = p.tx_at_1m
            if p.kind == "Eddystone-TLM":
                s.telemetry = p.extra
        if self.on_read and s.estimote:
            self.on_read(s, adv.rssi)
        if self.as_json:
            print(json.dumps({
                "t": round(s.last, 3), "beacon": s.key, "address": device.address, "rssi": adv.rssi,
                "rssi_suavizado": round(s.rssi_avg, 1), "distancia_m": round(s.distance, 2),
                "proximidad": proximity(s.distance), "estimote": s.estimote,
                "ids": s.idents, "paquetes": sorted(s.kinds),
            }, ensure_ascii=False), flush=True)

    def render(self, catalog: list[dict]) -> str:
        now = time.time()
        rows = sorted(self.devices.values(), key=lambda s: -s.rssi_avg)
        head = f"{'Etiq.':<6}{'Beacon':<10}{'iBeacon':<12}{'RSSI':>5}{'Dist.':>8}  {'Proximidad':<17}{'Visto':>5}"
        lines = [
            "HIVE · Escáner de beacons " + ("(todos los dispositivos BLE)" if self.show_all else "(Estimote)"),
            f"{len(rows)} detectados · Ctrl + C para salir", "", head, "─" * len(head),
        ]
        for s in rows:
            age = now - s.last
            known = catalog_entry(s, catalog)
            long_ids = [i for i in (known or {}).get("ids", []) if len(i) >= 16]
            beacon = (s.idents.get("Estimote") or (long_ids[0] if long_ids else "") or s.name or sorted(s.addresses)[0])[:8]
            ibeacon = s.idents.get("iBeacon", "—")
            prox = "fuera de alcance" if age > OUT_OF_RANGE_S else proximity(s.distance)
            lines.append(
                f"{label_for(s, catalog):<6}{beacon:<10}{ibeacon[:11]:<12}"
                f"{s.rssi_avg:>5.0f}{fmt_distance(s.distance):>8}  {prox:<17}{age:>4.0f}s"
            )
        if not rows:
            lines.append("Aún no se ve ningún beacon. ¿Bluetooth encendido? Prueba también con --todos.")
        return "\n".join(lines)


def post_read(url: str, label: str, ubicacion: str, rssi: float) -> str:
    body = json.dumps({"beacon": label, "ubicacion": ubicacion, "rssi": round(rssi), "lector": "laptop",
                       "t": int(time.time() * 1000)}).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=3) as r:
        data = json.loads(r.read().decode("utf-8"))
    return f"enviado (pantallas de HIVE escuchando: {data.get('pantallas', '?')})"


class Sender:
    """Decide cuándo un beacon está "pegado" a la laptop y envía la lectura a HIVE (mismo criterio que el celular)."""

    def __init__(self, url: str, ubicacion: str, umbral: float = NEAR_RSSI, sweep: bool = True):
        self.url, self.ubicacion = url, ubicacion
        self.umbral, self.sweep = umbral, sweep
        self.leader: str | None = None
        self.last_sent: dict[str, float] = {}
        self.swept: list[str] = []
        self.sc: Scanner | None = None
        self.catalog: list[dict] = []
        self.loop: asyncio.AbstractEventLoop | None = None
        modo = "barrido rápido: pasa las cajas junto a la laptop" if sweep else "preciso: pega una caja a la laptop"
        self.status = f"Lector de la laptop en {ubicacion} · {modo} · umbral {umbral:.0f} dBm."

    def attach(self, sc: "Scanner", catalog: list[dict]) -> None:
        self.sc, self.catalog, self.loop = sc, catalog, asyncio.get_running_loop()
        if self.sweep:
            sc.on_read = self.sweep_check

    def sweep_check(self, s: Seen, rssi: float) -> None:
        """Barrido: una sola lectura fuerte, sin otra caja igual de fuerte en ese instante -> se envía de inmediato."""
        if rssi < self.umbral or self.sc is None:
            return
        label = label_for(s, self.catalog)
        if label in ("—", "?"):
            return
        now = time.time()
        for o in self.sc.devices.values():
            if o is not s and o.estimote and now - o.last < SWEEP_WINDOW_S and o.raw > rssi - SWEEP_MARGIN_DB:
                return
        self.dispatch(label, rssi, now)

    def dispatch(self, label: str, rssi: float, now: float) -> None:
        if now - self.last_sent.get(label, 0) < DEBOUNCE_S:
            return
        self.last_sent[label] = now
        if label not in self.swept:
            self.swept.append(label)
        print("\a", end="", flush=True)  # pitido corto de la consola: caja leída
        self.status = f"Beacon {label} → {self.ubicacion}: enviando…"
        if self.loop is not None:
            self.loop.create_task(self.post(label, rssi))

    async def post(self, label: str, rssi: float) -> None:
        try:
            result = await asyncio.to_thread(post_read, self.url, label, self.ubicacion, rssi)
            self.status = f"Beacon {label} → {self.ubicacion}: {result}"
        except Exception as e:  # noqa: BLE001 — se informa en pantalla y se sigue escaneando
            self.last_sent.pop(label, None)  # la próxima señal lo reintenta
            self.status = f"No se pudo enviar el beacon {label}: {e}. ¿Hay internet / está corriendo el relé?"

    def summary(self) -> str:
        if not self.swept:
            return ""
        return f"Leídas en este barrido: {', '.join(self.swept)} · {len(self.swept)} de {len(self.catalog)}"

    async def tick(self, sc: "Scanner", catalog: list[dict]) -> None:
        if self.sweep:
            return
        now = time.time()
        ranked = sorted(
            ((label_for(s, catalog), s.rssi_avg) for s in sc.devices.values() if s.estimote and now - s.last < 3),
            key=lambda x: -x[1],
        )
        ranked = [r for r in ranked if r[0] != "—"]
        top = ranked[0] if ranked else None
        clear = top is not None and top[1] >= self.umbral and (len(ranked) < 2 or top[1] - ranked[1][1] >= MARGIN_DB)
        if not clear:
            self.leader = None
            return
        if self.leader != top[0]:  # debe sostenerse al menos 1 segundo (dos evaluaciones seguidas)
            self.leader = top[0]
            return
        self.dispatch(top[0], top[1], now)


async def run_live(show_all: bool, as_json: bool, sender: Sender | None = None) -> None:
    sc = Scanner(show_all, as_json)
    catalog = load_catalog()
    if sender:
        sender.attach(sc, catalog)
    async with BleakScanner(detection_callback=sc.on_advertisement):
        while True:
            await asyncio.sleep(1)
            if sender:
                await sender.tick(sc, catalog)
            if not as_json:
                extra = ""
                if sender:
                    extra = f"\n\n{sender.status}" + (f"\n{sender.summary()}" if sender.summary() else "")
                sys.stdout.write("\x1b[2J\x1b[H" + sc.render(catalog) + extra + "\n")
                sys.stdout.flush()


async def scan_for(seconds: float) -> Scanner:
    sc = Scanner(show_all=False, as_json=False)
    async with BleakScanner(detection_callback=sc.on_advertisement):
        await asyncio.sleep(seconds)
    return sc


def run_learn() -> None:
    catalog = load_catalog()
    print("Modo aprender: acerca UN beacon a la laptop (a pocos centímetros) y aleja los demás.")
    while True:
        input("\nPresiona Enter para escanear 6 segundos (Ctrl + C para terminar)… ")
        sc = asyncio.run(scan_for(6))
        found = sorted((s for s in sc.devices.values() if s.estimote), key=lambda s: -s.rssi_avg)
        if not found:
            print("No se detectó ningún Estimote. Revisa el Bluetooth y vuelve a intentar.")
            continue
        best = found[0]
        print(f"Más cercano: beacon {best.idents.get('Estimote', best.key)[:8]} · RSSI {best.rssi_avg:.0f} · {fmt_distance(best.distance)} · ids {best.idents}")
        if len(found) > 1 and found[1].rssi_avg > best.rssi_avg - 6:
            print(f"  Ojo: otro beacon ({found[1].idents.get('Estimote', found[1].key)[:8]}) tiene una señal parecida ({found[1].rssi_avg:.0f}); aleja los otros beacons.")
        label = input("Etiqueta escrita en ese beacon (p. ej. 7, 4, 06; vacío para omitir): ").strip()
        if not label:
            continue
        catalog = [e for e in catalog if e.get("beacon") != best.key and str(e.get("etiqueta")) != label]
        catalog.append({"etiqueta": label, "beacon": best.key, "ids": sorted(set(best.idents.values())), "unitId": None})
        catalog.sort(key=lambda e: str(e["etiqueta"]))
        save_catalog(catalog)
        print(f"Guardado en {CATALOG.name}: {label} → beacon {best.idents.get('Estimote', best.key)[:8]} · ids {sorted(set(best.idents.values()))}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Escáner de beacons Estimote para HIVE")
    ap.add_argument("--todos", action="store_true", help="mostrar cualquier dispositivo BLE")
    ap.add_argument("--aprender", action="store_true", help="identificar beacons y guardar su etiqueta")
    ap.add_argument("--json", action="store_true", help="una línea JSON por detección")
    ap.add_argument("--enviar", nargs="?", const=DEFAULT_RELAY, metavar="URL",
                    help=f"enviar a HIVE las cajas pegadas a la laptop (por defecto {DEFAULT_RELAY})")
    ap.add_argument("--ubicacion", default="B-05-03", help="ubicación donde está la laptop-lector (p. ej. B-05-03)")
    ap.add_argument("--umbral", type=float, default=NEAR_RSSI, help=f"señal mínima en dBm (por defecto {NEAR_RSSI})")
    ap.add_argument("--preciso", action="store_true", help="modo preciso (mediana + sostenido) en vez de barrido")
    args = ap.parse_args()
    if os.name == "nt":
        os.system("")  # habilita colores/ANSI en la consola de Windows
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    try:
        if args.aprender:
            run_learn()
        else:
            sender = Sender(args.enviar, args.ubicacion.upper(), args.umbral, not args.preciso) if args.enviar else None
            asyncio.run(run_live(args.todos, args.json, sender))
    except KeyboardInterrupt:
        print("\nEscáner detenido.")


if __name__ == "__main__":
    main()
