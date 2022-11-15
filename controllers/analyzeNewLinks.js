const {
  GetNewCommentLinks,
  UpdateCommentLink,
} = require("../services/commentLinks");
const { AnalyzeCommentLink } = require("../services/link-analyzer");
const { InsertChromaprofile } = require("../services/chromaprofiles");

/**
 * ### AnalyzeNewLinks ###
 * Checks CommentLinks for all links marked NEW or RETRY
 * Analyze each CommentLink and attempts to download from their original_url
 * @returns {Promise<number>}
 */
module.exports = async function AnalyzeNewLinks() {
  /** @type { CommentLink[] } */
  const links = await GetNewCommentLinks(); // get CommentLink[] of link_status: NEW or RETRY
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
