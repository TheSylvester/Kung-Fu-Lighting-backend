require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const { connectKFLDB } = require("./services/mongo.js");
const cron = require("node-cron");
const cookieParser = require("cookie-parser");

const config_data = require("./config.json");

const SECRET = process.env.SECRET;
const SERVER_URL = config_data.BACKEND_URL;
const FRONTEND_URL = config_data.FRONTEND_URL;

(async () => {
  await connectKFLDB();
})();

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
  GetDevicesAndEffects,
  LoginUser,
  IsRedditpostLocked,
  LocalLikeProfile,
} = require("./services/kflconnect");

const { GetAllPushshiftAsReddit } = require("./services/pushshift");
const {
  GetUpdatedRedditposts,
  GetRedditIdsWithToken,
} = require("./services/reddit");
const {
  CommentLinksFromRedditposts,
  AnalyzeCommentLink,
} = require("./link-analyzer");
const {
  GetAccessTokenFromCode,
  GetRedditUser,
  CreateRedditVote,
} = require("./services/reddit-auth");
const jwt = require("jsonwebtoken");
const auth = require("./middlewares/auth");

const PORT = process.env.PORT;
const POTM_COUNT = 6;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static("build"));

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
app.get("/api/profiles", auth, async (request, response) => {
  const profiles = await GetChromaprofiles(request.query);

  response.json(
    request.isAuthenticated // IF AUTHENTICATED...
      ? await GetLikesAsUser(request.user, profiles) // respond WITH LIKES
      : profiles
  );
});

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
  // take the httpOnly cookie from the user with the token, decode, match the userdb
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

app.get("/api/get-devices-and-effects", async (request, response) => {
  const result = await GetDevicesAndEffects();
  response.json(result);
});

/***************************************************************************** */
/** OTHER ROUTES **/

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
app.get("/*", function(req, res) {
  res.sendFile(__dirname + "/build/index.html", function(err) {
    if (err) {
      res.status(500).send(err);
      console.error("App.GET /* error: ", err);
    }
  });
});

/****
 * Scheduling Scrape-and-Analyze, tag-featured-profiles, and refresh-redditposts
 */
cron.schedule("*/15 * * * *", () => {
  console.log(
    `## Scheduled Task Running (every 15min) at ${new Date().toLocaleString()}`
  );
  (async function() {
    const result = await RefreshRedditPosts();
    console.log(`Refreshed ${result} Redditposts`);
  })();
});
cron.schedule("*/45 * * * *", () => {
  console.log(
    `## Scheduled Task Running (every 45min) at ${new Date().toLocaleString()}`
  );
  (async function() {
    let scraped = await ScrapeAndAnalyze();
    console.log(`Scrape and Analyze Results: `, scraped);
    let tagged = await TagFeaturedProfiles();
    console.log(
      `Tag-Featured-Profiles Results: `,
      tagged.map(
        (p) => `${p.id36} ${p.title} tags: ${p.tags.map((x) => x.description)}`
      )
    );
  })();
});

/**
 * Finds the top scoring Chromaprofile created_UTC in the month previous
 * adds Tag
 * Finds the same Tag anywhere else in Chromaprofiles and removes that tag
 * @returns { Promise<Chromaprofile[]> }
 */
const TagFeaturedProfiles = async () => {
  console.log("### TagFeaturedProfiles started ", new Date().toLocaleString());
  // Newest Profile
  await RemoveAllTags({ tag: "featured", description: "Newest Profile" });
  const latest = await GetLatestProfile();
  const tagged_latest = await AddTagToProfile(
    latest.id36,
    "featured",
    "Newest Profile"
  );

  // POTM
  await RemoveAllTags({ tag: "featured", description: "Profile of the Month" }); // reset

  // to find the POTM in the month / year indicated by the timestamp
  async function GetPOTM(year, month) {
    const firstOfMonthTimestamp = Math.floor(new Date(year, month, 1) / 1000);
    const endOfMonthTimestamp = Math.floor(new Date(year, month + 1, 1) / 1000); // 1st of next month, actually
    return await GetChromaprofiles({
      after: firstOfMonthTimestamp,
      before: endOfMonthTimestamp,
      sort_by: "score",
      limit: 1,
    });
  }

  // find the POTM that is from minimum one month before timestamp
  async function FindLastPOTMFrom(timestamp) {
    let result = [];
    let i = 1;

    while (result.length === 0) {
      let date = new Date(timestamp);
      result = await GetPOTM(date.getFullYear(), date.getMonth() - i);
      i++;
    }
    return result[0];
  }

  async function FindPOTMs(startTimestamp, count) {
    let POTMs = [];
    for (let i = 0; i < count; i++) {
      POTMs.push(
        await FindLastPOTMFrom(
          i === 0 ? startTimestamp : POTMs[i - 1].created_utc * 1000
        )
      );
    }
    return POTMs;
  }

  // actually tag the POTMs
  async function TagPOTM(profile) {
    const GetMonthName = (dt) =>
      new Date(dt).toLocaleString("en-us", { month: "long" });
    return await AddTagToProfile(
      profile.id36,
      "featured",
      "Profile of the Month " + GetMonthName(profile.created_utc * 1000)
    );
  }

  // now we can actually get and tag all the POTMs
  const POTMs = await FindPOTMs(latest.created_utc * 1000, POTM_COUNT);
  let tagged_potm = [];
  for (let p of POTMs) {
    tagged_potm.push(await TagPOTM(p));
  }

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

  return [tagged_latest, ...tagged_potm, tagged_goat];
};

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
    // console.log(
    //   "updatedRedditposts: ",
    //   updatedRedditposts.map((p) => `${p.id36} ${p.title}`)
    // );
    const results = await Promise.all(
      updatedRedditposts.map(async (post) => await UpsertRedditPost(post))
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
  console.log("### ScrapeAndAnalyze started ", new Date().toLocaleString());

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
    links.length + " Links from GetNewCommentLinks()... "
    // links.map((x) => x.link_status + " " + x.original_link)
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
 * seeks all video posts and inserts all new submissions to kfl-connect
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

/**
 * Returns a profiles array with a likes property for user's reddit likes
 * or local likes if the post is archived
 * @param { KFLUser } user
 * @param { Chromaprofile[] } profiles
 * @returns { Chromaprofile[] }
 */
const GetLikesAsUser = async (user, profiles) => {
  const GetCSVIdString = (p) => p.map((x) => `t3_${x.id36}`).join(","); // add the t3_ to id36s

  const profileIds = GetCSVIdString(profiles);
  const GetRedditIds = GetRedditIdsWithToken(user.access_token);

  try {
    const redditResponse = await GetRedditIds(profileIds); // full json response

    // creates a likes = { [id36]: likesFromRedditBoolean }
    // likes { [id]: likesFromRedditBoolean  } is based on live redditResponse OR user.votes[id36]
    const likes = redditResponse.data.data.children.reduce((a, b) => {

      return {
        ...a,
        [b.data.id]:
          user.votes.get("t3_" + b.data.id) !== undefined
            ? user.votes.get("t3_" + b.data.id)
            : b.data.likes,
      };
    }, {});

    // merge reddit likes with each profile
    return profiles.map((profile) => {
      profile.likes = likes[profile.id36];
      return profile;
    });
  } catch (e) {
    console.error("GetLikesAsUser", e.message);
    return profiles;
  }
};
