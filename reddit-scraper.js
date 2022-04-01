const axios = require("axios");
const markdownLinkExtractor = require("markdown-link-extractor");

const ChromaProfilesURL = "http://www.reddit.com/r/ChromaProfiles";

const GetRedditJSON = async (limit = 25, after = null) => {
  const limitString = `?limit=${limit}`;
  const pagination = `&after=${after}`;
  const response = await axios.get(
    `${ChromaProfilesURL}.json${limitString + (after ? pagination : "")}`
  );
  return response.data;
};

const GetCommentsJSON = async (id36) => {
  const response = await axios.get(
    `${ChromaProfilesURL}/comments/${id36}.json`
  );
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

  const returnLinks = OPcommentLinks.map((link) => ConvertGDriveLink(link));

  return returnLinks;
};

const ConvertGDriveLink = (link) => {
  /************************************************************************
   * Receives a url (for a google drive link) and returns a download link
   *
   * (?:https:\/\/drive.google.com\/file\/d\/)(.*)(?:\/view\?usp=sharing)
   ************************************************************************/

  const gdrive_regex =
    /(?:https:\/\/drive\.google\.com\/file\/d\/)(.*)(?:\/view\?usp=sharing)/gi;
  const match = gdrive_regex.exec(link);

  if (!match) return link; // short circuit link

  const fileID = match[1]; // match[1] will be the 1st capture group (.*)
  const downloadURL = `https://drive.google.com/uc?id=${fileID}&export=download`;

  return downloadURL;
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
  const created_utc = data?.created_utc;
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
exports.GetRedditJSON = GetRedditJSON;
exports.MakeGoogleDriveLinkDownloadable = ConvertGDriveLink;
