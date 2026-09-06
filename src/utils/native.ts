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
 * Initialize system bar insets and safe area measurements for Android.
 * Sets --status-bar-height on :root so content never collides with notches or system status bars.
 */
export async function initNativeSystemBars(): Promise<void> {
  if (!isNative) return;
  try {
    // Prevent webview from drawing behind the Android status bar
    await StatusBar.setOverlaysWebView({ overlay: false });
    // Default safe status bar height on modern notch/punch-hole Android devices is 40-44px
    document.documentElement.style.setProperty("--status-bar-height", "44px");
  } catch {
    document.documentElement.style.setProperty("--status-bar-height", "44px");
  }
}

/**
 * Configure immersive status bar for Android.
 * Inverts status bar icons (light vs dark) based on active theme for perfect contrast
 * and applies matching background color.
 */
export async function configureStatusBar(isDark: boolean, bgColor?: string): Promise<void> {
  if (!isNative) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    const bg = bgColor || (isDark ? "#121816" : "#ffffff");
    await StatusBar.setBackgroundColor({ color: bg });
  } catch {
    // Graceful fallback
  }
}
