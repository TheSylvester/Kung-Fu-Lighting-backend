const {
  GetLiveRedditposts,
  UpsertRedditpost,
} = require("../services/redditposts");
const { GetUpdatedRedditposts } = require("../services/reddit");

/*****************************************************************************
 * ### RefreshRedditPosts ###
 * Gets all Redditposts that need to be refreshed
 * Refreshes, and updates each one AND related Chromaprofiles
 * @returns {Promise<number>} Number of Redditposts refreshed
 */
module.exports = async function RefreshRedditPosts() {
  console.log("### RefreshRedditPosts started ", new Date().toLocaleString());

  try {
    const postsToUpdate = await GetLiveRedditposts();
    const updatedRedditposts = await GetUpdatedRedditposts(postsToUpdate);
    const results = await Promise.all(
      updatedRedditposts.map(async (post) => await UpsertRedditpost(post))
    );
    return results.length;
  } catch (e) {
    console.log("### ERROR in RefreshRedditPosts ###", e);
    return 0;
  }
};
