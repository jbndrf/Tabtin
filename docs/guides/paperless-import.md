# Guide: Paperless NGX Import

This guide explains how to import documents from your Paperless NGX instance directly into your projects.

**Note:** This guide is for users who already have Paperless NGX set up. If you don't know what Paperless NGX is, you can skip this guide - it's not required to use the app.

## What is Paperless NGX?

[Paperless NGX](https://docs.paperless-ngx.com/) is a document management system that helps you scan, index, and archive physical documents. If you already use Paperless to store your documents, you can import them directly without re-uploading.

## Prerequisites

Before you begin, you need:

1. **A running Paperless NGX instance** with API access
2. **An API token** from your Paperless NGX installation
3. **The Paperless NGX addon** installed in this app

## Step 1: Get Your Paperless API Token

1. Log in to your Paperless NGX web interface
2. Go to **Settings** (gear icon)
3. Navigate to the **Admin** section
4. Find **API Tokens** or generate a new token
5. Copy the token for later use

If you can't find the token option, contact whoever set up your Paperless instance for help.

## Step 2: Install the Paperless Addon

1. Go to **Settings** in the sidebar
2. Navigate to the **Addons** section
3. Find "Paperless NGX" in the available addons
4. Click **Install**

### Configure the Addon

During installation (or after), you'll need to provide:

| Setting | Description | Example |
|---------|-------------|---------|
| Paperless URL | Your Paperless NGX instance URL | `https://paperless.example.com` |
| API Token | The token you created in Step 1 | `abc123...` |

The addon will test the connection when you save.

## Step 3: Wait for Addon to Start

After installation:

1. The addon container is built and started
2. Status changes from "Building" to "Starting" to "Running"
3. A health check confirms the connection to Paperless

This usually takes 30-60 seconds.

## Step 4: Open the Document Browser

Once the addon is running:

1. Look in the sidebar for **Paperless Import** (under the main menu section)
2. Click to open the document browser

The browser shows documents from your Paperless NGX instance.

## Step 5: Browse and Search Documents

The document browser provides:

### Search

- Enter keywords to search document content and titles
- Search is performed server-side in Paperless

### Filters

Filter documents by:
- **Correspondent** - The sender/source of the document
- **Document Type** - Categories you've defined in Paperless
- **Tags** - Labels assigned to documents

### Pagination

- Navigate between pages of results
- Adjust items per page if needed

### Document Preview

- See document thumbnails
- View document metadata
- Preview before importing

## Step 6: Select Documents to Import

1. Browse or search for the documents you want
2. Click on documents to select them
3. Selected documents are highlighted
4. You can select multiple documents

## Step 7: Import to Your Project

1. With documents selected, choose a target project from the dropdown
2. Click **Import to Project**
3. Documents are transferred as PDFs
4. They appear in your project's batch queue

### What Happens During Import

1. The addon downloads the PDF from Paperless
2. The PDF is sent to the main app
3. A new batch is created with the imported documents
4. The batch is queued for processing

## Step 8: Process Imported Documents

After import:

1. Navigate to your project
2. You'll see a new batch with the imported documents
3. Process and review as normal

The workflow from here is the same as uploading documents directly:
- Batch processes according to your project schema
- Review extracted data
- Approve and export

## Troubleshooting

### Addon Won't Start

**Check the connection settings:**
- Verify your Paperless URL is correct and accessible
- Ensure the API token is valid
- Check that Paperless is running

**Still not working?**
The addon runs as a separate service on your server. If it won't start, contact whoever manages your server for help.

### No Documents Showing

**Verify Paperless connection:**
- The API token may not have permission to view documents
- Check if documents exist in your Paperless instance
- Try a simpler search or remove filters

### Import Fails

**Check document access:**
- Ensure the API token can access the specific documents
- Large PDFs may timeout - check your timeout settings
- Verify network connectivity between services

### Slow Performance

**Optimize your setup:**
- Paperless thumbnail generation can be slow for large libraries
- Consider filtering to narrow results
- Check network speed between services

## Best Practices

### Organize in Paperless First

- Use correspondents and document types for organization
- Tag documents appropriately
- This makes filtering easier during import

### One Document = One Batch

Each document you import from Paperless becomes its own separate batch. The app does not combine multiple documents into a single batch.

If you have a multi-page document that was split into separate files in Paperless, you'll need to either:
- Combine them back into one PDF before importing
- Process them as separate batches and merge the results later

### Match Schema to Document Type

- Create different projects for different document types
- Configure schemas to match the specific document format
- This improves extraction accuracy

## Next Steps

- [Getting Started](./getting-started.md) - Review basic project setup
- [Tips and Tricks](./tips-and-tricks.md) - Optimize your extraction workflow
