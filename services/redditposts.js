const Redditpost = require("../models/redditpost");
const Chromaprofile = require("../models/chromaprofile");

/**
 * UpdateRedditpostsAsDone
 * Updates the import_status of Redditposts as DONE
 * @param { Redditpost[] } redditposts
 */
async function UpdateRedditpostsAsDone(redditposts) {
  await Promise.all(
    redditposts.map(async (redditpost) => {
      await Redditpost.findOneAndUpdate(
        { id36: redditpost.id36 },
        { import_status: "DONE" }
      );
    })
  );
}

/**
 * UpsertRedditpost
 * Insert or Update a Redditpost if same id36 to MongoDB if possible,
 * returns the Redditpost now
 * @param { Redditpost } post
 * @returns { Redditpost } the newly inserted or updated Redditpost
 */
async function UpsertRedditpost(post) {
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

  // update a Chromaprofile
  await Chromaprofile.findOneAndUpdate({ id36 }, redditFieldsToInject, {
    returnDocument: "after",
  }).exec();
  // if (updatedChromaprofile)
  //   console.log("updatedChromaprofile: ", updatedChromaprofile);

  // returns a Redditpost Object, instead of mongoose document
  // console.log("UpsertRedditpost: ", doc);
  return doc.toObject();
}

/**
 * Returns all Redditposts in KFL marked import_status: NEW | UPDATED
 * @returns { Redditpost[] }
 */
async function GetUnProcessedRedditposts() {
  /** @type { MongoDocument } */
  const docs = await Redditpost.find({
    $or: [{ import_status: "NEW" }, { import_status: "UPDATED" }],
  }).exec();
  return docs.map((x) => x.toObject());
}

/**
 * InsertManyRedditposts
 * @param { Redditpost[] } posts
 * @returns { Array } Inserted posts
 */
async function InsertManyRedditposts(posts) {
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
}

/**
 * ### GetLatestRedditpostUTC ###
 * - Goes through the Redditpost Collection in MongoDB,
 * returns the latest created_utc in Redditpost
 *
 * @returns { number }
 */
async function GetLatestRedditpostUTC() {
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
}

/**
 * Live Redditposts are any posts with import_status: NEW, OK, UPDATED (!DELETED)
 * @returns { Redditpost[] }
 */
async function GetLiveRedditposts() {
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
}

module.exports = {
  UpdateRedditpostsAsDone,
  InsertManyRedditposts,
  UpsertRedditpost,
  GetLatestRedditpostUTC,
  GetUnProcessedRedditposts,
  GetLiveRedditposts,
};
