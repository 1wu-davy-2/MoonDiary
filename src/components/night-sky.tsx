function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260925);
const STARS = Array.from({ length: 72 }, () => ({
  x: rng() * 100,
  y: rng() * 72,
  size: rng() * 1.6 + 0.4,
  delay: rng() * 4,
  duration: 2.8 + rng() * 2.4,
  opacity: 0.35 + rng() * 0.5,
}));

export function NightSky() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {STARS.map((star, i) => (
        <span
          key={i}
          className="star absolute rounded-full bg-fg"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
          }}
        />
      ))}
      <div className="moon-wash" />
      <div className="sky-horizon" />
    </div>
  );
}
