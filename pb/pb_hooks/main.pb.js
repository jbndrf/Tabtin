// Extending PocketBase with JS - @see https://pocketbase.io/docs/js-overview/

/// <reference path="../pb_data/types.d.ts" />

/**
 * Configure PocketBase settings from environment variables on startup.
 * This ensures batch API and other settings are applied consistently.
 *
 * Environment variables:
 *   PB_BATCH_ENABLED=true|false    - Enable/disable batch API
 *   PB_BATCH_MAX_REQUESTS=100      - Max operations per batch request
 *   PB_BATCH_TIMEOUT=30            - Timeout in seconds
 *   PB_BATCH_MAX_BODY_SIZE=134217728 - Max body size in bytes (128MB)
 */
onBootstrap((e) => {
  // Must call e.next() first before accessing database/settings
  e.next();

  const settings = $app.settings();
  let hasChanges = false;

  // Configure Batch API settings from environment variables
  const batchEnabled = $os.getenv("PB_BATCH_ENABLED");
  const batchMaxRequests = $os.getenv("PB_BATCH_MAX_REQUESTS");
  const batchTimeout = $os.getenv("PB_BATCH_TIMEOUT");
  const batchMaxBodySize = $os.getenv("PB_BATCH_MAX_BODY_SIZE");

  if (batchEnabled !== "") {
    const enabled = batchEnabled === "true" || batchEnabled === "1";
    if (settings.batch.enabled !== enabled) {
      settings.batch.enabled = enabled;
      hasChanges = true;
      console.log(`[Config] Batch API enabled: ${enabled}`);
    }
  }

  if (batchMaxRequests !== "") {
    const maxRequests = parseInt(batchMaxRequests, 10);
    if (!isNaN(maxRequests) && maxRequests > 0 && settings.batch.maxRequests !== maxRequests) {
      settings.batch.maxRequests = maxRequests;
      hasChanges = true;
      console.log(`[Config] Batch max requests: ${maxRequests}`);
    }
  }

  if (batchTimeout !== "") {
    const timeout = parseInt(batchTimeout, 10);
    if (!isNaN(timeout) && timeout > 0 && settings.batch.timeout !== timeout) {
      settings.batch.timeout = timeout;
      hasChanges = true;
      console.log(`[Config] Batch timeout: ${timeout}s`);
    }
  }

  if (batchMaxBodySize !== "") {
    const maxBodySize = parseInt(batchMaxBodySize, 10);
    if (!isNaN(maxBodySize) && maxBodySize > 0 && settings.batch.maxBodySize !== maxBodySize) {
      settings.batch.maxBodySize = maxBodySize;
      hasChanges = true;
      console.log(`[Config] Batch max body size: ${maxBodySize} bytes`);
    }
  }

  // Save settings if any changes were made
  if (hasChanges) {
    try {
      $app.save(settings);
      console.log("[Config] Batch API settings saved successfully");
    } catch (err) {
      console.error("[Config] Failed to save batch settings:", err);
    }
  }
});

/**
 * Demo route implemented in JS. Says hello to the user's name or email.
 */
routerAdd(
  "GET",
  "/api/hello",
  (c) => {
    const auth = c.auth;
    return c.json(200, {
      message: "Hello " + (auth?.getString("name") ?? auth?.email()),
    });
  },
  // middleware(s)
  $apis.requireAuth()
);

/**
 * Sends email to the logged in user.
 */
routerAdd(
  "POST",
  "/api/sendmail",
  (c) => {
    /** @type {models.Admin} */
    const admin = c.get("admin");
    /** @type {models.Record} */
    const record = c.get("authRecord");
    record?.ignoreEmailVisibility(true); // required for user.get("email")
    const to =
      record?.get("email") ?? // works only after user.ignoreEmailVisibility(true)
      admin?.email;
    const name = $app.settings().meta.senderName;
    const address = $app.settings().meta.senderAddress;
    const message = new MailerMessage({
      from: {
        address,
        name,
      },
      to: [{ address: to }],
      subject: `test email from ${name}`,
      text: "Test email",
      html: "<strong>Test</strong> <em>email</em>",
    });
    $app.newMailClient().send(message);

    return c.json(200, { message });
  },
  // middleware(s)
  $apis.requireAuth()
);

// public config
routerAdd(
  "GET",
  "/api/config",
  (c) => {
    const { parseJSONFile } = require(`${__hooks}/util`);
    const config = parseJSONFile(`${__hooks}/config.json`);
    const settings = $app.settings();
    config.site.name = settings.meta.appName;
    config.site.copyright = settings.meta.appName;
    return c.json(200, config);
  } /* no auth */
);

onModelCreate((e) => {
  const { slugDefault } = require(`${__hooks}/util`);
  slugDefault(e.model);
  e.next();
}, "posts");

onModelUpdate((e) => {
  const { slugDefault } = require(`${__hooks}/util`);
  slugDefault(e.model);
  e.next();
}, "posts");

routerAdd(
  "POST",
  "/api/generate",
  (c) => {
    const url = "http://metaphorpsum.com/paragraphs/2/4";
    const response = $http.send({ url });
    const body = response.raw;
    // last sentence becomes the title
    const [_, title] = body.match(/([a-zA-Z][ a-zA-Z]*[a-zAZ])[^a-zA-Z]*$/);
    const slug = title.toLowerCase().replace(" ", "-");
    const coll = $app.findCollectionByNameOrId("posts");
    const record = new Record(coll, { title, body, slug, user: c.auth?.id });
    const form = new RecordUpsertForm($app, record);
    record.set("files", [
      $filesystem.fileFromURL("https://picsum.photos/500/300"),
      $filesystem.fileFromURL("https://picsum.photos/500/300"),
    ]);
    form.submit();
    // $app.dao().saveRecord(record);
    c.json(200, record);
  },
  $apis.requireAuth()
);

/**
 * Automatic timeout for stale image processing batches
 * Runs every minute and marks batches as failed if they've been processing for > 20 minutes
 */
cronAdd("check-stale-batches", "* * * * *", () => {
  const TIMEOUT_MINUTES = 20;

  try {
    // Get all batches in processing status
    const batches = $app.findRecordsByFilter(
      "image_batches",
      "status = 'processing'",
      "-updated",
      500
    );

    const now = new Date();
    let markedCount = 0;

    batches.forEach((batch) => {
      const updatedAt = new Date(batch.getString("updated"));
      const minutesElapsed = (now - updatedAt) / (1000 * 60);

      if (minutesElapsed > TIMEOUT_MINUTES) {
        console.log(`Marking batch ${batch.id} as failed (processing for ${minutesElapsed.toFixed(1)} minutes)`);

        try {
          batch.set("status", "failed");
          $app.save(batch);
          markedCount++;
        } catch (err) {
          console.error(`Failed to mark batch ${batch.id} as failed:`, err);
        }
      }
    });

    if (markedCount > 0) {
      console.log(`Marked ${markedCount} stale batch(es) as failed`);
    }
  } catch (err) {
    console.error("Error checking stale batches:", err);
  }
});
