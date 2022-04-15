const { DownloaderHelper } = require("node-downloader-helper");
const decompress = require("decompress");
const fs = require("fs");
const XmlReader = require("xml-reader");
const xmlQuery = require("xml-query");

const DIRECTORY = `./downloads/`;

const AnalyzeScrapes = async (postData) => {
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
    analyzedProfile.import_status === "OK"
      ? newProfiles.push(analyzedProfile)
      : rejectedProfiles.push(analyzedProfile);
  }

  return { newProfiles, rejectedProfiles };
};

const AnalyzeScrapedPost = async (post) => {
  /***
   * takes scraped video post data and returns the same post with:
   * { ...post, import_status, profiles: [ { devices, colours } ] }
   * early returns if no download, can't extract, or can't read xml
   */

  // /* TEMPORARY VALUE */
  const links = [
    "https://drive.google.com/uc?id=1NfRrdrDJ2DqanieRx4BCgE56RktwgBLV&export=download",
    "https://drive.google.com/uc?id=13m8UZa1tlyn_yuDGJ-gqZNyxR7MZUAKv&export=download"
  ];

  // const links = post.OPcommentLinks;
  // if (!links || links.length === 0)
  //   return { ...post, import_status: "NO LINKS", profiles: [] }; // early exit if the post has no links

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

const AnalyzeLink = async (link) => {
  // Download, Extract, XML-Query link to return { import_status, devices, colours };

  /* download the profile - get the filename */
  const downloadedfile = await DownloadFromURL(link).catch((error) => {
    console.error("DownloadFromURL Error: ", error);
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
    const { devices, colours } = await AnalyzeXMLFile(
      `${DIRECTORY}${fileName}`
    ).catch((error) => {
      console.error("Can't Analyze XML File: ", error);
    });

    if (devices && devices.length > 0 && colours && colours.length > 0) {
      profiles.push({ devices, colours });
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

const DownloadFromURL = async (url) => {
  /***
   * downloads the file at URL
   * returns the filename of the downloaded
   * returns null if no file
   */
  console.log("Attempting to download... ", url);

  const dl = new DownloaderHelper(url, DIRECTORY);

  return new Promise((resolve, reject) => {
    dl.on("end", async (downloadInfo) => {
      console.log("Downloaded ", downloadInfo.fileName);
      resolve(downloadInfo.fileName);
    });
    dl.on("error", (err) => {
      console.log("Download Failed ", err);
      return reject(err);
    });
    dl.start().catch((err) => {
      console.error(err);
      return reject(err);
    });
  });
};

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

  const devices = xq
    .find("Devices")
    .find("Device")
    .find("Name")
    .children()
    .map((element) => element.value);

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

  // console.log(`Colours (${colours.length}):`, colours);

  return { devices, colours };
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
exports.AnalyzeScrapes = AnalyzeScrapes;
