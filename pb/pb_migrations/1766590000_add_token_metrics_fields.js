/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_603941526");

  // Add inputTokens field
  collection.fields.addAt(collection.fields.length, new Field({
    "hidden": false,
    "id": "number2670735504",
    "max": null,
    "min": null,
    "name": "inputTokens",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }));

  // Add outputTokens field
  collection.fields.addAt(collection.fields.length, new Field({
    "hidden": false,
    "id": "number1103426375",
    "max": null,
    "min": null,
    "name": "outputTokens",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }));

  // Add requestDetails JSON field
  collection.fields.addAt(collection.fields.length, new Field({
    "hidden": false,
    "id": "json267458158",
    "maxSize": 0,
    "name": "requestDetails",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_603941526");

  // Remove the added fields
  collection.fields.removeById("number2670735504");
  collection.fields.removeById("number1103426375");
  collection.fields.removeById("json267458158");

  return app.save(collection);
});
