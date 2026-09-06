import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";

export const isNative = Capacitor.isNativePlatform();

/**
 * Tactile physical haptics for Android and mobile.
 * Falls back seamlessly to navigator.vibrate on mobile browsers.
 */
export async function triggerHaptic(
  type: "light" | "medium" | "heavy" | "success" | "warning" | "error" = "light"
): Promise<void> {
  try {
    if (isNative) {
      if (type === "light") {
        await Haptics.impact({ style: ImpactStyle.Light });
      } else if (type === "medium") {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } else if (type === "heavy") {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } else if (type === "success") {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (type === "warning") {
        await Haptics.notification({ type: NotificationType.Warning });
      } else if (type === "error") {
        await Haptics.notification({ type: NotificationType.Error });
      }
    } else if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      const dur = type === "light" ? 15 : type === "medium" ? 30 : type === "heavy" ? 50 : 40;
      navigator.vibrate(dur);
    }
  } catch {
    // Graceful fallback if haptics hardware not permitted
  }
}

/**
 * Android Hardware Back Button listener.
 * Handler returns true if it handled the back press (e.g. closed a modal),
 * or false if default back behavior should occur.
 */
export function initHardwareBackButton(onBack: () => boolean): () => void {
  if (!isNative) return () => {};

  const handle = CapApp.addListener("backButton", () => {
    const handled = onBack();
    if (!handled) {
      // If at root and no modals, minimize app
      CapApp.minimizeApp();
    }
  });

  return () => {
    handle.then((h) => h.remove()).catch(() => {});
  };
}

/**
 * Configure edge-to-edge immersive status bar for Android
 */
export async function configureStatusBar(isDark: boolean, bgHex = "#080b09"): Promise<void> {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: bgHex });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // Ignore on unsupported platforms
  }
}
