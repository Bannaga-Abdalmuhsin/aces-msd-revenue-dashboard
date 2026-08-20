import * as XLSX from 'xlsx';

export interface RevenueRecord {
  projectName: string; revenueMonth: string | null; workOrder: number; revenue: number;
  deductible: number; invoiced: number; invoiceDate: string | null; invoiceNo: string | null;
  dueDate: string | null; collected: number; collectedDate: string | null; days: number | null;
  penalties: number; netRevenue: number;
}
export interface RevenueFilters { project?: string; revenueYear?: number; revenueMonth?: number; dateFrom?: string; dateTo?: string; }

const STORAGE_KEY = 'aces-msd-revenue-data-v1';
export const DATA_UPDATED_EVENT = 'aces-revenue-data-updated';
const REQUIRED = ['project','revenue_month','work_order','revenue','deductible','invoiced','invoice_date','invoice_no','due_date','collected','collected_date','days','penalties','net_revenue'];
const header = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const num = (v: unknown) => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : 0; };
const isoDate = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  let d: Date;
  if (v instanceof Date) d = v;
  else if (typeof v === 'number') { const p = XLSX.SSF.parse_date_code(v); if (!p) return null; d = new Date(Date.UTC(p.y,p.m-1,p.d)); }
  else { const s=String(v).trim(), m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); d=m?new Date(Date.UTC(+m[3],+m[1]-1,+m[2])):new Date(s); }
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);
};

export async function parseRevenueFile(file: File): Promise<RevenueRecord[]> {
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
  const sheetName=wb.SheetNames.find(n=>n.toLowerCase()==='revenue') ?? wb.SheetNames[0];
  if(!sheetName) throw new Error('The workbook has no worksheets.');
  const rows=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName],{header:1,defval:null,raw:true});
  if(rows.length<2) throw new Error(`Worksheet “${sheetName}” contains no data rows.`);
  const hs=rows[0].map(header), missing=REQUIRED.filter(h=>!hs.includes(h));
  if(missing.length) throw new Error(`Missing required columns: ${missing.join(', ')}`);
  const records=rows.slice(1).filter(r=>r.some(v=>v!=null&&v!=='')).map((row,i)=>{
    const x=Object.fromEntries(hs.map((h,j)=>[h,row[j]])), projectName=String(x.project??'').trim();
    if(!projectName) throw new Error(`Row ${i+2}: project is empty.`);
    return {projectName,revenueMonth:isoDate(x.revenue_month),workOrder:num(x.work_order),revenue:num(x.revenue),deductible:num(x.deductible),invoiced:num(x.invoiced),invoiceDate:isoDate(x.invoice_date),invoiceNo:x.invoice_no==null||x.invoice_no===''?null:String(x.invoice_no).trim(),dueDate:isoDate(x.due_date),collected:num(x.collected),collectedDate:isoDate(x.collected_date),days:x.days==null||x.days===''?null:num(x.days),penalties:num(x.penalties),netRevenue:num(x.net_revenue)};
  });
  if(!records.length) throw new Error('No valid revenue rows were found.');
  return records;
}
export function loadRevenueData(): RevenueRecord[] { try{return JSON.parse(localStorage.getItem(STORAGE_KEY)??'[]')}catch{return []} }
export function saveRevenueData(records:RevenueRecord[],replace=true){const final=replace?records:[...loadRevenueData(),...records];localStorage.setItem(STORAGE_KEY,JSON.stringify(final));localStorage.setItem(`${STORAGE_KEY}-updated`,new Date().toISOString());window.dispatchEvent(new Event(DATA_UPDATED_EVENT));return final.length;}

const div=(a:number,b:number)=>b?a/b:0, out=(i:number,c:number)=>Math.max(i-c,0);
const inMonth=(d:string|null,f:RevenueFilters)=>!!d&&(!f.dateFrom||d.slice(0,7)>=f.dateFrom.slice(0,7))&&(!f.dateTo||d.slice(0,7)<=f.dateTo.slice(0,7))&&(!!(f.dateFrom||f.dateTo)||((!f.revenueYear||+d.slice(0,4)===f.revenueYear)&&(!f.revenueMonth||+d.slice(5,7)===f.revenueMonth)));
const inDay=(d:string|null,f:RevenueFilters)=>!!d&&(!f.dateFrom||d>=f.dateFrom)&&(!f.dateTo||d<=f.dateTo);
const range=(f:RevenueFilters)=>!!(f.dateFrom||f.dateTo);
const revOk=(r:RevenueRecord,f:RevenueFilters)=>inMonth(r.revenueMonth,f);
const invOk=(r:RevenueRecord,f:RevenueFilters)=>range(f)?inDay(r.invoiceDate,f):inMonth(r.revenueMonth,f);
const colOk=(r:RevenueRecord,f:RevenueFilters)=>range(f)?inDay(r.collectedDate,f):inMonth(r.revenueMonth,f);

export function buildDashboardData(records:RevenueRecord[],f:RevenueFilters){
  const scoped=records.filter(r=>!f.project||r.projectName===f.project), now=new Date().toISOString().slice(0,10);
  const summary={totalWorkOrder:0,totalRevenue:0,totalDeductible:0,totalInvoiced:0,totalCollected:0,totalOutstanding:0,totalOverdue:0,totalPenalties:0,totalNetRevenue:0,totalPoValue:0,totalExpectedRevenue:0,collectionRate:0,revenueAchievementRate:0,invoiceConversionRate:0,avgCollectionDays:0,lastDataUpdate:localStorage.getItem(`${STORAGE_KEY}-updated`)};
  let daySum=0,dayCount=0;
  for(const r of scoped){if(revOk(r,f)){summary.totalWorkOrder+=r.workOrder;summary.totalRevenue+=r.revenue;summary.totalDeductible+=r.deductible;summary.totalPenalties+=r.penalties;summary.totalNetRevenue+=r.netRevenue;}if(invOk(r,f))summary.totalInvoiced+=r.invoiced;if(colOk(r,f)){summary.totalCollected+=r.collected;if(r.dueDate&&r.dueDate<now)summary.totalOverdue+=out(r.invoiced,r.collected);if(r.days!=null&&r.collected>0){daySum+=r.days;dayCount++;}}}
  summary.totalOutstanding=out(summary.totalInvoiced,summary.totalCollected);summary.totalPoValue=summary.totalWorkOrder;summary.totalExpectedRevenue=summary.totalWorkOrder;summary.collectionRate=div(summary.totalCollected,summary.totalInvoiced)*100;summary.revenueAchievementRate=div(summary.totalRevenue,summary.totalWorkOrder)*100;summary.invoiceConversionRate=div(summary.totalInvoiced,summary.totalRevenue)*100;summary.avgCollectionDays=dayCount?daySum/dayCount:0;
  const names=[...new Set(records.map(r=>r.projectName))].sort();
  const projectSummary=(name:string,filters:RevenueFilters)=>{const rs=records.filter(r=>r.projectName===name);let wo=0,rev=0,ded=0,inv=0,col=0,pen=0,net=0,overdue=0,dt=0,dc=0,start:string|null=null,end:string|null=null;for(const r of rs){if(r.revenueMonth){if(!start||r.revenueMonth<start)start=r.revenueMonth;if(!end||r.revenueMonth>end)end=r.revenueMonth;}if(revOk(r,filters)){wo+=r.workOrder;rev+=r.revenue;ded+=r.deductible;pen+=r.penalties;net+=r.netRevenue;}if(invOk(r,filters))inv+=r.invoiced;if(colOk(r,filters)){col+=r.collected;if(r.dueDate&&r.dueDate<now)overdue+=out(r.invoiced,r.collected);if(r.days!=null&&r.collected>0){dt+=r.days;dc++;}}}return{id:names.indexOf(name)+1,name,status:end&&end<now?'completed':'ongoing',contractStart:start,contractEnd:end,poValue:wo,expectedMonthlyRevenue:0,totalExpectedRevenue:wo,remainingPO:Math.max(wo-rev,0),totalWorkOrder:wo,totalRevenue:rev,totalDeductible:ded,totalInvoiced:inv,totalCollected:col,totalOutstanding:out(inv,col),totalOverdue:overdue,totalPenalties:pen,totalNetRevenue:net,revenueAchievementPct:div(rev,wo)*100,collectionPct:div(col,inv)*100,avgCollectionDays:dc?dt/dc:0,latestRevenueMonth:end,latestInvoiceDate:null};};
  const allProjects=names.map(n=>projectSummary(n,{})), filteredProjects=(f.project?names.filter(n=>n===f.project):names).map(n=>projectSummary(n,f));
  const performance=filteredProjects.map(p=>({projectName:p.name,workOrder:p.totalWorkOrder,revenue:p.totalRevenue,revenueAchievementPct:p.revenueAchievementPct,invoiced:p.totalInvoiced,collected:p.totalCollected,outstanding:p.totalOutstanding,expectedRevenue:p.totalWorkOrder,poValue:p.totalWorkOrder}));
  const mm=new Map<string,any>(),point=(m:string)=>{if(!mm.has(m))mm.set(m,{month:m,workOrder:0,revenue:0,invoiced:0,collected:0,netRevenue:0,expectedRevenue:0});return mm.get(m)};
  for(const r of scoped){if(revOk(r,f)&&r.revenueMonth){const p=point(r.revenueMonth.slice(0,7));p.workOrder+=r.workOrder;p.revenue+=r.revenue;p.netRevenue+=r.netRevenue;p.expectedRevenue+=r.workOrder;}if(invOk(r,f)){const d=range(f)?r.invoiceDate:r.revenueMonth;if(d)point(d.slice(0,7)).invoiced+=r.invoiced;}if(colOk(r,f)){const d=range(f)?r.collectedDate:r.revenueMonth;if(d)point(d.slice(0,7)).collected+=r.collected;}}
  return{summary,monthly:[...mm.values()].sort((a,b)=>a.month.localeCompare(b.month)),performance,allProjects,filteredProjects};
}
