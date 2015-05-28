/**
 * Module dependencies
 */
var _ = require('lodash');
var crypto = require('crypto');
var Waterline = require('waterline');
var util = require('util');
var log = require('debug-logger')('connect-waterline');

/**
 * Default options
 */
var defaultOptions = {
  // Global options
  collection: 'sessions',
  stringify: true,
  hash: false,
  ttl: 60 * 60 * 24 * 14, // 14 days
  autoRemove: 'interval',
  autoRemoveInterval: 10
};

var defaultHashOptions = {
  salt: 'connect-waterline',
  algorithm: 'sha1'
};

var defaultSerializationOptions = {
  serialize: function (session) {
    // Copy each property of the session to a new object
    var obj = {};
    for (var prop in session) {
      if (prop === 'cookie') {

        // Convert the cookie instance to an object, if possible
        // This gets rid of the duplicate object under session.cookie.data property
        obj.cookie = session.cookie.toJSON ? session.cookie.toJSON() : session.cookie;
      } else {
        obj[prop] = session[prop];
      }
    }
    return obj;
  },
  unserialize: _.identity
};

var stringifySerializationOptions = {
  serialize: JSON.stringify,
  unserialize: JSON.parse
};

module.exports = function(connect) {
  var Store = connect.Store || connect.session.Store;
  var MemoryStore = connect.MemoryStore || connect.session.MemoryStore;
  
  /**
   * Initialize WaterlineStore with the given `options`.
   *
   * @param {Object} options
   * @api public
   */

  function WaterlineStore(options) {
    
    /* Fallback */

    if (options.fallbackMemory && MemoryStore) {
      return new MemoryStore();
    }
    
    /* Options */

    options = _.defaults(options || {}, defaultOptions);

    if (options.hash) {
      options.hash = _.defaults(options.hash, defaultHashOptions);
    }

    if (!options.stringify || options.serialize || options.unserialize) {
      options = _.defaults(options, defaultSerializationOptions);
    } else {
      options = _.assign(options, stringifySerializationOptions);
    }

    this.options =  options;

    Store.call(this, options);

    var self = this;
    
    function changeState(newState) {
      log.info('switched to state: %s', newState);
      self.state = newState;
      self.emit(newState);
    }
    
    function connectionReady(err, collection) {
      if (err) {
        log.error('not able to connect to the database');
        changeState('disconnected');
        throw err;
      }

      self.collection = collection;
      
      switch (options.autoRemove) {

        case 'native':
          throw new Error('"native" is not supported (yet), please use another option.');
//          self.collection.ensureIndex({ expires: 1 }, { expireAfterSeconds: 0 }, function (err) {
//            if (err) throw err;
//            changeState('connected');
//          });
//          break;

        case 'interval':
          setInterval(function () {
            self.collection.destroy({ expires: { '>': new Date() } }, function(err){
              if(err) { log.warn('Failed to delete expired sesssions:', err); }
            });
          }, options.autoRemoveInterval * 1000 * 60);
          changeState('connected');
          break;

        default:
          changeState('connected');
          break;

      }
    }
    
    function initWithWaterlineModel(){
      process.nextTick(function(){
        self.waterline = options.model.waterline;  // TODO: double check this
        connectionReady(null, options.model);
      });
    }

    function initWithNewConnection() {
      var adapters = options.adapters || {};
      var connections = options.connections || {};
  
      self.waterline = new Waterline();
      
      // Apply options to collection definition
      var collection = _.cloneDeep(module.exports.defaultModelDefinition);
      collection.tableName = options.collection || 'sessions';
      collection.attributes.session = options.stringify === false ? 'json' : 'string'; 
      
      self.waterline.loadCollection(Waterline.Collection.extend(collection));
      
      self.waterline.initialize({
        adapters: adapters,
        connections: connections
      }, function(err, ontology){
        log.info('Waterline initialized');
        connectionReady(err, ontology && ontology.collections.sessions);
      });
    }
    
    this.getCollection = function (done) {
      switch (self.state) {
        case 'connected':
          done(null, self.collection);
          break;
        case 'connecting':
          self.once('connected', function () {
            done(null, self.collection);
          });
          break;
        case 'disconnected':
          done(new Error('Not connected'));
          break;
      }
    };
    
    this.getSessionId = function (sid) {
      if (options.hash) {
        return crypto.createHash(options.hash.algorithm).update(options.hash.salt + sid).digest('hex');
      } else {
        return sid;
      }
    };
    
    changeState('init');
    
    if (options.model) {
      log.debug('use strategy: `waterline_model`');
      initWithWaterlineModel();
    } else {
      log.debug('use strategy: `new_connection`');
      initWithNewConnection();
    }

    changeState('connecting');
  }
  
  /**
   * Inherit from `Store`.
   */
   util.inherits(WaterlineStore, Store);
   
  /**
   * Attempt to fetch session by the given `sid`.
   *
   * @param {String} sid
   * @param {Function} callback
   * @api public
   */
   
  WaterlineStore.prototype.get = function(sid, callback) {
    if (!callback) callback = _.noop;
    sid = this.getSessionId(sid);

    var self = this;

    var query = {
      sid: sid,
      or: [
        { has_expires: false },
        { expires: { '>': new Date() } }
      ]
    };
    
    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.findOne(query, function(err, session) {
        if (err) {
          log.error('not able to execute `find` query for session: ' + sid);
          return callback(err);
        }

        if (session) {
          var s;
          try {
            s = self.options.unserialize(session.session);
            if(self.options.touchAfter > 0 && session.lastModified){
              s.lastModified = session.lastModified;
            }
          } catch (err) {
            log.error('unable to deserialize session');
            callback(err);
          }
          callback(null, s);
        } else {
          callback();
        }
      });
    });
  };
  
  /**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} callback
   * @api public
   */

  WaterlineStore.prototype.set = function(sid, session, callback) {
    if (!callback) callback = _.noop;
    sid = this.getSessionId(sid);

    // removing the lastModified prop from the session object before update
    if(this.options.touchAfter > 0 && session && session.lastModified){
      delete session.lastModified;
    }

    var s;

    try {
      s = {sid: sid, session: this.options.serialize(session)};
    } catch (err) {
      log.error('unable to serialize session');
      callback(err);
    }

    if (session && session.cookie && session.cookie.expires) {
      s.expires = new Date(session.cookie.expires);
    } else {
      // If there's no expiration date specified, it is
      // browser-session cookie or there is no cookie at all,
      // as per the connect docs.
      //
      // So we set the expiration to two-weeks from now
      // - as is common practice in the industry (e.g Django) -
      // or the default specified in the options.
      s.expires = new Date(Date.now() + this.options.ttl * 1000);
    }

    if(this.options.touchAfter > 0){
      s.lastModified = new Date();
    }

    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.update({sid: sid}, s, function(err, res) {
        if (err) { 
          log.error('not able to set/update session: ' + sid);
          return callback(err);
        }        
        if (res.length === 0){
          // doesn't exist yet, let's create it
          collection.create(s, function(err, res) {
            if (err) log.error('not able to create session: ' + sid);        
            callback(err);
          });
        } else {
          callback();
        }
      });
    });
  };
  
  /**
   * Touch the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} session
   * @param {Function} callback
   * @api public
   */
  WaterlineStore.prototype.touch = function (sid, session, callback) {

    var updateFields = {},
      touchAfter = this.options.touchAfter * 1000,
      lastModified = session.lastModified ? session.lastModified.getTime() : 0,
      currentDate = new Date();

    sid = this.getSessionId(sid);

    callback = callback ? callback : _.noop;

    // if the given options has a touchAfter property, check if the
    // current timestamp - lastModified timestamp is bigger than 
    // the specified, if it's not, don't touch the session
    if(touchAfter > 0 && lastModified > 0){

      var timeElapsed = currentDate.getTime() - session.lastModified;

      if(timeElapsed < touchAfter){
        return callback();
      } else {
        updateFields.lastModified = currentDate;
      }

    }

    if (session && session.cookie && session.cookie.expires) {
      updateFields.expires = new Date(session.cookie.expires);
    } else {
      updateFields.expires = new Date(Date.now() + this.options.ttl * 1000);
    }

    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.update({ sid: sid }, updateFields, function (err, result) {
        if (err) {
          log.error('not able to touch session: %s (error)', sid);
          callback(err);
        } else if (result.length === 0) {
          log.error('not able to touch session: %s (not found)', sid);
          callback(new Error('Unable to find the session to touch'));
        }
        callback();
      });
    });
  };

  /**
   * Destroy the session associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Function} callback
   * @api public
   */

  WaterlineStore.prototype.destroy = function(sid, callback) {
    if (!callback) callback = _.noop;
    sid = this.getSessionId(sid);

    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.destroy({sid: sid}, function(err) {
        if (err) log.error('not able to destroy session: ' + sid);
        callback(err);
      });
    });
  };
  
  /**
   * Fetch number of sessions.
   *
   * @param {Function} callback
   * @api public
   */

  WaterlineStore.prototype.length = function(callback) {
    if (!callback) callback = _.noop;
    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.count({}, function(err, count) {
        if (err) log.error('not able to count sessions');
        callback(err, count);
      });
    });
  };
  
  /**
   * Clear all sessions.
   *
   * @param {Function} callback
   * @api public
   */

  WaterlineStore.prototype.clear = function(callback) {
    if (!callback) callback = _.noop;
    this.getCollection(function(err, collection) {
      if (err) return callback(err);
      collection.drop(function(err) {
        if (err) log.error('not able to clear sessions');
        callback(err);
      });
    });
  };

  return WaterlineStore;
};


module.exports.defaultModelDefinition = {
  identity: 'sessions',
  
  connection: 'connect-waterline',
  
  autoPK: false,
  autoCreatedAt: false,
  associationFinders: false,
  
  attributes: {
    sid: {
      type: 'string',
      primaryKey: true,
      unique: true,
      required: true,
    },
    session: 'string',
    expires: 'date',
    has_expires: 'boolean',
    lastModified: 'date'
  },
  
  // Ugly workaround for detecting empty expires:
  // https://github.com/balderdashy/waterline/issues/189
  beforeValidate: function(values, next) {
    if (values.expires) {
      values.has_expires = true;
    } else {
      values.has_expires = false;
    }
    next();
  }
};
