// @vitest-environment jsdom
// Recorrido completo de la demo con clics reales sobre la UI. jsdom no tiene WebGL, por lo que
// este test ejercita la vista 2D de respaldo (mismas acciones y mismo estado que el 3D).
// Las lecturas "en vivo" se reproducen a 1 ms por lectura para que el test sea rápido.
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

describe('App · recorrido de 90 s en 4 fases (fallback 2D)', () => {
  it('Detectar (recepción RFID + conteo), Priorizar, Actuar y Medir; idempotencia y reset', async () => {
    const store = createDemoStore();
    const user = userEvent.setup();
    render(<App store={store} playback={FAST} />);

    expect(screen.getByTestId('sim-banner').textContent).toBe('ENTORNO DE SIMULACIÓN · DATOS SINTÉTICOS');
    expect(screen.getByTestId('warehouse-2d')).toBeTruthy();
    expect(screen.getByTestId('kpi-units').textContent).toBe('13.599');
    const before = total(inventoryTotals(store.getState()));

    // 1 · Detectar: el camión pasa por el portal RFID; el inventario sube solo con lo leído.
    await user.click(screen.getByRole('button', { name: /1 · Recibir camión/ }));
    const result = await screen.findByTestId('receipt-result', {}, { timeout: 20_000 });
    expect(result.textContent).toMatch(/11 de 12 cajas\. Falta 1 caja · 24 u · USD 86,40/);
    expect(total(inventoryTotals(store.getState()))).toBe(before + 264);
    expect(screen.getByTestId('kpi-units').textContent).toBe('13.863');

    // 2 · Detectar: conteo del pasillo 4 con lector de mano.
    await user.click(screen.getByRole('button', { name: /2 · Contar pasillo 4/ }));
    const alert = await screen.findByTestId('alert-alert-demo-001', {}, { timeout: 20_000 });
    expect(within(alert).getByText(/PRIORIDAD ALTA/)).toBeTruthy();
    expect(within(alert).getByText(/PAL-001 se leyó fuera de su ubicación/)).toBeTruthy();
    expect(within(screen.getByTestId('alert-alert-oc-2026-1187')).getByText(/Faltan 1 de 12 cajas/)).toBeTruthy();
    expect(screen.getByText(/Leído aquí: PAL-001/)).toBeTruthy(); // marcador en P4-D02-N2 (2D)
    const countLen = getScenario('DEMO_COUNT_P4').events.length;
    expect(store.getState().events).toHaveLength(14 + countLen);

    // Reenvío idempotente de la lectura clave
    await user.click(screen.getByRole('button', { name: /Reenviar lectura/ }));
    expect(screen.getByTestId('last-message').textContent).toMatch(/idempotente/);
    expect(store.getState().events).toHaveLength(14 + countLen);
    expect(store.getState().alerts).toHaveLength(2);

    // 3-4 · Priorizar
    expect(screen.getByRole('tab', { name: /Alertas/ }).getAttribute('aria-selected')).toBe('true');
    await user.click(screen.getByRole('button', { name: /4 · Ver predicción/ }));
    const a = screen.getByTestId('analytics-MOC-001');
    expect(within(a).getAllByText('60 días').length).toBeGreaterThan(0);
    expect(within(a).getByText('300 unidades')).toBeTruthy();
    expect(within(a).getAllByText('USD 2.400').length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('analytics-TIN-001')).getAllByText('USD 720').length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('analytics-CAL-001')).getByText('Sin datos suficientes para pronosticar')).toBeTruthy();

    // 5 · Actuar: aprobar crea tareas (reclamo + mochilas) y no cambia el stock
    const stock = inventoryTotals(store.getState());
    await user.click(screen.getByRole('button', { name: /5 · Aprobar acciones/ }));
    expect(screen.getByTestId('task-task-rec-moc-001')).toBeTruthy();
    expect(store.getState().tasks.map((t) => t.id).sort()).toEqual(['task-rec-claim-oc-2026-1187', 'task-rec-moc-001']);
    expect(inventoryTotals(store.getState())).toEqual(stock);

    // 6 · Medir
    await user.click(screen.getByRole('button', { name: /6 · Ver resultados/ }));
    const m = screen.getByTestId('measure-panel');
    expect(within(m).getByText('11 / 12')).toBeTruthy();
    expect(within(m).getByText('2 tareas')).toBeTruthy();
    expect(screen.getByText('Completado')).toBeTruthy();

    // Reset
    await user.click(screen.getByRole('button', { name: /Reiniciar demo/ }));
    const s = store.getState();
    expect(s.alerts).toEqual([]);
    expect(s.tasks).toEqual([]);
    expect(s.events).toEqual([]);
    expect(s.purchaseOrders[0].status).toBe('EXPECTED');
    expect(s.units.find((u) => u.id === 'PAL-001')!.observedLocationId).toBe('P2-I03-N1');
    expect(screen.queryByText(/Leído aquí: PAL-001/)).toBeNull();
    expect(screen.getByTestId('kpi-units').textContent).toBe('13.599');
  }, 30_000);

  it('el botón "Siguiente paso" recorre el guion completo', async () => {
    const store = createDemoStore();
    const user = userEvent.setup();
    render(<App store={store} playback={FAST} />);
    const next = screen.getByRole('button', { name: /Siguiente paso/ });
    await user.click(next); // recepción
    await screen.findByTestId('receipt-result', {}, { timeout: 20_000 });
    await user.click(next); // conteo
    await screen.findByTestId('alert-alert-demo-001', {}, { timeout: 20_000 });
    for (let i = 0; i < 4; i += 1) await user.click(next);
    const s = store.getState();
    expect(s.purchaseOrders[0].status).toBe('CLOSED');
    expect(s.events.some((e) => e.id === 'evt-demo-001')).toBe(true);
    expect(s.tasks).toHaveLength(2);
    expect(s.ui.view).toBe('measure');
    expect((next as HTMLButtonElement).disabled).toBe(true);
  }, 30_000);

  it('clic en una ubicación de la vista 2D abre la ficha del pallet', async () => {
    const user = userEvent.setup();
    render(<App store={createDemoStore()} />);
    await user.click(screen.getByRole('button', { name: /^PAL-005/ }));
    const panel = screen.getByTestId('unit-panel');
    expect(within(panel).getByText(/Pallet PAL-005/)).toBeTruthy();
    expect(within(panel).getByText(/2026-12-04/)).toBeTruthy();
  });
});
