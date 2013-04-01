/*
 * Module dependencies
 */
var express = require('express')
  , stylus = require('stylus')
  , nib = require('nib')
  , mongoose = require('mongoose')
  , http = require('http')
  , socketio = require('socket.io')
  , Action = require('./models/action.js')
  , _Object = require('./models/object.js')
  , Problem = require('./models/problem.js');

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
    socket.room = '123456';
    socket.join('123456');
    socket.broadcast.to('123456').emit('updateworkers', 'Hay un nuevo colaborador.');
  });
  socket.on('addobject', function (data) {
    io.sockets.in(socket.room).emit('updateworkspace', 'add', data);
  });
  socket.on('moveobject', function (data) {
    socket.broadcast.to('123456').emit('updateworkspace', 'move', data);
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

app.get('/', function (req, res) {
  res.render('index',
  { title : 'Home' }
  )
})
app.get('/workspace', function (req, res) {
  res.render('workspace');
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

server.listen(80)