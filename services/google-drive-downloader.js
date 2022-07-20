const { DownloaderHelper } = require("node-downloader-helper");
const Bottleneck = require("bottleneck");
// const jwt = require("jsonwebtoken");
// const fs = require("fs");
const axios = require("axios");

const DIRECTORY = `./downloads/`;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const MAX_FILE_SIZE = 3000000;

// const CREDENTIALS_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS;

/**
 * Returns fileId if the url points to a Google Drive document, or ""
 * @param { string } url
 * @returns { string }
 */
function GetFileIdFromGDriveLink(url) {
  const drive_regexps = [
    /(?:https:\/\/drive\.google\.com\/file\/d\/)(.*)(?:\/view)/gi,
    /(?:https:\/\/drive\.google\.com\/open\?id=)(.*)$/gi,
    /(?:https:\/\/drive\.google\.com\/uc\?id=)(.*)&export=download/gi,
  ];

  return drive_regexps
    .map((regex) => {
      const match = regex.exec(url);
      if (!match) return "";
      return match[1];
    })
    .reduce((a, b) => {
      return b ? b : a ? a : "";
    }); // file_id of the Google Drive file
}

/**
 * Get the user download_link for this fileId
 * @param {string} fileId
 * @returns {string}
 */
const GetDownloadLinkFromFileId = (fileId) =>
  `https://drive.google.com/uc?export=download&id=${fileId}`;

/**
 * downloads the file at url through google drive
 * @param { string } url - url
 * @returns { DownloaderResult } or
 *   { download_status: "FAILED", link_type: "", filename: "", download_link: "" }
 */
const DownloadFromGoogle = async (url) => {
  const fileId = GetFileIdFromGDriveLink(url);

  // empty return value on failed
  let download_status = "FAILED";
  let filename = "";
  let link_type = "";
  let download_link = "";

  // ESCAPE: Not a google link
  if (fileId === "")
    return { download_status, filename, link_type, download_link };

  filename = await DownloadByFileId(fileId).catch((error) => {
    if (error.status === 403 || error.status === "403") {
      console.log(
        "*******OMG 403 alert**********",
        `DownloadByFileId Error: ${error}`
      );
      link_type = "GOOGLE";
      download_status = "RETRY";
    }
  });

  // ESCAPE: Not Downloadable or not Google
  if (!filename || filename === "")
    return { download_status, filename, link_type, download_link };

  // Everything is fine, file is downloaded
  download_status = "OK";
  download_link = GetDownloadLinkFromFileId(fileId);

  return { download_status, filename, link_type: "GOOGLE", download_link };
};

/**
 * downloads the file at fileId through Google Drive
 * @param { string } fileId - Google file id to download
 * @returns { Promise } resolves to a { string }
 * - the filename of the downloaded, null if no file
 */
const DownloadByFileId = async (fileId) => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?key=${GOOGLE_API_KEY}`;
  const media_param = "&alt=media";

  /* Get the fileName by querying Google Drive without &alt=media */
  const response = await axios
    .get(url)
    .catch((err) => console.log(`${err.response.status} error`));

  // if the response is bad, and you can't get a fileName then don't dl just reject();
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
      if (downloadInfo.totalSize > MAX_FILE_SIZE) {
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
      if (downloadInfo.downloaded > MAX_FILE_SIZE) {
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
  reservoir: 10, // initial value
  reservoirRefreshAmount: 10,
  reservoirRefreshInterval: 10 * 1000, // must be divisible by 250
  maxConcurrent: 1,
  minTime: 1000,
});

const DownloadFromGoogle_limited = limiter.wrap(DownloadFromGoogle);

/** @type DownloadHandler */
exports.DownloadFromGoogle = DownloadFromGoogle_limited;
