/**
 * @typedef { Object } Redditpost
 * @property { ObjectId } _id - Object id
 * @property { string } id36 - Reddit post id
 * @property { string } title - Post title
 * @property { string } link - Link to original reddit post
 * @property {string} OP -
 * @property {string} OP_id -
 * @property {string[]} OPcomments - Comments made by OP
 * @property {string[]} OPcommentLinks - All links found in comments made by OP
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
 * @property {string}  import_status -
 */

/**
 * @typedef { Object } RedditJSON
 * @property { string } id - Reddit post id
 * @property { string } title - Post title
 * @property { string } selftext - selftext of redditpost
 * @property { string } permalink - Link to original reddit post
 * @property { string } author - OP's Readable Name
 * @property { string } author_fullname - OP's t2_id36
 * @property { number } score - current reddit up/down vote score
 * @property { boolean } archived -
 * @property { boolean } locked -
 * @property { string } thumbnail -
 * @property { { reddit_video: {
 *  fallback_url: string,
 *  duration: number,
 *  hls_url: string,
 *  height: number,
 *  width: number }}} media - reddit media object containing video properties
 */

/**
 * @typedef { Object } CommentsJSON
 * @property { CommentData } data - the data inside a comment
 */

/**
 * @typedef { Object } CommentData
 * @property { string } body -
 * @property { string } author_fullname -
 * @property { string } body -
 * @property { Object[] } replies -
 */

const axios = require("axios");
const rateLimit = require("axios-rate-limit");
const markdownLinkExtractor = require("markdown-link-extractor");
const axios_limited = rateLimit(axios.create(), { maxRPS: 60 });
/** @constant {string} */
const ChromaProfilesURL = "http://www.reddit.com/r/ChromaProfiles";

/**
 * @param { RedditJSON } redditJson - post details JSON
 * @param { CommentsJSON[] } commentsJson - array of raw reddit-format comments
 * @returns { Redditpost }
 */
const RedditJSONtoRedditpost = (redditJson, commentsJson) => {
  const data = redditJson;
  const DASH_regex = /([A-Z])\w+/g;

  const /** @type { ObjectId } */ _id = null;

  const id36 = data.id;
  const title = data.title;
  const link = `https://www.reddit.com${data.permalink}`;
  const OP = data.author;
  const OP_id = data.author_fullname;
  const archived = data.archived;
  const locked = data.locked;

  const /** @type { number } */ created_utc = data?.created_utc; // I have a feeling it's not *1000 like reddit
  const /** @type { number } */ scraped_utc = Math.floor(Date.now() / 1000);

  const score = data.score;
  const /** @type { string } */ thumbnail =
      data?.thumbnail === "default" ? "" : data?.thumbnail;

  const reddit_video = data?.media?.reddit_video;
  const {
    hls_url: hlsURL,
    fallback_url: videoURL,
    /** @type { number } */ duration,
    /** @type { number } */ height,
    /** @type { number } */ width,
  } = reddit_video
    ? reddit_video
    : { hlsURL: null, videoURL: null, duration: 0, height: 0, width: 0 };
  const audioURL = videoURL?.replace(DASH_regex, "DASH_audio");

  /** deal with OPcomments and OPcommentLinks */
  const OPcomments = GetOPcommentsFromJSON(commentsJson, OP_id);
  const OPcommentLinks = GetLinksFromComments(OPcomments);

  // tests whether post has been deleted based on jsonData
  function isDeletedPost(jsonData) {
    const string = jsonData.selftext;
    return /\[deleted]/i.test(string) || /\[removed]/i.test(string);
  }

  // if the redditpost is deleted (
  const import_status = isDeletedPost(data) ? "DELETED" : "NEW";

  /** logging here */
  console.log(
    `${id36}: ${title} by ${OP}\n`,
    ` reddit: ${link} thumbnail ${thumbnail}\n`,
    OPcommentLinks
  );

  return /** @type { Redditpost } */ {
    _id,
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
    videoURL,
    audioURL,
    hlsURL,
    duration,
    height,
    width,
    thumbnail,
    import_status,
  };
};

/**
 * Retrieves the JSON from Reddit for a post by its id36
 * @param { string } id36 - id36 of the post to retrieve
 * @returns {{ postDetails: RedditJSON, commentsJSON: Array }}
 * - postDetails: post stuff
 * - commentsJSON: comments stuff
 */
const GetJSONFromRedditId = async (id36) => {
  const response = await axios_limited.get(
    `${ChromaProfilesURL}/comments/${id36}.json`
  );

  const postDetailsJSON = response.data[0].data.children[0].data;
  const commentsJSON = response.data[1].data.children;

  return { postDetailsJSON, commentsJSON };
};

/**
 * Extracts an array of all comments made by OP
 * recursively finds replies in children
 * @param { CommentsJSON[] } commentsJSON - array of raw reddit-format comments from GetJSONFromPost().commentsJSON
 * @param { string } OP_id - id of the OP (author_fullname)
 * @returns { string[] } strings of comments made by the OP
 */
const GetOPcommentsFromJSON = (commentsJSON, OP_id) => {
  let OPcomments = [];
  // loops through each comment
  // finds the fulltext of the comment
  commentsJSON.forEach((comment) => {
    if (comment.data.author_fullname === OP_id || !OP_id) {
      // save non-empty comment body, and check for replies
      const commentBody = comment.data.body;
      OPcomments.push(commentBody);
    }
    // recurse for children if there are replies
    if (comment.data.replies) {
      const childCommentsList = GetOPcommentsFromJSON(
        comment.data.replies.data.children,
        OP_id
      );
      if (childCommentsList) {
        OPcomments = OPcomments.concat(childCommentsList);
      }
    }
  });
  return OPcomments;
};

/**
 * Extracts an array of links from array of markdown comment strings
 * @param { string[] } comments - array of Strings of reddit comments (in markdown)
 * @returns { string[] } - array of links found in the comments
 */
const GetLinksFromComments = (comments) => {
  let links = [];
  comments.forEach((comment) => {
    const extracted_links = comment ? ExtractLinksFromMD(comment) : [];
    if (extracted_links.length > 0) links = links.concat(extracted_links);
  });

  return [...new Set(links)]; // unique links only enforced by Set
};

/**
 * Extracts Markdown links from reddit comment written in markdown
 * @param { string } comment - comment with Markdown text and possibly links
 * @returns { Array } links - href of the links
 */
const ExtractLinksFromMD = (comment) => {
  const { links } = markdownLinkExtractor(comment, true); // extended output to get raw md to filter out
  if (!links) return null;
  return links.map((link) => link.href);
};

/**
 * Retrieves a Redditpost from reddit via id36
 * includes OPcomments and OPcommentLinks
 * @param { string } id36 - id36 of the post to retrieve
 * @returns { Redditpost }
 */
const GetRedditpostFromRedditId = async (id36) => {
  const { postDetailsJSON, commentsJSON } = await GetJSONFromRedditId(id36);
  return RedditJSONtoRedditpost(postDetailsJSON, commentsJSON);
};

/**
 * Get the latest version of each post from Reddit
 * @param { Redditpost[] } posts Array of Redditposts that we want updated
 * @return { Redditpost[] } updated posts
 */
const GetUpdatedRedditposts = async (posts) => {
  return await Promise.all(
    posts.map(async (post) => {
      const updated = await GetRedditpostFromRedditId(post.id36);
      return { ...post, ...updated, _id: post._id };
    })
  );
};

exports.GetJSONFromRedditId = GetJSONFromRedditId;
exports.RedditJSONtoRedditpost = RedditJSONtoRedditpost;
exports.GetOPcommentsFromJSON = GetOPcommentsFromJSON;
exports.GetRedditpostFromRedditId = GetRedditpostFromRedditId;
exports.GetUpdatedRedditposts = GetUpdatedRedditposts;
