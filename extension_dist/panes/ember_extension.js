define("application",
  ["router","resolver"],
  function(Router, resolver) {
    "use strict";

    var App = Ember.Application.extend({
      modulePrefix: '',
      resolver: resolver,
      Router: Router
    });


    return App;
  });
define("controllers/application",
  [],
  function() {
    "use strict";
    var ApplicationController = Ember.Controller.extend({
      needs: ['mixinStack', 'mixinDetails'],

      pushMixinDetails: function(name, property, objectId, details) {
        details = { name: name, property: property, objectId: objectId, mixins: details };
        this.get('controllers.mixinStack').pushObject(details);
        this.set('controllers.mixinDetails.model', details);
      },

      popMixinDetails: function() {
        var mixinStack = this.get('controllers.mixinStack');
        var item = mixinStack.popObject();
        this.set('controllers.mixinDetails.model', mixinStack.get('lastObject'));
        this.get('port').send('objectInspector:releaseObject', { objectId: item.objectId });
      },

      activateMixinDetails: function(name, details, objectId) {
        var self = this;
        var objects = this.get('controllers.mixinStack').forEach(function(item) {
          self.get('port').send('objectInspector:releaseObject', { objectId: item.objectId });
        });

        this.set('controllers.mixinStack.model', []);
        this.pushMixinDetails(name, undefined, objectId, details);
      }
    });


    return ApplicationController;
  });
define("controllers/mixin_detail",
  [],
  function() {
    "use strict";
    var MixinDetailController = Ember.ObjectController.extend({
      needs: ['mixinDetails'],

      isExpanded: Ember.computed.equal('model.name', 'Own Properties'),

      digDeeper: function(property) {
        var objectId = this.get('controllers.mixinDetails.objectId');
        this.get('port').send('objectInspector:digDeeper', {
          objectId: objectId,
          property: property.name
        });
      },

      calculate: function(property) {
        var objectId = this.get('controllers.mixinDetails.objectId');
        var mixinIndex = this.get('controllers.mixinDetails.mixins').indexOf(this.get('model'));
        this.get('port').send('objectInspector:calculate', {
          objectId: objectId,
          property: property.name,
          mixinIndex: mixinIndex
        });
      }
    });


    return MixinDetailController;
  });
define("controllers/mixin_details",
  [],
  function() {
    "use strict";
    var MixinDetailsController = Ember.ObjectController.extend();


    return MixinDetailsController;
  });
define("controllers/mixin_stack",
  [],
  function() {
    "use strict";
    var MixinStackController = Ember.ArrayController.extend({
      needs: ['application'],

      trail: function() {
        var nested = this.slice(1);
        if (nested.length === 0) { return ""; }
        return "." + nested.mapProperty('property').join(".");
      }.property('[]'),

      isNested: function() {
        return this.get('length') > 1;
      }.property('[]'),

      popStack: function() {
        this.get('controllers.application').popMixinDetails();
      }
    });


    return MixinStackController;
  });
define("controllers/view_tree",
  [],
  function() {
    "use strict";
    var ViewTreeController = Ember.Controller.extend({
      pinnedNode: null,

      showLayer: function(node) {
        this.set('pinnedNode', null);
        this.get('port').send('view:showLayer', { objectId: node.value.objectId });
        this.set('pinnedNode', node);
      },

      hideLayer: function(node) {
        this.get('port').send('view:hideLayer', { objectId: node.value.objectId });
      },

      previewLayer: function(node) {
        if (node !== this.get('pinnedNode')) {
          this.get('port').send('view:previewLayer', { objectId: node.value.objectId });
        }
      },

      hidePreview: function(node) {
        this.get('port').send('view:hidePreview', { objectId: node.value.objectId });
      }
    });


    return ViewTreeController;
  });
define("controllers/view_tree_item",
  [],
  function() {
    "use strict";
    var ViewTreeItemController = Ember.Controller.extend();


    return ViewTreeItemController;
  });
define("main",
  ["application","views/tree_node","views/tree_node_controller","port"],
  function(App, TreeNodeView, TreeNodeControllerView, Port) {
    "use strict";

    var EmberExtension;

    EmberExtension = App.create();
    EmberExtension.TreeNodeView = TreeNodeView;
    EmberExtension.TreeNodeControllerView = TreeNodeControllerView;
    EmberExtension.Port = Port;


    if (typeof chrome !== 'undefined' && chrome.devtools) {
      chrome.devtools.network.onNavigated.addListener(function() {
        location.reload(true);
      });

      injectDebugger();
    }

    function injectDebugger() {

      var xhr = new XMLHttpRequest();
      xhr.open("GET", chrome.extension.getURL('/ember_debug/ember_debug.js'), false);
      xhr.send();
      var emberDebug = '(function() { ' + xhr.responseText + ' }());';

      chrome.devtools.inspectedWindow.eval(emberDebug);
    }



    return EmberExtension;
  });
define("port",
  [],
  function() {
    "use strict";
    var chromePort;


    /**
      Possible messages:

      calculate:
       objectId: objectId,
       property: property.name,
       mixinIndex: mixinIndex

      digDeeper:
        objectId: objectId,
        property: property.name

      releaseObject:
        objectId: objectId

      showLayer:
        objectId: objectId

      hideLayer:
        objectId: objectId

      getTree:
    */

    var Port = Ember.Object.extend(Ember.Evented, {
      init: function() {
        connect.apply(this);
      },
      send: function(messageType, options) {
        options.from = 'devtools';
        options.type = messageType;
        chromePort.postMessage(options);
      }
    });


    var connect = function() {
      var self = this;
      chromePort = chrome.extension.connect();
      chromePort.postMessage({ appId: chrome.devtools.inspectedWindow.tabId });

      chromePort.onMessage.addListener(function(message) {
        self.trigger(message.type, message);
      });
    };


    Ember.Application.initializer({
      name: "port",

      initialize: function(container, application) {
        container.register('port:main', application.Port);
        container.lookup('port:main');
      }
    });

    Ember.Application.initializer({
      name: "injectPort",

      initialize: function(container) {
        container.typeInjection('controller', 'port', 'port:main');
        container.typeInjection('route', 'port', 'port:main');
      }
    });


    return Port;
  });
define("router",
  [],
  function() {
    "use strict";
    var Router = Ember.Router.extend({
      location: 'none'
    });

    Router.map(function() {
      this.route('view_tree', { path: '/' });
    });


    return Router;
  });
define("routes/application",
  [],
  function() {
    "use strict";
    var ApplicationRoute = Ember.Route.extend({

      setupController: function(controller, model) {
        this.controllerFor('mixinStack').set('model', []);

        this.get('port').on('objectInspector:updateObject', this, this.updateObject);
        this.get('port').on('objectInspector:updateProperty', this, this.updateProperty);
        this._super(controller, model);
      },

      deactivate: function() {
        this.get('port').off('objectInspector:updateObject', this, this.updateObject);
        this.get('port').off('objectInspector:updateProperty', this, this.updateProperty);
      },

      updateObject: function(options) {
        var details = options.details,
          name = options.name,
          property = options.property,
          objectId = options.objectId;

        Ember.NativeArray.apply(details);
        details.forEach(arrayize);

        var controller = this.get('controller');

        if (options.parentObject) {
          controller.pushMixinDetails(name, property, objectId, details);
        } else {
          controller.activateMixinDetails(name, details, objectId);
        }
      },

      updateProperty: function(options) {
        var detail = this.controllerFor('mixinDetails').get('mixins').objectAt(options.mixinIndex);
        var property = Ember.get(detail, 'properties').findProperty('name', options.property);
        Ember.set(property, 'calculated', options.value);
      }

    });

    function arrayize(mixin) {
      Ember.NativeArray.apply(mixin.properties);
    }


    return ApplicationRoute;
  });
define("routes/view_tree",
  [],
  function() {
    "use strict";
    var ViewTreeRoute = Ember.Route.extend({
      setupController: function(controller, model) {
        this._super(controller, model);
        this.get('port').on('view:viewTree', this, this.setViewTree);
      },

      deactivate: function() {
        this.get('port').off('view:viewTree', this, this.setViewTree);
      },

      setViewTree: function(options) {
        this.set('controller.node', { children: [ arrayizeTree(options.tree) ] });
      }

    });


    function arrayizeTree(tree) {
      Ember.NativeArray.apply(tree.children);
      tree.children.forEach(arrayizeTree);
      return tree;
    }



    return ViewTreeRoute;
  });
this["Ember"] = this["Ember"] || {};
this["Ember"]["TEMPLATES"] = this["Ember"]["TEMPLATES"] || {};

this["Ember"]["TEMPLATES"]["application"] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [3,'>= 1.0.0-rc.4'];
helpers = helpers || Ember.Handlebars.helpers; data = data || {};
  var buffer = '', stack1, hashTypes, hashContexts, options, escapeExpression=this.escapeExpression, helperMissing=helpers.helperMissing;


  data.buffer.push("<div class=\"app__main\">\n  ");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "outlet", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push("\n</div>\n\n<div class=\"app__right-col\">\n  ");
  hashTypes = {};
  hashContexts = {};
  options = {hash:{},contexts:[depth0],types:["STRING"],hashContexts:hashContexts,hashTypes:hashTypes,data:data};
  data.buffer.push(escapeExpression(((stack1 = helpers.render),stack1 ? stack1.call(depth0, "mixinStack", options) : helperMissing.call(depth0, "render", "mixinStack", options))));
  data.buffer.push("\n</div>\n");
  return buffer;
  
});

this["Ember"]["TEMPLATES"]["mixin_details"] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [3,'>= 1.0.0-rc.4'];
helpers = helpers || Ember.Handlebars.helpers; data = data || {};
  var buffer = '', stack1, hashContexts, hashTypes, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '', stack1, hashContexts, hashTypes;
  data.buffer.push("\n<div ");
  hashContexts = {'class': depth0};
  hashTypes = {'class': "STRING"};
  data.buffer.push(escapeExpression(helpers.bindAttr.call(depth0, {hash:{
    'class': (":mixin mixin.type mixin.isExpanded:mixin_state_expanded mixin.properties.length:mixin_props_yes:mixin_props_no")
  },contexts:[],types:[],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push(" data-label=\"object-detail\" >\n  ");
  hashTypes = {};
  hashContexts = {};
  stack1 = helpers['if'].call(depth0, "mixin.properties.length", {hash:{},inverse:self.program(4, program4, data),fn:self.program(2, program2, data),contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\n  ");
  hashTypes = {};
  hashContexts = {};
  stack1 = helpers['if'].call(depth0, "mixin.isExpanded", {hash:{},inverse:self.noop,fn:self.program(6, program6, data),contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\n</div>\n");
  return buffer;
  }
function program2(depth0,data) {
  
  var buffer = '', hashContexts, hashTypes;
  data.buffer.push("\n    <h2 class=\"mixin__name\" ");
  hashContexts = {'target': depth0};
  hashTypes = {'target': "ID"};
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "toggleProperty", "isExpanded", {hash:{
    'target': ("mixin")
  },contexts:[depth0,depth0],types:["ID","STRING"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push(" data-label=\"object-detail-name\">");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "mixin.name", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push("</h2>\n  ");
  return buffer;
  }

function program4(depth0,data) {
  
  var buffer = '', hashTypes, hashContexts;
  data.buffer.push("\n    <h2 class=\"mixin__name\" data-label=\"object-detail-name\">");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "mixin.name", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push("</h2>\n  ");
  return buffer;
  }

function program6(depth0,data) {
  
  var buffer = '', stack1, hashTypes, hashContexts;
  data.buffer.push("\n  <ul class=\"mixin__properties\">\n    ");
  hashTypes = {};
  hashContexts = {};
  stack1 = helpers.each.call(depth0, "property", "in", "mixin.properties", {hash:{},inverse:self.program(16, program16, data),fn:self.program(7, program7, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\n  </ul>\n  ");
  return buffer;
  }
function program7(depth0,data) {
  
  var buffer = '', stack1, hashContexts, hashTypes;
  data.buffer.push("\n    <li ");
  hashContexts = {'class': depth0};
  hashTypes = {'class': "STRING"};
  data.buffer.push(escapeExpression(helpers.bindAttr.call(depth0, {hash:{
    'class': ("property.overridden:mixin__property_state_overridden :mixin__property")
  },contexts:[],types:[],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push(" ");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "digDeeper", "property", {hash:{},contexts:[depth0,depth0],types:["STRING","ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push(" data-label=\"object-property\">\n      ");
  hashTypes = {};
  hashContexts = {};
  stack1 = helpers['if'].call(depth0, "property.value.computed", {hash:{},inverse:self.program(10, program10, data),fn:self.program(8, program8, data),contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\n      <span class='mixin__property-name' data-label=\"object-property-name\">");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "property.name", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push("</span><span class='mixin__property-value-separator'>: </span>\n      ");
  hashTypes = {};
  hashContexts = {};
  stack1 = helpers['if'].call(depth0, "property.calculated", {hash:{},inverse:self.program(14, program14, data),fn:self.program(12, program12, data),contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\n      <span class='mixin__property-overridden-by'>(Overridden by ");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "property.overridden", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push(")</span>\n    </li>\n    ");
  return buffer;
  }
function program8(depth0,data) {
  
  var buffer = '', hashContexts, hashTypes;
  data.buffer.push("\n        <button ");
  hashContexts = {'bubbles': depth0};
  hashTypes = {'bubbles': "BOOLEAN"};
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "calculate", "property", {hash:{
    'bubbles': (false)
  },contexts:[depth0,depth0],types:["STRING","ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push(" data-label=\"calculate\"><img src=\"/images/calculate.svg\"></button>\n      ");
  return buffer;
  }

function program10(depth0,data) {
  
  
  data.buffer.push("\n        <span class='pad'></span>\n      ");
  }

function program12(depth0,data) {
  
  var buffer = '', hashTypes, hashContexts;
  data.buffer.push("\n        <span class='mixin__property-calculated-value' data-label=\"object-property-value\">");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "property.calculated", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push("</span>\n      ");
  return buffer;
  }

function program14(depth0,data) {
  
  var buffer = '', hashContexts, hashTypes;
  data.buffer.push("\n        <span ");
  hashContexts = {'class': depth0};
  hashTypes = {'class': "STRING"};
  data.buffer.push(escapeExpression(helpers.bindAttr.call(depth0, {hash:{
    'class': ("property.value.type")
  },contexts:[],types:[],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push(" data-label=\"object-property-value\">");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "property.value.inspect", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push("</span>\n      ");
  return buffer;
  }

function program16(depth0,data) {
  
  
  data.buffer.push("\n    <li class=\"mixin__property\">No Properties</li>\n    ");
  }

  hashContexts = {'itemController': depth0};
  hashTypes = {'itemController': "STRING"};
  stack1 = helpers.each.call(depth0, "mixin", "in", "mixins", {hash:{
    'itemController': ("mixinDetail")
  },inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\n");
  return buffer;
  
});

this["Ember"]["TEMPLATES"]["mixin_stack"] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [3,'>= 1.0.0-rc.4'];
helpers = helpers || Ember.Handlebars.helpers; data = data || {};
  var buffer = '', stack1, hashTypes, hashContexts, options, escapeExpression=this.escapeExpression, self=this, helperMissing=helpers.helperMissing;

function program1(depth0,data) {
  
  var buffer = '', hashTypes, hashContexts;
  data.buffer.push("\n    <button ");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers.action.call(depth0, "popStack", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push(" data-label=\"object-inspector-back\" class=\"object-inspector__back object-inspector__back_state_enabled\">◀ Back</button>\n  ");
  return buffer;
  }

function program3(depth0,data) {
  
  
  data.buffer.push("\n    <span data-label=\"object-inspector-back\" class=\"object-inspector__back object-inspector__back_state_disabled\">◀ Back</span>\n  ");
  }

  data.buffer.push("<h1 class=\"object-inspector__header\">\n  ");
  hashTypes = {};
  hashContexts = {};
  stack1 = helpers['if'].call(depth0, "isNested", {hash:{},inverse:self.program(3, program3, data),fn:self.program(1, program1, data),contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\n  <span data-label=\"object-name\" class=\"object-inspector__name\">");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "firstObject.name", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push("</span>\n</h1>\n<h2 class=\"object-inspector__trail\" data-label=\"object-trail\">");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "trail", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push("</h2>\n<div class=\"object-inspector__mixins\">\n  ");
  hashTypes = {};
  hashContexts = {};
  options = {hash:{},contexts:[depth0],types:["STRING"],hashContexts:hashContexts,hashTypes:hashTypes,data:data};
  data.buffer.push(escapeExpression(((stack1 = helpers.render),stack1 ? stack1.call(depth0, "mixinDetails", options) : helperMissing.call(depth0, "render", "mixinDetails", options))));
  data.buffer.push("\n</div>\n");
  return buffer;
  
});

this["Ember"]["TEMPLATES"]["tree_node"] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [3,'>= 1.0.0-rc.4'];
helpers = helpers || Ember.Handlebars.helpers; data = data || {};
  var buffer = '', stack1, hashTypes, hashContexts, escapeExpression=this.escapeExpression, self=this;

function program1(depth0,data) {
  
  var buffer = '', stack1, hashContexts, hashTypes;
  data.buffer.push("\n    <li class=\"view-tree__node-child\" data-label=\"tree-view\">\n      <p class=\"view-tree__node-header\">\n        ");
  hashContexts = {'nodeBinding': depth0,'label': depth0};
  hashTypes = {'nodeBinding': "STRING",'label': "STRING"};
  stack1 = helpers.view.call(depth0, "EmberExtension.TreeNodeControllerView", {hash:{
    'nodeBinding': ("node"),
    'label': ("tree-view-controller")
  },inverse:self.noop,fn:self.program(2, program2, data),contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\n        <span class='view-tree__node-template' data-label=\"tree-view-template\">template:");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "node.value.template", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push("</span>\n      </p>\n      ");
  hashTypes = {};
  hashContexts = {};
  stack1 = helpers['if'].call(depth0, "node.children.length", {hash:{},inverse:self.noop,fn:self.program(4, program4, data),contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\n    </li>\n  ");
  return buffer;
  }
function program2(depth0,data) {
  
  var hashTypes, hashContexts;
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers._triageMustache.call(depth0, "node.value.name", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  }

function program4(depth0,data) {
  
  var buffer = '', hashTypes, hashContexts;
  data.buffer.push("\n        ");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers.view.call(depth0, "EmberExtension.TreeNodeView", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push("\n      ");
  return buffer;
  }

  data.buffer.push("<ul class=\"view-tree__node\" data-label=\"tree-node\">\n  ");
  hashTypes = {};
  hashContexts = {};
  stack1 = helpers.each.call(depth0, "node", "in", "node.children", {hash:{},inverse:self.noop,fn:self.program(1, program1, data),contexts:[depth0,depth0,depth0],types:["ID","ID","ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data});
  if(stack1 || stack1 === 0) { data.buffer.push(stack1); }
  data.buffer.push("\n</ul>\n");
  return buffer;
  
});

this["Ember"]["TEMPLATES"]["view_tree"] = Ember.Handlebars.template(function anonymous(Handlebars,depth0,helpers,partials,data) {
this.compilerInfo = [3,'>= 1.0.0-rc.4'];
helpers = helpers || Ember.Handlebars.helpers; data = data || {};
  var buffer = '', hashTypes, hashContexts, escapeExpression=this.escapeExpression;


  data.buffer.push("<div class=\"view-tree\">\n  ");
  hashTypes = {};
  hashContexts = {};
  data.buffer.push(escapeExpression(helpers.view.call(depth0, "EmberExtension.TreeNodeView", {hash:{},contexts:[depth0],types:["ID"],hashContexts:hashContexts,hashTypes:hashTypes,data:data})));
  data.buffer.push("\n</div>\n");
  return buffer;
  
});
define("views/application",
  [],
  function() {
    "use strict";
    var ApplicationView = Ember.View.extend({
      classNames: ['app']
    });


    return ApplicationView;
  });
define("views/mixin_stack",
  [],
  function() {
    "use strict";
    var MixinStackView = Ember.View.extend({
      classNames: ['object-inspector']
    });


    return MixinStackView;
  });
define("views/tree_node",
  [],
  function() {
    "use strict";
    var TreeNodeView = Ember.View.extend({
      templateName: 'tree_node'
    });


    return TreeNodeView;
  });
define("views/tree_node_controller",
  [],
  function() {
    "use strict";
    var TreeNodeControllerView = Ember.View.extend({
      tagName: 'span',
      classNames: 'view-tree__node-controller',
      classNameBindings: 'isPinned',

      isPinned: function() {
        return this.get('node') === this.get('controller.pinnedNode');
      }.property('node', 'controller.pinnedNode'),

      mouseEnter: function() {
        this.get('controller').send('previewLayer', this.get('node'));
      },

      mouseLeave: function() {
        this.get('controller').send('hidePreview', this.get('node'));
      },

      click: function() {
        this.get('controller').send('showLayer', this.get('node'));
      }
    });


    return TreeNodeControllerView;
  });