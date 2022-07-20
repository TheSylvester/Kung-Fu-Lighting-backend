const mongoose = require("mongoose");
const { Schema } = mongoose;

/**
 * @typedef { Object } Chromaprofile
 * @property { ObjectId } _id - Object ID of self
 * @property { ObjectId } commentlink_id - Object ID of the original Commentlink that generated this profile
 * @property { string } download_link - User downloadable URL, whatever new url archived
 * @property { number } local_likes - non-reddit likes
 * @property { Lightingeffect[] } lightingeffects - all lighting effects found in the file
 * @property { Array<{ tag: string, description: string }> } tags - Tags i.e. {tag: "featured"}
 * @property { string }  profile_status - OK, DELETED_REDDIT, DELETED_PROFILE
 * ** DUPLICATED FIELDS **
 * @property { ObjectId } redditpost_id - *NEW* Object ID of the original Redditpost that generated this profile
 * @property { string } id36 - Reddit post id
 * @property { string } title - Post title
 * @property { string } link - Link to original reddit post
 * @property {string} OP -
 * @property {string} OP_id -
 * @property {boolean}  archived -
 * @property {boolean}  locked -
 * @property {number}  created_utc -
 * @property {number}  scraped_utc -
 * @property {number}  score -
 * @property {string}  videoURL -
 * @property {string}  audioURL -
 * @property {string}  hlsURL -
 * @property {number}  duration -
 * @property {number}  height -
 * @property {number}  width -
 * @property {string}  thumbnail -
 */

/**
 * @typedef { Object } Lightingeffect
 * @property { string } name - the name that shows up when you import into Razer
 * @property { string[] } devices - devices listed inside Lightingeffect
 * @property { string[] } colours - colours listed inside Lightingeffect
 * @property { string[] } effects - effects listed inside Lightingeffect
 */

const chromaprofileSchema = new mongoose.Schema({
  commentlink_id: { type: Schema.Types.ObjectId, ref: "Commentlink" },
  local_likes: Number,
  download_link: String,
  lightingeffects: [
    {
      name: String,
      devices: [String],
      colours: [String],
      effects: [String],
    },
  ],
  profile_status: String,
  tags: [
    {
      tag: String,
      description: String,
    },
  ],
  // DUPLICATED FIELDS
  redditpost_id: { type: Schema.Types.ObjectId, ref: "Redditpost" },
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
});

chromaprofileSchema.set("toJSON", {
  transform: (_document, returnedObject) => {
    returnedObject.id = returnedObject._id?.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

const Chromaprofile = mongoose.model("Chromaprofile", chromaprofileSchema);

module.exports = Chromaprofile;
