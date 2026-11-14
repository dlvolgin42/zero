"use client";

// Segmented control as a glass pill: a soft track with a glass thumb that slides to the chosen option.
export function PillSegmented<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="glass-track relative flex rounded-full p-1" role="tablist">
      <span className="glass-thumb absolute inset-y-1 left-1 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${idx * 100}%)` }} />
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className="relative z-10 h-9 flex-1 rounded-full text-[15px] font-medium text-[#111827]">{o.label}</button>
      ))}
    </div>
  );
}
