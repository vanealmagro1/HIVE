// @vitest-environment jsdom
// Recorrido completo de la demo con clics reales sobre la UI. jsdom no tiene WebGL, por lo que
// este test ejercita la vista 2D de respaldo (mismas acciones y mismo estado que el 3D).
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';
import { createDemoStore } from './store/demoStore';
import { inventoryTotals } from './store/demoState';

afterEach(cleanup);

describe('App · recorrido de 90 s (fallback 2D)', () => {
  it('banner, selección, evento, alerta, predicción, aprobación, idempotencia y reset', async () => {
    const store = createDemoStore();
    const user = userEvent.setup();
    render(<App store={store} />);

    expect(screen.getByTestId('sim-banner').textContent).toBe('ENTORNO DE SIMULACIÓN · DATOS SINTÉTICOS');
    expect(screen.getByTestId('warehouse-2d')).toBeTruthy();
    const stockBefore = inventoryTotals(store.getState());

    // 1. Seleccionar PAL-001
    await user.click(screen.getByRole('button', { name: /1 · Seleccionar PAL-001/ }));
    const unitPanel = screen.getByTestId('unit-panel');
    expect(within(unitPanel).getByText(/Pallet PAL-001/)).toBeTruthy();
    expect(within(unitPanel).getByText(/LOC-A1 · Zona A · Rack A1 · nivel 1/)).toBeTruthy();
    expect(within(unitPanel).getByText(/SKU-A/)).toBeTruthy();

    // 2. Evento simulado
    await user.click(screen.getByRole('button', { name: /2 · Ejecutar evento simulado/ }));
    const alert = screen.getByTestId('alert-alert-demo-001');
    expect(within(alert).getByText(/PRIORIDAD ALTA/)).toBeTruthy();
    expect(within(alert).getByText(/PENDIENTE DE VERIFICACIÓN/)).toBeTruthy();
    expect(within(alert).getAllByText('SIMULATED').length).toBeGreaterThan(0);
    expect(screen.getByText(/Observación de PAL-001 \(evidencia simulada\)/)).toBeTruthy(); // marcador en LOC-B2 (2D)

    // Reenvío idempotente
    await user.click(screen.getByRole('button', { name: /Reenviar evento/ }));
    expect(screen.getByTestId('last-message').textContent).toMatch(/idempotente/);
    expect(store.getState().alerts).toHaveLength(1);
    expect(store.getState().events).toHaveLength(1);

    // 3. Predicción
    await user.click(screen.getByRole('button', { name: /3 · Ver predicción/ }));
    const a = screen.getByTestId('analytics-SKU-A');
    expect(within(a).getAllByText('60 días').length).toBeGreaterThan(0);
    expect(within(a).getByText('300 unidades')).toBeTruthy();
    expect(within(a).getAllByText('USD 2.400').length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('analytics-SKU-B')).getAllByText('USD 720').length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('analytics-SKU-C')).getByText('Sin datos suficientes para pronosticar')).toBeTruthy();

    // 4. Aprobar -> una sola tarea, stock intacto
    await user.click(screen.getByRole('button', { name: /4 · Aprobar recomendación/ }));
    expect(screen.getByTestId('task-task-rec-sku-a')).toBeTruthy();
    expect(store.getState().tasks).toHaveLength(1);
    expect(inventoryTotals(store.getState())).toEqual(stockBefore);
    expect((screen.getByRole('button', { name: /4 · Aprobar recomendación/ }) as HTMLButtonElement).disabled).toBe(true);

    // Reset
    await user.click(screen.getByRole('button', { name: /Reiniciar demo/ }));
    expect(store.getState().alerts).toEqual([]);
    expect(store.getState().tasks).toEqual([]);
    expect(store.getState().units.find((u) => u.id === 'PAL-001')!.observedLocationId).toBeNull();
    expect(screen.queryByText(/Observación de PAL-001/)).toBeNull();
  });

  it('el botón "Siguiente paso" recorre el guion completo', async () => {
    const store = createDemoStore();
    const user = userEvent.setup();
    render(<App store={store} />);
    const next = screen.getByRole('button', { name: /Siguiente paso/ });
    for (let i = 0; i < 5; i += 1) await user.click(next);
    const s = store.getState();
    expect(s.events.map((e) => e.id)).toEqual(['evt-demo-001']);
    expect(s.tasks.map((t) => t.id)).toEqual(['task-rec-sku-a']);
    expect((next as HTMLButtonElement).disabled).toBe(true);
  });

  it('seleccionar un pallet en la vista 2D abre su ficha', async () => {
    const user = userEvent.setup();
    render(<App store={createDemoStore()} />);
    await user.click(screen.getByRole('button', { name: /PAL-005/ }));
    const panel = screen.getByTestId('unit-panel');
    expect(within(panel).getByText(/Pallet PAL-005/)).toBeTruthy();
    expect(within(panel).getByText('2026-12-04')).toBeTruthy();
  });
});
