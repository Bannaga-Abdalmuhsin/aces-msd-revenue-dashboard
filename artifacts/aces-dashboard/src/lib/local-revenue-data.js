import * as XLSX from 'xlsx';
const STORAGE_KEY = 'aces-msd-revenue-data-v1';
const STORAGE_VERSION_KEY = `${STORAGE_KEY}-schema-version`;
const STORAGE_VERSION = '2';
export const DATA_UPDATED_EVENT = 'aces-revenue-data-updated';
const REQUIRED = ['project', 'revenue_month', 'work_order', 'revenue', 'deductible', 'invoiced', 'invoice_date', 'invoice_no', 'due_date', 'collected', 'collected_date', 'days', 'penalties', 'net_revenue'];
const header = (v) => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const num = (v) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : 0; };
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const isoDate = (v) => {
    if (v == null || v === '')
        return null;
    let d;
    // SheetJS creates Excel dates at local midnight. Using toISOString() in a
    // positive-offset timezone (for example Riyadh, UTC+3) moves them to the
    // previous calendar day and can shift a revenue month into the prior month.
    if (v instanceof Date)
        return Number.isNaN(v.getTime()) ? null : ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') {
        const p = XLSX.SSF.parse_date_code(v);
        return p ? ymd(p.y, p.m, p.d) : null;
    }
    const s = String(v).trim();
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso)
        return ymd(+iso[1], +iso[2], +iso[3]);
    const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us)
        return ymd(+us[3], +us[1], +us[2]);
    d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
};
export async function parseRevenueFile(file) {
    // Keep native Excel date serials so SSF.parse_date_code can preserve the
    // workbook calendar date without JavaScript timezone conversion.
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const sheetName = wb.SheetNames.find(n => n.toLowerCase() === 'revenue') ?? wb.SheetNames[0];
    if (!sheetName)
        throw new Error('The workbook has no worksheets.');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null, raw: true });
    if (rows.length < 2)
        throw new Error(`Worksheet “${sheetName}” contains no data rows.`);
    const hs = rows[0].map(header), missing = REQUIRED.filter(h => !hs.includes(h));
    if (missing.length)
        throw new Error(`Missing required columns: ${missing.join(', ')}`);
    const records = rows.slice(1).filter(r => r.some(v => v != null && v !== '')).map((row, i) => {
        const x = Object.fromEntries(hs.map((h, j) => [h, row[j]])), projectName = String(x.project ?? '').trim();
        if (!projectName)
            throw new Error(`Row ${i + 2}: project is empty.`);
        return { projectName, revenueMonth: isoDate(x.revenue_month), workOrder: num(x.work_order), revenue: num(x.revenue), deductible: num(x.deductible), invoiced: num(x.invoiced), invoiceDate: isoDate(x.invoice_date), invoiceNo: x.invoice_no == null || x.invoice_no === '' ? null : String(x.invoice_no).trim(), dueDate: isoDate(x.due_date), collected: num(x.collected), collectedDate: isoDate(x.collected_date), days: x.days == null || x.days === '' ? null : num(x.days), penalties: num(x.penalties), netRevenue: num(x.net_revenue) };
    });
    if (!records.length)
        throw new Error('No valid revenue rows were found.');
    return records;
}
const addUtcDay = (value) => {
    if (!value)
        return null;
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime()))
        return value;
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
};
const isMonthEnd = (value) => {
    if (!value)
        return false;
    const next = addUtcDay(value);
    return !!next && next.slice(8, 10) === '01';
};
const migrateLegacyDates = (records) => {
    // Legacy browser imports converted every Excel serial through a Riyadh-local
    // Date, moving it one day backward. Monthly revenue dates therefore appear
    // predominantly as month-end instead of the first day of their true month.
    const dated = records.filter(r => r.revenueMonth);
    const legacy = dated.length > 0 && dated.filter(r => isMonthEnd(r.revenueMonth)).length > dated.filter(r => r.revenueMonth?.slice(8, 10) === '01').length;
    if (!legacy)
        return records;
    return records.map(r => ({ ...r, revenueMonth: addUtcDay(r.revenueMonth), invoiceDate: addUtcDay(r.invoiceDate), dueDate: addUtcDay(r.dueDate), collectedDate: addUtcDay(r.collectedDate) }));
};
export function loadRevenueData() {
    try {
        const records = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
        if (localStorage.getItem(STORAGE_VERSION_KEY) !== STORAGE_VERSION) {
            const migrated = migrateLegacyDates(records);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
            localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
            return migrated;
        }
        return records;
    }
    catch {
        return [];
    }
}
export function saveRevenueData(records, replace = true) { const final = replace ? records : [...loadRevenueData(), ...records]; localStorage.setItem(STORAGE_KEY, JSON.stringify(final)); localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION); localStorage.setItem(`${STORAGE_KEY}-updated`, new Date().toISOString()); window.dispatchEvent(new Event(DATA_UPDATED_EVENT)); return final.length; }
const div = (a, b) => b ? a / b : 0, out = (i, c) => Math.max(i - c, 0);
const inMonth = (d, f) => !!d && (!f.dateFrom || d.slice(0, 7) >= f.dateFrom.slice(0, 7)) && (!f.dateTo || d.slice(0, 7) <= f.dateTo.slice(0, 7)) && (!!(f.dateFrom || f.dateTo) || ((!f.revenueYear || +d.slice(0, 4) === f.revenueYear) && (!f.revenueMonth || +d.slice(5, 7) === f.revenueMonth)));
const inDay = (d, f) => !!d && (!f.dateFrom || d >= f.dateFrom) && (!f.dateTo || d <= f.dateTo);
const range = (f) => !!(f.dateFrom || f.dateTo);
const temporal = (f) => range(f) || !!f.revenueYear || !!f.revenueMonth;
const revOk = (r, f) => !temporal(f) || inMonth(r.revenueMonth, f);
const invOk = (r, f) => !temporal(f) || (range(f) ? inDay(r.invoiceDate, f) : inMonth(r.invoiceDate, f));
const colOk = (r, f) => !temporal(f) || (range(f) ? inDay(r.collectedDate, f) : inMonth(r.collectedDate, f));
export function buildDashboardData(records, f) {
    const scoped = records.filter(r => !f.project || r.projectName === f.project), now = new Date().toISOString().slice(0, 10);
    const summary = { totalWorkOrder: 0, totalRevenue: 0, totalDeductible: 0, totalInvoiced: 0, totalCollected: 0, totalOutstanding: 0, totalOverdue: 0, totalPenalties: 0, totalNetRevenue: 0, totalUnbilled: 0, totalPoValue: 0, totalExpectedRevenue: 0, collectionRate: 0, revenueAchievementRate: 0, invoiceConversionRate: 0, avgCollectionDays: 0, lastDataUpdate: localStorage.getItem(`${STORAGE_KEY}-updated`) };
    let daySum = 0, dayCount = 0;
    for (const r of scoped) {
        if (revOk(r, f)) {
            summary.totalWorkOrder += r.workOrder;
            summary.totalRevenue += r.revenue;
            summary.totalDeductible += r.deductible;
            summary.totalPenalties += r.penalties;
            summary.totalNetRevenue += r.netRevenue;
        }
        if (invOk(r, f))
            summary.totalInvoiced += r.invoiced;
        if (colOk(r, f)) {
            summary.totalCollected += r.collected;
            if (r.dueDate && r.dueDate < now)
                summary.totalOverdue += out(r.invoiced, r.collected);
            if (r.days != null && r.collected > 0) {
                daySum += r.days;
                dayCount++;
            }
        }
    }
    summary.totalOutstanding = out(summary.totalInvoiced, summary.totalCollected);
    summary.totalUnbilled = summary.totalRevenue - summary.totalInvoiced;
    summary.totalPoValue = summary.totalWorkOrder;
    summary.totalExpectedRevenue = summary.totalWorkOrder;
    summary.collectionRate = div(summary.totalCollected, summary.totalInvoiced) * 100;
    summary.revenueAchievementRate = div(summary.totalRevenue, summary.totalWorkOrder) * 100;
    summary.invoiceConversionRate = div(summary.totalInvoiced, summary.totalRevenue) * 100;
    summary.avgCollectionDays = dayCount ? daySum / dayCount : 0;
    const names = [...new Set(records.map(r => r.projectName))].sort();
    const projectSummary = (name, filters) => { const rs = records.filter(r => r.projectName === name); let wo = 0, rev = 0, ded = 0, inv = 0, col = 0, pen = 0, net = 0, overdue = 0, dt = 0, dc = 0, start = null, end = null; for (const r of rs) {
        if (r.revenueMonth) {
            if (!start || r.revenueMonth < start)
                start = r.revenueMonth;
            if (!end || r.revenueMonth > end)
                end = r.revenueMonth;
        }
        if (revOk(r, filters)) {
            wo += r.workOrder;
            rev += r.revenue;
            ded += r.deductible;
            pen += r.penalties;
            net += r.netRevenue;
        }
        if (invOk(r, filters))
            inv += r.invoiced;
        if (colOk(r, filters)) {
            col += r.collected;
            if (r.dueDate && r.dueDate < now)
                overdue += out(r.invoiced, r.collected);
            if (r.days != null && r.collected > 0) {
                dt += r.days;
                dc++;
            }
        }
    } return { id: names.indexOf(name) + 1, name, status: end && end < now ? 'completed' : 'ongoing', contractStart: start, contractEnd: end, poValue: wo, expectedMonthlyRevenue: 0, totalExpectedRevenue: wo, remainingPO: Math.max(wo - rev, 0), totalWorkOrder: wo, totalRevenue: rev, totalDeductible: ded, totalInvoiced: inv, totalCollected: col, totalOutstanding: out(inv, col), totalOverdue: overdue, totalPenalties: pen, totalNetRevenue: net, revenueAchievementPct: div(rev, wo) * 100, collectionPct: div(col, inv) * 100, avgCollectionDays: dc ? dt / dc : 0, latestRevenueMonth: end, latestInvoiceDate: null }; };
    const allProjects = names.map(n => projectSummary(n, {})), filteredProjects = (f.project ? names.filter(n => n === f.project) : names).map(n => projectSummary(n, f));
    const performance = filteredProjects.map(p => ({ projectName: p.name, workOrder: p.totalWorkOrder, revenue: p.totalRevenue, revenueAchievementPct: p.revenueAchievementPct, invoiced: p.totalInvoiced, collected: p.totalCollected, outstanding: p.totalOutstanding, expectedRevenue: p.totalWorkOrder, poValue: p.totalWorkOrder }));
    const mm = new Map(), point = (m) => { if (!mm.has(m))
        mm.set(m, { month: m, workOrder: 0, revenue: 0, invoiced: 0, collected: 0, netRevenue: 0, expectedRevenue: 0 }); return mm.get(m); };
    for (const r of scoped) {
        if (revOk(r, f) && r.revenueMonth) {
            const p = point(r.revenueMonth.slice(0, 7));
            p.workOrder += r.workOrder;
            p.revenue += r.revenue;
            p.netRevenue += r.netRevenue;
            p.expectedRevenue += r.workOrder;
        }
        if (invOk(r, f) && r.invoiceDate)
            point(r.invoiceDate.slice(0, 7)).invoiced += r.invoiced;
        if (colOk(r, f) && r.collectedDate)
            point(r.collectedDate.slice(0, 7)).collected += r.collected;
    }
    return { summary, monthly: [...mm.values()].sort((a, b) => a.month.localeCompare(b.month)), performance, allProjects, filteredProjects };
}
