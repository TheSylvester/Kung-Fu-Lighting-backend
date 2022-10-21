const mongoose = require("mongoose");
const uniqueValidator = require("mongoose-unique-validator");
const { Schema } = mongoose;

/**
 * @typedef { Object } KFLUser
 * @property { String } id
 * @property { String } name
 * @property { String } access_token
 * @property { String } refresh_token
 * @property { String } snoovatar_img
 * @property { Map } votes
 */

const userSchema = new Schema({
  id: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  access_token: String,
  refresh_token: String,
  snoovatar_img: String,
  votes: { type: Map, of: Boolean },
});

userSchema.plugin(uniqueValidator);

const User = mongoose.model("User", userSchema);

module.exports = User;
