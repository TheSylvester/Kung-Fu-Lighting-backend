const {
  GetAccessTokenFromCode,
  GetRedditUser,
  CreateRedditVote,
} = require("../services/reddit-auth");
const { LoginUser, LocalLikeProfile } = require("../services/users");
const jwt = require("jsonwebtoken");
const auth = require("../middlewares/auth");
const { IsRedditpostLocked } = require("../services/chromaprofiles");
const oauthRouter = require("express").Router();

// environmental variables
const SECRET = process.env.SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL;
const SERVER_URL = process.env.BACKEND_URL;

oauthRouter.get("/redirect", async (request, response) => {
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

oauthRouter.get("/user", auth, async (request, response) => {
  // take the httpOnly cookie from the user with the token, decode, match the user db
  if (!request.isAuthenticated) {
    response.json({ id: null, name: null, snoovatar_img: null });
    return;
  }

  const { id, name, snoovatar_img } = request.user;
  response.json({ id, name, snoovatar_img });
});

oauthRouter.post("/oauth/vote", auth, async (request, response) => {
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

oauthRouter.post("/logout", async (request, response) => {
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

module.exports = oauthRouter;
