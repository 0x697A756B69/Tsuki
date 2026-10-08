const path = require("node:path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const assets = path.join(__dirname, "..", "assets");
const FONT = "Bricolage";
const WIDTH = 1500;
const HEIGHT = 500;
const TEXT_LEFT = 360;
const BAR_RIGHT = 1440;
const NAME_MAX_WIDTH = 600;
const RANK_MAX_WIDTH = 190;

const DEFAULT_COLORS = ["#7d8aa8", "#ffffff"];

let background = null;
let fontsReady = false;

function registerFonts() {
  if (fontsReady) return;
  GlobalFonts.registerFromPath(
    path.join(assets, "fonts", "bricolage-grotesque-latin-400-normal.woff2"),
    FONT,
  );
  GlobalFonts.registerFromPath(
    path.join(assets, "fonts", "bricolage-grotesque-latin-600-normal.woff2"),
    FONT,
  );
  fontsReady = true;
}

async function getBackground() {
  background ??= await loadImage(
    path.join(assets, "images", "sleepy-banner.png"),
  );
  return background;
}

function formatNumber(value) {
  return new Intl.NumberFormat("fr-FR").format(value).replace(/\s/g, " ");
}

function getBarRatio(current, required) {
  if (!(required > 0) || !(current > 0)) return 0;
  return Math.min(1, current / required);
}

function truncateText(text, maxWidth, measure) {
  if (measure(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`) > maxWidth)
    cut = cut.slice(0, -1);
  return `${cut}…`;
}

function fitFontSize(text, maxWidth, measure, maxSize, minSize, step = 4) {
  let size = maxSize;
  while (size > minSize && measure(text, size) > maxWidth) size -= step;
  return Math.max(size, minSize);
}

function roundedBar(ctx, x, y, width, height) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, height / 2);
}

async function renderRankCard({
  username,
  avatar,
  level,
  current,
  required,
  totalXp,
  position,
  ranked,
  colors = DEFAULT_COLORS,
}) {
  registerFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(await getBackground(), 0, 0, WIDTH, HEIGHT);
  ctx.imageSmoothingEnabled = true;

  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.beginPath();
  ctx.roundRect(30, 30, WIDTH - 60, HEIGHT - 60, 36);
  ctx.fill();

  const avatarSize = 260;
  const avatarX = 70;
  const avatarY = (HEIGHT - avatarSize) / 2;
  const avatarCenterX = avatarX + avatarSize / 2;
  const avatarCenterY = avatarY + avatarSize / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(
    await loadImage(avatar),
    avatarX,
    avatarY,
    avatarSize,
    avatarSize,
  );
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#e8e8e8";
  ctx.beginPath();
  ctx.arc(avatarCenterX, avatarCenterY, avatarSize / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 64px ${FONT}`;
  ctx.fillText(
    truncateText(
      username,
      NAME_MAX_WIDTH,
      (text) => ctx.measureText(text).width,
    ),
    TEXT_LEFT,
    150,
  );

  ctx.fillStyle = "#c8c8c8";
  ctx.font = `400 38px ${FONT}`;
  ctx.fillText(`Niveau ${level}`, TEXT_LEFT, 215);

  const rankText = `#${position}`;
  const rankSize = fitFontSize(
    rankText,
    RANK_MAX_WIDTH,
    (text, size) => {
      ctx.font = `600 ${size}px ${FONT}`;
      return ctx.measureText(text).width;
    },
    84,
    32,
  );
  ctx.textAlign = "right";
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#c8c8c8";
  ctx.font = `400 26px ${FONT}`;
  ctx.fillText("RANG", BAR_RIGHT, 160);
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${rankSize}px ${FONT}`;
  ctx.fillText(rankText, BAR_RIGHT, 240);
  ctx.fillStyle = "#c8c8c8";
  ctx.font = `400 26px ${FONT}`;
  ctx.fillText(`sur ${formatNumber(ranked)}`, BAR_RIGHT, 282);
  ctx.shadowBlur = 0;

  const barX = TEXT_LEFT;
  const barY = 330;
  const barWidth = BAR_RIGHT - TEXT_LEFT;
  const barHeight = 44;
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  roundedBar(ctx, barX, barY, barWidth, barHeight);
  ctx.fill();

  const ratio = getBarRatio(current, required);
  if (ratio > 0) {
    const fillWidth = Math.max(barHeight, barWidth * ratio);
    const gradient = ctx.createLinearGradient(barX, 0, barX + fillWidth, 0);
    colors.forEach((color, index) =>
      gradient.addColorStop(index / (colors.length - 1), color),
    );
    ctx.fillStyle = gradient;
    roundedBar(ctx, barX, barY, fillWidth, barHeight);
    ctx.fill();
  }

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 34px ${FONT}`;
  ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
  ctx.shadowBlur = 8;
  ctx.textAlign = "left";
  ctx.fillText(
    `${formatNumber(current)} / ${formatNumber(required)} XP`,
    barX,
    430,
  );
  ctx.textAlign = "right";
  ctx.fillText(`${formatNumber(totalXp)} XP au total`, BAR_RIGHT, 430);

  return canvas.encode("png");
}

module.exports = {
  renderRankCard,
  registerFonts,
  formatNumber,
  getBarRatio,
  truncateText,
  fitFontSize,
};
