import { Resvg } from "@resvg/resvg-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load fonts as base64 for SVG embedding
const monoFont500B64 = readFileSync(join(__dirname, "..", "fonts", "ibm-plex-mono-500.woff2")).toString("base64");
const monoFont400B64 = readFileSync(join(__dirname, "..", "fonts", "ibm-plex-mono-400.woff2")).toString("base64");
const sansFont400B64 = readFileSync(join(__dirname, "..", "fonts", "inter-400.woff2")).toString("base64");

// Also load as buffers for resvg
const monoFont500Buf = readFileSync(join(__dirname, "..", "fonts", "ibm-plex-mono-500.woff2"));
const monoFont400Buf = readFileSync(join(__dirname, "..", "fonts", "ibm-plex-mono-400.woff2"));
const sansFont400Buf = readFileSync(join(__dirname, "..", "fonts", "inter-400.woff2"));

export default function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const birthday = url.searchParams.get("birthday");

  if (!birthday) {
    res.status(400).json({ error: "Missing ?birthday=YYYY-MM-DD" });
    return;
  }

  const [year, month, day] = birthday.split("-").map(Number);
  const birthDate = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let nextBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
  if (nextBirthday <= today) {
    nextBirthday = new Date(today.getFullYear() + 1, birthDate.getMonth(), birthDate.getDate());
  }

  let lastBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
  if (lastBirthday > today) {
    lastBirthday = new Date(today.getFullYear() - 1, birthDate.getMonth(), birthDate.getDate());
  }

  const msPerDay = 86400000;
  const totalDays = Math.round((nextBirthday - lastBirthday) / msPerDay);
  const elapsed = Math.round((today - lastBirthday) / msPerDay);
  const remaining = totalDays - elapsed;
  const pct = ((elapsed / totalDays) * 100).toFixed(1);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateStr = `${monthNames[birthDate.getMonth()]} ${birthDate.getDate()}, ${nextBirthday.getFullYear()}`;

  const W = 1170;
  const H = 2532;

  const seg = 24;
  const gap = 7;
  const step = seg + gap;
  const marginX = 84;
  const startY = 200;
  const snakeH = 3;
  const acrossCols = Math.floor((W - marginX * 2 + gap) / step);
  const cornerR = 5;

  const positions = [];
  let count = 0;
  const runsNeeded = Math.ceil(totalDays / acrossCols) + 5;

  for (let run = 0; run < runsNeeded && count < totalDays; run++) {
    const goingRight = run % 2 === 0;
    const baseY = startY + run * (snakeH * step);

    for (let c = 0; c < acrossCols && count < totalDays; c++) {
      const col = goingRight ? c : acrossCols - 1 - c;
      positions.push({ x: marginX + col * step, y: baseY });
      count++;
    }

    if (count < totalDays) {
      const turnCol = goingRight ? acrossCols - 1 : 0;
      const turnX = marginX + turnCol * step;
      for (let v = 1; v < snakeH && count < totalDays; v++) {
        positions.push({ x: turnX, y: baseY + v * step });
        count++;
      }
    }
  }

  const filledColor = "#E8593C";
  const emptyColor = "#e0dbd4";

  let rects = "";
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const fill = i < elapsed ? filledColor : emptyColor;
    rects += `<rect x="${p.x}" y="${p.y}" width="${seg}" height="${seg}" rx="${cornerR}" fill="${fill}"/>`;
  }

  const bottomY = H - 200;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face {
        font-family: 'Mono';
        font-weight: 500;
        src: url('data:font/woff2;base64,${monoFont500B64}') format('woff2');
      }
      @font-face {
        font-family: 'Mono';
        font-weight: 400;
        src: url('data:font/woff2;base64,${monoFont400B64}') format('woff2');
      }
      @font-face {
        font-family: 'Sans';
        font-weight: 400;
        src: url('data:font/woff2;base64,${sansFont400B64}') format('woff2');
      }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="#f5f2ed"/>
  ${rects}
  <text x="${W / 2}" y="${bottomY}" text-anchor="middle" font-family="Mono" font-size="80" font-weight="500" fill="#1a1a1a">${remaining}</text>
  <text x="${W / 2}" y="${bottomY + 55}" text-anchor="middle" font-family="Sans" font-size="36" font-weight="400" fill="#999999">days to go</text>
  <text x="${W / 2}" y="${bottomY + 110}" text-anchor="middle" font-family="Mono" font-size="32" font-weight="400" fill="#bbbbbb">${pct}%</text>
  <text x="${W / 2}" y="${bottomY + 155}" text-anchor="middle" font-family="Sans" font-size="26" font-weight="400" fill="#cccccc">${dateStr}</text>
</svg>`;

  const resvg = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: {
      fontBuffers: [monoFont500Buf, monoFont400Buf, sansFont400Buf],
      loadSystemFonts: true,
    },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.status(200).send(Buffer.from(pngBuffer));
}
