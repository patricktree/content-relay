import type { Container } from "dioma";
import { AsyncLocalStorage } from "node:async_hooks";

const diContainerStorage = new AsyncLocalStorage<Container>();

export function runWithDiContainer<T>(
  container: Container,
  callback: () => Promise<T>,
): Promise<T> {
  return diContainerStorage.run(container, callback);
}

export function getDiContainer(): Container {
  const container = diContainerStorage.getStore();

  if (!container) {
    throw new Error("No dependency container found in the current context");
  }

  return container;
}
