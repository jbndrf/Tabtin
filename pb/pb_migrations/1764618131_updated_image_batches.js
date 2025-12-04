/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2353663998")

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "number2793122322",
    "max": null,
    "min": null,
    "name": "row_count",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2353663998")

  // remove field
  collection.fields.removeById("number2793122322")

  return app.save(collection)
})
