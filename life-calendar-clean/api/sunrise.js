const satori = require("satori").default || require("satori");
const { Resvg } = require("@resvg/resvg-js");

const FONT_MEDIUM_URL =
  "https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJ8lc.ttf";
const FONT_REGULAR_URL =
  "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf";

// ── Solar position math ──────────────────────────────────────────────
// Based on NOAA solar calculations (no external API needed)

function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

function julianDay(year, month, day) {
  if (month <= 2) { year--; month += 12; }
  const A = Math.floor(year / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

function solarTimes(lat, lng, date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const JD = julianDay(year, month, day);
  const JC = (JD - 2451545) / 36525; // Julian century

  // Sun's geometric mean longitude (deg)
  const L0 = (280.46646 + JC * (36000.76983 + 0.0003032 * JC)) % 360;
  // Sun's mean anomaly (deg)
  const M = 357.52911 + JC * (35999.05029 - 0.0001537 * JC);
  // Eccentricity of Earth's orbit
  const e = 0.016708634 - JC * (0.000042037 + 0.0000001267 * JC);

  // Sun's equation of center
  const sinM = Math.sin(toRad(M));
  const sin2M = Math.sin(toRad(2 * M));
  const sin3M = Math.sin(toRad(3 * M));
  const C = sinM * (1.914602 - JC * (0.004817 + 0.000014 * JC))
    + sin2M * (0.019993 - 0.000101 * JC)
    + sin3M * 0.000289;

  // Sun's true longitude & anomaly
  const sunLon = L0 + C;

  // Sun's apparent longitude
  const omega = 125.04 - 1934.136 * JC;
  const lambda = sunLon - 0.00569 - 0.00478 * Math.sin(toRad(omega));

  // Mean obliquity of the ecliptic
  const obliq0 = 23 + (26 + (21.448 - JC * (46.815 + JC * (0.00059 - JC * 0.001813))) / 60) / 60;
  const obliq = obliq0 + 0.00256 * Math.cos(toRad(omega));

  // Sun's declination
  const sinDec = Math.sin(toRad(obliq)) * Math.sin(toRad(lambda));
  const dec = toDeg(Math.asin(sinDec));

  // Equation of time (minutes)
  const y = Math.tan(toRad(obliq / 2)) ** 2;
  const eqTime = 4 * toDeg(
    y * Math.sin(2 * toRad(L0))
    - 2 * e * Math.sin(toRad(M))
    + 4 * e * y * Math.sin(toRad(M)) * Math.cos(2 * toRad(L0))
    - 0.5 * y * y * Math.sin(4 * toRad(L0))
    - 1.25 * e * e * Math.sin(2 * toRad(M))
  );

  // Hour angle of sunrise (deg)
  const zenith = 90.833; // official sunrise/sunset zenith
  const cosHA = (Math.cos(toRad(zenith)) / (Math.cos(toRad(lat)) * Math.cos(toRad(dec))))
    - Math.tan(toRad(lat)) * Math.tan(toRad(dec));

  // Handle polar day/night
  if (cosHA > 1) {
    // Sun never rises (polar night)
    return { sunrise: null, sunset: null, solarNoon: 720 - (4 * lng) - eqTime, polarNight: true };
  }
  if (cosHA < -1) {
    // Sun never sets (midnight sun)
    return { sunrise: null, sunset: null, solarNoon: 720 - (4 * lng) - eqTime, midnightSun: true };
  }

  const HA = toDeg(Math.acos(cosHA));

  // Times in minutes from midnight UTC
  const solarNoonUTC = 720 - (4 * lng) - eqTime;
  const sunriseUTC = solarNoonUTC - HA * 4;
  const sunsetUTC = solarNoonUTC + HA * 4;

  return {
    sunrise: sunriseUTC,   // minutes from midnight UTC
    sunset: sunsetUTC,
    solarNoon: solarNoonUTC,
  };
}

// ── Sky gradient & phase logic ───────────────────────────────────────

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");
}

function lerpColor(hex1, hex2, t) {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

function lerpGradient(grad1, grad2, t) {
  const result = [];
  const len = Math.min(grad1.length, grad2.length);
  for (let i = 0; i < len; i++) {
    result.push(lerpColor(grad1[i], grad2[i], t));
  }
  return result;
}

// Phase definitions — each has a 5-stop vertical gradient and sun/moon properties
const PHASES = {
  night: {
    gradient: ["#0B0E1A", "#0F1428", "#141C36", "#1A2444", "#1A2444"],
    sunColor: null, // moon instead
    moonColor: "#E8E4D4",
    glowColor: null,
    stars: true,
  },
  dawn: {
    gradient: ["#7EAAC8", "#B8C8D8", "#D4B8B0", "#F0C8A8", "#FFF8EC"],
    sunColor: "#FFF0D0",
    moonColor: null,
    glowColor: "rgba(255, 220, 160, 0.3)",
    stars: false,
  },
  day: {
    gradient: ["#4A90C4", "#6AA8D8", "#7AB4E0", "#C8E2F4", "#E4F0FA"],
    sunColor: "#FFFBE8",
    moonColor: null,
    glowColor: "rgba(255, 255, 230, 0.35)",
    stars: false,
  },
  dusk: {
    gradient: ["#1E2852", "#4A3060", "#6E3B6A", "#B8506A", "#E89848"],
    sunColor: "#F0A050",
    moonColor: null,
    glowColor: "rgba(240, 140, 60, 0.3)",
    stars: false,
  },
};

function getPhaseAndBlend(nowMinUTC, sunTimes) {
  const { sunrise, sunset } = sunTimes;

  // Handle polar cases
  if (sunTimes.polarNight) return { phase: "night", blend: null, t: 0 };
  if (sunTimes.midnightSun) return { phase: "day", blend: null, t: 0 };

  const dawnStart = sunrise - 60;   // 1 hour before sunrise
  const dawnEnd = sunrise + 30;     // 30 min after sunrise
  const duskStart = sunset - 60;    // 1 hour before sunset
  const duskEnd = sunset + 30;      // 30 min after sunset

  // Normalize nowMinUTC into 0-1440 range
  let now = nowMinUTC;
  if (now < 0) now += 1440;
  if (now >= 1440) now -= 1440;

  // Night → Dawn transition
  if (now >= dawnStart && now < sunrise) {
    const t = (now - dawnStart) / (sunrise - dawnStart);
    return { phase: "night", blend: "dawn", t };
  }
  // Dawn peak
  if (now >= sunrise && now < dawnEnd) {
    const t = (now - sunrise) / (dawnEnd - sunrise);
    return { phase: "dawn", blend: "day", t };
  }
  // Day
  if (now >= dawnEnd && now < duskStart) {
    return { phase: "day", blend: null, t: 0 };
  }
  // Day → Dusk transition
  if (now >= duskStart && now < sunset) {
    const t = (now - duskStart) / (sunset - duskStart);
    return { phase: "day", blend: "dusk", t };
  }
  // Dusk peak → Night
  if (now >= sunset && now < duskEnd) {
    const t = (now - sunset) / (duskEnd - sunset);
    return { phase: "dusk", blend: "night", t };
  }
  // Night
  return { phase: "night", blend: null, t: 0 };
}

function getCurrentSky(nowMinUTC, sunTimes) {
  const { phase, blend, t } = getPhaseAndBlend(nowMinUTC, sunTimes);

  const p1 = PHASES[phase];
  if (!blend || t === 0) {
    return {
      gradient: p1.gradient,
      sunColor: p1.sunColor,
      moonColor: p1.moonColor,
      glowColor: p1.glowColor,
      stars: p1.stars,
      starsOpacity: p1.stars ? 1 : 0,
    };
  }

  const p2 = PHASES[blend];
  const gradient = lerpGradient(p1.gradient, p2.gradient, t);

  // Interpolate sun/moon presence
  const sunColor = p1.sunColor && p2.sunColor
    ? lerpColor(p1.sunColor, p2.sunColor, t)
    : (t < 0.5 ? p1.sunColor : p2.sunColor);

  const moonColor = p1.moonColor && p2.moonColor
    ? lerpColor(p1.moonColor, p2.moonColor, t)
    : (t < 0.5 ? p1.moonColor : p2.moonColor);

  const glowColor = t < 0.5 ? p1.glowColor : p2.glowColor;

  // Fade stars
  const starsOpacity = p1.stars && !p2.stars ? 1 - t : (!p1.stars && p2.stars ? t : (p1.stars ? 1 : 0));

  return { gradient, sunColor, moonColor, glowColor, stars: starsOpacity > 0.05, starsOpacity };
}

// ── Star generation (deterministic per day) ──────────────────────────

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function generateStars(date, count) {
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const rand = seededRandom(seed);
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: rand() * 1170,
      y: rand() * 1600, // stars in upper ~60% of screen
      size: 1.5 + rand() * 3,
      opacity: 0.3 + rand() * 0.7,
    });
  }
  return stars;
}

// ── Render ────────────────────────────────────────────────────────────

const W = 1170;
const H = 2532;

module.exports = async function handler(req, res) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: "Missing ?lat=XX&lng=YY" });
    }

    const [monoMediumData, monoRegularData] = await Promise.all([
      fetch(FONT_MEDIUM_URL).then((r) => r.arrayBuffer()),
      fetch(FONT_REGULAR_URL).then((r) => r.arrayBuffer()),
    ]);

    const now = new Date();
    const utcDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const sunTimes = solarTimes(lat, lng, utcDate);

    // Current time in minutes from midnight UTC
    const nowMinUTC = now.getUTCHours() * 60 + now.getUTCMinutes();

    const sky = getCurrentSky(nowMinUTC, sunTimes);

    // Generate stars
    const stars = sky.stars ? generateStars(utcDate, 80) : [];

    // Build the gradient as CSS linear-gradient string
    const gradStops = sky.gradient.map((c, i) => `${c} ${(i / (sky.gradient.length - 1) * 100).toFixed(0)}%`).join(", ");

    // ── JSX tree ──
    const children = [];

    // Stars
    if (sky.stars && stars.length > 0) {
      const starDots = stars.map((s) => ({
        type: "div",
        props: {
          style: {
            position: "absolute",
            left: Math.round(s.x),
            top: Math.round(s.y),
            width: Math.round(s.size),
            height: Math.round(s.size),
            borderRadius: "50%",
            backgroundColor: `rgba(255, 255, 255, ${(s.opacity * sky.starsOpacity).toFixed(2)})`,
          },
        },
      }));
      children.push({
        type: "div",
        props: {
          style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex" },
          children: starDots,
        },
      });
    }

    // Sun or Moon — centered
    const celestialY = 900; // vertical center-ish (upper half of screen)
    const celestialX = W / 2;

    if (sky.moonColor) {
      // Crescent moon
      const moonSize = 160;
      children.push({
        type: "div",
        props: {
          style: {
            position: "absolute",
            left: celestialX - moonSize / 2,
            top: celestialY - moonSize / 2,
            width: moonSize,
            height: moonSize,
            borderRadius: "50%",
            backgroundColor: sky.moonColor,
            boxShadow: `0 0 60px 20px rgba(232, 228, 212, 0.15)`,
            display: "flex",
          },
        },
      });
      // Shadow to create crescent effect
      children.push({
        type: "div",
        props: {
          style: {
            position: "absolute",
            left: celestialX - moonSize / 2 + 40,
            top: celestialY - moonSize / 2 - 10,
            width: moonSize,
            height: moonSize,
            borderRadius: "50%",
            backgroundColor: sky.gradient[0], // match sky background
            display: "flex",
          },
        },
      });
    }

    if (sky.sunColor) {
      const sunSize = 200;
      // Outer glow
      if (sky.glowColor) {
        children.push({
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: celestialX - sunSize * 1.5,
              top: celestialY - sunSize * 1.5,
              width: sunSize * 3,
              height: sunSize * 3,
              borderRadius: "50%",
              backgroundColor: sky.glowColor,
              display: "flex",
            },
          },
        });
      }
      // Inner glow
      children.push({
        type: "div",
        props: {
          style: {
            position: "absolute",
            left: celestialX - sunSize * 0.75,
            top: celestialY - sunSize * 0.75,
            width: sunSize * 1.5,
            height: sunSize * 1.5,
            borderRadius: "50%",
            backgroundColor: lerpColor(sky.sunColor, sky.gradient[2], 0.6),
            display: "flex",
          },
        },
      });
      // Sun disc
      children.push({
        type: "div",
        props: {
          style: {
            position: "absolute",
            left: celestialX - sunSize / 2,
            top: celestialY - sunSize / 2,
            width: sunSize,
            height: sunSize,
            borderRadius: "50%",
            backgroundColor: sky.sunColor,
            display: "flex",
          },
        },
      });
    }

    const jsx = {
      type: "div",
      props: {
        style: {
          width: "100%",
          height: "100%",
          backgroundImage: `linear-gradient(to bottom, ${gradStops})`,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          fontFamily: "Mono",
        },
        children,
      },
    };

    const svg = await satori(jsx, {
      width: W,
      height: H,
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
      fitTo: { mode: "width", value: W },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=1800, s-maxage=1800");
    return res.send(pngBuffer);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
};
