import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Card, CardContent, CardHeader, Chip,
  CircularProgress, Divider, FormControl, Grid, InputLabel,
  MenuItem, Select, Stack, Switch, FormControlLabel, TextField, Typography,
} from '@mui/material'
import { Save, SlidersHorizontal, BarChart3, LineChart, PieChart, Download } from 'lucide-react'
import jsPDF from 'jspdf'
import * as XLSX from 'xlsx'
import PropTypes from 'prop-types'

// ─── Constants ────────────────────────────────────────────────────────────────

const sectionSwitches = [
  { key: 'households', label: 'Household table' },
  { key: 'regions', label: 'Region breakdown' },
  { key: 'wasteTypes', label: 'Waste composition' },
  { key: 'timeline', label: 'Trend timeline' },
]

const defaultVisibility = {
  households: true,
  regions: true,
  wasteTypes: true,
  timeline: true,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKg(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0 kg'
  return `${numeric.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HorizontalMetricBar({ label, value, maxValue, accent }) {
  const width = maxValue === 0 ? 0 : Math.round((value / maxValue) * 100)
  return (
    <Stack spacing={0.5}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="body2" fontWeight={600}>{label}</Typography>
        <Typography variant="body2" color="text.secondary">{formatKg(value)}</Typography>
      </Stack>
      <Box sx={{ height: 10, borderRadius: '999px', bgcolor: 'rgba(15, 23, 42, 0.08)', overflow: 'hidden' }}>
        <Box sx={{ width: `${width}%`, height: '100%', background: accent ?? '#10b981' }} />
      </Box>
    </Stack>
  )
}

function TimelineSparkline({ data }) {
  if (!data?.length) return null
  const max = Math.max(...data.map(point => point.totalKg)) || 1
  return (
    <Stack direction="row" alignItems="flex-end" spacing={1} sx={{ minHeight: 120, width: '100%' }}>
      {data.map(point => {
        const height = Math.max(6, Math.round((point.totalKg / max) * 100))
        return (
          <Stack key={point.day} spacing={0.5} alignItems="center" sx={{ flex: 1 }}>
            <Box sx={{ width: '100%', height: height, borderRadius: '8px 8px 2px 2px', bgcolor: 'rgba(16, 185, 129, 0.55)' }} />
            <Typography variant="caption" color="text.secondary">
              {new Date(point.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </Typography>
          </Stack>
        )
      })}
    </Stack>
  )
}

// ─── ReportFilters Component ──────────────────────────────────────────────────

function ReportFilters({ config, filters, onFilterChange, visibility, onVisibilityToggle, onSubmit, loading, loadingConfig }) {
  return (
    <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
      <CardHeader
        avatar={<SlidersHorizontal className="h-5 w-5 text-brand-600" />}
        title="Report filters"
        subheader="Narrow down the data to a specific period, region, or waste category"
      />
      <CardContent>
        <Stack spacing={3} component="form" onSubmit={onSubmit}>
          {/* Date range */}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="From date"
                type="date"
                name="from"
                value={filters.from}
                onChange={onFilterChange}
                fullWidth
                InputLabelProps={{ shrink: true }}
                size="small"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="To date"
                type="date"
                name="to"
                value={filters.to}
                onChange={onFilterChange}
                fullWidth
                InputLabelProps={{ shrink: true }}
                size="small"
              />
            </Grid>
          </Grid>

          {/* Multi-select filters */}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Regions</InputLabel>
                <Select
                  multiple
                  name="regions"
                  value={filters.regions}
                  onChange={onFilterChange}
                  label="Regions"
                  renderValue={selected => selected.join(', ')}
                >
                  {loadingConfig ? (
                    <MenuItem disabled><CircularProgress size={16} /></MenuItem>
                  ) : (
                    (config?.filters?.regions || []).map(r => (
                      <MenuItem key={r} value={r}>{r}</MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Waste types</InputLabel>
                <Select
                  multiple
                  name="wasteTypes"
                  value={filters.wasteTypes}
                  onChange={onFilterChange}
                  label="Waste types"
                  renderValue={selected => selected.join(', ')}
                >
                  {loadingConfig ? (
                    <MenuItem disabled><CircularProgress size={16} /></MenuItem>
                  ) : (
                    (config?.filters?.wasteTypes || []).map(w => (
                      <MenuItem key={w} value={w}>{w}</MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Billing models</InputLabel>
                <Select
                  multiple
                  name="billingModels"
                  value={filters.billingModels}
                  onChange={onFilterChange}
                  label="Billing models"
                  renderValue={selected => selected.join(', ')}
                >
                  {loadingConfig ? (
                    <MenuItem disabled><CircularProgress size={16} /></MenuItem>
                  ) : (
                    (config?.filters?.billingModels || []).map(b => (
                      <MenuItem key={b} value={b}>{b}</MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* Section visibility toggles */}
          <Box>
            <Typography variant="body2" fontWeight={600} color="text.secondary" mb={1}>
              Sections to include
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {sectionSwitches.map(sw => (
                <FormControlLabel
                  key={sw.key}
                  control={
                    <Switch
                      checked={visibility[sw.key]}
                      onChange={() => onVisibilityToggle(sw.key)}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">{sw.label}</Typography>}
                />
              ))}
            </Stack>
          </Box>

          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <BarChart3 className="h-4 w-4" />}
            sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600, alignSelf: 'flex-start', px: 3 }}
          >
            {loading ? 'Generating…' : 'Generate report'}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ─── ReportSummary Component ──────────────────────────────────────────────────

function ReportSummary({ report, onExport }) {
  return (
    <Card className="rounded-3xl border border-emerald-200/80 bg-emerald-50/60 shadow-sm">
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={3}>
          <Box>
            <Typography variant="h6" fontWeight={700} color="text.primary">
              Report snapshot
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {report.criteria?.dateRange?.from?.toString().slice(0, 10)} →{' '}
              {report.criteria?.dateRange?.to?.toString().slice(0, 10)}
            </Typography>
          </Box>

          <Stack direction="row" flexWrap="wrap" gap={2}>
            <Box className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm" sx={{ minWidth: 110 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">Records</Typography>
              <Typography variant="h6" fontWeight={700}>{report.totals?.records?.toLocaleString() ?? '—'}</Typography>
            </Box>
            <Box className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm" sx={{ minWidth: 110 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} textTransform="uppercase">Total weight</Typography>
              <Typography variant="h6" fontWeight={700}>{formatKg(report.totals?.totalWeightKg)}</Typography>
            </Box>
            <Box className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm" sx={{ minWidth: 110 }}>
              <Typography variant="caption" color="success.main" fontWeight={600} textTransform="uppercase">Recyclable</Typography>
              <Typography variant="h6" fontWeight={700} color="success.main">{formatKg(report.totals?.recyclableWeightKg)}</Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Download className="h-4 w-4" />}
              onClick={() => onExport('pdf')}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
            >
              PDF
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Download className="h-4 w-4" />}
              onClick={() => onExport('xlsx')}
              sx={{ borderRadius: '999px', textTransform: 'none', fontWeight: 600 }}
            >
              Excel
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage({ session }) {
  const [config, setConfig] = useState(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    regions: [],
    wasteTypes: [],
    billingModels: [],
  })
  const [visibility, setVisibility] = useState(defaultVisibility)
  const [report, setReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState(null)
  const [noRecordsMessage, setNoRecordsMessage] = useState('')

  const sessionUserId = useMemo(() => {
    if (!session) return null
    return session.id ?? session._id ?? null
  }, [session])

  // Fetch the available filters (regions, waste types, etc.) once when the page loads.
  useEffect(() => {
    async function loadConfig() {
      setLoadingConfig(true)
      try {
        const res = await fetch('/api/analytics/config')
        if (!res.ok) throw new Error(`Failed to load config (${res.status})`)
        const data = await res.json()
        setConfig(data)

        // Pre-populate date range from API defaults if available
        if (data?.filters?.defaultDateRange?.from) {
          setFilters(prev => ({
            ...prev,
            from: data.filters.defaultDateRange.from?.toString().slice(0, 10) ?? '',
            to: data.filters.defaultDateRange.to?.toString().slice(0, 10) ?? '',
          }))
        }
      } catch (err) {
        console.error('loadConfig error', err)
      } finally {
        setLoadingConfig(false)
      }
    }
    loadConfig()
  }, [])

  const handleFilterChange = useCallback(event => {
    const { name, value } = event.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }, [])

  const toggleVisibility = useCallback(key => {
    setVisibility(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // Generate the analytics snapshot based on the currently selected criteria.
  const handleSubmit = useCallback(async event => {
    event.preventDefault()
    setError(null)
    setNoRecordsMessage('')

    if (!filters.from || !filters.to) {
      setError('Please pick a start and end date before generating the report.')
      return
    }

    setLoadingReport(true)
    try {
      const userId = sessionUserId
      if (!userId) {
        throw new Error('You must be signed in to generate analytics reports.')
      }
      const payload = {
        userId,
        criteria: {
          dateRange: { from: filters.from, to: filters.to },
          regions: filters.regions,
          wasteTypes: filters.wasteTypes,
          billingModels: filters.billingModels,
        },
      }

      const response = await fetch('/api/analytics/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate report')
      }
      if (!data.data) {
        setReport(null)
        setNoRecordsMessage(data.message || 'No Records Available')
        return
      }
      setReport(data.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingReport(false)
    }
  }, [filters, sessionUserId])

  // Export the generated analytics to either PDF or Excel.
  const handleExport = useCallback(format => {
    if (!report) return

    if (format === 'pdf') {
      const doc = new jsPDF()
      doc.setFontSize(16)
      doc.text('Smart Waste LK – Waste Analytics Report', 14, 20)
      doc.setFontSize(11)
      doc.text(`Period: ${report.criteria.dateRange.from?.toString().slice(0, 10)} to ${report.criteria.dateRange.to?.toString().slice(0, 10)}`, 14, 30)
      doc.text(`Regions: ${report.criteria.regions?.join(', ') || 'All'}`, 14, 38)
      doc.text(`Waste Types: ${report.criteria.wasteTypes?.join(', ') || 'All'}`, 14, 46)
      doc.text(`Billing Models: ${report.criteria.billingModels?.join(', ') || 'All'}`, 14, 54)
      doc.text('Totals', 14, 68)
      doc.text(`Total records: ${report.totals.records}`, 14, 76)
      doc.text(`Total weight: ${report.totals.totalWeightKg} kg`, 14, 84)
      doc.text(`Recyclable: ${report.totals.recyclableWeightKg} kg`, 14, 92)
      doc.text(`Non-recyclable: ${report.totals.nonRecyclableWeightKg} kg`, 14, 100)
      let cursorY = 116
      const topHouseholds = report.tables.households.slice(0, 10)
      doc.text('Top households by weight', 14, cursorY)
      cursorY += 8
      topHouseholds.forEach(household => {
        doc.text(`${household.householdId} • ${household.region} • ${household.totalKg} kg`, 14, cursorY)
        cursorY += 8
      })
      doc.save('smart-waste-analytics.pdf')
    }

    if (format === 'xlsx') {
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.tables.regions), 'Regions')
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.tables.households), 'Households')
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.tables.wasteTypes), 'Waste Types')
      XLSX.writeFile(workbook, 'smart-waste-analytics.xlsx')
    }
  }, [report])

  const maxRegionValue = useMemo(() => {
    if (!report?.charts?.regionSummary?.length) return 0
    return Math.max(...report.charts.regionSummary.map(item => item.totalKg))
  }, [report])

  const maxWasteValue = useMemo(() => {
    if (!report?.charts?.wasteSummary?.length) return 0
    return Math.max(...report.charts.wasteSummary.map(item => item.totalKg))
  }, [report])

  return (
    <div className="min-h-screen -mt-6" style={{ background: '#f0f4f8' }}>
      {/* ── Hero header ─────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #047857 60%, #065f46 100%)',
          paddingBottom: 80,
        }}
        className="px-6 pt-12"
      >
        <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ position: 'absolute', top: -30, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -10, left: -50, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-200 backdrop-blur-sm mb-5">
            <BarChart3 className="h-3.5 w-3.5" />
            Reports & analytics
          </div>

          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">
            Generate waste insights by region, customer, and billing model
          </h1>
          <p className="text-emerald-100/80 text-base mb-6 max-w-2xl">
            Choose your filters to uncover how waste generation is trending across the network.
          </p>
        </div>
      </div>

      <div className="px-6" style={{ maxWidth: 1100, margin: '-44px auto 3rem' }}>
        <div className="rounded-4xl border border-slate-200 bg-white/95 p-8 shadow-xl shadow-slate-200/60 backdrop-blur-sm">
          <Stack spacing={5}>

        {/* Error alert */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
        )}

        {/* No records alert */}
        {noRecordsMessage && (
          <Alert severity="info" onClose={() => setNoRecordsMessage('')}>{noRecordsMessage}</Alert>
        )}

        {/* Filter form */}
        <ReportFilters
          config={config}
          filters={filters}
          onFilterChange={handleFilterChange}
          visibility={visibility}
          onVisibilityToggle={toggleVisibility}
          onSubmit={handleSubmit}
          loading={loadingReport}
          loadingConfig={loadingConfig}
        />

        {/* Report summary */}
        {report && <ReportSummary report={report} onExport={handleExport} />}

        {/* Report sections */}
        {report && (
          <Stack spacing={4}>
            {visibility.regions && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<PieChart className="h-5 w-5 text-brand-600" />}
                  title="Region-wise waste analysis"
                  subheader="Compare waste volumes across the selected regions"
                />
                <CardContent>
                  <Stack spacing={2}>
                    {(report.charts.regionSummary || []).map(region => (
                      <HorizontalMetricBar
                        key={region.region}
                        label={region.region}
                        value={region.totalKg}
                        maxValue={maxRegionValue}
                        accent="linear-gradient(90deg, rgba(16,185,129,0.65) 0%, rgba(14,165,233,0.5) 100%)"
                      />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            )}

            {visibility.wasteTypes && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<PieChart className="h-5 w-5 text-amber-500" />}
                  title="Recyclable vs non-recyclable"
                  subheader="Waste composition across the chosen filters"
                />
                <CardContent>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <Stack spacing={2}>
                        {(report.charts.wasteSummary || []).map(item => (
                          <HorizontalMetricBar
                            key={item.wasteType}
                            label={item.wasteType}
                            value={item.totalKg}
                            maxValue={maxWasteValue}
                            accent="linear-gradient(90deg, rgba(244,114,182,0.65) 0%, rgba(251,191,36,0.55) 100%)"
                          />
                        ))}
                      </Stack>
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <Box className="rounded-3xl border border-slate-100 bg-slate-50/60 p-6">
                        <Typography variant="subtitle1" fontWeight={600} gutterBottom>Split snapshot</Typography>
                        <Stack spacing={2}>
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Box sx={{ width: 16, height: 16, borderRadius: '999px', bgcolor: 'rgba(16, 185, 129, 0.7)' }} />
                            <Typography variant="body2">Recyclable {formatKg(report.totals.recyclableWeightKg)}</Typography>
                          </Stack>
                          <Stack direction="row" spacing={2} alignItems="center">
                            <Box sx={{ width: 16, height: 16, borderRadius: '999px', bgcolor: 'rgba(239, 68, 68, 0.7)' }} />
                            <Typography variant="body2">Non-recyclable {formatKg(report.totals.nonRecyclableWeightKg)}</Typography>
                          </Stack>
                        </Stack>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            )}

            {visibility.timeline && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<LineChart className="h-5 w-5 text-sky-500" />}
                  title="Trend over time"
                  subheader="Track the daily waste collected for the selected filters"
                />
                <CardContent>
                  <TimelineSparkline data={report.charts.timeSeries} />
                </CardContent>
              </Card>
            )}

            {visibility.households && (
              <Card className="rounded-3xl border border-slate-200/80 shadow-sm">
                <CardHeader
                  avatar={<BarChart3 className="h-5 w-5 text-brand-600" />}
                  title="Waste generated per household"
                  subheader="Top contributors by total kilograms"
                />
                <CardContent>
                  <Stack spacing={2}>
                    {(report.tables.households || []).slice(0, 12).map(household => (
                      <Box key={household.householdId} className="rounded-2xl border border-slate-100 bg-white/80 px-4 py-3">
                        <Stack
                          direction={{ xs: 'column', md: 'row' }}
                          justifyContent="space-between"
                          alignItems={{ xs: 'flex-start', md: 'center' }}
                          spacing={2}
                        >
                          <Stack spacing={0.25}>
                            <Typography variant="subtitle1" fontWeight={600}>{household.householdId}</Typography>
                            <Typography variant="body2" color="text.secondary">{household.region} • {household.billingModel}</Typography>
                          </Stack>
                          <Stack direction="row" spacing={3}>
                            <Chip label={`${household.pickups} pickups`} variant="outlined" color="default" />
                            <Chip label={formatKg(household.totalKg)} color="success" />
                          </Stack>
                        </Stack>
                      </Box>
                    ))}
                  </Stack>
                  <Divider sx={{ my: 3 }} />
                  <Typography variant="caption" color="text.secondary">
                    Showing top {Math.min((report.tables.households || []).length, 12)} of{' '}
                    {(report.tables.households || []).length} households by total collected weight.
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Stack>
        )}
          </Stack>
        </div>
      </div>
    </div>
  )
}

// ─── PropTypes ────────────────────────────────────────────────────────────────

HorizontalMetricBar.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  maxValue: PropTypes.number.isRequired,
  accent: PropTypes.string,
}
HorizontalMetricBar.defaultProps = { accent: undefined }

TimelineSparkline.propTypes = {
  data: PropTypes.arrayOf(PropTypes.shape({
    day: PropTypes.string.isRequired,
    totalKg: PropTypes.number.isRequired,
  })),
}
TimelineSparkline.defaultProps = { data: [] }

ReportFilters.propTypes = {
  config: PropTypes.object,
  filters: PropTypes.object.isRequired,
  onFilterChange: PropTypes.func.isRequired,
  visibility: PropTypes.object.isRequired,
  onVisibilityToggle: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  loadingConfig: PropTypes.bool,
}

ReportSummary.propTypes = {
  report: PropTypes.object.isRequired,
  onExport: PropTypes.func.isRequired,
}

ReportsPage.propTypes = {
  session: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }),
}
ReportsPage.defaultProps = { session: null }