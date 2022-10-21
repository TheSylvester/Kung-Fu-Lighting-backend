const { GetKFLUserFromCookie } = require("../services/reddit-auth");

const auth = async (req, res, next) => {
  try {
    const user = await GetKFLUserFromCookie(req.cookies);
    req.isAuthenticated = Boolean(user?.id); // true if we have a user
    req.user = user;
    next();
  } catch (e) {
    req.isAuthenticated = false;
    console.log("Authentication Error: ", e.message);
    next();
  }
};

module.exports = auth;
