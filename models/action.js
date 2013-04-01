var mongoose = require('mongoose')
  , Schema = mongoose.Schema;
 
var actionSchema = new Schema({
    name:  String
});
 
module.exports = mongoose.model('Action', actionSchema);