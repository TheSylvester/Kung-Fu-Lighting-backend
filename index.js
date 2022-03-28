const express = require("express");
const app = express();

const { ScrapeRedditForProfiles, GetRedditJSON } = require("./reddit-scraper");

const PORT = 3001;
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

app.get("/", async (request, response) => {
  const LIMIT = 5; // min number of video links to get
  const profilesArray = await ScrapeRedditForProfiles(LIMIT);

  response.send(
    profilesArray
      .map(
        (post) =>
          `<div>
            <div><a href=${post.link}>${post.title}</a> - ${post.reddit_likes} likes</div>
            <div>by ${post.OP}</div>
            <video width="480" height="270" controls muted autoplay="autoplay">
              <source type="video/mp4" src=${post.videoURL} />
            </video>
            <div><a href=${post.OPcommentLinks[0]} target="_blank">Download ${post.OPcommentLinks[0]}</a></div>
          </div>`
      )
      .reduce((a, b) => a + b)
  );
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
