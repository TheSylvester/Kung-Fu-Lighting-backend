const ScrapePushShiftToKFL = require("./controllers/scrapePushShiftToKFL");
const { TagFeaturedProfiles } = require("./services/chromaprofiles");

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const cors = require("cors");
const { connectKFLDB } = require("./services/mongo.js");
const cron = require("node-cron");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

// environmental variables
const PORT = process.env.PORT;
const SECRET = process.env.SECRET;
const SERVER_URL = process.env.BACKEND_URL;
const FRONTEND_URL = process.env.FRONTEND_URL;

(async () => {
  await connectKFLDB();
})();
// utils
const getSecondsSinceUtcEpoch = require("./utils/getSecondsSinceUtcEpoch");

// services
const { GetUpdatedRedditposts } = require("./services/reddit");
const { GetAllPushshiftAsReddit } = require("./services/pushshift");

const {
  InsertChromaprofile,
  GetChromaprofiles,
  GetDevicesAndEffects,
  IsRedditpostLocked,
} = require("./services/chromaprofiles");

const { LoginUser, LocalLikeProfile } = require("./services/users");

const {
  InsertManyRedditposts,
  GetLatestRedditpostUTC,
  GetUnProcessedRedditposts,
  GetLiveRedditposts,
  UpdateRedditpostsAsDone,
  UpsertRedditpost,
} = require("./services/redditposts");

const {
  CommentLinksFromRedditposts,
  UpdateCommentLink,
  GetNewCommentLinks,
  InsertManyCommentLinks,
} = require("./services/commentLinks");

const { AnalyzeCommentLink } = require("./link-analyzer");

const {
  GetAccessTokenFromCode,
  GetRedditUser,
  CreateRedditVote,
} = require("./services/reddit-auth");

// middleware
const auth = require("./middlewares/auth");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("build"));

// routes
const apiRouter = require("./controllers/api");
app.use("/api/", apiRouter);

app.get("/oauth/redirect", async (request, response) => {
  const homepage = FRONTEND_URL;
  const code = request.query?.code;
  // guard clause, no code early exit
  if (!code) {
    console.log("- no code", request.query?.code);
    Logout(response);
    return;
  }
  const { access_token, refresh_token } = await GetAccessTokenFromCode(code);
  if (!access_token) {
    console.log("* no token");
    Logout(response);
    return;
  }

  const user = await GetRedditUser({ access_token, refresh_token, LoginUser });

  // guard clause, user authentication failed somehow
  if (!user || !user.id) {
    console.log("no user ", user);
    response
      .clearCookie("chroma_gallery_token", { httpOnly: true })
      .redirect(homepage);
    return;
  }

  // noinspection JSCheckFunctionSignatures
  const signed_jwt_token = jwt.sign({ id: user.id, name: user.name }, SECRET);
  response
    .cookie("chroma_gallery_token", signed_jwt_token, {
      httpOnly: true,
    })
    .redirect(homepage);
});

app.get("/oauth/user", auth, async (request, response) => {
  // take the httpOnly cookie from the user with the token, decode, match the user db
  if (!request.isAuthenticated) {
    response.json({ id: null, name: null, snoovatar_img: null });
    return;
  }

  const { id, name, snoovatar_img } = request.user;
  response.json({ id, name, snoovatar_img });
});

app.post("/oauth/logout", async (request, response) => {
  Logout(response);
});

const DeleteCookie = (cookieKey) => (res) =>
  res.clearCookie(cookieKey, { httpOnly: true });
const Redirect = (url) => (res) => res.redirect(url);

const DeleteTokenCookie = DeleteCookie("chroma_gallery_token");
const RedirectHome = Redirect(SERVER_URL);

/**
 * Deletes the User's Cookie and Redirects to Root URL
 * @param { object } response the response object used to communicate with the requester
 */
const Logout = (response) => RedirectHome(DeleteTokenCookie(response));

/***************************************************************************** */
/** OTHER ROUTES **/

app.get("/api/scrape-and-analyze", async (request, response) => {
  const results = await ScrapeAndAnalyze();
  response.json(results);
});

app.get("/api/tag-featured-profiles", async (request, response) => {
  const results = await TagFeaturedProfiles();
  // console.log(`tag-featured-profiles Results: `, results);
  response.json(results);
});

/**
 * Scrapes /r/Chromaprofiles/ via Pushshift.io for posts not already in our collection
 * seeks all video posts and inserts all new submissions to kfl-connect
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

app.post("/oauth/vote", auth, async (request, response) => {
  if (!request.isAuthenticated) {
    response.status(401).send("Upvote failed: Unauthorized");
    return;
  }

  // console.log(`/oauth/vote ${request.body}`);

  const { id, dir } = request.body;
  const { user } = request;
  const VoteAsUser = CreateRedditVote(id, dir);

  const isProfileLocked = await IsRedditpostLocked(id);

  try {
    const result = isProfileLocked
      ? await LocalLikeProfile(id, dir, user.id)
      : await VoteAsUser(user);
    response.json(result);
  } catch (e) {
    if (e.response?.status === 401) {
      Logout(response);
    } else {
      console.log(e.message);
      response.status(400).send(e.message);
    }
  }
});

/****** catch all ***********/
app.get("/*", function (req, res) {
  res.sendFile(__dirname + "/build/index.html", function (err) {
    if (err) {
      res.status(500).send(err);
      console.error("App.GET /* error: ", err);
    }
  });
});

/**** Create the Server ****/
app.listen(PORT, () => {
  console.log(`Kung-Fu-Lighting Server running on port ${PORT}`);
});

function ScheduledTasks() {
  /****
   * Scheduling Scrape-and-Analyze, tag-featured-profiles, and refresh-redditposts
   */
  cron.schedule("*/15 * * * *", () => {
    console.log(
      `## Scheduled Task Running (every 15min) at ${new Date().toLocaleString()}`
    );
    (async function () {
      await RefreshRedditPosts();
    })();
  });
  cron.schedule("*/45 * * * *", () => {
    console.log(
      `## Scheduled Task Running (every 45min) at ${new Date().toLocaleString()}`
    );
    (async function () {
      await ScrapeAndAnalyze();
      await TagFeaturedProfiles();
    })();
  });
}

ScheduledTasks();

/*****************************************************************************
 * ### RefreshRedditPosts ###
 * Gets all Redditposts that need to be refreshed
 * Refreshes, and updates each one AND related Chromaprofiles
 * @returns {Promise<number>} Number of Redditposts refreshed
 */
async function RefreshRedditPosts() {
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
  const numLinks = await FindNewLinks();
  const result = await AnalyzeNewLinks();
  console.log(
    `### ScrapeAndAnalyze started ${new Date().toLocaleString()}`,
    `${numLinks} new Links, ${inserted.length} new posts, ${result} new Chromaprofiles`
  );

  return { scraped: inserted.length, linked: numLinks, profiled: result };
}

/**
 * Find and Insert new CommentLinks from NEW / UPDATED redditposts
 * Takes all Redditposts with the status NEW / UPDATED and
 * finds new OPCommentLinks not already in CommentLinks DB Collection
 * Inserts them into DB Collection
 * @returns {Promise<number>} number of new links found
 */
async function FindNewLinks() {
  // GetUnProcessedRedditposts, CommentLinksFromRedditposts
  // InsertManyCommentLinks
  // UpdateRedditpostsAsDone
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
async function AnalyzeNewLinks() {
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
}
