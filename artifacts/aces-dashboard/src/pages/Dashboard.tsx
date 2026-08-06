import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
  ComposedChart,
} from 'recharts';
import {
  useGetDashboardSummary,
  useGetMonthlyTrend,
  useGetProjectPerformance,
  useListProjects,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import logoUrl from '@assets/MSD_Logo_1785945599981.png';

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
/** Full SAR value with 4 decimal places – no K / M / B abbreviations */
function fmtSAR(n: number): string {
  if (!isFinite(n)) return '﷼ 0.0000';
  return `﷼ ${n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
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
  value: string;
  sub?: string;
  valueColor?: string;
  icon?: React.ReactNode;
}
function KpiCard({ label, value, sub, valueColor = C.charcoal, icon }: KpiCardProps) {
  return (
    <div className="bg-white rounded-md flex flex-col gap-1 p-3 min-w-0" style={{
      border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${C.red}`,
      boxShadow: '0 1px 3px rgba(18,46,100,0.06)',
    }}>
      <div className="flex items-center gap-1.5">
        {icon && <span className="flex-shrink-0 opacity-60">{icon}</span>}
        <p className="text-[10px] font-semibold uppercase tracking-wider truncate"
           style={{ color: C.navy }}>{label}</p>
      </div>
      <p className="font-bold leading-tight break-all"
         style={{
           color: valueColor,
           fontSize: 'clamp(0.6rem, 1.1vw, 0.8rem)',
         }}>{value}</p>
      {sub && <p className="text-[10px] truncate" style={{ color: C.slate }}>{sub}</p>}
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
            {typeof p.value === 'number' ? fmtSAR(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Update Data Modal ─────────────────────────────────────────────────
function UpdateDataModal({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; warnings: any[] } | null>(null);
  const { toast } = useToast();
  const BASE = import.meta.env.BASE_URL || '/';
  const apiBase = BASE.endsWith('/') ? BASE.slice(0, -1) : BASE;

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/);
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const records = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
      });
      const resp = await fetch(`${apiBase}/api/records/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
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
            <p className="text-sm mb-4" style={{ color: C.slate }}>
              Upload a CSV file in ACES MSD format. All 177 existing records will be preserved.
            </p>
            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors"
                   style={{ borderColor: C.border }}
                   onMouseOver={e => (e.currentTarget.style.borderColor = C.red)}
                   onMouseOut={e => (e.currentTarget.style.borderColor = C.border)}>
              <svg className="w-8 h-8 mb-2" fill="none" stroke={C.slate} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm" style={{ color: C.slate }}>
                {file ? file.name : 'Click to select CSV file'}
              </span>
              <input type="file" accept=".csv" className="hidden"
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
function ManagementTable({ projects, loading }: { projects: any[]; loading: boolean }) {
  if (loading) return <Loading />;
  const total = projects.reduce((a, p) => ({
    poValue:              a.poValue              + p.poValue,
    totalRevenue:         a.totalRevenue         + p.totalRevenue,
    totalExpectedRevenue: a.totalExpectedRevenue + p.totalExpectedRevenue,
    totalInvoiced:        a.totalInvoiced        + p.totalInvoiced,
    totalCollected:       a.totalCollected       + p.totalCollected,
    totalOutstanding:     a.totalOutstanding     + p.totalOutstanding,
    totalDeductible:      a.totalDeductible      + (p.totalDeductible ?? 0),
    totalPenalties:       a.totalPenalties       + (p.totalPenalties ?? 0),
    totalNetRevenue:      a.totalNetRevenue      + (p.totalNetRevenue ?? 0),
  }), { poValue: 0, totalRevenue: 0, totalExpectedRevenue: 0, totalInvoiced: 0,
        totalCollected: 0, totalOutstanding: 0, totalDeductible: 0,
        totalPenalties: 0, totalNetRevenue: 0 });

  const StatusBadge = ({ s }: { s: string }) => (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={s === 'ongoing'
        ? { background: C.navyTint, color: C.navy }
        : { background: '#F3F4F6', color: C.slate }}>
      {s}
    </span>
  );

  const headers = ['Project', 'Status', 'Contract', 'Work Order', 'Revenue',
                   'Deductible', 'Invoiced', 'Collected', 'Outstanding',
                   'Penalties', 'Net Revenue', 'Achievement', 'Collection'];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs" style={{ minWidth: '1100px' }}>
        <thead>
          <tr style={{ background: C.navy }}>
            {headers.map(h => (
              <th key={h} className="px-2.5 py-2 text-white font-semibold text-left whitespace-nowrap
                                     first:rounded-tl last:rounded-tr">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p, i) => {
            const achPct  = p.totalExpectedRevenue > 0
              ? (p.totalRevenue / p.totalExpectedRevenue) * 100 : 0;
            const collPct = p.totalInvoiced > 0
              ? (p.totalCollected / p.totalInvoiced) * 100 : 0;
            const achColor  = achPct  >= 100 ? C.navy : achPct  >= 90 ? C.medBlue : C.red;
            const collColor = collPct >= 100 ? C.navy : collPct >= 90 ? C.medBlue : C.red;
            return (
              <tr key={p.id} style={{ background: i % 2 === 0 ? C.white : C.light }}>
                <td className="px-2.5 py-1.5 font-medium whitespace-nowrap"
                    style={{ color: C.charcoal }}>{shortName(p.name)}</td>
                <td className="px-2.5 py-1.5"><StatusBadge s={p.status} /></td>
                <td className="px-2.5 py-1.5 whitespace-nowrap" style={{ color: C.slate }}>
                  {p.contractStart?.slice(0, 7) ?? '—'} → {p.contractEnd?.slice(0, 7) ?? '—'}
                </td>
                <td className="px-2.5 py-1.5 text-right font-medium whitespace-nowrap"
                    style={{ color: C.navy }}>{fmtSAR(p.poValue)}</td>
                <td className="px-2.5 py-1.5 text-right whitespace-nowrap"
                    style={{ color: C.navy }}>{fmtSAR(p.totalRevenue)}</td>
                <td className="px-2.5 py-1.5 text-right whitespace-nowrap"
                    style={{ color: (p.totalDeductible ?? 0) > 0 ? C.red : C.slate }}>
                  {fmtSAR(p.totalDeductible ?? 0)}</td>
                <td className="px-2.5 py-1.5 text-right whitespace-nowrap"
                    style={{ color: C.charcoal }}>{fmtSAR(p.totalInvoiced)}</td>
                <td className="px-2.5 py-1.5 text-right whitespace-nowrap"
                    style={{ color: C.medBlue }}>{fmtSAR(p.totalCollected)}</td>
                <td className="px-2.5 py-1.5 text-right whitespace-nowrap"
                    style={{ color: p.totalOutstanding > 0 ? C.red : C.slate }}>
                  {fmtSAR(p.totalOutstanding)}</td>
                <td className="px-2.5 py-1.5 text-right whitespace-nowrap"
                    style={{ color: (p.totalPenalties ?? 0) > 0 ? C.red : C.slate }}>
                  {fmtSAR(p.totalPenalties ?? 0)}</td>
                <td className="px-2.5 py-1.5 text-right whitespace-nowrap"
                    style={{ color: (p.totalNetRevenue ?? 0) >= 0 ? C.navy : C.red }}>
                  {fmtSAR(p.totalNetRevenue ?? 0)}</td>
                <td className="px-2.5 py-1.5 text-right">
                  <span className="font-semibold" style={{ color: achColor }}>
                    {fmtPct(achPct)}
                  </span>
                </td>
                <td className="px-2.5 py-1.5 text-right">
                  <span className="font-semibold" style={{ color: collColor }}>
                    {fmtPct(collPct)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: C.navyTint, borderTop: `2px solid ${C.navy}` }}>
            <td className="px-2.5 py-2 font-bold" colSpan={3}
                style={{ color: C.navy }}>Portfolio Total</td>
            <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap"
                style={{ color: C.navy }}>{fmtSAR(total.poValue)}</td>
            <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap"
                style={{ color: C.navy }}>{fmtSAR(total.totalRevenue)}</td>
            <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap"
                style={{ color: total.totalDeductible > 0 ? C.red : C.slate }}>
              {fmtSAR(total.totalDeductible)}</td>
            <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap"
                style={{ color: C.charcoal }}>{fmtSAR(total.totalInvoiced)}</td>
            <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap"
                style={{ color: C.medBlue }}>{fmtSAR(total.totalCollected)}</td>
            <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap"
                style={{ color: C.red }}>{fmtSAR(total.totalOutstanding)}</td>
            <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap"
                style={{ color: total.totalPenalties > 0 ? C.red : C.slate }}>
              {fmtSAR(total.totalPenalties)}</td>
            <td className="px-2.5 py-2 text-right font-bold whitespace-nowrap"
                style={{ color: total.totalNetRevenue >= 0 ? C.navy : C.red }}>
              {fmtSAR(total.totalNetRevenue)}</td>
            <td className="px-2.5 py-2 text-right font-bold"
                style={{ color: total.totalExpectedRevenue > 0
                  ? (() => { const r = total.totalRevenue / total.totalExpectedRevenue;
                             return r >= 1 ? C.navy : r >= 0.9 ? C.medBlue : C.red; })()
                  : C.slate }}>
              {total.totalExpectedRevenue > 0
                ? fmtPct((total.totalRevenue / total.totalExpectedRevenue) * 100)
                : '—'}
            </td>
            <td className="px-2.5 py-2 text-right font-bold"
                style={{ color: total.totalInvoiced > 0
                  ? (() => { const r = total.totalCollected / total.totalInvoiced;
                             return r >= 1 ? C.navy : r >= 0.9 ? C.medBlue : C.red; })()
                  : C.slate }}>
              {total.totalInvoiced > 0
                ? fmtPct((total.totalCollected / total.totalInvoiced) * 100)
                : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
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

  const usingDateRange = !!(dateFrom || dateTo);
  const queryParams = {
    project:      selectedProject || undefined,
    revenueYear:  !usingDateRange && selectedYear  ? Number(selectedYear)  : undefined,
    revenueMonth: !usingDateRange && selectedMonth ? Number(selectedMonth) : undefined,
    dateFrom:     dateFrom || undefined,
    dateTo:       dateTo   || undefined,
  };

  const { data: summary,          isLoading: summaryLoading   } = useGetDashboardSummary(queryParams);
  const { data: monthly,          isLoading: monthlyLoading   } = useGetMonthlyTrend(queryParams);
  const { data: performance,      isLoading: perfLoading      } = useGetProjectPerformance(queryParams);
  const { data: allProjects,      isLoading: allProjectsLoading } = useListProjects();
  const { data: filteredProjects, isLoading: filteredLoading  } = useListProjects(queryParams);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of allProjects ?? []) {
      if (p.contractStart) years.add(new Date(p.contractStart).getFullYear());
      if (p.contractEnd)   years.add(new Date(p.contractEnd).getFullYear());
    }
    years.add(new Date().getFullYear());
    return Array.from(years).sort();
  }, [allProjects]);

  const timelineProjects = useMemo(() =>
    selectedProject
      ? (allProjects ?? []).filter(p => p.name === selectedProject)
      : (allProjects ?? []),
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
  const donutData = summary ? [
    { name: 'Collected',   value: summary.totalCollected,   color: C.navy     },
    { name: 'Outstanding', value: summary.totalOutstanding, color: C.red      },
    { name: 'Overdue',     value: summary.totalOverdue,     color: C.critDark },
  ].filter(d => d.value > 0) : [];

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
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">

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
        <div className="max-w-screen-2xl mx-auto flex items-center gap-3 flex-wrap">
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
            <input type="month" value={dateFrom}
                   onChange={e => { setDateFrom(e.target.value); if (e.target.value) { setSelectedYear(''); setSelectedMonth(''); } }}
                   max={dateTo || undefined}
                   className={ctrlCls}
                   style={{ borderColor: C.border, color: dateFrom ? C.navy : C.slate }} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium" style={{ color: C.navy }}>To</span>
            <input type="month" value={dateTo}
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

      <main className="max-w-screen-2xl mx-auto px-6 py-5 space-y-5">

        {/* ── 6 KPI CARDS ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label="Work Order"
            value={summaryLoading ? '…' : fmtSAR(summary?.totalPoValue ?? 0)}
            sub="Total contracted (all time)"
            valueColor={C.navy}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke={C.navy} viewBox="0 0 24 24" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>}
          />
          <KpiCard
            label="Revenue"
            value={summaryLoading ? '…' : fmtSAR(summary?.totalRevenue ?? 0)}
            sub={summaryLoading ? '' : `${fmtPct(summary?.revenueAchievementRate ?? 0)} of work order`}
            valueColor={C.navy}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke={C.navy} viewBox="0 0 24 24" strokeWidth={2}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
          />
          <KpiCard
            label="Invoiced"
            value={summaryLoading ? '…' : fmtSAR(summary?.totalInvoiced ?? 0)}
            sub={summaryLoading ? '' : `${fmtPct(summary?.invoiceConversionRate ?? 0)} of revenue`}
            valueColor={C.charcoal}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke={C.charcoal} viewBox="0 0 24 24" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
          />
          <KpiCard
            label="Collected"
            value={summaryLoading ? '…' : fmtSAR(summary?.totalCollected ?? 0)}
            sub={summaryLoading ? '' : `${fmtPct(summary?.collectionRate ?? 0)} collection rate`}
            valueColor={C.medBlue}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke={C.medBlue} viewBox="0 0 24 24" strokeWidth={2}><polyline points="20 6 9 17 4 12"/></svg>}
          />
          <KpiCard
            label="Uninvoiced"
            value={summaryLoading ? '…' : fmtSAR((summary?.totalRevenue ?? 0) - (summary?.totalInvoiced ?? 0))}
            sub="Revenue minus Invoiced"
            valueColor={((summary?.totalRevenue ?? 0) - (summary?.totalInvoiced ?? 0)) > 0 ? C.red : C.slate}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke={C.red} viewBox="0 0 24 24" strokeWidth={2}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
          />
          <KpiCard
            label="Net Revenue"
            value={summaryLoading ? '…' : fmtSAR(summary?.totalNetRevenue ?? 0)}
            sub="After penalties & deductions"
            valueColor={(summary?.totalNetRevenue ?? 0) >= 0 ? C.navy : C.red}
            icon={<svg className="w-3.5 h-3.5" fill="none" stroke={C.navy} viewBox="0 0 24 24" strokeWidth={2}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>}
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
                      <Tooltip formatter={(v: number) => [fmtSAR(v), '']} />
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
                        {fmtSAR(d.value)}
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
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={(performance ?? []).map(p => ({ ...p, projectName: shortName(p.projectName) }))}
                  layout="vertical"
                  margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                  <XAxis type="number" tickFormatter={fmtAxis}
                         tick={{ fontSize: 10, fill: C.slate }} />
                  <YAxis type="category" dataKey="projectName"
                         tick={{ fontSize: 10, fill: C.charcoal }} width={80} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="workOrder" name="Work Order"
                       fill={C.slate} opacity={0.55} radius={[0,3,3,0]} maxBarSize={10} />
                  <Bar dataKey="revenue" name="Revenue"
                       fill={C.navy} radius={[0,3,3,0]} maxBarSize={10} />
                  <Bar dataKey="invoiced" name="Invoiced"
                       fill={C.red} opacity={0.8} radius={[0,3,3,0]} maxBarSize={10} />
                  <Bar dataKey="collected" name="Collected"
                       fill={C.medBlue} radius={[0,3,3,0]} maxBarSize={10} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Section>

          <Section title="Revenue Achievement by Project">
            {perfLoading ? <Loading /> : (
              <div className="space-y-3 pt-1">
                {(performance ?? []).map(p => {
                  const pct = p.revenueAchievementPct;
                  const barPct = Math.min(pct, 100);
                  // Navy = 100%+, medium blue = 90–99.99%, red = below 90%
                  const color = pct >= 100 ? C.navy
                              : pct >= 90  ? C.medBlue
                              : C.red;
                  return (
                    <div key={p.projectName}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-xs font-medium" style={{ color: C.charcoal }}>
                          {shortName(p.projectName)}
                        </span>
                        <span className="text-xs font-bold" style={{ color }}>
                          {fmtPct(pct)}
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full overflow-hidden"
                           style={{ background: C.navyTint }}>
                        <div className="h-full rounded-full transition-all duration-500"
                             style={{ width: `${barPct}%`, background: color }} />
                      </div>
                      <div className="flex justify-between mt-0.5">
                        <span className="text-[9px]" style={{ color: C.slate }}>
                          Rev: {fmtSAR(p.revenue)}
                        </span>
                        <span className="text-[9px]" style={{ color: C.slate }}>
                          WO: {fmtSAR(p.workOrder)}
                        </span>
                      </div>
                    </div>
                  );
                })}
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
        <Section title="Management Summary">
          <ManagementTable projects={filteredProjects ?? []} loading={filteredLoading} />
        </Section>

      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer className="text-center py-4 text-[11px]" style={{ color: C.slate }}>
        ACES Managed Services Department · Project Revenue Dashboard · Confidential
      </footer>

      {showUpdateModal && <UpdateDataModal onClose={() => setShowUpdateModal(false)} />}
    </div>
  );
}
