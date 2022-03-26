const mongoose = require("mongoose");

// const extracted_data = {
//     id36,
//     title,
//     link,
//     OP,
//     OP_id,
//     reddit_likes,
//     videoURL,
//     audioURL
//   };

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
  reddit_likes: String,
  videoURL: String,
  audioURL: String
});

chromaprofileSchema.set("toJSON", {
  transform: (_document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  }
});

module.exports = mongoose.model("ChromaProfile", chromaprofileSchema);
