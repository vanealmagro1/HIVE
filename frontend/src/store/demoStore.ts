// Store en memoria del navegador (sin backend ni persistencia: recargar la página = estado semilla).
import { useSyncExternalStore } from 'react';
import { demoReducer, type DemoAction } from './demoReducer';
import { createInitialState, type DemoState } from './demoState';

export interface DemoStore {
  getState(): DemoState;
  dispatch(action: DemoAction): DemoState;
  subscribe(listener: () => void): () => void;
}

export function createDemoStore(initial: DemoState = createInitialState()): DemoStore {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(action) {
      const next = demoReducer(state, action);
      if (next !== state) {
        state = next;
        listeners.forEach((l) => l());
      }
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Instancia única usada por la aplicación. */
export const demoStore = createDemoStore();

export function useDemoState(store: DemoStore = demoStore): DemoState {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
