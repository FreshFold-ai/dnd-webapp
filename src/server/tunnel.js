const fs = require("fs");
const path = require("path");
const localtunnel = require("localtunnel");
let ngrok;
try {
  ngrok = require("ngrok");
} catch (e) {
  ngrok = null;
}

const OUTFILE = path.join(__dirname, "..", "..", "LIVE_DEMO_URL.txt");

function writeUrlFile(url) {
  try {
    fs.writeFileSync(OUTFILE, url, { encoding: "utf8" });
  } catch (e) {
    console.warn("[TUNNEL] Failed to write URL file:", e.message);
  }
}

function removeUrlFile() {
  try {
    if (fs.existsSync(OUTFILE)) fs.unlinkSync(OUTFILE);
  } catch (e) {
    /* ignore */
  }
}

async function startLocalTunnel(port, subdomain) {
  const tunnel = await localtunnel({ port, subdomain });
  console.log("[TUNNEL] localtunnel URL:", tunnel.url);
  writeUrlFile(tunnel.url);
  return {
    url: tunnel.url,
    close: async () => {
      try { await tunnel.close(); } catch (e) {}
      removeUrlFile();
    },
  };
}

async function startNgrok(port) {
  if (!ngrok) throw new Error("ngrok package not installed");
  const authtoken = process.env.NGROK_AUTHTOKEN;
  if (authtoken) {
    try {
      await ngrok.authtoken(authtoken);
    } catch (e) {
      console.warn("[TUNNEL] ngrok authtoken set failed:", e.message);
    }
  }
  const url = await ngrok.connect({ addr: port });
  console.log("[TUNNEL] ngrok URL:", url);
  writeUrlFile(url);
  return {
    url,
    close: async () => {
      try {
        await ngrok.disconnect();
        await ngrok.kill();
      } catch (e) {}
      removeUrlFile();
    },
  };
}

async function startTunnel(port, opts = {}) {
  const type = opts.type || process.env.TUNNEL || "localtunnel";
  if (type === "localtunnel") {
    const subdomain = opts.subdomain || process.env.TUNNEL_SUBDOMAIN;
    return startLocalTunnel(port, subdomain);
  } else if (type === "ngrok") {
    return startNgrok(port);
  } else {
    throw new Error("Unknown tunnel type: " + type);
  }
}

module.exports = { startTunnel };
