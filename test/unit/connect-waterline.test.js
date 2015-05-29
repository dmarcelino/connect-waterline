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
var settings = { config: {} };
if (process.env.ADAPTER_NAME){
   testAdapter = process.env.ADAPTER_NAME;
   settings = require('../integration/config/' + testAdapter + '.json');
}
settings.config.adapter = 'default';
var Adapter = require(testAdapter);

var options = {
  adapters: {
    'default': Adapter
  },
  collection: 'sessionTable',
  connections: {
    'connect-waterline': settings.config
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
    for (var prop in data) {
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

describe('connect-waterline', function(){
  
    describe('creating new connection', function(done){
      
      describe('stringify', function(done){
        runTests('new_connection');
        //runTests('instantiated_model');
      });
      
      describe('no stringify', function(done){
        runNoStringifyTests('new_connection');
      });
      
      it('should throw error with empty options', function (done) {
        assert.throws(
          function () {
            new MongoStore({});
          },
          Error);
      
        done();
      }); 
       
      it('should set session with default expiration', function (done) {
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
      
              // +1000 because sails-postgresql only has 1s granularity
              assert.ok(timeBeforeSet + defaultExpirationTime <= (session.expires.valueOf() + 1000),
               (timeBeforeSet + defaultExpirationTime) + ' <= ' + session.expires.valueOf() +  ', diff: ' +
               (session.expires.valueOf() - (timeBeforeSet + defaultExpirationTime)) + ' ms');
              assert.ok(session.expires.valueOf() <= timeAfterSet + defaultExpirationTime,
                session.expires.valueOf() + ' <= ' + (timeAfterSet + defaultExpirationTime) + ', diff: ' +
                (timeAfterSet + defaultExpirationTime - session.expires.valueOf()) + ' ms');
      
              cleanup(store, db, collection, function () {
                done();
              });
            });
          });
        });
      });
       
      it('should set session without default expiration', function (done) {
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
      
              assert.ok(timeBeforeSet + defaultExpirationTime <= session.expires.valueOf() + 1000);
              assert.ok(session.expires.valueOf() <= timeAfterSet + defaultExpirationTime);
      
              cleanup(store, db, collection, function () {
                done();
              });
            });
          });
        });
      });
      
      describe('custom serializer', function(){
        
        var store, waterline, collection;
        
        before(function(done){
          var serializerOptions = _.defaults({
            serialize: function (obj) {
              obj.ice = 'test-1';
              return JSON.stringify(obj);
            },
            sessionType: 'string'
          }, options);
          
          function open_db_done (_store, _waterline, _collection) {
            store = _store;
            waterline = _waterline;
            collection = _collection;
            done();
          }
          
          open_db(serializerOptions, open_db_done);
        });
        
        after(function(done){
          cleanup(store, waterline, collection, done);
        });
        
        it('should set session with custom serializer', function (done) {
          var sid = 'test_set_custom_serializer-sid';
          var data = make_data(),
              dataWithIce = JSON.parse(JSON.stringify(data));
      
          dataWithIce.ice = 'test-1';
          store.set(sid, data, function (err) {
            assert.equal(err, null);
      
            collection.findOne({ sid: sid }, function (err, session) {
              assert.deepEqual(session.session, JSON.stringify(dataWithIce));
              assert.strictEqual(session.sid, sid);
              done();
            });
          });
        });
        
      });
      
      describe('custom unserializer', function(){
        var store, waterline, collection;
        
        before(function(done){
          var unserializerOptions = _.defaults({
            unserialize: function (obj) {
              obj.ice = 'test-2';
              return obj;
            },
          }, options);
          
          function open_db_done (_store, _waterline, _collection) {
            store = _store;
            waterline = _waterline;
            collection = _collection;
            done();
          }
          
          open_db(unserializerOptions, open_db_done);
        });
        
        after(function(done){
          cleanup(store, waterline, collection, done);
        });
       
        it('should get session with custom unserializer', function (done) {
          if(settings.alwaysStringify){
            this.skip();
          }
        
          var sid = 'test_get_custom_unserializer-sid';
          var data = make_data();
          store.set(sid, data, function (err) {
            assert.equal(err, null);
            store.get(sid, function (err, session) {
              data.ice = 'test-2';
              data.cookie = data.cookie.toJSON();
              assert.equal(err, null);
              assert.deepEqual(session, data);
              done();
            });
          });
        });
      
      });
       
      it('should touch session', function (done) {
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
      });
       
      it('should lazy touch session sync', function (done) {
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
      });
      
      
      it('should lazy touch session async', function (done) {
        this.timeout(4000);
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
      });
    
    });
  
  describe('previously instantiated model', function(){
    
    describe('stringify', function(done){
      runTests('instantiated_model');
    });
     
    describe('no stringify', function(done){
      runNoStringifyTests('instantiated_model');
    });

  });
  
});


function runTests(testType){
  
  var store, waterline, collection;
  
  // tests setup
  beforeEach(function(done){
    function open_db_done (_store, _waterline, _collection) {
      store = _store;
      waterline = _waterline;
      collection = _collection;
      done();
    }
    
    if(testType === 'instantiated_model'){
      getWaterlineModel(function (err, model) {
        assert.equal(err, null);
        open_db({ model: model }, open_db_done);
      });
    }
    else {
     open_db(options, open_db_done); 
    }
  });
  
  afterEach(function(done){
    cleanup(store, waterline, collection, function(){
      store = undefined;
      waterline = undefined;
      collection = undefined;
      done();
    });
  });

  it('should set session', function (done) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert_session_equals(sid, data, session);
        done();
      });
    });
  });
  
  it('should set expires', function (done) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert_session_equals(sid, data, session);
        done();
      });
    });
  });
  
  it('should get session', function (done) {
    var sid = 'test_get-sid';
    collection.create({ sid: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function (err, ses) {
      assert.equal(err, null);
      store.get(sid, function (err, session) {
        assert.equal(err, null);
        assert.deepEqual(session, { key1: 1, key2: 'two' });
        done();
      });
    });
  });
 
  it('should store length', function (done) {
    var sid = 'test_length-sid';
    collection.create({ sid: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function () {
      store.length(function (err, length) {
        assert.equal(err, null);
        assert.strictEqual(length, 1);
        done();
      });
    });
  });

  it('should destroy session', function (done) {
    var sid = 'test_destroy_ok-sid';
    collection.create({ _id: sid, session: JSON.stringify({ key1: 1, key2: 'two' }) }, function () {
      store.destroy(sid, function (err) {
        assert.equal(err, null);
        done();
      });
    });
  });

  it('should clear store', function (done) {
    var sid = 'test_length-sid';
    collection.create({ _id: sid, key1: 1, key2: 'two' }, function () {
      store.clear(function () {
        collection.count(function (err, count) {
          assert.strictEqual(count, 0);
          done();
        });
      });
    });
  });
}
  
  
function runNoStringifyTests(testType){
  if(settings.alwaysStringify){
    // Skip no stringify tests
    it('should set session without stringify');
    it('should set session cookie without stringify');
    it('should set expires without stringify');
    return;
  }

  var store, waterline, collection;  

  // tests setup
  beforeEach(function(done){
    function open_db_done (_store, _waterline, _collection) {
      store = _store;
      waterline = _waterline;
      collection = _collection;
      done();
    }
    
    if(testType === 'instantiated_model'){
      getWaterlineModel(false, function (err, model) {
        assert.equal(err, null);
        assert(model, 'model must exist')
        var noStringifyOptions = _.defaults({ stringify: false }, { model: model });
        open_db(noStringifyOptions, open_db_done);
      });
    }
    else {
      open_db(_.defaults({ stringify: false }, options), open_db_done);
    }
  });
  
  afterEach(function(done){
    cleanup(store, waterline, collection, function(){
      store = undefined;
      waterline = undefined;
      collection = undefined;
      done();
    });
  });

  it('should set session without stringify', function (done) {
    var sid = 'test_set-sid';
    var data = make_data();

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert_session_equals(sid, data, session);
        done();
      });
    });
  });
 
  it('should set session cookie without stringify', function (done) {
    var origSession = make_data();
    var cookie = origSession.cookie;
    var sid = 'test_set-sid';
    store.set(sid, origSession, function (err) {
      assert.equal(err, null);

      collection.findOne({ sid: sid }, function (err, session) {
        // Make sure cookie came out intact
        assert.strictEqual(origSession.cookie, cookie);

        // Make sure the fields made it back intact
        assert.equal(new Date(cookie.expires).getTime(), new Date(session.session.cookie.expires).getTime());
        assert.equal(cookie.secure, session.session.cookie.secure);
        done();
      });
    });
  });

  it('should set expires without stringify', function (done) {
    var sid = 'test_set_expires-sid';
    var data = make_data();

    store.set(sid, data, function (err) {
      assert.equal(err, null);

      // Verify it was saved
      collection.findOne({ sid: sid }, function (err, session) {
        assert_session_equals(sid, data, session);
        done();
      });
    });
  }); 
}
