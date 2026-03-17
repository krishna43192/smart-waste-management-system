import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material'
import { ShieldCheck } from 'lucide-react'

// Presents the login workflow for field teams and redirects after a successful sign-in.
export default function LoginPage({ onLogin = () => {} }) {
    const navigate = useNavigate()
    const location = useLocation()
    const [form, setForm] = useState({ email: '', password: '' })
    const [loading, setLoading] = useState(false)
    // Derive initial notice when the user was redirected here after another action
    const [feedback, setFeedback] = useState(() => {
        if (location.state?.notice) {
            return { type: 'info', message: location.state.notice }
        }
        return null
    })

    const handleChange = useCallback(event => {
        const { name, value } = event.target
        setForm(prev => ({ ...prev, [name]: value }))
    }, [])

    // Handles the entire authentication round-trip and navigation on success
    const handleSubmit = useCallback(async event => {
        event.preventDefault()
        setLoading(true)
        setFeedback(null)

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })

            const payload = await response.json()
            if (!response.ok) {
                const lockNotice = payload.lockUntil
                    ? ` Try again after ${new Date(payload.lockUntil).toLocaleString('en-GB')}.`
                    : ''
                throw new Error((payload.message || 'Login failed') + lockNotice)
            }

            setFeedback({ type: 'success', message: payload.message || 'Signed in successfully.' })
            onLogin(payload.user)

            const destination = payload.user.role === 'admin' ? '/adminDashboard' : '/userDashboard'
            navigate(destination, { replace: true })
        } catch (error) {
            setFeedback({ type: 'error', message: error.message })
        } finally {
            setLoading(false)
        }
    }, [form, navigate, onLogin])

    return (
        <div className="mx-auto flex min-h-[70vh] max-w-6xl flex-col items-center justify-center gap-10 px-6 py-12">
            <div className="flex items-center gap-3 rounded-full bg-brand-500/10 px-4 py-2 text-sm font-semibold text-brand-600">
                <ShieldCheck className="h-4 w-4" />
                Secure access for Smart Waste HYD teams
            </div>
            <Paper elevation={8} className="glass-panel w-full max-w-md rounded-4xl p-8">
                <Stack spacing={4} component="form" onSubmit={handleSubmit}>
                    <Box>
                        <Typography variant="h4" component="h1" fontWeight={600} gutterBottom>
                            Sign in to continue
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Use the email provided by your municipal administrator.
                        </Typography>
                    </Box>

                    {feedback && (
                        <Alert severity={feedback.type} onClose={() => setFeedback(null)}>
                            {feedback.message}
                        </Alert>
                    )}

                    <TextField
                        label="Email"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        required
                        autoComplete="email"
                        autoFocus
                        fullWidth
                    />

                    <TextField
                        label="Password"
                        name="password"
                        type="password"
                        value={form.password}
                        onChange={handleChange}
                        required
                        autoComplete="current-password"
                        fullWidth
                    />

                    <Button
                        type="submit"
                        variant="contained"
                        disabled={loading}
                        size="large"
                        fullWidth
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign in'}
                    </Button>

                    <Typography variant="caption" color="text.secondary" textAlign="center">
                        Need access? Contact your Smart Waste administrator or <RouterLink to="/" className="text-brand-600 hover:text-brand-500">return home</RouterLink>.
                    </Typography>
                    <Typography variant="caption" color="text.secondary" textAlign="center">
                        New to Smart Waste? <RouterLink to="/register" className="text-brand-600 hover:text-brand-500">Create an account</RouterLink>.
                    </Typography>
                </Stack>
            </Paper>
        </div>
    )
}

LoginPage.propTypes = {
    onLogin: PropTypes.func,
}
