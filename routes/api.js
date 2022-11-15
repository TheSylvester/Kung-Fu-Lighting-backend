const apiRouter = require("express").Router();

const auth = require("../middlewares/auth");
const {
  GetChromaprofiles,
  GetDevicesAndEffects,
  TagFeaturedProfiles,
} = require("../services/chromaprofiles");
const { GetLikesAsUser } = require("../services/users");
const ScrapePushShiftToKFL = require("../controllers/scrapePushShiftToKFL");
const FindNewLinks = require("../controllers/findNewLinks");
const RefreshRedditPosts = require("../controllers/refreshRedditPosts");
const ScrapeAndAnalyze = require("../controllers/scrapeAndAnalyze");
const AnalyzeNewLinks = require("../controllers/analyzeNewLinks");

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
apiRouter.get("/profiles", auth, async (request, response) => {
  const profiles = await GetChromaprofiles(request.query);

  response.json(
    request.isAuthenticated // IF AUTHENTICATED...
      ? await GetLikesAsUser(request.user, profiles) // respond WITH LIKES
      : profiles
  );
});

apiRouter.get("/get-devices-and-effects", async (request, response) => {
  const result = await GetDevicesAndEffects();
  response.json(result);
});

/************ Scrape **********/

apiRouter.get("/api/scrape-pushshift", async (request, response) => {
  const inserted = await ScrapePushShiftToKFL();
  console.log(`Scraped ${inserted.length} new posts`);
  response.json(inserted);
});

apiRouter.get("/api/scrape-and-analyze", async (request, response) => {
  const results = await ScrapeAndAnalyze();
  response.json(results);
});

apiRouter.get("/api/tag-featured-profiles", async (request, response) => {
  const results = await TagFeaturedProfiles();
  // console.log(`tag-featured-profiles Results: `, results);
  response.json(results);
});

apiRouter.get("/api/find-new-links", async (request, response) => {
  const numLinks = await FindNewLinks();
  console.log(`Found ${numLinks} new Links`);
  response.json(numLinks);
});

apiRouter.get("/api/analyze-new-links", async (request, response) => {
  const result = await AnalyzeNewLinks();
  console.log(`Analyzed new links and inserted ${result} new Chromaprofiles`);
  response.json(result);
});

apiRouter.get("/api/refresh-redditposts", async (request, response) => {
  const result = await RefreshRedditPosts();
  console.log(`Refreshed ${result} Redditposts`);
  response.json(result);
});

module.exports = apiRouter;
