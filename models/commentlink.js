const mongoose = require("mongoose");
const { Schema } = mongoose;

// This is just a table of links
// more than 1 profile link on a reddit post?

/**
 * @typedef { Object } CommentLink
 * @property { ObjectId } _id - ObjectId
 * @property { ObjectId } redditpost_id - Object ID of the reddit post I got this link from
 * @property { string } original_link - raw URL from original comment
 * @property { string } link_type - GOOGLE | DIRECT-DL | MEDIAFIRE | NEW
 * @property { string } link_status - IMPORTED | REJECTED | NEW
 */

const commentlinkSchema = new Schema({
  redditpost_id: { type: Schema.Types.ObjectId, ref: "Redditpost" },
  original_link: String,
  link_type: String,
  link_status: String,
});

commentlinkSchema.set("toJSON", {
  transform: (_document, returnedObject) => {
    returnedObject.id = returnedObject?._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

const Commentlink = mongoose.model("Commentlink", commentlinkSchema);

module.exports = Commentlink;
