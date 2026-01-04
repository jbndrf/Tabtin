/// <reference path="../pb_data/types.d.ts" />

/**
 * Fix processing_metrics access rules
 *
 * Users should be able to view metrics for their own projects,
 * not just admins.
 */
migrate((app) => {
  const processingMetrics = app.findCollectionByNameOrId("processing_metrics");

  // Allow users to view metrics for projects they own
  // projectId is a relation to projects, which has a user field
  processingMetrics.listRule = "projectId.user = @request.auth.id";
  processingMetrics.viewRule = "projectId.user = @request.auth.id";

  // Only server/admin can create/update/delete metrics
  processingMetrics.createRule = null;
  processingMetrics.updateRule = null;
  processingMetrics.deleteRule = null;

  app.save(processingMetrics);
}, (app) => {
  // Rollback to admin-only
  const processingMetrics = app.findCollectionByNameOrId("processing_metrics");
  processingMetrics.listRule = null;
  processingMetrics.viewRule = null;
  processingMetrics.createRule = null;
  processingMetrics.updateRule = null;
  processingMetrics.deleteRule = null;
  app.save(processingMetrics);
});
