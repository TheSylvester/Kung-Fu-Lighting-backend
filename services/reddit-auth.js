const axios = require("axios");
const querystring = require("querystring");
const jwt = require("jsonwebtoken");
// const User = require("../models/user");
const config = require("../config.json");
const { GetKFLUser } = require("./kflconnect");
const pipe = require("../utils/pipe");

const CLIENT_ID = process.env.REDDIT_API_CLIENT_ID;
const CLIENT_SECRET = process.env.REDDIT_API_SECRET;
const SECRET = process.env.SECRET;
const REDDIT_TOKEN_ENDPOINT = "https://www.reddit.com/api/v1/access_token";
const REDDIT_VOTE_ENDPOINT = "https://oauth.reddit.com/api/vote";
const BACKEND_URL = config.BACKEND_URL;

/**
 * GetAccessToken from reddit oauth2 using the 'code' provided by reddit
 * @param { String } code - provided by reddit in query string when redirecting user after successful authentication
 * @returns {{access_token: string, refresh_token: string}} - empty tokens on fail
 */
const GetAccessTokenFromCode = async (code) => {
  return await GetAccessToken("authorization_code", code);
};

/**
 * GetAccessToken from reddit oauth2 using a refresh_token
 * @param { String } refresh - provided by reddit in query string when redirecting user after successful authentication
 * @returns {{access_token: string, refresh_token: string}} - empty tokens on fail
 */
const GetAccessTokenFromRefresh = async (refresh) => {
  return await GetAccessToken("refresh_token", refresh);
};

const GetAccessToken = async (grant_type = "authorization_code", data = "") => {
  if (
    !data ||
    (grant_type !== "authorization_code" && grant_type !== "refresh_token")
  ) {
    return { access_token: "", refresh_token: "" };
  }

  try {
    const response = await axios.post(
      REDDIT_TOKEN_ENDPOINT,
      querystring.stringify({
        grant_type,
        redirect_uri: `${BACKEND_URL}/oauth/redirect`,
        code: data,
        refresh_token: data,
      }),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${CLIENT_ID}:${CLIENT_SECRET}`
          ).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        }, // from https://fusebit.io/blog/reddit-oauth/
      }
    );
    const { access_token, refresh_token } = response.data;
    return { access_token, refresh_token };
  } catch (e) {
    console.log(e.response.status, e.message);
    return { access_token: "", refresh_token: "" };
  }
};

/**
 * Returns an id, name, and snoovatar_img from reddit linked to access token
 * Logs in a valid user using the LosingUser callback
 * Get User from GET https://oauth.reddit.com/api/v1/me
 * @param { Object } props
 * @param { String } props.access_token
 * @param { String } props.refresh_token
 * @param { function(string,string,string,string,string) } props.LoginUser
 * @returns { { id: string, name: string, snoovatar_img: string } }
 */
async function GetRedditUser({ access_token, refresh_token, LoginUser }) {
  try {
    const response = await axios({
      method: "GET",
      url: "https://oauth.reddit.com/api/v1/me",
      headers: {
        authorization: `bearer ${access_token}`,
      },
    });
    const { id, name, snoovatar_img } = response.data;
    await LoginUser(id, name, snoovatar_img, access_token, refresh_token);
    return { id, name, snoovatar_img };
  } catch (err) {
    // GET https://oauth.reddit.com/api/v1/me gives non 401 error, or no refresh_token provided
    if (!refresh_token || err.response?.status !== 401) {
      console.log(`error getting reddit user: ${err}`);
      return { id: "", name: "", snoovatar_img: "" };
    }

    // have refresh_token, will try
    const { access_token: new_access_token, refresh_token: new_refresh_token } =
      await GetAccessTokenFromRefresh(refresh_token);
    if (!new_access_token) {
      return { id: "", name: "", snoovatar_img: "" };
    }
    const user = await GetRedditUser({
      access_token: new_access_token,
      refresh_token: "",
      LoginUser,
    });
    if (!user || !user?.id) {
      return { id: "", name: "", snoovatar_img: "" };
    }
    const { id, name, snoovatar_img } = user;
    await LoginUser(
      id,
      name,
      snoovatar_img,
      new_access_token,
      new_refresh_token
    );
    return { id, name, snoovatar_img };
  }
}

/**
 * Returns a User based on the JWT provided
 * @param { String } token -
 * @returns { { id: string, name: string, snoovatar_img: string } } -
 * returns { id: "", name: "", snoovatar_img: "" } if none
 */
async function GetUserFromToken(token) {
  const emptyUser = { id: "", name: "", snoovatar_img: "" };
  // empty token early exit
  if (!token) {
    return emptyUser;
  }
  // noinspection JSCheckFunctionSignatures
  const decoded = jwt.verify(token, SECRET);
  if (!decoded || !decoded.id || !decoded.name) {
    return emptyUser;
  }
  const { id, name } = decoded;
  return { id, name, snoovatar_img: "" };
}

/**
 *
 * @param { {id :string, name :string, snoovatar_img :string, access_token :string, refresh_token :string} } KFLUser -
 * @returns {boolean} - true if KFLUser matches
 */
const isVerifiedUser = (KFLUser) => {
  if (!KFLUser || !KFLUser?.id) {
    return false;
  }
  const { access_token, refresh_token } = KFLUser;
  const RedditUser = GetRedditUser({ access_token, refresh_token });
  return RedditUser.id === KFLUser.id;
};

/************* new code ************/

const GetValueFromObject = (key) => (obj) => {
  if (!obj || !obj[key]) throw new Error(`key ${key} not found`);
  return obj[key];
};

/** @type {function(object) :string } */
const GetChromaGalleryToken = GetValueFromObject("chroma_gallery_token");

// noinspection JSCheckFunctionSignatures
const DecodeJWT = (secret) => (token) => jwt.verify(token, secret);
const Decoder = DecodeJWT(SECRET);

const GetTokenUser = (fnDecoder) => (token) => {
  const decoded = fnDecoder(token);
  if (!decoded || !decoded.id || !decoded.name) {
    throw new Error("JWT corrupt");
  }
  return { id: decoded.id, name: decoded.name };
};

/**
 * Retrieve a User from MongoDB matching the decoded cookie
 * @param cookie - httpOnly cookie from the user with the token
 * @returns { KFLUser }
 */
const GetKFLUserFromCookie = async (cookie) => {
  const emptyUser = {
    id: null,
    name: null,
    snoovatar_img: null,
    access_token: null,
    refresh_token: null,
    votes: [],
  };

  try {
    // return GetKFLUser(GetTokenUser(Decoder)(GetChromaGalleryToken(cookie)));
    return await pipe(
      GetChromaGalleryToken,
      GetTokenUser(Decoder),
      GetKFLUser
    )(cookie);
  } catch (e) {
    // console.log("GetKFLUserFromCookie: ", e.message);
    return emptyUser;
  }
};

const CreateVote =
  (voteURL) =>
  (id, dir) =>
  async ({ access_token }) => {
    const response = await axios.post(
      voteURL,
      querystring.stringify({
        id,
        dir,
      }),
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        }, // from https://fusebit.io/blog/reddit-oauth/
      }
    );
    return response?.data;
  };

const CreateRedditVote = CreateVote(REDDIT_VOTE_ENDPOINT);

exports.GetAccessTokenFromCode = GetAccessTokenFromCode;
exports.GetAccessTokenFromRefresh = GetAccessTokenFromRefresh;
exports.GetRedditUser = GetRedditUser;
exports.GetUserFromToken = GetUserFromToken;
exports.isVerifiedUser = isVerifiedUser;
exports.GetKFLUserFromCookie = GetKFLUserFromCookie;
exports.CreateRedditVote = CreateRedditVote;
