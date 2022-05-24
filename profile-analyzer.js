const { DownloaderHelper } = require("node-downloader-helper");
const Bottleneck = require("bottleneck");
const DownloadFromGoogle = require("./services/google-drive-downloader");
const decompress = require("decompress");
const fs = require("fs");
const XmlReader = require("xml-reader");
const xmlQuery = require("xml-query");

const DIRECTORY = `./downloads/`;
const PROFILESDIRECTORY = `./profile-archives/`;

/**
 * @typedef { Object } LinkBlock
 * @property { String } link - the href
 * @property { String } import_status - status of the link NEW | RETRY | REJECTED | OK | NOT A GOOGLE LINK
 */

/**
 * Download, Extract, & XML-Query link provided
 * only download if it's a google link
 * @param {String} link - url to analyze
 * @returns { linkBlock: { LinkBlock }, profiles: [ { devices: [], colours: [] } ] }
 */
const AnalyzeLink = async (link) => {
  console.log("...Analyzing ", link);
  const fileid = GetFileIdFromGDriveLink(link);
  /* see if link is a google drive link, if not, early exit */
  console.log("...fileid ", fileid);

  if (!fileid)
    return {
      linkBlock: {
        link,
        link_status: "NOT A GOOGLE LINK"
      },
      profiles: []
    }; // early exit if no download available

  /* download the profile - get the filename
   * if it's a 403 error 'cause Google's flood protection trips, RETRY later */
  let error403 = false;
  const downloadedfile = await DownloadFromGoogle(fileid).catch((error) => {
    error403 = error && (error.status === 403 || error.status === "403");
    console.log(
      error403
        ? "XXXXXXXXXXXXXXXXXX*******OMG 403 alert**********XXXXXXXXXXXXXXXXXXX"
        : `DownloadFromGoogle Error: ${error}`
    );
  });

  if (!downloadedfile)
    return {
      linkBlock: { link, link_status: error403 ? "RETRY" : "DOWNLOAD FAILED" },
      profiles: []
    }; // early exit if no download available
  if (!downloadedfile.match(/\.ChromaEffects$/)) {
    /* need to do a recursion here for .rar or .zip files */
    return {
      linkBlock: { link, link_status: "NOT A .CHROMAEFFECT" },
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

  /* Extract unsuccessful, delete file and early exit */
  if (!fileNames || fileNames.length === 0) {
    fs.unlink(`${DIRECTORY}${downloadedfile}`, (err) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("file deleted for cleanup ", downloadedfile);
    });
    return {
      linkBlock: { link, link_status: "EXTRACT FAILED" },
      profiles: []
    }; // early exit if can't extract
  }

  /* Analyze each file extracted, turning it into an array of profiles */
  let profiles = [];
  let link_status = ""; // single link_status because even if ONE file is OK then we import

  for (fileName of fileNames) {
    if (!fileName.match(/\.xml$/)) {
      console.log("Error - Not an XML File: ", fileName);
      link_status = "NOT XML FILE";
      continue; // early exit the for loop
    }
    /* xml parse */
    const { name, devices, colours, effects } = await AnalyzeXMLFile(
      `${DIRECTORY}${fileName}`
    ).catch((error) => {
      console.error("Can't Analyze XML File: ", error);
    });

    if (devices && devices.length > 0 && colours && colours.length > 0) {
      profiles.push({ link, name, devices, colours, effects });
      link_status = "OK";
    } else {
      /* if we haven't yet found an OK link, then we say it like it is */
      link_status = link_status === "OK" ? link_status : "XML FILE UNREADABLE";
    }
  }
  // cleanup the extracted files
  fileNames.forEach((file) => {
    fs.unlink(`${DIRECTORY}${file}`, (err) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("xml file deleted for cleanup ", file);
    });
  });

  if (link_status === "OK") {
    fs.rename(
      `${DIRECTORY}${downloadedfile}`,
      `${PROFILESDIRECTORY}${downloadedfile}`,
      (err) => {
        if (err) {
          console.error(err);
          return;
        }
        console.log(
          "** downloadedfile moved to Profiles Archive **",
          downloadedfile
        );
      }
    );
  } else {
    fs.unlink(`${DIRECTORY}${downloadedfile}`, (err) => {
      if (err) {
        console.error(err);
        return;
      }
      console.log("downloadedfile deleted for cleanup", downloadedfile);
    });
  }

  console.log("linkBlock: ", { link, link_status }, " profiles: ", profiles);

  return { linkBlock: { link, link_status }, profiles };
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
  console.log("Parsing XML file: ", xmlfile);

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
  console.log("EFFECTS: ", effects);

  let name = "";
  xq.find("Name").each((node) => {
    if (node.parent.name === "LightingEffects") name = node.children[0].value;
  });

  return { name, devices, colours, effects };
};

const ColorToHex = (color) => {
  let hex = color.toString(16);
  return hex.length == 1 ? "0" + hex : hex;
};

const ConvertRGBtoHex = ({ red, green, blue }) =>
  "#" + ColorToHex(red) + ColorToHex(green) + ColorToHex(blue);

/***
 * Extract the .ChromaProfile file
 * @param { string } source - filename to extract
 * @param { string } target - target directory
 * @returns { Array } filenames of the extracted files
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
  }
};

exports.AnalyzeLink = AnalyzeLink;
