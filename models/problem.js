var mongoose = require('mongoose')
  , Schema = mongoose.Schema;
 
var problemSchema = new Schema({
    name:  String,
    background:  String
});
 
module.exports = mongoose.model('Problem', problemSchema);