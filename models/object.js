var mongoose = require('mongoose')
  , Action = require('./action.js')
  , Schema = mongoose.Schema
  , ObjectId = Schema.Types.ObjectId;
 
var objectSchema = new Schema({
    name:  String,
    image:  String,
    weight: Number,
    size: {
    	height: Number,
    	width: Number
    },
    actions: [{ type: ObjectId, ref: 'Action' }]
});
 
module.exports = mongoose.model('Object', objectSchema);