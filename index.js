const express = require("express");
const app = express();
const axios = require("axios");

const markdownLinkExtractor = require("markdown-link-extractor");
const linkify = require("linkifyjs");

const ChromaProfilesURL = "http://www.reddit.com/r/ChromaProfiles";
// const PublicFreakoutsURL = `${"http://www.reddit.com/r/PublicFreakout"}.json`;

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Kung-Fu-Lighting Server running on port ${PORT}`);
});

const GetRedditJSON = async (after = null) => {
  const pagination = `?after=${after}`;
  const response = await axios.get(
    `${ChromaProfilesURL}.json${after ? pagination : ""}`
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

const Extract_Linkify = (comment) => {
  const linkHashArray = linkify.find(comment);
  const links = linkHashArray.map((link) => link.href);

  return !links || links.length === 0 ? [] : links; /* early escape */
};

const ExtractOPCommentLinks = (comments, OP = null) => {
  /**
   * accepts raw json comments listing t1_ from reddit
   * Extract with markdown-link-extractor
   */

  let OPcommentLinks = [];

  comments.forEach((comment) => {
    if (!OP || comment.data.author_fullname === OP) {
      const commentBody = comment.data.body;

      const { raw, href } = Extract_MarkdownLinkExtractor(commentBody);

      // console.log("comment: ", commentBody);
      // console.log("raw: ", raw);
      // console.log("href: ", href);

      OPcommentLinks.push(href);
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

  return OPcommentLinks;
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

  const DASH_regex = /([A-Z])\w+/g;
  const videoURL = data?.media?.reddit_video?.fallback_url;
  const audioURL = videoURL?.replace(DASH_regex, "DASH_audio");

  const extracted_data = {
    id36,
    title,
    link,
    OP,
    OP_id,
    reddit_likes,
    videoURL,
    audioURL
  };

  console.log("postJSON: ", postJSON);
  console.log("ExtractDataFromPost: ", extracted_data);

  return extracted_data;
};

app.get("/json/", async (request, response) => {
  const json = await GetRedditJSON();
  return response.send(json);
});

app.get("/videojson/", async (request, response) => {
  const json = await GetRedditJSON();
  return response.send(json.data.children.filter((post) => post.data.is_video));
});

const ScrapeRedditForProfiles = async (limit = 5) => {
  /*
   * Scrapes Reddit json and returns an array of profiles
   * from reddit posts in /r/ChromaProfiles with video in them
   * we find comments made by OP and any links they left,
   * which we assume to be download links
   */
  let profilesArray = [];
  let after = null;

  while (profilesArray.length < limit) {
    let redditJSON = await GetRedditJSON(after);
    after = redditJSON?.data?.after;

    let videoPosts = redditJSON.data.children.filter(
      (post) => post.data.is_video
    );

    if (!videoPosts || videoPosts.length === 0)
      continue; /* skip to next while */

    const postData = videoPosts.map((post) => ExtractDataFromPost(post));

    const dataPromises = postData.map(async (post) => {
      const commentsJSON = await GetCommentsJSON(post.id36);
      const OProotComments = ExtractOProotComments(commentsJSON, post.OP_id);
      const OPcommentLinks = ExtractOPCommentLinks(commentsJSON, post.OP_id);

      // map with async function returns promises
      return OPcommentLinks || OProotComments
        ? { ...post, OPcommentLinks, OProotComments }
        : post;
    });
    // wait until all promises complete before assigning
    const fullData = await Promise.all(dataPromises);

    profilesArray = [...profilesArray, ...fullData];
  }

  return profilesArray;
};

app.get("/", async (request, response) => {
  const LIMIT = 5; // min number of video links to get
  const profilesArray = await ScrapeRedditForProfiles(LIMIT);

  response.send(
    profilesArray
      .map(
        (post) =>
          `<div>
            <div><a href=${post.link}>${post.title}</a> - ${post.reddit_likes} likes</div>
            <div>by ${post.OP}</div>
            <video width="480" height="270" controls muted autoplay="autoplay">
              <source type="video/mp4" src=${post.videoURL} />
            </video>
            <div><a href=${post.OPcommentLinks[0]} target="_blank">Download ${post.OPcommentLinks[0]}</a></div>
          </div>`
      )
      .reduce((a, b) => a + b)
  );
});

app.get("/videotest/", async (request, response) => {
  const videoURL =
    "https://v.redd.it/ub8ukmptrsn81/DASH_720.mp4?source=fallback";

  const audioURL =
    "https://v.redd.it/ub8ukmptrsn81/DASH_audio.mp4?source=fallback";

  const videoString = `<video controls muted autoplay="autoplay"><source type="video/mp4" src=${videoURL} /></video>`;
  const audioString = `<video controls muted autoplay="autoplay"><source type="video/mp4" src=${audioURL} /></video>`;

  response.send(videoString + audioString);
});
