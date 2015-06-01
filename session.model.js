module.exports = {
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
    expires: 'datetime',
    has_expires: 'boolean',
    lastModified: 'datetime'
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