/**
 * Module dependencies.
 */
var session = require('express-session');
var ConnectWaterline = require('../connect-waterline');
var WaterlineStore = ConnectWaterline(session);
var assert = require('assert');
var _ = require('lodash');

var defaultOptions = {w: 1};
var testAdapter = 'sails-memory';
var testDb = 'connect-mongo-test';
var testHost = '127.0.0.1';
var testPort = 27017;

var options = {
  adapters: {
    'default': require(testAdapter)
  },
  collection: 'sessionTable',
  connections: {
    'connect-waterline': {
      adapter: 'default',
      database: testDb,
      host: testHost,
      port: testPort
    }
  }
};
var lazyOptions = {
  db: testDb,
  host: testHost,
  touchAfter: 2 // seconds
};

// Create a connect cookie instance
var make_cookie = function() {
  var cookie = new session.Cookie();
  cookie.maxAge = 10000; // This sets cookie.expire through a setter
  cookie.secure = true;
  cookie.domain = 'cow.com';

  return cookie;
};

function getWaterlineModel(cb) {  // getMongooseConnection()
  var waterline = new Waterline();
  
  var collection = _.defaults({ tableName: 'sessions' }, ConnectWaterline.defaultModelDefinition);
  waterline.loadCollection(Waterline.Collection.extend(collection));
  
  waterline.initialize({
    adapters: options.adapters,
    connections: options.connections
  }, function(err, ontology){
    if(err) { return cb(err); }
    cb(null, ontology.collections.sessions);
  });
}

// Create session data
var make_data = function() {
  return {
    foo: 'bar',
    baz: {
      cow: 'moo',
      chicken: 'cluck'
    },
    num: 1,
    cookie: make_cookie()
  };
};

var make_data_no_cookie = function() {
  return {
    foo: 'bar',
    baz: {
      cow: 'moo',
      fish: 'blub',
      fox: 'nobody knows!'
    },
    num: 2
  };
};

// Given a session id, input data, and session, make sure the stored data matches in the input data
var assert_session_equals = function(sid, data, session) {
  if (typeof session.session === 'string') {
    // Compare stringified JSON
    assert.strictEqual(session.session, JSON.stringify(data));
  }
  else {
    // Can't do a deepEqual for the whole session as we need the toJSON() version of the cookie
    // Make sure the session data in intact
    for (var prop in session.session) {
      if (prop === 'cookie') {
        // Make sure the cookie is intact
        
        // deepEqual is choking with expires date comparison, let's circumvent that for now
        assert.equal(session.session.cookie.expires, data.cookie.expires.toJSON());
        var cookieJSON = data.cookie.toJSON();
        delete session.session.cookie.expires;
        delete cookieJSON.expires;
        assert.deepEqual(session.session.cookie, cookieJSON);
      }
      else {
        assert.deepEqual(session.session[prop], data[prop]);
      }
    }
  }

  // Make sure the ID matches
  assert.strictEqual(session.sid, sid);
};

var open_db = function(options, callback) {
  var store = new WaterlineStore(options);
  store.once('connected', function () {
    callback(this, this.waterline, this.collection);
  });
};

var cleanup_store = function(store, cb) {
  store.waterline.teardown(cb);
};

var cleanup = function(store, waterline, collection, callback) {
  collection.drop(function() {
    //db.close();
    cleanup_store(store, callback);
  });
};

exports.test_set = function(done) {
  open_db(options, function(store, waterline, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({sid: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, waterline, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_no_stringify = function(done) {
  open_db(_.defaults({ stringify: false }, options), function(store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({sid: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_session_cookie_overwrite_no_stringify = function(done) {
  var origSession = make_data();
  var cookie = origSession.cookie;

  open_db(_.defaults({ stringify: false }, options), function(store, db, collection) {
    var sid = 'test_set-sid';
    store.set(sid, origSession, function(err) {
      assert.equal(err, null);

      collection.findOne({sid: sid}, function(err, session) {
        // Make sure cookie came out intact
        assert.strictEqual(origSession.cookie, cookie);

        // Make sure the fields made it back intact
        assert.equal(cookie.expires.toJSON(), session.session.cookie.expires);
        assert.equal(cookie.secure, session.session.cookie.secure);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_expires = function(done) {
  open_db(options, function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({sid: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_set_expires_no_stringify = function(done) {
  open_db(_.defaults({ stringify: false }, options), function(store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function(err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({sid: sid}, function(err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

exports.test_get = function(done) {
  open_db(options, function(store, db, collection) {
    var sid = 'test_get-sid';
    collection.create({sid: sid, session: JSON.stringify({key1: 1, key2: 'two'})}, function(err, ses) {
      assert.equal(err, null);
      store.get(sid, function(err, session) {
        assert.equal(err, null);
        console.log('session:', session);
        assert.deepEqual(session, {key1: 1, key2: 'two'});
        cleanup(store, db, collection, function() {
          done();
        });
      });
    });
  });
};

