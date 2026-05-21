import { useEffect } from "react";

/**
 * Global guard for the well-known Radix UI bug where `pointer-events: none`
 * (and sometimes `overflow: hidden`) gets stuck on <body> after a Dialog/Sheet
 * closes — especially when opened from another Dialog/DropdownMenu, or when
 * unmounted abruptly (route change, rapid open/close).
 *
 * We observe <body> style mutations. Whenever `pointer-events: none` is set
 * but no Radix overlay is actually open in the DOM, we clear it.
 */
export function RadixBodyUnlock() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;

    const hasOpenOverlay = () =>
      !!document.querySelector(
        [
          '[data-radix-popper-content-wrapper]',
          '[role="dialog"][data-state="open"]',
          '[role="alertdialog"][data-state="open"]',
          '[data-state="open"][data-radix-dialog-overlay]',
          '[data-state="open"][data-radix-sheet-overlay]',
          '[data-state="open"][data-radix-popover-content]',
          '[data-state="open"][data-radix-menu-content]',
        ].join(','),
      );

    let raf = 0;
    const unlockIfOrphan = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // Double-rAF: wait one more frame so Radix has time to finish exit animation
        raf = requestAnimationFrame(() => {
          if (hasOpenOverlay()) return;
          if (body.style.pointerEvents === "none") {
            body.style.pointerEvents = "";
          }
          // Radix Dialog locks scroll via inline overflow:hidden. Clear if orphan.
          if (body.style.overflow === "hidden" && !body.hasAttribute("data-scroll-locked")) {
            body.style.overflow = "";
          }
        });
      });
    };

    const observer = new MutationObserver(unlockIfOrphan);
    observer.observe(body, {
      attributes: true,
      attributeFilter: ["style", "data-scroll-locked"],
    });

    // Initial sweep on mount (cleans up state left from a previous render/HMR)
    unlockIfOrphan();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
