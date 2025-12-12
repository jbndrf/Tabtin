/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2353663998")

  // add error_message field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "text737763667",
    "max": 0,
    "min": 0,
    "name": "error_message",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2353663998")

  // remove field
  collection.fields.removeById("text737763667")

  return app.save(collection)
})
