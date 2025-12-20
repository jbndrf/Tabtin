/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_installed_addons")

  // remove field
  collection.fields.removeById("relation_user")

  // remove field
  collection.fields.removeById("text_name")

  // remove field
  collection.fields.removeById("text_docker_image")

  // remove field
  collection.fields.removeById("text_container_id")

  // remove field
  collection.fields.removeById("select_container_status")

  // remove field
  collection.fields.removeById("text_internal_url")

  // remove field
  collection.fields.removeById("json_manifest")

  // remove field
  collection.fields.removeById("json_config")

  // remove field
  collection.fields.removeById("text_auth_token")

  // remove field
  collection.fields.removeById("text_error_message")

  // remove field
  collection.fields.removeById("autodate_created")

  // remove field
  collection.fields.removeById("autodate_updated")

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": true,
    "collectionId": "_pb_users_auth_",
    "hidden": false,
    "id": "relation2375276105",
    "maxSelect": 1,
    "minSelect": 1,
    "name": "user",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1579384326",
    "max": 255,
    "min": 1,
    "name": "name",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text1785754961",
    "max": 500,
    "min": 1,
    "name": "docker_image",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text3156342594",
    "max": 100,
    "min": 0,
    "name": "container_id",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "select1729202971",
    "maxSelect": 1,
    "name": "container_status",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "pending",
      "building",
      "starting",
      "running",
      "stopped",
      "failed"
    ]
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text387295343",
    "max": 500,
    "min": 0,
    "name": "internal_url",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "json2801428544",
    "maxSize": 0,
    "name": "manifest",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "json3565825916",
    "maxSize": 0,
    "name": "config",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(9, new Field({
    "autogeneratePattern": "",
    "hidden": true,
    "id": "text2467688526",
    "max": 100,
    "min": 0,
    "name": "auth_token",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "autogeneratePattern": "",
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

  // add field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "autodate2990389176",
    "name": "created",
    "onCreate": true,
    "onUpdate": false,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "autodate3332085495",
    "name": "updated",
    "onCreate": true,
    "onUpdate": true,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_installed_addons")

  // add field
  collection.fields.addAt(1, new Field({
    "cascadeDelete": true,
    "collectionId": "_pb_users_auth_",
    "hidden": false,
    "id": "relation_user",
    "maxSelect": 1,
    "minSelect": 1,
    "name": "user",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "relation"
  }))

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text_name",
    "max": 255,
    "min": 1,
    "name": "name",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(3, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text_docker_image",
    "max": 500,
    "min": 1,
    "name": "docker_image",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(4, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text_container_id",
    "max": 100,
    "min": 0,
    "name": "container_id",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "select_container_status",
    "maxSelect": 1,
    "name": "container_status",
    "presentable": false,
    "required": true,
    "system": false,
    "type": "select",
    "values": [
      "pending",
      "pulling",
      "starting",
      "running",
      "stopped",
      "failed"
    ]
  }))

  // add field
  collection.fields.addAt(6, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text_internal_url",
    "max": 500,
    "min": 0,
    "name": "internal_url",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "json_manifest",
    "maxSize": 0,
    "name": "manifest",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(8, new Field({
    "hidden": false,
    "id": "json_config",
    "maxSize": 0,
    "name": "config",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // add field
  collection.fields.addAt(9, new Field({
    "autogeneratePattern": "",
    "hidden": true,
    "id": "text_auth_token",
    "max": 100,
    "min": 0,
    "name": "auth_token",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text_error_message",
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

  // add field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "autodate_created",
    "name": "created",
    "onCreate": true,
    "onUpdate": false,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))

  // add field
  collection.fields.addAt(12, new Field({
    "hidden": false,
    "id": "autodate_updated",
    "name": "updated",
    "onCreate": true,
    "onUpdate": true,
    "presentable": false,
    "system": false,
    "type": "autodate"
  }))

  // remove field
  collection.fields.removeById("relation2375276105")

  // remove field
  collection.fields.removeById("text1579384326")

  // remove field
  collection.fields.removeById("text1785754961")

  // remove field
  collection.fields.removeById("text3156342594")

  // remove field
  collection.fields.removeById("select1729202971")

  // remove field
  collection.fields.removeById("text387295343")

  // remove field
  collection.fields.removeById("json2801428544")

  // remove field
  collection.fields.removeById("json3565825916")

  // remove field
  collection.fields.removeById("text2467688526")

  // remove field
  collection.fields.removeById("text737763667")

  // remove field
  collection.fields.removeById("autodate2990389176")

  // remove field
  collection.fields.removeById("autodate3332085495")

  return app.save(collection)
})
