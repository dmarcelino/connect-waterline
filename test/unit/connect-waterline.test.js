/**
 * Module dependencies.
 */
var session = require('express-session');
var ConnectWaterline = require('../../connect-waterline');
var WaterlineStore = ConnectWaterline(session);
var assert = require('assert');
var _ = require('lodash');
var Waterline = require('waterline');

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
var lazyOptions = _.defaults({ touchAfter: 2 /*seconds*/ }, options) 

// Create a connect cookie instance
var make_cookie = function () {
  var cookie = new session.Cookie();
  cookie.maxAge = 10000; // This sets cookie.expire through a setter
  cookie.secure = true;
  cookie.domain = 'cow.com';

  return cookie;
};

function getWaterlineModel(stringify, cb) {  // getMongooseConnection()
  if (!cb && stringify) {
    cb = stringify;
    stringify = undefined;
  }
  var waterline = new Waterline();
  
  // Apply options to collection definition
  var collection = _.cloneDeep(ConnectWaterline.defaultModelDefinition);
  collection.tableName = 'custom_sessions';
  collection.attributes.session = stringify === false ? 'json' : 'string';

  waterline.loadCollection(Waterline.Collection.extend(collection));

  waterline.initialize({
    adapters: options.adapters,
    connections: options.connections
  }, function (err, ontology) {
      if (err) { return cb(err); }
      cb(null, ontology.collections.sessions);
    });
}

// Create session data
var make_data = function () {
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

var make_data_no_cookie = function () {
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
var assert_session_equals = function (sid, data, session) {
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
        assert.equal(new Date(session.session.cookie.expires).getTime(), new Date(data.cookie.expires).getTime());
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

var open_db = function (options, callback) {
  var store = new WaterlineStore(options);
  store.once('connected', function () {
    callback(this, this.waterline, this.collection);
  });
};

var cleanup_store = function (store, cb) {
  store.waterline.teardown(cb);
};

var cleanup = function (store, waterline, collection, callback) {
  collection.drop(function () {
    //db.close();
    cleanup_store(store, callback);
  });
};

exports.test_set = function (done) {
  open_db(options, function (store, waterline, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, waterline, collection, done);
      });
    });
  });
};

exports.test_set_no_stringify = function (done) {
  open_db(_.defaults({ stringify: false }, options), function (store, db, collection) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, done);
      });
    });
  });
};

exports.test_session_cookie_overwrite_no_stringify = function (done) {
  var origSession = make_data();
  var cookie = origSession.cookie;

  open_db(_.defaults({ stringify: false }, options), function (store, db, collection) {
    var sid = 'test_set-sid';
    store.set(sid, origSession, function (err) {
      assert.equal(err, null);

      collection.findOne({ sid: sid }, function (err, session) {
        // Make sure cookie came out intact
        assert.strictEqual(origSession.cookie, cookie);

        // Make sure the fields made it back intact
        assert.equal(new Date(cookie.expires).getTime(), new Date(session.session.cookie.expires).getTime());
        assert.equal(cookie.secure, session.session.cookie.secure);

        cleanup(store, db, collection, function () {
          done();
        });
      });
    });
  });
};

exports.test_set_expires = function (done) {
  open_db(options, function (store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function () {
          done();
        });
      });
    });
  });
};

exports.test_set_expires_no_stringify = function (done) {
  open_db(_.defaults({ stringify: false }, options), function (store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert_session_equals(sid, data, session);

        cleanup(store, db, collection, function () {
          done();
        });
      });
    });
  });
};

exports.test_get = function (done) {
  open_db(options, function (store, db, collection) {
    var sid = 'test_get-sid';
    collection.create({ sid: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function (err, ses) {
      assert.equal(err, null);
      store.get(sid, function (err, session) {
        assert.equal(err, null);
        assert.deepEqual(session, { key1: 1, key2: 'two' });
        cleanup(store, db, collection, function () {
          done();
        });
      });
    });
  });
};

exports.test_length = function (done) {
  open_db(options, function (store, db, collection) {
    var sid = 'test_length-sid';
    collection.create({ sid: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function () {
      store.length(function (err, length) {
        assert.equal(err, null);
        assert.strictEqual(length, 1);
        cleanup(store, db, collection, function () {
          done();
        });
      });
    });
  });
};

exports.test_destroy_ok = function (done) {
  open_db(options, function (store, db, collection) {
    var sid = 'test_destroy_ok-sid';
    collection.create({ _id: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function () {
      store.destroy(sid, function (err) {
        assert.equal(err, null);
        cleanup(store, db, collection, function () {
          done();
        });
      });
    });
  });
};

exports.test_clear = function (done) {
  open_db(options, function (store, db, collection) {
    var sid = 'test_length-sid';
    collection.create({ _id: sid, key1: 1, key2: 'two' }, function () {
      store.clear(function () {
        collection.count(function (err, count) {
          assert.strictEqual(count, 0);

          cleanup(store, db, collection, function () {
            done();
          });
        });
      });
    });
  });
};

exports.test_options_no_db = function (done) {
  assert.throws(
    function () {
      new MongoStore({});
    },
    Error);

  done();
};


/* Tests with instantiated model */

exports.test_set_with_model = function (done) {
  getWaterlineModel(function (err, model) {
    assert.equal(err, null);
    open_db({ model: model }, function (store, db, collection) {
      var sid = 'test_set-sid';
      var data = make_data();

      store.set(sid, data, function (err) {
        assert.equal(err, null);
  
        // Verify it was saved
        collection.findOne({ sid: sid }, function (err, session) {
          assert_session_equals(sid, data, session);

          cleanup(store, db, collection, function () {
            done();
          });
        });
      });
    });
  });
};

exports.test_set_no_stringify_with_model = function (done) {
  getWaterlineModel(false, function (err, model) {
    assert.equal(err, null);
    open_db({ model: model, stringify: false }, function (store, db, collection) {
      var sid = 'test_set-sid';
      var data = make_data();

      store.set(sid, data, function (err) {
        assert.equal(err, null);
  
        // Verify it was saved
        collection.findOne({ sid: sid }, function (err, session) {
          assert_session_equals(sid, data, session);

          cleanup(store, db, collection, function () {
            done();
          });
        });
      });
    });
  });
};

exports.test_set_expires_with_model = function (done) {
  getWaterlineModel(function (err, model) {
    assert.equal(err, null);
    open_db({ model: model }, function (store, db, collection) {
      var sid = 'test_set_expires-sid';
      var data = make_data();

      store.set(sid, data, function (err) {
        assert.equal(err, null);
  
        // Verify it was saved
        collection.findOne({ sid: sid }, function (err, session) {
          assert_session_equals(sid, data, session);

          cleanup(store, db, collection, function () {
            done();
          });
        });
      });
    });
  });
};

exports.test_set_expires_no_stringify_with_model = function (done) {
  getWaterlineModel(false, function (err, model) {
    assert.equal(err, null);
    open_db({ model: model, stringify: false }, function (store, db, collection) {
      var sid = 'test_set_expires-sid';
      var data = make_data();

      store.set(sid, data, function (err) {
        assert.equal(err, null);
  
        // Verify it was saved
        collection.findOne({ sid: sid }, function (err, session) {
          assert_session_equals(sid, data, session);

          cleanup(store, db, collection, function () {
            done();
          });
        });
      });
    });
  });
};

exports.test_get_with_model = function (done) {
  getWaterlineModel(function (err, model) {
    assert.equal(err, null);
    open_db({ model: model }, function (store, db, collection) {
      var sid = 'test_get-sid';
      collection.create({ sid: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function () {
        store.get(sid, function (err, session) {
          assert.equal(err, null);
          assert.deepEqual(session, { key1: 1, key2: 'two' });

          cleanup(store, db, collection, function () {
            done();
          });
        });
      });
    });
  });
};

exports.test_length_with_model = function (done) {
  getWaterlineModel(function (err, model) {
    assert.equal(err, null);
    open_db({ model: model }, function (store, db, collection) {
      var sid = 'test_length-sid';
      collection.create({ sid: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function () {
        store.length(function (err, length) {
          assert.equal(err, null);
          assert.strictEqual(length, 1);

          cleanup(store, db, collection, function () {
            done();
          });
        });
      });
    });
  });
};

exports.test_destroy_ok_with_model = function (done) {
  getWaterlineModel(function (err, model) {
    assert.equal(err, null);
    open_db({ model: model }, function (store, db, collection) {
      var sid = 'test_destroy_ok-sid';
      collection.create({ sid: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function () {
        store.destroy(sid, function (err) {
          assert.equal(err, null);

          cleanup(store, db, collection, function () {
            done();
          });
        });
      });
    });
  });
};

exports.test_clear_with_model = function (done) {
  getWaterlineModel(function (err, model) {
    assert.equal(err, null);
    open_db({ model: model }, function (store, db, collection) {
      var sid = 'test_length-sid';
      collection.create({ sid: sid, key1: 1, key2: 'two' }, function () {
        store.clear(function () {
          collection.count(function (err, count) {
            assert.equal(err, null);
            assert.strictEqual(count, 0);

            cleanup(store, db, collection, function () {
              done();
            });
          });
        });
      });
    });
  });
};

exports.test_set_default_expiration = function (done) {
  var defaultExpirationTime = 10101;  // defaultExpirationTime is deprecated, so we use ttl
  var ttl = defaultExpirationTime / 1000;
  var optionsWithExpirationTime = _.defaults({ ttl: ttl }, options);

  open_db(optionsWithExpirationTime, function (store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data_no_cookie();

    var timeBeforeSet = new Date().valueOf();

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert.deepEqual(session.session, JSON.stringify(data));
        assert.strictEqual(session.sid, sid);
        assert.notEqual(session.expires, null);

        var timeAfterSet = new Date().valueOf();

        assert.ok(timeBeforeSet + defaultExpirationTime <= session.expires.valueOf());
        assert.ok(session.expires.valueOf() <= timeAfterSet + defaultExpirationTime,
          session.expires.valueOf() + ' <= ' + (timeAfterSet + defaultExpirationTime) + ', diff: ' +
          (timeAfterSet + defaultExpirationTime - session.expires.valueOf()) + ' ms');

        cleanup(store, db, collection, function () {
          done();
        });
      });
    });
  });
};

exports.test_set_witout_default_expiration = function (done) {
  var defaultExpirationTime = 1000 * 60 * 60 * 24 * 14;
  open_db(options, function (store, db, collection) {
    var sid = 'test_set_expires-sid';
    var data = make_data_no_cookie();

    var timeBeforeSet = new Date().valueOf();

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert.deepEqual(session.session, JSON.stringify(data));
        assert.strictEqual(session.sid, sid);
        assert.notEqual(session.expires, null);

        var timeAfterSet = new Date().valueOf();

        assert.ok(timeBeforeSet + defaultExpirationTime <= session.expires.valueOf());
        assert.ok(session.expires.valueOf() <= timeAfterSet + defaultExpirationTime);

        cleanup(store, db, collection, function () {
          done();
        });
      });
    });
  });
};

exports.test_set_custom_serializer = function (done) {
  var serializerOptions = _.defaults({
    serialize: function (obj) {
      obj.ice = 'test-1';
      return JSON.stringify(obj);
    },
    sessionType: 'string'
  }, options);
  open_db(serializerOptions, function (store, db, collection) {
    var sid = 'test_set_custom_serializer-sid';
    var data = make_data(),
      dataWithIce = JSON.parse(JSON.stringify(data));

    dataWithIce.ice = 'test-1';
    store.set(sid, data, function (err) {
      assert.equal(err, null);

      collection.findOne({ sid: sid }, function (err, session) {
        assert.deepEqual(session.session, JSON.stringify(dataWithIce));
        assert.strictEqual(session.sid, sid);

        cleanup(store, db, collection, done);
      });
    });
  });
};

exports.test_get_custom_unserializer = function (done) {
  var unserializerOptions = _.defaults({
    unserialize: function (obj) {
      obj.ice = 'test-2';
      return obj;
    },
  }, options);
  open_db(unserializerOptions, function (store, db, collection) {
    var sid = 'test_get_custom_unserializer-sid';
    var data = make_data();
    store.set(sid, data, function (err) {
      assert.equal(err, null);
      store.get(sid, function (err, session) {
        data.ice = 'test-2';
        data.cookie = data.cookie.toJSON();
        assert.equal(err, null);
        assert.deepEqual(session, data);
        cleanup(store, db, collection, done);
      });
    });
  });
};

exports.test_session_touch = function (done) {
  open_db(options, function (store, db, collection) {

    var sid = 'test_touch-sid',
      data = make_data();

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert.equal(err, null);
        assert_session_equals(sid, data, session);

        // touch the session
        store.touch(sid, session.session, function (err) {
          assert.equal(err, null);
          
          // find the touched session
          collection.findOne({ sid: sid }, function (err, session2) {
            assert.equal(err, null);

            // check if both expiry date are different
            assert.ok(session2.expires.getTime() > session.expires.getTime());

            cleanup(store, db, collection, function () {
              done();
            });

          });
        });
      });
    });
  });
};

exports.test_session_lazy_touch_sync = function (done) {
  open_db(lazyOptions, function (store, db, collection) {

    var sid = 'test_lazy_touch-sid-sync',
      data = make_data(),
      lastModifiedBeforeTouch,
      lastModifiedAfterTouch;

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert.equal(err, null);

        lastModifiedBeforeTouch = session.lastModified.getTime();

        // touch the session
        store.touch(sid, session, function (err) {
          assert.equal(err, null);

          collection.findOne({ sid: sid }, function (err, session2) {
            assert.equal(err, null);

            lastModifiedAfterTouch = session2.lastModified.getTime();

            assert.strictEqual(lastModifiedBeforeTouch, lastModifiedAfterTouch);

            cleanup(store, db, collection, function () {
              done();
            });

          });
        });
      });
    });
  });
};


exports.test_session_lazy_touch_async = function (done) {
  open_db(lazyOptions, function (store, db, collection) {

    var sid = 'test_lazy_touch-sid',
      data = make_data(),
      lastModifiedBeforeTouch,
      lastModifiedAfterTouch;

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert.equal(err, null);

        lastModifiedBeforeTouch = session.lastModified.getTime();

        setTimeout(function () {
          
          // touch the session
          store.touch(sid, session, function (err) {
            assert.equal(err, null);

            collection.findOne({ sid: sid }, function (err, session2) {
              assert.equal(err, null);

              lastModifiedAfterTouch = session2.lastModified.getTime();

              assert.ok(lastModifiedAfterTouch > lastModifiedBeforeTouch);

              cleanup(store, db, collection, function () {
                done();
              });

            });
          });

        }, 3000);

      });
    });
  });
};