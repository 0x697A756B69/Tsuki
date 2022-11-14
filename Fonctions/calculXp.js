module.exports = async (xp, Level) => {
  let xptotal = 0;
  for (let i = 0; i < Level; i++) xptotal += parseInt((Level + 1) * 1000);
  xptotal += xp;
  return xptotal;
};
