const axios = require("axios");
const rateLimit = require("axios-rate-limit");
const markdownLinkExtractor = require("markdown-link-extractor");

const axios_limited = rateLimit(axios.create(), { maxRPS: 60 });
const ChromaProfilesURL = "http://www.reddit.com/r/ChromaProfiles";

const Redditpost = require("./models/redditpost");
const Chromaprofile = require("./models/chromaprofile");

const { AnalyzeLink } = require("./profile-analyzer");

/**
 * Retrieves the json from Reddit for a post by its id36
 * @param { String } id36 - id36 of the post to retrieve
 * @returns { Object } data - return object
 * @returns { Object } data.postDetails - full JSON details of the post
 * @returns { Array } data.commentsArray - Comments attached to the post
 */
const GetJSONFromPost = async (id36) => {
  const response = await axios_limited.get(
    `${ChromaProfilesURL}/comments/${id36}.json`
  );

  const postDetailsJSON = response.data[0].data.children[0].data;
  const commentsJSON = response.data[1].data.children;

  return { postDetailsJSON, commentsJSON };
};

/**
 * Extracts an array of all comments made by OP
 * recursively finds children
 * @param { Array } commentsJSON - array of raw reddit-format comments from GetJSONFromPost().commentsJSON
 * @param { String } OP - id of the OP (author_fullname)
 * @returns { Array } strings of comments made by the OP
 */
const GetOPcomments = (commentsJSON, OP) => {
  let OPcomments = [];
  // loops through each comment
  // finds the fulltext of the comment
  commentsJSON.forEach((comment) => {
    if (comment.data.author_fullname === OP || !OP) {
      // save non-empty comment body, and check for replies
      const commentBody = comment.data.body;
      OPcomments.push(commentBody);
    }
    // recurse for children if there are replies
    if (comment.data.replies) {
      const childCommentsList = GetOPcomments(
        comment.data.replies.data.children,
        OP
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
 * @param { Array } comments - array of Strings of reddit comments (in markdown)
 * @returns { Array } - array of links found in the comments
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
 * Extracts markdown links from reddit comment written in markdown
 * @param { string } comment - comment with markdown text and possibly links
 * @returns { Array } links - href of the links
 */
const ExtractLinksFromMD = (comment) => {
  const { links } = markdownLinkExtractor(comment, true); // extended output to get raw md to filter out
  if (!links) return null;
  const href = links.map((link) => link.href);
  if (href?.length > 0) console.log(`Extracted LINK: ${href}`);
  return href;
};

/**
 * Checks the Redditpostinfo Database for NEW posts via import_status
 * @returns { Array } NEW | RETRY scrapes in the DB
 */
const GetUnprocessedPostsFromDB = async () => {
  // tell Mongoose that all I need is a plain JavaScript version of the returned doc by using lean()
  const posts = await Redditpost.find({
    $or: [{ import_status: "NEW" }, { import_status: "RETRY" }],
  })
    .lean()
    .exec();
  return posts;
};

/**
 * GET from Reddit an update, retrieves comments and tests links in comments for profiles
 * returns an object with video details including an array of analysed downloadable profiles
 * @param { Redditpost | string } redditpost - redditpost object to get id36 from or the id36 itself
 *
 * @returns { { updatedRedditpost: Redditpost, profiles: *[] } } Updated Reddit post and the profiles
 */
const ProcessRedditpost = async (redditpost) => {
  // get fresh json from reddit based on the id36 passed in
  const { postDetailsJSON, commentsJSON } = await GetJSONFromPost(
    typeof redditpost === "string" ? redditpost : redditpost.id36
  );

  // first process the updated detailed parameters, then do comments, links and profiles
  const postDetails = GetPostDetailsFromJSON(postDetailsJSON); // get updated
  // use updated OP_id from postDetails
  const OPcomments = GetOPcomments(commentsJSON, postDetails.OP_id);
  const newRawLinks = GetLinksFromComments(OPcomments); // [ { string } ]
  const oldLinks = redditpost.OPcommentLinks; // [ { link, link_status } ]

  // const linkExistsInLinks = (linksArray, href) =>
  //   linksArray.find((link) => linksArray.link === href);
  const newLinks = newRawLinks.map((newLink) => {
    const link_status = oldLinks.find(
      (oldLink) => oldLink.link === newLink.link
    )
      ? oldLinks.link_status
      : "NEW";
    return {
      link: newLink,
      link_status,
    };
  });
  // Analyze the Links [ { link, link_status } ] and give me { OPcommentLinks, profiles: { Array } }

  // take newLinks and run it through AnalyzeLink, flat(), and turn it into OPcommentLinks, Profiles
  const analysis_array = await Promise.all(
    newLinks.map(async (linkBlock) => {
      if (
        linkBlock.link_status !== "NEW" &&
        linkBlock.link_status !== "RETRY"
      ) {
        return { linkBlock, profiles: [] };
      } // early exit if already rejected before
      return await AnalyzeLink(linkBlock.link);
    })
  );

  const OPcommentLinks = analysis_array.map((analysis) => analysis.linkBlock);
  const profiles = analysis_array.map((analysis) => analysis.profiles).flat(1);

  const import_status = OPcommentLinks.find((link) => link.link_status === "OK")
    ? "OK"
    : OPcommentLinks.find((link) => link.link_status === "RETRY")
    ? "RETRY"
    : "REJECTED";
  console.log("import_status: ", import_status);

  return {
    updatedRedditpost: {
      ...redditpost,
      import_status,
      OPcomments,
      OPcommentLinks,
      profiles: [],
      ...postDetails,
    },
    profiles,
  };
};

/**
 * @typedef { Object } extracted_data
 * @property { string } OP - OP's Readable Name
 * @property { string } OP_id - OP's t2_id36
 * @property { string } score - current reddit up/down vote score
 * @property { boolean } archived -
 * @property { boolean } locked -
 * @property { string } videoURL -
 * @property { string } audioURL -
 * @property { string } hlsURL -
 * @property { string } duration -
 * @property { number } height -
 * @property { number } width -
 * @property { string } thumbnail -
 */

/**
 * @typedef { Object } postJSON
 * @property { string } author - OP's Readable Name
 * @property { string } author_fullname - OP's t2_id36
 * @property { string } score - current reddit up/down vote score
 * @property { boolean } archived -
 * @property { boolean } locked -
 * @property { string } videoURL -
 * @property { string } audioURL -
 * @property { string } hls_url -
 * @property { string } duration -
 * @property { number } height -
 * @property { number } width -
 * @property { string } thumbnail -
 * @property { Object.<reddit_video: Object.<fallback_url: string>> } media -
 */

/**
 * @param { postJSON } postJSON - Raw Reddit JSON from GET
 * @returns { extracted_data } Extracted details from the Reddit JSON
 */
const GetPostDetailsFromJSON = (postJSON) => {
  const data = postJSON;
  const DASH_regex = /([A-Z])\w+/g;

  const OP = data.author;
  const OP_id = data.author_fullname;

  const archived = data.archived;
  const locked = data.locked;

  const score = data.score;
  const videoURL = data?.media?.reddit_video?.fallback_url;
  const audioURL = videoURL?.replace(DASH_regex, "DASH_audio");
  const hlsURL = data?.hls_url;
  const duration = data?.duration;
  const height = data?.height;
  const width = data?.width;
  const thumbnail = data?.thumbnail;

  return {
    OP,
    OP_id,
    archived,
    locked,
    score,
    videoURL,
    audioURL,
    hlsURL,
    duration,
    height,
    width,
    thumbnail,
  };
};

/**
 * Transform NEW Redditpost scrapes in DB
 * into Chromaprofiles
 * or mark the scrape REJECTED
 * @returns {{ scrapes_queued: number, posts_analyzed: number, profiles_imported: number }} info on success
 */
const ProcessNewRedditPosts = async () => {
  // get all the new posts waiting to be processed from the scrapes DB
  // shift them off one by one, stopping if 403 RETRY or ran out of scrapes

  let retry_error = false;
  let profiles_imported = 0,
    posts_analyzed = 0,
    scrapes_queued = 0;

  /** @type { Redditpost[] } */
  let redditposts = await GetUnprocessedPostsFromDB();
  scrapes_queued = redditposts?.length; // Total scrapes we're starting with
  console.log("Scrapes Queued for Processing: ", scrapes_queued);

  // loop until we run out of scrapes or hit a 403, shift instead of forEach because we need to stop if 403
  while (redditposts && redditposts.length > 0 && !retry_error) {
    /** @type { Redditpost } */
    const scrapedRedditpost = redditposts.shift();
    console.log(
      `scrapedRedditpost id: ${scrapedRedditpost.id36}`,
      `title: ${scrapedRedditpost.title}`
    );

    /** @type { { updatedRedditpost: Redditpost, profiles: *[] } } */
    const { updatedRedditpost, profiles: rawProfiles } =
      await ProcessRedditpost(scrapedRedditpost);

    // insert any newly found profiles into DB, then update the Redditpost with profiles._ids returned
    const profiles = await (async (newProfiles) => {
      // quick pass through return empty array if there were no profiles here
      if (newProfiles.length <= 0) return [];
      // happy path = there are profiles, lets insert them
      // give profile a redditpost, so we can insert into DB
      const insertableProfiles = newProfiles.map((profile) => ({
        redditpost: scrapedRedditpost._id,
        ...profile,
      }));

      let profile_ids = []; // array of profile id's
      try {
        profile_ids = await Chromaprofile.insertMany(insertableProfiles, {
          ordered: false,
        });
        console.log(insertableProfiles, " ...profiles saved...");
      } catch (e) {
        console.log(e);
      }
      return profile_ids;
    })(rawProfiles);

    try {
      await Redditpost.findOneAndUpdate(
        { _id: scrapedRedditpost._id },
        { ...updatedRedditpost, profiles }
      ).exec();
      posts_analyzed++; // increment posts analyzed
    } catch (e) {
      console.log(e);
    }

    profiles_imported += profiles.length; // increase the count of profiles

    // on 403 error break the while loop
    if (updatedRedditpost.import_status === "RETRY") retry_error = true;
  } // while

  console.log(`Total Scrapes Queued: ${scrapes_queued}`);
  console.log(`Posts Analyzed: ${posts_analyzed}`);
  console.log(`Profiles imported: ${profiles_imported}`);

  return { scrapes_queued, posts_analyzed, profiles_imported };
};

exports.ProcessNewRedditPosts = ProcessNewRedditPosts;
