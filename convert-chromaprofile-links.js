// const mongo = require("./services/mongo.js");
const Chromaprofile = require("./models/chromaprofile.js");
const { GetFileIdFromGDriveLink } = require("./profile-analyzer.js");

const convertLink = (link) => {
  const fileId = GetFileIdFromGDriveLink(link);
  return fileId
    ? `https://drive.google.com/uc?export=download&id=${fileId}`
    : link;
};

const ConvertChromaprofileLinks = async () => {
  // const profiles = db.chromaprofiles.find({});
  const profiles = await Chromaprofile.find({}).exec();

  const updatedProfiles = profiles.map((profile) => {
    const pObject = profile.toObject();
    pObject.link = convertLink(pObject.link);
    return pObject;
  });

  let response = [];

  for (let profile of updatedProfiles) {
    console.log(profile._id);
    console.log(profile);

    let id = { _id: profile._id };
    let res = await Chromaprofile.findByIdAndUpdate(id, profile);
    response.push(res);
  }

  return response;
};

module.exports = ConvertChromaprofileLinks;
