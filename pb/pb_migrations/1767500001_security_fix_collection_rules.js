/// <reference path="../pb_data/types.d.ts" />

/**
 * Security Migration: Fix collection access rules
 *
 * Vulnerabilities fixed:
 * 1. queue_jobs - was open to everyone (""), now admin-only (null)
 * 2. processing_metrics - was open to everyone (""), now admin-only (null)
 * 3. extraction_rows - was any authenticated user, now requires project ownership
 */
migrate((app) => {
  // Fix queue_jobs - set to admin-only
  const queueJobs = app.findCollectionByNameOrId("queue_jobs");
  queueJobs.listRule = null;
  queueJobs.viewRule = null;
  queueJobs.createRule = null;
  queueJobs.updateRule = null;
  queueJobs.deleteRule = null;
  app.save(queueJobs);

  // Fix processing_metrics - set to admin-only
  const processingMetrics = app.findCollectionByNameOrId("processing_metrics");
  processingMetrics.listRule = null;
  processingMetrics.viewRule = null;
  processingMetrics.createRule = null;
  processingMetrics.updateRule = null;
  processingMetrics.deleteRule = null;
  app.save(processingMetrics);

  // Fix extraction_rows - require project ownership
  const extractionRows = app.findCollectionByNameOrId("extraction_rows");
  extractionRows.listRule = "project.user = @request.auth.id";
  extractionRows.viewRule = "project.user = @request.auth.id";
  extractionRows.createRule = "@request.auth.id != \"\"";
  extractionRows.updateRule = "project.user = @request.auth.id";
  extractionRows.deleteRule = "project.user = @request.auth.id";
  app.save(extractionRows);
}, (app) => {
  // Rollback - restore original (insecure) rules
  const queueJobs = app.findCollectionByNameOrId("queue_jobs");
  queueJobs.listRule = "";
  queueJobs.viewRule = "";
  queueJobs.createRule = "";
  queueJobs.updateRule = "";
  queueJobs.deleteRule = "";
  app.save(queueJobs);

  const processingMetrics = app.findCollectionByNameOrId("processing_metrics");
  processingMetrics.listRule = "";
  processingMetrics.viewRule = "";
  processingMetrics.createRule = "";
  processingMetrics.updateRule = "";
  processingMetrics.deleteRule = "";
  app.save(processingMetrics);

  const extractionRows = app.findCollectionByNameOrId("extraction_rows");
  extractionRows.listRule = "@request.auth.id != \"\"";
  extractionRows.viewRule = "@request.auth.id != \"\"";
  extractionRows.createRule = "@request.auth.id != \"\"";
  extractionRows.updateRule = "@request.auth.id != \"\"";
  extractionRows.deleteRule = "@request.auth.id != \"\"";
  app.save(extractionRows);
})
