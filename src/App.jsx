import React from "react";
import { Building2 } from "lucide-react";

import { useDashboardData } from "./hooks/useDashboardData";
import { Header, Shell } from "./components/ui";
import { IssueBanner, SyncErrorBanner } from "./components/banners";
import { DashboardSkeleton, LoadFailure } from "./components/states";
import SyncChip from "./components/SyncChip";
import KpiRow from "./components/sections/KpiRow";
import SalesSection from "./components/sections/SalesSection";
import MaturitySection from "./components/sections/MaturitySection";
import RealtorSection from "./components/sections/RealtorSection";
import CashSection from "./components/sections/CashSection";
import ProjectsSection from "./components/sections/ProjectsSection";
import LedgerSection from "./components/sections/LedgerSection";

function Footer({ isLocal }) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-6">
      <Building2 size={14} className="text-slate-600" />
      <p className="text-xs text-slate-500">
        {isLocal
          ? "Generated from SABREFLEXX PAYABLES JUL-DEC 2026.xlsx"
          : "Live from the SabreFlexx Google Sheet"}{" "}
        &middot; Figures in Nigerian Naira (₦) &middot; Project budgets are editable
        placeholders
      </p>
    </div>
  );
}

function Dashboard({ dashboard, sync }) {
  const {
    asOf,
    kpis,
    buckets,
    realtors,
    cash,
    investments,
    projects,
    totalCash,
    totalPayable,
    availablePool,
    liquidated,
    sales,
    ledgerComplete,
    ledgerShown,
    ledgerTotal,
    issues,
  } = dashboard;

  return (
    <Shell>
      <Header
        right={
          <SyncChip
            asOf={asOf}
            status={sync.status}
            lastSynced={sync.lastSynced}
            isFetching={sync.isFetching}
            onRefresh={sync.refetch}
          />
        }
      />

      <SyncErrorBanner error={sync.error} onRefresh={sync.refetch} />
      <IssueBanner issues={issues} />

      <KpiRow kpis={kpis} />

      {/* Absent until the sheet grows a `sales` tab — the rest of the
          dashboard has never depended on it and still doesn't. */}
      {sales && <SalesSection sales={sales} />}

      <MaturitySection buckets={buckets} totalPayable={totalPayable} liquidated={liquidated} />

      <RealtorSection
        realtors={realtors}
        ledgerComplete={ledgerComplete}
        ledgerTotal={ledgerTotal}
      />

      <CashSection cash={cash} totalCash={totalCash} />

      <ProjectsSection
        sheetProjects={projects}
        availablePool={availablePool}
        totalCash={totalCash}
        nearTermPayable={buckets[0].payable}
        canSave={sync.canSaveProjects}
        onSave={sync.saveProjects}
      />

      <LedgerSection
        investments={investments}
        buckets={buckets}
        ledgerComplete={ledgerComplete}
        ledgerShown={ledgerShown}
        ledgerTotal={ledgerTotal}
      />

      <Footer isLocal={sync.status === "local"} />
    </Shell>
  );
}

export default function App() {
  const {
    dashboard,
    status,
    error,
    lastSynced,
    isFetching,
    refetch,
    canSaveProjects,
    saveProjects,
  } = useDashboardData();

  if (!dashboard) {
    return status === "error" ? (
      <LoadFailure error={error} onRefresh={refetch} />
    ) : (
      <DashboardSkeleton />
    );
  }

  return (
    <Dashboard
      dashboard={dashboard}
      sync={{
        status,
        error,
        lastSynced,
        isFetching,
        refetch,
        canSaveProjects,
        saveProjects,
      }}
    />
  );
}
