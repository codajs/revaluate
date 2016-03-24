var revaluate = {
  register: function(module, filename, fn) {
    module.locals = {};
    module.key = 0;
    module.ids = {};
    module.cache = {};

    process.on('message', function(message) {
      module.ids = {};

      fn.call(module);

      module.cache = module.ids;
    });

    process.emit('message');
  },

  key: function(module, id) {
    var key = Object.keys(module.cache).find(function(key) {
      return module.cache[key] === id;
    });

    if (key) {
      delete module.cache[key];
    } else {
      key = module.key++;
    }

    module.ids[key] = id;

    return key;
  },

  call: function(module, id, fn) {
    var key = revaluate.key(module, id);

    if (!module[key]) {
      module[key] = fn();
    }

    return module[key];
  },
};
