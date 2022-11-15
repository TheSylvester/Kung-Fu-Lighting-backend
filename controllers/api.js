const apiRouter = require("express").Router();

const auth = require("../middlewares/auth");
const {
  GetChromaprofiles,
  GetDevicesAndEffects,
} = require("../services/chromaprofiles");
const { GetLikesAsUser } = require("../services/users");

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

module.exports = apiRouter;
