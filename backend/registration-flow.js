"use strict";
const { STATE_CODES } = require("./access-control");
const STATE_CODE_BY_NAME = Object.fromEntries(
  Object.entries(STATE_CODES).map(([code, name]) => [name, code]),
);
function practiceGstin(state, pan) {
  const code = STATE_CODE_BY_NAME[state];
  if (!code)
    throw Object.assign(new Error("Select a supported State / UT."), {
      status: 400,
    });
  const base = `${code}${pan}1Z`;
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let factor = 2,
    sum = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    const product = alphabet.indexOf(base[i]) * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 2 ? 1 : 2;
  }
  return base + alphabet[(36 - (sum % 36)) % 36];
}
module.exports = { STATE_CODE_BY_NAME, practiceGstin };
