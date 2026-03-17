import { Button, Card, CardContent, Chip, Grid, Stack, Typography } from '@mui/material'
import { BarChart3, ShieldCheck, Users } from 'lucide-react'

// Highlighted metrics summarising city-wide operations for administrators.
const adminHighlights = [
  {
    title: 'Active collectors',
    value: '24 crews',
    helper: 'Across Hyderabad GHMC zones',
    icon: Users,
  },
  {
    title: 'Overflow alerts',
    value: '3 bins',
    helper: 'Require escalation to rapid response',
    icon: ShieldCheck,
  },
  {
    title: 'Billing compliance',
    value: '98%',
    helper: 'Invoices submitted this month',
    icon: BarChart3,
  },
]

// Presents the administrator control-room dashboard with key KPIs and actions.
export default function AdminDashboard() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-12">
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={3}>
        <div>
          <Typography variant="h4" fontWeight={600} color="text.primary">
            Municipal operations overview
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Drive city-wide performance, manage access, and coordinate responses from a single control plane.
          </Typography>
        </div>
        <Chip label="Administrator" color="primary" sx={{ fontWeight: 600 }} />
      </Stack>

      <Grid container spacing={3}>
        {adminHighlights.map(highlight => (
          <Grid item xs={12} md={4} key={highlight.title}>
            <Card className="glass-panel rounded-3xl shadow-md">
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center gap-3 text-brand-600">
                  <highlight.icon className="h-5 w-5" />
                  <Typography variant="overline" color="text.secondary" fontWeight={600}>
                    {highlight.title}
                  </Typography>
                </div>
                <Typography variant="h5" fontWeight={600} color="text.primary">
                  {highlight.value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {highlight.helper}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card className="glass-panel rounded-4xl border border-slate-200/60 bg-white/90 shadow-md">
        <CardContent className="flex flex-col gap-4">
          <Typography variant="h6" fontWeight={600}>
            Priority actions
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Approve new collector accounts, monitor overflow incidents, and review billing escalations awaiting your decision.
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button variant="contained">Manage users</Button>
            <Button variant="outlined">Review incidents</Button>
          </Stack>
        </CardContent>
      </Card>
    </div>
  )
}

