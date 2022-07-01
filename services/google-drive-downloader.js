const { DownloaderHelper } = require("node-downloader-helper");
const Bottleneck = require("bottleneck");
// const jwt = require("jsonwebtoken");
// const fs = require("fs");
const axios = require("axios");

const DIRECTORY = `./downloads/`;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const MAXFILESIZE = 3000000;

// const CREDENTIALSFILE = process.env.GOOGLE_APPLICATION_CREDENTIALS;

/**
 * downloads the file at fileid through google drive
 * @param { string } fileid - Google file id to download
 * @returns the filename of the downloaded,
 *          or null if no file
 */
const DownloadFromGoogle = async (fileid) => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileid}?key=${GOOGLE_API_KEY}`;
  const media_param = "&alt=media";

  /* Get the fileName by querying Google Drive without &alt=media */
  const response = await axios
    .get(url)
    .catch((err) => console.log(`${err.response.status} error`));

  // if the response is bad and you can't get a fileName then don't dl just reject();
  const fileName = response.data.name ?? null;

  const dl = fileName
    ? new DownloaderHelper(url + media_param, DIRECTORY, {
        timeout: 10000,
        fileName,
      })
    : null;

  return new Promise((resolve, reject) => {
    if (!fileName) reject(); // no file, no download, no downloaded
    dl.on("download", async (downloadInfo) => {
      if (downloadInfo.totalSize > MAXFILESIZE) {
        console.log("Download is TOO LARGE");
        await dl.stop();
        reject();
      }
      /* this tests file extension, but we are assigning file extension */
      const extension_regex = /\.(\w+)$/gi;
      const match = extension_regex.exec(downloadInfo.fileName);
      const extension = match ? match[0] : "";
      if (extension !== ".ChromaEffects" && extension !== ".zip") {
        console.log("Download Not a .ChromaEffects or .zip");
        await dl.stop();
        reject();
      }
      /* end file extension test */
    });
    dl.on("progress.throttled", async (downloadInfo) => {
      console.log(
        `...${downloadInfo.downloaded} bytes.  ${downloadInfo.progress}% complete`
      );
      if (downloadInfo.downloaded > MAXFILESIZE) {
        console.log("Downloaded ALREADY too big, stopping now...");
        await dl.stop();
        reject();
      }
    });
    dl.on("error", (err) => {
      /* console.log(
        "Download Failed (status,message,body) ",
        err.status,
        err.message,
        err.body
      ); */
      return reject(err);
    });
    dl.on("end", async (downloadInfo) => {
      console.log("Downloaded ", downloadInfo.fileName);
      resolve(downloadInfo.fileName);
    });
    dl.start().catch((err) => {
      // console.log(err);
      return reject(err);
    });
  });
};

/* Rate-Limited DownloadFromGoogle using Bottleneck */
const limiter = new Bottleneck({
  reservoir: 50, // initial value
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 10 * 1000, // must be divisible by 250
  maxConcurrent: 1,
  minTime: 250,
});
const DownloadFromGoogle_limited = limiter.wrap(DownloadFromGoogle);

module.exports = DownloadFromGoogle_limited;
