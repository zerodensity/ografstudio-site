import type {ComponentProps} from 'react';
import type OGrafExample from './index';

/**
 * How Race telemetry plays. The lap starts by itself once the graphic is on air and runs for 103 seconds, then
 * the result holds. The show leaves it up for a while and takes it out, and the next lap loads it afresh.
 */
export const RACE_TELEMETRY: Partial<ComponentProps<typeof OGrafExample>> = {
  show: [{after: 113000, cue: 'take-out'}],
  formFields: ['title', 'captions'],
  landscapeFullscreen: true,
  sources: (
    <>
      Timing and telemetry from <a href="https://tracinginsights.com/">TracingInsights</a>, under the{' '}
      <a href="https://github.com/TracingInsights/2020/blob/main/LICENSE">MIT licence</a>, and the official result from
      their <a href="https://github.com/TracingInsights/RaceData">RaceData</a>. An unofficial replay, not affiliated with
      Formula 1, the FIA or any team.
    </>
  ),
};
