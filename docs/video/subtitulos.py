# Genera los subtítulos .srt de los dos videos a partir de la locución por segmento (tiempos = marcas de grabar.mjs).
# Uso: python subtitulos.py   → salida/HIVE_promo_Lucia.srt y salida/HIVE_MVP_presentacion.srt
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))

PROMO = [  # (inicio, fin, locución)
    (0.3, 6.0, 'Lunes, siete y cuarenta. Temporada escolar en Quito.'),
    (6.2, 14.0, 'Trece mil seiscientas unidades. Doscientos cuarenta y siete productos. Y todo, en papel y hojas de cálculo.'),
    (14.2, 24.0, 'Una caja que no llegó. Mochilas en el pasillo equivocado. Producto que no rota. Pequeñas fugas que, en bodegas como esta, pueden costar entre tres mil y cinco mil dólares al mes.'),
    (24.3, 28.0, 'Ahora imagina verla así.'),
    (28.4, 39.6, 'Llega el camión. El portal RFID del andén lee cada caja al pasar: once de doce. Falta una caja, veinticuatro unidades, y HIVE lo detecta antes de firmar la recepción.'),
    (39.8, 49.4, 'Más tarde, en el conteo con lector de mano, aparecen las mochilas del pallet cero cero uno… en el pasillo D.'),
    (49.6, 57.4, 'HIVE no cambia el inventario oficial por su cuenta: pide que alguien lo verifique, con la evidencia a la vista.'),
    (57.6, 65.2, 'Por separado, revisa la cobertura: sesenta días cuando el objetivo es treinta. Dos mil cuatrocientos dólares de exposición estimada.'),
    (65.4, 71.4, 'HIVE recomienda redistribuir trescientas unidades. Lucía decide.'),
    (71.6, 87.0, 'La aprobación crea una tarea registrada. El montacargas lleva los pallets al muelle, Quito Sur confirma lo que recibe, y las dos bodegas quedan con treinta días de cobertura. El stock total no cambia: se pone donde se vende.'),
    (87.3, 93.8, 'HIVE. De los datos de tu bodega a mejores decisiones. Agenda una demo para tu bodega.'),
]

MVP = [
    (0.2, 3.5, 'Este es el MVP de HIVE.'),
    (3.7, 14.4, 'Llega un camión. El portal RFID lee cada caja y HIVE la compara con la orden de compra: llegaron once de doce; falta una.'),
    (14.6, 23.6, 'En el conteo con lector de mano, las mochilas del pallet cero cero uno aparecen en el pasillo D, no donde estaban registradas.'),
    (23.8, 27.7, 'HIVE no corrige solo: pide verificarlo.'),
    (27.9, 35.2, 'Aparte, calcula la cobertura: sesenta días frente a un objetivo de treinta; dos mil cuatrocientos dólares de exposición estimada.'),
    (35.4, 41.2, 'Recomienda redistribuir trescientas unidades, y una persona aprueba.'),
    (41.4, 56.8, 'La aprobación crea una tarea. Simulamos la ejecución: el montacargas lleva dos pallets al muelle. Cuando Quito Sur confirma la recepción, ambas bodegas quedan en treinta días y el total, seiscientas noventa unidades, se conserva.'),
    (57.0, 62.2, 'Y la analítica se actualiza con los mismos datos: medir cierra el ciclo.'),
    (62.4, 68.6, 'Hoy las lecturas son simuladas; la lógica funciona. El siguiente paso es un piloto en una bodega de Quito.'),
]


def ts(t):
    ms = int(round(t * 1000))
    return f'{ms // 3600000:02}:{ms // 60000 % 60:02}:{ms // 1000 % 60:02},{ms % 1000:03}'


def wrap(text, width=44):
    words, lines, cur = text.split(), [], ''
    for w in words:
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = f'{cur} {w}'.strip()
    lines.append(cur)
    return lines


def cues(segments):
    """Divide cada segmento en subtítulos de ≤ 2 líneas, con tiempo proporcional al largo del texto."""
    out = []
    for a, b, text in segments:
        sentences = [s for s in re.split(r'(?<=[.:;?!…])\s+', text) if s]
        blocks, cur = [], ''
        for s in sentences:
            cand = f'{cur} {s}'.strip()
            if cur and len(wrap(cand)) > 2:
                blocks.append(cur)
                cur = s
            else:
                cur = cand
        blocks.append(cur)
        total = sum(len(x) for x in blocks)
        t = a
        for blk in blocks:
            d = (b - a) * len(blk) / total
            out.append((t, t + d - 0.05, '\n'.join(wrap(blk))))
            t += d
    return out


def write(name, segments):
    os.makedirs(os.path.join(HERE, 'salida'), exist_ok=True)
    path = os.path.join(HERE, 'salida', name)
    with open(path, 'w', encoding='utf-8') as f:
        for i, (a, b, txt) in enumerate(cues(segments), 1):
            f.write(f'{i}\n{ts(a)} --> {ts(b)}\n{txt}\n\n')
    words = sum(len(s[2].split()) for s in segments)
    print(f'{path} · {words} palabras')


write('HIVE_promo_Lucia.srt', PROMO)
write('HIVE_MVP_presentacion.srt', MVP)
