/**
 * This module is the commentlink manager and is responsible for
 * checking all comment links and marking them as analyzed
 * creating Chromaprofiles
 */

const decompress = require("decompress");
const fs = require("fs");
const XmlReader = require("xml-reader");
const xmlQuery = require("xml-query");

const DIRECTORY = `./downloads/`;
const PROFILES_DIRECTORY = `./profile-archives/`;

/**
 * The below Chromaeffects Downloader plugins all must return these
 * @typedef { Object } DownloaderResult
 * @property { string } download_status - [ OK | RETRY | FAILED | RETRY_FAILED ]
 * @property { string } filename
 * @property { string } link_type
 * @property { string } download_link
 */

/**
 * @typedef { function(url: {string}):DownloaderResult } DownloadHandler
 */

const {
  /** @type DownloadHandler */ DownloadFromGoogle
} = require("./services/google-drive-downloader");

/**
 * Returns an array of comment links
 * from Redditpost based on OPCommentLinks
 * Turns them into new CommentLinks
 * @param { Redditpost } redditpost
 * @returns { CommentLink[] }
 */
const CommentLinksFromRedditpost = (redditpost) => {
  const links = redditpost.OPcommentLinks;
  const redditpost_id = redditpost._id;
  return links.map((original_link) => {
    return {
      _id: null,
      redditpost_id,
      original_link,
      link_type: "NEW",
      link_status: "NEW"
    };
  });
};

/**
 * CommentLinksFromRedditposts
 * @param { Redditpost[] } redditposts
 * @returns { CommentLink[] }
 */
const CommentLinksFromRedditposts = (redditposts) =>
  redditposts.flatMap((redditpost) => CommentLinksFromRedditpost(redditpost));

/**
 * AnalyzeCommentLink
 * Checks whether a link leads to a downloadable .chromaeffects file
 * returns the updated comment link
 * on success, it will create a Chromaprofile
 * @param {CommentLink} commentlink
 * @returns {{ updatedCommentLink: CommentLink, chromaprofileStub: Chromaprofile }}
 * updatedCommentLink - Updated version of commentlink
 * chromaprofileStub - a Chromaprofile representation of any found .chromaeffects file in commentlink,
 * but it's got null info for the redditpost parts, to be updated on insert
 */
const AnalyzeCommentLink = async (commentlink) => {
  // Return Values
  /** @type CommentLink */
  let updatedCommentLink;
  /** @type Chromaprofile */
  let chromaprofileStub = {
    _id: null,
    commentlink_id: null,
    download_link: "",
    local_likes: 0,
    lightingeffects: /** @type Lightingeffect[] */ [],
    redditpost_id: null,
    id36: "",
    title: "",
    link: "",
    OP: "",
    OP_id: "",
    archived: false,
    locked: false,
    created_utc: Math.floor(Date.now() / 1000),
    scraped_utc: Math.floor(Date.now() / 1000),
    score: 0,
    videoURL: "",
    audioURL: "",
    hlsURL: "",
    duration: 0,
    height: 0,
    width: 0,
    thumbnail: "",
    profile_status: "",
    tags: []
  };
  /** @type Lightingeffect[] */
  let lightingeffects = [];

  let downloadHandlers = [DownloadFromGoogle];

  const link = commentlink.original_link; // actual URL we are working with
  /** Logging */
  console.log("Analyzing url: ", link);

  const downloaderResults = await DownloadChromaeffectsFile(
    link,
    downloadHandlers
  );
  /** Logging */
  console.log(
    "downloaderResults: ",
    downloaderResults.download_status === "FAILED"
      ? "FAILED"
      : downloaderResults
  );

  // we can update the CommentLink now since this won't change again
  updatedCommentLink = {
    ...commentlink,
    link_type: downloaderResults.link_type,
    link_status:
      commentlink.link_status === "RETRY" &&
      downloaderResults.download_status === "RETRY"
        ? "RETRY_FAILED" // Double RETRY == RETRY_FAILED
        : downloaderResults.download_status
  };

  // now for the chromaprofileStub
  if (downloaderResults.filename) {
    lightingeffects = await AnalyzeFile(downloaderResults.filename);
  }

  // Lightingeffects found in valid .ChromaEffects file, update our chromaprofileStub
  if (lightingeffects.length > 0) {
    chromaprofileStub.commentlink_id = commentlink._id;
    chromaprofileStub.download_link = downloaderResults.download_link;
    chromaprofileStub.lightingeffects = lightingeffects;
    chromaprofileStub.redditpost_id = commentlink.redditpost_id;

    /** Logging */
    console.log(
      "*** chromaprofileStub - Name(s): ",
      lightingeffects.map(
        (x) => `${x.name} from ${chromaprofileStub.download_link} ***`
      )
    );
  }

  return {
    updatedCommentLink,
    chromaprofileStub
  };
};

/**
 * Downloads a .chromaeffects file from url and Returns the DownloaderResult
 * uses all the plugins available to it in downloaderHandlers
 * @param { string } url
 * @param { DownloadHandler[] } downloadHandlers
 * @returns { DownloaderResult }
 */
const DownloadChromaeffectsFile = async (url, downloadHandlers) => {
  /** @type { DownloaderResult } */
  let result = {
    download_status: "",
    filename: "",
    link_type: "",
    download_link: ""
  };

  // loop until download_status === "OK" or we've tried all the downloadHandlers
  let i = 0;
  while (result.download_status !== "OK" && i < downloadHandlers.length) {
    const downloadResult = await downloadHandlers[i](url);

    if (
      result.download_status === "" ||
      downloadResult.download_status === "OK" ||
      downloadResult.download_status === "RETRY"
    )
      result = downloadResult;
    i++;
  }

  return result;
};

/***
 * Extract a ".Chromaeffects" file
 * @param { string } source - filename to extract
 * @param { string } target - target directory
 * @returns { string[] } filenames of the extracted files
 */
const ExtractProfile = async (source, target) => {
  try {
    // await extract(source, { dir: target });
    const extracted = await decompress(source, target);
    const filenames = extracted.map((file) => file.path);
    console.log("Extraction Complete: ", filenames);

    return filenames;
  } catch (err) {
    // handle any errors
    console.log("Extraction Failed: ", err);
    return null;
  }
};

/**
 * AnalyzeFile - takes a file name and returns lightingeffects[]
 * - extracts a .chromaeffects file and analyzes each .xml found
 * deletes the file if it doesn't work out
 * @param downloadedFile
 * @returns { Lightingeffect[] } all lighting effects found in the file
 */
const AnalyzeFile = async (downloadedFile) => {
  /* extract the profile */
  const fileNames = await ExtractProfile(
    `${DIRECTORY}${downloadedFile}`,
    DIRECTORY
  ).catch((error) => {
    console.error("Extract Error: ", error);
  });

  /* If Extract unsuccessful, delete file and early exit */
  if (!fileNames || fileNames.length === 0) {
    deleteFile(downloadedFile);
    return []; // returning empty array for failure
  }

  /* Analyze each file extracted, turning it into an array of lightingeffect */
  let lightingeffects = [];

  for (let fileName of fileNames) {
    if (!fileName.match(/\.xml$/)) {
      console.log("Error - Not an XML File: ", fileName);
      continue; // early exit the for loop
    }
    /* xml parse */
    const { name, devices, colours, effects } = await AnalyzeXMLFile(
      `${DIRECTORY}${fileName}`
    ).catch((error) => {
      console.error("Can't Analyze XML File: ", error);
    });

    if (devices && devices.length > 0 && colours && colours.length > 0) {
      lightingeffects.push({ name, devices, colours, effects });
    }
  }
  // cleanup the extracted files
  fileNames.forEach((file) => {
    deleteFile(file);
  });

  // We either archive the downloadedFile if it's a valid .chromaeffects (has lightingeffects)
  // or we delete it
  if (lightingeffects.length > 0) {
    fs.rename(
      `${DIRECTORY}${downloadedFile}`,
      `${PROFILES_DIRECTORY}${downloadedFile}`,
      (err) => {
        if (err) {
          console.error(err);
          return;
        }
        console.log(
          "** downloadedFile moved to Profiles Archive **",
          downloadedFile
        );
      }
    );
  } else {
    deleteFile(downloadedFile);
  }
  return lightingeffects;
};

const readFilePromise = (...args) => {
  /* promisify fs */
  return new Promise((resolve, reject) => {
    fs.readFile(...args, (err, data) => {
      if (err) return reject(err);
      resolve(data);
    });
  });
};

/***
 * Analyze a single XML file and return the profiles found
 * @param { string } xmlFile - a relative file path xml file,
 * @return { Lightingeffect[] }
 */
const AnalyzeXMLFile = async (xmlFile) => {
  console.log("Parsing XML file: ", xmlFile);

  const xmlData = await readFilePromise(xmlFile, "utf8");
  const ast = XmlReader.parseSync(xmlData);
  const xq = xmlQuery(ast);

  const allDevices = xq
    .find("Devices")
    .find("Device")
    .find("Name")
    .children()
    .map((element) => element.value);

  const devices = [...new Set(allDevices)];

  const allColours = xq
    .find("Colors")
    .find("RzColor")
    .map((rzcolor) => {
      const redObject = rzcolor.children.find((child) => child.name === "Red");
      const red = redObject ? Number(redObject.children[0].value) : 0;
      const greenObject = rzcolor.children.find(
        (child) => child.name === "Green"
      );
      const green = greenObject ? Number(greenObject.children[0].value) : 0;
      const blueObject = rzcolor.children.find(
        (child) => child.name === "Blue"
      );
      const blue = blueObject ? Number(blueObject.children[0].value) : 0;

      return { red, green, blue };
    });

  /* uses Set() to filter out unique colours */
  const colours = [
    ...new Set(allColours.map((colour) => ConvertRGBtoHex(colour)))
  ];

  const allEffects = xq
    .find("EffectLayer")
    .find("Effect")
    .map((effect) => effect.children[0].value);
  const effects = [
    ...new Set(allEffects.filter((effect) => effect !== "none"))
  ];

  let name = "";
  xq.find("Name").each((node) => {
    if (node.parent.name === "LightingEffects") name = node.children[0].value;
  });

  return { name, devices, colours, effects };
};

// helper function
function deleteFile(file) {
  fs.unlink(`${DIRECTORY}${file}`, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("file deleted for cleanup ", file);
  });
}

const ColorToHex = (color) => {
  let hex = color.toString(16);
  return hex.length === 1 ? "0" + hex : hex;
};

const ConvertRGBtoHex = ({ red, green, blue }) =>
  "#" + ColorToHex(red) + ColorToHex(green) + ColorToHex(blue);

exports.CommentLinksFromRedditpost = CommentLinksFromRedditpost;
exports.CommentLinksFromRedditposts = CommentLinksFromRedditposts;
exports.AnalyzeCommentLink = AnalyzeCommentLink;
