import { useCallback, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { useNavigate, Link as RouterLink } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Checkbox, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material'
import { UserPlus } from 'lucide-react'

const INITIAL_FORM = Object.freeze({ name: '', email: '', password: '', confirmPassword: '' })

// Perform lightweight client-side validation and return the first blocking issue.
function validateForm(form) {
  if (!form.name.trim()) {
    return 'Please provide your full name.'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    return 'Enter a valid email address.'
  }
  if (form.password.length < 8) {
    return 'Password must be at least 8 characters long.'
  }
  if (form.password !== form.confirmPassword) {
    return 'Passwords do not match.'
  }
  return null
}

// Guides new municipal users through account creation and redirects after success.
export default function RegisterPage({ onRegister = () => {} }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL_FORM)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState(null)

  // Memoize validation to keep button states and submission logic aligned.
  const validationMessage = useMemo(() => validateForm(form), [form])

  const handleChange = useCallback(event => {
    const { name, value } = event.target
    setForm(prev => ({ ...prev, [name]: value }))
  }, [])

  const handleSubmit = useCallback(async event => {
    event.preventDefault()
    setFeedback(null)

    if (validationMessage) {
      setFeedback({ type: 'error', message: validationMessage })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      })

      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.message || 'Registration failed')
      }

      setFeedback({ type: 'success', message: payload.message || 'Registration successful.' })
      onRegister(payload.user)

      const destination = payload.user.role === 'admin' ? '/adminDashboard' : '/userDashboard'
      navigate(destination, { replace: true })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message })
    } finally {
      setLoading(false)
    }
  }, [form, navigate, onRegister, validationMessage])

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-6xl flex-col items-center justify-center gap-10 px-6 py-12">
      <div className="flex items-center gap-3 rounded-full bg-brand-500/10 px-4 py-2 text-sm font-semibold text-brand-600">
        <UserPlus className="h-4 w-4" />
        Create your Smart Waste HYD account
      </div>
      <Paper elevation={8} className="glass-panel w-full max-w-md rounded-4xl p-8">
        <Stack spacing={4} component="form" onSubmit={handleSubmit}>
          <Box>
            <Typography variant="h4" component="h1" fontWeight={600} gutterBottom>
              Join the pilot programme
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Provide your municipal email address to gain access to the Smart Waste workspace.
            </Typography>
          </Box>

          {feedback && (
            <Alert severity={feedback.type} onClose={() => setFeedback(null)}>
              {feedback.message}
            </Alert>
          )}

          <TextField
            label="Full name"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            autoComplete="name"
            fullWidth
          />

          <TextField
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
            autoComplete="email"
            fullWidth
          />

          <TextField
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            required
            autoComplete="new-password"
            fullWidth
            helperText="Use at least 8 characters with a mix of letters and numbers."
          />

          <TextField
            label="Confirm password"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange}
            required
            autoComplete="new-password"
            fullWidth
          />

          <FormControlLabel
            control={<Checkbox
              required
            />}
            label={
              <Typography variant="body2">
                Agree to terms: I confirm that I have read and accept the collection policy and service terms.
              </Typography>
            }
          />
          <Button type="submit" variant="contained" disabled={loading} size="large" fullWidth>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Create account'}
          </Button>

          <Typography variant="caption" color="text.secondary" textAlign="center">
            Already have access? <RouterLink to="/login" className="text-brand-600 hover:text-brand-500">Sign in instead</RouterLink> or <RouterLink to="/" className="text-brand-600 hover:text-brand-500">return home</RouterLink>.
          </Typography>
        </Stack>
      </Paper>
    </div>
  )
}

RegisterPage.propTypes = {
  onRegister: PropTypes.func,
}
