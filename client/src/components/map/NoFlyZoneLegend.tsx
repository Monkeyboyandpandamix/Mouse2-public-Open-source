interface NoFlyZoneLegendProps {
  className?: string;
}

export function NoFlyZoneLegend({ className = "" }: NoFlyZoneLegendProps) {
  return (
    <div
      className={`bg-card/85 backdrop-blur-md border border-border rounded-md px-2.5 py-2 shadow-lg text-xs ${className}`.trim()}
      data-testid="no-fly-legend"
    >
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-4 rounded-sm border border-red-500 bg-red-500/30" />
        <span className="font-medium">Restricted Airspace</span>
      </div>
    </div>
  );
}
