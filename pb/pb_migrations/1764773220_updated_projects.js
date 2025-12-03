/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_484305853")

  // remove field
  collection.fields.removeById("select1204556236")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_484305853")

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "select1204556236",
    "maxSelect": 0,
    "name": "extraction_mode",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "single_row",
      "multi_row"
    ]
  }))

  return app.save(collection)
})
