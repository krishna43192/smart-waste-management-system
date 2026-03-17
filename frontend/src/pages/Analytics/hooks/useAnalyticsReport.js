/**
 * Use Analytics Report Hook
 * 
 * Custom hook for managing analytics report state and operations.
 * Follows the Custom Hook pattern for reusable stateful logic.
 * Implements Separation of Concerns principle.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchAnalyticsConfig, generateWasteReport } from '../services/reportService';

/**
 * Default visibility configuration for report sections
 */
const DEFAULT_VISIBILITY = {
  households: true,
  regions: true,
  wasteTypes: true,
  timeline: true,
};

/**
 * Default filter values
 */
const DEFAULT_FILTERS = {
  from: '',
  to: '',
  regions: [],
  wasteTypes: [],
  billingModels: [],
};

/**
 * Custom hook for analytics report management
 * 
 * @param {String} userId - ID of the current user
 * @returns {Object} Report state and methods
 */
export function useAnalyticsReport(userId) {
  // Configuration state
  const [config, setConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Filter state
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // Visibility state
  const [visibility, setVisibility] = useState(DEFAULT_VISIBILITY);

  // Report state
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Error state
  const [error, setError] = useState(null);
  const [noRecordsMessage, setNoRecordsMessage] = useState('');

  /**
   * Loads analytics configuration on mount
   */
  useEffect(() => {
    let isMounted = true;

    async function loadConfig() {
      setLoadingConfig(true);
      try {
        const configData = await fetchAnalyticsConfig();

        if (!isMounted) return;

        setConfig(configData);

        // Set default date range from config
        const defaultFrom = configData?.defaultDateRange?.from;
        const defaultTo = configData?.defaultDateRange?.to;

        if (defaultFrom && defaultTo) {
          setFilters((prev) => ({
            ...prev,
            from: new Date(defaultFrom).toISOString().slice(0, 10),
            to: new Date(defaultTo).toISOString().slice(0, 10),
          }));
        }
      } catch (err) {
        if (!isMounted) return;
        setError(err.message);
      } finally {
        if (isMounted) {
          setLoadingConfig(false);
        }
      }
    }

    loadConfig();

    // Cleanup function to prevent state updates on unmounted component
    return () => {
      isMounted = false;
    };
  }, []);

  /**
   * Updates a single filter value
   */
  const updateFilter = useCallback((name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
  }, []);

  /**
   * Toggles visibility of a report section
   */
  const toggleVisibility = useCallback((key) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /**
   * Clears all error messages
   */
  const clearErrors = useCallback(() => {
    setError(null);
    setNoRecordsMessage('');
  }, []);

  /**
   * Validates filters before report generation
   */
  const validateFilters = useCallback(() => {
    if (!filters.from || !filters.to) {
      setError('Please pick a start and end date before generating the report.');
      return false;
    }
    return true;
  }, [filters]);

  /**
   * Generates the analytics report
   */
  const generateReport = useCallback(async () => {
    clearErrors();

    if (!validateFilters()) {
      return;
    }

    setLoadingReport(true);

    try {
      const criteria = {
        dateRange: {
          from: filters.from,
          to: filters.to,
        },
        regions: filters.regions,
        wasteTypes: filters.wasteTypes,
        billingModels: filters.billingModels,
      };

      const result = await generateWasteReport(userId, criteria);

      if (!result.data) {
        setReport(null);
        setNoRecordsMessage(result.message || 'No Records Available');
        return;
      }

      setReport(result.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingReport(false);
    }
  }, [userId, filters, validateFilters, clearErrors]);

  return {
    // Configuration
    config,
    loadingConfig,

    // Filters
    filters,
    updateFilter,

    // Visibility
    visibility,
    toggleVisibility,

    // Report
    report,
    loadingReport,
    generateReport,

    // Errors
    error,
    noRecordsMessage,
    setError,
    setNoRecordsMessage,
  };
}
