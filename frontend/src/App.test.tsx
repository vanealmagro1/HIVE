// @vitest-environment jsdom
// HIVE UI v1.1 · recorrido de 6 pasos y navegación con clics reales. jsdom no tiene WebGL: se ejercita la
// vista 2D de respaldo (mismo estado y mismas acciones que el 3D). Lecturas "en vivo" a 1 ms por lectura.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { createDemoStore } from './store/demoStore';
import { inventoryTotals } from './store/demoState';
import { getScenario } from './engine/scenarios';

afterEach(cleanup);
const FAST = { receiptIntervalMs: 1, countIntervalMs: 1 };
const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
const T = { timeout: 20_000 };

describe('HIVE UI v1.1 · demo guiada de 6 pasos (vista 2D)', () => {
  it('Visualizar → Detectar → Alertar → Analizar → Recomendar → Registrar, con reinicio determinista', async () => {
    const store = createDemoStore();
    const user = userEvent.setup();
    render(<App store={store} playback={FAST} />);

    // Una sola etiqueta de simulación; KPIs derivados del estado.
    expect(screen.getAllByText('Demo simulada')).toHaveLength(1);
    expect(screen.getByTestId('kpi-units').textContent).toBe('13.599');
    expect(screen.getByTestId('kpi-alerts').textContent).toBe('0');
    expect(screen.getByTestId('kpi-exposure').textContent).toBe('USD 2.400');
    expect(screen.getByTestId('kpi-coverage').textContent).toBe('60 días');
    const before = total(inventoryTotals(store.getState()));

    // 1 · Visualizar: recibir camión por el portal RFID (cantidades consistentes: 288 esperadas, 264 leídas, 24 faltan).
    expect(screen.getByText('Paso 1 de 6')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Recibir camión/ }));
    const facts = await screen.findByTestId('receipt-result', {}, T);
    expect(facts.textContent).toMatch(/12esperadas · 288 u/);
    expect(facts.textContent).toMatch(/11detectadas · 264 u/);
    expect(facts.textContent).toMatch(/1faltante · 24 u/);
    expect(total(inventoryTotals(store.getState()))).toBe(before + 264);
    expect(screen.getByTestId('kpi-units').textContent).toBe('13.863');
    expect(screen.getByTestId('kpi-alerts').textContent).toBe('1');
    expect(screen.queryByRole('button', { name: /Recibir camión/ })).toBeNull(); // idempotente: ya no se ofrece

    // 2 · Detectar
    await user.click(screen.getByRole('button', { name: 'Paso siguiente' }));
    await user.click(screen.getByRole('button', { name: /Contar pasillo D/ }));
    const evidence = await screen.findByTestId('new-evidence', {}, T);
    expect(evidence.textContent).toMatch(/D-07-02/);
    const row = screen.getByTestId('product-row');
    expect(within(row).getByText('Mochila escolar básica')).toBeTruthy();
    expect(within(row).getByText('PAL-001')).toBeTruthy();
    const countLen = getScenario('DEMO_COUNT_P4').events.length;
    expect(store.getState().events).toHaveLength(14 + countLen);
    expect(new Set(store.getState().events.map((e) => e.id)).size).toBe(14 + countLen); // sin duplicados

    // 3 · Alertar: ubicación por verificar; la ubicación oficial no cambia.
    await user.click(screen.getByRole('button', { name: 'Paso siguiente' }));
    const compare = screen.getByTestId('loc-compare');
    expect(compare.textContent).toMatch(/Ubicación esperada.*B-03-01/);
    expect(compare.textContent).toMatch(/Ubicación detectada.*D-07-02/);
    expect(screen.getByText('Pendiente de verificación')).toBeTruthy();
    expect(store.getState().units.find((u) => u.id === 'PAL-001')!.expectedLocationId).toBe('B-03-01');
    expect(store.getState().alerts.map((a) => a.type).sort()).toEqual(['LOCATION_MISMATCH', 'RECEIPT_SHORTAGE']);
    expect(screen.getByTestId('kpi-alerts').textContent).toBe('2');

    // Detalle técnico en el drawer; Escape lo cierra.
    await user.click(screen.getByRole('button', { name: 'Ver detalle' }));
    expect(within(screen.getByTestId('detail-drawer')).getAllByText('SIMULATED').length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('detail-drawer')).toBeNull();

    // 4 · Analizar: escenario de sobrestock calculado (600 u, 10/día, 30 días, USD 8).
    await user.click(screen.getByRole('button', { name: 'Paso siguiente' }));
    const impact = screen.getByTestId('impact-facts');
    expect(impact.textContent).toMatch(/60 días/);
    expect(impact.textContent).toMatch(/300unidades excedentes/);
    expect(impact.textContent).toMatch(/USD 2.400/);

    // 5 · Recomendar: avanzar NO aprueba; solo el botón.
    await user.click(screen.getByRole('button', { name: 'Paso siguiente' }));
    expect(screen.getByTestId('rec-title').textContent).toBe('Redistribuir 300 unidades');
    expect(store.getState().recommendations.find((r) => r.id === 'rec-moc-001')!.status).toBe('PROPOSED');
    const stock = inventoryTotals(store.getState());
    await user.click(screen.getByRole('button', { name: 'Aprobar acción' }));
    expect(store.getState().recommendations.find((r) => r.id === 'rec-moc-001')!.status).toBe('APPROVED');
    expect(store.getState().tasks.map((t) => t.id)).toEqual(['task-rec-moc-001']);
    expect(inventoryTotals(store.getState())).toEqual(stock);

    // 6 · Registrar
    await user.click(screen.getByRole('button', { name: 'Paso siguiente' }));
    const summary = screen.getByTestId('task-summary');
    expect(summary.textContent).toMatch(/task-rec-moc-001/);
    expect(summary.textContent).toMatch(/Pendiente de ejecución/);
    await user.click(screen.getByRole('button', { name: 'Paso anterior' }));
    expect(screen.getByText('Paso 5 de 6')).toBeTruthy();

    // Reinicio determinista: sin tareas, alertas ni eventos; paso 1.
    await user.click(screen.getByRole('button', { name: 'Reiniciar demo' }));
    const s = store.getState();
    expect([s.events, s.alerts, s.tasks]).toEqual([[], [], []]);
    expect(s.ui.step).toBe(0);
    expect(s.purchaseOrders[0].status).toBe('EXPECTED');
    expect(screen.getByTestId('kpi-units').textContent).toBe('13.599');
    expect(screen.getByText('Paso 1 de 6')).toBeTruthy();
  }, 30_000);

  it('Registrar sin aprobar muestra la acción pendiente y ofrece volver al paso 5', async () => {
    const user = userEvent.setup();
    render(<App store={createDemoStore()} playback={FAST} />);
    await user.click(screen.getByRole('button', { name: '6 · Registrar' }));
    expect(screen.getByText('Acción pendiente de aprobación')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Volver al paso 5' }));
    expect(screen.getByText('Paso 5 de 6')).toBeTruthy();
  });

  it('la navegación lateral abre cada sección real (Reportes como vista pendiente)', async () => {
    const user = userEvent.setup();
    render(<App store={createDemoStore()} />);
    const nav = (name: string) => user.click(screen.getByRole('button', { name }));
    await nav('Inventario');
    expect(screen.getByTestId('inventory-panel')).toBeTruthy();
    await nav('Eventos');
    expect(screen.getByTestId('rfid-panel')).toBeTruthy();
    expect(screen.getByTestId('alerts-panel')).toBeTruthy();
    await nav('Analítica');
    expect(screen.getByTestId('analytics-panel')).toBeTruthy();
    expect(screen.getByTestId('measure-panel')).toBeTruthy();
    await nav('Reportes');
    expect(screen.getByText('Esta sección aún no está disponible en la demo.')).toBeTruthy();
    await nav('Resumen');
    expect(screen.getByTestId('step-panel')).toBeTruthy();
  });

  it('Gemelo digital: un pallet se identifica por su producto y un pallet mixto muestra su desglose', async () => {
    const user = userEvent.setup();
    render(<App store={createDemoStore()} />);
    await user.click(screen.getByRole('button', { name: 'Gemelo digital' }));
    await user.click(screen.getByRole('button', { name: /^PAL-005 · Cartucho de tinta negra original/ }));
    expect(screen.getByTestId('unit-title').textContent).toBe('Cartucho de tinta negra original');
    expect(within(screen.getByTestId('unit-panel')).getByText(/2026-12-04/)).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: /· Pallet mixto ·/ })[0]);
    expect(screen.getByTestId('unit-title').textContent).toBe('Pallet mixto');
    expect(screen.getByTestId('mix-lines').children.length).toBeGreaterThanOrEqual(2);
  });
});
