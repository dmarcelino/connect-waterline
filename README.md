[![npm version](https://badge.fury.io/js/connect-waterline.svg)](http://badge.fury.io/js/connect-waterline)
[![Build Status](https://travis-ci.org/dmarcelino/connect-waterline.svg?branch=refactor-tests)](https://travis-ci.org/dmarcelino/connect-waterline)
[![Dependency Status](https://david-dm.org/dmarcelino/connect-waterline.svg)](https://david-dm.org/dmarcelino/connect-waterline)

# connect-waterline
[Waterline](https://github.com/balderdashy/waterline#readme) session store for [Connect](https://github.com/senchalabs/connect) and [Express](http://expressjs.com/).

## Overview
connect-waterline is inspired by the popular [connect-mongo](https://github.com/kcbanner/connect-mongo) but instead of using MongoDB as its datastore it's able to use any [Waterline adapter](https://github.com/balderdashy/waterline#community-adapters). Connect-waterline can use its own instance of Waterline or you can pass a model from an existing Waterline instance. 

Currently, official adapters exist for [MySQL](https://github.com/balderdashy/sails-mysql), [PostgreSQL](https://github.com/balderdashy/sails-postgresql), [MongoDB](https://github.com/balderdashy/sails-mongo), [Redis](https://github.com/balderdashy/sails-redis), local [disk](https://github.com/balderdashy/sails-disk), and local [memory](https://github.com/balderdashy/sails-memory).  [Community adapters](https://github.com/balderdashy/sails-docs/blob/master/intro-to-custom-adapters.md#notable-community-adapters) exist for [CouchDB](https://github.com/search?q=sails+couch&nwo=codeswarm%2Fsails-couchdb-orm&search_target=global&ref=cmdform), [neDB](https://github.com/adityamukho/sails-nedb), [TingoDB](https://github.com/andyhu/sails-tingo), [SQLite](https://github.com/AndrewJo/sails-sqlite3/tree/0.10), [Oracle](https://github.com/search?q=sails+oracle&type=Repositories&ref=searchresults), [MSSQL](https://github.com/cnect/sails-mssql), [DB2](https://github.com/search?q=sails+db2&type=Repositories&ref=searchresults), [ElasticSearch](https://github.com/search?q=%28elasticsearch+AND+sails%29+OR+%28elasticsearch+AND+waterline%29+&type=Repositories&ref=searchresults), [Riak](https://github.com/search?q=sails+riak&type=Repositories&ref=searchresults),
[neo4j](https://www.npmjs.org/package/sails-neo4j), [OrientDB](https://github.com/appscot/sails-orientdb),
[Amazon RDS](https://github.com/TakenPilot/sails-rds), [DynamoDB](https://github.com/TakenPilot/sails-dynamodb), [Azure Tables](https://github.com/azuqua/sails-azuretables), and [RethinkDB](https://github.com/search?q=%28%28sails+rethinkdb+in%3Aname%29+OR+%28waterline+rethinkdb+in%3Aname%29%29&type=Repositories&ref=searchresults).

## Instalation

```shell
npm i connect-waterline -S
```

## Usage

### Express or Connect integration

Express `4.x`, `5.0` and Connect `3.x`:

```js
var session = require('express-session');
var WaterlineStore = require('connect-waterline')(session);

app.use(session({
    secret: 'foo',
    store: new WaterlineStore(options)
}));
```

Express `2.x`, `3.x` and Connect `1.x`, `2.x`:

```js
var WaterlineStore = require('connect-waterline')(express);

app.use(express.session({
    secret: 'foo',
    store: new WaterlineStore(options)
}));
```

For Connect `1.x` and `2.x`, just replace `express` by `connect`.


### Waterline instance

In many circumstances, `connect-waterline` will not be the only part of your application which need a waterline instance. It could be interesting to re-use an existing waterline instance.

Alternatively, you can configure `connect-waterline` to create it own instance of waterline.


#### Re-use waterline instance

```javascript
var Waterline = require('waterline');
var ConnectWaterline = require('connect-waterline');

var extendedCollections = [
  Waterline.Collection.extend(_.defaults({ connection: 'connect-waterline' }, ConnectWaterline.defaultModelDefinition))
  // plus your app collections
];
var waterline = new Waterline();

extendedCollections.forEach(function (collection) {
  waterline.loadCollection(collection);
});

// Initialize Waterline
waterline.initialize({
  adapters: {
    'sails-disk': require('sails-disk')  // or any other waterline adapter
  },
  connections: {
    'connect-waterline': {
      adapter: 'sails-disk'
      // place adapter and connection specific options here
    }
  }
}, function waterlineReady(function(err, ontology){
  mySessionModel = ontology.collections.sessions;
}));

// after waterline is initialized
app.use(session({
  secret: 'foo',
  store: new WaterlineStore({ model: mySessionModel });
}));
```


#### Create new waterline instance

```javascript
var WaterlineStore = require('connect-waterline');

var options = {
  adapters: {
    'default': require('sails-disk')  // or any other sails adapter
  },
  connections: {
    'connect-waterline': {
      adapter: 'default'
      // specific adapter connection options
      // user: '',
      // password: '',
      // host: 'localhost',
      // database: 'sessions'
    }
  },
  autoRemoveInterval: 6*60  // expired sessions will be cleaned every 6h
})

app.use(session({
  secret: 'foo',
  store: new WaterlineStore(options);
}));
```

> **Tip:** it's usually a good idea to place `app.use(session(/*...*/));` after your `app.use(express.static(/*...*/));` statement to avoid creating sessions for every static asset (like .css or image files) that you have on your website. More about this [here](https://www.airpair.com/express/posts/expressjs-and-passportjs-sessions-deep-dive).

## Testing
Test are written with mocha. To run all tests (requires all official adapters and respective DBs):
```shell
npm test
```

To run unit tests (requires sails-memory):
```shell
make test-unit
```

## About Waterline

[Waterline](https://github.com/balderdashy/waterline) is a new kind of storage and retrieval engine.

It provides a uniform API for accessing stuff from different kinds of databases, protocols, and 3rd party APIs. That means you write the same code to get and store things like users, whether they live in OrientDB, Redis, mySQL, LDAP, MongoDB, or Postgres.

Waterline strives to inherit the best parts of ORMs like ActiveRecord, Hibernate, and Mongoose, but with a fresh perspective and emphasis on modularity, testability, and consistency across adapters.

## License
MIT
