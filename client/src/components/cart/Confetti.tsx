import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const COLORS = ['#F2A93B', '#0E5E5A', '#D6453D', '#1F8A5B', '#F6C877'];

/** One subtle burst of lantern-coloured confetti. Nothing renders with prefers-reduced-motion. */
export function Confetti({ pieces = 28 }: { pieces?: number }) {
  const reduce = useReducedMotion();
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        x: (Math.random() - 0.5) * 520,
        y: 160 + Math.random() * 220,
        r: (Math.random() - 0.5) * 540,
        d: 1.4 + Math.random() * 0.9,
        delay: Math.random() * 0.25,
        size: 6 + Math.round(Math.random() * 5),
        round: i % 3 === 0,
        color: COLORS[i % COLORS.length],
      })),
    [pieces],
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-10 flex justify-center overflow-visible" aria-hidden>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{ width: b.size, height: b.round ? b.size : b.size * 0.45, background: b.color, borderRadius: b.round ? 999 : 2 }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.6 }}
          animate={{ x: b.x, y: [0, -120 - Math.abs(b.x) * 0.2, b.y], opacity: [1, 1, 0], rotate: b.r, scale: 1 }}
          transition={{ duration: b.d, delay: b.delay, ease: [0.2, 0.8, 0.2, 1] }}
        />
      ))}
    </div>
  );
}
