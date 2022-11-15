const Chromaprofile = require("../models/chromaprofile");
const Redditpost = require("../models/redditpost");

/**
 * @type {number} - Default limit of number of profiles to show
 */
const DEFAULT_LIMIT = 25;
const SORT_BY_TYPES = ["created_utc", "score"];
const POTM_COUNT = 6;

/**
 * Finds the top scoring Chromaprofile created_UTC in the month previous
 * adds Tag
 * Finds the same Tag anywhere else in Chromaprofiles and removes that tag
 * @returns { Promise<Chromaprofile[]> }
 */
async function TagFeaturedProfiles() {
  console.log("### TagFeaturedProfiles started ", new Date().toLocaleString());
  // Newest Profile
  await RemoveAllTags({ tag: "featured", description: "Newest Profile" });
  const latest = await GetLatestProfile();
  const tagged_latest = await AddTagToProfile(
    latest.id36,
    "featured",
    "Newest Profile"
  );

  // POTM
  await RemoveAllTags({ tag: "featured", description: "Profile of the Month" }); // reset

  // to find the POTM in the month / year indicated by the timestamp
  async function GetPOTM(year, month) {
    const firstOfMonthTimestamp = Math.floor(new Date(year, month, 1) / 1000);
    const endOfMonthTimestamp = Math.floor(new Date(year, month + 1, 1) / 1000); // 1st of next month, actually
    return await GetChromaprofiles({
      after: firstOfMonthTimestamp,
      before: endOfMonthTimestamp,
      sort_by: "score",
      limit: 1,
    });
  }

  // find the POTM that is from minimum one month before timestamp
  async function FindLastPOTMFrom(timestamp) {
    let result = [];
    let i = 1;

    while (result.length === 0) {
      let date = new Date(timestamp);
      result = await GetPOTM(date.getFullYear(), date.getMonth() - i);
      i++;
    }
    return result[0];
  }

  async function FindPOTMs(startTimestamp, count) {
    let POTMs = [];
    for (let i = 0; i < count; i++) {
      POTMs.push(
        await FindLastPOTMFrom(
          i === 0 ? startTimestamp : POTMs[i - 1].created_utc * 1000
        )
      );
    }
    return POTMs;
  }

  // actually tag the POTMs
  async function TagPOTM(profile) {
    const GetMonthName = (dt) =>
      new Date(dt).toLocaleString("en-us", { month: "long" });
    return await AddTagToProfile(
      profile.id36,
      "featured",
      "Profile of the Month " + GetMonthName(profile.created_utc * 1000)
    );
  }

  // now we can actually get and tag all the POTMs
  const POTMs = await FindPOTMs(latest.created_utc * 1000, POTM_COUNT);
  let tagged_potm = [];
  for (let p of POTMs) {
    tagged_potm.push(await TagPOTM(p));
  }

  // Highest Rated Profile Ever
  await RemoveAllTags({ tag: "featured", description: "Highest Rated Ever" });
  const goatProfiles = await GetChromaprofiles({
    sort_by: "score",
    limit: 1,
  });
  const tagged_goat = await AddTagToProfile(
    goatProfiles[0].id36,
    "featured",
    "Highest Rated Ever"
  );

  return [tagged_latest, ...tagged_potm, tagged_goat];
}

/**
 * ### InsertChromaprofile ###
 * - populate the redditpost duplicated parts
 * @param { Chromaprofile } newProfileStub - either a full Chromaprofile or a Stub
 * @return { boolean } true on success
 */
async function InsertChromaprofile(newProfileStub) {
  const { commentlink_id, redditpost_id } = newProfileStub;

  // Detect duplicate - where the commentlink_id or redditpost_id already exists
  const found = await Chromaprofile.findOne({
    $or: [
      {
        commentlink_id: commentlink_id,
      },
      { redditpost_id: redditpost_id },
    ],
  });
  if (found) {
    // DO NOT INSERT due to duplicate?
    console.log("^^ InsertChromaprofile Duplicate Found @ ", found);
    return false;
  }

  // Cache the redditpost duplicated fields from info already in DB via redditpost_id
  // this is to save two $lookups
  /** @type { Redditpost, MongoDocument } */
  const redditpost = await Redditpost.findById(redditpost_id).exec();
  // guard clause
  if (!redditpost) {
    console.log("%% parent redditpost not found %%");
    return false;
  }
  // adds the retrieved redditpost info to the newProfile
  const newProfile = InflateChromaprofile(newProfileStub, redditpost);

  /** @type { MongoDocument } */
  const profile = new Chromaprofile(newProfile);
  const result = await profile.save();
  console.log("InsertChromaprofile result: ", result);
  return !!result;
}

/**
 *
 * @param { Chromaprofile } newProfileStub
 * @param { Redditpost } redditpost
 * @returns { Chromaprofile }
 */
function InflateChromaprofile(newProfileStub, redditpost) {
  const {
    // destructure from redditpost in DB
    id36,
    title,
    link,
    OP,
    OP_id,
    archived,
    locked,
    created_utc,
    scraped_utc,
    score,
    videoURL,
    audioURL,
    hlsURL,
    duration,
    height,
    width,
    thumbnail,
    import_status,
  } = redditpost;

  return {
    ...newProfileStub,
    id36,
    title,
    link,
    OP,
    OP_id,
    archived,
    locked,
    created_utc,
    scraped_utc,
    score,
    videoURL,
    audioURL,
    hlsURL,
    duration,
    height,
    width,
    thumbnail,
    profile_status: import_status === "DELETED" ? "DELETED" : "OK",
  };
}

/**
 * profiles
 *---------------------
 * GET /api/profiles
 * returns chroma profiles
 *
 * -----------------------
 * Can MongoDB tell me the actual # of valid found items even if the # is over the LIMIT
 * @param props.access_token Default: "" - Attempts to get "likes"
 *
 * @param props.id36 - Default: N/A - id36's - Returns specific profiles by id36
 * @param props.after - Default: N/A - Return results created [from] after this created_UTC
 * @param props.before - Default: N/A - Return results created [to] before this created_UTC
 *
 * @param props.all - Default: N/A - SPECIAL Search for name OR title OR author
 *
 * @param props.author - Default: N/A - Search for author
 * @param props.title - Default: N/A - Search for reddit post title ("description" in chroma gallery)
 * @param props.profileName - Default: N/A - Search for profile name
 * @param props.devices[] - Default: N/A - Search for devices
 * @param props.colours[] - Default: N/A - Search for colours (exact)
 * @param props.effects[] - Default: N/A - Search for effects
 *
 * @param props.tag - Default: N/A - Search for tag
 *
 * @param props.score_above - Default: N/A - Return results with score above this
 * @param props.score_below - Default: N/A - Return results with score below this
 *
 * @param props.sort_order - Default: "desc" - Sort results in a specific order (Accepted: "asc", "desc")
 * @param props.sort_by - Default: "created_utc" - property to sort by (Accepted: "created_utc", "score", "author", "title")
 * @param props.skip - Default: 0 - Number of results to skip for pagination purposes
 * @param props.limit - Default: 100 - Number of results to return
 *
 * @returns { Chromaprofile[] } - Array of Chromaprofiles
 */
async function GetChromaprofiles(props) {
  // we start with "only posts that are import_status: "OK" and populate profiles
  const matchDefault = { $match: { profile_status: "OK" } };

  const matchOrNull = (fn, input) => {
    return input ? fn(input) : null;
  };

  // props.ids
  const matchId36 = (id36) => ({
    $match: { id36: { $in: [].concat(id36) } },
  });
  // props.after
  const matchAfter = (after) => ({
    $match: { created_utc: { $gte: Number(after) } },
  });
  // props.before
  const matchBefore = (before) => ({
    $match: { created_utc: { $lte: Number(before) } },
  });
  // props.author
  const matchAuthor = (author) => ({
    $match: { OP: { $regex: author, $options: "i" } },
  });
  // props.title
  const matchTitle = (title) => ({
    $match: { title: { $regex: title, $options: "i" } },
  });
  // props.profileName
  const matchName = (profileName) => ({
    $match: {
      "lightingeffects.name": { $regex: profileName, $options: "i" },
    },
  });
  const matchAll = (all) => ({
    $match: {
      $or: [
        { OP: { $regex: all, $options: "i" } },
        { title: { $regex: all, $options: "i" } },
        { "lightingeffects.name": { $regex: all, $options: "i" } },
      ],
    },
  });
  // props.devices
  const matchDevices = (devices) => ({
    $match: {
      "lightingeffects.devices": { $all: [].concat(devices) },
    },
  });
  // props.colours
  const matchColours = (colours) => ({
    $match: {
      "lightingeffects.colours": { $in: [].concat(colours) },
    },
  });
  // props.effects
  const matchEffects = (effects) => ({
    $match: {
      "lightingeffects.effects": { $in: [].concat(effects) },
    },
  });
  //props.tag
  const matchTag = (tag) => ({
    $match: { "tags.tag": tag },
  });
  //props.score_above
  const matchScoreAbove = (score) => ({
    $match: { score: { $gte: Number(score) } },
  });
  //props.score_below
  const matchScoreBelow = (score) => ({
    $match: { score: { $lte: Number(score) } },
  });
  // props.sort_by, props.sort_order
  const sort = (sort_by = "created_utc", sort_order = "desc") => ({
    $sort: {
      [SORT_BY_TYPES.includes(sort_by) ? sort_by : "created_utc"]:
        sort_order === "asc" ? 1 : -1,
    },
  });
  // props.skip
  const skip = (skip) => ({ $skip: Number(skip) });
  // props.limit
  const limit = (limit = DEFAULT_LIMIT) => ({
    $limit: Number(limit),
  });

  let aggregation = [
    matchDefault,
    matchOrNull(matchId36, props?.id36),
    matchOrNull(matchAfter, props?.after),
    matchOrNull(matchBefore, props?.before),
    matchOrNull(matchAll, props?.all),
    matchOrNull(matchAuthor, props?.author),
    matchOrNull(matchTitle, props?.title),
    matchOrNull(matchName, props?.profileName),
    matchOrNull(matchDevices, props?.devices),
    matchOrNull(matchColours, props?.colours),
    matchOrNull(matchEffects, props?.effects),
    matchOrNull(matchTag, props?.tag),
    matchOrNull(matchScoreAbove, props?.score_above),
    matchOrNull(matchScoreBelow, props?.score_below),
    sort(props?.sort_by, props?.sort_order),
    matchOrNull(skip, props?.skip),
    limit(props?.limit),
  ].filter(Boolean);

  return await Chromaprofile.aggregate(aggregation);
}

async function GetDevicesAndEffects() {
  const results = await Chromaprofile.aggregate([
    {
      $facet: {
        devices: [
          { $unwind: "$lightingeffects" },
          { $unwind: "$lightingeffects.devices" },
          { $group: { _id: "$lightingeffects.devices" } },
        ],
        effects: [
          { $unwind: "$lightingeffects" },
          { $unwind: "$lightingeffects.effects" },
          { $group: { _id: "$lightingeffects.effects" } },
        ],
      },
    },
  ]);

  const devices = results[0].devices.map((obj) => obj._id).sort();
  const effects = results[0].effects.map((obj) => obj._id).sort();

  return { devices, effects };
}

async function GetFeaturedProfiles() {
  return await GetChromaprofiles({ tag: "featured", limit: 20 });
}

/**
 * Finds a profile by its id36 and adds a tag to its tags[]
 * @param { string } id36
 * @param { string } tag
 * @param { string } description
 * @returns { Promise<Chromaprofile> }
 */
async function AddTagToProfile(id36, tag, description) {
  return await Chromaprofile.findOneAndUpdate(
    { id36 },
    {
      $addToSet: { tags: { tag, description } },
    },
    { returnDocument: "after" }
  );
}

/**
 * Returns the latest created_utc Chromaprofile
 * @returns { Chromaprofile }
 */
async function GetLatestProfile() {
  /** @type Chromaprofile[] */
  const latest_results = await GetChromaprofiles({ limit: 1 });
  return Array.isArray(latest_results) ? latest_results[0] : null;
}

/**
 * Finds all tags with the tag and description and updates their tags away
 * @param { {[tag=""]: string, [description=""]: string } } props
 * @returns { Chromaprofile }
 */
async function RemoveAllTags({ tag, description }) {
  return await Chromaprofile.updateMany(
    {},
    {
      $pull: {
        tags: {
          tag,
          description: { $regex: description },
        },
      },
    },
    { returnDocument: "after" }
  );
}

async function IsRedditpostLocked(id36) {
  try {
    const /** @type Chromaprofile */ result = (
        await Chromaprofile.findOne({ id36: id36.slice(3) }).exec()
      ).toObject();
    return Boolean(result.archived || result.locked);
  } catch (e) {
    console.log(`IsRedditpostLocked() failed with ${e.message}`);
    return true;
  }
}

module.exports = {
  TagFeaturedProfiles,
  GetFeaturedProfiles,
  GetDevicesAndEffects,
  InsertChromaprofile,
  GetChromaprofiles,
  GetLatestProfile,
  AddTagToProfile,
  IsRedditpostLocked
};
