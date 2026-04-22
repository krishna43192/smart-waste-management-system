import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { CssBaseline, Chip, Tooltip, ThemeProvider, createTheme, Avatar, IconButton, Menu, MenuItem, ListItemIcon, Divider } from '@mui/material'
import { MapPinned, Truck, CalendarClock, BarChart3, Sparkles, Gauge, CheckCircle2, AlertTriangle, ArrowUpRight, LogIn, ShieldCheck, UserCircle, UserPlus, LogOut, UserRound, Trophy, Star } from 'lucide-react'
import './App.css'
import ManageCollectionOpsPage from './pages/ManageCollectionOps/ManageCollectionOpsPage.jsx'
import LoginPage from './pages/Auth/LoginPage.jsx'
import RegisterPage from './pages/Auth/RegisterPage.jsx'
import UserDashboard from './pages/Dashboards/UserDashboard.jsx'
import AdminDashboard from './pages/Dashboards/AdminDashboard.jsx'
import SpecialCollectionPage from './pages/Schedule/SpecialCollectionPage.jsx'
import ReportsPage from './pages/Analytics/ReportsPage.jsx'
import CheckoutResultPage from './pages/Billing/CheckoutResultPage.jsx'
import SpecialCollectionCheckoutResult from './pages/Schedule/SpecialCollectionCheckoutResult.jsx'

// ✅ Gamification imports
import PointsDashboard from './pages/Gamification/PointsDashboard.jsx'
import Leaderboard from './pages/Gamification/Leaderboard.jsx'

const baseNavLinks = [
  { to: '/ops', label: 'Collection Ops', description: 'Plan and monitor routes', icon: MapPinned },
  { to: '/schedule', label: 'Schedule', description: 'Pickup calendar', icon: CalendarClock },
  { to: '/analytics', label: 'Analytics', description: 'Performance dashboards', icon: BarChart3 },
  // ✅ Leaderboard nav link (visible to all logged-in users)
  { to: '/leaderboard', label: 'Leaderboard', description: 'Top residents & collectors', icon: Trophy },
]

function Nav({ session, onSignOut }) {
  const [menuAnchor, setMenuAnchor] = useState(null)

  const navLinks = baseNavLinks.filter(link => {
    // ✅ FIXED Issue 4: Hide Schedule for both admin AND collector
    if ((session?.role === 'admin' || session?.role === 'collector') && link.to === '/schedule') return false
    if (link.to === '/analytics') return session?.role === 'admin'
    // Leaderboard visible to all logged-in users
    if (link.to === '/leaderboard') return Boolean(session)
    return true
  })

  if (session?.role === 'admin') {
    navLinks.push({
      to: '/adminDashboard',
      label: 'Admin Desk',
      description: 'Administration controls',
      icon: ShieldCheck,
    })
  }

  const menuOpen = Boolean(menuAnchor)

  // ✅ FIXED Issue 5: Correct dashboard path for all 3 roles
  const dashboardPath = session?.role === 'admin'
    ? '/adminDashboard'
    : session?.role === 'collector'
      ? '/ops'
      : '/userDashboard'

  // ✅ FIXED Issue 5: Correct dashboard label for all 3 roles
  const dashboardLabel = session?.role === 'admin'
    ? 'Admin dashboard'
    : session?.role === 'collector'
      ? 'Collector ops'
      : 'My dashboard'

  const userInitial = session?.name?.[0]?.toUpperCase() ?? 'S'

  const handleMenuOpen = event => setMenuAnchor(event.currentTarget)
  const handleMenuClose = () => setMenuAnchor(null)
  const handleSignOut = () => { handleMenuClose(); onSignOut() }

  const menuItems = session
    ? [
        (
          <MenuItem key="dashboard" component={NavLink} to={dashboardPath} onClick={handleMenuClose}>
            <ListItemIcon>
              {session.role === 'admin' ? <ShieldCheck className="h-4 w-4" /> : <UserCircle className="h-4 w-4" />}
            </ListItemIcon>
            {dashboardLabel}
          </MenuItem>
        ),
        // ✅ My Points link — residents and collectors only
        session.role !== 'admin' && (
          <MenuItem key="points" component={NavLink} to="/points" onClick={handleMenuClose}>
            <ListItemIcon><Star className="h-4 w-4" /></ListItemIcon>
            My Points
          </MenuItem>
        ),
        <Divider key="divider" sx={{ my: 0.5 }} component="li" />,
        (
          <MenuItem key="signout" onClick={handleSignOut}>
            <ListItemIcon><LogOut className="h-4 w-4" /></ListItemIcon>
            Sign out
          </MenuItem>
        ),
      ].filter(Boolean)
    : [
        (
          <MenuItem key="signin" component={NavLink} to="/login" onClick={handleMenuClose}>
            <ListItemIcon><LogIn className="h-4 w-4" /></ListItemIcon>
            Sign in
          </MenuItem>
        ),
        (
          <MenuItem key="register" component={NavLink} to="/register" onClick={handleMenuClose}>
            <ListItemIcon><UserPlus className="h-4 w-4" /></ListItemIcon>
            Create account
          </MenuItem>
        ),
      ]

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800/60 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-4 text-slate-100">
        <div className="flex flex-1 min-w-[16rem] items-center gap-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <img
              src="/logo.png"
              alt="Smart Waste HYD"
              className="h-9 w-9 rounded-full border border-brand-500/30 p-1 object-contain shadow-sm"
            />
            Smart Waste Hyd
          </Link>
          <Chip
            label="Pilot programme"
            size="small"
            color="success"
            variant="outlined"
            sx={{ borderRadius: '999px', fontWeight: 600, letterSpacing: '0.02em' }}
          />
        </div>

        <nav className="flex items-center flex-nowrap gap-3 md:gap-4 text-sm font-medium">
          {navLinks.map(link => (
            <Tooltip key={link.to} title={link.description} placement="bottom" arrow enterDelay={150}
              componentsProps={{ tooltip: { sx: { pointerEvents: 'none' } } }}>
              <span className="inline-flex">
                <NavLink
                  to={link.to}
                  className={({ isActive }) =>
                    `group relative inline-flex items-center gap-2 rounded-full px-4 py-2 transition
                    ${isActive
                      ? 'bg-brand-500/25 text-brand-100 shadow-inner'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <link.icon className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap">{link.label}</span>
                      {isActive && <span className="h-2 w-2 rounded-full bg-brand-200" />}
                    </>
                  )}
                </NavLink>
              </span>
            </Tooltip>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {session && (
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-100">{session.name}</p>
              <p className="text-xs uppercase tracking-wide text-slate-400">{session.role}</p>
            </div>
          )}
          <Tooltip title="Account" placement="bottom" arrow>
            <IconButton
              onClick={handleMenuOpen}
              size="small"
              sx={{ borderRadius: '50%', border: '1px solid rgba(148, 163, 184, 0.35)', padding: 0 }}
              aria-controls={menuOpen ? 'account-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={menuOpen ? 'true' : undefined}
            >
              <Avatar sx={{ width: 36, height: 36, bgcolor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 600, fontSize: '0.9rem' }}>
                {session ? userInitial : <UserRound className="h-4 w-4" />}
              </Avatar>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={menuAnchor}
            id="account-menu"
            open={menuOpen}
            onClose={handleMenuClose}
            onClick={handleMenuClose}
            PaperProps={{
              elevation: 4,
              sx: {
                mt: 1.5, minWidth: 200, borderRadius: 3, overflow: 'visible',
                '&::before': {
                  content: '""', display: 'block', position: 'absolute',
                  top: 0, right: 18, width: 12, height: 12,
                  bgcolor: 'background.paper',
                  transform: 'translateY(-50%) rotate(45deg)', zIndex: 0,
                },
              },
            }}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            {menuItems}
          </Menu>
        </div>
      </div>
    </header>
  )
}

function Home() {
  const highlights = [
    { label: 'Avg. Pickup Load', value: '2.6 t', helper: 'Across Hyderabad zones last 7 days', icon: Gauge },
    { label: 'Route Completion', value: '92%', helper: 'On-time stops today', icon: CheckCircle2 },
    { label: 'Alerts', value: '5 bins', helper: 'Approaching overflow threshold', icon: AlertTriangle },
  ]

  const quickLinks = [
    { to: '/ops', headline: 'Optimize ward routes', copy: 'Generate the most efficient path in seconds.', icon: MapPinned, accent: 'from-brand-400/30 via-brand-400/10 to-transparent' },
    { to: '/ops#collector-checklist', headline: 'Coordinate field teams', copy: 'Live progress and digital checklists for crews.', icon: Truck, accent: 'from-sky-400/30 via-sky-400/10 to-transparent' },
    { to: '/analytics', headline: 'Spot hotspots early', copy: 'Use telemetry to prevent overflow incidents.', icon: BarChart3, accent: 'from-amber-400/30 via-amber-400/10 to-transparent' },
  ]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-12">
      <section className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="glass-panel rounded-4xl p-10 shadow-glow">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-600">
            <Sparkles className="h-3.5 w-3.5" />
            City operations cockpit
          </div>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900 sm:text-4xl">
            City-scale waste collection, simplified.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Plan routes, guide crews, and monitor performance in one workspace
            tailored for Hyderabad municipalities.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/ops"
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-500/40 transition hover:translate-y-[-1px] hover:bg-brand-500">
              Start a new plan
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link to="/ops#collector-checklist"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-brand-300 hover:text-brand-700">
              View collector route
            </Link>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-4xl shadow-xl shadow-emerald-900/30">
          {/* Greenery background image */}
          <img
            src="/hero-greenery.png"
            alt="Green smart city — Hyderabad sustainable waste management"
            className="h-full w-full object-cover absolute inset-0"
          />
          {/* Gradient overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/60 to-emerald-950/30" />

          {/* Content on top of image */}
          <div className="relative p-8 text-slate-100 flex flex-col justify-end min-h-[420px]">
            <h2 className="text-sm uppercase tracking-wide text-emerald-300 font-semibold">Ops snapshot</h2>
            <div className="mt-5 grid gap-4">
              {highlights.map(item => (
                <div key={item.label} className="flex items-start justify-between rounded-2xl bg-slate-900/50 backdrop-blur-sm px-5 py-4 border border-white/10">
                  <div className="flex items-start gap-3">
                    <item.icon className="mt-0.5 h-5 w-5 text-emerald-400" />
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-300">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
                    </div>
                  </div>
                  <p className="max-w-[12rem] text-right text-xs text-slate-300">{item.helper}</p>
                </div>
              ))}
            </div>
            {/* ✅ FIXED Issue 1: Changed Colombo Time to IST Hyderabad */}
            <p className="mt-5 text-xs text-emerald-300/70">Service window: 05:00 – 20:00 IST (Hyderabad)</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        {quickLinks.map(card => (
          <Link key={card.to} to={card.to}
            className="group relative overflow-hidden rounded-4xl border border-slate-200/70 bg-white/80 p-6 shadow-md transition duration-200 hover:-translate-y-1 hover:shadow-xl">
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.accent}`} />
            <div className="relative flex h-full flex-col justify-between gap-6">
              <div className="flex items-center gap-3 text-slate-500">
                <card.icon className="h-5 w-5" />
                <p className="text-xs font-semibold uppercase tracking-wide">Go to module</p>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900">{card.headline}</h3>
                <p className="mt-3 text-sm text-slate-600">{card.copy}</p>
              </div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 transition group-hover:text-brand-700">
                Open workspace
                <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        ))}
      </section>
    </div>
  )
}

const theme = createTheme({
  palette: {
    primary: { main: '#10b981', light: '#34d399', dark: '#059669', contrastText: '#ffffff' },
    secondary: { main: '#475569', light: '#64748b', dark: '#334155', contrastText: '#ffffff' },
    background: { default: '#f8fafc', paper: '#ffffff' },
    text: { primary: '#0f172a', secondary: '#475569' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    h1: { fontWeight: 600 }, h2: { fontWeight: 600 }, h3: { fontWeight: 600 }, h4: { fontWeight: 500 },
    button: { fontWeight: 600, textTransform: 'none' },
  },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 9999 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
  },
})

export default function App() {
  const [sessionUser, setSessionUser] = useState(() => {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem('sw-user')
    if (!raw) return null
    try { return JSON.parse(raw) } catch (error) {
      console.warn('Failed to parse stored session', error)
      return null
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (sessionUser) {
      window.localStorage.setItem('sw-user', JSON.stringify(sessionUser))
    } else {
      window.localStorage.removeItem('sw-user')
    }
  }, [sessionUser])

  const handleLoginSuccess = user => setSessionUser(user)
  const handleSignOut = () => setSessionUser(null)
  const handleSessionInvalid = useCallback(() => setSessionUser(null), [])

  const currentYear = new Date().getFullYear()

  // ✅ FIXED Issue 2: Correct reroute path for all 3 roles
  const reroutePath = sessionUser?.role === 'admin'
    ? '/adminDashboard'
    : sessionUser?.role === 'collector'
      ? '/ops'
      : '/userDashboard'

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="min-h-screen bg-brand-radial text-slate-900">
        <Nav session={sessionUser} onSignOut={handleSignOut} />
        <main className="pb-16 pt-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/ops" element={<ManageCollectionOpsPage />} />
            <Route path="/collector" element={<Navigate to="/ops#collector-checklist" replace />} />

            {/* ✅ FIXED Issue 3: Schedule only accessible to residents */}
            <Route
              path="/schedule"
              element={
                sessionUser?.role === 'resident' || sessionUser?.role === 'regular'
                  ? <SpecialCollectionPage session={sessionUser} onSessionInvalid={handleSessionInvalid} />
                  : <Navigate to={sessionUser ? reroutePath : '/login'} replace />
              }
            />

            <Route
              path="/schedule/payment/result"
              element={sessionUser
                ? <SpecialCollectionCheckoutResult session={sessionUser} />
                : <Navigate to="/login" replace />}
            />
            <Route
              path="/billing/checkout"
              element={sessionUser
                ? <CheckoutResultPage session={sessionUser} />
                : <Navigate to="/login" replace />}
            />
            <Route
              path="/analytics"
              element={sessionUser?.role === 'admin'
                ? <ReportsPage session={sessionUser} />
                : <Navigate to={sessionUser ? '/userDashboard' : '/login'} replace />}
            />

            {/* ✅ Gamification routes */}
            <Route
              path="/points"
              element={sessionUser
                ? <PointsDashboard session={sessionUser} />
                : <Navigate to="/login" replace />}
            />
            <Route
              path="/leaderboard"
              element={sessionUser
                ? <Leaderboard session={sessionUser} />
                : <Navigate to="/login" replace />}
            />

            <Route
              path="/login"
              element={sessionUser
                ? <Navigate to={reroutePath} replace />
                : <LoginPage onLogin={handleLoginSuccess} />}
            />
            <Route
              path="/register"
              element={sessionUser
                ? <Navigate to={reroutePath} replace />
                : <RegisterPage onRegister={handleLoginSuccess} />}
            />
            <Route
              path="/userDashboard"
              element={sessionUser
                ? <UserDashboard session={sessionUser} />
                : <Navigate to="/login" replace />}
            />
            <Route
              path="/adminDashboard"
              element={sessionUser?.role === 'admin'
                ? <AdminDashboard />
                : <Navigate to="/login" replace />}
            />
            <Route
              path="*"
              element={<Navigate to={sessionUser ? reroutePath : '/login'} replace />}
            />
          </Routes>
        </main>

        <footer className="border-t border-slate-200/80 bg-white/70 py-6 text-sm text-slate-500">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6">
            <p>© {currentYear} Smart Waste Hyderabad Pilot</p>
            <div className="flex gap-4">
              <Link to="/ops" className="hover:text-slate-700">Operations Control</Link>
              <Link to="/ops#collector-checklist" className="hover:text-slate-700">Field Crew</Link>
              <Link to="/analytics" className="hover:text-slate-700">Insights</Link>
              {/* ✅ Footer links for gamification */}
              <Link to="/leaderboard" className="hover:text-slate-700">Leaderboard</Link>
              <Link to="/points" className="hover:text-slate-700">My Points</Link>
            </div>
          </div>
        </footer>
      </div>
    </ThemeProvider>
  )
}