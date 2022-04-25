const { DownloaderHelper } = require("node-downloader-helper");
const Bottleneck = require("bottleneck");
const DownloadFromGoogle = require("./services/google-drive-downloader");
const decompress = require("decompress");
const fs = require("fs");
const XmlReader = require("xml-reader");
const xmlQuery = require("xml-query");
const { Chromaprofile, Rejectedprofile } = require("./models/chromaprofile");

const DIRECTORY = `./downloads/`;

const AnalyzeAndSaveScrapes = async (postData) => {
  /**
   * takes scraped reddit data array of posts from postData and
   * returns a list of acceptable profiles ready for insert into database
   * and a list of rejected profiles with broken download links
   */
  let newProfiles = [];
  let rejectedProfiles = [];

  for (post of postData) {
    /* run each post through the Analyzer (download, extract, xml-q) to add the analysis information to it */
    const analyzedProfile = await AnalyzeScrapedPost(post);
    if (analyzedProfile.import_status === "OK") {
      const newProfile = new Chromaprofile(analyzedProfile);
      await newProfile.save().catch((e) => console.log(e));
      newProfiles.push(analyzedProfile);
      console.log(">>>>>>>>>>> PROFILE SAVED <<<<<<<<<<<<");
    } else {
      const rejectedProfile = new Rejectedprofile(analyzedProfile);
      await rejectedProfile.save().catch((e) => console.log(e));
      rejectedProfiles.push(analyzedProfile);
      console.log("xxxxxxxxxxxxx rejected xxxxxxxxxxx");
    }
  }

  return { newProfiles, rejectedProfiles };
};

/***
 * takes scraped video post data and returns the same post with:
 * { ...post, import_status, profiles: [ { devices, colours } ] }
 * early returns if no download, can't extract, or can't read xml
 */
const AnalyzeScrapedPost = async (post) => {
  const links = post.OPcommentLinks;
  if (!links || links.length === 0)
    return { ...post, import_status: "NO LINKS", profiles: [] }; // early exit if the post has no links

  let analysis = { import_status: "", profiles: [] }; // initially an empty analysis so we can for loop

  // for loops are best with async await
  for (const link of links) {
    const result = await AnalyzeLink(link); // { import_status, profiles: [{devices, colours} ]}
    analysis = {
      import_status:
        analysis.import_status === "OK" ? "OK" : result.import_status,
      profiles: [...analysis.profiles, ...result.profiles]
    };
  }

  console.log("analysis: ", analysis);
  /* put the analysis into the scrape */

  return { ...post, ...analysis };
};

/**
 * Download, Extract, & XML-Query link provided
 * only download if it's a google link
 * @param {String} link - url to analyze
 * @returns { import_status: { String }, profiles: [] } import_status, profiles }
 */
const AnalyzeLink = async (link) => {
  console.log("...Analyzing ", link);
  const fileid = GetFileIdFromGDriveLink(link);
  /* see if link is a google drive link, if not, early exit */
  console.log("...fileid ", fileid);

  if (!fileid)
    return {
      import_status: "NOT A GOOGLE LINK",
      profiles: []
    }; // early exit if no download available

  /* download the profile - get the filename */
  const downloadedfile = await DownloadFromGoogle(fileid).catch((error) => {
    console.error("DownloadFromGoogle Error: ", error);
  });

  if (!downloadedfile)
    return {
      import_status: "DOWNLOAD FAILED",
      profiles: []
    }; // early exit if no download available
  if (!downloadedfile.match(/\.ChromaEffects$/)) {
    /* need to do a recursion here for .rar or .zip files */
    return {
      import_status: "NOT A .CHROMAEFFECT",
      profiles: []
    };
  }

  /* extract the profile */
  const fileNames = await ExtractProfile(
    `${DIRECTORY}${downloadedfile}`,
    DIRECTORY
  ).catch((error) => {
    console.error("Extract Error: ", error);
  });

  /* delete downloadedFile after ExtractProfile regardless of success or fail */
  fs.unlink(`${DIRECTORY}${downloadedfile}`, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("file deleted for cleanup ", downloadedfile);
  });

  /* Extract unsuccessful early exit */
  if (!fileNames || fileNames.length === 0) {
    return {
      import_status: "EXTRACT FAILED",
      profiles: []
    }; // early exit if can't extract
  }

  /* Analyze each file extracted, turning it into an array of profiles */
  let profiles = [];
  let import_status = ""; // single import_status because even if ONE link is OK then we import

  for (fileName of fileNames) {
    if (!fileName.match(/\.xml$/)) {
      console.log("Error - Not an XML File: ", fileName);
      return {
        import_status: "NOT XML FILE",
        profiles: []
      }; // early exit if can't extract
    }

    /* xml parse */
    const { name, devices, colours } = await AnalyzeXMLFile(
      `${DIRECTORY}${fileName}`
    ).catch((error) => {
      console.error("Can't Analyze XML File: ", error);
    });

    if (devices && devices.length > 0 && colours && colours.length > 0) {
      profiles.push({ link, name, devices, colours });
      import_status = "OK";
    } else {
      import_status =
        import_status === "OK" ? import_status : "XML FILE UNREADABLE";
    }
  }

  fileNames.forEach((file) => {
    fs.unlink(`${DIRECTORY}${file}`, (err) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("file deleted for cleanup ", file);
    });
  });

  console.log("Import Status: ", import_status, " Profiles: ", profiles);

  return { import_status, profiles };
};

/**
 * @returns fileId if this is a gdrive link, or null
 * @param {String} url
 */
const GetFileIdFromGDriveLink = (url) => {
  const gdrive_regexs = [
    /(?:https:\/\/drive\.google\.com\/file\/d\/)(.*)(?:\/view)/gi,
    /(?:https:\/\/drive\.google\.com\/open\?id=)(.*)$/gi,
    /(?:https:\/\/drive\.google\.com\/uc\?id=)(.*)&export=download/gi
  ];

  const fileid = gdrive_regexs
    .map((regex) => {
      const match = regex.exec(url);
      if (!match) return null;
      return match[1];
    })
    .reduce((a, b) => {
      return b ? b : a ? a : null;
    });

  return fileid;
};

const DownloadFromURL = async (url) => {
  /***
   * downloads the file at URL
   * returns the filename of the downloaded
   * returns null if no file
   */

  const MAXFILESIZE = 3000000;

  console.log("Attempting to download... ", url);

  const dl = new DownloaderHelper(url, DIRECTORY, {
    timeout: 10000
  });

  return new Promise((resolve, reject) => {
    const extension_regex = /\.(\w+)$/gi;
    dl.on("download", async (downloadInfo) => {
      if (downloadInfo.totalSize > MAXFILESIZE) {
        console.log("Download is TOO LARGE");
        dl.stop();
        reject();
      }
      const match = extension_regex.exec(downloadInfo.fileName);
      const extension = match ? match[0] : "";
      if (extension !== ".ChromaEffects" && extension !== ".zip") {
        console.log("Download Not a .ChromaEffects or .zip");
        dl.stop();
        reject();
      }
    });
    dl.on("progress.throttled", async (downloadInfo) => {
      console.log(
        `...${downloadInfo.downloaded} bytes.  ${downloadInfo.progress}% complete`
      );
      if (downloadInfo.downloaded > MAXFILESIZE) {
        console.log("Downloaded ALREADY too big, stopping now...");
        dl.stop();
        reject();
      }
    });
    dl.on("end", async (downloadInfo) => {
      console.log("Downloaded ", downloadInfo.fileName);
      resolve(downloadInfo.fileName);
    });
    dl.on("error", (err) => {
      console.log(
        "Download Failed (status,message,body) ",
        err.status,
        err.message,
        err.body
      );
      return reject(err);
    });
    dl.start().catch((err) => {
      console.error(err);
      return reject(err);
    });
  });
};

/* Rate-Limited DownloadFromURL using Bottleneck */
const limiter = new Bottleneck({
  reservoir: 35, // initial value
  reservoirRefreshAmount: 35,
  reservoirRefreshInterval: 60 * 1000, // must be divisible by 250
  maxConcurrent: 1,
  minTime: 600
});
const DownloadFromURL_limited = limiter.wrap(DownloadFromURL);

const ProfileDownload = async (url = null) => {
  const extension_regex = /\.(\w+)$/gi;
  const dl = new DownloaderHelper(url, DIRECTORY, {
    fileName: (fileName) => {
      console.log("Downloading ", fileName);
      const match = extension_regex.exec(fileName);
      const extension = match ? match[0] : "";
      const newFileName = fileName.replace(extension, ".zip");

      return newFileName;
    }
  });

  return new Promise((resolve, reject) => {
    dl.on("end", async (downloadInfo) => {
      console.log("Download Complete!");

      const fileNames = await ExtractProfile(
        `${DIRECTORY}${downloadInfo.fileName}`,
        DIRECTORY
      );

      resolve(fileNames);
    });
    dl.on("error", (err) => {
      console.log("Download Failed", err);
      return reject(err);
    });
    dl.start().catch((err) => {
      console.error(err);
      return reject(err);
    });
  });
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

const AnalyzeXMLFile = async (xmlfile) => {
  /***
   * given a relative file path xmlfile,
   * return analyzed properties { devices, colours }
   */
  console.log("Trying to parse XML file: ", xmlfile);

  const xmldata = await readFilePromise(xmlfile, "utf8");
  const ast = XmlReader.parseSync(xmldata);
  const xq = xmlQuery(ast);

  const allDevices = xq
    .find("Devices")
    .find("Device")
    .find("Name")
    .children()
    .map((element) => element.value);

  const devices = [...new Set(allDevices)];
  // console.log("Devices: ", devices);

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

  let name = "";
  xq.find("Name").each((node) => {
    if (node.parent.name === "LightingEffects") name = node.children[0].value;
  });

  // console.log("***** PROFILENAME: ", name, " **********");
  // console.log(`Colours (${colours.length}):`, colours);

  return { name, devices, colours };
};

const ColorToHex = (color) => {
  let hex = color.toString(16);
  return hex.length == 1 ? "0" + hex : hex;
};

const ConvertRGBtoHex = ({ red, green, blue }) =>
  "#" + ColorToHex(red) + ColorToHex(green) + ColorToHex(blue);

const ExtractProfile = async (source, target) => {
  /***
   * Extract the .ChromaProfile file
   */
  try {
    // await extract(source, { dir: target });
    const extracted = await decompress(source, target);
    const filenames = extracted.map((file) => file.path);
    console.log("Extraction Complete: ", filenames);

    return filenames;
  } catch (err) {
    // handle any errors
    console.log("Extraction Failed: ", err);
  }
};

exports.ProfileDownload = ProfileDownload;
exports.AnalyzeXMLFile = AnalyzeXMLFile;
exports.AnalyzeScrapedPost = AnalyzeScrapedPost;
exports.AnalyzeScrapes = AnalyzeAndSaveScrapes;
exports.AnalyzeLink = AnalyzeLink;
