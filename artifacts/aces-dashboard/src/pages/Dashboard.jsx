import { useState, useMemo, useEffect } from 'react';
import { Area, Bar, Cell, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import { buildDashboardData, parseRevenueFile } from '@/lib/local-revenue-data';
import { announceVersionPublished, loadActiveRevenueData, uploadRevenueVersion, watchActiveVersion } from '@/lib/revenue-repository';
import logoUrl from '@assets/MSD_Logo_1785945599981.png';
import riyalSignUrl from '@assets/riyal-sign.png';
// ── Brand palette – strict ACES Navy · Red · Slate theme ─────────────
const C = {
    canvasNavy: '#0B1F42', // Full-page executive canvas
    headerNavy: '#071831', // Deeper navigation/header layer
    navy: '#122E64', // ACES Navy — primary brand colour
    blue: '#1769E0', // Revenue / primary data series
    cyan: '#19B8D1', // Invoiced / secondary data series
    teal: '#18A89B', // Collected / positive data series
    amber: '#F4B740', // Net revenue / trend highlight
    coral: '#F0645A', // Deductions / attention series
    violet: '#7657D5', // Additional project distinction
    chartPanel: '#0D2850', // Slightly dark chart surface
    chartGrid: 'rgba(255,255,255,0.28)', // White grid on dark chart surface
    chartText: '#FFFFFF', // Bold white chart axis and legend text
    kpiPanel: '#173A67', // Soft dark navy KPI surface
    medBlue: '#485D86', // Medium blue — Collected series
    mutedBlue: '#6F82A6', // Muted blue shade
    red: '#EF1E34', // ACES Red — negative / warnings
    redDark: '#9C1C2A', // ACES Red Dark — hover
    critDark: '#B51226', // Critical dark red — Overdue
    charcoal: '#303846', // Charcoal — primary text / Net Revenue chart
    slate: '#7B8495', // Slate — muted / secondary
    light: '#F4F5F7', // Page background
    border: '#D9DEE7', // Card & input borders
    navyTint: '#E7EAF0', // Light grey track / tint
    white: '#FFFFFF',
};
// ── Formatters ───────────────────────────────────────────────────────
/** Numeric-only, 2 decimal places – used by RiyalAmt and string contexts */
function fmtNum(n) {
    if (!isFinite(n))
        return '0.00';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** For chart tooltips / string-only contexts */
function fmtSARStr(n) { return `${fmtNum(n)}`; }
/** Inline riyal-sign + number, rendered as JSX everywhere */
function RiyalAmt({ n, style, accounting = false }) {
    const negative = n < 0;
    const value = accounting && negative ? Math.abs(n) : n;
    return (<span className="inline-flex items-center gap-0.5" style={style}>
      {accounting && negative ? '(' : null}
      <img src={riyalSignUrl} alt="﷼" className="inline-block" style={{ height: '0.9em', width: 'auto', verticalAlign: 'middle', filter: 'brightness(0) saturate(100%)' }}/>
      {fmtNum(value)}
      {accounting && negative ? ')' : null}
    </span>);
}
/** Compact numeric for chart axes only (no SAR prefix, 0 decimals) */
function fmtAxis(n) {
    if (Math.abs(n) >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000)
        return `${(n / 1_000).toFixed(0)}K`;
    return n.toFixed(0);
}
function fmtPct(n) { return `${Math.min(n, 999).toFixed(1)}%`; }
function fmtMonth(m) {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1)
        .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
function shortName(n) {
    return n
        .replace('ACES - NHP MS Project  O&M', 'NHP O&M')
        .replace('Diesel Compensation', 'Diesel');
}
// ── Micro helpers ─────────────────────────────────────────────────────
const Loading = () => (<div className="flex items-center justify-center h-32">
    <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${C.red} transparent ${C.red} ${C.red}` }}/>
  </div>);
function KpiCard({ label, value, sub, valueColor = C.charcoal, icon, tooltip }) {
    return (<div className="kpi-card rounded-xl flex flex-col gap-1 p-4 min-w-0 min-h-[112px]" title={tooltip} style={{
            background: C.kpiPanel,
            border: '1px solid rgba(255,255,255,0.16)',
            borderLeft: `4px solid ${valueColor}`,
            boxShadow: '0 8px 24px rgba(2,12,30,0.22)',
            cursor: tooltip ? 'help' : undefined,
        }}>
      <div className="flex items-center gap-1.5">
        {icon && <span className="flex-shrink-0 opacity-60">{icon}</span>}
        <p className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: '#FFFFFF' }}>{label}</p>
      </div>
      <div className="font-bold leading-tight mt-2 truncate" style={{
            color: valueColor,
            fontSize: 'clamp(1.05rem, 1.55vw, 1.65rem)',
        }}>{value}</div>
      {sub && <div className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.72)' }}>{sub}</div>}
    </div>);
}
// ── Section wrapper ───────────────────────────────────────────────────
function Section({ title, children, className = '' }) {
    return (<div className={`rounded-xl overflow-hidden flex flex-col min-h-0 ${className}`} style={{
            background: C.chartPanel,
            border: '1px solid rgba(111,155,210,0.30)',
            boxShadow: '0 8px 24px rgba(2,12,30,0.22)',
        }}>
      <div className="relative overflow-hidden px-4 py-2.5 border-b flex items-center" style={{ borderColor: 'rgba(255,255,255,0.10)', background: C.headerNavy }}>
        <h2 className="relative z-10 text-[13px] leading-5 font-semibold text-white">{title}</h2>
        <span className="absolute right-4 h-1.5 w-16 rounded-full" style={{ background: `linear-gradient(90deg, ${C.blue}, ${C.cyan}, ${C.amber}, ${C.red})` }}/>
      </div>
      <div className="p-4 flex-1 min-h-0">{children}</div>
    </div>);
}
// ── Chart tooltip – full SAR values ───────────────────────────────────
function ChartTooltip({ active, payload, label }) {
    if (!active || !payload?.length)
        return null;
    return (<div className="bg-white rounded-lg p-3 text-xs min-w-[220px]" style={{
            border: `1px solid ${C.border}`,
            boxShadow: '0 4px 12px rgba(18,46,100,0.12)',
        }}>
      <p className="font-semibold mb-2" style={{ color: C.navy }}>{label}</p>
      {payload.map((p) => (<div key={p.name} className="flex justify-between gap-3 py-0.5">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-medium" style={{ color: C.charcoal }}>
            {typeof p.value === 'number' ? <RiyalAmt n={p.value}/> : p.value}
          </span>
        </div>))}
    </div>);
}
const PROJECT_COLORS = [C.blue, C.cyan, C.teal, C.amber, C.coral, C.violet, C.medBlue, C.red];
function polarPoint(cx, cy, radius, angle) {
    const radians = (angle - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(radians), y: cy + radius * Math.sin(radians) };
}
function radialPanelPath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
    const outerStart = polarPoint(cx, cy, outerRadius, endAngle);
    const outerEnd = polarPoint(cx, cy, outerRadius, startAngle);
    const innerStart = polarPoint(cx, cy, innerRadius, startAngle);
    const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return [
        `M ${outerStart.x} ${outerStart.y}`,
        `A ${outerRadius} ${outerRadius} 0 ${largeArc} 0 ${outerEnd.x} ${outerEnd.y}`,
        `L ${innerStart.x} ${innerStart.y}`,
        `A ${innerRadius} ${innerRadius} 0 ${largeArc} 1 ${innerEnd.x} ${innerEnd.y}`,
        'Z',
    ].join(' ');
}
function ProjectRevenueInfographic({ data, total }) {
    const [hovered, setHovered] = useState(null);
    const cx = 194, cy = 154, innerRadius = 75;
    const extensions = [34, 14, 27, 10, 22, 16];
    let cursor = 0;
    const panels = data.map((item, index) => {
        const share = total > 0 ? item.revenue / total : 0;
        const fullAngle = share * 360;
        const gap = Math.min(2.4, fullAngle * 0.16);
        const startAngle = cursor + gap / 2;
        const endAngle = cursor + fullAngle - gap / 2;
        cursor += fullAngle;
        const outerRadius = 132 + extensions[index % extensions.length];
        const midAngle = (startAngle + endAngle) / 2;
        const labelPoint = polarPoint(cx, cy, innerRadius + (outerRadius - innerRadius) * 0.61, midAngle);
        return { ...item, share, startAngle, endAngle, outerRadius, labelPoint };
    });
    return (<div className="project-infographic h-full w-full">
      <svg viewBox="0 -12 610 334" className="h-full w-full" role="img" aria-label="Project revenue share infographic">
        <defs>
          <filter id="infographicShadow" x="-35%" y="-35%" width="170%" height="170%">
            <feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#020C1E" floodOpacity="0.38"/>
          </filter>
          <linearGradient id="infographicCenter" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFFFFF"/>
            <stop offset="100%" stopColor="#DDE6F2"/>
          </linearGradient>
        </defs>

        {panels.map((panel, index) => {
            const active = hovered === null || hovered === index;
            const showInside = panel.share >= 0.075;
            return (<g key={panel.project} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} className="project-infographic-segment" opacity={active ? 1 : 0.40}>
              <path d={radialPanelPath(cx, cy, innerRadius, panel.outerRadius, panel.startAngle, panel.endAngle)} fill={PROJECT_COLORS[index % PROJECT_COLORS.length]} stroke={C.chartPanel} strokeWidth="3" filter="url(#infographicShadow)">
                <title>{`${panel.project}: ${fmtSARStr(panel.revenue)} SAR (${(panel.share * 100).toFixed(1)}%)`}</title>
              </path>
              {showInside && <text x={panel.labelPoint.x} y={panel.labelPoint.y} textAnchor="middle" fill="#FFFFFF" pointerEvents="none">
                <tspan x={panel.labelPoint.x} dy="-0.45em" fontSize="9" fontWeight="800">{panel.project.length > 12 ? `${panel.project.slice(0, 11)}…` : panel.project}</tspan>
                <tspan x={panel.labelPoint.x} dy="1.35em" fontSize="16" fontWeight="900">{(panel.share * 100).toFixed(0)}%</tspan>
              </text>}
            </g>);
        })}

        <circle cx={cx} cy={cy + 7} r="66" fill="rgba(2,12,30,0.34)"/>
        <circle cx={cx} cy={cy} r="66" fill="url(#infographicCenter)" stroke="#FFFFFF" strokeWidth="5" filter="url(#infographicShadow)"/>
        <text x={cx} y={cy - 9} textAnchor="middle" fill={C.navy} fontSize="10" fontWeight="800">TOTAL REVENUE</text>
        <text x={cx} y={cy + 17} textAnchor="middle" fill={C.headerNavy} fontSize="20" fontWeight="900">{fmtAxis(total)}</text>

        <text x="465" y="24" fill="#FFFFFF" fontSize="11" fontWeight="800" letterSpacing="1">PROJECT CONTRIBUTION</text>
        {panels.map((panel, index) => {
            const y = 53 + index * 40;
            return (<g key={`callout-${panel.project}`} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} className="project-infographic-callout" opacity={hovered === null || hovered === index ? 1 : 0.38}>
              <circle cx="475" cy={y} r="12" fill={PROJECT_COLORS[index % PROJECT_COLORS.length]}/>
              <text x="475" y={y + 4} textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="900">{index + 1}</text>
              <text x="495" y={y - 2} fill="#FFFFFF" fontSize="10" fontWeight="800">{panel.project}</text>
              <text x="495" y={y + 12} fill="#BFD0E8" fontSize="9" fontWeight="600">{fmtAxis(panel.revenue)} · {(panel.share * 100).toFixed(1)}%</text>
            </g>);
        })}
      </svg>
    </div>);
}
// ── Update Data Modal ─────────────────────────────────────────────────
function UpdateDataModal({ onClose, onPublished }) {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const { toast } = useToast();
    const handleUpload = async () => {
        if (!file)
            return;
        setLoading(true);
        try {
            const records = await parseRevenueFile(file);
            const data = await uploadRevenueVersion(file, records);
            announceVersionPublished();
            await onPublished();
            setResult(data);
            toast({ title: `Published version ${data.version_number}`, description: `${data.imported} records are now synchronized.` });
        }
        catch (err) {
            toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
        }
        finally {
            setLoading(false);
        }
    };
    return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold" style={{ color: C.navy }}>Update Revenue Data</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">&times;</button>
        </div>
        {!result ? (<>
            <p className="text-sm mb-3" style={{ color: C.slate }}>
              Upload the ACES MSD Excel workbook. It will be stored as a private, numbered version and synchronized to every dashboard.
            </p>
            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer transition-colors" style={{ borderColor: C.border }} onMouseOver={e => (e.currentTarget.style.borderColor = C.red)} onMouseOut={e => (e.currentTarget.style.borderColor = C.border)}>
              <svg className="w-8 h-8 mb-2" fill="none" stroke={C.slate} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
              </svg>
              <span className="text-sm" style={{ color: C.slate }}>
                {file ? file.name : 'Click to select Excel file'}
              </span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)}/>
            </label>
            <div className="flex gap-3 mt-4">
              <button onClick={onClose} className="flex-1 px-4 py-2 text-sm border rounded-lg hover:bg-gray-50" style={{ borderColor: C.border, color: C.charcoal }}>
                Cancel
              </button>
              <button onClick={handleUpload} disabled={!file || loading} className="flex-1 px-4 py-2 text-sm text-white rounded-lg font-semibold disabled:opacity-50" style={{ background: C.red }}>
                {loading ? 'Publishing…' : 'Publish Version'}
              </button>
            </div>
          </>) : (<>
            <div className="flex items-center gap-3 p-3 rounded-lg mb-3" style={{ background: C.navyTint }}>
              <span className="text-xl font-bold" style={{ color: C.navy }}>✓</span>
              <p className="text-sm font-semibold" style={{ color: C.navy }}>Version {result.version_number} published · {result.imported} records</p>
            </div>
            {result.warnings.slice(0, 5).map((w, i) => (<p key={i} className="text-xs text-amber-700 py-0.5">Row {w.row}: {w.message}</p>))}
            <button onClick={onClose} className="w-full mt-3 px-4 py-2 text-sm text-white rounded-lg font-semibold" style={{ background: C.navy }}>Done</button>
          </>)}
      </div>
    </div>);
}
// ── Portfolio Timeline ────────────────────────────────────────────────
function PortfolioTimeline({ projects }) {
    const today = new Date();
    const sorted = [...projects]
        .filter(p => p.contractStart)
        .sort((a, b) => a.contractStart.localeCompare(b.contractStart));
    if (!sorted.length)
        return <p className="text-sm" style={{ color: C.slate }}>No timeline data</p>;
    const minDate = new Date(sorted[0].contractStart);
    const maxDate = new Date(Math.max(...sorted.map(p => p.contractEnd ? new Date(p.contractEnd).getTime() : today.getTime())));
    const totalMs = maxDate.getTime() - minDate.getTime();
    const pct = (d) => Math.max(0, Math.min(100, ((d.getTime() - minDate.getTime()) / totalMs) * 100));
    return (<div className="space-y-2.5">
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
            return (<div key={p.id} className="flex items-center gap-2">
            <div className="w-36 flex-shrink-0 text-right">
              <span className="text-xs font-medium truncate block" style={{ color: C.charcoal }}>
                {shortName(p.name)}
              </span>
            </div>
            <div className="flex-1 h-5 rounded relative" style={{ background: C.navyTint }}>
              <div className="absolute h-full rounded opacity-25" style={{ left: `${left}%`, width: `${width}%`,
                    background: isOngoing ? C.navy : C.slate }}/>
              <div className="absolute h-full rounded" style={{ left: `${left}%`, width: `${progressWidth}%`,
                    background: isOngoing ? C.navy : C.slate }}/>
              <div className="absolute top-0 h-full w-px" style={{ left: `${todayPct}%`, background: C.red, opacity: 0.7 }}/>
            </div>
            <div className="w-14 flex-shrink-0">
              <span className="text-[10px]" style={{ color: C.slate }}>
                {p.contractEnd?.slice(0, 7) ?? '—'}
              </span>
            </div>
          </div>);
        })}
      <div className="ml-36 mt-1 flex justify-between pr-14">
        <span className="text-[10px]" style={{ color: C.slate }}>
          {minDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </span>
        <span className="text-[10px]" style={{ color: C.slate }}>
          {maxDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </span>
      </div>
    </div>);
}
/** Thin progress bar for achievement / collection rate */
function RatioBadge({ pct, threshHigh, threshMid }) {
    const color = pct >= threshHigh ? C.navy : pct >= threshMid ? C.medBlue : C.red;
    const barW = Math.min(pct, 100);
    return (<div className="flex flex-col items-end gap-0.5" style={{ minWidth: 72 }}>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
        {pct > 0 ? fmtPct(pct) : '0.0%'}
      </span>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 3, background: C.navyTint }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${barW}%`, background: color }}/>
      </div>
    </div>);
}
/** Excel-style conditional-formatting bar with a target-aware two-colour scale. */
function PerformanceBar({ pct, target, label }) {
    const safePct = Number.isFinite(pct) ? Math.max(pct, 0) : 0;
    const achieved = Math.min(safePct, 100);
    const isOnTarget = safePct >= target;
    const fill = isOnTarget ? C.navy : C.red;
    const track = isOnTarget ? C.navyTint : '#FDE8EB';
    return (<div className="min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[10px] font-medium truncate" style={{ color: C.slate }}>{label}</span>
        <span className="text-[11px] font-bold tabular-nums" style={{ color: fill }}>
          {fmtPct(safePct)}
        </span>
      </div>
      <div className="relative h-3 rounded-sm overflow-hidden" style={{ background: track }}>
        <div className="h-full transition-all duration-500" style={{ width: `${achieved}%`, background: fill }}/>
        <div className="absolute inset-y-0 w-px bg-white/90" style={{ left: `${Math.min(target, 100)}%` }}/>
      </div>
    </div>);
}
/** Monetary cell — shows — for zero, full value otherwise */
function MoneyCell({ n, color, bold }) {
    if (n === 0)
        return (<span className="tabular-nums" style={{ color: C.slate }}>—</span>);
    return (<span className={`tabular-nums inline-flex items-center gap-0.5 ${bold ? 'font-semibold' : ''}`} style={{ color }}>
      <img src={riyalSignUrl} alt="﷼" className="inline-block flex-shrink-0" style={{ height: '0.85em', width: 'auto', verticalAlign: 'middle',
            filter: 'brightness(0) saturate(100%)', opacity: bold ? 1 : 0.85 }}/>
      {fmtNum(n)}
    </span>);
}
function ManagementTable({ projects, loading }) {
    const [sortKey, setSortKey] = useState('revenue');
    const [sortDir, setSortDir] = useState('desc');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState(null);
    const [collapsed, setCollapsed] = useState(false);
    const toggle = (k) => {
        if (sortKey === k)
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else {
            setSortKey(k);
            setSortDir('desc');
        }
    };
    const enriched = useMemo(() => projects.map(p => ({
        ...p,
        achievement: p.totalExpectedRevenue > 0 ? (p.totalRevenue / p.totalExpectedRevenue) * 100 : 0,
        collectionRate: p.totalInvoiced > 0 ? (p.totalCollected / p.totalInvoiced) * 100 : 0,
    })), [projects]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? enriched.filter(p => p.name.toLowerCase().includes(q)) : enriched;
    }, [enriched, search]);
    const sorted = useMemo(() => [...filtered].sort((a, b) => {
        let va, vb;
        switch (sortKey) {
            case 'name':
                va = a.name;
                vb = b.name;
                break;
            case 'workOrder':
                va = a.totalWorkOrder;
                vb = b.totalWorkOrder;
                break;
            case 'revenue':
                va = a.totalRevenue;
                vb = b.totalRevenue;
                break;
            case 'deductible':
                va = a.totalDeductible;
                vb = b.totalDeductible;
                break;
            case 'invoiced':
                va = a.totalInvoiced;
                vb = b.totalInvoiced;
                break;
            case 'collected':
                va = a.totalCollected;
                vb = b.totalCollected;
                break;
            case 'outstanding':
                va = a.totalOutstanding;
                vb = b.totalOutstanding;
                break;
            case 'penalties':
                va = a.totalPenalties;
                vb = b.totalPenalties;
                break;
            case 'netRevenue':
                va = a.totalNetRevenue;
                vb = b.totalNetRevenue;
                break;
            case 'achievement':
                va = a.achievement;
                vb = b.achievement;
                break;
            case 'collectionRate':
                va = a.collectionRate;
                vb = b.collectionRate;
                break;
            default:
                va = 0;
                vb = 0;
        }
        if (typeof va === 'string')
            return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortDir === 'asc' ? va - vb : vb - va;
    }), [filtered, sortKey, sortDir]);
    const total = useMemo(() => sorted.reduce((a, p) => ({
        workOrder: a.workOrder + (p.totalWorkOrder ?? 0),
        revenue: a.revenue + p.totalRevenue,
        expected: a.expected + p.totalExpectedRevenue,
        invoiced: a.invoiced + p.totalInvoiced,
        collected: a.collected + p.totalCollected,
        outstanding: a.outstanding + p.totalOutstanding,
        deductible: a.deductible + (p.totalDeductible ?? 0),
        penalties: a.penalties + (p.totalPenalties ?? 0),
        netRevenue: a.netRevenue + (p.totalNetRevenue ?? 0),
    }), { workOrder: 0, revenue: 0, expected: 0, invoiced: 0, collected: 0,
        outstanding: 0, deductible: 0, penalties: 0, netRevenue: 0 }), [sorted]);
    const totalAch = total.expected > 0 ? (total.revenue / total.expected) * 100 : 0;
    const totalColl = total.invoiced > 0 ? (total.collected / total.invoiced) * 100 : 0;
    /** Sort arrow indicator */
    const SortArrow = ({ k }) => {
        if (sortKey !== k)
            return <span className="opacity-0 group-hover:opacity-40 ml-0.5 text-[9px]">↕</span>;
        return <span className="ml-0.5 text-[9px]">{sortDir === 'asc' ? '↑' : '↓'}</span>;
    };
    /** Sortable header cell */
    const SH = ({ k, label, right }) => (<th onClick={() => toggle(k)} className={`group px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider
                    whitespace-nowrap cursor-pointer select-none transition-colors duration-150
                    ${right ? 'text-right' : 'text-left'}`} style={{ color: '#fff', userSelect: 'none' }}>
      <span className="inline-flex items-center gap-0.5 justify-end w-full">
        {right && <SortArrow k={k}/>}
        {label}
        {!right && <SortArrow k={k}/>}
      </span>
    </th>);
    // Sticky project column styles
    const stickyProjStyle = {
        position: 'sticky', left: 0, zIndex: 2,
        boxShadow: '2px 0 6px rgba(18,46,100,0.08)',
    };
    if (loading)
        return (<div className="flex items-center justify-center h-40">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${C.red} transparent ${C.red} ${C.red}` }}/>
    </div>);
    /* ── Mobile card layout ──────────────────────────────────────────── */
    const MobileCard = ({ p }) => (<div className="rounded-xl p-4 mb-3 transition-all duration-150" style={{
            background: C.white, border: `1px solid ${C.border}`,
            boxShadow: '0 1px 4px rgba(18,46,100,0.07)',
            borderLeft: selectedId === p.id ? `4px solid ${C.red}` : `4px solid transparent`,
        }} onClick={() => setSelectedId(id => id === p.id ? null : p.id)}>
      <p className="font-semibold text-sm mb-2" style={{ color: C.navy }}>{p.name}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        {[
            ['Work Order', p.totalWorkOrder ?? 0, C.navy],
            ['Revenue', p.totalRevenue, C.navy],
            ['Invoiced', p.totalInvoiced, C.charcoal],
            ['Collected', p.totalCollected, C.medBlue],
            ['Outstanding', p.totalOutstanding, p.totalOutstanding > 0 ? C.red : C.slate],
            ['Net Revenue', p.totalNetRevenue ?? 0, (p.totalNetRevenue ?? 0) >= 0 ? C.navy : C.red],
        ].map(([lbl, val, col]) => (<div key={lbl}>
            <span className="block text-[9px] uppercase tracking-wide mb-0.5" style={{ color: C.slate }}>{lbl}</span>
            <MoneyCell n={val} color={col}/>
          </div>))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <span className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: C.slate }}>Achievement</span>
          <RatioBadge pct={p.achievement} threshHigh={100} threshMid={90}/>
        </div>
        <div>
          <span className="block text-[9px] uppercase tracking-wide mb-1" style={{ color: C.slate }}>Collection Rate</span>
          <RatioBadge pct={p.collectionRate} threshHigh={90} threshMid={70}/>
        </div>
      </div>
    </div>);
    return (<div className="management-summary rounded-2xl overflow-hidden" style={{ background: C.white, border: `1px solid ${C.border}`,
            boxShadow: '0 10px 28px rgba(2,12,30,0.25)' }}>

      {/* ── Card header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.border }}>
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: C.red }}/>
          <div>
            <h2 className="text-sm font-bold leading-tight" style={{ color: C.navy }}>Management Summary</h2>
            <p className="text-[11px] mt-0.5" style={{ color: C.slate }}>Financial performance by project</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: C.navyTint, color: C.navy }}>
            {sorted.length} project{sorted.length !== 1 ? 's' : ''}
          </span>
          {/* Search */}
          <input type="text" value={search} placeholder="Search project…" onChange={e => setSearch(e.target.value)} className="text-[11px] rounded-lg px-2.5 py-1.5 outline-none transition-colors" style={{ border: `1px solid ${C.border}`, color: C.charcoal,
            background: C.white, width: 160 }}/>
          <button type="button" onClick={() => setCollapsed(value => !value)} aria-expanded={!collapsed} className="text-[11px] font-semibold rounded-lg px-3 py-1.5 transition-colors" style={{ border: `1px solid ${C.border}`, color: C.navy, background: C.white }}>
            {collapsed ? 'Expand ▾' : 'Collapse ▴'}
          </button>
        </div>
      </div>

      {!collapsed && <>
      {/* ── Mobile cards ─────────────────────────────────────────────── */}
      <div className="md:hidden p-4">
        {sorted.length === 0
            ? <p className="text-center py-8 text-[12px]" style={{ color: C.slate }}>No projects match.</p>
            : sorted.map(p => <MobileCard key={p.id} p={p}/>)}
      </div>

      {/* ── Desktop table ────────────────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[11px]" style={{ minWidth: 1280, borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            {/* Level 1 — Group headers */}
            <tr style={{ background: C.navy }}>
              <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest whitespace-nowrap rounded-tl-none" style={{ ...stickyProjStyle, background: C.navy, color: '#fff' }}>
                PROJECT
              </th>
              {/* Financial Performance group */}
              <th colSpan={8} className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest" style={{ color: '#fff', borderLeft: `1px solid rgba(255,255,255,0.15)` }}>
                FINANCIAL PERFORMANCE
              </th>
              {/* Performance Ratios group */}
              <th colSpan={2} className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest" style={{ color: '#fff', borderLeft: `1px solid rgba(255,255,255,0.15)` }}>
                PERFORMANCE RATIOS
              </th>
            </tr>
            {/* Level 2 — Column headers */}
            <tr style={{ background: '#1a3a78' }}>
              <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap text-white" style={{ ...stickyProjStyle, background: '#1a3a78', cursor: 'pointer' }} onClick={() => toggle('name')}>
                <span className="group inline-flex items-center gap-0.5">
                  Project <SortArrow k="name"/>
                </span>
              </th>
              <SH k="workOrder" label="Work Order" right/>
              <SH k="revenue" label="Revenue" right/>
              <SH k="deductible" label="Deductible" right/>
              <SH k="invoiced" label="Invoiced" right/>
              <SH k="collected" label="Collected" right/>
              <SH k="outstanding" label="Outstanding" right/>
              <SH k="penalties" label="Penalties" right/>
              <SH k="netRevenue" label="Net Revenue" right/>
              <SH k="achievement" label="Achievement" right/>
              <SH k="collectionRate" label="Collection" right/>
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 ? (<tr>
                <td colSpan={11} className="text-center py-12" style={{ color: C.slate, fontSize: 12 }}>
                  No projects match your search.
                </td>
              </tr>) : sorted.map((p, i) => {
            const isSelected = selectedId === p.id;
            const rowBg = isSelected ? '#EEF2FA' : i % 2 === 0 ? C.white : '#F8F9FB';
            return (<tr key={p.id} onClick={() => setSelectedId(id => id === p.id ? null : p.id)} style={{ background: rowBg, cursor: 'pointer',
                    transition: 'background 150ms ease' }} onMouseEnter={e => { if (!isSelected)
                e.currentTarget.style.background = '#F0F4FF'; }} onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}>

                  {/* Sticky project cell */}
                  <td className="px-3 py-3 font-semibold whitespace-nowrap text-left" style={{
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
                    <MoneyCell n={p.totalWorkOrder ?? 0} color={C.navy}/>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalRevenue} color={C.navy}/>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalDeductible ?? 0} color={(p.totalDeductible ?? 0) > 0 ? C.red : C.slate}/>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalInvoiced} color={C.charcoal}/>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalCollected} color={C.medBlue}/>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalOutstanding} color={p.totalOutstanding > 0 ? C.red : C.slate}/>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalPenalties ?? 0} color={(p.totalPenalties ?? 0) > 0 ? C.critDark : C.slate}/>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <MoneyCell n={p.totalNetRevenue ?? 0} color={(p.totalNetRevenue ?? 0) >= 0 ? C.navy : C.red} bold/>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ minWidth: 90 }}>
                    <RatioBadge pct={p.achievement} threshHigh={100} threshMid={90}/>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ minWidth: 90 }}>
                    <RatioBadge pct={p.collectionRate} threshHigh={90} threshMid={70}/>
                  </td>
                </tr>);
        })}
          </tbody>

          {/* ── Portfolio Total ────────────────────────────────────── */}
          <tfoot>
            <tr style={{ background: C.navyTint, borderTop: `2px solid ${C.navy}` }}>
              <td className="px-3 py-3 font-bold text-left whitespace-nowrap" style={{ ...stickyProjStyle, background: C.navyTint, color: C.navy, fontSize: 12 }}>
                Portfolio Total
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.workOrder} color={C.navy} bold/>
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.revenue} color={C.navy} bold/>
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.deductible} color={total.deductible > 0 ? C.red : C.slate} bold/>
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.invoiced} color={C.charcoal} bold/>
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.collected} color={C.medBlue} bold/>
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.outstanding} color={total.outstanding > 0 ? C.red : C.slate} bold/>
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.penalties} color={total.penalties > 0 ? C.critDark : C.slate} bold/>
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <MoneyCell n={total.netRevenue} color={total.netRevenue >= 0 ? C.navy : C.red} bold/>
              </td>
              <td className="px-4 py-3 text-right" style={{ minWidth: 90 }}>
                <RatioBadge pct={totalAch} threshHigh={100} threshMid={90}/>
              </td>
              <td className="px-4 py-3 text-right" style={{ minWidth: 90 }}>
                <RatioBadge pct={totalColl} threshHigh={90} threshMid={70}/>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      </>}
    </div>);
}
// ── Main Dashboard ────────────────────────────────────────────────────
export default function Dashboard({ onLogout, user }) {
    const [selectedProject, setSelectedProject] = useState('');
    const [selectedYear, setSelectedYear] = useState('');
    const [selectedMonth, setSelectedMonth] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [records, setRecords] = useState([]);
    const [activeVersion, setActiveVersion] = useState(null);
    const [dataLoading, setDataLoading] = useState(true);
    const reloadData = async () => {
        try {
            const data = await loadActiveRevenueData();
            setRecords(data.records);
            setActiveVersion(data.version);
        }
        catch (error) {
            console.error('Unable to load the active revenue version', error);
        }
        finally {
            setDataLoading(false);
        }
    };
    useEffect(() => {
        reloadData();
        return watchActiveVersion(reloadData);
    }, []);
    const usingDateRange = !!(dateFrom || dateTo);
    const queryParams = {
        project: selectedProject || undefined,
        revenueYear: !usingDateRange && selectedYear ? Number(selectedYear) : undefined,
        revenueMonth: !usingDateRange && selectedMonth ? Number(selectedMonth) : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
    };
    const { summary, monthly, performance, allProjects, filteredProjects } = useMemo(() => buildDashboardData(records, queryParams), [records, selectedProject, selectedYear, selectedMonth, dateFrom, dateTo]);
    const summaryLoading = dataLoading, monthlyLoading = dataLoading, perfLoading = dataLoading;
    const allProjectsLoading = dataLoading, filteredLoading = dataLoading;
    const availableYears = useMemo(() => {
        const years = new Set();
        for (const p of allProjects) {
            if (p.contractStart)
                years.add(new Date(p.contractStart).getFullYear());
            if (p.contractEnd)
                years.add(new Date(p.contractEnd).getFullYear());
        }
        years.add(new Date().getFullYear());
        return Array.from(years).sort();
    }, [allProjects]);
    const timelineProjects = useMemo(() => selectedProject
        ? allProjects.filter(p => p.name === selectedProject)
        : allProjects, [allProjects, selectedProject]);
    const projectChartData = useMemo(() => [...(filteredProjects ?? [])]
        .map(p => ({
        project: shortName(p.name),
        revenue: p.totalRevenue,
        invoiced: p.totalInvoiced,
        collected: p.totalCollected,
        netRevenue: p.totalNetRevenue,
        deductible: p.totalDeductible,
    }))
        .sort((a, b) => b.revenue - a.revenue), [filteredProjects]);
    const projectPieData = useMemo(() => {
        const positive = projectChartData.filter(item => item.revenue > 0);
        const leading = positive.slice(0, 5);
        const otherRevenue = positive.slice(5).reduce((sum, item) => sum + item.revenue, 0);
        return otherRevenue > 0
            ? [...leading, { project: 'Other Projects', revenue: otherRevenue }]
            : leading;
    }, [projectChartData]);
    const projectPieTotal = useMemo(() => projectPieData.reduce((sum, item) => sum + item.revenue, 0), [projectPieData]);
    const months = [
        { val: '1', label: 'January' }, { val: '2', label: 'February' },
        { val: '3', label: 'March' }, { val: '4', label: 'April' },
        { val: '5', label: 'May' }, { val: '6', label: 'June' },
        { val: '7', label: 'July' }, { val: '8', label: 'August' },
        { val: '9', label: 'September' }, { val: '10', label: 'October' },
        { val: '11', label: 'November' }, { val: '12', label: 'December' },
    ];
    const reset = () => {
        setSelectedProject('');
        setSelectedYear('');
        setSelectedMonth('');
        setDateFrom('');
        setDateTo('');
    };
    const hasFilters = !!(selectedProject || selectedYear || selectedMonth || dateFrom || dateTo);
    const lastUpdated = activeVersion?.published_at || activeVersion?.uploaded_at
        ? new Date(activeVersion.published_at || activeVersion.uploaded_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
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
    return (<div className="min-h-screen flex flex-col" style={{ background: C.canvasNavy, fontFamily: 'Inter, sans-serif' }}>

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header className="aces-header px-5 py-2.5 relative" style={{ background: C.headerNavy }}>
        <div className="w-full grid grid-cols-[auto_1fr_auto] items-center gap-4">

          {/* Left: logo + divider + title */}
          <div className="flex items-center">
            <img src={logoUrl} alt="ACES Managed Services" className="flex-shrink-0 origin-left" style={{ height: '44px', width: 'auto', objectFit: 'contain', transform: 'scale(1.55)' }}/>
          </div>

          <h1 className="absolute left-1/2 -translate-x-1/2 text-lg sm:text-xl font-bold text-white text-center leading-tight whitespace-nowrap pointer-events-none">
            ACES MSD Revenue Performance Dashboard
          </h1>

          {/* Right: meta + button */}
          <div className="flex items-center justify-end gap-3 flex-shrink-0">
            <div className="text-right hidden 2xl:block">
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Reporting Period
              </p>
              <p className="text-sm font-semibold text-white">{reportingPeriod}</p>
            </div>
            <div className="text-right hidden 2xl:block">
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Last Updated
              </p>
              <p className="text-sm font-semibold text-white">{lastUpdated}{activeVersion ? ` · V${activeVersion.version_number}` : ''}</p>
            </div>
            <button onClick={() => setShowUpdateModal(true)} className="px-4 py-2 text-xs font-semibold rounded-lg text-white transition-colors flex-shrink-0" style={{ background: C.red }} onMouseOver={e => (e.currentTarget.style.background = C.redDark)} onMouseOut={e => (e.currentTarget.style.background = C.red)}>
              Update Data
            </button>
            {onLogout && (<button onClick={onLogout} title="Sign out" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)' }} onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')} onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign Out
              </button>)}
          </div>
        </div>
      </header>

      {/* ── FILTER BAR ──────────────────────────────────────────────── */}
      <div className="dashboard-filter-bar border-b bg-white px-6 py-2.5" style={{ borderColor: C.border }}>
        <div className="w-full flex items-center gap-3 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.navy }}>Filters:</span>

          {/* Project */}
          <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)} className={ctrlCls} style={{ color: selectedProject ? C.navy : C.slate, borderColor: C.border }}>
            <option value="">All Projects</option>
            {(allProjects ?? []).map(p => <option key={p.id} value={p.name}>{shortName(p.name)}</option>)}
          </select>

          <div className="h-5 w-px hidden sm:block" style={{ background: C.border }}/>

          {/* Year */}
          <select value={selectedYear} onChange={e => { setSelectedYear(e.target.value); if (!e.target.value)
        setSelectedMonth(''); }} disabled={usingDateRange} className={ctrlCls + (usingDateRange ? ' opacity-40 cursor-not-allowed' : '')} style={{ color: selectedYear ? C.navy : C.slate, borderColor: C.border }}>
            <option value="">All Years</option>
            {availableYears.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>

          {/* Month */}
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} disabled={!selectedYear || usingDateRange} className={ctrlCls + (!selectedYear || usingDateRange ? ' opacity-40 cursor-not-allowed' : '')} style={{ color: selectedMonth ? C.navy : C.slate, borderColor: C.border }}>
            <option value="">All Months</option>
            {months.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
          </select>

          <div className="h-5 w-px hidden sm:block" style={{ background: C.border }}/>

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium" style={{ color: C.navy }}>From</span>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); if (e.target.value) {
        setSelectedYear('');
        setSelectedMonth('');
    } }} max={dateTo || undefined} className={ctrlCls} style={{ borderColor: C.border, color: dateFrom ? C.navy : C.slate }}/>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium" style={{ color: C.navy }}>To</span>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); if (e.target.value) {
        setSelectedYear('');
        setSelectedMonth('');
    } }} min={dateFrom || undefined} className={ctrlCls} style={{ borderColor: C.border, color: dateTo ? C.navy : C.slate }}/>
          </div>

          {hasFilters && (<button onClick={reset} className="text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors" style={{ color: C.red, border: `1px solid ${C.red}`, background: 'transparent' }} onMouseOver={e => { e.currentTarget.style.background = C.red; e.currentTarget.style.color = '#fff'; }} onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.red; }}>
              Reset Filters ✕
            </button>)}
        </div>
      </div>

      <main className="dashboard-canvas w-full flex-1 px-4 sm:px-6 xl:px-8 py-5 space-y-5">

        {/* ── EXECUTIVE KPI CARDS ─────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <KpiCard label="Total Revenue (SAR)" value={summaryLoading ? '…' : <RiyalAmt n={summary?.totalRevenue ?? 0}/>} valueColor={C.blue}/>
          <KpiCard label="Total Invoiced (SAR)" value={summaryLoading ? '…' : <RiyalAmt n={summary?.totalInvoiced ?? 0}/>} valueColor={C.cyan}/>
          <KpiCard label="Total Collected (SAR)" value={summaryLoading ? '…' : <RiyalAmt n={summary?.totalCollected ?? 0}/>} valueColor={C.teal}/>
          <KpiCard label="Total Net Revenue (SAR)" value={summaryLoading ? '…' : <RiyalAmt n={summary?.totalNetRevenue ?? 0}/>} valueColor={(summary?.totalNetRevenue ?? 0) >= 0 ? C.amber : C.red}/>
          <KpiCard label="Total Unbilled Revenue (SAR)" value={summaryLoading ? '…' : <RiyalAmt n={summary?.totalUnbilled ?? 0} accounting/>} valueColor={(summary?.totalUnbilled ?? 0) !== 0 ? C.coral : C.chartText}/>
        </div>

        {/* ── SIMPLE 3 × 2 ANALYTICS GRID ─────────────────────────── */}
        <div className="dashboard-chart-grid grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          <Section title="Revenue Trend over Time" className="dashboard-chart-card">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.chartGrid}/>
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: C.chartText }}/>
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: C.chartText }} width={48}/>
                <Tooltip content={<ChartTooltip />}/>
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke={C.cyan} fill={C.blue} fillOpacity={0.36} strokeWidth={2.5} dot={{ r: 2.5, fill: C.amber }}/>
              </ComposedChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Project Revenue Share" className="dashboard-chart-card project-pie-card">
            <ProjectRevenueInfographic data={projectPieData} total={projectPieTotal}/>
          </Section>

          <Section title="Invoiced vs Collected Monthly" className="dashboard-chart-card">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.chartGrid}/>
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: C.chartText }}/>
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: C.chartText }} width={48}/>
                <Tooltip content={<ChartTooltip />}/>
                <Legend wrapperStyle={{ fontSize: 10 }}/>
                <Bar dataKey="invoiced" name="Invoiced" fill={C.cyan} radius={[4, 4, 0, 0]} maxBarSize={18}/>
                <Line type="monotone" dataKey="collected" name="Collected" stroke={C.amber} strokeWidth={2.5} dot={{ r: 3, fill: C.amber }}/>
              </ComposedChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Net Revenue by Project" className="dashboard-chart-card">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={projectChartData} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.chartGrid} vertical={false}/>
                <XAxis dataKey="project" interval={0} angle={-25} textAnchor="end" tick={{ fontSize: 9, fill: C.chartText }}/>
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: C.chartText }} width={48}/>
                <Tooltip content={<ChartTooltip />}/>
                <Bar dataKey="netRevenue" name="Net Revenue" radius={[4, 4, 0, 0]} maxBarSize={30}>
                  {projectChartData.map((entry, index) => <Cell key={entry.id ?? entry.project} fill={PROJECT_COLORS[index % PROJECT_COLORS.length]}/>) }
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Deductions over Time" className="dashboard-chart-card">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly ?? []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.chartGrid}/>
                <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: C.chartText }}/>
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: C.chartText }} width={48}/>
                <Tooltip content={<ChartTooltip />}/>
                <Area type="monotone" dataKey="deductible" name="Deductions" stroke={C.coral} fill={C.coral} fillOpacity={0.28} strokeWidth={2.5}/>
              </ComposedChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Revenue vs Net Revenue by Project" className="dashboard-chart-card">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={projectChartData} margin={{ top: 8, right: 8, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={C.chartGrid} vertical={false}/>
                <XAxis dataKey="project" interval={0} angle={-25} textAnchor="end" tick={{ fontSize: 9, fill: C.chartText }}/>
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 10, fill: C.chartText }} width={48}/>
                <Tooltip content={<ChartTooltip />}/>
                <Legend wrapperStyle={{ fontSize: 10 }}/>
                <Bar dataKey="revenue" name="Revenue" fill={C.blue} radius={[3, 3, 0, 0]} maxBarSize={20}/>
                <Bar dataKey="netRevenue" name="Net Revenue" fill={C.amber} radius={[3, 3, 0, 0]} maxBarSize={20}/>
              </ComposedChart>
            </ResponsiveContainer>
          </Section>
        </div>

        {/* ── MANAGEMENT SUMMARY ───────────────────────────────────── */}
        <ManagementTable projects={filteredProjects ?? []} loading={filteredLoading}/>

      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer className="dashboard-footer text-center py-4 text-[11px]" style={{ color: 'rgba(255,255,255,0.68)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        ACES Managed Services Department · Project Revenue Dashboard · Confidential
      </footer>

      {showUpdateModal && <UpdateDataModal onClose={() => setShowUpdateModal(false)} onPublished={reloadData}/>}
    </div>);
}
