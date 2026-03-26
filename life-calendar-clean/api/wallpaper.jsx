import { ImageResponse } from "@vercel/og";

export const config = {
  runtime: "edge",
};

// Load fonts at module level
const monoFontMedium = fetch(
  new URL("../fonts/ibm-plex-mono-500.ttf", import.meta.url)
).then((res) => res.arrayBuffer());

const monoFontRegular = fetch(
  new URL("../fonts/ibm-plex-mono-400.ttf", import.meta.url)
).then((res) => res.arrayBuffer());

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const birthday = searchParams.get("birthday");

  if (!birthday) {
    return new Response(JSON.stringify({ error: "Missing ?birthday=YYYY-MM-DD" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [monoMediumData, monoRegularData] = await Promise.all([
    monoFontMedium,
    monoFontRegular,
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

  // Snake grid params (in CSS pixels, will be scaled to 1170x2532)
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

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#f5f2ed",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          fontFamily: "Mono",
        }}
      >
        {/* Snake blocks */}
        {blocks.map((style, i) => (
          <div key={i} style={style} />
        ))}

        {/* Bottom text */}
        <div
          style={{
            position: "absolute",
            bottom: 50,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 500,
              color: "#1a1a1a",
              fontFamily: "Mono",
            }}
          >
            {remaining}
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "#999999",
              marginTop: 4,
              fontFamily: "Mono",
            }}
          >
            days to go
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: "#bbbbbb",
              marginTop: 6,
              fontFamily: "Mono",
            }}
          >
            {pct}%
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 400,
              color: "#cccccc",
              marginTop: 6,
              fontFamily: "Mono",
            }}
          >
            {dateStr}
          </div>
        </div>
      </div>
    ),
    {
      width: 1170,
      height: 2532,
      fonts: [
        {
          name: "Mono",
          data: monoMediumData,
          weight: 500,
          style: "normal",
        },
        {
          name: "Mono",
          data: monoRegularData,
          weight: 400,
          style: "normal",
        },
      ],
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    }
  );
}
