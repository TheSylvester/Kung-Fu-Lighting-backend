const mongoose = require("mongoose");

const chromaprofileSchema = new mongoose.Schema({
  id36: {
    type: String,
    required: true,
    minlength: 4
  },
  title: {
    type: String,
    required: true,
    minlength: 3
  },
  link: {
    type: String,
    required: true
  },
  OP: String,
  OP_id: String,
  reddit_likes: Number,
  created_utc: Number,
  scraped_utc: Number,
  videoURL: String,
  audioURL: String,
  thumbnail: String,
  OPcommentLinks: [{ type: String }],
  OProotComments: [{ type: String }]
});

chromaprofileSchema.set("toJSON", {
  transform: (_document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  }
});

module.exports = mongoose.model("Chromaprofile", chromaprofileSchema);
