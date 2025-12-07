/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4084405667")

  // add queuedAt field for queue ordering (retried jobs go to end of queue)
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "date800059153",
    "max": "",
    "min": "",
    "name": "queuedAt",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "date"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4084405667")

  // remove queuedAt field
  collection.fields.removeById("date800059153")

  return app.save(collection)
})
