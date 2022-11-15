const getSecondsSinceUtcEpoch = require("../utils/getSecondsSinceUtcEpoch");
const {
  GetLatestRedditpostUTC,
  InsertManyRedditposts,
} = require("../services/redditposts");
const { GetAllPushshiftAsReddit } = require("../services/pushshift");
const { GetUpdatedRedditposts } = require("../services/reddit");

// oldest post we get from Pushshift is fixed at after 11/2017 (synapse 3 release)
const OLDEST_PROFILE_YEAR = 2017;
const OLDEST_PROFILE_MONTH = 11;

/**
 * Scrapes /r/Chromaprofiles/ via Pushshift.io for posts not already in our collection
 * seeks all video posts and inserts all new submissions to kfl-connect
 * @returns { Array } responds with all posts newly inserted
 */
module.exports = async function ScrapePushShiftToKFL() {
  // If the database is empty, this is the oldest date to scrape pushshift from

  const fixedOldestDate = getSecondsSinceUtcEpoch(
    OLDEST_PROFILE_YEAR,
    OLDEST_PROFILE_MONTH
  );
  const newestCreated = await GetLatestRedditpostUTC();

  // use the fixedOldestDate or the newest created_utc in DB as the "after"
  let fromUtc =
    newestCreated && newestCreated > fixedOldestDate
      ? newestCreated
      : fixedOldestDate;

  // Display String for Console.log
  const dateString = new Date(fromUtc * 1000).toDateString();
  console.log(`Scraping Pushshift.io from ${dateString}`);

  // get new posts from Pushshift,
  // then get the newest version of those posts from reddit
  const newPosts = await GetAllPushshiftAsReddit({ after: fromUtc });
  const updatedPosts = await GetUpdatedRedditposts(newPosts);

  // insert to Reddit
  return await InsertManyRedditposts(updatedPosts);
};
