require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const mongo = require("./services/mongo.js");

const {
  InsertManyRedditposts,
  InsertManyCommentLinks,
  GetLatestRedditpostUTC,
  GetUnProcessedRedditposts,
  GetLiveRedditposts,
  UpdateRedditpostsAsDone,
  UpdateCommentLink,
  GetNewCommentLinks,
  InsertChromaprofile,
  UpsertRedditPost,
  GetChromaprofiles,
  GetLatestProfile,
  AddTagToProfile,
  RemoveAllTags,
} = require("./services/kflconnect");

const { GetAllPushshiftAsReddit } = require("./services/pushshift");
const { GetUpdatedRedditposts } = require("./services/reddit");
const {
  CommentLinksFromRedditposts,
  AnalyzeCommentLink,
} = require("./link-analyzer");

const PORT = process.env.PORT;

app.use(cors());

app.listen(PORT, () => {
  console.log(`Kung-Fu-Lighting Server running on port ${PORT}`);
});

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
 * @param props.author - Default: N/A - Search for author
 * @param props.devices - Default: N/A - Search for devices
 * @param props.colours - Default: N/A - Search for colours (exact)
 * @param props.effects - Default: N/A - Search for effects
 *
 * @param props.tag - Default: N/A - Search for tag
 *
 * @param props.score_above - Default: N/A - Return results with score above this
 * @param props.score_below - Default: N/A - Return results with score below this
 *
 * @param props.sort_order - Default: "desc" - Sort results in a specific order (Accepted: "asc", "desc")
 * @param props.sort_by - Default: "created_utc" - property to sort by (Accepted: "created_utc", "score", "author", "title")
 * @param props.skip - Default: 0 - Number of results to skip for pagination purposes
 * @param props.limit - Default: 25 - Number of results to return
 *
 * @returns { Chromaprofile[] } - Array of Chromaprofiles
 */
app.get("/api/profiles", async (request, response) => {
  response.json(await GetChromaprofiles(request.query));
});

/***************************************************************************** */
/** ROUTES **/

app.get("/api/scrape-and-analyze", async (request, response) => {
  const results = await ScrapeAndAnalyze();
  console.log(`Scrape and Analyze Results: `, results);
  response.json(results);
});

app.get("/api/tag-featured-profiles", async (request, response) => {
  const results = await TagFeaturedProfiles();
  console.log(`tag-featured-profiles Results: `, results);
  response.json(results);
});

/**
 * Scrapes /r/Chromaprofiles/ via Pushshift.io for posts not already in our collection
 * seeks all video posts and inserts all new submissions to kflconnect
 * @returns { JSON } responds with all posts newly inserted
 */
app.get("/api/scrape-pushshift", async (request, response) => {
  const inserted = await ScrapePushShiftToKFL();
  console.log(`Scraped ${inserted.length} new posts`);
  response.json(inserted);
});

app.get("/api/find-new-links", async (request, response) => {
  const numLinks = await FindNewLinks();
  console.log(`Found ${numLinks} new Links`);
  response.json(numLinks);
});

app.get("/api/analyze-new-links", async (request, response) => {
  const result = await AnalyzeNewLinks();
  console.log(`Analyzed new links and inserted ${result} new Chromaprofiles`);
  response.json(result);
});

app.get("/api/refresh-redditposts", async (request, response) => {
  const result = await RefreshRedditPosts();
  console.log(`Refreshed ${result} Redditposts`);
  response.json(result);
});

/**
 * Finds the top scoring Chromaprofile created_UTC in the month previous
 * adds Tag
 * Finds the same Tag anywhere else in Chromaprofiles and removes that tag
 * @returns { Promise<Chromaprofile[]> }
 */
const TagFeaturedProfiles = async () => {
  // Newest Profile
  await RemoveAllTags({ tag: "featured", description: "Newest Profile" });
  const latest = await GetLatestProfile();
  const tagged_latest = await AddTagToProfile(
    latest.id36,
    "featured",
    "Newest Profile"
  );

  // POTM
  await RemoveAllTags({ tag: "featured", description: "Profile of the Month" });
  // Find the month that the latest profile was made in,
  const fullYear = new Date().getFullYear();
  const month = new Date(latest.created_utc * 1000).getMonth();
  const firstOfMonth = Math.floor(new Date(fullYear, month, 1) / 1000);
  // then find the earliest created profile created in the calendar month before the latest
  const potmFirstCandidates = await GetChromaprofiles({
    before: firstOfMonth,
    limit: 1,
  });
  const GetMonthName = (dt) =>
    new Date(dt).toLocaleString("en-us", { month: "long" });
  // That's the month we're hosting the POTM in
  const potmMonth = new Date(
    potmFirstCandidates[0].created_utc * 1000
  ).getMonth();
  const potmFirstOfMonth = Math.floor(new Date(fullYear, potmMonth, 1) / 1000);
  const potmFirstNextMonth = Math.floor(
    new Date(fullYear, potmMonth + 1, 1) / 1000
  );
  const potmAllCandidates = await GetChromaprofiles({
    after: potmFirstOfMonth,
    before: potmFirstNextMonth,
    sort_by: "score",
  });
  const tagged_potm = await AddTagToProfile(
    potmAllCandidates[0].id36,
    "featured",
    "Profile of the Month " + GetMonthName(potmFirstOfMonth * 1000)
  );

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

  // console.log(potmAllCandidates);
  return [tagged_latest, tagged_potm, tagged_goat];
};

/*****************************************************************************
 * ### RefreshRedditPosts ###
 * Gets all Redditposts that need to be refreshed
 * Refreshes, and updates each one AND related Chromaprofiles
 * @returns {Promise<number>} Number of Redditposts refreshed
 */
async function RefreshRedditPosts() {
  const postsToUpdate = await GetLiveRedditposts();
  console.log("postsToUpdate: ", postsToUpdate);
  const updatedRedditposts = await GetUpdatedRedditposts(postsToUpdate);
  console.log("updatedRedditposts: ", updatedRedditposts);
  const results = await Promise.all(
    updatedRedditposts.map(async (post) => await UpsertRedditPost(post))
  );
  return results.length;
}

/**
 * ### ScrapeAndAnalyze ###
 * Scrape new Redditposts from Pushshift,
 * find all new CommentLinks from all new Redditposts,
 * analyze every NEW CommentLink for new Chromaprofiles
 * @returns { scraped: number, linked: number, profiled: number  }
 * number of posts scraped, links found, and chromaprofiles created
 */
async function ScrapeAndAnalyze() {
  const inserted = await ScrapePushShiftToKFL();
  console.log(`Scraped ${inserted.length} new posts`);
  const numLinks = await FindNewLinks();
  console.log(`Found ${numLinks} new Links`);
  const result = await AnalyzeNewLinks();
  console.log(`Analyzed new links and inserted ${result} new Chromaprofiles`);
  return { scraped: inserted.length, linked: numLinks, profiled: result };
}

/**
 * ### FindNewLinks ###
 * Takes all Redditposts with the status NEW / UPDATED and
 * finds new OPCommentLinks not already in CommentLinks DB Collection
 * Inserts them into DB Collection
 * @returns {Promise<number>} number of new links found
 */
async function FindNewLinks() {
  const redditposts = await GetUnProcessedRedditposts(); // get NEW / UPDATED redditposts from DB
  const links = CommentLinksFromRedditposts(redditposts);
  const result = await InsertManyCommentLinks(links);
  await UpdateRedditpostsAsDone(redditposts);
  return result;
}

/**
 * ### AnalyzeNewLinks ###
 * Checks CommentLinks for all links marked NEW or RETRY
 * Analyze each CommentLink and attempts to download from their original_url
 * @returns {Promise<number>}
 */
const AnalyzeNewLinks = async () => {
  /** @type { CommentLink[] } */
  const links = await GetNewCommentLinks(); // get CommentLink[] of link_status: NEW or RETRY
  /** Logging */
  console.log(
    links.length + " Links from GetNewCommentLinks(): ",
    links.map((x) => x.link_status + " " + x.original_link)
  );
  let profileCount = 0; // keep track of # of profiles inserted in the for loop
  // using for loop with await here
  for (let link of links) {
    const { updatedCommentLink, chromaprofileStub } = await AnalyzeCommentLink(
      link
    );
    // update the commentlink
    await UpdateCommentLink(updatedCommentLink);
    // if there's a chromaprofileStub then insert it
    if (
      chromaprofileStub?.lightingeffects?.length > 0 &&
      chromaprofileStub?.download_link !== ""
    ) {
      (await InsertChromaprofile(chromaprofileStub)) ? ++profileCount : null;
    }

    // break clause if RETRY triggered
    if (updatedCommentLink.link_status === "RETRY") break;
  }
  return profileCount;
};

/**
 * Scrapes /r/Chromaprofiles/ via Pushshift.io for posts not already in our collection
 * seeks all video posts and inserts all new submissions to kflconnect
 * @returns { Array } responds with all posts newly inserted
 */
const ScrapePushShiftToKFL = async () => {
  // If the database is empty, this is the oldest date to scrape pushshift from
  const fixedOldestDate = new Date(2017, 11);
  const fixedOldestDate_utc = fixedOldestDate.getTime() / 1000;

  const newest_created_utc = await GetLatestRedditpostUTC();

  // use the fixedOldestDate or the newest created_utc in DB as the "after"
  // oldest post we get from Pushshift is fixed at after 11/2017 (synapse 3 release)
  let from_utc =
    newest_created_utc && newest_created_utc > fixedOldestDate_utc
      ? newest_created_utc
      : fixedOldestDate_utc;

  // Display String for Console.log
  const dateString = new Date(from_utc * 1000).toDateString();
  console.log(`Scraping Pushshift.io from ${dateString}`);

  // get new posts from Pushshift,
  // then get the newest version of those posts from reddit
  const newPosts = await GetAllPushshiftAsReddit({ after: from_utc });
  const updatedPosts = await GetUpdatedRedditposts(newPosts);

  // insert to Reddit
  return await InsertManyRedditposts(updatedPosts);
};
