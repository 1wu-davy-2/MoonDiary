type Lantern = {
  id: number;
  x: number;
  label: string;
  drift: number;
};

export function LanternField({ lanterns }: { lanterns: Lantern[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden="true">
      {lanterns.map((lantern) => (
        <div
          key={lantern.id}
          className="lantern-rise absolute bottom-8"
          style={{
            left: `${lantern.x}%`,
            marginLeft: lantern.drift,
          }}
        >
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs tracking-brand text-accent">{lantern.label}</span>
            <LanternMark />
          </div>
        </div>
      ))}
    </div>
  );
}

function LanternMark() {
  return (
    <svg width="22" height="34" viewBox="0 0 22 34" fill="none" className="text-accent">
      <path d="M11 2v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 6h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M6 6.5h10c.4 2.8.9 6.2.9 8.6a5.9 5.9 0 1 1-11.8 0c0-2.4.5-5.8.9-8.6Z"
        fill="color-mix(in oklab, var(--color-accent) 78%, transparent)"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <path d="M8 13h6" stroke="var(--color-accent-fg)" strokeWidth="1" opacity="0.35" />
      <path d="M11 21.5v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export type { Lantern };
