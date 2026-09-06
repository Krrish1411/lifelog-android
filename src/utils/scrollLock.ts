import { useEffect } from "react";

let activeLockCount = 0;

/**
 * Acquire a body scroll lock.
 * Uses reference counting so nested drawers/modals never prematurely unlock
 * or permanently freeze the page.
 */
export function lockBodyScroll(): void {
  activeLockCount++;
  if (activeLockCount === 1) {
    document.body.style.overflow = "hidden";
  }
}

/**
 * Release a body scroll lock.
 * When the last lock is released, restores normal scrolling on body.
 */
export function unlockBodyScroll(): void {
  activeLockCount = Math.max(0, activeLockCount - 1);
  if (activeLockCount === 0) {
    document.body.style.overflow = "";
  }
}

/**
 * Force unlock all body scroll locks (safety net).
 */
export function forceUnlockBodyScroll(): void {
  activeLockCount = 0;
  document.body.style.overflow = "";
}

/**
 * React hook that acquires a body scroll lock while `locked` is true.
 * Safely releases the lock when `locked` becomes false or when the component unmounts.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [locked]);
}
