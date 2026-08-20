import { useState } from 'react';

const POWER_BI_REPORT_URL = [
  'https://app.powerbi.com/reportEmbed',
  '?reportId=c9883c01-8e49-43d4-a0aa-da79ce949572',
  '&autoAuth=true',
  '&ctid=b0a3ea76-6237-4f6d-8579-5a47d6e1a8d0',
  '&filterPaneEnabled=true',
  '&navContentPaneEnabled=true',
].join('');

export default function App() {
  const [loaded, setLoaded] = useState(false);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#F4F5F7]">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#F4F5F7]">
          <div
            className="h-10 w-10 animate-spin rounded-full border-4 border-[#D9DEE7] border-t-[#EF1E34]"
            aria-hidden="true"
          />
          <div className="text-center">
            <p className="text-sm font-semibold text-[#122E64]">
              Loading ACES MSD Revenue Dashboard
            </p>
            <p className="mt-1 text-xs text-[#7B8495]">
              Sign in with your ACES Microsoft account if prompted.
            </p>
          </div>
        </div>
      )}

      <iframe
        title="ACES MSD Revenue Dashboard"
        src={POWER_BI_REPORT_URL}
        className="h-full w-full border-0"
        allowFullScreen
        onLoad={() => setLoaded(true)}
      />
    </main>
  );
}
