import { useEffect, useRef } from "react";

interface GyroscopeIndicatorProps {
  yaw: number;
  heading: number;
  size?: number;
}

export function GyroscopeIndicator({ yaw, heading, size = 150 }: GyroscopeIndicatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const center = size / 2;
    const radius = size / 2 - 15;

    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = "#1a1a2e";
    ctx.beginPath();
    ctx.arc(center, center, radius + 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((-heading * Math.PI) / 180);

    const directions = [
      { label: "N", angle: 0, color: "#ef4444" },
      { label: "E", angle: 90, color: "#ffffff" },
      { label: "S", angle: 180, color: "#ffffff" },
      { label: "W", angle: 270, color: "#ffffff" },
    ];

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    for (let i = 0; i < 360; i += 10) {
      const angle = (i * Math.PI) / 180;
      const innerR = i % 30 === 0 ? radius - 15 : radius - 8;
      const x1 = Math.sin(angle) * innerR;
      const y1 = -Math.cos(angle) * innerR;
      const x2 = Math.sin(angle) * radius;
      const y2 = -Math.cos(angle) * radius;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.font = "bold 14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    directions.forEach(({ label, angle, color }) => {
      const rad = (angle * Math.PI) / 180;
      const x = Math.sin(rad) * (radius - 25);
      const y = -Math.cos(rad) * (radius - 25);
      ctx.fillStyle = color;
      ctx.fillText(label, x, y);
    });

    ctx.font = "10px monospace";
    ctx.fillStyle = "#64748b";
    [30, 60, 120, 150, 210, 240, 300, 330].forEach(angle => {
      const rad = (angle * Math.PI) / 180;
      const x = Math.sin(rad) * (radius - 25);
      const y = -Math.cos(rad) * (radius - 25);
      ctx.fillText(angle.toString(), x, y);
    });

    ctx.restore();

    ctx.fillStyle = "#00bcd4";
    ctx.beginPath();
    ctx.moveTo(center, center - radius + 20);
    ctx.lineTo(center - 8, center - radius + 35);
    ctx.lineTo(center + 8, center - radius + 35);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(center, center, 20, 0, Math.PI * 2);
    ctx.fillStyle = "#1e293b";
    ctx.fill();
    ctx.strokeStyle = "#00bcd4";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((yaw * Math.PI) / 180);
    
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(-5, 15);
    ctx.lineTo(0, 10);
    ctx.lineTo(5, 15);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#64748b";
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.lineTo(-5, -15);
    ctx.lineTo(0, -10);
    ctx.lineTo(5, -15);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(center, center, radius + 5, 0, Math.PI * 2);
    ctx.stroke();

  }, [yaw, heading, size]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-full"
      />
      <div className="absolute -bottom-6 left-0 right-0 flex justify-center gap-4 text-xs font-mono">
        <span className="text-muted-foreground">HDG: <span className="text-primary">{heading.toFixed(0)}°</span></span>
      </div>
    </div>
  );
}
