#!/usr/bin/env node
'use strict'

var fs = require('fs')
var RED = require('node-red')
var SwaggerParser = require('swagger-parser')

var arg = parseArguments(process.argv)
var input = arg.input
var output = arg.output
var flowName = arg.flowName
var merge = arg.merge

// defult x,y
var x = 200
var y = 50

// merge output
var json = null
var flowId = null
if (merge === true) {
  try {
    json = JSON.parse(fs.readFileSync(output))
  } catch (err) {
    console.error(err)
    process.exit(2)
  }
  // search flow & getId(validate...)
  for (var idx in json) {
    if (json[idx].type === 'tab' && json[idx].label === flowName) {
      flowId = json[idx].id
    }
  }
}
if (flowId === null) {
  // create new flow
  var flow = createFlowNode(flowName)
  json = [ flow ]
  flowId = flow.id
}

// calc max y position & collect api
var apis = []
if (merge === true) {
  for (var index in json) {
    if (json[index].z === flowId) {
      if (json[index].y >= y) {
        y = json[index].y + 50
      }
      if (isHttpInNode(flowId, json[index])) {
        apis.push(json[index].url + ',' + json[index].method)
      }
    }
  }
}

// create nodes
var templateString = ''

// read from swagger.json
SwaggerParser.validate(input)
  .then(function (api) {
    SwaggerParser.dereference(input)
      .then(function (api) {
        for (var path in api.paths) {
          for (var pathMethod in api.paths[path]) {
            // TODO example
            templateString = ''
            var hit = false
            if (merge === true) {
              // search url+method in 'http in' nodes
              for (var idx in json) {
                if (isHttpInNode(flowId, json[idx]) &&
                    json[idx].url === convertUrl(api.basePath, path) &&
                    json[idx].method === pathMethod) {
                  hit = true

/* FIXME node-red-node-swagger のように 'http in' プロパティ拡張しないと値保持できない
                  // check modify
                  if (json[idx].swaggerString !== JSON.stringify(api.paths[path][pathMethod])) {
                    // add modified comment
                    console.log('modify. [' + json[idx].method + ']' + json[idx].url)
                    json.push(createComment(flowId, 'modify. [' + json[idx].method + ']' + json[idx].url, '', 100, json[idx].y - 25))
                    json[idx].swaggerString = JSON.stringify(api.paths[path][pathMethod])
                  }
*/

                  // remove from apis
                  apis = apis.filter(function (value) {
                    return value !== (json[idx].url + ',' + json[idx].method)
                  })
                  break
                }
              }
            }
            if (hit === false) {
              // add new api comment
              console.log('added. [' + pathMethod + '] ' + convertUrl(api.basePath, path))
              json.push(createComment(flowId, 'added. [' + pathMethod + '] ' + convertUrl(api.basePath, path), '', 100, y - 25))
              createHttpNode(json, flowId, convertUrl(api.basePath, path), pathMethod, JSON.stringify(api.paths[path][pathMethod]), templateString, x, y)
              y += 50
            }
          }
        }
        // check deleted api
        if (merge === true) {
          for (var index in json) {
            if (isHttpInNode(flowId, json[index])) {
              for (var deletedApi in apis) {
                if (apis[deletedApi] === json[index].url + ',' + json[index].method) {
                  // add deleted api comment
                  console.log('deleted. [' + json[index].method + '] ' + json[index].url)
                  json.push(createComment(flowId, 'deleted. [' + json[index].method + '] ' + json[index].url, '', 100, json[index].y - 25))
                  break
                }
              }
            }
          }
        }
        // output
        var jsonstr = JSON.stringify(json, null, 4)
        try {
          fs.writeFileSync(output, jsonstr)
        } catch (err) {
          console.error(err)
          process.exit(2)
        }
        console.log('generate flow success.')
        process.exit(0)
      })
  })
  .catch(function (err) {
    console.error(err)
    process.exit(2)
  })

// functions -------------------------------------------------------------------
function parseArguments (argv) {
  var ArgumentParser = require('argparse').ArgumentParser
  var parser = new ArgumentParser({
    version: '0.0.3',
    addHelp: true,
    description: 'flow generator for Node-RED'
  })
  parser.addArgument(
    [ '-i', '--input' ],
    {
      help: 'swagger.json input',
      required: true
    }
  )
  parser.addArgument(
    [ '-o', '--output' ],
    {
      help: 'flows.json output',
      required: true
    }
  )
  parser.addArgument(
    [ '-f', '--flowName' ],
    {
      help: 'flowName default',
      defaultValue: 'Swagger API'
    }
  )
  parser.addArgument(
    [ '-m', '--merge' ],
    {
      help: 'merge mode',
      action: 'storeTrue'
    }
  )
  var arg = parser.parseArgs()
  return arg
}
function convertUrl (basePath, path) {
  return (basePath + path).replace(/\{[^}]*\}/g, '*')
}
function isHttpInNode (flowId, node) {
  if (node.z === flowId &&
      node.type === 'http in') {
    return true
  }
  return false
}
function createFlowNode (flowName) {
  var flowId = RED.util.generateId()
  var json = {
    'id': flowId,
    'type': 'tab',
    'label': flowName,
    'disabled': false,
    'info': ''
  }
  return json
}
function createComment (flowId, title, detail, x, y) {
  var commentId = RED.util.generateId()
  var json = {
    'id': commentId,
    'type': 'comment',
    'z': flowId,
    'name': title,
    'info': detail,
    'x': x,
    'y': y,
    'wires': []
  }
  return json
}
function createHttpNode (json, flowId, url, method, swaggerString, templateString, x, y) {
  // create http nodes
  var httpInNodeId = RED.util.generateId()
  var templateNodeId = RED.util.generateId()
  var httpResponseNodeId = RED.util.generateId()
  var httpIn = {
    'id': httpInNodeId,
    'type': 'http in',
    'z': flowId,
    'name': '',
    'url': url,
    'method': method,
    'upload': false,
//    'swaggerString': swaggerString, // FIXME
    'x': x,
    'y': y,
    'wires': [ [ templateNodeId ] ]
  }
  var template = {
    'id': templateNodeId,
    'type': 'template',
    'z': flowId,
    'name': '',
    'field': 'payload',
    'fieldType': 'msg',
    'format': 'handlebars',
    'syntax': 'plain',
    'template': templateString,
    'output': 'str',
    'x': x + 200,
    'y': y,
    'wires': [ [ httpResponseNodeId ] ]
  }
  var httpResponse = {
    'id': httpResponseNodeId,
    'type': 'http response',
    'z': flowId,
    'name': '',
    'statusCode': '',
    'headers': {},
    'x': x + 400,
    'y': y,
    'wires': []
  }
  json.push(httpIn, template, httpResponse)
}
