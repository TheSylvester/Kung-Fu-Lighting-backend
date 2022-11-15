/**
 *  @typedef { Object } PushshiftJSON JSON data from Pushshift.io
 *  @property { string } id - Reddit post id
 *  @property { string } title - Post title
 *  @property { string } permalink - Link to original reddit post
 *  @property { string } author -
 *  @property { string } author_fullname -
 *  @property { number } created_utc -
 *  @property { number } scraped_utc -
 *  @property { number } score -
 */

const axios = require("axios");
const rateLimit = require("axios-rate-limit");
const axios_limited = rateLimit(axios.create(), { maxRPS: 60 });

/** @constant { string } */
const PushshiftURL = "https://api.pushshift.io/reddit/search/submission";
/** @constant { string } */
const subreddit = "chromaprofiles";
/** @constant { string } */
const is_video = "true";
/** @constant { number } */
const size = 100; // max 100 it seems?
/** @constant { string } */
const sort = "asc";
/** @constant { string } */
const sort_type = "created_utc";

/**
 * Fetches data from pushshift.io endpoint
 * GET https://api.pushshift.io/reddit/search/submission?subreddit=chromaprofiles
 * for the subreddit, filtered for video, sorted asc
 * @param { number } [after] - filter for > unix timestamp of created_utc
 * @param { number } [before] - filter for < unix timestamp of created_utc
 * @returns { PushshiftJSON[] } JSON results array from api.pushshift.io
 */
const GetPushshiftPosts = async ({ after, before }) => {
  const response = await axios_limited.get(`${PushshiftURL}`, {
    params: { after, before, subreddit, is_video, size, sort, sort_type },
  });

  return response.data.data; // pushshift returns { "data": [ {..}, {..} ] }
};

/**
 * Fetches ALL data from pushshift.io endpoint until exhausted, no size limit,
 * by repeatedly calling REST endpoint with a moving pointer after = created_utc
 * GET https://api.pushshift.io/reddit/search/submission?subreddit=chromaprofiles
 * for the subreddit, filtered for video, sorted asc
 * @param { number } [after] - filter for > unix timestamp of created_utc
 * @param { number } [before] - filter for < unix timestamp of created_utc
 * @returns { PushshiftJSON[] } JSON results array from api.pushshift.io
 */
const GetAllPushshiftPosts = async ({ after, before }) => {
  let outputJSON = [];
  let jsonArray = null;

  do {
    jsonArray = await GetPushshiftPosts({ after, before });
    if (jsonArray && jsonArray.length > 0) {
      outputJSON = [...outputJSON, ...jsonArray];
      after = jsonArray[jsonArray.length - 1].created_utc;
    }
  } while (jsonArray && jsonArray.length > 0);

  return outputJSON;
};

/**
 *  @param { PushshiftJSON } psJson - Pushshift JSON data for a single object
 *  @returns { Redditpost } - Redditpost mongo schema from a pushshift submission
 */
const PsJsonToRedditpost = (psJson) => {
  const data = psJson;

  return /** @type { Redditpost } */ {
    _id: null,
    id36: data.id,
    title: data.title,
    link: `https://www.reddit.com${data.permalink}`,
    OP: data.author,
    OP_id: data.author_fullname ?? "",
    OPcomments: [],
    OPcommentLinks: [],
    archived: false,
    locked: false,
    created_utc: data?.created_utc,
    scraped_utc: Math.floor(Date.now() / 1000),
    score: Number(data.score) ?? 0,
    videoURL: "",
    audioURL: "",
    dashURL: "",
    duration: 0,
    height: 0,
    width: 0,
    thumbnail: "",
    profiles: [],
    import_status: "NEW",
  };
};

/**
 *  @param { PushshiftJSON[] } psJsons - Pushshift JSON data for a single object
 *  @returns { Redditpost[] } - Redditpost mongo schema from a pushshift submission
 */
const PsJsonsToRedditposts = (psJsons = []) =>
  psJsons.map((x) => PsJsonToRedditpost(x));

/**
 * Fetches ALL data from pushshift.io endpoint until exhausted, no size limit,
 * by repeatedly calling REST endpoint with a moving pointer after = created_utc
 * GET https://api.pushshift.io/reddit/search/submission?subreddit=chromaprofiles
 * for the subreddit, filtered for video, sorted asc
 * @param { number } [after] - filter for > unix timestamp of created_utc
 * @param { number } [before] - filter for < unix timestamp of created_utc
 * @returns { Redditpost[] } Redditpost mongo schema array
 */
const GetAllPushshiftAsReddit = async ({ after, before }) => {
  const allPsJson = await GetAllPushshiftPosts({ after, before });
  console.log(
    `GetAllPushshiftAsReddit ${after ? `after: ${after}` : ""} ${
      before ? `before: ${before}` : ""
    } total: ${allPsJson?.length}`
  );
  return PsJsonsToRedditposts(allPsJson);
};

module.exports = { GetAllPushshiftAsReddit };
