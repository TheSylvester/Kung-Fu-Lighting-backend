const { DownloaderHelper } = require("node-downloader-helper");
const decompress = require("decompress");
const fs = require("fs");
const XmlReader = require("xml-reader");
const xmlQuery = require("xml-query");

const DIRECTORY = `./downloads/`;

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
  console.log("Parsing XML file: ", xmlfile);

  const xmldata = await readFilePromise(xmlfile, "utf8");
  const ast = XmlReader.parseSync(xmldata);
  const xq = xmlQuery(ast);

  const devices = xq
    .find("Devices")
    .find("Device")
    .find("Name")
    .children()
    .map((element) => element.value);

  console.log("Devices: ", devices);

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

  const colours = [
    ...new Set(allColours.map((colour) => ConvertRGBtoHex(colour)))
  ];

  console.log(`Colours (${colours.length}):`, colours);

  return { devices, colours };
};

const ColorToHex = (color) => {
  let hex = color.toString(16);
  return hex.length == 1 ? "0" + hex : hex;
};

const ConvertRGBtoHex = ({ red, green, blue }) =>
  "#" + ColorToHex(red) + ColorToHex(green) + ColorToHex(blue);

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

exports.ProfileDownload = ProfileDownload;
exports.AnalyzeXMLFile = AnalyzeXMLFile;
