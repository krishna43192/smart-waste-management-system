/**
 * Timeline Sparkline Component
 * 
 * Displays a time-series visualization as vertical bars.
 * Follows the Single Responsibility Principle.
 * 
 * @component
 */

import { Box, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';

/**
 * TimelineSparkline Component
 * 
 * @param {Object} props
 * @param {Array<Object>} props.data - Array of time-series data points
 * @param {String} props.data[].day - Date string
 * @param {Number} props.data[].totalKg - Weight value
 */
function TimelineSparkline({ data }) {
  // Handle empty data case
  if (!data?.length) {
    return (
      <Box sx={{ minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No timeline data available
        </Typography>
      </Box>
    );
  }

  // Calculate maximum value for normalization
  const maxValue = Math.max(...data.map((point) => point.totalKg)) || 1;

  return (
    <Stack
      direction="row"
      alignItems="flex-end"
      spacing={1}
      sx={{ minHeight: 120, width: '100%' }}
    >
      {data.map((point) => {
        // Calculate bar height as percentage of max
        const heightPercentage = Math.max(6, Math.round((point.totalKg / maxValue) * 100));

        return (
          <Stack
            key={point.day}
            spacing={0.5}
            alignItems="center"
            sx={{ flex: 1 }}
          >
            {/* Bar */}
            <Box
              sx={{
                width: '100%',
                height: heightPercentage,
                borderRadius: '8px 8px 2px 2px',
                bgcolor: 'rgba(16, 185, 129, 0.55)',
                transition: 'height 0.3s ease-in-out',
              }}
              title={`${point.totalKg} kg`}
            />

            {/* Date label */}
            <Typography variant="caption" color="text.secondary">
              {new Date(point.day).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

TimelineSparkline.propTypes = {
  data: PropTypes.arrayOf(
    PropTypes.shape({
      day: PropTypes.string.isRequired,
      totalKg: PropTypes.number.isRequired,
      pickups: PropTypes.number,
    })
  ),
};

TimelineSparkline.defaultProps = {
  data: null,
};

export default TimelineSparkline;
