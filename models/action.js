var mongoose = require('mongoose')
  , Schema = mongoose.Schema;
 
var actionSchema = new Schema({
    name: String,
    methodName: String,
    type: String
});
 
module.exports = mongoose.model('Action', actionSchema);