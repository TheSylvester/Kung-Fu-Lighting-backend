const mongoose = require("mongoose");
const { Schema } = mongoose;

const chromaprofileSchema = new mongoose.Schema({
  redditpost: { type: Schema.Types.ObjectId, ref: "Redditpost" },
  link: String,
  name: String,
  devices: [String],
  colours: [String],
  effects: [String],
});

chromaprofileSchema.set("toJSON", {
  transform: (_document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

const Chromaprofile = mongoose.model("Chromaprofile", chromaprofileSchema);

module.exports = Chromaprofile;
