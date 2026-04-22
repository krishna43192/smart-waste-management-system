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
    // Hide Schedule for admin, collector, and unauthenticated (public) users
    if (link.to === '/schedule') return session?.role === 'resident' || session?.role === 'regular'
    // Analytics: admin only
    if (link.to === '/analytics') return session?.role === 'admin'
    // Leaderboard: residents only
    if (link.to === '/leaderboard') return session?.role === 'resident' || session?.role === 'regular'
    // Collection Ops: admin and collector only
    if (link.to === '/ops') return session?.role === 'admin' || session?.role === 'collector'
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
  const stats = [
    { value: '6', label: 'GHMC zones covered' },
    { value: '1,200+', label: 'Bins monitored' },
    { value: '92%', label: 'On-time pickups' },
    { value: '05:00 – 20:00', label: 'Service window IST' },
  ]

  const features = [
    {
      to: '/schedule',
      headline: 'Schedule a pickup',
      copy: 'Book a slot for your waste — wet, dry, e-waste, bulky and more.',
      icon: CalendarClock,
      gradient: 'from-emerald-500/20 via-teal-400/10 to-transparent',
      iconBg: 'bg-emerald-500/15 text-emerald-600',
    },
    {
      to: '/leaderboard',
      headline: 'Earn points & rank up',
      copy: 'Schedule pickups, pay on time and climb the resident leaderboard.',
      icon: Sparkles,
      gradient: 'from-amber-400/20 via-orange-300/10 to-transparent',
      iconBg: 'bg-amber-400/15 text-amber-600',
    },
    {
      to: '/login',
      headline: 'Track your history',
      copy: 'Sign in to view past pickups, bills and your environmental impact.',
      icon: BarChart3,
      gradient: 'from-sky-400/20 via-blue-300/10 to-transparent',
      iconBg: 'bg-sky-400/15 text-sky-600',
    },
  ]

  return (
    <div className="flex flex-col gap-0">
      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        {/* Background image */}
        <img
          src="/hero-greenery.png"
          alt="Aerial view of Hyderabad green city"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Layered gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/80 via-slate-900/60 to-emerald-950/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent" />

        {/* Hero content */}
        <div className="relative mx-auto w-full max-w-6xl px-6 py-24">
          {/* Pill badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-300 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Smart Waste Hyderabad · Pilot Programme
          </div>

          {/* Headline */}
          <h1 className="mt-2 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Cleaner Hyderabad,{' '}
            <span className="bg-gradient-to-r from-emerald-300 to-teal-400 bg-clip-text text-transparent">
              one pickup at a time.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
            Book doorstep waste collections, track your contribution to a greener city,
            and earn rewards for responsible disposal.
          </p>

          {/* CTA buttons */}
          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              to="/schedule"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-500/40 transition hover:scale-[1.02] hover:bg-emerald-400 active:scale-100"
            >
              Schedule a pickup
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-7 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              Sign in
            </Link>
          </div>

          {/* Stats strip */}
          <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map(s => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
                <p className="text-2xl font-bold text-emerald-300">{s.value}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom fade into content */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent" />
      </section>

      {/* ── Feature cards ──────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-600">What you can do</p>
          <h2 className="mt-3 text-3xl font-bold text-slate-900">Everything in one place</h2>
          <p className="mt-3 text-slate-600">From scheduling pickups to tracking your eco-points — all for Hyderabad residents.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {features.map(card => (
            <Link
              key={card.to}
              to={card.to}
              className="group relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white p-7 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.gradient}`} />
              <div className="relative flex h-full flex-col gap-5">
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${card.iconBg}`}>
                  <card.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900">{card.headline}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.copy}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 transition group-hover:text-emerald-700">
                  Get started
                  <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
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
            <Route
              path="/ops"
              element={
                sessionUser?.role === 'admin' || sessionUser?.role === 'collector'
                  ? <ManageCollectionOpsPage session={sessionUser} />
                  : <Navigate to={sessionUser ? '/userDashboard' : '/login'} replace />
              }
            />
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
            <p>© {currentYear} Smart Waste Hyderabad</p>
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