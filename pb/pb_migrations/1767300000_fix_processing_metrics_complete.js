/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_603941526")

  // Fix the id field to have autogenerate pattern
  collection.fields.removeById("text3208210256")
  collection.fields.addAt(0, new Field({
    "autogeneratePattern": "[a-z0-9]{15}",
    "hidden": false,
    "id": "text3208210256",
    "max": 15,
    "min": 15,
    "name": "id",
    "pattern": "^[a-z0-9]+$",
    "presentable": false,
    "primaryKey": true,
    "required": true,
    "system": true,
    "type": "text"
  }))

  // Add created autodate field if missing
  if (!collection.fields.getByName("created")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "autodate_created",
      "name": "created",
      "onCreate": true,
      "onUpdate": false,
      "presentable": false,
      "system": false,
      "type": "autodate"
    }))
  }

  // Add updated autodate field if missing
  if (!collection.fields.getByName("updated")) {
    collection.fields.add(new Field({
      "hidden": false,
      "id": "autodate_updated",
      "name": "updated",
      "onCreate": true,
      "onUpdate": true,
      "presentable": false,
      "system": false,
      "type": "autodate"
    }))
  }

  return app.save(collection)
}, (app) => {
  // Rollback - revert to broken state
  const collection = app.findCollectionByNameOrId("pbc_603941526")

  collection.fields.removeById("text3208210256")
  collection.fields.addAt(0, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3208210256",
    "max": 0,
    "min": 0,
    "name": "id",
    "pattern": "^[a-z0-9]+$",
    "presentable": false,
    "primaryKey": true,
    "required": true,
    "system": true,
    "type": "text"
  }))

  collection.fields.removeById("autodate_created")
  collection.fields.removeById("autodate_updated")

  return app.save(collection)
})
