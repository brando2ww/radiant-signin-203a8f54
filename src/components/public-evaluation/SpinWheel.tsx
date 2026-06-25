import { useState, useRef } from "react";
import type { CampaignPrize } from "@/hooks/use-campaign-prizes";
import { pickPrize } from "@/hooks/use-campaign-prizes";

const DEFAULT_PRIMARY = "#1a1a2e";
const DEFAULT_SECONDARY = "#722F37";

interface SpinWheelProps {
  prizes: CampaignPrize[];
  onResult: (prize: CampaignPrize) => void;
  disabled?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
}

export function SpinWheel({ prizes, onResult, disabled, primaryColor, secondaryColor }: SpinWheelProps) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const resultRef = useRef<CampaignPrize | null>(null);

  if (!prizes.length) return null;

  const pc = primaryColor || DEFAULT_PRIMARY;
  const sc = secondaryColor || DEFAULT_SECONDARY;

  const totalProb = prizes.reduce((s, p) => s + Number(p.probability), 0);
  const equalDeg = 360 / prizes.length;
  const segments = prizes.map((p, i) => ({
    ...p,
    startDeg: i * equalDeg,
    deg: equalDeg,
    wheelColor: i % 2 === 0 ? pc : sc,
  }));

  const gradient = segments
    .map((s) => `${s.wheelColor} ${s.startDeg}deg ${s.startDeg + s.deg}deg`)
    .join(", ");

  const handleSpin = () => {
    if (spinning || disabled) return;

    const winner = pickPrize(prizes);
    resultRef.current = winner;

    const seg = segments.find((s) => s.id === winner.id)!;
    const midAngle = seg.startDeg + seg.deg / 2;
    const targetAngle = 360 - midAngle;
    const extraSpins = 5 + Math.floor(Math.random() * 3);
    const finalRotation = rotation + extraSpins * 360 + targetAngle + (Math.random() * seg.deg * 0.6 - seg.deg * 0.3);

    setSpinning(true);
    setRotation(finalRotation);

    setTimeout(() => {
      setSpinning(false);
      onResult(winner);
    }, 4200);
  };

  const size = 320;
  const r = size / 2;

  // Build SVG segments and labels
  const svgSegments = segments.map((s) => {
    const startRad = ((s.startDeg - 90) * Math.PI) / 180;
    const endRad = ((s.startDeg + s.deg - 90) * Math.PI) / 180;
    const x1 = r + r * Math.cos(startRad);
    const y1 = r + r * Math.sin(startRad);
    const x2 = r + r * Math.cos(endRad);
    const y2 = r + r * Math.sin(endRad);
    const largeArc = s.deg > 180 ? 1 : 0;
    const path = `M ${r} ${r} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    // Position text along the spoke (radial line), reading from center outward
    const midAngleDeg = s.startDeg + s.deg / 2;
    const midAngleRad = ((midAngleDeg - 90) * Math.PI) / 180;

    // Position text at ~62% of radius (center of the readable area)
    const textR = r * 0.62;
    const tx = r + textR * Math.cos(midAngleRad);
    const ty = r + textR * Math.sin(midAngleRad);

    // Align text along the radius (reads from center → edge).
    let textRotation = midAngleDeg - 90;

    const fontSize = Math.max(11, Math.min(15, s.deg / 3.5));

    // Truncate very long labels to fit inside the segment
    const maxChars = Math.max(8, Math.floor(s.deg / 2.2));
    const label = s.name.length > maxChars ? s.name.slice(0, maxChars - 1) + "…" : s.name;

    return (
      <g key={s.id}>
        <path d={path} fill={s.wheelColor} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        <text
          x={tx}
          y={ty}
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(${textRotation}, ${tx}, ${ty})`}
          fill="white"
          fontSize={fontSize}
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
          style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.9))" }}
        >
          {label}
        </text>
      </g>
    );
  });

  return (
    <div className="flex flex-col items-center gap-10">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Pointer at top */}
        <div className="absolute z-10" style={{ top: -14, left: "50%", transform: "translateX(-50%)" }}>
          <div className="w-0 h-0 border-l-[16px] border-l-transparent border-r-[16px] border-r-transparent border-t-[26px] border-t-red-500 drop-shadow-lg" />
        </div>

        {/* Wheel */}
        <div
          className="rounded-full shadow-2xl overflow-hidden"
          style={{
            width: size,
            height: size,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
            border: `6px solid ${pc}`,
          }}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {svgSegments}
            {/* Separator lines */}
            {segments.map((s) => {
              const rad = ((s.startDeg - 90) * Math.PI) / 180;
              return (
                <line
                  key={`line-${s.id}`}
                  x1={r}
                  y1={r}
                  x2={r + r * Math.cos(rad)}
                  y2={r + r * Math.sin(rad)}
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth="1.5"
                />
              );
            })}
          </svg>
        </div>

        {/* Center button */}
        <button
          onClick={handleSpin}
          disabled={spinning || disabled}
          className="absolute bg-white rounded-full shadow-xl border-4 font-bold text-xs text-primary hover:scale-105 active:scale-95 transition-transform disabled:opacity-50"
          style={{
            width: size * 0.2,
            height: size * 0.2,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            borderColor: pc,
          }}
        >
          {spinning ? "..." : "GIRAR"}
        </button>

        {/* Decorative dots */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i * 15 * Math.PI) / 180;
          const dotR = r + 4;
          const dx = r + dotR * Math.sin(angle) - 3;
          const dy = r - dotR * Math.cos(angle) - 3;
          return (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full"
              style={{
                left: dx,
                top: dy,
                backgroundColor: i % 2 === 0 ? pc : "#fff",
              }}
            />
          );
        })}
      </div>

      {!spinning && (
        <button
          onClick={handleSpin}
          disabled={spinning || disabled}
          className="mt-4 px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-lg shadow-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 animate-bounce"
        >
          Girar Roleta!
        </button>
      )}
    </div>
  );
}
