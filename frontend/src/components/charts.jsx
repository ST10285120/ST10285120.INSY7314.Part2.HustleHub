import { useId, useState } from 'react';
import { formatPrice } from '../utils/format';

/*
 * Small dependency-free SVG charts. They use no inline <style> or scripts, so
 * they work under the app's strict Content Security Policy, and every chart
 * has a text/table equivalent so no value is available only as colour.
 */

const monthFormatter = new Intl.DateTimeFormat('en-ZA', { month: 'short', timeZone: 'UTC' });
const monthYearFormatter = new Intl.DateTimeFormat('en-ZA', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function monthLabel(key, long = false) {
  const date = new Date(`${key}-01T00:00:00Z`);
  return (long ? monthYearFormatter : monthFormatter).format(date);
}

/** A "nice" axis maximum: 1, 2, 2.5 or 5 x a power of ten. */
export function niceMax(value) {
  if (!value || value <= 0) return 1000;
  const power = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find((s) => s * power >= value);
  return step * power;
}

function compactRand(n) {
  if (n >= 1000000) return `R${(n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1)}m`;
  if (n >= 1000) return `R${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `R${n}`;
}

/** Bar path with 4px rounded top corners, square at the baseline. */
function topRoundedBar(x, y, w, h, r = 4) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return [
    `M${x},${y + h}`,
    `V${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `H${x + w - rr}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `V${y + h}`,
    'Z',
  ].join(' ');
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div className="viz-tooltip" role="status" style={{ left: `${tip.xPct}%`, top: `${tip.yPct}%` }}>
      <strong>{tip.value}</strong>
      <span>{tip.label}</span>
    </div>
  );
}

/**
 * Monthly income, last 12 months. Single series, so no legend - the heading
 * names it. Each bar (plus its full-height column) is the hover/focus target.
 */
export function MonthlyIncomeChart({ data }) {
  const [tip, setTip] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const titleId = useId();

  const width = 640;
  const height = 240;
  const pad = { top: 16, right: 8, bottom: 28, left: 52 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.total), 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const slot = plotW / data.length;
  const barW = Math.min(36, slot - 2); // >= 2px gap between bars
  const total = data.reduce((sum, d) => sum + d.total, 0);

  function show(d, i) {
    const barH = (d.total / max) * plotH;
    setTip({
      xPct: ((pad.left + slot * i + slot / 2) / width) * 100,
      yPct: ((pad.top + plotH - barH) / height) * 100,
      value: formatPrice(d.total),
      label: `${monthLabel(d.month, true)} · ${d.count} ${d.count === 1 ? 'payment' : 'payments'}`,
    });
  }

  return (
    <figure className="viz-root viz-figure">
      <div className="viz-head">
        <figcaption id={titleId}>Income per month (last 12 months)</figcaption>
        <button type="button" className="text-button" onClick={() => setShowTable((s) => !s)}>
          {showTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {showTable ? (
        <div className="table-wrap">
          <table className="bookings-table">
            <caption className="visually-hidden">Income per month</caption>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Payments</th>
                <th scope="col">Income</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month}>
                  <td>{monthLabel(d.month, true)}</td>
                  <td>{d.count}</td>
                  <td>{formatPrice(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="viz-plot" onMouseLeave={() => setTip(null)}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-labelledby={titleId}
            aria-describedby={`${titleId}-desc`}
            className="viz-svg"
          >
            <desc id={`${titleId}-desc`}>
              {`Total ${formatPrice(total)} over 12 months. Highest month: ${
                total > 0
                  ? monthLabel(data.reduce((a, b) => (b.total > a.total ? b : a)).month, true)
                  : 'none'
              }.`}
            </desc>
            {ticks.map((t) => {
              const y = pad.top + plotH - (t / max) * plotH;
              return (
                <g key={t}>
                  <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="viz-grid" />
                  <text x={pad.left - 8} y={y + 4} textAnchor="end" className="viz-axis-label">
                    {compactRand(t)}
                  </text>
                </g>
              );
            })}
            {data.map((d, i) => {
              const barH = (d.total / max) * plotH;
              const x = pad.left + slot * i + (slot - barW) / 2;
              const y = pad.top + plotH - barH;
              return (
                <g
                  key={d.month}
                  tabIndex={0}
                  className="viz-hit"
                  aria-label={`${monthLabel(d.month, true)}: ${formatPrice(d.total)}`}
                  onMouseEnter={() => show(d, i)}
                  onFocus={() => show(d, i)}
                  onBlur={() => setTip(null)}
                >
                  {/* Full-height transparent column: hit target bigger than the mark */}
                  <rect x={pad.left + slot * i} y={pad.top} width={slot} height={plotH} className="viz-hit-area" />
                  {barH > 0 && <path d={topRoundedBar(x, y, barW, barH)} className="viz-bar" />}
                  <text
                    x={pad.left + slot * i + slot / 2}
                    y={height - 8}
                    textAnchor="middle"
                    className="viz-axis-label"
                  >
                    {monthLabel(d.month)}
                  </text>
                </g>
              );
            })}
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={pad.top + plotH}
              y2={pad.top + plotH}
              className="viz-baseline"
            />
          </svg>
          <Tooltip tip={tip} />
        </div>
      )}
    </figure>
  );
}

/** Income by gig category: horizontal bars, values labelled directly. */
export function CategoryBars({ data }) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const max = Math.max(...data.map((d) => d.total), 1);

  if (data.length === 0) return <p className="empty-state">No income by category yet.</p>;

  return (
    <ul className="viz-root category-bars" aria-label="Income by category">
      {data.map((d) => {
        const share = total > 0 ? Math.round((d.total / total) * 100) : 0;
        return (
          <li key={d.category}>
            <div className="category-bar-label">
              <span>{d.category}</span>
              <span className="category-bar-value">
                <strong>{formatPrice(d.total)}</strong> · {share}%
              </span>
            </div>
            <svg width="100%" height="8" className="category-bar-track" aria-hidden="true">
              <rect x="0" y="0" width="100%" height="8" rx="4" className="viz-track" />
              <rect x="0" y="0" width={`${Math.max((d.total / max) * 100, 2)}%`} height="8" rx="4" className="viz-bar" />
            </svg>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Where this year's income goes: take-home, estimated tax, expenses.
 * Three categorical slots, with a legend and direct values (identity is never
 * colour-alone), separated by 2px surface gaps.
 */
export function IncomeSplitBar({ takeHome, tax, expenses }) {
  const segments = [
    { key: 'take-home', label: 'Take-home (after tax)', value: Math.max(takeHome, 0), cls: 'viz-s1' },
    { key: 'tax', label: 'Estimated tax', value: Math.max(tax, 0), cls: 'viz-s2' },
    { key: 'expenses', label: 'Business expenses', value: Math.max(expenses, 0), cls: 'viz-s3' },
  ];
  const total = segments.reduce((s, x) => s + x.value, 0);
  const width = 600;
  const gap = 2;

  let cursor = 0;
  const visible = segments.filter((s) => s.value > 0);
  const usable = width - gap * Math.max(visible.length - 1, 0);

  return (
    <div className="viz-root income-split">
      {total > 0 ? (
        <svg viewBox={`0 0 ${width} 24`} className="viz-svg" role="img" aria-label="Split of income this tax year">
          {visible.map((s) => {
            const w = (s.value / total) * usable;
            const rect = <rect key={s.key} x={cursor} y="0" width={w} height="24" rx="4" className={s.cls} />;
            cursor += w + gap;
            return rect;
          })}
        </svg>
      ) : (
        <p className="empty-state">No income recorded in this tax year yet.</p>
      )}
      <ul className="viz-legend">
        {segments.map((s) => (
          <li key={s.key}>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
              <rect width="12" height="12" rx="3" className={s.cls} />
            </svg>
            <span>{s.label}</span>
            <strong>{formatPrice(s.value)}</strong>
            {total > 0 && <span className="viz-muted">{Math.round((s.value / total) * 100)}%</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
