// @vitest-environment jsdom
// HIVE UI v2 · flujo de operaciones con clics reales: Dashboard → Eventos (recepción y detección) → Analítica →
// Acciones (aprobar, simular, confirmar) → reinicio. jsdom no tiene WebGL: el gemelo usa la vista 2D de respaldo.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { createDemoStore } from './store/demoStore';
import { inventoryTotals } from './store/demoState';
import { attentionItems } from './store/operations';
import { unitContents } from './store/selectors';

afterEach(cleanup);
const FAST = { receiptIntervalMs: 1, countIntervalMs: 1 };
const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const T = { timeout: 20_000 };

describe('HIVE UI v2 · operaciones', () => {
  it('recepción → detección → analítica → aprobar → simular → confirmar, con reinicio determinista', async () => {
    const store = createDemoStore();
    const user = userEvent.setup();
    render(<App store={store} playback={FAST} />);
    const nav = (name: string) => user.click(within(screen.getByRole('navigation')).getByRole('button', { name: new RegExp(`^${name}`) }));

    // Dashboard: indicadores derivados del estado; una sola marca de simulación.
    expect(screen.getAllByTestId('sim-banner')).toHaveLength(1);
    expect(screen.getByTestId('kpi-units').textContent).toBe('13.599');
    expect(screen.getByTestId('kpi-exposure').textContent).toBe('USD 2.400');
    expect(screen.getByTestId('kpi-alerts').textContent).toBe(String(attentionItems(store.getState()).length));
    expect(within(screen.getByTestId('attention-list')).getByText(/Mochila escolar básica · 300 unidades excedentes/)).toBeTruthy();
    const before = total(inventoryTotals(store.getState()));

    // Recepción por portal RFID (288 esperadas, 264 leídas, 24 faltan).
    await user.click(screen.getByRole('button', { name: 'Simular recepción' }));
    expect(screen.getByTestId('page-eventos')).toBeTruthy();
    const result = await screen.findByTestId('receipt-result', {}, T);
    expect(result.textContent).toMatch(/11 de 12 cajas · 264 u sumadas/);
    expect(result.textContent).toMatch(/Falta 1 caja \(24 u\)/);
    expect(total(inventoryTotals(store.getState()))).toBe(before + 264);
    expect((screen.getByRole('button', { name: /Confirmar ingreso/ }) as HTMLButtonElement).disabled).toBe(true); // idempotente

    // Detección con lector de mano: PAL-001 leído fuera de su ubicación; la ubicación oficial no cambia.
    await user.click(screen.getByRole('button', { name: /Registrar otra detección/ }));
    const evidence = await screen.findByTestId('new-evidence', {}, T);
    expect(evidence.textContent).toMatch(/PAL-001 leído en D-07-02 \(asignado a B-03-01\)/);
    expect(store.getState().units.find((u) => u.id === 'PAL-001')!.expectedLocationId).toBe('B-03-01');
    expect(store.getState().alerts.map((a) => a.type).sort()).toEqual(['LOCATION_MISMATCH', 'RECEIPT_SHORTAGE']);
    const table = screen.getByTestId('events-table');
    expect(within(table).getAllByText('Recepción').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('Detección').length).toBeGreaterThan(0);

    // Evidencia en el panel lateral; Escape lo cierra.
    await user.selectOptions(screen.getByLabelText('Filtrar por tipo'), 'Recepción');
    await user.click(within(screen.getByTestId('events-table')).getAllByRole('button', { name: 'Evidencia' })[0]);
    expect(within(screen.getByTestId('evidence-drawer')).getAllByText(/Portal RFID/).length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('evidence-drawer')).toBeNull();

    // Analítica del producto con sobrestock (600 u, 10/día, objetivo 30 días, USD 8).
    await nav('Analítica');
    expect(screen.getByTestId('an-coverage').textContent).toBe('60 días');
    expect(screen.getByTestId('an-excess').textContent).toBe('300');
    expect(screen.getByTestId('an-exposure').textContent).toBe('USD 2.400');
    expect(screen.getByTestId('formula-card').textContent).toMatch(/600 ÷ 10 = 60 días/);
    await user.click(screen.getByRole('button', { name: 'Ver recomendación' }));

    // Acciones: la recomendación detalla cantidad, origen, destino y pallets; aprobar no mueve inventario.
    const rec = screen.getByTestId('rec-rec-moc-001');
    expect(rec.textContent).toMatch(/Redistribuir Mochila escolar básica/);
    expect(rec.textContent).toMatch(/300 unidades/);
    expect(rec.textContent).toMatch(/Quito Sur · Muelle D2/);
    const stock = inventoryTotals(store.getState());
    await user.click(within(rec).getByRole('button', { name: 'Aprobar recomendación' }));
    expect(store.getState().recommendations.find((r) => r.id === 'rec-moc-001')!.status).toBe('APPROVED');
    expect(store.getState().tasks.map((t) => t.id)).toEqual(['task-rec-moc-001']);
    expect(inventoryTotals(store.getState())).toEqual(stock);

    // Tarea: simular ejecución → confirmar recepción → antes/después.
    await user.click(within(screen.getByTestId('rec-rec-moc-001')).getByRole('button', { name: /Ver tarea/ }));
    const task = screen.getByTestId('task-task-rec-moc-001');
    expect(task.textContent).toMatch(/Pendiente de ejecución/);
    expect(task.textContent).toMatch(/300 u · 2 pallets/);
    expect(screen.getByTestId('before-after').textContent).toMatch(/Previsto/);
    await user.click(screen.getByRole('button', { name: /Simular ejecución/ }));
    expect(screen.getByTestId('task-task-rec-moc-001').textContent).toMatch(/En ejecución/);
    expect(inventoryTotals(store.getState())).toEqual(stock); // ejecutar aún no cambia el inventario
    await user.dblClick(screen.getByRole('button', { name: /Confirmar recepción/ })); // doble clic: una sola recepción
    expect(screen.getByTestId('task-task-rec-moc-001').textContent).toMatch(/Completado en simulación/);
    const s1 = store.getState();
    expect(inventoryTotals(s1).get('MOC-001')).toBe(300);
    expect(s1.remoteSites[0].stockBySku['MOC-001']).toBe(390);
    const ba = screen.getByTestId('before-after').textContent ?? '';
    expect(ba).toMatch(/600 u300 u90 u390 u/);
    expect(ba).toMatch(/60 d30 d6,9 d30 d/);
    expect(screen.getByTestId('ba-total').textContent).toMatch(/690 u → 690 u/);

    // El dashboard se recalcula; el traslado aparece en el historial.
    await nav('Dashboard');
    expect(screen.getByTestId('kpi-exposure').textContent).toBe('USD 0');
    await nav('Eventos');
    expect(within(screen.getByTestId('events-table')).getAllByText('Traslado').length).toBeGreaterThan(0);

    // Reinicio determinista.
    await user.click(screen.getByRole('button', { name: 'Reiniciar demo' }));
    const s = store.getState();
    expect([s.events, s.alerts, s.tasks, s.movements]).toEqual([[], [], [], []]);
    expect(s.remoteSites[0].stockBySku['MOC-001']).toBe(90);
    expect(s.purchaseOrders[0].status).toBe('EXPECTED');
    expect(screen.getByTestId('kpi-units').textContent).toBe('13.599');
  }, 30_000);

  it('Dashboard en vivo: cada caja leída (plan B Alt+1) entra al inventario contado y suben los totales', async () => {
    const store = createDemoStore();
    const user = userEvent.setup();
    render(<App store={store} />);
    expect(screen.getByTestId('live-boxes').textContent).toBe('0');
    expect(screen.getByTestId('live-units').textContent).toBe('0');
    expect(screen.getByTestId('live-table').textContent).toMatch(/Esperando la primera lectura/);
    expect(screen.getByTestId('live-pending').textContent).not.toMatch(/Cuaderno/); // el producto aún no se revela

    await user.keyboard('{Alt>}1{/Alt}');
    expect(screen.getByTestId('live-boxes').textContent).toBe('1');
    expect(screen.getByTestId('live-units').textContent).toBe('20');
    const table = screen.getByTestId('live-table');
    expect(table.textContent).toMatch(/Cuaderno universitario 100 h cuadros grandesCJ-000320 uB-05-03✓ Contada/);
    expect(screen.getByTestId('last-message').textContent).toMatch(/\(CJ-0003\) verificada en B-05-03/);

    await user.keyboard('{Alt>}{Shift>}2{/Shift}{/Alt}');
    expect(screen.getByTestId('live-boxes').textContent).toBe('2');
    expect(screen.getByTestId('live-pending').textContent).toMatch(/etiqueta 5\b/);
    expect(screen.getByTestId('live-units').textContent).toBe('82');
    expect(within(screen.getByTestId('live-table')).getAllByRole('row')[1].textContent).toMatch(/Esferográfico punta fina negro/); // la más reciente arriba
    expect(screen.getByTestId('live-table').textContent).toMatch(/Fuera de lugar/);
    await user.keyboard('{Alt>}3{/Alt}');
    expect(screen.getByTestId('live-boxes').textContent).toBe('3');
    expect(screen.getByTestId('live-units').textContent).toBe('100');
    await user.keyboard('{Alt>}4{/Alt}');
    expect(screen.getByTestId('live-boxes').textContent).toBe('4');
    expect(screen.getByTestId('live-units').textContent).toBe('139');
    await user.keyboard('{Alt>}5{/Alt}');
    expect(screen.getByTestId('live-boxes').textContent).toBe('5');
    expect(screen.getByTestId('live-units').textContent).toBe('253');
    expect(screen.queryByTestId('live-pending')).toBeNull();
    expect(within(screen.getByTestId('attention-list')).getByText('Discrepancia de ubicación')).toBeTruthy();
  });

  it('la navegación lateral abre cada sección', async () => {
    const user = userEvent.setup();
    render(<App store={createDemoStore()} />);
    const nav = (name: string) => user.click(within(screen.getByRole('navigation')).getByRole('button', { name: new RegExp(`^${name}`) }));
    for (const [name, id] of [['Gemelo digital', 'page-gemelo'], ['Inventario', 'page-inventario'], ['Eventos', 'page-eventos'],
      ['Analítica', 'page-analitica'], ['Acciones', 'page-acciones'], ['Dashboard', 'page-dashboard']] as const) {
      await nav(name);
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    await nav('Acciones');
    await user.click(screen.getByRole('tab', { name: /Tareas/ }));
    expect(screen.getByText('Las tareas aparecen al aprobar una recomendación.')).toBeTruthy();
  });

  it('Gemelo: elegir un producto de la lista lo enfoca y muestra su ficha (también pallets mixtos)', async () => {
    const store = createDemoStore();
    const user = userEvent.setup();
    render(<App store={store} />);
    await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Gemelo digital' }));
    const list = screen.getByTestId('stock-list');
    await user.type(within(list).getByLabelText('Buscar en el gemelo'), 'tinta');
    await user.click(within(list).getByRole('button', { name: /PAL-005/ }));
    expect(store.getState().ui.selectedUnitId).toBe('PAL-005');
    expect(store.getState().ui.focusSeq).toBeGreaterThan(0); // la cámara vuela al pallet
    expect(screen.getByTestId('unit-title').textContent).toBe('Cartucho de tinta negra original');
    expect(within(list).getByText('En foco')).toBeTruthy();

    const s = store.getState();
    const mixed = s.units.find((u) => !u.parentId && unitContents(s, u).kind === 'mixed')!;
    const input = within(list).getByLabelText('Buscar en el gemelo');
    await user.clear(input);
    await user.type(input, mixed.id);
    await user.click(within(list).getAllByRole('button', { name: new RegExp(mixed.id) })[0]);
    expect(screen.getByTestId('unit-title').textContent).toBe('Pallet mixto');
  });

  it('Inventario: filtra por verificación y "Ver en gemelo" enfoca el pallet', async () => {
    const store = createDemoStore();
    const user = userEvent.setup();
    render(<App store={store} />);
    await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Inventario' }));
    await user.type(screen.getByLabelText('Buscar producto'), 'PAL-001');
    const table = screen.getByTestId('inventory-table');
    expect(within(table).getByText('Pallet observado')).toBeTruthy();
    await user.click(within(table).getByRole('button', { name: 'Ver en gemelo' }));
    expect(store.getState().ui.section).toBe('gemelo');
    expect(store.getState().ui.selectedUnitId).toBe('PAL-001');
  });
});
