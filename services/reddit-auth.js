const axios = require("axios");
const querystring = require("querystring");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const config = require("../config.json");

const CLIENT_ID = process.env.REDDIT_API_CLIENT_ID;
const CLIENT_SECRET = process.env.REDDIT_API_SECRET;
const SECRET = process.env.SECRET;
const REDDIT_TOKEN_ENDPOINT = "https://www.reddit.com/api/v1/access_token";
const BACKEND_URL = config.BACKEND_URL;

/**
 * GetAccessToken from reddit using the 'code'  in the params
 * @param { String } code - provided by reddit in query string when redirecting user after successful authentication
 * @returns {{access_token: string, refresh_token: string}} - empty tokens on fail
 */
async function GetAccessToken(code) {
  // early exit if no code is provided
  if (!code) {
    return { access_token: "", refresh_token: "" };
  }

  try {
    const response = await axios.post(
      REDDIT_TOKEN_ENDPOINT,
      querystring.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${BACKEND_URL}/oauth/redirect`,
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
    console.log(`${e.response.status} : ${e.message}`);
    return { access_token: "", refresh_token: "" };
  }
}

/**
 * @typedef { Object } RedditUser
 * @property { string } id
 * @property { string } name
 * @property { string } snoovatar_img
 */

/**
 * GetRedditUser
 * Gets User from GET https://oauth.reddit.com/api/v1/me
 * @param token - Authorization: bearer
 * @returns { RedditUser }
 */
async function GetRedditUser({ access_token, refresh_token }) {
  try {
    const response = await axios({
      method: "GET",
      url: "https://oauth.reddit.com/api/v1/me",
      headers: {
        authorization: `bearer ${access_token}`,
      },
    });
    const { id, name, snoovatar_img } = response.data;
    return { id, name, snoovatar_img };
  } catch (err) {
    if (err.response.status === 401) {
      // get refresh token and try again
      console.log("Error 401");
      return { id: "", name: "", snoovatar_img: "" };
    } else {
      return { id: "", name: "", snoovatar_img: "" };
    }
  }
}

/**
 * Returns a User based on the token provided
 * @param { String } token -
 * @returns { RedditUser } - returns { id: "", name: "", snoovatar_img: "" } if none
 */
async function GetUserFromToken(token) {
  // empty token early exit
  if (!token) {
    return { id: "", name: "", snoovatar_img: "" };
  }
  // noinspection JSCheckFunctionSignatures
  const decoded = jwt.verify(token, SECRET);
  const result = await User.findOne({ id: decoded?.id }).exec();

  if (!result) {
    return { id: "", name: "", snoovatar_img: "" };
  }

  const { id, name, snoovatar_img } = result;
  return { id, name, snoovatar_img };
}

exports.GetAccessToken = GetAccessToken;
exports.GetRedditUser = GetRedditUser;
exports.GetUserFromToken = GetUserFromToken;
