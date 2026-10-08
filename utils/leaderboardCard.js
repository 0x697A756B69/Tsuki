const path = require("node:path");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { registerFonts, formatNumber, truncateText } = require("./rankCard");
const { loadAvatar } = require("./avatarCache");

const images = path.join(__dirname, "..", "assets", "images", "leaderboard");
const FONT = "Bricolage";
const WIDTH = 1500;
const HEIGHT = 1000;

const WHITE = "#ffffff";
const LIGHT = "#d0d0d0";
const DIM = "#a0a0a0";

const MEDALS = ["#f5c542", "#c0c8d4", "#cd8b4a"];
const WEEKDAYS = ["D", "L", "M", "M", "J", "V", "S"];
const PERIOD_LABELS = {
  global: "Depuis toujours",
  month: "Ce mois-ci",
  week: "Cette semaine",
};
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const ACTIVITY_TITLES = {
  global: "6 mois",
  month: "4 semaines",
  week: "7 jours",
};
const TYPE_LABELS = { messages: "Messages", voice: "Vocal" };

const ROW_HEIGHT = 76;
const TRAIL_SLOTS = 36;
const TRAIL_STEP = 14;
const SPRITE_SCALE = 3;
const AVATAR_SIZE = 48;
const AVATAR_X = 198;
const NAME_X = 258;
const AVATAR_PLACEHOLDER = "#5a5a5a";

let sky = null;
let sprites = null;

async function getSky() {
  sky ??= await loadImage(path.join(images, "sky.png"));
  return sky;
}

async function getSprites() {
  sprites ??= await Promise.all(
    Array.from({ length: 10 }, (_, phase) =>
      loadImage(path.join(images, `phase-${phase}.png`)),
    ),
  );
  return sprites;
}

function formatDuration(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0
    ? `${hours} h`
    : `${hours} h ${String(rest).padStart(2, "0")}`;
}

function getTrailLength(value, max, slots = TRAIL_SLOTS) {
  if (!(value > 0) || !(max > 0)) return 0;
  return Math.min(slots, Math.max(1, Math.round((value / max) * slots)));
}

function getMedalColor(position) {
  return MEDALS[position - 1] ?? LIGHT;
}

function getMoonPhase(position) {
  return Math.min(9, Math.max(0, position - 1));
}

function getActivityBlocks(values, maxBlocks) {
  const peak = Math.max(0, ...values);
  return values.map((value) => ({
    blocks: value > 0 ? Math.max(1, Math.round((value / peak) * maxBlocks)) : 0,
    peak: peak > 0 && value === peak,
  }));
}

function getWeekdayLabel(day) {
  return WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
}

function getActivityLabel(period, day) {
  if (period === "week") return getWeekdayLabel(day);
  if (period === "month")
    return `${Number(day.slice(8))}/${Number(day.slice(5, 7))}`;
  return MONTHS[Number(day.slice(5, 7)) - 1];
}

function getActivityTitle(period) {
  return `Activité · ${ACTIVITY_TITLES[period] ?? ACTIVITY_TITLES.week}`;
}

function getPeriodLabel(period) {
  return PERIOD_LABELS[period] ?? PERIOD_LABELS.global;
}

function getTypeLabel(type) {
  return TYPE_LABELS[type] ?? TYPE_LABELS.messages;
}

function formatValue(type, value) {
  return type === "voice" ? formatDuration(value) : formatNumber(value);
}

function frostedPanel(ctx, background, x, y, width, height) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 24);
  ctx.clip();
  ctx.filter = "blur(10px)";
  ctx.drawImage(background, 0, 0, WIDTH, HEIGHT);
  ctx.filter = "none";
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(x, y, width, height);
  ctx.restore();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 24);
  ctx.stroke();
}

function measureWith(ctx) {
  return (text) => ctx.measureText(text).width;
}

function drawHeader(ctx, background, { type, period }) {
  const top = 30;
  const height = 100;
  frostedPanel(ctx, background, 40, top, 920, height);
  ctx.textBaseline = "alphabetic";

  const centeredBaseline = (font) => {
    ctx.font = font;
    return top + height / 2 + ctx.measureText("H").actualBoundingBoxAscent / 2;
  };

  ctx.textAlign = "left";
  ctx.fillStyle = WHITE;
  const titleFont = `600 72px ${FONT}`;
  ctx.fillText("Classement", 72, centeredBaseline(titleFont));

  ctx.textAlign = "right";
  ctx.fillStyle = LIGHT;
  const subtitleFont = `400 32px ${FONT}`;
  ctx.fillText(
    `${getTypeLabel(type)} · ${getPeriodLabel(period)}`,
    928,
    centeredBaseline(subtitleFont),
  );
}

function drawAvatar(ctx, avatar, x, y) {
  const radius = AVATAR_SIZE / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + radius, y + radius, radius, 0, Math.PI * 2);
  if (avatar) {
    ctx.clip();
    ctx.drawImage(avatar, x, y, AVATAR_SIZE, AVATAR_SIZE);
  } else {
    ctx.fillStyle = AVATAR_PLACEHOLDER;
    ctx.fill();
  }
  ctx.restore();
}

function drawTrail(ctx, x, y, length, color) {
  for (let index = 0; index < length; index++) {
    ctx.globalAlpha = 0.25 + 0.75 * ((index + 1) / length);
    ctx.fillStyle = color;
    ctx.fillRect(x + index * TRAIL_STEP, y, 8, 8);
  }
  ctx.globalAlpha = 1;
}

async function drawMembers(ctx, background, { type, members }) {
  frostedPanel(ctx, background, 40, 150, 920, 810);
  ctx.textBaseline = "alphabetic";

  if (members.length === 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = DIM;
    ctx.font = `400 32px ${FONT}`;
    ctx.fillText("Aucune activité pour le moment", 500, 560);
    return;
  }

  const moons = await getSprites();
  const max = Math.max(...members.map((member) => member.value));
  const shown = members.slice(0, 10);
  const avatars = await Promise.all(
    shown.map((member) => loadAvatar(member.avatar)),
  );

  shown.forEach((member, index) => {
    const position = index + 1;
    const top = 174 + index * ROW_HEIGHT;
    const medal = getMedalColor(position);

    ctx.textAlign = "left";
    ctx.fillStyle = position <= 3 ? medal : DIM;
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(`#${position}`, 72, top + 34);

    const moon = moons[getMoonPhase(position)];
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      moon,
      150,
      top + 8,
      moon.width * SPRITE_SCALE,
      moon.height * SPRITE_SCALE,
    );
    ctx.imageSmoothingEnabled = true;

    drawAvatar(ctx, avatars[index], AVATAR_X, top + 10);

    ctx.fillStyle = WHITE;
    ctx.font = `600 32px ${FONT}`;
    ctx.fillText(
      truncateText(member.name, 502, measureWith(ctx)),
      NAME_X,
      top + 34,
    );

    ctx.textAlign = "right";
    ctx.fillStyle = LIGHT;
    ctx.fillText(formatValue(type, member.value), 928, top + 34);

    drawTrail(
      ctx,
      NAME_X,
      top + 48,
      getTrailLength(member.value, max),
      position <= 3 ? medal : DIM,
    );
  });
}

function drawActivity(ctx, background, { period, activity }) {
  const x = 1000;
  const y = 400;
  frostedPanel(ctx, background, x, y, 460, 200);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = LIGHT;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(getActivityTitle(period), x + 28, y + 42);

  const columns = getActivityBlocks(
    activity.map((entry) => entry.value),
    6,
  );
  const baseline = y + 156;
  const step = 60;
  const offset = (404 - ((columns.length - 1) * step + 40)) / 2;
  columns.forEach((column, index) => {
    const left = x + 28 + offset + index * step;
    ctx.fillStyle = column.peak ? WHITE : DIM;
    for (let block = 0; block < column.blocks; block++)
      ctx.fillRect(left, baseline - (block + 1) * 16, 40, 12);

    ctx.fillStyle = DIM;
    ctx.font = `400 22px ${FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(
      getActivityLabel(period, activity[index].day),
      left + 20,
      y + 184,
    );
  });
}

function drawList(ctx, background, { title, rows, y, format }) {
  const x = 1000;
  frostedPanel(ctx, background, x, y, 460, 160);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = LIGHT;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(title, x + 28, y + 42);

  ctx.font = `400 22px ${FONT}`;
  rows.slice(0, 3).forEach((row, index) => {
    const baseline = y + 80 + index * 32;
    ctx.textAlign = "left";
    ctx.fillStyle = WHITE;
    ctx.fillText(
      truncateText(row.name, 270, measureWith(ctx)),
      x + 28,
      baseline,
    );
    ctx.textAlign = "right";
    ctx.fillStyle = LIGHT;
    ctx.fillText(format(row.value), x + 432, baseline);
  });

  if (rows.length === 0) {
    ctx.textAlign = "left";
    ctx.fillStyle = DIM;
    ctx.fillText("Rien pour le moment", x + 28, y + 80);
  }
}

async function renderLeaderboard({
  type,
  period,
  members,
  activity,
  channels,
  voice = null,
}) {
  registerFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");
  const background = await getSky();

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(background, 0, 0, WIDTH, HEIGHT);
  ctx.imageSmoothingEnabled = true;

  drawHeader(ctx, background, { type, period });
  await drawMembers(ctx, background, { type, members });
  drawActivity(ctx, background, { period, activity });
  drawList(ctx, background, {
    title: "Salons",
    rows: channels,
    y: 620,
    format: formatNumber,
  });
  if (voice)
    drawList(ctx, background, {
      title: "Vocal",
      rows: voice,
      y: 800,
      format: formatDuration,
    });

  return canvas.encode("png");
}

module.exports = {
  renderLeaderboard,
  formatDuration,
  getTrailLength,
  getMedalColor,
  getMoonPhase,
  getActivityBlocks,
  getWeekdayLabel,
  getActivityLabel,
  getActivityTitle,
  getPeriodLabel,
  getTypeLabel,
};
