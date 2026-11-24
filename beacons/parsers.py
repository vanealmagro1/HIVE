"""Decodificación de anuncios BLE de beacons (sin Bluetooth: funciones puras y testeables).

Formatos que emiten los Estimote Location Beacons:
  - iBeacon   (manufacturer data de Apple 0x004C, prefijo 02 15): UUID + major + minor + potencia a 1 m.
  - Eddystone (service data 0xFEAA): UID (namespace + instancia), URL y TLM (batería, temperatura).
  - Estimote  (service data 0xFE9A): paquetes propios; el de telemetría trae el identificador corto del beacon.
"""
from __future__ import annotations

import math
import struct
import uuid
from dataclasses import dataclass, field

APPLE_COMPANY_ID = 0x004C
ESTIMOTE_IBEACON_UUID = "b9407f30-f5f8-466e-aff9-25556b57fe6d"
ESTIMOTE_EDDYSTONE_NAMESPACE = "edd1ebeac04e5defa017"
EDDYSTONE_SERVICE = "0000feaa-0000-1000-8000-00805f9b34fb"
ESTIMOTE_SERVICE = "0000fe9a-0000-1000-8000-00805f9b34fb"

# Potencia de referencia típica a 1 m cuando el paquete no la trae (dBm).
DEFAULT_TX_AT_1M = -59

URL_SCHEMES = ["http://www.", "https://www.", "http://", "https://"]
URL_ENDINGS = [".com/", ".org/", ".edu/", ".net/", ".info/", ".biz/", ".gov/",
               ".com", ".org", ".edu", ".net", ".info", ".biz", ".gov"]


@dataclass
class Packet:
    """Un paquete decodificado. `ident` identifica al beacon dentro de su formato."""
    kind: str                     # 'iBeacon' | 'Eddystone-UID' | 'Eddystone-URL' | 'Eddystone-TLM' | 'Estimote'
    ident: str | None = None
    tx_at_1m: int | None = None   # dBm de referencia a 1 m (para estimar distancia)
    estimote: bool = False        # True si el contenido es claramente de Estimote
    extra: dict = field(default_factory=dict)


def parse_ibeacon(data: bytes) -> Packet | None:
    """`data` = manufacturer data de Apple SIN el company id (así lo entrega bleak)."""
    if len(data) < 23 or data[0] != 0x02 or data[1] != 0x15:
        return None
    beacon_uuid = str(uuid.UUID(bytes=bytes(data[2:18])))
    major, minor = struct.unpack(">HH", data[18:22])
    tx = struct.unpack(">b", data[22:23])[0]
    return Packet(
        kind="iBeacon",
        ident=f"{major}:{minor}",
        tx_at_1m=tx,
        estimote=beacon_uuid == ESTIMOTE_IBEACON_UUID,
        extra={"uuid": beacon_uuid, "major": major, "minor": minor},
    )


def _decode_url(scheme: int, body: bytes) -> str:
    out = URL_SCHEMES[scheme] if scheme < len(URL_SCHEMES) else ""
    for b in body:
        out += URL_ENDINGS[b] if b < len(URL_ENDINGS) else chr(b)
    return out


def parse_eddystone(data: bytes) -> Packet | None:
    """`data` = service data del UUID 0xFEAA."""
    if not data:
        return None
    frame = data[0]
    if frame == 0x00 and len(data) >= 18:  # UID
        tx0 = struct.unpack(">b", data[1:2])[0]
        namespace = data[2:12].hex()
        instance = data[12:18].hex()
        return Packet(
            kind="Eddystone-UID",
            ident=f"{namespace}:{instance}",
            tx_at_1m=tx0 - 41,  # Eddystone publica la potencia a 0 m; a 1 m ≈ −41 dB
            estimote=namespace == ESTIMOTE_EDDYSTONE_NAMESPACE,
            extra={"namespace": namespace, "instance": instance},
        )
    if frame == 0x10 and len(data) >= 3:  # URL
        tx0 = struct.unpack(">b", data[1:2])[0]
        return Packet(kind="Eddystone-URL", tx_at_1m=tx0 - 41, extra={"url": _decode_url(data[2], data[3:])})
    if frame == 0x20 and len(data) >= 14:  # TLM (sin cifrar)
        battery_mv = struct.unpack(">H", data[2:4])[0]
        temp_c = struct.unpack(">h", data[4:6])[0] / 256
        return Packet(kind="Eddystone-TLM", extra={"bateria_mV": battery_mv, "temperatura_C": round(temp_c, 1)})
    return None


def parse_estimote(data: bytes) -> Packet | None:
    """`data` = service data del UUID 0xFE9A (paquetes propios de Estimote).

    Los 4 bits bajos del primer byte indican el tipo. El de telemetría (tipo 2) trae en los bytes 1–8 el
    identificador corto del beacon; los demás tipos traen el identificador completo en los bytes 1–16.
    """
    if not data:
        return None
    ptype = data[0] & 0x0F
    if ptype == 0x2 and len(data) >= 9:
        ident = data[1:9].hex()
    elif len(data) >= 17:
        ident = data[1:17].hex()
    else:
        ident = data[1:].hex() or None
    return Packet(kind="Estimote", ident=ident, estimote=True, extra={"tipo": ptype})


def parse_advertisement(manufacturer_data: dict[int, bytes], service_data: dict[str, bytes]) -> list[Packet]:
    """Todos los paquetes reconocidos en un anuncio BLE."""
    packets: list[Packet] = []
    apple = manufacturer_data.get(APPLE_COMPANY_ID)
    if apple:
        p = parse_ibeacon(apple)
        if p:
            packets.append(p)
    for key, value in service_data.items():
        k = key.lower()
        if k == EDDYSTONE_SERVICE:
            p = parse_eddystone(value)
        elif k == ESTIMOTE_SERVICE:
            p = parse_estimote(value)
        else:
            p = None
        if p:
            packets.append(p)
    return packets


def estimate_distance(rssi: float, tx_at_1m: int | None, n: float = 2.0) -> float:
    """Distancia aproximada en metros (modelo log-distancia). Es una estimación: paredes y cuerpos la alteran."""
    tx = tx_at_1m if tx_at_1m is not None else DEFAULT_TX_AT_1M
    return 10 ** ((tx - rssi) / (10 * n))


def proximity(distance_m: float) -> str:
    if distance_m < 0.5:
        return "Inmediato"
    if distance_m < 3:
        return "Cerca"
    return "Lejos"


def fmt_distance(distance_m: float) -> str:
    return f"{distance_m:.1f} m" if distance_m < 10 else f"{math.floor(distance_m)} m"


def address_family(address: str) -> str:
    """Clave del beacon físico a partir de su dirección Bluetooth.

    Un Estimote emite cada tipo de paquete desde una dirección distinta, desplazando TODOS los bytes en la
    misma cantidad (p. ej. F2:30:B1:… → F3:31:B2:… → F4:32:B3:…). Restando el primer byte a cada byte se
    obtiene una clave igual para todas las direcciones del mismo beacon.
    """
    parts = [int(x, 16) for x in address.replace("-", ":").split(":") if x]
    if len(parts) != 6:
        return address.upper()
    return "-".join(f"{(b - parts[0]) % 256:02X}" for b in parts[1:])
