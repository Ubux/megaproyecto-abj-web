/*
 * Module dependencies
 */
var crypto    = require('crypto')
  , express   = require('express')
  , http      = require('http')
  , fs        = require('fs')
  , mongoose  = require('mongoose')
  , nib       = require('nib')
  , socketio  = require('socket.io')
  , stylus    = require('stylus')
  , mkdirp    = require('mkdirp')
  , rimraf    = require('rimraf')
  , targz     = require('tar.gz')
  , Action    = require('./models/action.js')
  , _Object   = require('./models/object.js')
  , Problem   = require('./models/problem.js');

var SERVERIP = '127.0.0.1';
var app = module.exports = express()
mongoose.connect('mongodb://127.0.0.1/lol');

server = http.createServer(app);
io = socketio.listen(server);

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback () {

});

io.sockets.on('connection', function (socket) {
  socket.on('jointoworkspace', function (problemId) {
    socket.room = problemId;
    socket.join(problemId);
    socket.broadcast.to(problemId).emit('updateworkers', 'Hay un nuevo colaborador.');
    Problem.findOne({id: problemId})
           .populate('objects.object')
           .populate('objects.children.object')
           .populate('conditions.action')
           .exec(function (err, problem) {
                  if (err) return handleError(err);
                  socket.to(problemId).emit('startproblem', JSON.stringify(problem));                  
                });
    
  });
  socket.on('updatebackground', function (backgroundName) {
    Problem.findOne({id: socket.room}, function (err, problem) {
      if (err) return handleError(err);
      problem.background = backgroundName;
      problem.save();
    });

    io.sockets.in(socket.room).emit('updateworkspace', 'background', backgroundName);
    
  });
  socket.on('addobject', function (data) {
    Problem.findOne({id: socket.room}, function (err, problem) {
      if (err) return handleError(err);
      oData = JSON.parse(data);

      _Object.findOne(oData.id, function (err1, object) {
        if (err1) return undefined;
        if(oData.parentKey !== '')
        {
          problem.objects.forEach(function(object, index, array) {
            if(object.key === oData.parentKey)
            {
              object.children.push({ key: oData.key, object: oData.id, position:{ x: 0, y: 0 } });  
              return;
            }
          });
        }else
        {
          problem.objects.push({ key: oData.key, object: oData.id, position:{ x: oData.x, y: oData.y } });  
        }
        
        problem.save();
      });
    });

    io.sockets.in(socket.room).emit('updateworkspace', 'add', data);
  });
  socket.on('moveobject', function (data) {
    
    //socket.room
    Problem.findOne({id: socket.room}, function (err, problem) {
      if (err) return handleError(err);
      oData = JSON.parse(data);

      problem.objects.forEach(function(object, index, array) {
          if(object.key === oData.key)
          {
            object.position.x = oData.x;
            object.position.y = oData.y;
            problem.save();
            return;
          }
      });

    });

    socket.broadcast.to(socket.room).emit('updateworkspace', 'move', data);
  });
  socket.on('removeobject', function (key) {

    Problem.findOne({id: socket.room}, function (err, problem) {
      if (err) return handleError(err);

      problem.objects.forEach(function(object, index, array) {
          if(object.key === key)
          {
            object.remove();
            problem.save();
            return;
          }
      });
    });
    io.sockets.in(socket.room).emit('updateworkspace', 'remove', key);
  });
  socket.on('addcondition', function (data) {

    Problem.findOne({id: socket.room})
           .populate('conditions.action')
           .exec(function (err, problem) {
      if (err) return handleError(err);
      oData = JSON.parse(data);

      Action.findOne({_id: oData.actionId}, function (err1, action) {
        if (err1) return undefined;
        problem.conditions.push({ objectName: oData.objectName, action: action, value: oData.value });  
        problem.save();

        io.sockets.in(socket.room).emit('updateworkspace', 'updateconditions', JSON.stringify(problem.conditions));
      });
    });
  });
  socket.on('removecondition', function (data) {
    Problem.findOne({id: socket.room})
           .populate('conditions.action')
           .exec(function (err, problem) {
      if (err) return handleError(err);

      oData = JSON.parse(data);

      problem.conditions.forEach(function(condition, index, array) {
          if(condition.objectName === oData.objectName && condition.action.id === oData.actionId)
          {
            condition.remove();
            problem.save();

            io.sockets.in(socket.room).emit('updateworkspace', 'updateconditions', JSON.stringify(problem.conditions));
            return;
          }
      });
    });
    
  });
  socket.on('completed', function () {
    socket.broadcast.to(socket.room).emit('completed');
  });
});

function compile(str, path) {
  return stylus(str)
    .set('filename', path)
    .use(nib())
}
app.set('views', __dirname + '/views')
app.set('view engine', 'jade')
app.use(express.logger('dev'))
app.use(stylus.middleware(
  { src: __dirname + '/public'
  , compile: compile
  }
))
app.use(express.static(__dirname + '/public'))
app.use(express.bodyParser());

app.get('/problems', function (req, res) {
  Problem.find({})
       .sort({name: 'asc'})
       .skip(0)
       .limit(4)
       .exec(function (err, problems) {
          if (err) return handleError(err);
            console.log(problems.length);
            res.render('problems', { title: 'Lista de problemas', problems: problems })                
        });
})
app.get('/problems/find/:pageNumber', function (req, res) {
  Problem.find({})
         .sort({name: 'asc'})
         .skip(4 * (req.params.pageNumber - 1))
         .limit(4)
         .exec(function (err, problems) {
            if (err) return handleError(err);
              console.log(problems.length);
              res.render('problemRow', { problems: problems })                
          });
})
app.get('/workspace', function (req, res) {
  res.render('menu');
})
app.get('/workspace/:problemId', function (req, res) {
  res.render('workspace', {problemId: req.params.problemId, serverIP: SERVERIP});
})
app.get('/problems/create/:name', function (req, res){
  var name = req.params.name;
  var now = new Date();
  var id = crypto.createHash('md5').update(name).update(now.toTimeString()).digest('hex');
  var problem = new Problem({ id: id, name: name });

  problem.save(function (err) {
  if (err) return console.log(err);
    Problem.findById(problem, function (err, doc) {
      if (err) return handleError(err);
      res.redirect('/workspace/'+doc.id)
    })
  });
})
app.post('/problems/completed/:problemId', function (req, res){
  var problemId = req.params.problemId;
  Problem.findOne({ id: problemId })
         .populate('objects.object')
         .populate('objects.children.object')
         .populate('conditions.action')
         .exec(function (err, problem) {
                if (err) return handleError(err);
                var dirName = './tmp/'+problemId;
                var baseFileName = "./private/python/problem.py";
                var background = problem.background;
                var strBackground = "\n\n\t\tself.setBackgound('imagenes/background/" + background + "')"
                var strObjects = "";
                var strConditions = "";
                var strElements = "";

                //Llena datos para finalizar el problema
                var problemName = req.body.name.replace(/ /g, '_').toLowerCase();
                var fileName = problemName + ".py";
                var problemDescription = req.body.description;
                var problemTags = req.body['hidden-tags'];
                var strDescription = '\n\n\t\tdesc = """<h1>' + problemName + '</h1><br /><p width=\'400\'>' + problemDescription + '</p>"""';

                problem.name = problemName;
                problem.description = problemDescription;
                problem.tags = problemTags;
                problem.completed = true;

                problem.save();


                for( var i = 0; i < problem.objects.length; i++ ){
                  var object = problem.objects[i];
                  var objectPosition = object.position;
                  var objectName = object.object.name;
                  var lowerObjectName = objectName.toLowerCase();

                  if(objectName.match(/heroe/g))
                  {

                    strObjects += "\n\n\t\thero = "+ objectName +"('')" + 
                                  "\n\t\thero.vaciar()" +
                                  "\n\t\thero.setImagen('imagenes/heroe.png')" +
                                  "\n\t\thero.setPostura(0)" +
                                  "\n\t\thero.setX(" + objectPosition.x + ")" +
                                  "\n\t\thero.setY(" + objectPosition.y + ")";

                  }else if(object.children.length == 0)
                  {
                    strObjects += "\n\n\t\t" + lowerObjectName + " = "+ objectName +"('" + lowerObjectName + "')" + 
                                  "\n\t\t" + lowerObjectName + ".setPosicion([" + objectPosition.x + ", " + objectPosition.y + "])";

                    strElements += (strElements == ""?"":", ") + "'" + lowerObjectName + "': " + lowerObjectName;
                  }else
                  {
                    var children = object.children;
                    var strChildren = "";

                    for( var ii = 0; ii < object.children.length; ii++ ){
                      var child = object.children[ii];
                      var childName = child.object.name;
                      var lowerChildName = childName.toLowerCase();

                      strObjects += "\n\n\t\t" + lowerChildName + " = "+ childName +"('" + lowerChildName + "')";
                      strChildren += (strChildren == ""?"":", ") + "'" + lowerChildName + "': " + lowerChildName;
                    }

                    strObjects += "\n\n\t\t" + lowerObjectName + " = "+ objectName +"('" + lowerObjectName + "', 10, {" + strChildren + "})" + 
                                  "\n\t\t" + lowerObjectName + ".setPosicion([" + objectPosition.x + ", " + objectPosition.y + "])";

                    strElements += (strElements == ""?"":", ") + "'" + lowerObjectName + "': " + lowerObjectName;
                  }
                }

                for( var i = 0; i < problem.conditions.length; i++ ){
                  var condition = problem.conditions[i];
                  var action = condition.action;
                  var objectName = condition.objectName;
                  var value = condition.value;

                  if(action.type === "container")
                  {
                    strConditions += "\n\n\t\tif not self.cumpleContieneNombre(objects['" + objectName + "'], '" + value + "'):" +
                                    "\n\t\t\ttor.append('" + value + " no se encuentra en " + objectName + ".')";

                  }else if(action.type === "boolean")
                  {
                    strConditions += "\n\n\t\tif not self.cumpleProp(objects['" + objectName + "'], '" + action.methodName + "', " + value + "):" +
                                    "\n\t\t\ttor.append('" + objectName + (value === "False"?"":" no") + " se encuentra " + action.name + ".')";
                  }
                }

                mkdirp(dirName, function (err) {
                    if (err) console.error(err)
                    writeBackgroundStream = fs.createWriteStream(dirName+'/'+background);
                    readBackgroundStream = fs.createReadStream('./public/images/background/'+background);
                    readBackgroundStream.pipe(writeBackgroundStream);

                    writeStream = fs.createWriteStream(dirName+'/'+fileName, { flags : 'w' });
                    readStream = fs.createReadStream(baseFileName, {
                        flags: 'r',
                        encoding: 'utf-8',
                        fd: null,
                        bufferSize: 1
                      });

                    line ='';

                    readStream.addListener('data', function (char) {
                        readStream.pause();
                        if(char == '\n'){
                            (function(){
                              
                              if(line.match(/@@objects/g))
                              {
                                line = strObjects;
                              }else if(line.match(/@@background/g))
                              {
                                line = strBackground;
                              }else if(line.match(/@@conditions/g))
                              {
                                line = strConditions;
                              }else if(line.match(/@@problemDescription/g))
                              {
                                line = strDescription;
                              }

                              if(line.match(/@@problemName/g))
                              {
                                line = line.replace(/@@problemName/g, problemName);  
                              }

                              if(line.match(/@@elements/g))
                              {
                                line = line.replace(/@@elements/g, strElements);  
                              }

                              writeStream.write(line);
                              line = '';
                              readStream.resume();
                            })();
                        }
                        else{
                            line += char;
                            readStream.resume();
                        }
                    });

                    readStream.addListener('end', function (char) {
                        writeStream.end();
                        var compress = new targz().compress(dirName, './public/problems/'+problemId+'.tar.gz', function(err){
                                                                if(err)
                                                                    console.log(err);
                                                                console.log('The compression has ended!');

                                                                rimraf(dirName, function(err){
                                                                  console.log('Delete directory!');
                                                                });
                                                                
                                                            });
                    });
                });       
              });
    res.redirect('/problems');
})
app.get('/objects/:pageNumber/:pageSize', function (req, res){
  var from = req.params.pageNumber * req.params.pageSize;
  var to = (req.params.pageNumber + 1) * req.params.pageSize;
  var query = _Object.find({}).skip(from).limit(to);
  query.exec(function (err, objects) {
    if (err) return handleError(err);
    res.send(JSON.stringify(objects));
  });
})
//Rutas solo para llenar datos
app.get('/actions/create/:name/:methodName/:type', function (req, res)
{
  var action = new Action({ name: req.params.name, methodName: req.params.methodName, type: req.params.type });
  action.save(function (err) {
  if (err) return console.log(err);
    Action.findById(action, function (err, doc) {
      if (err) return handleError(err);
      res.send(JSON.stringify(doc));
    })
  })
  
})
app.get('/objects/create/:name/:image/:height/:width', function (req, res)
{
  var object = new _Object({ name: req.params.name, image: req.params.image, size: {height: req.params.height, width: req.params.width }});
  object.save(function (err) {
  if (err) return console.log(err);
    _Object.findById(object, function (err, doc) {
      if (err) return handleError(err);
      res.send(JSON.stringify(doc));
    })
  })
  
})
app.get('/object/update/:id', function (req, res)
{
  _Object.findOne({_id: req.params.id}, function (err, object) {
      if (err) return handleError(err);
      object.size.height = object.size.height / 2;
      object.size.width = object.size.width / 2;
      object.save();
      res.send(JSON.stringify(object));
  });
  
})
app.get('/object/addAction/:objectId/:actionId', function (req, res)
{
  _Object.findOne({_id: req.params.objectId}, function (err, object) {
      if (err) return handleError(err);
      Action.findOne({_id: req.params.actionId}, function (err, action) {
        object.actions.push(action);
        object.save();
        res.send(JSON.stringify(object));
      });      
  });
  
})
app.get('/object/findAllActions/:id', function (req, res)
{
  _Object.findOne({_id: req.params.id})
         .populate('actions')
         .exec(function (err, object) {
      if (err) return handleError(err);
      res.send(JSON.stringify(object.actions));     
  });
})
app.post('/upload', function (req, res) {
  if(req.xhr) {
    console.log('Uploading...');
    var fileName = req.header('x-file-name');
    var now = new Date();
    fileName = crypto.createHash('md5').update(fileName).update(now.toTimeString()).digest('hex')+'.jpg';

    var content = '';
    req.setEncoding("binary");

    req.addListener('data', function(chunk) {
        content += chunk;
    });

    req.addListener('end', function() {
        fs.writeFile('./public/images/background/'+fileName, content, "binary", function (err) {
            res.writeHead(200, {'content-type': 'text/plain'});
            res.end(fileName);
        });
    });

  }
})

app.post('/problem/prueba/zas', function (req, res) {

  res.redirect('/problems');
})

server.listen(80)