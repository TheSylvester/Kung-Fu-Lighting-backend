require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const mongo = require("./services/mongo.js");

const { ScrapePushshift } = require("./pushshift-scraper");
const { ProcessNewRedditPosts } = require("./reddit-scraper");
const Chromaprofile = require("./models/chromaprofile.js");
const Redditpost = require("./models/redditpost.js");

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
 * @param props.author - Default: N/A - Return results filtered by author
 * @param props.devices - Default: N/A - Return results filtered by devices
 * @param props.colours - Default: N/A - Return results filtered by colours (exact)
 * @param props.effects - Default: N/A - Return results filtered by effects
 *
 * @param props.score_above - Default: N/A - Return results with score above this
 * @param props.score_below - Default: N/A - Return results with score below this
 *
 * @param props.sort_order - Default: "desc" - Sort results in a specific order (Accepted: "asc", "desc")
 * @param props.sort_by - Default: "created_utc" - property to sort by (Accepted: "created_utc", "score", "author", "title")
 * @param props.skip - Default: 0 - Number of results to skip for pagination purposes
 * @param props.limit - Default: 25 - Number of results to return
 *
 * @returns profiles - Array of Chromaprofiles
 */
app.get("/api/profiles", async (request, response) => {
  // we start with "only posts that are import_status: "OK" and populate profiles
  const matchDefault = { $match: { import_status: "OK" } };
  const lookup_populate_profiles = {
    $lookup: {
      from: "chromaprofiles",
      localField: "profiles",
      foreignField: "_id",
      as: "profiles"
    }
  };
  // props.ids
  const matchId36 = request.query.id36
    ? {
        $match: {
          id36: { $in: [].concat(request.query.id36) }
        }
      }
    : null;
  // props.after
  const matchAfter = request.query.after
    ? { $match: { created_utc: { $gte: Number(request.query.after) } } }
    : null;
  // props.before
  const matchBefore = request.query.before
    ? { $match: { created_utc: { $lte: Number(request.query.before) } } }
    : null;

  // props.author
  const matchAuthor = request.query.author
    ? { $match: { OP: request.query.author } }
    : null;
  // props.devices
  const matchDevices = request.query.devices
    ? {
        $match: {
          "profiles.devices": { $in: [].concat(request.query.devices) }
        }
      }
    : null;
  // props.colours
  const matchColours = request.query.colours
    ? {
        $match: {
          "profiles.colours": { $in: [].concat(request.query.colours) }
        }
      }
    : null;
  // props.effects
  const matchEffects = request.query.effects
    ? {
        $match: {
          "profiles.effects": { $in: [].concat(request.query.effects) }
        }
      }
    : null;

  // props.matchScore_above/below
  const { sign, score } = request.query.score_above
    ? { sign: "$gte", score: Number(request.query.score_above) }
    : request.query.score_below
    ? { sign: "$lte", score: Number(request.query.score_below) }
    : { sign: null, score: null };
  const matchScore = sign ? { $match: { score: { [sign]: score } } } : null;

  // props.sort_order
  const sort_order =
    { asc: 1, desc: -1 }[request.query.sort_order ?? "asc"] || 1;
  // props.sort_by
  const sort = ((sort_type) => {
    const sortable_types = ["created_utc", "score"];
    const type = sortable_types.includes(sort_type ?? "")
      ? sort_type
      : "created_utc";

    return { $sort: { [type]: sort_order } };
  })(request.query.sort_by);
  // props.skip
  const skip = request.query.skip
    ? { $skip: Number(request.query.skip) }
    : null;
  // props.limit
  const limit = {
    $limit: request.query.limit ? Number(request.query.limit) : 25
  };

  let aggregation = [
    matchDefault,
    lookup_populate_profiles,
    matchId36,
    matchAfter,
    matchBefore,
    matchAuthor,
    matchDevices,
    matchColours,
    matchEffects,
    matchScore,
    sort,
    skip,
    limit
  ].filter((match) => match != null);

  console.log(aggregation);

  // get profiles from db
  const profiles = await Redditpost.aggregate(aggregation);

  response.json(profiles);
});

app.get("/api/scrapepushshift", async (request, response) => {
  // *** need to change from_utc to the last created_utc found in DB
  const fromDate = new Date(2017, 11);
  let from_utc = fromDate.getTime() / 1000;
  console.log(`Scraping Pushshift.io from ${fromDate.toDateString()}`);
  let scrapeCount = await ScrapePushshift({
    from_utc
  });

  console.log(`Scrape Count returned: ${scrapeCount}`);

  response.json(scrapeCount);
});

app.get("/api/processnewredditposts", async (request, response) => {
  console.log("Processing NEW/RETRY Reddit posts");
  const { scrapes_queued, posts_analyzed, profiles_imported } =
    await ProcessNewRedditPosts();

  response.json({ scrapes_queued, posts_analyzed, profiles_imported });
});
