var esprima = require('esprima');
var estraverse = require('estraverse');
var escodegen = require('escodegen');
var escope = require('escope');

function compile(source, options) {
  var ast = esprima.parse(source, {
    comment: true,
    loc: true,
    range: true,
    raw: true,
    source: __filename,
    tokens: true,
  });

  var scopes = escope.analyze(ast, {
    sourceType: 'module',
  });

  var scope = scopes.acquire(ast);

  ast = estraverse.replace(ast, {
    enter: function(node, parent) {
      if (/Function/.test(node.type)) {
        scope = scopes.acquire(node);
      }

      return node;
    },

    leave: function(node, parent) {
      if (/Function/.test(node.type)) {
        scope = scope.upper;
      } 

      if (/Identifier/.test(node.type)) {
        var parent = (function find(scope) {
          var match = scope.variables.find(function(variable) {
            return variable.name === node.name;
          });

          if (match) {
            return scope;
          }

          if (scope.upper) {
            return find(scope.upper);
          }
        }(scope));

        if (parent == undefined || parent.upper) {
          return node;
        }

        return {
          type: 'MemberExpression',
          object: {
            type: 'MemberExpression',
            object: {
              type: 'Identifier',
              name: 'module'
            },
            property: {
              type: 'Identifier',
              name: 'locals'
            }
          },
          property: node,
        };
      }

      if (/VariableDeclaration/.test(node.type) && scope.upper == null) {
        if (node.declarations.length == 1) {
          return node.declarations[0];
        }

        return {
          'type': 'ExpressionStatement',
          'expression': {
            'type': 'SequenceExpression',
            'expressions': node.declarations,
          }
        };
      } 

      if (/VariableDeclarator/.test(node.type) && scope.upper == null) {
        return {
          'type': 'ExpressionStatement',
          'expression': {
            'type': 'AssignmentExpression',
            'operator': '=',
            'left': node.id,
            'right': node.init,
          },
        };
      }

      if (/ClassDeclaration/.test(node.type) && scope.upper == null) {
        return {
          type: 'ExpressionStatement',
          expression: {
            type: 'AssignmentExpression',
            operator: '=',
            left: node.id,
            right: Object.assign({}, node, {
              type: 'ClassExpression',
              id: node.id.property,
            }),
          },
        };
      }

      if (/FunctionDeclaration/.test(node.type) && scope.upper == null) {
        return {
          type: 'ExpressionStatement',
          expression: {
            type: 'AssignmentExpression',
            operator: '=',
            left: node.id,
            right: Object.assign({}, node, {
              type: 'FunctionExpression',
              id: node.id.property,
            }),
          },
        };
      }

      return node;
    },
  });

  scopes = escope.analyze(ast);
  scope = scopes.acquire(ast);
  ast = estraverse.replace(ast, {
    enter: function(node, parent) {
      if (/Function/.test(node.type)) {
        scope = scopes.acquire(node);
      }
    },

    leave: function(node, parent) {
      if (/Function/.test(node.type)) {
        scope = scope.upper;
      } 

      if (scope.upper == null) {
        if (/(Assignment|Update|Call)Expression/.test(node.type)) {
          var data = new Buffer(JSON.stringify(node, [
            'argument',
            'member',
            'property',
            'object',
            'computed',
            'arguments',
            'operator',
            'callee',
            'expression',
            'id',
            'left',
            'name',
            'params',
            'right',
            'type',
            'value'
          ]), 'binary');

          var id = data.toString('base64');

          return {
            "type": "CallExpression",
            "callee": {
              "type": "MemberExpression",
              "object": {
                "type": "Identifier",
                "name": "revaluate"
              },
              "property": {
                "type": "Identifier",
                "name": "call"
              }
            },
            "arguments": [
              {
                "type": "Identifier",
                "name": "module"
              },
              {
                "type": "Literal",
                "value": id,
              },
              {
                "type": "FunctionExpression",
                "params": [],
                "defaults": [],
                "body": {
                  "type": "BlockStatement",
                  "body": [
                    {
                      "type": "ExpressionStatement",
                      "expression": node,
                    }
                  ]
                },
              }
            ]
          };
        }
      }

      if (/Program/.test(node.type)) {
        return {
          "type": "Program",
          "body": [
            esprima.parse(fs.readFileSync(__dirname + '/prelude.js', 'utf-8')),
            {
              "type": "ExpressionStatement",
              "expression": {
                "type": "CallExpression",
                "callee": {
                  "type": "MemberExpression",
                  "computed": false,
                  "object": {
                    "type": "Identifier",
                    "name": "revaluate"
                  },
                  "property": {
                    "type": "Identifier",
                    "name": "register"
                  }
                },
                "arguments": [
                  {
                    type: "Identifier",
                    name: "module",
                  },
                  {
                    "type": "Identifier",
                    "name": "__filename",
                  },
                  {
                    "type": "FunctionExpression",
                    "params": [],
                    "defaults": [],
                    "body": {
                      "type": "BlockStatement",
                      "body": node.body,
                    },
                  }
                ]
              }
            }
          ],
          "sourceType": "script"
        };
      }
    }
  });

  return escodegen.generate(ast, {
    sourceMap: true,
    sourceMapWithCode: true,
    sourceContent: source,
  });
}
