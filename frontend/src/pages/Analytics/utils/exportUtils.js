/**
 * Export Utilities
 * 
 * Handles exporting analytics reports to different formats.
 * Implements the Strategy pattern for different export strategies.
 */

import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

/**
 * Base export strategy interface
 * All export strategies should implement this structure
 */
class ExportStrategy {
  /**
   * Exports the report data
   * @param {Object} report - Report data to export
   * @param {String} filename - Name of the file to generate
   */
  export(report, filename) {
    throw new Error('Export method must be implemented by subclass');
  }
}

/**
 * PDF Export Strategy
 * Exports report data to PDF format
 */
class PDFExportStrategy extends ExportStrategy {
  /**
   * Formats a date range for display
   * @private
   */
  _formatDateRange(from, to) {
    const fromStr = from.toString().slice(0, 10);
    const toStr = to.toString().slice(0, 10);
    return `${fromStr} to ${toStr}`;
  }

  /**
   * Formats an array of items for display
   * @private
   */
  _formatArray(items, defaultText = 'All') {
    return items?.length ? items.join(', ') : defaultText;
  }

  /**
   * Exports report to PDF
   * @param {Object} report - Report data
   * @param {String} filename - PDF filename
   */
  export(report, filename = 'smart-waste-analytics.pdf') {
    const doc = new jsPDF();
    let yPosition = 20;

    // Title
    doc.setFontSize(16);
    doc.text('Smart Waste LK – Waste Analytics Report', 14, yPosition);
    yPosition += 10;

    // Criteria section
    doc.setFontSize(11);
    doc.text(
      `Period: ${this._formatDateRange(report.criteria.dateRange.from, report.criteria.dateRange.to)}`,
      14,
      yPosition
    );
    yPosition += 8;

    doc.text(`Regions: ${this._formatArray(report.criteria.regions)}`, 14, yPosition);
    yPosition += 8;

    doc.text(`Waste Types: ${this._formatArray(report.criteria.wasteTypes)}`, 14, yPosition);
    yPosition += 8;

    doc.text(`Billing Models: ${this._formatArray(report.criteria.billingModels)}`, 14, yPosition);
    yPosition += 14;

    // Totals section
    doc.text('Totals', 14, yPosition);
    yPosition += 8;

    doc.text(`Total records: ${report.totals.records}`, 14, yPosition);
    yPosition += 8;

    doc.text(`Total weight: ${report.totals.totalWeightKg} kg`, 14, yPosition);
    yPosition += 8;

    doc.text(`Recyclable: ${report.totals.recyclableWeightKg} kg`, 14, yPosition);
    yPosition += 8;

    doc.text(`Non-recyclable: ${report.totals.nonRecyclableWeightKg} kg`, 14, yPosition);
    yPosition += 16;

    // Top households section
    const topHouseholds = report.tables.households.slice(0, 10);
    doc.text('Top households by weight', 14, yPosition);
    yPosition += 8;

    topHouseholds.forEach((household) => {
      doc.text(
        `${household.householdId} • ${household.region} • ${household.totalKg} kg`,
        14,
        yPosition
      );
      yPosition += 8;
    });

    doc.save(filename);
  }
}

/**
 * Excel Export Strategy
 * Exports report data to Excel format
 */
class ExcelExportStrategy extends ExportStrategy {
  /**
   * Exports report to Excel
   * @param {Object} report - Report data
   * @param {String} filename - Excel filename
   */
  export(report, filename = 'smart-waste-analytics.xlsx') {
    const workbook = XLSX.utils.book_new();

    // Create sheets for each table
    const regionSheet = XLSX.utils.json_to_sheet(report.tables.regions);
    XLSX.utils.book_append_sheet(workbook, regionSheet, 'Regions');

    const householdSheet = XLSX.utils.json_to_sheet(report.tables.households);
    XLSX.utils.book_append_sheet(workbook, householdSheet, 'Households');

    const wasteSheet = XLSX.utils.json_to_sheet(report.tables.wasteTypes);
    XLSX.utils.book_append_sheet(workbook, wasteSheet, 'Waste Types');

    // Write the file
    XLSX.writeFile(workbook, filename);
  }
}

/**
 * Export Manager
 * Manages different export strategies
 */
class ExportManager {
  constructor() {
    this.strategies = {
      pdf: new PDFExportStrategy(),
      xlsx: new ExcelExportStrategy(),
    };
  }

  /**
   * Exports report using the specified format
   * 
   * @param {String} format - Export format ('pdf' or 'xlsx')
   * @param {Object} report - Report data to export
   * @param {String} filename - Optional custom filename
   */
  export(format, report, filename = null) {
    const strategy = this.strategies[format];

    if (!strategy) {
      throw new Error(`Unsupported export format: ${format}`);
    }

    strategy.export(report, filename);
  }
}

// Create and export a singleton instance
const exportManager = new ExportManager();

/**
 * Exports a report to the specified format
 * 
 * @param {String} format - 'pdf' or 'xlsx'
 * @param {Object} report - Report data
 * @param {String} filename - Optional custom filename
 */
export function exportReport(format, report, filename = null) {
  if (!report) {
    throw new Error('Cannot export: No report data available');
  }

  exportManager.export(format, report, filename);
}
