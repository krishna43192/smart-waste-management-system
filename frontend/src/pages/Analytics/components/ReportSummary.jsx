/**
 * Report Summary Component
 * 
 * Displays the summary section of the analytics report.
 * Follows the Single Responsibility Principle.
 * 
 * @component
 */

import PropTypes from 'prop-types';
import {
  Button,
  Card,
  CardContent,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { Download, Save } from 'lucide-react';
import { formatKg, formatDateRange, formatArray } from '../utils/formatUtils';

/**
 * Metric Card Component
 * Small reusable card for displaying a single metric
 */
function MetricCard({ label, value }) {
  return (
    <Card className="rounded-2xl border border-slate-100 bg-slate-50/60 shadow-sm">
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" fontWeight={600}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

MetricCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};

/**
 * ReportSummary Component
 * 
 * @param {Object} props
 * @param {Object} props.report - Report data object
 * @param {Function} props.onExport - Callback for export actions
 */
function ReportSummary({ report, onExport }) {
  if (!report) return null;

  const { criteria, totals } = report;

  return (
    <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
      <CardContent>
        {/* Header with export buttons */}
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={3}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
        >
          <Stack spacing={0.5}>
            <Typography variant="h6" fontWeight={600}>
              Report summary
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDateRange(criteria.dateRange.from, criteria.dateRange.to)} |{' '}
              {formatArray(criteria.regions, 'All regions')}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<Download size={16} />}
              onClick={() => onExport('pdf')}
            >
              Export PDF
            </Button>
            <Button
              variant="contained"
              startIcon={<Save size={16} />}
              onClick={() => onExport('xlsx')}
            >
              Export Excel
            </Button>
          </Stack>
        </Stack>

        {/* Metrics grid */}
        <Grid container spacing={3} mt={1}>
          <Grid item xs={12} md={3}>
            <MetricCard label="Total pickups" value={totals.records} />
          </Grid>
          <Grid item xs={12} md={3}>
            <MetricCard label="Total weight" value={formatKg(totals.totalWeightKg)} />
          </Grid>
          <Grid item xs={12} md={3}>
            <MetricCard label="Recyclable" value={formatKg(totals.recyclableWeightKg)} />
          </Grid>
          <Grid item xs={12} md={3}>
            <MetricCard label="Non-recyclable" value={formatKg(totals.nonRecyclableWeightKg)} />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

ReportSummary.propTypes = {
  report: PropTypes.shape({
    criteria: PropTypes.object.isRequired,
    totals: PropTypes.object.isRequired,
  }),
  onExport: PropTypes.func.isRequired,
};

ReportSummary.defaultProps = {
  report: null,
};

export default ReportSummary;
