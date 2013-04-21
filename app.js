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
  , Action    = require('./models/action.js')
  , _Object   = require('./models/object.js')
  , Problem   = require('./models/problem.js');

var SERVERIP = '127.0.0.1';
var app = module.exports = express()
mongoose.connect('mongodb://localhost/lol');

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
    Problem.findOne(problemId)
           .populate('objects.object')
           .populate('objects.children.object')
           .exec(function (err, problem) {
                  if (err) return handleError(err);
                  //problem.objects[0].remove();
                  //problem.objects[0].remove();
                  //problem.save();
                  socket.to(problemId).emit('startproblem', JSON.stringify(problem));                  
                });
    
  });
  socket.on('updatebackground', function (backgroundName) {

    Problem.findOne(socket.room, function (err, problem) {
      if (err) return handleError(err);
      problem.background = backgroundName;
      problem.save();
    });

    io.sockets.in(socket.room).emit('updateworkspace', 'background', backgroundName);
    
  });
  socket.on('addobject', function (data) {

    Problem.findOne(socket.room, function (err, problem) {
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
    Problem.findOne(socket.room , function (err, problem) {
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

    Problem.findOne(socket.room, function (err, problem) {
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

app.get('/problems', function (req, res) {
  res.render('problems',
  { title : 'Lista de problemas' }
  )
})
app.get('/problems/find/:pageNumber', function (req, res) {
  res.render('zas')
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
app.get('/actions/create/:name', function (req, res)
{
  var action = new Action({ name: req.params.name });
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

server.listen(80)