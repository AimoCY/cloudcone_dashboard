import { useSyncExternalStore } from "react";

// Tiny global theme store — light by default, persisted to localStorage.
let dark = localStorage.getItem("theme") === "dark";
const listeners = new Set<() => void>();

function apply(): void {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}
apply();

export function setDark(value: boolean): void {
  dark = value;
  localStorage.setItem("theme", value ? "dark" : "light");
  apply();
  listeners.forEach((l) => l());
}

export function useDark(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => dark,
  );
}
