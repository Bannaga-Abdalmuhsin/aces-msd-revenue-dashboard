import { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
  ComposedChart,
} from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { buildDashboardData, DATA_UPDATED_EVENT, loadRevenueData, parseRevenueFile, saveRevenueData } from '@/lib/local-revenue-data';
import logoUrl from '@assets/MSD_Logo_1785945599981.png';
import riyalSignUrl from '@assets/riyal-sign.png';

// ── Brand palette – strict ACES Navy · Red · Slate theme ─────────────
const C = {
  navy:      '#122E64',   // ACES Navy — primary brand colour
  medBlue:   '#485D86',   // Medium blue — Collected series
  mutedBlue: '#6F82A6',   // Muted blue shade
  red:       '#EF1E34',   // ACES Red — negative / warnings
  redDark:   '#9C1C2A',   // ACES Red Dark — hover
  critDark:  '#B51226',   // Critical dark red — Overdue
  charcoal:  '#303846',   // Charcoal — primary text / Net Revenue chart
  slate:     '#7B8495',   // Slate — muted / secondary
  light:     '#F4F5F7',   // Page background
  border:    '#D9DEE7',   // Card & input borders
  navyTint:  '#E7EAF0',   // Light grey track / tint
  white:     '#FFFFFF',
};

// ── Formatters ───────────────────────────────────────────────────────
/** Numeric-only, 2 decimal places – used by RiyalAmt and string contexts */
function fmtNum(n: number): string {
  if (!isFinite(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** For chart tooltips / string-only contexts */
function fmtSARStr(n: number): string { return `${fmtNum(n)}`; }

/** Inline riyal-sign + number, rendered as JSX everywhere */
function RiyalAmt({ n, style }: { n: number; style?: React.CSSProperties }) {
  return (
    <span className="inline-flex items-center gap-0.5" style={style}>
      <img src={riyalSignUrl} alt="﷼" className="inline-block"
           style={{ height: '0.9em', width: 'auto', verticalAlign: 'middle', filter: 'brightness(0) saturate(100%)' }} />
      {fmtNum(n)}
    </span>
  );
}
/** Compact numeric for chart axes only (no SAR prefix, 0 decimals) */
function fmtAxis(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}
function fmtPct(n: number): string { return `${Math.min(n, 999).toFixed(1)}%`; }
function fmtMonth(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
function shortName(n: string): string {
  return n
    .replace('ACES - NHP MS Project  O&M', 'NHP O&M')
    .replace('Diesel Compensation', 'Diesel');
}

// ── Micro helpers ─────────────────────────────────────────────────────
const Loading = () => (
  <div className="flex items-center justify-center h-32">
    <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
         style={{ borderColor: `${C.red} transparent ${C.red} ${C.red}` }} />
  </div>
);

// ── KPI Card ──────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueColor?: string;
  icon?: React.ReactNode;
  tooltip?: string;
}
function KpiCard({ label, value, sub, valueColor = C.charcoal, icon, tooltip }: KpiCardProps) {
  return (
    <div className="bg-white rounded-md flex flex-col gap-1 p-3 min-w-0" title={tooltip} style={{
      border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${C.red}`,
      boxShadow: '0 1px 3px rgba(18,46,100,0.06)',
      cursor: tooltip ? 'help' : undefined,
    }}>
      <div className="flex items-center gap-1.5">
        {icon && <span className="flex-shrink-0 opacity-60">{icon}</span>}
        <p className="text-[10px] font-semibold uppercase tracking-wider truncate"
           style={{ color: C.navy }}>{label}</p>
      </div>
      <div className="font-bold leading-tight break-all"
         style={{
           color: valueColor,
           fontSize: 'clamp(0.6rem, 1.1vw, 0.8rem)',
         }}>{value}</div>
      {sub && <div className="text-[10px] truncate" style={{ color: C.slate }}>{sub}</div>}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────
function Section({ title, children, className = '' }: {
  title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-lg overflow-hidden ${className}`} style={{
      border: `1px solid ${C.border}`,
      boxShadow: '0 1px 3px rgba(18,46,100,0.06)',
    }}>
      <div className="px-4 py-2.5 border-b flex items-center gap-2"
           style={{ borderColor: C.border }}>
        <div className="w-1 h-4 rounded-full flex-shrink-0" style={{ background: C.red }} />
        <h2 className="text-sm font-semibold" style={{ color: C.navy }}>{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ── Chart tooltip – full SAR values ───────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-lg p-3 text-xs min-w-[220px]" style={{
      border: `1px solid ${C.border}`,
      boxShadow: '0 4px 12px rgba(18,46,100,0.12)',
    }}>
      <p className="font-semibold mb-2" style={{ color: C.navy }}>{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-3 py-0.5">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium" style={{ color: C.charcoal }}>
            {typeof p.value === 'number' ? <RiyalAmt n={p.value} /> : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Update Data Modal ─────────────────────────────────────────────────
function UpdateDataModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [replaceAll, setReplaceAll] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; warnings: any[] } | null>(null);
  const { toast } = useToast();

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const records = await parseRevenueFile(file);
      saveRevenueData(records, replaceAll);
      const data = { imported: records.length, skipped: 0, warnings: [] };
      setResult(data);
      toast({ title: `Imported ${data.imported} records` });
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold" style={{ color: C.navy }}>Update Revenue Data</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
        </div>
        {!result ? (
          <>
            <p className="text-sm mb-3" style={{ color: C.slate }}>
              Upload the ACES MSD Excel workbook. Data stays in this browser and is not uploaded publicly.
            </p>
            <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
              <input type="checkbox" checked={replaceAll} onChange={e => setReplaceAll(e.target.checked)}
                     className="w-4 h-4 rounded" style={{ accentColor: C.red }} />
              <span className="text-sm font-medium" style={{ color: C.charcoal }}>
                Replace all existing data
              </span>
              <span className="text-xs" style={{ color: C.slate }}>(recommended for full refresh)</span>
            </label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors"
                   style={{ borderColor: C.border }}
                   onMouseOver={e => (e.currentTarget.style.borderColor = C.red)}
                   onMouseOut={e => (e.currentTarget.style.borderColor = C.border)}>
              <svg className="w-8 h-8 mb-2" fill="none" stroke={C.slate} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm" style={{ color: C.slate }}>
                {file ? file.name : 'Click to select Excel file'}
              </span>
              <input type="file" accept=".xlsx,.xls" className="hidden"
                     onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <div className="flex gap-3 mt-4">
              <button onClick={onClose}
                      className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
                      style={{ borderColor: C.border, color: C.charcoal }}>
                Cancel
              </button>
              <button onClick={handleUpload} disabled={!file || loading}
                      className="flex-1 px-4 py-2 text-sm text-white rounded-lg font-semibold disabled:opacity-50"
                      style={{ background: C.red }}>
                {loading ? 'Importing…' : 'Import'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 p-3 rounded-lg mb-3"
                 style={{ background: C.navyTint }}>
              <span className="text-xl font-bold" style={{ color: C.navy }}>✓</span>
              <p className="text-sm font-semibold" style={{ color: C.navy }}>{result.imported} records imported</p>
            </div>
            {result.warnings.slice(0, 5).map((w: any, i: number) => (
              <p key={i} className="text-xs text-amber-700 py-0.5">Row {w.row}: {w.message}</p>
            ))}
            <button onClick={onClose} className="w-full mt-3 px-4 py-2 text-sm text-white rounded-lg font-semibold"
                    style={{ background: C.navy }}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Portfolio Timeline ────────────────────────────────────────────────
function PortfolioTimeline({ projects }: { projects: any[] }) {
  const today = new Date();
  const sorted = [...projects]
    .filter(p => p.contractStart)
    .sort((a, b) => a.contractStart.localeCompare(b.contractStart));
  if (!sorted.length) return <p className="text-sm" style={{ color: C.slate }}>No timeline data</p>;

  const minDate = new Date(sorted[0].contractStart);
  const maxDate = new Date(Math.max(...sorted.map(p =>
    p.contractEnd ? new Date(p.contractEnd).getTime() : today.getTime())));
  const totalMs = maxDate.getTime() - minDate.getTime();
  const pct = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - minDate.getTime()) / totalMs) * 100));

  return (
    <div className="space-y-2.5">
      <div className="relative ml-36">
        <div className="absolute" style={{ left: `${pct(today)}%`, transform: 'translateX(-50%)' }}>
          <span className="text-[10px] font-semibold" style={{ color: C.red }}>Today</span>
        </div>
      </div>
      {sorted.map(p => {
        const start = new Date(p.contractStart);
        const end = p.contractEnd ? new Date(p.contractEnd) : today;
        const left = pct(start);
        const width = Math.max(pct(end) - left, 1);
        const todayPct = pct(today);
        const progressWidth = p.status === 'ongoing'
          ? Math.max(0, Math.min(width, todayPct - left))
          : width;
        const isOngoing = p.status === 'ongoing';

        return (
          <div key={p.id} className="flex items-center gap-2">
            <div className="w-36 flex-shrink-0 text-right">
              <span className="text-xs font-medium truncate block" style={{ color: C.charcoal }}>
                {shortName(p.name)}
              </span>
            </div>
            <div className="flex-1 h-5 rounded relative" style={{ background: C.navyTint }}>
              <div className="absolute h-full rounded opacity-25"
                   style={{ left: `${left}%`, width: `${width}%`,
                            background: isOngoing ? C.navy : C.slate }} />
              <div className="absolute h-full rounded"
                   style={{ left: `${left}%`, width: `${progressWidth}%`,
                            background: isOngoing ? C.navy : C.slate }} />
              <div className="absolute top-0 h-full w-px"
                   style={{ left: `${todayPct}%`, background: C.red, opacity: 0.7 }} />
            </div>
            <div className="w-14 flex-shrink-0">
              <span className="text-[10px]" style={{ color: C.slate }}>
                {p.contractEnd?.slice(0, 7) ?? '—'}
              </span>
            </div>
          </div>
        );
      })}
      <div className="ml-36 mt-1 flex justify-between pr-14">
        <span className="text-[10px]" style={{ color: C.slate }}>
          {minDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </span>
        <span className="text-[10px]" style={{ color: C.slate }}>
          {maxDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </span>
      </div>
    </div>
  );
}

// ── Management Summary Table ──────────────────────────────────────────
type SortKey = 'name'|'workOrder'|'revenue'|'deductible'|'invoiced'|'collected'
              |'outstanding'|'penalties'|'netRevenue'|'achievement'|'collectionRate';

/** Thin progress bar for achievement / collection rate */
function RatioBadge({ pct, threshHigh, threshMid }: {
  pct: number; threshHigh: number; threshMid: number;
}) {
  const color = pct >= threshHigh ? C.navy : pct >= threshMid ? C.medBlue : C.red;
  const barW  = Math.min(pct, 100);
  return (
    <div className="flex flex-col items-end gap-0.5" style={{ minWidth: 72 }}>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
        {pct > 0 ? fmtPct(pct) : '0.0%'}
      </span>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: C.navyTint }}>
        <div className="h-full rounded-full transition-all duration-300"
             style={{ width: `${barW}%`, background: color }} />
      </div>
    </div>
  );
}

/** Excel-style conditional-formatting bar with a target-aware two-colour scale. */
function PerformanceBar({ pct, target, label }: {
  pct: number; target: number; label: string;
}) {
  const safePct = Number.isFinite(pct) ? Math.max(pct, 0) : 0;
  const achieved = Math.min(safePct, 100);
  const isOnTarget = safePct >= target;
  const fill = isOnTarget ? C.navy : C.red;
  const track = isOnTarget ? C.navyTint : '#FDE8EB';

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-medium truncate" style={{ color: C.slate }}>{label}</span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: fill }}>
          {fmtPct(safePct)}
        </span>
      </div>
      <div className="relative h-3 rounded-sm overflow-hidden" style={{ background: track }}>
        <div className="h-full transition-all duration-500"
             style={{ width: `${achieved}%`, background: fill }} />
        <div className="absolute inset-y-0 w-px bg-white/90"
             style={{ left: `${Math.min(target, 100)}%` }} />
      </div>
    </div>
  );
}

/** Monetary cell — shows — for zero, full value otherwise */
function MoneyCell({ n, color, bold }: { n: number; color: string; bold?: boolean }) {
  if (n === 0) return (
    <span className="tabular-nums" style={{ color: C.slate }}>—</span>
  );
  return (
    <span className={`tabular-nums inline-flex items-center gap-0.5 ${bold ? 'font-semibold' : ''}`}
          style={{ color }}>
      <img src={riyalSignUrl} alt="﷼" className="inline-block flex-shrink-0"
           style={{ height: '0.85em', width: 'auto', verticalAlign: 'middle',
                    filter: 'brightness(0) saturate(100%)', opacity: bold ? 1 : 0.85 }} />
      {fmtNum(n)}
    </span>
  );
}

function ManagementTable({ projects, loading }: { projects: any[]; loading: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [search,  setSearch]  = useState('');
  const [selectedId, setSelectedId] = useState<number|null>(null);

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const enriched = useMemo(() => projects.map(p => ({
    ...p,
    achievement:    p.totalExpectedRevenue > 0 ? (p.totalRevenue / p.totalExpectedRevenue) * 100 : 0,
    collectionRate: p.totalInvoiced > 0        ? (p.totalCollected / p.totalInvoiced) * 100       : 0,
  })), [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? enriched.filter(p => p.name.toLowerCase().includes(q)) : enriched;
  }, [enriched, search]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let va: any, vb: any;
    switch (sortKey) {
      case 'name':           va = a.name;           vb = b.name; break;
      case 'workOrder':      va = a.totalWorkOrder;  vb = b.totalWorkOrder; break;
      case 'revenue':        va = a.totalRevenue;    vb = b.totalRevenue; break;
      case 'deductible':     va = a.totalDeductible; vb = b.totalDeductible; break;
      case 'invoiced':       va = a.totalInvoiced;   vb = b.totalInvoiced; break;
      case 'collected':      va = a.totalCollected;  vb = b.totalCollected; break;
      case 'outstanding':    va = a.totalOutstanding;vb = b.totalOutstanding; break;
      case 'penalties':      va = a.totalPenalties;  vb = b.totalPenalties; break;
      case 'netRevenue':     va = a.totalNetRevenue; vb = b.totalNetRevenue; break;
      case 'achievement':    va = a.achievement;     vb = b.achievement; break;
      case 'collectionRate': va = a.collectionRate;  vb = b.collectionRate; break;
      default:               va = 0; vb = 0;
    }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  }), [filtered, sortKey, sortDir]);

  const total = useMemo(() => sorted.reduce((a, p) => ({
    workOrder:    a.workOrder    + (p.totalWorkOrder  ?? 0),
    revenue:      a.revenue      + p.totalRevenue,
    expected:     a.expected     + p.totalExpectedRevenue,
    invoiced:     a.invoiced     + p.totalInvoiced,
    collected:    a.collected    + p.totalCollected,
    outstanding:  a.outstanding  + p.totalOutstanding,
    deductible:   a.deductible   + (p.totalDeductible ?? 0),
    penalties:    a.penalties    + (p.totalPenalties  ?? 0),
    netRevenue:   a.netRevenue   + (p.totalNetRevenue ?? 0),
  }), { workOrder:0, revenue:0, expected:0, invoiced:0, collected:0,
        outstanding:0, deductible:0, penalties:0, netRevenue:0 }), [sorted]);

  const totalAch  = total.expected  > 0 ? (total.revenue   / total.expected)  * 100 : 0;
  const totalColl = total.invoiced  > 0 ? (total.collected / total.invoiced)  * 100 : 0;

  /** Sort arrow indicator */
  const SortArrow = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <span className="opacity-0 group-hover:opacity-40 ml-0.5 text-[9px]">↕</span>;
    return <span className="ml-0.5 text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  /** Sortable header cell */
  const SH = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th onClick={() => toggle(k)}
        className={`group px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider
                    whitespace-nowrap cursor-pointer select-none transition-colors duration-150
                    ${right ? 'text-right' : 'text-left'}`}
        style={{ color: '#fff', userSelect: 'none' }}>
      <span className="inline-flex items-center gap-0.5 justify-end w-full">
        {right && <SortArrow k={k} />}
        {label}
        {!right && <SortArrow k={k} />}
      </span>
    </th>
  );

  // Sticky project column styles
  const stickyProjStyle: React.CSSProperties = {
    position: 'sticky', left: 0, zIndex: 2,
    boxShadow: '2px 0 6px rgba(18,46,100,0.08)',
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
           style={{ borderColor: `${C.red} transparent ${C.red} ${C.red}` }} />
    </div>
  );

  /* ── Mobile card layout ──────────────────────────────────────────── */
  const MobileCard = ({ p }: { p: typeof sorted[0] }) => (
    <div className="rounded-xl p-4 mb-3 transition-all duration-150"
         style={{
           background: C.white, border: `1px solid ${C.border}`,
           boxShadow: '0 1px 4px rgba(18,46,100,0.07)',
           borderLeft: selectedId === p.id ? `4px solid ${C.red}` : `4px solid transparent`,
         }}
         onClick={() => setSelectedId(id => id === p.id ? null : p.id)}>
      <p className="font-semibold text-sm mb-2" style={{ color: C.navy }}>{p.name}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        {([
          ['Work Order', p.totalWorkOrder ?? 0, C.navy],
          ['Revenue',    p.totalRevenue,        C.navy],
          ['Invoiced',   p.totalInvoiced,       C.charcoal],
          ['Collected',  p.totalCollected,      C.medBlue],
          ['Outstanding',p.totalOutstanding,    p.totalOutstanding > 0 ? C.red : C.slate],
          ['Net Revenue',p.totalNetRevenue ?? 0,(p.totalNetRevenue ?? 0) >= 0 ? C.navy : C.red],
        ] as [string, number, string][]).map(([lbl, val, col]) => (
          <div key={lbl}>
            <span className="block text-[9px] uppercase tracking-wide mb-0.5" style={{ color: C.slate }}>{lbl}</span>
            <MoneyCell n={val} color={col} />
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <span className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: C.slate }}>Achievement</span>
          <RatioBadge pct={p.achievement} threshHigh={100} threshMid={90} />
        </div>
        <div>
          <span className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: C.slate }}>Collection Rate</span>
          <RatioBadge pct={p.collectionRate} threshHigh={90} threshMid={70} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl overflow-hidden"
         style={{ background: C.white, border: `1px solid ${C.border}`,
                  boxShadow: '0 2px 12px rgba(18,46,100,0.07)' }}>

      {/* ── Card header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b"
           style={{ borderColor: C.border }}>
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: C.red }} />
          <div>
            <h2 className="text-sm font-bold leading-tight" style={{ color: C.navy }}>Management Summary</h2>
            <p className="text-[11px] mt-0.5" style={{ color: C.slate }}>Financial performance by project</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: C.navyTint, color: C.navy }}>
            {sorted.length} project{sorted.length !== 1 ? 's' : ''}
          </span>
          {/* Search */}
          <input
            type="text" value={search} placeholder="Search project…"
            onChange={e => setSearch(e.target.value)}
            className="text-[11px] rounded-lg px-2.5 py-1.5 outline-none transition-colors"
            style={{ border: `1px solid ${C.border}`, color: C.charcoal,
                     background: C.white, width: 160 }}
          />
        </div>
      </div>

      {/* ── Mobile cards ─────────────────────────────────────────────── */}
      <div className="md:hidden p-4">
        {sorted.length === 0
          ? <p className="text-center py-8 text-[12px]" style={{ color: C.slate }}>No projects match.</p>
          : sorted.map(p => <MobileCard key={p.id} p={p} />)}
      </div>

      {/* ── Desktop table ────────────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[11px]" style={{ minWidth: 1280, borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            {/* Level 1 — Group headers */}
            <tr style={{ background: C.navy }}>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest whitespace-nowrap rounded-tl-none"
                  style={{ ...stickyProjStyle, background: C.navy, color: '#fff' }}>
                PROJECT
              </th>
              {/* Financial Performance group */}
              <th colSpan={8} className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: '#fff', borderLeft: `1px solid rgba(255,255,255,0.15)` }}>
                FINANCIAL PERFORMANCE
              </th>
              {/* Performance Ratios group */}
              <th colSpan={2} className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: '#fff', borderLeft: `1px solid rgba(255,255,255,0.15)` }}>
                PERFORMANCE RATIOS
              </th>
            </tr>
            {/* Level 2 — Column headers */}
            <tr style={{ background: '#1a3a78' }}>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap text-white"
                  style={{ ...stickyProjStyle, background: '#1a3a78', cursor: 'pointer' }}
                  onClick={() => toggle('name')}>
                <span className="group inline-flex items-center gap-0.5">
                  Project <SortArrow k="name" />
                </span>
              </th>
              <SH k="workOrder"      label="Work Order"   right />
              <SH k="revenue"        label="Revenue"      right />
              <SH k="deductible"     label="Deductible"   right />
              <SH k="invoiced"       label="Invoiced"     right />
              <SH k="collected"      label="Collected"    right />
              <SH k="outstanding"    label="Outstanding"  right />
              <SH k="penalties"      label="Penalties"    right />
              <SH k="netRevenue"     label="Net Revenue"  right />
              <SH k="achievement"    label="Achievement"  right />
              <SH k="collectionRate" label="Collection"   right />
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center py-12"
                    style={{ color: C.slate, fontSize: 12 }}>
                  No projects match your search.
                </td>
              </tr>
            ) : sorted.map((p, i) => {
              const isSelected = selectedId === p.id;
              const rowBg = isSelected ? '#EEF2FA' : i % 2 === 0 ? C.white : '#F8F9FB';
              return (
                <tr key={p.id}
                    onClick={() => setSelectedId(id => id === p.id ? null : p.id)}
                    style={{ background: rowBg, cursor: 'pointer',
                             transition: 'background 150ms ease' }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = '#F0F4FF'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = rowBg; }}>

                  {/* Sticky project cell */}
                  <td className="px-3 py-3 font-semibold whitespace-nowrap text-left"
                      style={{
                        ...stickyProjStyle,
                        background: rowBg,
                        color: C.navy,
                        minWidth: 200,
                        borderLeft: isSelected ? `3px solid ${C.red}` : '3px solid transparent',
                        transition: 'background 150ms ease',
                      }}>
                    {p.name}
                  </td>

                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalWorkOrder ?? 0} color={C.navy} />
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalRevenue} color={C.navy} />
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalDeductible ?? 0} color={(p.totalDeductible ?? 0) > 0 ? C.red : C.slate} />
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalInvoiced} color={C.charcoal} />
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalCollected} color={C.medBlue} />
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalOutstanding} color={p.totalOutstanding > 0 ? C.red : C.slate} />
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalPenalties ?? 0} color={(p.totalPenalties ?? 0) > 0 ? C.critDark : C.slate} />
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalNetRevenue ?? 0} color={(p.totalNetRevenue ?? 0) >= 0 ? C.navy : C.red} bold />
                  </td>
                  <td className="px-4 py-3 text-right" style={{ minWidth: 90 }}>
                    <RatioBadge pct={p.achievement} threshHigh={100} threshMid={90} />
                  </td>
                  <td className="px-4 py-3 text-right" style={{ minWidth: 90 }}>
                    <RatioBadge pct={p.collectionRate} threshHigh={90} threshMid={70} />
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* ── Portfolio Total ────────────────────────────────────── */}
          <tfoot>
            <tr style={{ background: C.navyTint, borderTop: `2px solid ${C.navy}` }}>
              <td className="px-3 py-3 font-bold text-left whitespace-nowrap"
                  style={{ ...stickyProjStyle, background: C.navyTint, color: C.navy, fontSize: 12 }}>
                Portfolio Total
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.workOrder} color={C.navy} bold />
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.revenue} color={C.navy} bold />
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.deductible} color={total.deductible > 0 ? C.red : C.slate} bold />
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.invoiced} color={C.charcoal} bold />
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.collected} color={C.medBlue} bold />
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.outstanding} color={total.outstanding > 0 ? C.red : C.slate} bold />
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.penalties} color={total.penalties > 0 ? C.critDark : C.slate} bold />
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.netRevenue} color={total.netRevenue >= 0 ? C.navy : C.red} bold />
              </td>
              <td className="px-4 py-3 text-right" style={{ minWidth: 90 }}>
                <RatioBadge pct={totalAch} threshHigh={100} threshMid={90} />
              </td>
              <td className="px-4 py-3 text-right" style={{ minWidth: 90 }}>
                <RatioBadge pct={totalColl} threshHigh={90} threshMid={70} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────
export default function Dashboard({ onLogout }: { onLogout?: () => void }) {
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedYear,    setSelectedYear]    = useState<string>('');
  const [selectedMonth,   setSelectedMonth]   = useState<string>('');
  const [dateFrom,        setDateFrom]        = useState<string>('');
  const [dateTo,          setDateTo]          = useState<string>('');
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [records, setRecords] = useState(() => loadRevenueData());
  useEffect(() => {
    const reload = () => setRecords(loadRevenueData());
    window.addEventListener(DATA_UPDATED_EVENT, reload);
    window.addEventListener('storage', reload);
    return () => { window.removeEventListener(DATA_UPDATED_EVENT, reload); window.removeEventListener('storage', reload); };
  }, []);

  const usingDateRange = !!(dateFrom || dateTo);
  const queryParams = {
    project:      selectedProject || undefined,
    revenueYear:  !usingDateRange && selectedYear  ? Number(selectedYear)  : undefined,
    revenueMonth: !usingDateRange && selectedMonth ? Number(selectedMonth) : undefined,
    dateFrom:     dateFrom || undefined,
    dateTo:       dateTo   || undefined,
  };

  const { summary, monthly, performance, allProjects, filteredProjects } = useMemo(
    () => buildDashboardData(records, queryParams),
    [records, selectedProject, selectedYear, selectedMonth, dateFrom, dateTo],
  );
  const summaryLoading = false, monthlyLoading = false, perfLoading = false;
  const allProjectsLoading = false, filteredLoading = false;

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of allProjects) {
      if (p.contractStart) years.add(new Date(p.contractStart).getFullYear());
      if (p.contractEnd)   years.add(new Date(p.contractEnd).getFullYear());
    }
    years.add(new Date().getFullYear());
    return Array.from(years).sort();
  }, [allProjects]);

  const timelineProjects = useMemo(() =>
    selectedProject
      ? allProjects.filter(p => p.name === selectedProject)
      : allProjects,
    [allProjects, selectedProject]);

  const months = [
    { val: '1', label: 'January' }, { val: '2', label: 'February' },
    { val: '3', label: 'March' },   { val: '4', label: 'April' },
    { val: '5', label: 'May' },     { val: '6', label: 'June' },
    { val: '7', label: 'July' },    { val: '8', label: 'August' },
    { val: '9', label: 'September' },{ val: '10', label: 'October' },
    { val: '11', label: 'November' },{ val: '12', label: 'December' },
  ];

  const reset = () => {
    setSelectedProject(''); setSelectedYear(''); setSelectedMonth('');
    setDateFrom(''); setDateTo('');
  };
  const hasFilters = !!(selectedProject || selectedYear || selectedMonth || dateFrom || dateTo);

  // Collection donut data — ACES navy · red · critical dark only
  const donutData = [
    { name: 'Collected',   value: summary.totalCollected,   color: C.navy     },
    { name: 'Outstanding', value: summary.totalOutstanding, color: C.red      },
    { name: 'Overdue',     value: summary.totalOverdue,     color: C.critDark },
  ].filter(d => d.value > 0);

  const lastUpdated = summary?.lastDataUpdate
    ? new Date(summary.lastDataUpdate).toLocaleDateString('en-US',
        { day: 'numeric', month: 'short', year: 'numeric' })
    : 'N/A';

  const reportingPeriod = usingDateRange
    ? `${dateFrom || '…'} → ${dateTo || '…'}`
    : selectedMonth && selectedYear
      ? `${months.find(m => m.val === selectedMonth)?.label} ${selectedYear}`
      : selectedYear ? `FY ${selectedYear}` : 'All Time';

  // input / select shared classes
  const ctrlCls = [
    'text-xs border rounded-md px-2.5 py-1.5 bg-white transition-colors',
    'focus:outline-none focus:border-[#EF1E34] focus:ring-1 focus:ring-[#EF1E34]',
    'min-w-[120px]',
  ].join(' ');

  return (
    <div className="min-h-screen" style={{ background: C.light, fontFamily: 'Inter, sans-serif' }}>

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header className="aces-header px-6 py-3 pb-5">
        <div className="w-full flex items-center justify-between gap-4">

          {/* Left: logo + divider + title */}
          <div className="flex items-center gap-4">
            <img src={logoUrl} alt="ACES Logo" className="flex-shrink-0"
                 style={{ height: '64px', width: 'auto', objectFit: 'contain' }} />
            <div className="h-10 w-px flex-shrink-0" style={{ background: C.red }} />
            <div>
              <p className="text-[11px] font-medium tracking-[0.15em] uppercase"
                 style={{ color: 'rgba(255,255,255,0.55)' }}>
                Managed Services Department
              </p>
              <h1 className="text-lg font-bold text-white leading-tight">
                Project Revenue Dashboard
              </h1>
            </div>
          </div>

          {/* Right: meta + button */}
          <div className="flex items-center gap-5 flex-shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Reporting Period
              </p>
              <p className="text-sm font-semibold text-white">{reportingPeriod}</p>
            </div>
            <div className="text-right hidden md:block">
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Last Updated
              </p>
              <p className="text-sm font-semibold text-white">{lastUpdated}</p>
            </div>
            <button
              onClick={() => setShowUpdateModal(true)}
              className="px-4 py-2 text-xs font-semibold rounded-lg text-white transition-colors flex-shrink-0"
              style={{ background: C.red }}
              onMouseOver={e => (e.currentTarget.style.background = C.redDark)}
              onMouseOut={e => (e.currentTarget.style.background = C.red)}>
              Update Data
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                title="Sign out"
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }}
                onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
                onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign Out
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── FILTER BAR ──────────────────────────────────────────────── */}
      <div className="border-b bg-white px-6 py-2.5" style={{ borderColor: C.border }}>
        <div className="w-full flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: C.navy }}>Filters:</span>

          {/* Project */}
          <select value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}
                  className={ctrlCls}
                  style={{ color: selectedProject ? C.navy : C.slate, borderColor: C.border }}>
            <option value="">All Projects</option>
            {(allProjects ?? []).map(p =>
              <option key={p.id} value={p.name}>{shortName(p.name)}</option>)}
          </select>

          <div className="h-5 w-px hidden sm:block" style={{ background: C.border }} />

          {/* Year */}
          <select value={selectedYear}
                  onChange={e => { setSelectedYear(e.target.value); if (!e.target.value) setSelectedMonth(''); }}
                  disabled={usingDateRange}
                  className={ctrlCls + (usingDateRange ? ' opacity-40 cursor-not-allowed' : '')}
                  style={{ color: selectedYear ? C.navy : C.slate, borderColor: C.border }}>
            <option value="">All Years</option>
            {availableYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>

          {/* Month */}
          <select value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  disabled={!selectedYear || usingDateRange}
                  className={ctrlCls + (!selectedYear || usingDateRange ? ' opacity-40 cursor-not-allowed' : '')}
                  style={{ color: selectedMonth ? C.navy : C.slate, borderColor: C.border }}>
            <option value="">All Months</option>
            {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>

          <div className="h-5 w-px hidden sm:block" style={{ background: C.border }} />

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium" style={{ color: C.navy }}>From</span>
            <input type="date" value={dateFrom}
                   onChange={e => { setDateFrom(e.target.value); if (e.target.value) { setSelectedYear(''); setSelectedMonth(''); } }}
                   max={dateTo || undefined}
                   className={ctrlCls}
                   style={{ borderColor: C.border, color: dateFrom ? C.navy : C.slate }} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium" style={{ color: C.navy }}>To</span>
            <input type="date" value={dateTo}
                   onChange={e => { setDateTo(e.target.value); if (e.target.value) { setSelectedYear(''); setSelectedMonth(''); } }}
                   min={dateFrom || undefined}
                   className={ctrlCls}
                   style={{ borderColor: C.border, color: dateTo ? C.navy : C.slate }} />
          </div>

          {hasFilters && (
            <button onClick={reset}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors"
                    style={{ color: C.red, border: `1px solid ${C.red}`, background: 'transparent' }}
                    onMouseOver={e => { e.currentTarget.style.background = C.red; e.currentTarget.style.color = '#fff'; }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.red; }}>
              Reset Filters ✕
            </button>
          )}
        </div>
      </div>

      <main className="w-full px-4 sm:px-6 xl:px-8 py-5 space-y-5">

        {/* ── 6 KPI CARDS ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label="Work Order"
            value={summaryLoading ? '…' : <RiyalAmt n={summary?.totalPoValue ?? 0} />}
            sub="Total contracted (all time)"
            valueColor={C.navy}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke={C.navy} viewBox="0 0 24 24" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>}
          />
          <KpiCard
            label="Revenue"
            value={summaryLoading ? '…' : <RiyalAmt n={summary?.totalRevenue ?? 0} />}
            sub={summaryLoading ? '' : `${fmtPct(summary?.revenueAchievementRate ?? 0)} of work order`}
            valueColor={C.navy}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke={C.navy} viewBox="0 0 24 24" strokeWidth={2}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
          />
          <KpiCard
            label="Invoiced"
            value={summaryLoading ? '…' : <RiyalAmt n={summary?.totalInvoiced ?? 0} />}
            sub={summaryLoading ? '' : `${fmtPct(summary?.invoiceConversionRate ?? 0)} of revenue`}
            valueColor={C.charcoal}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke={C.charcoal} viewBox="0 0 24 24" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
          />
          <KpiCard
            label="Collected"
            value={summaryLoading ? '…' : <RiyalAmt n={summary?.totalCollected ?? 0} />}
            sub={summaryLoading ? '' : `${fmtPct(summary?.collectionRate ?? 0)} collection rate`}
            valueColor={C.medBlue}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke={C.medBlue} viewBox="0 0 24 24" strokeWidth={2}><polyline points="20 6 9 17 4 12"/></svg>}
          />
          <KpiCard
            label="Unbilled Revenue"
            value={summaryLoading ? '…' : <RiyalAmt n={summary?.totalUnbilled ?? 0} />}
            sub="Recognized revenue not yet invoiced"
            valueColor={(summary?.totalUnbilled ?? 0) > 0 ? C.red : C.slate}
            tooltip="Revenue recognized from completed work that has not yet been submitted to the customer as an invoice."
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke={(summary?.totalUnbilled ?? 0) > 0 ? C.red : C.slate} viewBox="0 0 24 24" strokeWidth={2}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
          />
          <KpiCard
            label="Net Revenue"
            value={summaryLoading ? '…' : <RiyalAmt n={summary?.totalNetRevenue ?? 0} />}
            sub="After penalties & deductions"
            valueColor={(summary?.totalNetRevenue ?? 0) >= 0 ? C.navy : C.red}
            icon={<img src={riyalSignUrl} alt="﷼" style={{ height: '14px', width: 'auto', filter: 'brightness(0) saturate(100%)', opacity: 0.7 }} />}
          />
        </div>

        {/* ── MONTHLY + COLLECTION ─────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Section title="Monthly Financial Performance" className="xl:col-span-2">
            {monthlyLoading ? <Loading /> : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={monthly ?? []} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth}
                         tick={{ fontSize: 10, fill: C.slate }} />
                  <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: C.slate }} width={56} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {/* Work Order */}
                  <Bar dataKey="workOrder" name="Work Order"
                       fill={C.slate} opacity={0.55} radius={[2,2,0,0]} maxBarSize={14} />
                  {/* Revenue */}
                  <Bar dataKey="revenue" name="Revenue"
                       fill={C.navy} radius={[2,2,0,0]} maxBarSize={14} />
                  {/* Invoiced */}
                  <Bar dataKey="invoiced" name="Invoiced"
                       fill={C.red} opacity={0.8} radius={[2,2,0,0]} maxBarSize={14} />
                  {/* Collected */}
                  <Line type="monotone" dataKey="collected" name="Collected"
                        stroke={C.medBlue} strokeWidth={2} dot={{ r: 2, fill: C.medBlue }} />
                  {/* Net Revenue */}
                  <Line type="monotone" dataKey="netRevenue" name="Net Revenue"
                        stroke={C.charcoal} strokeWidth={1.5} strokeDasharray="4 2"
                        dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Section>

          <Section title="Collection Overview">
            {summaryLoading ? <Loading /> : (
              <div className="flex flex-col items-center">
                <div className="relative w-full" style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%"
                           innerRadius={60} outerRadius={86}
                           paddingAngle={2} dataKey="value"
                           startAngle={90} endAngle={-270}>
                        {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [fmtSARStr(v), '']} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-[10px] font-semibold uppercase tracking-wide"
                       style={{ color: C.slate }}>Collection Rate</p>
                    <p className="text-2xl font-bold"
                       style={{ color: C.navy }}>
                      {fmtPct(summary?.collectionRate ?? 0)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 w-full mt-1 text-center">
                  {donutData.map(d => (
                    <div key={d.name}>
                      <div className="w-3 h-3 rounded-full mx-auto mb-1"
                           style={{ background: d.color }} />
                      <p className="text-[10px]" style={{ color: C.slate }}>{d.name}</p>
                      <p className="text-[10px] font-bold break-all" style={{ color: d.color }}>
                        <RiyalAmt n={d.value} />
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </div>

        {/* ── PROJECT CHARTS ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Section title="Project Financial Performance">
            {perfLoading ? <Loading /> : (
              <div className="min-h-[280px]">
                <div className="grid grid-cols-[minmax(110px,0.75fr)_1fr_1fr] gap-4 px-2 pb-2 border-b"
                     style={{ borderColor: C.border }}>
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.slate }}>Project</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.navy }}>Invoice Conversion</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: C.navy }}>Collection Rate</span>
                </div>
                <div className="divide-y" style={{ borderColor: C.border }}>
                  {(performance ?? []).map(p => {
                    const invoicePct = p.revenue > 0 ? (p.invoiced / p.revenue) * 100 : 0;
                    const collectionPct = p.invoiced > 0 ? (p.collected / p.invoiced) * 100 : 0;
                    return (
                      <div key={p.projectName}
                           className="grid grid-cols-[minmax(110px,0.75fr)_1fr_1fr] gap-4 items-center px-2 py-2.5">
                        <span className="text-xs font-semibold truncate" title={p.projectName} style={{ color: C.charcoal }}>
                          {shortName(p.projectName)}
                        </span>
                        <PerformanceBar pct={invoicePct} target={95} label="Target 95%" />
                        <PerformanceBar pct={collectionPct} target={90} label="Target 90%" />
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-5 px-2 pt-3 text-[10px]" style={{ color: C.slate }}>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: C.navy }} />Target achieved</span>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: C.red }} />Below target</span>
                </div>
              </div>
            )}
          </Section>

          <Section title="Revenue Achievement by Project">
            {perfLoading ? <Loading /> : (
              <div className="min-h-[280px] divide-y" style={{ borderColor: C.border }}>
                {(performance ?? []).map(p => {
                  const pct = p.revenueAchievementPct;
                  const achievedPct = Math.min(Math.max(pct, 0), 100);
                  const gapPct = Math.max(100 - achievedPct, 0);
                  const onTarget = pct >= 100;
                  return (
                    <div key={p.projectName} className="px-2 py-2.5">
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-xs font-semibold truncate pr-3" title={p.projectName} style={{ color: C.charcoal }}>
                          {shortName(p.projectName)}
                        </span>
                        <span className="text-xs font-bold tabular-nums" style={{ color: onTarget ? C.navy : C.red }}>
                          {fmtPct(pct)}
                        </span>
                      </div>
                      <div className="flex h-3 rounded-sm overflow-hidden" title={`${fmtPct(pct)} achieved · ${gapPct.toFixed(1)}% gap`}>
                        <div className="h-full transition-all duration-500"
                             style={{ width: `${achievedPct}%`, background: C.navy }} />
                        {gapPct > 0 && <div className="h-full transition-all duration-500"
                                           style={{ width: `${gapPct}%`, background: C.red }} />}
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[9px]" style={{ color: C.slate }}>
                          Rev: <RiyalAmt n={p.revenue} />
                        </span>
                        <span className="text-[9px]" style={{ color: C.slate }}>
                          Target: <RiyalAmt n={p.workOrder} />
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-5 px-2 pt-3 text-[10px]" style={{ color: C.slate }}>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: C.navy }} />Achieved</span>
                  <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm" style={{ background: C.red }} />Gap to 100%</span>
                </div>
              </div>
            )}
          </Section>
        </div>

        {/* ── PORTFOLIO TIMELINE ───────────────────────────────────── */}
        <Section title={selectedProject
          ? `Portfolio Timeline — ${shortName(selectedProject)}`
          : 'Project Portfolio Timeline'}>
          {allProjectsLoading ? <Loading /> : <PortfolioTimeline projects={timelineProjects} />}
        </Section>

        {/* ── MANAGEMENT SUMMARY ───────────────────────────────────── */}
        <ManagementTable projects={filteredProjects ?? []} loading={filteredLoading} />

      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer className="text-center py-4 text-[11px]" style={{ color: C.slate }}>
        ACES Managed Services Department · Project Revenue Dashboard · Confidential
      </footer>

      {showUpdateModal && <UpdateDataModal onClose={() => setShowUpdateModal(false)} />}
    </div>
  );
}
