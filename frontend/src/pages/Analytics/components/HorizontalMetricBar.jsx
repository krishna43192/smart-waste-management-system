/**
 * Horizontal Metric Bar Component
 * 
 * Displays a labeled horizontal progress bar with a value.
 * Follows the Single Responsibility Principle - only renders metric bars.
 * 
 * @component
 */

import { Box, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';
import { formatKg, calculatePercentage } from '../utils/formatUtils';

/**
 * HorizontalMetricBar Component
 * 
 * @param {Object} props
 * @param {String} props.label - Label to display
 * @param {Number} props.value - Numeric value
 * @param {Number} props.maxValue - Maximum value for calculating width
 * @param {String} props.accent - CSS background color/gradient for the bar
 */
function HorizontalMetricBar({ label, value, maxValue, accent = '#10b981' }) {
  const widthPercentage = calculatePercentage(value, maxValue);

  return (
    <Stack spacing={0.5}>
      {/* Label and value row */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <Typography variant="body2" fontWeight={600}>
          {label}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatKg(value)}
        </Typography>
      </Stack>

      {/* Progress bar */}
      <Box
        sx={{
          height: 10,
          borderRadius: '999px',
          bgcolor: 'rgba(15, 23, 42, 0.08)',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${widthPercentage}%`,
            height: '100%',
            background: accent,
            transition: 'width 0.3s ease-in-out',
          }}
        />
      </Box>
    </Stack>
  );
}

HorizontalMetricBar.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  maxValue: PropTypes.number.isRequired,
  accent: PropTypes.string,
};

export default HorizontalMetricBar;
