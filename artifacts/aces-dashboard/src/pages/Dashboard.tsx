import { useState, useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
  ComposedChart, Area, ReferenceLine,
} from 'recharts';
import {
  useGetDashboardSummary,
  useGetMonthlyTrend,
  useGetProjectPerformance,
  useListProjects,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import logoUrl from '@assets/MSD_Logo_1785945599981.png';

// ─── Brand constants ────────────────────────────────────────────────
const C = {
  navy:    '#0D1928',
  red:     '#CC1F26',
  blue:    '#1A4E8A',
  blueL:   '#EAF2FD',
  green:   '#16A34A',
  greenL:  '#DCFCE7',
  amber:   '#D97706',
  amberL:  '#FEF3C7',
  grey:    '#9CA3AF',
  greyL:   '#F3F4F6',
};

// ─── Formatters ──────────────────────────────────────────────────────
function fmtSAR(n: number, compact = true): string {
  if (!isFinite(n)) return 'SAR 0';
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `SAR ${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000) return `SAR ${(n / 1_000).toFixed(1)}K`;
  }
  return `SAR ${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
function fmtPct(n: number): string { return `${Math.min(n, 999).toFixed(1)}%`; }
function fmtMonth(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
function shortName(n: string): string {
  return n.replace('ACES - NHP MS Project  O&M', 'NHP O&M').replace('Diesel Compensation', 'Diesel');
}

// ─── Mini helpers ─────────────────────────────────────────────────────
const Loading = () => (
  <div className="flex items-center justify-center h-32">
    <div className="w-6 h-6 border-2 border-[#1A4E8A] border-t-transparent rounded-full animate-spin" />
  </div>
);

// ─── KPI Card ─────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  accentBg?: string;
  icon?: React.ReactNode;
}
function KpiCard({ label, value, sub, accent = C.blue }: KpiCardProps) {
  return (
    <div className="bg-white rounded-lg p-4 flex flex-col gap-1" style={{
      boxShadow: '0 1px 4px rgba(13,25,40,0.08)',
      borderTop: `3px solid ${accent}`,
      borderRight: '1px solid #E5E7EB',
      borderBottom: '1px solid #E5E7EB',
      borderLeft: '1px solid #E5E7EB',
    }}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xl font-bold leading-tight" style={{ color: accent }}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────
function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg shadow-sm overflow-hidden ${className}`} style={{ boxShadow: '0 1px 4px rgba(13,25,40,0.08)' }}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <div className="w-1 h-4 rounded-full" style={{ background: C.red }} />
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex justify-between gap-3">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium">{typeof p.value === 'number' ? fmtSAR(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Update Data Modal ────────────────────────────────────────────────
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setResult(data);
      toast({ title: `Imported ${data.imported} records`, description: data.skipped > 0 ? `${data.skipped} rows skipped` : 'All rows processed' });
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-gray-900">Update Revenue Data</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none">&times;</button>
        </div>
        {!result ? (
          <>
            <p className="text-sm text-gray-500 mb-4">Upload a CSV file exported from Excel. Column headers should match the ACES MSD format.</p>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-blue-400 transition-colors">
              <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm text-gray-500">{file ? file.name : 'Click to select CSV file'}</span>
              <input type="file" accept=".csv" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <div className="flex gap-3 mt-4">
              <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleUpload}
                disabled={!file || loading}
                className="flex-1 px-4 py-2 text-sm text-white rounded-lg font-medium disabled:opacity-50"
                style={{ background: C.blue }}
              >
                {loading ? 'Importing…' : 'Import'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 p-3 rounded-lg mb-3" style={{ background: C.greenL }}>
              <span className="text-green-600 text-xl">✓</span>
              <div>
                <p className="text-sm font-semibold text-green-800">{result.imported} records imported</p>
                {result.skipped > 0 && <p className="text-xs text-green-600">{result.skipped} rows skipped</p>}
              </div>
            </div>
            {result.warnings.length > 0 && (
              <div className="mb-3 max-h-32 overflow-y-auto">
                {result.warnings.slice(0, 5).map((w: any, i: number) => (
                  <p key={i} className="text-xs text-amber-700 py-0.5">Row {w.row}: {w.message}</p>
                ))}
              </div>
            )}
            <button onClick={onClose} className="w-full px-4 py-2 text-sm text-white rounded-lg font-medium" style={{ background: C.blue }}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Portfolio Timeline ───────────────────────────────────────────────
function PortfolioTimeline({ projects }: { projects: any[] }) {
  const today = new Date();
  const sorted = [...projects].filter(p => p.contractStart).sort((a, b) => a.contractStart.localeCompare(b.contractStart));
  if (!sorted.length) return <p className="text-sm text-gray-400">No project timeline data</p>;

  const minDate = new Date(sorted[0].contractStart);
  const maxDate = new Date(Math.max(...sorted.map(p => p.contractEnd ? new Date(p.contractEnd).getTime() : today.getTime())));
  const totalMs = maxDate.getTime() - minDate.getTime();
  const pct = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - minDate.getTime()) / totalMs) * 100));

  const STATUS_COLOR: Record<string, string> = { ongoing: C.blue, completed: C.grey, closed: C.grey };

  return (
    <div className="space-y-2">
      {/* Today marker label */}
      <div className="relative ml-32">
        <div className="absolute" style={{ left: `${pct(today)}%`, transform: 'translateX(-50%)' }}>
          <span className="text-[10px] font-semibold" style={{ color: C.red }}>Today</span>
        </div>
      </div>
      {sorted.map(p => {
        const start = new Date(p.contractStart);
        const end = p.contractEnd ? new Date(p.contractEnd) : today;
        const left = pct(start);
        const width = Math.max(pct(end) - left, 1);
        const color = STATUS_COLOR[p.status] ?? C.grey;
        const todayPct = pct(today);
        const progressWidth = p.status === 'ongoing'
          ? Math.max(0, Math.min(width, todayPct - left))
          : width;

        return (
          <div key={p.id} className="flex items-center gap-2">
            <div className="w-32 flex-shrink-0 text-right">
              <span className="text-xs text-gray-600 font-medium truncate block">{shortName(p.name)}</span>
            </div>
            <div className="flex-1 h-6 bg-gray-100 rounded relative">
              {/* Background bar */}
              <div className="absolute h-full rounded opacity-30" style={{ left: `${left}%`, width: `${width}%`, background: color }} />
              {/* Progress bar */}
              <div className="absolute h-full rounded" style={{ left: `${left}%`, width: `${progressWidth}%`, background: color }} />
              {/* Today line */}
              <div className="absolute top-0 h-full w-0.5" style={{ left: `${todayPct}%`, background: C.red, opacity: 0.7 }} />
            </div>
            <div className="w-16 flex-shrink-0">
              <span className="text-[10px] text-gray-400">{p.contractEnd?.slice(0, 7) ?? '—'}</span>
            </div>
          </div>
        );
      })}
      <div className="ml-32 mt-1 flex justify-between pr-16">
        <span className="text-[10px] text-gray-400">{minDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
        <span className="text-[10px] text-gray-400">{maxDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
      </div>
    </div>
  );
}

// ─── Management Summary Table ─────────────────────────────────────────
function ManagementTable({ projects, loading }: { projects: any[]; loading: boolean }) {
  if (loading) return <Loading />;
  const total = projects.reduce((a, p) => ({
    poValue: a.poValue + p.poValue,
    totalRevenue: a.totalRevenue + p.totalRevenue,
    totalExpectedRevenue: a.totalExpectedRevenue + p.totalExpectedRevenue,
    totalInvoiced: a.totalInvoiced + p.totalInvoiced,
    totalCollected: a.totalCollected + p.totalCollected,
    totalOutstanding: a.totalOutstanding + p.totalOutstanding,
  }), { poValue: 0, totalRevenue: 0, totalExpectedRevenue: 0, totalInvoiced: 0, totalCollected: 0, totalOutstanding: 0 });

  const StatusBadge = ({ s }: { s: string }) => (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={s === 'ongoing' ? { background: C.blueL, color: C.blue } : { background: C.greyL, color: C.grey }}>
      {s}
    </span>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left" style={{ background: C.navy }}>
            {['Project', 'Status', 'Contract', 'PO Value', 'Expected Rev', 'Actual Rev', 'Invoiced', 'Collected', 'Outstanding', 'Achievement', 'Collection'].map(h => (
              <th key={h} className="px-3 py-2 text-white font-semibold first:rounded-tl last:rounded-tr whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p, i) => {
            const achPct = p.totalExpectedRevenue > 0 ? (p.totalRevenue / p.totalExpectedRevenue) * 100 : 0;
            const collPct = p.totalInvoiced > 0 ? (p.totalCollected / p.totalInvoiced) * 100 : 0;
            return (
              <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">{shortName(p.name)}</td>
                <td className="px-3 py-2"><StatusBadge s={p.status} /></td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {p.contractStart?.slice(0, 7) ?? '—'} → {p.contractEnd?.slice(0, 7) ?? '—'}
                </td>
                <td className="px-3 py-2 text-right font-medium" style={{ color: C.navy }}>{fmtSAR(p.poValue)}</td>
                <td className="px-3 py-2 text-right" style={{ color: C.grey }}>{fmtSAR(p.totalExpectedRevenue)}</td>
                <td className="px-3 py-2 text-right" style={{ color: C.blue }}>{fmtSAR(p.totalRevenue)}</td>
                <td className="px-3 py-2 text-right text-gray-700">{fmtSAR(p.totalInvoiced)}</td>
                <td className="px-3 py-2 text-right" style={{ color: C.green }}>{fmtSAR(p.totalCollected)}</td>
                <td className="px-3 py-2 text-right" style={{ color: p.totalOutstanding > 0 ? C.amber : C.grey }}>{fmtSAR(p.totalOutstanding)}</td>
                <td className="px-3 py-2 text-right">
                  <span className="font-semibold" style={{ color: achPct >= 90 ? C.green : achPct >= 70 ? C.amber : C.red }}>{fmtPct(achPct)}</span>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="font-semibold" style={{ color: collPct >= 90 ? C.green : collPct >= 70 ? C.amber : C.red }}>{fmtPct(collPct)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: '#EDF2F7', borderTop: `2px solid ${C.navy}` }}>
            <td className="px-3 py-2 font-bold text-gray-800 col-span-3" colSpan={3}>Portfolio Total</td>
            <td className="px-3 py-2 text-right font-bold" style={{ color: C.navy }}>{fmtSAR(total.poValue)}</td>
            <td className="px-3 py-2 text-right font-bold text-gray-600">{fmtSAR(total.totalExpectedRevenue)}</td>
            <td className="px-3 py-2 text-right font-bold" style={{ color: C.blue }}>{fmtSAR(total.totalRevenue)}</td>
            <td className="px-3 py-2 text-right font-bold text-gray-700">{fmtSAR(total.totalInvoiced)}</td>
            <td className="px-3 py-2 text-right font-bold" style={{ color: C.green }}>{fmtSAR(total.totalCollected)}</td>
            <td className="px-3 py-2 text-right font-bold" style={{ color: C.amber }}>{fmtSAR(total.totalOutstanding)}</td>
            <td className="px-3 py-2 text-right font-bold" style={{ color: total.totalExpectedRevenue > 0 ? (total.totalRevenue / total.totalExpectedRevenue >= 0.9 ? C.green : C.amber) : C.grey }}>
              {total.totalExpectedRevenue > 0 ? fmtPct((total.totalRevenue / total.totalExpectedRevenue) * 100) : '—'}
            </td>
            <td className="px-3 py-2 text-right font-bold" style={{ color: total.totalInvoiced > 0 ? (total.totalCollected / total.totalInvoiced >= 0.9 ? C.green : C.amber) : C.grey }}>
              {total.totalInvoiced > 0 ? fmtPct((total.totalCollected / total.totalInvoiced) * 100) : '—'}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────
export default function Dashboard() {
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const queryParams = {
    project: selectedProject || undefined,
    revenueYear: selectedYear ? Number(selectedYear) : undefined,
    revenueMonth: selectedMonth ? Number(selectedMonth) : undefined,
  };

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(queryParams);
  const { data: monthly, isLoading: monthlyLoading } = useGetMonthlyTrend(queryParams);
  const { data: performance, isLoading: perfLoading } = useGetProjectPerformance(
    selectedYear ? { revenueYear: Number(selectedYear) } : {}
  );
  const { data: projects, isLoading: projectsLoading } = useListProjects();

  // Derive years from projects
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    if (projects) {
      for (const p of projects) {
        if (p.contractStart) years.add(new Date(p.contractStart).getFullYear());
        if (p.contractEnd) years.add(new Date(p.contractEnd).getFullYear());
      }
    }
    years.add(new Date().getFullYear());
    return Array.from(years).sort();
  }, [projects]);

  const months = [
    { val: '1', label: 'January' }, { val: '2', label: 'February' }, { val: '3', label: 'March' },
    { val: '4', label: 'April' }, { val: '5', label: 'May' }, { val: '6', label: 'June' },
    { val: '7', label: 'July' }, { val: '8', label: 'August' }, { val: '9', label: 'September' },
    { val: '10', label: 'October' }, { val: '11', label: 'November' }, { val: '12', label: 'December' },
  ];

  const reset = () => { setSelectedProject(''); setSelectedYear(''); setSelectedMonth(''); };

  // Collection donut data
  const donutData = summary ? [
    { name: 'Collected', value: summary.totalCollected, color: C.green },
    { name: 'Outstanding', value: summary.totalOutstanding, color: C.amber },
    { name: 'Overdue', value: summary.totalOverdue, color: C.red },
  ].filter(d => d.value > 0) : [];

  // Last updated
  const lastUpdated = summary?.lastDataUpdate
    ? new Date(summary.lastDataUpdate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : 'N/A';

  // Reporting period label
  const reportingPeriod = selectedMonth && selectedYear
    ? `${months.find(m => m.val === selectedMonth)?.label} ${selectedYear}`
    : selectedYear
      ? `FY ${selectedYear}`
      : 'All Time';

  const selectCls = "text-xs border border-gray-300 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-[140px]";

  return (
    <div className="min-h-screen" style={{ background: '#F2F4F8' }}>
      {/* ── HEADER ─────────────────────────────────────────── */}
      <header className="aces-header px-6 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          {/* Left: logo + title */}
          <div className="flex items-center gap-4">
            <img src={logoUrl} alt="ACES Logo" className="h-12 w-auto flex-shrink-0" />
            <div className="border-l border-white/20 pl-4">
              <p className="text-[11px] font-medium tracking-widest uppercase text-white/60">Managed Services Department</p>
              <h1 className="text-base font-bold text-white leading-tight">Project Revenue Dashboard</h1>
            </div>
          </div>
          {/* Right: meta + action */}
          <div className="flex items-center gap-4 flex-shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-[11px] text-white/50">Reporting Period</p>
              <p className="text-sm font-semibold text-white">{reportingPeriod}</p>
            </div>
            <div className="text-right hidden md:block">
              <p className="text-[11px] text-white/50">Last Updated</p>
              <p className="text-sm font-semibold text-white">{lastUpdated}</p>
            </div>
            <button
              onClick={() => setShowUpdateModal(true)}
              className="px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex-shrink-0"
              style={{ background: C.red, color: '#fff' }}
            >
              Update Data
            </button>
          </div>
        </div>
      </header>

      {/* ── FILTER BAR ──────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="max-w-screen-2xl mx-auto flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Filters:</span>
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className={selectCls}>
            <option value="">All Projects</option>
            {(projects ?? []).map(p => <option key={p.id} value={p.name}>{shortName(p.name)}</option>)}
          </select>
          <select value={selectedYear} onChange={e => { setSelectedYear(e.target.value); if (!e.target.value) setSelectedMonth(''); }} className={selectCls}>
            <option value="">All Years</option>
            {availableYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} disabled={!selectedYear} className={selectCls + (selectedYear ? '' : ' opacity-50 cursor-not-allowed')}>
            <option value="">All Months</option>
            {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>
          {(selectedProject || selectedYear || selectedMonth) && (
            <button onClick={reset} className="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors">
              Reset Filters ✕
            </button>
          )}
        </div>
      </div>

      <main className="max-w-screen-2xl mx-auto px-6 py-5 space-y-5">
        {/* ── PRIMARY KPIs ─────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard
            label="Total PO Value"
            value={summaryLoading ? '…' : fmtSAR(summary?.totalPoValue ?? 0)}
            sub="Portfolio commitment"
            accent={C.navy}
            accentBg="#EDF2F7"
          />
          <KpiCard
            label="Expected Revenue"
            value={summaryLoading ? '…' : fmtSAR(summary?.totalExpectedRevenue ?? 0)}
            sub="Based on baselines"
            accent="#6B7280"
            accentBg={C.greyL}
          />
          <KpiCard
            label="Actual Revenue"
            value={summaryLoading ? '…' : fmtSAR(summary?.totalRevenue ?? 0)}
            sub={summaryLoading ? '' : `${fmtPct(summary?.revenueAchievementRate ?? 0)} achievement`}
            accent={C.blue}
            accentBg={C.blueL}
          />
          <KpiCard
            label="Invoiced"
            value={summaryLoading ? '…' : fmtSAR(summary?.totalInvoiced ?? 0)}
            sub={summaryLoading ? '' : `${fmtPct(summary?.invoiceConversionRate ?? 0)} of revenue`}
            accent="#0369A1"
            accentBg="#E0F2FE"
          />
          <KpiCard
            label="Collected"
            value={summaryLoading ? '…' : fmtSAR(summary?.totalCollected ?? 0)}
            sub={summaryLoading ? '' : `${fmtPct(summary?.collectionRate ?? 0)} collection rate`}
            accent={C.green}
            accentBg={C.greenL}
          />
          <KpiCard
            label="Outstanding"
            value={summaryLoading ? '…' : fmtSAR(summary?.totalOutstanding ?? 0)}
            sub={summaryLoading ? '' : (summary?.totalOverdue ?? 0) > 0 ? `${fmtSAR(summary!.totalOverdue)} overdue` : 'No overdue items'}
            accent={(summary?.totalOutstanding ?? 0) > 0 ? C.amber : C.grey}
            accentBg={C.amberL}
          />
        </div>

        {/* ── SECONDARY KPI STRIP ───────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-lg px-4 py-3 flex items-center gap-3" style={{ boxShadow: '0 1px 4px rgba(13,25,40,0.07)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: C.blueL }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth={2}>
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Net Revenue</p>
              <p className="text-sm font-bold" style={{ color: C.navy }}>{summaryLoading ? '…' : fmtSAR(summary?.totalNetRevenue ?? 0)}</p>
            </div>
          </div>
          <div className="bg-white rounded-lg px-4 py-3 flex items-center gap-3" style={{ boxShadow: '0 1px 4px rgba(13,25,40,0.07)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: (summary?.revenueAchievementRate ?? 0) >= 90 ? C.greenL : C.amberL }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={(summary?.revenueAchievementRate ?? 0) >= 90 ? C.green : C.amber} strokeWidth={2}>
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Revenue Achievement</p>
              <p className="text-sm font-bold" style={{ color: (summary?.revenueAchievementRate ?? 0) >= 90 ? C.green : C.amber }}>{summaryLoading ? '…' : fmtPct(summary?.revenueAchievementRate ?? 0)}</p>
            </div>
          </div>
          <div className="bg-white rounded-lg px-4 py-3 flex items-center gap-3" style={{ boxShadow: '0 1px 4px rgba(13,25,40,0.07)' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: (summary?.collectionRate ?? 0) >= 90 ? C.greenL : C.amberL }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={(summary?.collectionRate ?? 0) >= 90 ? C.green : C.amber} strokeWidth={2}>
                <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Collection Rate</p>
              <p className="text-sm font-bold" style={{ color: (summary?.collectionRate ?? 0) >= 90 ? C.green : C.amber }}>{summaryLoading ? '…' : fmtPct(summary?.collectionRate ?? 0)}</p>
            </div>
          </div>
        </div>

        {/* ── CHARTS ROW 1: Monthly + Donut ─────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <Section title="Monthly Financial Performance" className="xl:col-span-2">
            {monthlyLoading ? <Loading /> : (
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={monthly ?? []} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                  <YAxis tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 10, fill: '#9CA3AF' }} width={48} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="expectedRevenue" name="Expected" fill={C.blueL} stroke="#9CA3AF" strokeDasharray="4 2" strokeWidth={1.5} fillOpacity={0.4} />
                  <Bar dataKey="revenue" name="Actual Revenue" fill={C.blue} radius={[2, 2, 0, 0]} maxBarSize={20} />
                  <Bar dataKey="invoiced" name="Invoiced" fill="#0369A1" radius={[2, 2, 0, 0]} maxBarSize={20} opacity={0.75} />
                  <Line type="monotone" dataKey="collected" name="Collected" stroke={C.green} strokeWidth={2} dot={{ r: 2.5, fill: C.green }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Section>

          <Section title="Collection Overview">
            {summaryLoading ? <Loading /> : (
              <div className="flex flex-col">
                {/* Donut with center overlay */}
                <div className="relative w-full" style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={62} outerRadius={88} paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270}>
                        {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => [fmtSAR(v), '']} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label — absolute overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Collection Rate</p>
                    <p className="text-2xl font-bold leading-tight" style={{ color: (summary?.collectionRate ?? 0) >= 90 ? C.green : C.amber }}>
                      {fmtPct(summary?.collectionRate ?? 0)}
                    </p>
                  </div>
                </div>
                {/* Legend */}
                <div className="grid grid-cols-3 gap-3 mt-2 text-center">
                  {donutData.map(d => (
                    <div key={d.name}>
                      <div className="w-3 h-3 rounded-full mx-auto mb-1" style={{ background: d.color }} />
                      <p className="text-[10px] text-gray-500">{d.name}</p>
                      <p className="text-xs font-semibold" style={{ color: d.color }}>{fmtSAR(d.value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </div>

        {/* ── CHARTS ROW 2: Project Performance + Achievement ─ */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <Section title="Project Financial Performance">
            {perfLoading ? <Loading /> : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={(performance ?? []).map(p => ({ ...p, projectName: shortName(p.projectName) }))} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `${(v / 1_000_000).toFixed(0)}M`} tick={{ fontSize: 10, fill: '#9CA3AF' }} />
                  <YAxis type="category" dataKey="projectName" tick={{ fontSize: 10, fill: '#374151' }} width={88} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="revenue" name="Actual Revenue" fill={C.blue} radius={[0, 3, 3, 0]} maxBarSize={12} />
                  <Bar dataKey="invoiced" name="Invoiced" fill="#0369A1" radius={[0, 3, 3, 0]} maxBarSize={12} opacity={0.7} />
                  <Bar dataKey="collected" name="Collected" fill={C.green} radius={[0, 3, 3, 0]} maxBarSize={12} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Section>

          <Section title="Revenue Achievement by Project">
            {perfLoading ? <Loading /> : (
              <div className="space-y-3 pt-1">
                {(performance ?? []).map(p => {
                  const pct = Math.min(p.revenueAchievementPct, 100);
                  const color = pct >= 90 ? C.green : pct >= 70 ? C.amber : C.red;
                  return (
                    <div key={p.projectName}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="text-xs text-gray-700 font-medium">{shortName(p.projectName)}</span>
                        <span className="text-xs font-bold" style={{ color }}>{fmtPct(p.revenueAchievementPct)}</span>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        {/* ── PROJECT PORTFOLIO TIMELINE ───────────────────── */}
        <Section title="Project Portfolio Timeline">
          {projectsLoading ? <Loading /> : <PortfolioTimeline projects={projects ?? []} />}
        </Section>

        {/* ── MANAGEMENT SUMMARY TABLE ─────────────────────── */}
        <Section title="Management Summary">
          <ManagementTable projects={projects ?? []} loading={projectsLoading} />
        </Section>
      </main>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <footer className="text-center py-4 text-[11px] text-gray-400">
        ACES Managed Services Department · Revenue Dashboard · Confidential
      </footer>

      {showUpdateModal && <UpdateDataModal onClose={() => setShowUpdateModal(false)} />}
    </div>
  );
}
