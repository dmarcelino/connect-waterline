[![npm version](https://badge.fury.io/js/connect-waterline.svg)](http://badge.fury.io/js/connect-waterline)
[![Build Status](https://travis-ci.org/dmarcelino/connect-waterline.svg?branch=refactor-tests)](https://travis-ci.org/dmarcelino/connect-waterline)
[![Dependency Status](https://david-dm.org/dmarcelino/connect-waterline.svg)](https://david-dm.org/dmarcelino/connect-waterline)

# connect-waterline
[Waterline](https://github.com/balderdashy/waterline#readme) session store for Express and Connect

## Overview
connect-waterline is inspired by the popular [connect-mongo](https://github.com/kcbanner/connect-mongo) but instead of using MongoDB as its datastore it's able to use any [Waterline adapter](https://github.com/balderdashy/waterline#community-adapters). Connect-waterline can use its own instance of Waterline or you can pass a model from an existing Waterline instance. 

Currently, official adapters exist for [MySQL](https://github.com/balderdashy/sails-mysql), [PostgreSQL](https://github.com/balderdashy/sails-postgresql), [MongoDB](https://github.com/balderdashy/sails-mongo), [Redis](https://github.com/balderdashy/sails-redis), local [disk](https://github.com/balderdashy/sails-disk), and local [memory](https://github.com/balderdashy/sails-memory).  [Community adapters](https://github.com/balderdashy/sails-docs/blob/master/intro-to-custom-adapters.md#notable-community-adapters) exist for [CouchDB](https://github.com/search?q=sails+couch&nwo=codeswarm%2Fsails-couchdb-orm&search_target=global&ref=cmdform), [neDB](https://github.com/adityamukho/sails-nedb), [TingoDB](https://github.com/andyhu/sails-tingo), [SQLite](https://github.com/AndrewJo/sails-sqlite3/tree/0.10), [Oracle](https://github.com/search?q=sails+oracle&type=Repositories&ref=searchresults), [MSSQL](https://github.com/cnect/sails-mssql), [DB2](https://github.com/search?q=sails+db2&type=Repositories&ref=searchresults), [ElasticSearch](https://github.com/search?q=%28elasticsearch+AND+sails%29+OR+%28elasticsearch+AND+waterline%29+&type=Repositories&ref=searchresults), [Riak](https://github.com/search?q=sails+riak&type=Repositories&ref=searchresults),
[neo4j](https://www.npmjs.org/package/sails-neo4j), [OrientDB](https://github.com/appscot/sails-orientdb),
[Amazon RDS](https://github.com/TakenPilot/sails-rds), [DynamoDB](https://github.com/TakenPilot/sails-dynamodb), [Azure Tables](https://github.com/azuqua/sails-azuretables), and [RethinkDB](https://github.com/search?q=%28%28sails+rethinkdb+in%3Aname%29+OR+%28waterline+rethinkdb+in%3Aname%29%29&type=Repositories&ref=searchresults);

## Instalation

```shell
npm i connect-waterline -S
```

## Usage
Using connect-waterline with its own instance of waterline:
```javascript
var session = require('express-session');
var WaterlineStore = require(connect-waterline);
var Adapter = require('sails-disk');  //any  sails-adapter

var options = {
  adapters: {
    'default': Adapter
  },
  connections: {
    'connect-waterline': {
      // specific adapter connection options
      // user: '',
      // password: '',
      // host: 'localhost',
      // database: 'sessions'
    }
  }
})

app.use(session({
  secret: 'foo',
  store: new WaterlineStore(options);
}));
```

## Testing
Test are written with mocha. To run all tests (requires all official adapters and respective DBs):
```shell
npm test
```

To run unit tests (requires sails-memory):
```shell
make test-unit
```

## License
MIT
