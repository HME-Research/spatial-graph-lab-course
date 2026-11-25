import { createContext, useContext } from 'react';
import { DEFAULT_ENABLED_METRICS, type EnabledMetricIds } from '@app/metrics';

/**
 * The project's enabled calculated values (`settings.calculatedFields`, read with
 * `sanitizeEnabledMetrics`), provided by the shell (I1). Properties and the 3D colour-by read the
 * same selection; without a provider the built-in default selection applies.
 */
export const EnabledMetricsContext = createContext<EnabledMetricIds>(DEFAULT_ENABLED_METRICS);

export const useEnabledMetrics = (): EnabledMetricIds => useContext(EnabledMetricsContext);
