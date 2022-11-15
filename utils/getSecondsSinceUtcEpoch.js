/**
 * returns seconds since Unix epoch from Date object
 * @param year
 * @param month
 * @returns {number}
 */
module.exports = function getSecondsSinceUtcEpoch(year, month) {
  return new Date(year, month).getTime() / 1000;
};
