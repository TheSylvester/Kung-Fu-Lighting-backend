const mongoose = require("mongoose");
const uniqueValidator = require("mongoose-unique-validator");
const { Schema } = mongoose;

/**
 * @typedef Redditpost
 * @type { object } - Reddit post internal object
 * @property { string } id36 - Reddit post id
 * @property { string } title - Post title
 * @property { string } link - Link to original reddit post
 * @property {string} OP -
 * @property {string} OP_id -
 * @property {string[]} OPcomments - Comments made by OP
 * @property {Array.<{ link: string, link_status: string }>} OPcommentLinks - All links found in comments made by OP
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
 * @property {string[]}  profiles - mongodb references to the profiles collection
 * @property {string}  import_status -
 */

const redditpostSchema = new mongoose.Schema({
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
  OPcommentLinks: [{ link: String, link_status: String }],
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
  profiles: [{ type: Schema.Types.ObjectId, ref: "Chromaprofile" }],
  import_status: String,
});

redditpostSchema.plugin(uniqueValidator);

redditpostSchema.set("toJSON", {
  transform: (_document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

const Redditpost = mongoose.model("Redditpost", redditpostSchema);

module.exports = Redditpost;
