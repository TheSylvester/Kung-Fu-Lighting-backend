/**
 * this is the Database Manager
 * responsible for handling all interactions with the MongoDB
 */

/**
 * @typedef {import("mongoose").Document} MongoDocument
 */

const Redditpost = require("../models/redditpost");
const Commentlink = require("../models/commentlink");
const Chromaprofile = require("../models/chromaprofile");

/**
 * UpsertRedditpost
 * Insert or Update a Redditpost if same id36 to MongoDB if possible,
 * returns the Redditpost now
 * @param { Redditpost } post
 * @returns { Redditpost } the newly inserted or updated Redditpost
 */
const UpsertRedditpost = async (post) => {
  // check if id36 we are trying to insert is already in the database
  const {
    // destructure from redditpost in post passed in
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
  } = post;

  const doc = await Redditpost.findOneAndUpdate({ id36 }, post, {
    upsert: true,
    returnDocument: "after",
  }).exec();

  const redditFieldsToInject = {
    // destructured from redditpost in DB
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
    profile_status: post.import_status === "DELETED" ? "DELETED" : "OK",
  };

  // Check if we also need to update a Chromaprofile
  const updatedChromaprofile = await Chromaprofile.findOneAndUpdate(
    { id36 },
    redditFieldsToInject,
    { returnDocument: "after" }
  ).exec();
  if (updatedChromaprofile)
    console.log("updatedChromaprofile: ", updatedChromaprofile);

  // returns a Redditpost Object, instead of mongoose document
  console.log("UpsertRedditpost: ", doc);
  return doc.toObject();
};

/**
 * UpdateRedditpostsAsDone
 * Updates the import_status of Redditposts as DONE
 * @param { Redditpost[] } redditposts
 */
const UpdateRedditpostsAsDone = async (redditposts) => {
  await Promise.all(
    redditposts.map(async (redditpost) => {
      await Redditpost.findOneAndUpdate(
        { id36: redditpost.id36 },
        { import_status: "DONE" }
      );
    })
  );
};

/**
 * Returns all Redditposts in KFL marked import_status: NEW | UPDATED
 * @returns { Redditpost[] }
 */
const GetUnProcessedRedditposts = async () => {
  /** @type { MongoDocument } */
  const docs = await Redditpost.find({
    $or: [{ import_status: "NEW" }, { import_status: "UPDATED" }],
  }).exec();
  return docs.map((x) => x.toObject());
};

/**
 * Live Redditposts are any posts with import_status: NEW, OK, UPDATED (!DELETED)
 * @returns { Redditpost[] }
 */
const GetLiveRedditposts = async () => {
  /** @type { MongoDocument } */
  const docs = await Redditpost.find({
    $and: [
      {
        $or: [
          { import_status: "DONE" },
          { import_status: "NEW" },
          { import_status: "UPDATED" },
        ],
      },
      { archived: false },
    ],
  }).exec();
  return docs.map((x) => x.toObject());
};

/**
 * InsertManyRedditposts
 * @param { Redditpost[] } posts
 * @returns { Array } Inserted posts
 */
const InsertManyRedditposts = async (posts) => {
  let inserted = [];
  try {
    inserted = await Redditpost.insertMany(posts, {
      ordered: false,
    });
  } catch (e) {
    console.log("InsertManyRedditposts MongoDB Error: ", e);
  }

  console.log(
    `Total ${inserted.length} of ${posts.length} unique entries saved`
  );
  return inserted;
};

/**
 * ### InsertCommentLink ###
 * Validates that there are no two posts sharing the same redditpost_id
 * @param { CommentLink } commentlink
 * @returns { boolean } true on success
 */
const InsertCommentLink = async (commentlink) => {
  const found = await Commentlink.findOne({
    $and: [
      {
        original_link: commentlink.original_link,
      },
      { redditpost_id: commentlink.redditpost_id },
    ],
  }).exec();
  // guard clause
  if (found) return null;

  /** @type {MongoDocument} */
  const newCommentlink = new Commentlink(commentlink);
  const doc = await newCommentlink.save();

  /** logging */
  console.log("Inserted: ", commentlink);

  return !!doc; // true if we got something
};

/**
 * ### InsertManyCommentLinks ###
 * Validates that there are no two posts sharing the same redditpost_id
 * @param { CommentLink[] } links
 * @returns { number } Inserted links
 */
const InsertManyCommentLinks = async (links) => {
  /** @type { boolean[] } */
  const writeResults = await Promise.all(
    links.map(async (link) => await InsertCommentLink(link))
  );
  const nInserted = writeResults.filter(Boolean).length; // trick to find all truth values

  console.log(`Total ${nInserted} of ${links.length} unique links saved`);
  return nInserted;
};

/**
 * ### UpdateCommentLink ###
 * @param { CommentLink } updatedLink
 * @returns { boolean } true on success
 */
const UpdateCommentLink = async (updatedLink) => {
  const result = await Commentlink.findByIdAndUpdate(
    updatedLink._id,
    updatedLink
  ).exec();
  /** logging */
  // console.log("UpdateCommentLink findByIdAndUpdate ", result.toObject());
  return !!result;
};

/**
 * ### GetLatestRedditpostUTC ###
 * - Goes through the Redditpost Collection in MongoDB,
 * returns the latest created_utc in Redditpost
 *
 * @returns { number }
 */
const GetLatestRedditpostUTC = async () => {
  // find the newest post in DB by its created_utc
  /** @type array */
  const newestDocuments = await Redditpost.find({})
    .sort({ created_utc: -1 })
    .limit(1)
    .exec();

  // ESCAPE (guard clause): Redditpost is empty or returned nothing
  if (newestDocuments === null || newestDocuments.length < 1) {
    console.log("Redditpost empty or MongoDB issue");
    return 0;
  }

  // return the created_utc of the first object in the newestDocuments array
  const newestDoc = newestDocuments.shift();
  const obj = newestDoc.toObject();
  return obj.created_utc;
};

/**
 * ### InsertChromaprofile ###
 * - populate the redditpost duplicated parts
 * @param { Chromaprofile } newProfileStub - either a full Chromaprofile or a Stub
 * @return { boolean } true on success
 */
const InsertChromaprofile = async (newProfileStub) => {
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
  /** @type { Redditpost } */
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
};

/**
 * ### GetNewCommentLinks ###
 * Retrieves all CommentLink[] in KFL with link_status: NEW or RETRY
 * @returns { CommentLink[] }
 */
const GetNewCommentLinks = async () => {
  /** @type { MongoDocument } */
  const commentLinks = await Commentlink.find({
    $or: [{ link_status: "NEW" }, { link_status: "RETRY" }],
  }).exec();
  return commentLinks.map((x) => x.toObject());
};

/**
 *
 * @param { Chromaprofile } newProfileStub
 * @param { Redditpost } redditpost
 * @returns { Chromaprofile }
 */
const InflateChromaprofile = (newProfileStub, redditpost) => {
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
};

/**
 * profiles
 *---------------------
 * GET /api/profiles
 * returns chroma profiles
 *
 * @param props.id36 - Default: N/A - id36's - Returns specific profiles by id36
 * @param props.after - Default: N/A - Return results created [from] after this created_UTC
 * @param props.before - Default: N/A - Return results created [to] before this created_UTC
 *
 * @param props.author - Default: N/A - Return results filtered by author
 * @param props.devices - Default: N/A - Return results filtered by devices
 * @param props.colours - Default: N/A - Return results filtered by colours (exact)
 * @param props.effects - Default: N/A - Return results filtered by effects
 *
 * @param props.score_above - Default: N/A - Return results with score above this
 * @param props.score_below - Default: N/A - Return results with score below this
 *
 * @param props.sort_order - Default: "desc" - Sort results in a specific order (Accepted: "asc", "desc")
 * @param props.sort_by - Default: "created_utc" - property to sort by (Accepted: "created_utc", "score", "author", "title")
 * @param props.skip - Default: 0 - Number of results to skip for pagination purposes
 * @param props.limit - Default: 25 - Number of results to return
 *
 * @returns profiles - Array of Chromaprofiles
 */
const GetChromaprofiles = async (props) => {
  // we start with "only posts that are import_status: "OK" and populate profiles
  const matchDefault = { $match: { profile_status: "OK" } };
  // props.ids
  const matchId36 = props.id36
    ? {
        $match: {
          id36: { $in: [].concat(props.id36) },
        },
      }
    : null;
  // props.after
  const matchAfter = props.after
    ? { $match: { created_utc: { $gte: Number(props.after) } } }
    : null;
  // props.before
  const matchBefore = props.before
    ? { $match: { created_utc: { $lte: Number(props.before) } } }
    : null;

  // props.author
  const matchAuthor = props.author ? { $match: { OP: props.author } } : null;
  // props.devices
  const matchDevices = props.devices
    ? {
        $match: {
          "lightingeffects.devices": { $in: [].concat(props.devices) },
        },
      }
    : null;
  // props.colours
  const matchColours = props.colours
    ? {
        $match: {
          "lightingeffects.colours": { $in: [].concat(props.colours) },
        },
      }
    : null;
  // props.effects
  const matchEffects = props.effects
    ? {
        $match: {
          "lightingeffects.effects": { $in: [].concat(props.effects) },
        },
      }
    : null;

  // props.matchScore_above/below
  const { sign, score } = props.score_above
    ? { sign: "$gte", score: Number(props.score_above) }
    : props.score_below
    ? { sign: "$lte", score: Number(props.score_below) }
    : { sign: null, score: null };
  const matchScore = sign ? { $match: { score: { [sign]: score } } } : null;

  // props.sort_order
  const sort_order = { asc: 1, desc: -1 }[props.sort_order ?? "desc"] || 1;
  // props.sort_by
  const sort = ((sort_type) => {
    const sortable_types = ["created_utc", "score"];
    const type = sortable_types.includes(sort_type ?? "")
      ? sort_type
      : "created_utc";

    return { $sort: { [type]: sort_order } };
  })(props.sort_by);
  // props.skip
  const skip = props.skip ? { $skip: Number(props.skip) } : null;
  // props.limit
  const limit = {
    $limit: props.limit ? Number(props.limit) : 25,
  };

  let aggregation = [
    matchDefault,
    matchId36,
    matchAfter,
    matchBefore,
    matchAuthor,
    matchDevices,
    matchColours,
    matchEffects,
    matchScore,
    sort,
    skip,
    limit,
  ].filter(Boolean);

  console.log(aggregation);

  // get profiles from db
  return await Chromaprofile.aggregate(aggregation);
};

exports.InsertManyRedditposts = InsertManyRedditposts;
exports.UpsertRedditPost = UpsertRedditpost;
exports.GetLatestRedditpostUTC = GetLatestRedditpostUTC;
exports.GetUnProcessedRedditposts = GetUnProcessedRedditposts;
exports.GetLiveRedditposts = GetLiveRedditposts;
exports.UpdateRedditpostsAsDone = UpdateRedditpostsAsDone;
exports.InsertManyCommentLinks = InsertManyCommentLinks;
exports.UpdateCommentLink = UpdateCommentLink;
exports.GetNewCommentLinks = GetNewCommentLinks;
exports.InsertChromaprofile = InsertChromaprofile;
exports.GetChromaprofiles = GetChromaprofiles;
