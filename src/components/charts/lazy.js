import { lazy } from "react";

/**
 * Recharts is ~380 kB of the bundle and nothing above the fold needs it, so
 * both chart components load as a separate chunk behind <Suspense>. The rest
 * of the dashboard — every KPI, table and total — paints without it.
 */
export const DonutCard = lazy(() => import("./DonutCard"));
export const HorizontalBarChart = lazy(() => import("./HorizontalBarChart"));
