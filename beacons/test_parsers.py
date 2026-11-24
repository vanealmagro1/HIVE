"""Pruebas de los decodificadores con bytes de ejemplo (no requieren Bluetooth).

Ejecutar desde la raíz del repo:  python -m unittest discover -s beacons
"""
import struct
import unittest
import uuid

from parsers import (
    APPLE_COMPANY_ID, EDDYSTONE_SERVICE, ESTIMOTE_IBEACON_UUID, ESTIMOTE_SERVICE,
    address_family, estimate_distance, parse_advertisement, parse_eddystone, parse_estimote, parse_ibeacon, proximity,
)


def ibeacon_bytes(u: str, major: int, minor: int, tx: int) -> bytes:
    return bytes([0x02, 0x15]) + uuid.UUID(u).bytes + struct.pack(">HHb", major, minor, tx)


class IBeaconTest(unittest.TestCase):
    def test_estimote_ibeacon(self):
        p = parse_ibeacon(ibeacon_bytes(ESTIMOTE_IBEACON_UUID, 12345, 7, -59))
        self.assertEqual(p.kind, "iBeacon")
        self.assertEqual(p.ident, "12345:7")
        self.assertEqual(p.tx_at_1m, -59)
        self.assertTrue(p.estimote)

    def test_otro_fabricante_no_es_estimote(self):
        p = parse_ibeacon(ibeacon_bytes("12345678-1234-1234-1234-123456789abc", 1, 2, -60))
        self.assertFalse(p.estimote)

    def test_datos_que_no_son_ibeacon(self):
        self.assertIsNone(parse_ibeacon(bytes([0x10, 0x05, 0x01, 0x02])))


class EddystoneTest(unittest.TestCase):
    def test_uid_estimote(self):
        data = bytes([0x00, 0xEE]) + bytes.fromhex("edd1ebeac04e5defa017") + bytes.fromhex("0123456789ab") + b"\x00\x00"
        p = parse_eddystone(data)
        self.assertEqual(p.kind, "Eddystone-UID")
        self.assertEqual(p.ident, "edd1ebeac04e5defa017:0123456789ab")
        self.assertEqual(p.tx_at_1m, -18 - 41)
        self.assertTrue(p.estimote)

    def test_url(self):
        p = parse_eddystone(bytes([0x10, 0xEE, 0x03]) + b"estimote" + bytes([0x00]))
        self.assertEqual(p.extra["url"], "https://estimote.com/")

    def test_tlm(self):
        data = bytes([0x20, 0x00]) + struct.pack(">Hh", 3000, int(23.5 * 256)) + bytes(8)
        p = parse_eddystone(data)
        self.assertEqual(p.extra, {"bateria_mV": 3000, "temperatura_C": 23.5})


class EstimoteTest(unittest.TestCase):
    def test_telemetria_identificador_corto(self):
        data = bytes([0x22]) + bytes.fromhex("a1b2c3d4e5f60708") + bytes(10)
        p = parse_estimote(data)
        self.assertEqual((p.kind, p.ident, p.extra["tipo"]), ("Estimote", "a1b2c3d4e5f60708", 2))

    def test_identificador_completo(self):
        data = bytes([0x00]) + bytes(range(16)) + bytes(3)
        self.assertEqual(parse_estimote(data).ident, bytes(range(16)).hex())


class AnuncioTest(unittest.TestCase):
    def test_anuncio_con_varios_formatos(self):
        packets = parse_advertisement(
            {APPLE_COMPANY_ID: ibeacon_bytes(ESTIMOTE_IBEACON_UUID, 1, 4, -59)},
            {ESTIMOTE_SERVICE.upper(): bytes([0x02]) + bytes(8), EDDYSTONE_SERVICE: bytes([0x30])},
        )
        self.assertEqual([p.kind for p in packets], ["iBeacon", "Estimote"])


class FamiliaTest(unittest.TestCase):
    def test_direcciones_del_mismo_beacon(self):
        # Direcciones reales observadas: un mismo Estimote emite desde varias direcciones desplazadas.
        fam = {address_family(a) for a in ["F2:30:B1:8A:28:74", "F3:31:B2:8B:29:75", "F4:32:B3:8C:2A:76"]}
        self.assertEqual(len(fam), 1)
        self.assertEqual(address_family("DF:D4:4F:48:FB:29"), address_family("E2:D7:52:4B:FE:2C"))

    def test_beacons_distintos(self):
        self.assertNotEqual(address_family("F3:31:B2:8B:29:75"), address_family("E2:D7:52:4B:FE:2C"))


class DistanciaTest(unittest.TestCase):
    def test_a_un_metro(self):
        self.assertAlmostEqual(estimate_distance(-59, -59), 1.0)

    def test_proximidad(self):
        self.assertEqual(proximity(estimate_distance(-45, -59)), "Inmediato")
        self.assertEqual(proximity(estimate_distance(-62, -59)), "Cerca")
        self.assertEqual(proximity(estimate_distance(-85, -59)), "Lejos")


if __name__ == "__main__":
    unittest.main()
