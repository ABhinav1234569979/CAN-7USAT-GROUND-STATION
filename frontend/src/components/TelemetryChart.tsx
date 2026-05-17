interface TelemetryChartProps {
  data: Array<{ time: number; value: number }>;
  title?: string;
  color?: string;
  unit: string;
  height?: number;
}

const MAX_RENDER_POINTS = 500;

const downsample = (points: Array<{ time: number; value: number }>) => {
  if (points.length <= MAX_RENDER_POINTS) return points;

  const step = Math.ceil(points.length / MAX_RENDER_POINTS);
  return points.filter((_, index) => index % step === 0 || index === points.length - 1);
};

const formatValue = (value: number, unit: string) => {
  const abs = Math.abs(value);

  if (abs >= 100) return `${value.toFixed(0)} ${unit}`;
  if (abs >= 10) return `${value.toFixed(1)} ${unit}`;
  return `${value.toFixed(2)} ${unit}`;
};

const clampRange = (min: number, max: number) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: -1, max: 1 };
  }

  if (Math.abs(max - min) < 0.001) {
    const padding = Math.max(Math.abs(max) * 0.1, 1);
    return {
      min: min - padding,
      max: max + padding,
    };
  }

  const padding = Math.max((max - min) * 0.18, 1);

  return {
    min: min - padding,
    max: max + padding,
  };
};

export const TelemetryChart = ({
  data,
  color = '#22d3ee',
  unit,
}: TelemetryChartProps) => {
  const cleanData = downsample(
    data.filter(
      (point) =>
        Number.isFinite(point.time) &&
        Number.isFinite(point.value),
    ),
  );

  const hasData = cleanData.length >= 2;

  const latest = cleanData.at(-1)?.value ?? 0;
  const firstTime = cleanData[0]?.time ?? 0;
  const lastTime = cleanData.at(-1)?.time ?? firstTime + 1;

  const rawMin = Math.min(...cleanData.map((point) => point.value), 0);
  const rawMax = Math.max(...cleanData.map((point) => point.value), 1);
  const yRange = clampRange(rawMin, rawMax);

  const xRange = Math.max(lastTime - firstTime, 1);
  const ySpan = Math.max(yRange.max - yRange.min, 1);

  const width = 1000;
  const height = 220;
  const padLeft = 72;
  const padRight = 26;
  const padTop = 22;
  const padBottom = 34;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const toX = (time: number) => padLeft + ((time - firstTime) / xRange) * plotWidth;
  const toY = (value: number) => padTop + (1 - (value - yRange.min) / ySpan) * plotHeight;

  const linePoints = hasData
    ? cleanData.map((point) => `${toX(point.time).toFixed(1)},${toY(point.value).toFixed(1)}`).join(' ')
    : '';

  const areaPoints = hasData
    ? `${padLeft},${padTop + plotHeight} ${linePoints} ${padLeft + plotWidth},${padTop + plotHeight}`
    : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = yRange.max - ratio * ySpan;
    return {
      value,
      y: padTop + ratio * plotHeight,
    };
  });

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = firstTime + ratio * xRange;
    return {
      value,
      x: padLeft + ratio * plotWidth,
    };
  });

  if (!hasData) {
    return (
      <div className="mission-svg-chart empty">
        <div className="chart-empty-state">Waiting for telemetry history</div>
      </div>
    );
  }

  return (
    <div className="mission-svg-chart">
      <div className="chart-value-badge">
        <span>LIVE</span>
        <strong>{formatValue(latest, unit)}</strong>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img">
        <defs>
          <linearGradient id={`area-${unit}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.32" />
            <stop offset="72%" stopColor={color} stopOpacity="0.08" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>

          <filter id={`glow-${unit}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width={width} height={height} rx="18" className="chart-bg" />

        {yTicks.map((tick) => (
          <g key={`y-${tick.y}`}>
            <line
              x1={padLeft}
              x2={padLeft + plotWidth}
              y1={tick.y}
              y2={tick.y}
              className="chart-grid-line"
            />
            <text x="12" y={tick.y + 4} className="chart-axis-label">
              {formatValue(tick.value, unit)}
            </text>
          </g>
        ))}

        {xTicks.map((tick) => (
          <g key={`x-${tick.x}`}>
            <line
              x1={tick.x}
              x2={tick.x}
              y1={padTop}
              y2={padTop + plotHeight}
              className="chart-grid-line vertical"
            />
            <text x={tick.x - 14} y={height - 10} className="chart-axis-label x-label">
              {tick.value.toFixed(0)}s
            </text>
          </g>
        ))}

        <polygon points={areaPoints} fill={`url(#area-${unit})`} />

        <polyline
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#glow-${unit})`}
          vectorEffect="non-scaling-stroke"
        />

        <circle
          cx={toX(lastTime)}
          cy={toY(latest)}
          r="7"
          fill={color}
          stroke="#e0f2fe"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};
