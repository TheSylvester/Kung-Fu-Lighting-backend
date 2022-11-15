/**
 * Handles all interactions with CommentLink objects in the database
 */

const CommentLinks = require("../models/commentlink");

/**
 * Returns an array of comment links
 * from Redditpost based on OPCommentLinks
 * Turns them into new CommentLinks
 * @param { Redditpost } redditpost
 * @returns { CommentLink[] }
 */
function CommentLinksFromRedditpost(redditpost) {
  const links = redditpost.OPcommentLinks;
  const redditpost_id = redditpost._id;
  return links.map((original_link) => {
    return {
      _id: null,
      redditpost_id,
      original_link,
      link_type: "NEW",
      link_status: "NEW",
    };
  });
}

/**
 * CommentLinksFromRedditposts
 * @param { Redditpost[] } redditposts
 * @returns { CommentLink[] }
 */
function CommentLinksFromRedditposts(redditposts) {
  redditposts.flatMap((redditpost) => CommentLinksFromRedditpost(redditpost));
}

/**
 * ### InsertCommentLink ###
 * Validates that there are no two posts sharing the same redditpost_id
 * @param { CommentLink } commentlink
 * @returns { boolean } true on success
 */
async function InsertCommentLink(commentlink) {
  const found = await CommentLinks.findOne({
    $and: [
      {
        original_link: commentlink.original_link,
      },
      { redditpost_id: commentlink.redditpost_id },
    ],
  }).exec();
  // guard clause
  if (found) return null;

  /** @type {MongoDocument} */
  const newCommentlink = new CommentLinks(commentlink);
  const doc = await newCommentlink.save();

  return !!doc; // true if we got something
}

/**
 * ### InsertManyCommentLinks ###
 * Validates that there are no two posts sharing the same redditpost_id
 * @param { CommentLink[] } links
 * @returns { number } Inserted links
 */
async function InsertManyCommentLinks(links = []) {
  /** @type { boolean[] } */
  const writeResults = await Promise.all(
    links.map(async (link) => await InsertCommentLink(link))
  );
  const nInserted = writeResults.filter(Boolean).length; // trick to find all truth values
  return nInserted;
}

/**
 * ### UpdateCommentLink ###
 * @param { CommentLink } updatedLink
 * @returns { boolean } true on success
 */
async function UpdateCommentLink(updatedLink) {
  const result = await CommentLinks.findByIdAndUpdate(
    updatedLink._id,
    updatedLink
  ).exec();
  /** logging */
  // console.log("UpdateCommentLink findByIdAndUpdate ", result.toObject());
  return !!result;
}

/**
 * Retrieves all CommentLink[] in KFL with link_status: NEW or RETRY
 * @returns { CommentLink[] }
 */
async function GetNewCommentLinks() {
  /** @type { MongoDocument } */
  const commentLinks = await CommentLinks.find({
    $or: [{ link_status: "NEW" }, { link_status: "RETRY" }],
  }).exec();
  return commentLinks.map((x) => x.toObject());
}

// "Revealing" module pattern
module.exports = {
  CommentLinksFromRedditpost,
  CommentLinksFromRedditposts,
  InsertCommentLink,
  InsertManyCommentLinks,
  UpdateCommentLink,
  GetNewCommentLinks,
};
