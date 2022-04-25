const axios = require("axios");
const rateLimit = require("axios-rate-limit");
const markdownLinkExtractor = require("markdown-link-extractor");

const axios_limited = rateLimit(axios.create(), { maxRPS: 60 });

const ChromaProfilesURL = "http://www.reddit.com/r/ChromaProfiles";

const ScrapeReddit = async (limit = 25, after = null) => {
  /*
   * Scrapes Reddit json and returns
   * { array of COMPLETE video profiles scraped,
   *   array of REJECTED video profiles with status
   *   last t3 value used in scraping for pagination purposes }
   *
   * from reddit posts in /r/ChromaProfiles with video in them
   * we find comments made by OP and any links they left,
   * which we assume to be download links
   */

  let redditJSON = await GetRedditJSON(limit, after);

  /* reddit provides 'after' (last t3_id36 in the list) as a
   * bookmark for you to pass back in for pagination */
  const last = redditJSON?.data?.after;

  let videoPosts = redditJSON.data.children.filter(
    (post) => post.data.is_video
  );

  if (!videoPosts || videoPosts.length === 0)
    return { newProfiles: [], rejectedProfiles: [], last }; /* early exit */

  const postData = videoPosts.map((post) => ExtractDataFromPost(post));

  // map with async callbacks return promises
  // as the return value is yet unknown at the time of assignment
  const dataPromises = postData.map(async (post) => {
    /* retrieve comments, all links from comments, and OP's comments in the root of the post in case */
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

  /* chromaprofiles.insertMany(newProfiles.filterunique())
   * rejectedprofiles.insertMany(rejectedProfiles.filterunique()); */

  return { newProfiles, rejectedProfiles, last };
};

const GetRedditJSON = async (limit = 25, after = null) => {
  const response = await axios_limited.get(`${ChromaProfilesURL}.json`, {
    params: { limit, after }
  });
  // console.log("GetRedditJSON headers: ", response.headers);
  return response.data;
};

const GetCommentsJSON = async (id36) => {
  const response = await axios_limited.get(
    `${ChromaProfilesURL}/comments/${id36}.json`
  );
  // console.log("GetCommentsJSON headers: ", response.headers);
  const arrayOfPosts = response.data[1].data.children;
  return arrayOfPosts;
};

const ExtractOProotComments = (comments, OP = null) => {
  let OPcomments = [];

  comments.forEach((comment) => {
    if (!OP || comment.data.author_fullname === OP) {
      OPcomments.push(comment.data.body);
    }
  });

  return OPcomments;
};

const Extract_MarkdownLinkExtractor = (comment) => {
  const { links } = markdownLinkExtractor(comment, true); // extended output to get raw md to filter out

  if (!links) return { raw: [], href: [] };

  const raw = links.map((link) => link.raw);
  const href = links.map((link) => link.href);

  return { raw, href };
};

const ExtractOPCommentLinks = (comments, OP = null) => {
  /*****************************************************
   * accepts raw json comments listing t1_ from reddit
   * Extract with markdown-link-extractor
   *****************************************************/

  let OPcommentLinks = [];

  comments.forEach((comment) => {
    if (!OP || comment.data.author_fullname === OP) {
      const commentBody = comment.data.body;

      const { raw, href } = Extract_MarkdownLinkExtractor(commentBody);

      if (href.length > 0) {
        href.forEach((link) => OPcommentLinks.push(link));
      }
    }

    /* recursively search comment replies */
    if (comment.data.replies) {
      const childCommentsList = ExtractOPCommentLinks(
        comment.data.replies.data.children,
        OP
      );
      if (childCommentsList) {
        OPcommentLinks = OPcommentLinks.concat(childCommentsList);
      }
    }
  });

  // const returnLinks = OPcommentLinks.map((link) => ConvertGDriveLink(link));
  // const unique_returnLinks = [...new Set(returnLinks)];
  const unique_returnLinks = [...new Set(OPcommentLinks)];

  return unique_returnLinks;
};

const ConvertGDriveLink = (url) => {
  /************************************************************************
   * Receives a url (for a google drive link) and returns a download link
   * (?:https:\/\/drive.google.com\/file\/d\/)(.*)(?:\/view\?usp=sharing)
   * (?:https:\/\/drive\.google\.com\/open\?id=)(.*)$
   *
   * OLD downloadURL = `https://drive.google.com/uc?id=${fileId}&export=download`
   * Google API downloadURL = `https://www.googleapis.com/drive/v3/files/${fileId}`;
   ************************************************************************/

  const gdrive_regexs = [
    /(?:https:\/\/drive\.google\.com\/file\/d\/)(.*)(?:\/view)/gi,
    /(?:https:\/\/drive\.google\.com\/open\?id=)(.*)$/gi
  ];

  let returnLink = url;

  for (const regex of gdrive_regexs) {
    returnLink = (function (link, regex) {
      const match = regex.exec(link);
      if (!match) return link; // early return link is not a g drive link, returns unaltered

      const fileId = match[1]; // match[1] will be the 1st capture group (.*)
      const downloadURL = `https://drive.google.com/uc?id=${fileId}&export=download`;
      return downloadURL;
    })(returnLink, regex);
  }

  return returnLink;
};

const ExtractDataFromPost = (postJSON) => {
  /*
   *  Extract data from a single t3 article
   */
  const data = postJSON?.data;

  const name_regex = /^t3_/g;
  const name = data?.name;
  const id36 = name?.replace(name_regex, "");
  const title = data.title;
  const link = `https://www.reddit.com${data.permalink}`;

  const OP_id = data?.author_fullname; /* find OP */
  const OP = data?.author;

  const reddit_likes = data?.ups - data?.downs;
  const created_utc = data?.created_utc * 1000;
  const scraped_utc = Date.now();

  const DASH_regex = /([A-Z])\w+/g;
  const videoURL = data?.media?.reddit_video?.fallback_url;
  const audioURL = videoURL?.replace(DASH_regex, "DASH_audio");
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
    thumbnail
  };

  return extracted_data;
};

const ScrapeRedditForProfiles = async (limit = 25, after = null) => {
  /*
   * Scrapes Reddit json and returns an array of profiles
   * from reddit posts in /r/ChromaProfiles with video in them
   * we find comments made by OP and any links they left,
   * which we assume to be download links
   */

  let profilesArray = [];
  let redditJSON = await GetRedditJSON(limit, after);

  const last =
    redditJSON?.data
      ?.after; /* reddit provides after (last t3_id36 in the list) for easy pagination */

  let videoPosts = redditJSON.data.children.filter(
    (post) => post.data.is_video
  );

  /* get non-video posts too for inspection, save everything I guess */
  let nonvideoPosts = redditJSON.data.children.filter(
    (post) => !post.data.is_video
  );

  if (!videoPosts || videoPosts.length === 0)
    return { profilesArray: [], last }; /* early exit */

  const postData = videoPosts.map((post) => ExtractDataFromPost(post));

  const dataPromises = postData.map(async (post) => {
    const commentsJSON = await GetCommentsJSON(post.id36);
    const OPcommentLinks = ExtractOPCommentLinks(commentsJSON, post.OP_id);
    const OProotComments = ExtractOProotComments(commentsJSON, post.OP_id);

    // map with async function returns promises
    return OPcommentLinks || OProotComments
      ? { ...post, OPcommentLinks, OProotComments }
      : post;
  });
  // wait until all promises complete before assigning
  const fullData = await Promise.all(dataPromises);

  profilesArray = [...profilesArray, ...fullData];

  return { profilesArray, last, nonvideoPosts };
};

exports.ScrapeRedditForProfiles = ScrapeRedditForProfiles;
exports.GetCommentsJSON = GetCommentsJSON;
exports.ExtractOPCommentLinks = ExtractOPCommentLinks;
exports.ExtractOProotComments = ExtractOProotComments;
