const satori = require("satori").default || require("satori");
const { Resvg } = require("@resvg/resvg-js");

// Fetch fonts from Google Fonts CDN
const FONT_MEDIUM_URL =
  "https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJ8lc.ttf";
const FONT_REGULAR_URL =
  "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf";

module.exports = async function handler(req, res) {
  try {
  const birthday = req.query.birthday;

  if (!birthday) {
    return res.status(400).json({ error: "Missing ?birthday=YYYY-MM-DD" });
  }

  const [monoMediumData, monoRegularData] = await Promise.all([
    fetch(FONT_MEDIUM_URL).then((r) => r.arrayBuffer()),
    fetch(FONT_REGULAR_URL).then((r) => r.arrayBuffer()),
  ]);

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

  // Snake grid params
  const seg = 8;
  const gap = 2.3;
  const step = seg + gap;
  const marginX = 28;
  const startY = 66;
  const snakeH = 3;
  const W = 390;

  const acrossCols = Math.floor((W - marginX * 2 + gap) / step);

  // Build snake positions
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

  // Build the blocks as absolutely positioned divs
  const blocks = positions.map((p, i) => ({
    position: "absolute",
    left: p.x,
    top: p.y,
    width: seg,
    height: seg,
    borderRadius: 1.7,
    backgroundColor: i < elapsed ? "#E8593C" : "#e0dbd4",
  }));

  const jsx = {
    type: "div",
    props: {
      style: {
        width: "100%",
        height: "100%",
        backgroundColor: "#f5f2ed",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        fontFamily: "Mono",
      },
      children: [
        // Snake blocks wrapper
        {
          type: "div",
          props: {
            style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex" },
            children: blocks.map((style) => ({
              type: "div",
              props: { style },
            })),
          },
        },
        // Bottom text
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              bottom: 50,
              left: 0,
              right: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            },
            children: [
              {
                type: "div",
                props: {
                  style: { fontSize: 28, fontWeight: 500, color: "#1a1a1a", fontFamily: "Mono", display: "flex" },
                  children: String(remaining),
                },
              },
              {
                type: "div",
                props: {
                  style: { fontSize: 12, fontWeight: 400, color: "#999999", marginTop: 4, fontFamily: "Mono", display: "flex" },
                  children: "days to go",
                },
              },
              {
                type: "div",
                props: {
                  style: { fontSize: 11, fontWeight: 400, color: "#bbbbbb", marginTop: 6, fontFamily: "Mono", display: "flex" },
                  children: String(pct) + "%",
                },
              },
              {
                type: "div",
                props: {
                  style: { fontSize: 9, fontWeight: 400, color: "#cccccc", marginTop: 6, fontFamily: "Mono", display: "flex" },
                  children: dateStr,
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(jsx, {
    width: 1170,
    height: 2532,
    fonts: [
      {
        name: "Mono",
        data: Buffer.from(monoMediumData),
        weight: 500,
        style: "normal",
      },
      {
        name: "Mono",
        data: Buffer.from(monoRegularData),
        weight: 400,
        style: "normal",
      },
    ],
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1170 },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  return res.send(pngBuffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
