require("dotenv").config();
const express = require("express");
const app = express();
const mongo = require("./services/mongo.js");
const chromaprofile = require("./models/chromaprofile.js");
const { ProfileDownload, AnalyzeXMLFile } = require("./profile-analyzer.js");

const {
  ScrapeRedditForProfiles,
  GetRedditJSON,
  MakeGoogleDriveLinkDownloadable: ConvertGDriveLink
} = require("./reddit-scraper");
// const PORT = 3001;
const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log(`Kung-Fu-Lighting Server running on port ${PORT}`);
});

app.get("/json/", async (request, response) => {
  const json = await GetRedditJSON();
  return response.send(json);
});

app.get("/videojson/", async (request, response) => {
  const json = await GetRedditJSON();
  return response.send(json.data.children.filter((post) => post.data.is_video));
});

app.get("/profile-analyzer", async (request, response) => {
  // const url = `https://drive.google.com/uc?id=1NfRrdrDJ2DqanieRx4BCgE56RktwgBLV&export=download`;
  // await ProfileDownload(url);
  AnalyzeXMLFile(`./downloads/edede9d9-7809-49e3-a9e8-96a484623d94.xml`);
  return response.send(`<div>hello download</div>`);
});

app.get("/redditscraper", async (request, response) => {
  const LIMIT = 100; // min number of video links to get

  const limit = request.query.limit ?? LIMIT;
  const after = request.query.after ?? null;

  const { profilesArray, last, nonvideoPosts } = await ScrapeRedditForProfiles(
    limit,
    after
  );

  // chromaprofile
  //   .insertMany(profilesArray)
  //   .then(() => console.log("profilesArray inserted: ", profilesArray));

  const profilesString = profilesArray
    .map((post) => {
      const downloadLinksString = post.OPcommentLinks.map(
        (link) =>
          `<div><a href=${link} target="_blank">Download ${link}</a></div>`
      ).reduce((a, b) => a + b, "");
      return `<div style="
            border: 1px solid grey; 
            border-radius: 5px; 
            margin: 5px;
            padding: 10px; 
            box-shadow: 3px 3px 5px #aaaaaa;
          ">
          <div><a href=${post.link}>${post.title}</a> - ${post.reddit_likes} likes</div>
          <div>by ${post.OP}</div>
          <div>
            <video controls width="480" height="270" muted loop autoplay="autoplay">
              <source type="video/mp4" src=${post.videoURL} />
            </video>
          </div>
          <div>
            <video controls width="480" height="30" muted loop autoplay="autoplay">
              <source type="video/mp4" src=${post.audioURL} />
            </video>
          </div>
          ${downloadLinksString}
        </div>`;
    })
    .reduce((a, b) => a + b);

  const nonprofilesString = nonvideoPosts
    .map((post) => {
      return `<div style="
            display: flex;
            border: 1px solid grey; 
            border-radius: 5px; 
            margin: 5px;
            padding: 10px; 
            box-shadow: 3px 3px 5px #aaaaaa;
          ">
          <div><img src=${post.data.thumbnail} /></div>
          <div style="margin-left: 10px; width: 100%; display: flex; flex-direction: column">
            <div><a href=${post.data.url}>${post.data.title}</a></div>
            <div style="width: 100%; overflow-wrap: anywhere;">${post.data.selftext}</div>
          </div>
      </div>`;
    })
    .reduce((a, b) => a + b);

  const url = `http://localhost:3001/redditscraper?limit=${limit}&after=${last}`;
  const nextLinkString = `<div width="100%"><a href=${url}>next</a></div>`;

  const responseString = `<div style="display: flex;">
      <div>${profilesString}</div>
      <div>${nonprofilesString}</div>
    </div>
  <div>${nextLinkString}</div>`;

  response.send(responseString);
});

app.get("/videotest/", async (request, response) => {
  const videoURL =
    "https://v.redd.it/ub8ukmptrsn81/DASH_720.mp4?source=fallback";

  const audioURL =
    "https://v.redd.it/ub8ukmptrsn81/DASH_audio.mp4?source=fallback";

  const videoString = `<video controls muted autoplay="autoplay"><source type="video/mp4" src=${videoURL} /></video>`;
  const audioString = `<video controls muted autoplay="autoplay"><source type="video/mp4" src=${audioURL} /></video>`;

  response.send(videoString + audioString);
});
