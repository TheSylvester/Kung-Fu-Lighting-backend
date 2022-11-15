const {
  GetUnProcessedRedditposts,
  UpdateRedditpostsAsDone,
} = require("../services/redditposts");
const {
  CommentLinksFromRedditposts,
  InsertManyCommentLinks,
} = require("../services/commentLinks");

/**
 * Find and Insert new CommentLinks from NEW / UPDATED redditposts
 * Takes all Redditposts with the status NEW / UPDATED and
 * finds new OPCommentLinks not already in CommentLinks DB Collection
 * Inserts them into DB Collection
 * @returns {Promise<number>} number of new links found
 */
module.exports = async function FindNewLinks() {
  // GetUnProcessedRedditposts, CommentLinksFromRedditposts
  // InsertManyCommentLinks
  // UpdateRedditpostsAsDone
  const redditposts = await GetUnProcessedRedditposts(); // get NEW / UPDATED redditposts from DB
  const links = CommentLinksFromRedditposts(redditposts);
  const result = await InsertManyCommentLinks(links);
  await UpdateRedditpostsAsDone(redditposts);
  return result;
};
