/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Update image_batches - enable cascade delete on project relation
  const imageBatches = app.findCollectionByNameOrId("pbc_2353663998");

  // Find the project relation field by name and update it
  for (let i = 0; i < imageBatches.fields.length; i++) {
    if (imageBatches.fields[i].name === "project" && imageBatches.fields[i].type === "relation") {
      imageBatches.fields[i].cascadeDelete = true;
      break;
    }
  }

  app.save(imageBatches);

  // Update extraction_rows - enable cascade delete on project relation
  const extractionRows = app.findCollectionByNameOrId("pbc_3032567636");

  for (let i = 0; i < extractionRows.fields.length; i++) {
    if (extractionRows.fields[i].name === "project" && extractionRows.fields[i].type === "relation") {
      extractionRows.fields[i].cascadeDelete = true;
      break;
    }
  }

  return app.save(extractionRows);

}, (app) => {
  // Revert - disable cascade delete
  const imageBatches = app.findCollectionByNameOrId("pbc_2353663998");

  for (let i = 0; i < imageBatches.fields.length; i++) {
    if (imageBatches.fields[i].name === "project" && imageBatches.fields[i].type === "relation") {
      imageBatches.fields[i].cascadeDelete = false;
      break;
    }
  }

  app.save(imageBatches);

  const extractionRows = app.findCollectionByNameOrId("pbc_3032567636");

  for (let i = 0; i < extractionRows.fields.length; i++) {
    if (extractionRows.fields[i].name === "project" && extractionRows.fields[i].type === "relation") {
      extractionRows.fields[i].cascadeDelete = false;
      break;
    }
  }

  return app.save(extractionRows);
});
