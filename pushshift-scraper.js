const axios = require("axios");
const rateLimit = require("axios-rate-limit");
// const markdownLinkExtractor = require("markdown-link-extractor");
const {
  GetCommentsJSON,
  ExtractOPCommentLinks,
  ExtractOProotComments
} = require("./reddit-scraper");
const { AnalyzeScrapes } = require("./profile-analyzer");

const axios_limited = rateLimit(axios.create(), { maxRPS: 60 });
const PushshiftURL = "https://api.pushshift.io/reddit/search/submission";

/**
 * Scrapes api.pushshift.io
 * @returns
 * { array of COMPLETE video profiles scraped,
 *   array of REJECTED video profiles with status }
 *
 * from reddit posts in /r/ChromaProfiles with video in them
 * we use ExtractOPcomments() to find comments made by OP and any links they left,
 * which we assume to be download links
 */
const ScrapePushshift = async ({ from_utc = null, to_utc = null }) => {
  let pushshiftJSON = await GetPushshiftJSON({
    after: from_utc,
    before: to_utc
  });

  console.log("Pushshift Video Results: ", pushshiftJSON.length);

  const postData = pushshiftJSON.map((submission) =>
    ExtractDataFromSubmission(submission)
  );

  /* retrieve comments, all links from comments, and OP's comments in the root of the post in case */
  const dataPromises = postData.map(async (post) => {
    const commentsJSON = await GetCommentsJSON(post.id36);
    const OPcommentLinks = ExtractOPCommentLinks(commentsJSON, post.OP_id);
    const OProotComments = ExtractOProotComments(commentsJSON, post.OP_id);

    return OPcommentLinks || OProotComments
      ? { ...post, OPcommentLinks, OProotComments }
      : post;
  });
  // wait until all promises complete before assigning
  const fullData = await Promise.all(dataPromises); // fullData now has OP links and comments
  const { newProfiles, rejectedProfiles } = await AnalyzeScrapes(fullData);

  return { newProfiles, rejectedProfiles };
};

/**
 *  @returns extracted data from a single pushshift submission
 */
const ExtractDataFromSubmission = (submissionJSON) => {
  const data = submissionJSON;

  const id36 = data?.id;
  const title = data?.title;
  const link = `https://www.reddit.com${data.permalink}`;

  const OP_id = data?.author_fullname; /* find OP */
  const OP = data?.author;

  const reddit_likes = data.score;
  const created_utc = data?.created_utc; // I have a feeling it's not *1000 like reddit
  const scraped_utc = Date.now();

  const DASH_regex = /([A-Z])\w+/g;
  const videoURL = data?.media?.reddit_video?.fallback_url;
  const audioURL = videoURL?.replace(DASH_regex, "DASH_audio");
  const dashURL = data?.dash_url;
  const duration = data?.duration;
  const height = data?.height;
  const width = data?.width;
  const thumbnail = data?.thumbnail;

  const extracted_data = {
    id36,
    title,
    link,
    OP,
    OP_id,
    reddit_likes,
    created_utc,
    scraped_utc,
    videoURL,
    audioURL,
    dashURL,
    duration,
    height,
    width,
    thumbnail
  };

  return extracted_data;
};

/**
 * @returns JSON from api.pushshift.io
 * ... beautifully filtered for video and sorted asc and limited 500 results of JSON :)
 */
const GetPushshiftJSON = async ({ after, before }) => {
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
