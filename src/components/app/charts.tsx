"use client";

// Charts follow the dataviz rules: thin marks with 4px rounded ends, one y-axis,
// recessive grid, legend only when there are 2+ series, hover tooltips on every mark,
// and text in text colours (never the series colour). Colours are validated tokens
// (--viz-*) defined in globals.css for light and dark.

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFormatter } from "next-intl";
import { useLocale } from "@/i18n/locale";
import { useMoney } from "./page-parts";

export interface SeriesPoint {
  key: string;
  label: string; // x-axis label
  date: Date;
  [series: string]: string | number | Date;
}

interface TooltipPayload {
  dataKey?: string | number;
  value?: number;
  color?: string;
  payload?: SeriesPoint;
}

function useCompactMoney() {
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-ZM", { notation: "compact", maximumFractionDigits: 1 });
  return (ngwee: number) => nf.format(ngwee / 100);
}

function ChartTooltip({
  active,
  payload,
  names,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  names: Record<string, string>;
}) {
  const money = useMoney();
  const format = useFormatter();
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {point && <p className="mb-1 font-medium text-popover-foreground">{format.dateTime(point.date, { weekday: "short", day: "numeric", month: "short" })}</p>}
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-sm" style={{ background: p.color }} />
          {names[String(p.dataKey)]}
          <span className="ml-auto pl-3 font-medium text-popover-foreground tabular">{money(Number(p.value ?? 0))}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Columns over time, one or two series sharing the money axis.
 * `series` order fixes colour: first = --viz-sales (or --viz-single when alone), second = --viz-profit.
 */
export function MoneyColumns({
  data,
  series,
  height = 220,
}: {
  data: SeriesPoint[];
  series: { key: string; name: string }[];
  height?: number;
}) {
  const compact = useCompactMoney();
  const colors = series.length === 1 ? ["var(--viz-single)"] : ["var(--viz-sales)", "var(--viz-profit)"];
  const names = Object.fromEntries(series.map((s) => [s.key, s.name]));
  // Thin bars: show fewer x labels when there are many days.
  const interval = data.length > 16 ? Math.ceil(data.length / 8) - 1 : data.length > 8 ? 1 : 0;

  return (
    <div className="w-full">
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: colors[i] }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval={interval}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tickFormatter={compact}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<ChartTooltip names={names} />} />
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} fill={colors[i]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Labelled horizontal bars (rankings, breakdowns). Identity is carried by the text label,
 * so a single colour is used; the value sits at the bar tip.
 */
export function BarList({
  rows,
  format,
  max,
}: {
  rows: { key: string; label: React.ReactNode; value: number; hint?: React.ReactNode }[];
  format: (v: number) => string;
  max?: number;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} title={`${typeof r.label === "string" ? r.label : ""} ${format(r.value)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 font-medium tabular">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full" style={{ width: `${Math.max((r.value / top) * 100, r.value > 0 ? 2 : 0)}%`, background: "var(--viz-single)" }} />
          </div>
          {r.hint && <p className="mt-0.5 text-xs text-muted-foreground">{r.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
