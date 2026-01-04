/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("app_settings");

  // Check if a settings record already exists
  let existingRecord;
  try {
    existingRecord = app.findFirstRecordByFilter("app_settings", "id = 'default'");
  } catch (e) {
    // Record doesn't exist, that's expected for fresh installs
  }

  if (!existingRecord) {
    // Create default settings record with secure defaults:
    // - Registration disabled (admin must enable)
    // - Email verification required
    const record = new Record(collection);
    record.set("id", "default");
    record.set("allow_registration", false);
    record.set("require_email_verification", true);
    record.set("allow_custom_endpoints", false);

    app.save(record);
    console.log("[Migration] Created default app_settings record with secure defaults");
  }
}, (app) => {
  // Rollback: delete the default settings record
  try {
    const record = app.findFirstRecordByFilter("app_settings", "id = 'default'");
    if (record) {
      app.delete(record);
    }
  } catch (e) {
    // Record doesn't exist, nothing to delete
  }
});
