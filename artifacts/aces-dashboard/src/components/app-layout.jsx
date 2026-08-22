import { useState } from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { motion } from 'framer-motion';
export function AppLayout({ title, description, lastDataUpdate, actions, children }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    return (<div className="min-h-[100dvh] bg-background">
      <div className="bg-noise"/>
      <AppSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)}/>
      <div className="flex min-h-[100dvh] flex-col transition-all duration-200 lg:pl-64">
        <AppHeader title={title} description={description} onMenuClick={() => setMobileOpen(true)} lastDataUpdate={lastDataUpdate} actions={actions}/>
        <motion.main key={title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </motion.main>
      </div>
    </div>);
}
