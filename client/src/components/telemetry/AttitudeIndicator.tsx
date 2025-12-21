import { useEffect, useRef } from "react";

interface AttitudeIndicatorProps {
  pitch: number;
  roll: number;
  size?: number;
}

export function AttitudeIndicator({ pitch, roll, size = 150 }: AttitudeIndicatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const center = size / 2;
    const radius = size / 2 - 10;

    ctx.clearRect(0, 0, size, size);

    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((roll * Math.PI) / 180);

    const pitchOffset = (pitch / 90) * radius;

    const skyGradient = ctx.createLinearGradient(0, -radius, 0, pitchOffset);
    skyGradient.addColorStop(0, "#1e40af");
    skyGradient.addColorStop(1, "#3b82f6");

    const groundGradient = ctx.createLinearGradient(0, pitchOffset, 0, radius);
    groundGradient.addColorStop(0, "#92400e");
    groundGradient.addColorStop(1, "#78350f");

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = skyGradient;
    ctx.fillRect(-radius, -radius, radius * 2, radius + pitchOffset);

    ctx.fillStyle = groundGradient;
    ctx.fillRect(-radius, pitchOffset, radius * 2, radius - pitchOffset);

    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius, pitchOffset);
    ctx.lineTo(radius, pitchOffset);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    for (let i = -60; i <= 60; i += 10) {
      if (i === 0) continue;
      const y = pitchOffset - (i / 90) * radius;
      const lineWidth = i % 20 === 0 ? 30 : 15;
      ctx.beginPath();
      ctx.moveTo(-lineWidth, y);
      ctx.lineTo(lineWidth, y);
      ctx.stroke();
      
      if (i % 20 === 0) {
        ctx.fillStyle = "white";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(Math.abs(i).toString(), lineWidth + 15, y + 3);
        ctx.fillText(Math.abs(i).toString(), -lineWidth - 15, y + 3);
      }
    }

    ctx.restore();

    ctx.strokeStyle = "#00bcd4";
    ctx.lineWidth = 3;
    
    ctx.beginPath();
    ctx.moveTo(center - 45, center);
    ctx.lineTo(center - 20, center);
    ctx.lineTo(center - 15, center + 8);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(center + 45, center);
    ctx.lineTo(center + 20, center);
    ctx.lineTo(center + 15, center + 8);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(center, center, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#00bcd4";
    ctx.fill();

    ctx.strokeStyle = "#1e1e1e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, radius + 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "#00bcd4";
    ctx.lineWidth = 1;
    for (let i = 0; i < 360; i += 30) {
      const angle = (i - 90) * Math.PI / 180;
      const x1 = center + Math.cos(angle) * (radius - 5);
      const y1 = center + Math.sin(angle) * (radius - 5);
      const x2 = center + Math.cos(angle) * (radius + 2);
      const y2 = center + Math.sin(angle) * (radius + 2);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.moveTo(center, 15);
    ctx.lineTo(center - 8, 25);
    ctx.lineTo(center + 8, 25);
    ctx.closePath();
    ctx.fill();

  }, [pitch, roll, size]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-full border-2 border-border"
      />
      <div className="absolute -bottom-6 left-0 right-0 flex justify-center gap-4 text-xs font-mono">
        <span className="text-muted-foreground">P: <span className="text-primary">{pitch.toFixed(1)}°</span></span>
        <span className="text-muted-foreground">R: <span className="text-primary">{roll.toFixed(1)}°</span></span>
      </div>
    </div>
  );
}
