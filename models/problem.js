var mongoose = require('mongoose') 
  , _Object = require('./object.js')
  , Schema = mongoose.Schema
  , ObjectId = Schema.Types.ObjectId;
 
 var objectSchema = new Schema({
    key: String,
    object: { type: ObjectId, ref: 'Object' },
    position: {
    	x: Number,
    	y: Number
    }
});

var problemSchema = new Schema({
	id: String,
    name:  String,
    background:  String,
    objects: [objectSchema]
});
 
module.exports = mongoose.model('Problem', problemSchema);