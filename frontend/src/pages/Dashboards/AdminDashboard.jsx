import { useState } from 'react'
import { Button, Card, CardContent, Chip, Grid, Stack, Typography, Snackbar } from '@mui/material'
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
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertMsg, setAlertMsg] = useState('')

  const handleActionClick = (msg) => {
    setAlertMsg(msg)
    setAlertOpen(true)
  }

  return (
    <div className="min-h-screen -mt-6" style={{ background: '#f0f4f8' }}>
      {/* ── Hero header ─────────────────────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #047857 60%, #065f46 100%)',
          paddingBottom: 100,
        }}
        className="px-6 pt-12"
      >
        <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ position: 'absolute', top: -30, right: -60, width: 220, height: 220, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -10, left: -50, width: 150, height: 150, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', pointerEvents: 'none' }} />

          <div className="flex justify-between items-start mb-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-white/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-emerald-200 backdrop-blur-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin Desk
            </div>
          </div>

          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">
            Municipal operations overview
          </h1>
          <p className="text-emerald-100/80 text-base mb-6 max-w-2xl">
            Drive city-wide performance, manage access, and coordinate responses from a single control plane.
          </p>
        </div>
      </div>

      <div className="px-6" style={{ maxWidth: 1100, margin: '-64px auto 3rem' }}>
        <Grid container spacing={3}>
          {adminHighlights.map(highlight => (
            <Grid item xs={12} md={4} key={highlight.title}>
              <Card className="glass-panel rounded-3xl shadow-md bg-white">
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

        <Card className="mt-8 glass-panel rounded-4xl border border-slate-200/60 bg-white shadow-xl shadow-slate-200/60">
          <CardContent className="flex flex-col gap-4 p-8">
            <Typography variant="h6" fontWeight={600}>
              Priority actions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Approve new collector accounts, monitor overflow incidents, and review billing escalations awaiting your decision.
            </Typography>
            <Stack direction="row" spacing={2} mt={1}>
              <Button variant="contained" onClick={() => handleActionClick('Manage users module is coming soon.')}>Manage users</Button>
              <Button variant="outlined" onClick={() => handleActionClick('Review incidents module is coming soon.')}>Review incidents</Button>
            </Stack>
          </CardContent>
        </Card>
      </div>

      <Snackbar 
        open={alertOpen} 
        autoHideDuration={3000} 
        onClose={() => setAlertOpen(false)} 
        message={alertMsg} 
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </div>
  )
}

