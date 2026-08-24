import { databaseRequest, rpc, uploadStorageObject } from './supabase-rest';

const PAGE_SIZE = 1000;

const toClientRecord = (row) => ({
  projectName: row.project,
  revenueMonth: row.revenue_month,
  workOrder: Number(row.work_order || 0),
  revenue: Number(row.revenue || 0),
  deductible: Number(row.deductible || 0),
  invoiced: Number(row.invoiced || 0),
  invoiceDate: row.invoice_date,
  invoiceNo: row.invoice_no,
  dueDate: row.due_date,
  collected: Number(row.collected || 0),
  collectedDate: row.collected_date,
  days: row.days == null ? null : Number(row.days),
  penalties: Number(row.penalties || 0),
  netRevenue: Number(row.net_revenue || 0),
});

const toDatabaseRecord = (record, versionId, index) => ({
  version_id: versionId,
  row_number: index + 2,
  project: record.projectName,
  revenue_month: record.revenueMonth,
  work_order: record.workOrder,
  revenue: record.revenue,
  deductible: record.deductible,
  invoiced: record.invoiced,
  invoice_date: record.invoiceDate,
  invoice_no: record.invoiceNo,
  due_date: record.dueDate,
  collected: record.collected,
  collected_date: record.collectedDate,
  days: record.days,
  penalties: record.penalties,
  net_revenue: record.netRevenue,
});

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function getActiveVersionId() {
  const state = await databaseRequest('/dashboard_state?id=eq.1&select=active_version_id');
  return state[0]?.active_version_id || null;
}

export async function loadActiveRevenueData() {
  const versionId = await getActiveVersionId();
  if (!versionId) return { records: [], version: null };
  const versions = await databaseRequest(`/dataset_versions?id=eq.${versionId}&select=id,version_number,filename,row_count,uploaded_at,published_at,uploaded_by,status`);
  const records = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await databaseRequest(`/revenue_records?version_id=eq.${versionId}&select=project,revenue_month,work_order,revenue,deductible,invoiced,invoice_date,invoice_no,due_date,collected,collected_date,days,penalties,net_revenue&order=row_number.asc`, {
      headers: { Range: `${from}-${from + PAGE_SIZE - 1}` },
    });
    records.push(...page.map(toClientRecord));
    if (page.length < PAGE_SIZE) break;
  }
  return { records, version: versions[0] || null };
}

export async function uploadRevenueVersion(file, records) {
  const checksum = await sha256(file);
  const created = await rpc('create_dataset_version', {
    p_filename: file.name,
    p_row_count: records.length,
    p_checksum: checksum,
  });
  const version = Array.isArray(created) ? created[0] : created;
  if (!version?.version_id) throw new Error('Supabase did not create a dataset version.');
  try {
    await uploadStorageObject(version.storage_path, file);
    const rows = records.map((record, index) => toDatabaseRecord(record, version.version_id, index));
    for (let start = 0; start < rows.length; start += 500) {
      await databaseRequest('/revenue_records', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(rows.slice(start, start + 500)),
      });
    }
    await rpc('publish_dataset_version', { p_version_id: version.version_id });
    return { ...version, imported: records.length };
  } catch (error) {
    await rpc('fail_dataset_version', { p_version_id: version.version_id, p_error: error.message }).catch(() => {});
    throw error;
  }
}

export function watchActiveVersion(onChange, intervalMs = 10_000) {
  let current = null;
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('aces-revenue-versions') : null;
  const check = async () => {
    try {
      const next = await getActiveVersionId();
      if (current !== null && next && next !== current) onChange(next);
      current = next;
    } catch {
      // Keep the last successful version and retry on the next interval.
    }
  };
  const timer = window.setInterval(check, intervalMs);
  channel?.addEventListener('message', () => onChange());
  check();
  return () => {
    window.clearInterval(timer);
    channel?.close();
  };
}

export function announceVersionPublished() {
  if (typeof BroadcastChannel === 'function') {
    const channel = new BroadcastChannel('aces-revenue-versions');
    channel.postMessage({ type: 'published' });
    channel.close();
  }
}

export async function listDatasetVersions() {
  return databaseRequest('/dataset_versions?select=id,version_number,filename,row_count,uploaded_at,published_at,status,error_message&order=version_number.desc');
}

export async function activateDatasetVersion(versionId) {
  await rpc('activate_dataset_version', { p_version_id: versionId });
}
