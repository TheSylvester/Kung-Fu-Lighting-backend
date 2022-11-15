const Chromaprofile = require("../models/chromaprofile");
const { GetRedditIdsWithToken } = require("./reddit");

const User = require("../models/user");

/**
 * LoginUser
 * Updates an Existing User with new tokens from Reddit or
 * Creates a new User Profile
 * @param { String } id - Reddit id
 * @param { String } name - Reddit name
 * @param { String } snoovatar_img - Reddit snoovatar_img url
 * @param { String } access_token -
 * @param { String } refresh_token -
 * @returns { User } User as stored in DB
 */
async function LoginUser(id, name, snoovatar_img, access_token, refresh_token) {
  const user = await User.findOne({ id }).exec();
  return user
    ? await user
        .updateOne(
          {
            id,
            name,
            snoovatar_img,
            access_token,
            refresh_token,
          },
          {
            returnDocument: "after",
          }
        )
        .exec()
    : // not using upsert 'cause I need to make new users with empty votes
      await User.create({
        id,
        name,
        snoovatar_img,
        access_token,
        refresh_token,
        votes: {},
      });
}

/**
 * Returns a User matching the id and name passed in, or null
 * @param params - Object
 * @returns { KFLUser }
 */
async function GetKFLUser(params) {
  const result = await User.findOne(params).exec(); // User is a MongoDB model using mongoose
  if (!result) throw Error("No User Found in KFL DB");
  return result;
}

/**
 * Locally Vote on a post
 */
async function LocalLikeProfile(id36, value, id) {
  await User.updateOne({ id }, { $set: { [`votes.${id36}`]: value } }).exec();
  await Chromaprofile.updateOne(
    { id36: id36.slice(3) },
    { $inc: { local_likes: value ? 1 : -1 } },
    { returnDocument: "after" }
  );
}

/**
 * Returns a profiles array with a likes property for user's reddit likes
 * or local likes if the post is archived
 * @param { KFLUser } user
 * @param { Chromaprofile[] } profiles
 * @returns { Chromaprofile[] }
 */
const GetLikesAsUser = async (user, profiles) => {
  const GetCSVIdString = (p) => p.map((x) => `t3_${x.id36}`).join(","); // add the t3_ to id36s

  const profileIds = GetCSVIdString(profiles);
  const GetRedditIds = GetRedditIdsWithToken(user.access_token);

  try {
    const redditResponse = await GetRedditIds(profileIds); // full json response

    // creates a likes = { [id36]: likesFromRedditBoolean }
    // likes { [id]: likesFromRedditBoolean  } is based on live redditResponse OR user.votes[id36]
    const likes = redditResponse.data.data.children.reduce((a, b) => {
      return {
        ...a,
        [b.data.id]:
          user.votes.get("t3_" + b.data.id) !== undefined
            ? user.votes.get("t3_" + b.data.id)
            : b.data.likes,
      };
    }, {});

    // merge reddit likes with each profile
    return profiles.map((profile) => {
      profile.likes = likes[profile.id36];
      return profile;
    });
  } catch (e) {
    console.error("GetLikesAsUser", e.message);
    return profiles;
  }
};

module.exports = { LoginUser, GetKFLUser, LocalLikeProfile, GetLikesAsUser };
