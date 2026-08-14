// public/js/core/motion.mjs
export function prefersReducedMotion(windowRef = window) {
  return windowRef.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export async function revealRoute(element, windowRef = window) {
  for (const animation of element.getAnimations()) {
    animation.cancel();
  }

  if (prefersReducedMotion(windowRef) || typeof element.animate !== "function") {
    return;
  }

  const animation = element.animate(
    [
      { opacity: 0, transform: "translateY(0.75rem)", filter: "blur(4px)" },
      { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
    ],
    {
      duration: 360,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
      fill: "both",
    },
  );

  try {
    await animation.finished;
  } catch {
    // A newer navigation can intentionally cancel the previous animation.
  }
}
