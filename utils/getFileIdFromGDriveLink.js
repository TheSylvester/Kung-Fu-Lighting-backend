/**
 * @returns fileId if this is a gdrive link, or null
 * @param {String} url
 */
module.exports = function GetFileIdFromGDriveLink(url) {
  const gDriveRegExs = [
    /(?:https:\/\/drive\.google\.com\/file\/d\/)(.*)(?:\/view)/gi,
    /(?:https:\/\/drive\.google\.com\/open\?id=)(.*)$/gi,
    /(?:https:\/\/drive\.google\.com\/uc\?id=)(.*)&export=download/gi,
  ];

  const fileId = gDriveRegExs
    .map((regex) => {
      const match = regex.exec(url);
      if (!match) return null;
      return match[1];
    })
    .reduce((a, b) => {
      return b ? b : a ? a : null;
    });

  return fileId;
};
