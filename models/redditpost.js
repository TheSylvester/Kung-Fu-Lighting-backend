const mongoose = require("mongoose");
const uniqueValidator = require("mongoose-unique-validator");
const { Schema } = mongoose;

const redditpostSchema = new mongoose.Schema({
  id36: {
    type: String,
    required: true,
    unique: true,
    minlength: 4
  },
  title: {
    type: String,
    required: true
  },
  link: {
    type: String,
    required: true
  },
  OP: String,
  OP_id: String,
  OPcomments: [String],
  OPcommentLinks: [{ link: String, link_status: String }],
  archived: Boolean,
  locked: Boolean,
  created_utc: Number,
  scraped_utc: Number,
  score: Number, // ADD FROM HERE
  videoURL: String,
  audioURL: String,
  dashURL: String,
  duration: Number,
  height: Number,
  width: Number,
  thumbnail: String, // TO HERE
  profiles: [{ type: Schema.Types.ObjectId, ref: "Chromaprofile" }], // ADD THIS
  import_status: String
});

redditpostSchema.plugin(uniqueValidator);

redditpostSchema.set("toJSON", {
  transform: (_document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  }
});

const Redditpost = mongoose.model("Redditpost", redditpostSchema);

module.exports = Redditpost;
