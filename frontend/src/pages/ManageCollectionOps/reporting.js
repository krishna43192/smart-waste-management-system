const HIGH_PRIORITY_PERCENT = 40;

/**
 * Format a duration measured in minutes into a human readable label.
 * @param {number|null|undefined} minutes - Total minutes to format.
 * @returns {string} Formatted duration label or an em dash when unavailable.
 */
export function formatDuration(minutes) {
  if (typeof minutes !== 'number' || Number.isNaN(minutes) || minutes <= 0) {
    return '—';
  }
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) {
    return `${mins} min`;
  }
  if (mins === 0) {
    return `${hrs} hr`;
  }
  return `${hrs} hr ${mins} min`;
}

/**
 * Build the plain-text report content used for Collection Operations exports.
 * @param {object} input
 * @param {string} input.city - City or ward associated with the plan.
 * @param {{ truckId?: string, stops?: Array, loadKg?: number, summary?: object }} input.plan - Active plan payload.
 * @param {{ activeZones?: number|null, totalZones?: number|null, availableTrucks?: number|null, fleetSize?: number|null, totalBins?: number|null }} input.summaryMetrics - Fleet overview metrics.
 * @param {number} input.completedStops - Count of stops already collected.
 * @param {number} input.remainingStops - Count of stops yet to be completed.
 * @param {number} input.totalDistanceKm - Estimated total distance of the plan.
 * @param {number|null|undefined} input.durationMinutes - Estimated duration in minutes.
 * @param {number} input.capacityLimit - Truck capacity used for the run.
 * @param {number|null} input.loadProgress - Percentage utilisation of the truck capacity.
 * @param {number|null} input.routeEfficiencyGain - Percentage efficiency improvement vs baseline.
 * @param {number} input.fuelSavedLiters - Estimated fuel savings for the plan.
 * @param {Array<{ area: string, totalKg: number, stops: number }>} input.topWasteAreas - Ranked high waste areas.
 * @param {boolean} input.liveSync - Whether live sync is currently active.
 * @param {number} input.highPriorityRatio - Ratio threshold marking bins as high priority.
 * @param {string} input.directionsSource - Human readable description of the directions engine.
 * @param {Date} [input.generatedAt] - Optional timestamp for deterministic outputs.
 * @returns {{ filename: string, content: string }} Text report payload and suggested filename.
 */
export function buildCollectionOpsReport({
  city,
  plan,
  summaryMetrics,
  completedStops,
  remainingStops,
  totalDistanceKm,
  durationMinutes,
  capacityLimit,
  loadProgress,
  routeEfficiencyGain,
  fuelSavedLiters,
  topWasteAreas,
  liveSync,
  highPriorityRatio,
  directionsSource,
  generatedAt,
}) {
  const generated = generatedAt ?? new Date();
  const cityLabel = city || 'unspecified-city';
  const safeTimestamp = generated.toISOString().replace(/[:.]/g, '-');
  const reportTitle = `Collection Ops Report — ${city || 'No city selected'}`;
  const stops = plan?.stops ?? [];
  const summary = plan?.summary || {};

  const thresholdPct = typeof summary.threshold === 'number'
    ? `${Math.round(summary.threshold * 100)}%`
    : '—';
  const durationLabel = formatDuration(durationMinutes);
  const ratio = typeof highPriorityRatio === 'number' ? highPriorityRatio : HIGH_PRIORITY_PERCENT / 100;
  const highPriorityPercent = Math.round(ratio * 100) || HIGH_PRIORITY_PERCENT;

  const lines = [
    reportTitle,
    `Generated: ${generated.toLocaleString()}`,
    '',
    '=== Operations Overview ===',
    `Active zones (7d): ${summaryMetrics.activeZones ?? '—'} of ${summaryMetrics.totalZones ?? '—'}`,
    `Available trucks: ${summaryMetrics.availableTrucks ?? '—'} (fleet size ${summaryMetrics.fleetSize ?? '—'})`,
    `Total bins network-wide: ${summaryMetrics.totalBins ?? '—'}`,
    '',
    '=== Plan Summary ===',
    `City: ${city || '—'}`,
    `Assigned truck: ${plan?.truckId || 'TRUCK-01'}`,
    `Stops scheduled: ${stops.length}`,
    `Stops collected: ${completedStops}/${stops.length}`,
    `Remaining stops: ${remainingStops}`,
    `Plan threshold: ${thresholdPct}`,
    `Considered bins: ${summary.consideredBins ?? '—'}`,
    `High priority bins (>=${highPriorityPercent}% full): ${summary.highPriorityBins ?? 0}`,
    `Estimated route distance: ${totalDistanceKm ? `${totalDistanceKm.toFixed(1)} km` : '—'}`,
    `Estimated duration: ${durationLabel}`,
    `Load collected: ${plan?.loadKg ?? 0} kg of capacity ${capacityLimit} kg`,
    `Capacity utilisation: ${loadProgress !== null && loadProgress !== undefined ? `${loadProgress}%` : '—'}`,
    `Route efficiency gain: ${routeEfficiencyGain !== null && routeEfficiencyGain !== undefined ? `${routeEfficiencyGain}%` : '—'}`,
    `Projected fuel saved: ${fuelSavedLiters.toFixed(1)} L`,
    '',
    '=== High Waste Areas ===',
  ];

  if (Array.isArray(topWasteAreas) && topWasteAreas.length) {
    topWasteAreas.forEach((area, index) => {
      lines.push(`${index + 1}. ${area.area} — ~${Math.round(area.totalKg)} kg across ${area.stops} stops`);
    });
  } else {
    lines.push('No high waste areas identified for this plan.');
  }

  lines.push('', '=== Stop Checklist ===');
  if (stops.length) {
    stops.forEach((stop, index) => {
      const coords = [stop.lat, stop.lon]
        .map(value => (typeof value === 'number' ? value.toFixed(4) : '—'))
        .join(', ');
      const status = stop.visited ? 'Collected' : 'Pending';
      const line = `${index + 1}. ${stop.binId} • ${status} • est. ${stop.estKg} kg • (${coords})`;
      lines.push(line);
    });
  } else {
    lines.push('No stops scheduled. Run optimisation to generate a checklist.');
  }

  lines.push('', '=== Data Sources ===');
  lines.push(`Live sync: ${liveSync ? 'Enabled' : 'Disabled'}`);
  lines.push(`Directions source: ${directionsSource}`);

  return {
    filename: `collection-ops-report-${cityLabel}-${safeTimestamp}.txt`,
    content: lines.join('\n'),
  };
}
