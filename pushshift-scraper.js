const axios = require("axios");
const rateLimit = require("axios-rate-limit");
const Redditpost = require("./models/redditpost");

const axios_limited = rateLimit(axios.create(), { maxRPS: 60 });

const PushshiftURL = "https://api.pushshift.io/reddit/search/submission";

/**
 * Scrapes api.pushshift.io and inserts Redditpostinfo into DB
 * @param { object } options -
 * @param { string } options.from_utc - before
 * @param { string } options.to_utc - after
 * @returns { number } - # of scrapes inserted into DB
 */
const ScrapePushshift = async ({ from_utc = null, to_utc = null }) => {
  const pushshiftJSON = await GetJSONFromPushshift({
    after: from_utc,
    before: to_utc
  });
  console.log("# of Pushshift Video Results: ", pushshiftJSON.length);
  const redditposts = pushshiftJSON.map((submission) =>
    GetRedditpostFromSubmission(submission)
  );
  // filter for unique posts not in DB already
  // const unique_redditposts = await Promise.all(
  //   redditposts.filter(async (post) => {
  //     const retval = !(await Redditpost.findOne({ id36: post.id36 }));
  //     return retval;
  //   })
  // );

  // insertMany(), ordered = false
  let inserted = [];
  try {
    inserted = await Redditpost.insertMany(redditposts, {
      ordered: false
    });
  } catch (e) {
    console.log("InsertMany Error: ", e);
  }

  console.log(
    `Total ${inserted.length} of ${pushshiftJSON.length} unique entries saved`
  );

  return inserted.length;
};

/**
 *  @param { object } submissionJSON - JSON response from Pushshift for a submission
 *  @returns { object } - Redditpost mongo schema from a pushshift submission
 */
const GetRedditpostFromSubmission = (submissionJSON) => {
  const data = submissionJSON;

  const id36 = data.id;
  const title = data.title;
  const link = `https://www.reddit.com${data.permalink}`;
  const OP = data.author;
  const OP_id = data.author_fullname ?? ""; // pushshift doesn't have author_fullname
  const OPcomments = [];
  const OPcommentLinks = [];
  const archived = false; // assume not archived, and update it in details pass
  const locked = false;
  const created_utc = data?.created_utc; // I have a feeling it's not *1000 like reddit
  const scraped_utc = Math.floor(Date.now() / 1000);

  const score = data.score ?? 0;
  const videoURL = "";
  const audioURL = "";
  const dashURL = "";
  const duration = 0;
  const height = 0;
  const width = 0;
  const thumbnail = "";

  const profiles = [];
  const import_status = "NEW"; // [ NEW || COMPLETE || RETRY || DEAD ]

  return {
    id36,
    title,
    link,
    OP,
    OP_id,
    OPcomments,
    OPcommentLinks,
    archived,
    locked,
    created_utc,
    scraped_utc,
    score,
    archived,
    locked,
    videoURL,
    audioURL,
    dashURL,
    duration,
    height,
    width,
    thumbnail,
    profiles,
    import_status
  };
};

/**
 * @param { number } after - unix timestamp of created_utc
 * @returns { object } JSON from api.pushshift.io
 * ... beautifully filtered for video and sorted asc and limited 500 results of JSON :)
 */
const GetJSONFromPushshift = async ({ after, before }) => {
  const subreddit = "chromaprofiles";
  const is_video = "true";
  const size = 100; // max 100 it seems?
  const sort = "asc";
  const sort_type = "created_utc";

  let outputJSON = [];
  let response = null;

  do {
    response = await axios_limited.get(`${PushshiftURL}`, {
      params: { after, before, subreddit, is_video, size, sort, sort_type }
    });
    console.log("Response.data.data.length: ", response.data.data?.length);
    if (response.data.data && response.data.data.length > 0) {
      outputJSON = [...outputJSON, ...response.data.data];
      after = response.data.data[response.data.data.length - 1].created_utc;
    }
  } while (response.data.data && response.data.data.length > 0);

  return outputJSON;
};

exports.ScrapePushshift = ScrapePushshift;
