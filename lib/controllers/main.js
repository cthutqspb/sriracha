'use strict';

var _ = require('lodash'),
    Doc = require('../models/Document'),
    paginate = require('../utils/paginate');

var url = require('url'),
    querystring = require('querystring');

function handleMessage(session, type, message) {
    session.message[type].push(message);
};

var cookiePrefix = 'sriracha_'
function readCookie(req, name) {
    var value = req.cookies[cookiePrefix + name]
    return (value && /^[a-zA-Z0-9_\.\-]+$/.test(value)) ? value : '';
}
function setCookie(res, name, value) {
    if (!value && value !== 0)
        return;
    res.cookie(cookiePrefix + name, '' + value)
}
module.exports = {
    main: function(req, res, next) {
        res.render('index', {pageId: 'index'});
    },
    collection: function(req, res) {
        var collection = req.params.collection;
        var collections = req.app.locals.collections;
        var collectionNames = req.app.locals.collectionNames;
        var collectionName = collectionNames[collection];
        var Collection = collections[collectionName];

        var perPage = 10
        var page = req.query.page > 0 ? req.query.page : 0

        var sortField = req.query.sortField || readCookie(req, 'sortField');
        var criteria = req.query.criteria || readCookie(req, 'criteria');
        if (!criteria) {
            res.locals.criteria = criteria = 1
        } else {
            res.locals.criteria = criteria = -criteria
        }

        var sort;
        if (sortField) {
            sort = {};
            sort[sortField] = criteria;
            setCookie(res, 'sortField', sortField);
            setCookie(res, 'criteria', -criteria);
        }

        Collection.find({})
            .limit(perPage)
            .skip(perPage * page)
            .sort(sort) // default sorting parameter from options...
            .then(docs => {
              Collection.countDocuments().then(count => {
                    res.render('collection', {
                        pageId: 'collection',
                        docs: docs,
                        Collection: Collection,
                        page: page,
                        pages: count / perPage,
                        paginate: paginate(req, res)
                  }).catch(err => {
                    if(err) handleMessage(req.session, 'error', err.errors)
                  })
              }).catch(err => {})
            })
    },
    doc: function(req, res) {
        var collections = req.app.locals.collections;
        var collection = req.app.locals.collectionNames[req.params.collection];
        var id = req.params.doc;
        var Collection = collections[collection];
        var appPath = req.app.locals.appPath;
        Collection.findById(id).then(doc => {
          doc = Doc(doc, null, collections);
          res.locals.pageId = 'doc';
          switch (req.method) {
              case "GET":
                  if (!doc) {
                      handleMessage(req.session, 'error', "It doesn't look like there is a document with that id.");
                  };
                  res.render('doc', {
                      doc: doc,
                      Collection: Collection,
                      errors: {},
                      id: id
                  });
                  break;
              case "POST":
                  const is_json = req.body['_is_json']
                  delete req.body['_is_json']

                  const parsedBody = is_json ? JSON.parse(req.body['_form_content']) : req.body;

                  Object.keys(parsedBody).forEach(function(path) {
                      var val = parsedBody[path];
                      var type = Collection.getPathType(path);
                      if(typeof val === 'object' && type !== 'array') {
                          Object.keys(val).forEach((v, i) => {
                            doc.set(`${path}.${v}`, val[v])
                          });
                      }
                      if(type === 'array' && !is_json) {
                          val = val.split(',');
                      }


                      doc.set(path, val);

                  });
                  doc.save().then(() => {
                    res.redirect(appPath + '/' + doc.collection.name);
                  }).catch(err => {
                    console.log('error of saving document:', err);
                    err = err || {};
                    res.render('doc', {
                        doc: doc,
                        Collection: Collection,
                        errors: err.errors || {}
                    });
                  })
                  break;
              case "DELETE":
                  doc.deleteOne({}).then(res => {
                    var message = "Doc " + doc.id + " deleted successfully!";
                    handleMessage(req.session, 'success', message);
                    res.redirect(appPath + '/' + doc.collection.name);
                  })
                  .catch(err => {
                    console.error('Error deleting user:', error);
                  });
                  break;
              default:
                  res.render('doc', {
                      doc: doc,
                      Collection: Collection,
                      errors: {}
                  });
          }
        })
    },
    suggest: function(req, res) {
        var data = req.body;

        var collection = req.params.collection;
        var collections = req.app.locals.collections;
        var collectionNames = req.app.locals.collectionNames;
        var collectionName = collectionNames[collection];
        var Collection = collections[collectionName];

        Collection.find(data)
            // .select(Collection + ' id')
            .limit(100)
            .exec().then(docs => {
              return res.json(docs);
            }).catch(err => {})
    },
    newDoc: function(req, res) {
        var collections = req.app.locals.collections;
        var collection = req.app.locals.collectionNames[req.params.collection];
        var id = req.params.doc;
        var Collection = collections[collection];
        var appPath = req.app.locals.appPath;
        var doc = new Collection();
        switch (req.method) {
            case "POST":
                const is_json = req.body['_is_json']
                delete req.body['_is_json']

                const parsedBody = is_json ? JSON.parse(req.body['_form_content']) : req.body;

                Object.keys(parsedBody).forEach(function(path) {
                    var val = parsedBody[path];
                    var type = Collection.getPathType(path);
                    if(typeof val === 'object' && type !== 'array') {
                        Object.keys(val).forEach((v, i) => {
                          doc.set(`${path}.${v}`, val[v])
                        });
                    }

                    if(type === 'array' && !is_json) {
                        val = val.split(',');
                    }

                    doc.set(path, val);

                });
                doc.save().then(() => {
                  handleMessage(req.session, 'success', Collection.modelName + " created successfully!");
                  res.redirect(doc.id);
                }).catch(err => {
                  handleMessage(req.session, 'error', 'There was a problem saving the document!  Try again.');
                  return res.render('doc', {
                      doc: doc,
                      Collection: Collection,
                      errors: err.errors || {}
                  });
                })
                break;
            default:
                // e.g. GET and DELETE
                res.render('doc', {
                    pageId: 'new-doc',
                    doc: doc,
                    Collection: Collection,
                    errors: {},
                    id: id
                });
                break;

        };
    }
}
