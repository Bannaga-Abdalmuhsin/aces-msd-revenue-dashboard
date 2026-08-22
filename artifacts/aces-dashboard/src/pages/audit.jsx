import { useState } from 'react';
import { History } from 'lucide-react';
import { useListAuditLogs, getListAuditLogsQueryKey } from '@workspace/api-client-react';
import { AppLayout } from '@/components/app-layout';
import { ErrorState, EmptyState } from '@/components/empty-state';
import { TableSkeleton } from '@/components/table-skeleton';
import { formatDateTime } from '@/lib/format';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, } from '@/components/ui/pagination';
const PAGE_SIZE = 20;
export default function AuditPage() {
    const [page, setPage] = useState(1);
    const params = { page, pageSize: PAGE_SIZE };
    const { data, isLoading, isError, refetch } = useListAuditLogs(params, {
        query: { queryKey: getListAuditLogsQueryKey(params) },
    });
    const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
    return (<AppLayout title="Administration" description="Full audit trail of data changes across the system">
      {isError ? (<ErrorState onRetry={() => refetch()}/>) : isLoading ? (<TableSkeleton rows={10} cols={6}/>) : !data || data.data.length === 0 ? (<EmptyState icon={History} title="No audit history" description="Changes to records will be logged here."/>) : (<>
          <div className="overflow-x-auto rounded-lg border border-card-border bg-card">
            <table className="w-full min-w-[1000px] text-left text-xs" data-testid="table-audit-log">
              <thead>
                <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Timestamp</th>
                  <th className="px-3 py-3 font-medium">User</th>
                  <th className="px-3 py-3 font-medium">Action</th>
                  <th className="px-3 py-3 font-medium">Table</th>
                  <th className="px-3 py-3 font-medium">Record</th>
                  <th className="px-3 py-3 font-medium">Previous Value</th>
                  <th className="px-3 py-3 font-medium">New Value</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((log) => (<tr key={log.id} className="border-b border-border/60 last:border-0" data-testid={`row-audit-${log.id}`}>
                    <td className="px-3 py-2.5 font-mono-num text-muted-foreground">{formatDateTime(log.createdAt)}</td>
                    <td className="px-3 py-2.5 font-medium text-foreground">{log.user ?? 'system'}</td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono-num text-muted-foreground">{log.tableName}</td>
                    <td className="px-3 py-2.5 font-mono-num text-muted-foreground">{log.recordId ?? '—'}</td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-muted-foreground" title={log.previousValue ?? undefined}>
                      {log.previousValue ?? '—'}
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2.5 text-foreground" title={log.newValue ?? undefined}>
                      {log.newValue ?? '—'}
                    </td>
                  </tr>))}
              </tbody>
            </table>
          </div>

          {data.total > PAGE_SIZE && (<div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'} data-testid="button-audit-page-prev"/>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink className="pointer-events-none">{page} / {totalPages}</PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'} data-testid="button-audit-page-next"/>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>)}
        </>)}
    </AppLayout>);
}
