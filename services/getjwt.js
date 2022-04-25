const jwt = require("jsonwebtoken");
const fs = require("fs");
const axios = require("axios");

const SIGNED_TOKEN = (async () => {
  /**
   * @returns a signed jwt authentication token for google drive API
   */
  const GetJWT = async () => {
    // Load client secrets from a local file.
    // const credentialsjson = await readFilePromise(CREDENTIALSFILE);
    //    OLD  aud: "https://www.googleapis.com/drive/v3",
    const credentialsjson = fs.readFileSync(CREDENTIALSFILE);
    const credentials = JSON.parse(credentialsjson);
    const header = {
      alg: "RS256",
      typ: "JWT"
    };
    const unixTime = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "kung-fu-lighting@kung-fu-lighting.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      exp: unixTime + 30 * 60, // 30 minutes in seconds
      iat: unixTime
    };
    const signed_jwt = jwt.sign(payload, credentials.private_key, {
      header,
      algorithm: "RS256"
    });

    console.log(header, payload);
    console.log("signed_jwt : ", signed_jwt);

    /* HTTP POST to google to get the auth token */
    response = await axios.post("https://oauth2.googleapis.com/token", {
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signed_jwt
    });

    console.log("response.data: ", response.data);

    token = response.data.access_token;

    return token;
  };

  return await GetJWT();
})();

/**
 * Promise version of fs.readFile()
 */
const readFilePromise = (...args) => {
  return new Promise((resolve, reject) => {
    fs.readFile(...args, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
};
