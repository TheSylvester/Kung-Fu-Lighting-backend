const mongoose = require("mongoose");
const uniqueValidator = require("mongoose-unique-validator");
const { Schema } = mongoose;

const redditpostSchema = new Schema({
  id36: {
    type: String,
    required: true,
    unique: true,
    minlength: 4,
  },
  title: {
    type: String,
    required: true,
  },
  link: {
    type: String,
    required: true,
  },
  OP: String,
  OP_id: String,
  OPcomments: [String],
  OPcommentLinks: [String],
  archived: Boolean,
  locked: Boolean,
  created_utc: Number,
  scraped_utc: Number,
  score: Number,
  videoURL: String,
  audioURL: String,
  hlsURL: String,
  duration: Number,
  height: Number,
  width: Number,
  thumbnail: String,
  import_status: String,
});

redditpostSchema.plugin(uniqueValidator);

redditpostSchema.set("toJSON", {
  transform: (_document, returnedObject) => {
    returnedObject.id = returnedObject._id?.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

const Redditpost = mongoose.model("Redditpost", redditpostSchema);

module.exports = Redditpost;
