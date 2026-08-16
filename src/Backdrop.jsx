import React, { useEffect, useRef } from "react";

/**
 * The page's background: a ruled field and a soft accent glow, both moving slower
 * than the content.
 *
 * Parallax on a reference table is a narrow opportunity. Anything that moves *with*
 * the reader's eye competes with the numbers, so the only thing moving here is a
 * layer behind everything, at a fraction of scroll speed, at an opacity where you
 * register depth rather than pattern. The grid is the graph paper the whole page is
 * ruled on; the glow is the one place the accent is allowed to be decorative.
 *
 * Three things keep it from costing anything:
 *
 * - It is `position: fixed`, so it never lengthens the document and cannot create
 *   the horizontal overflow the mobile checks watch for.
 * - It transforms on a rAF-throttled scroll listener, so a fast flick schedules one
 *   paint per frame rather than one per event.
 * - `prefers-reduced-motion` stops the movement outright, leaving the static field.
 *   Motion sickness is not a price worth paying for a background.
 */
export default function Backdrop() {
  const gridRef = useRef(null);
  const glowRef = useRef(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY || 0;
        if (gridRef.current) gridRef.current.style.transform = `translate3d(0, ${y * -0.18}px, 0)`;
        if (glowRef.current) glowRef.current.style.transform = `translate3d(0, ${y * -0.42}px, 0)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div aria-hidden="true" style={B.wrap}>
      <div ref={glowRef} style={B.glow} />
      <div ref={gridRef} style={B.grid} />
    </div>
  );
}

const B = {
  wrap: { position: "fixed", inset: 0, zIndex: -1, overflow: "hidden",
    pointerEvents: "none", background: "var(--paper)" },
  // Drawn as two gradients rather than an image: an 88px rule spacing is one line
  // of CSS, weighs nothing, and stays crisp at any density.
  grid: { position: "absolute", inset: "-20% 0 -20% 0",
    backgroundImage:
      "linear-gradient(to right, var(--grid-line) 1px, transparent 1px)," +
      "linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
    backgroundSize: "88px 88px", willChange: "transform" },
  glow: { position: "absolute", left: "50%", top: "-30vh", width: "120vw", height: "110vh",
    transform: "translate3d(0,0,0)", marginLeft: "-60vw", willChange: "transform",
    background: "radial-gradient(ellipse at 50% 0%, var(--glow) 0%, transparent 62%)" },
};
