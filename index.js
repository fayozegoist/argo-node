#!/usr/bin/env node

const http = require('http');
const WebSocket = require('ws');
const net = require('net');
const dgram = require('dgram');
const url = require('url');
const axios = require('axios');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

// ==================== ENVIRONMENT VARIABLES ====================
const FILE_PATH = process.env.FILE_PATH || '.tmp';
const PORT = process.env.PORT || 3000;
const UUID = process.env.UUID || '9afd1229-b893-40c1-84dd-51e7ce204913';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || '';
const ARGO_PORT = process.env.ARGO_PORT || 8001;
const CFIP = process.env.CFIP || 'bug.com';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'MEDIAFAIRY';

// ==================== GLOBAL CONSTANTS ====================
const horse = Buffer.from("dHJvamFu", 'base64').toString(); 
const flash = Buffer.from("dm1lc3M=", 'base64').toString(); 
const WS_READY_STATE_OPEN = 1;

let argoConfigs = { vless: '', vmess: '', trojan: '' };
const generateRandomName = () => Math.random().toString(36).substring(2, 8);
const webName = generateRandomName();
const botName = generateRandomName();
const webPath = path.join(FILE_PATH, webName);
const botPath = path.join(FILE_PATH, botName);
const subFilePath = path.join(FILE_PATH, 'sub.txt');
const bootLogPath = path.join(FILE_PATH, 'boot.log');

// ==================== BACKGROUND SERVICES (XRAY & ARGO) ====================
if (!fs.existsSync(FILE_PATH)) fs.mkdirSync(FILE_PATH, { recursive: true });

async function generateXrayConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-mediafairy", dest: 3002 }, { path: "/vmess-mediafairy", dest: 3003 }, { path: "/trojan-mediafairy", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-mediafairy" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-mediafairy" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-mediafairy" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [{ protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" }]
  };
  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

function downloadFile(fileUrl, filePath) {
  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(filePath);
    axios({ method: 'get', url: fileUrl, responseType: 'stream' })
      .then(response => {
        response.data.pipe(writer);
        writer.on('finish', () => resolve(filePath));
        writer.on('error', reject);
      }).catch(reject);
  });
}

async function startBackgroundServices() {
  const arch = os.arch() === 'arm' || os.arch() === 'arm64' || os.arch() === 'aarch64' ? 'arm64' : 'amd64';
  const baseUrl = `https://${arch}.ssss.nyc.mn`;
  
  await generateXrayConfig();
  
  try {
    await Promise.all([
      downloadFile(`${baseUrl}/web`, webPath),
      downloadFile(`${baseUrl}/bot`, botPath)
    ]);
    
    fs.chmodSync(webPath, 0o775);
    fs.chmodSync(botPath, 0o775);

    exec(`nohup ${webPath} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`);
    console.log('[SYSTEM] Xray Engine Started');

    let tunnelArgs = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${bootLogPath} --loglevel info --url http://localhost:${ARGO_PORT}`;
    if (ARGO_AUTH && ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
        tunnelArgs = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    }
    
    exec(`nohup ${botPath} ${tunnelArgs} >/dev/null 2>&1 &`);
    console.log('[SYSTEM] Tunnel Bot Started');
    
    setTimeout(extractDomains, 5000);
  } catch (err) {
    console.error('[SYSTEM] Background service error:', err.message);
  }
}

async function extractDomains() {
  if (ARGO_AUTH && ARGO_DOMAIN) {
    await generateLinks(ARGO_DOMAIN);
    return;
  }
  try {
    const logData = fs.readFileSync(bootLogPath, 'utf-8');
    const match = logData.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
    if (match) {
      console.log('[SYSTEM] Argo Tunnel Extracted:', match[1]);
      await generateLinks(match[1]);
    } else {
      setTimeout(extractDomains, 3000); 
    }
  } catch (e) {
    setTimeout(extractDomains, 3000);
  }
}

async function generateLinks(domain) {
  const vmessObj = { v: '2', ps: `${NAME}-CDN-VMESS`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'auto', net: 'ws', type: 'none', host: domain, path: '/vmess-mediafairy', tls: 'tls', sni: domain, alpn: '', fp: 'firefox' };
  
  argoConfigs.vless = `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${domain}&fp=firefox&type=ws&host=${domain}&path=%2Fvless-mediafairy#${NAME}-CDN-VLESS`;
  argoConfigs.vmess = `vmess://${Buffer.from(JSON.stringify(vmessObj)).toString('base64')}`;
  argoConfigs.trojan = `trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${domain}&fp=firefox&type=ws&host=${domain}&path=%2Ftrojan-mediafairy#${NAME}-CDN-TROJAN`;
  
  const subTxt = `${argoConfigs.vless}\n${argoConfigs.vmess}\n${argoConfigs.trojan}`;
  fs.writeFileSync(subFilePath, subTxt);
  console.log('[SYSTEM] Argo Subscriptions generated successfully.');
}

// ==================== HYBRID GATEWAY SERVER ====================
class HybridServer {
  constructor() {
    this.wss = null;
    this.httpServer = null;
    this.activeUDPConnections = new Map();
  }

  async handleHttpRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    
    // API Config Terpusat
    if (parsedUrl.pathname === '/api/config') {
      const host = req.headers.host;
      const payload = {
        native: {
          vless: `vless://${UUID}@${host}:443?encryption=none&security=tls&sni=${host}&fp=firefox&type=ws&host=${host}&path=%2Fvless-mediafairy#${NAME}-SNI-VLESS`,
          trojan: `trojan://${UUID}@${host}:443?security=tls&sni=${host}&fp=firefox&type=ws&host=${host}&path=%2Ftrojan-mediafairy#${NAME}-SNI-TROJAN`
        },
        argo: {
          vless: argoConfigs.vless || 'Menunggu Cloudflare Argo Tunnel aktif...',
          vmess: argoConfigs.vmess || 'Menunggu Cloudflare Argo Tunnel aktif...',
          trojan: argoConfigs.trojan || 'Menunggu Cloudflare Argo Tunnel aktif...'
        }
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(payload));
    }

    // Dashboard UI Utama
    if (parsedUrl.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>ARGO TUNNEL</title>
                     <style>
            *{box-sizing:border-box;margin:0;padding:0}
            html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;scroll-behavior:smooth}
            body{
              background:#07080A;
              background-image:
                radial-gradient(820px 520px at 15% 12%, rgba(255,214,10,0.08) 0%, transparent 58%),
                radial-gradient(720px 460px at 85% 88%, rgba(0,229,255,0.06) 0%, transparent 60%),
                radial-gradient(600px 400px at 50% 50%, rgba(124,77,255,0.04) 0%, transparent 70%),
                linear-gradient(180deg, #07080A 0%, #0A0B0F 100%);
              color:#F2F2F2;
              font-family:-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
              min-height:100vh;
              display:flex;
              flex-direction:column;
              align-items:center;
              padding:56px 20px 40px;
              overflow-x:hidden;
              perspective:1200px;
            }
            .bg-orbs{ position:fixed; inset:0; pointer-events:none; overflow:hidden; z-index:0; }
            .orb{ position:absolute; border-radius:50%; filter:blur(60px); opacity:0.55; will-change:transform; }
            .orb1{ width:560px; height:560px; left:-120px; top:-80px; background:radial-gradient(circle at 30% 30%, rgba(255,214,10,0.18) 0%, rgba(255,165,0,0.08) 35%, transparent 70%); animation:floatA 18s ease-in-out infinite; }
            .orb2{ width:640px; height:640px; right:-140px; bottom:-120px; background:radial-gradient(circle at 70% 70%, rgba(0,229,255,0.14) 0%, rgba(124,77,255,0.10) 40%, transparent 70%); animation:floatB 22s ease-in-out infinite; }
            @keyframes floatA{ 0%,100%{ transform:translate3d(0,0,0) scale(1)} 50%{ transform:translate3d(18px,22px,0) scale(1.04)}}
            @keyframes floatB{ 0%,100%{ transform:translate3d(0,0,0) scale(1)} 50%{ transform:translate3d(-16px,-18px,0) scale(1.03)}}
            .shell{
              width:100%;
              max-width:520px;
              position:relative;
              z-index:1;
              transform-style:preserve-3d;
              transition:transform 0.6s cubic-bezier(0.23,1,0.32,1);
              will-change:transform;
            }
            .panel{
              background:rgba(17,17,19,0.52);
              backdrop-filter:blur(24px) saturate(150%);
              -webkit-backdrop-filter:blur(24px) saturate(150%);
              border:1px solid rgba(255,255,255,0.08);
              border-radius:20px;
              overflow:hidden;
              box-shadow:0 16px 48px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(255,255,255,0.02) inset;
              transform:translateZ(0);
              transition:box-shadow 0.4s ease, border-color 0.4s ease;
            }
            .panel:hover{ border-color:rgba(255,255,255,0.11); box-shadow:0 20px 56px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.08) inset; }
            .header{
              height:56px;
              display:flex;
              align-items:center;
              justify-content:center;
              border-bottom:1px solid rgba(255,255,255,0.06);
              background:linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%);
              backdrop-filter:blur(16px);
              -webkit-backdrop-filter:blur(16px);
            }
            .brand{
              font-size:13px;
              font-weight:600;
              letter-spacing:0.28em;
              text-transform:uppercase;
              color:#F2F2F2;
              text-shadow:0 1px 12px rgba(125,211,224,0.22);
            }
            .content{ padding:26px 26px 22px; }
            .eyebrow{
              font-size:12px;
              font-weight:600;
              letter-spacing:0.12em;
              text-transform:uppercase;
              color:#9A9A9A;
              margin-bottom:12px;
            }
            .group{ margin-bottom:16px; background:rgba(255,255,255,0.035); backdrop-filter:blur(16px) saturate(130%); -webkit-backdrop-filter:blur(16px) saturate(130%); border:1px solid rgba(255,255,255,0.06); border-radius:14px; padding:14px; box-shadow:inset 0 1px 0 rgba(255,255,255,0.04); transition:transform 0.35s cubic-bezier(0.23,1,0.32,1), border-color 0.3s ease, background 0.3s ease; transform:translateZ(0);}
            .group:hover{ border-color:rgba(255,214,10,0.12); background:rgba(255,255,255,0.045); }
            .group.reveal{ opacity:0; transform:translateY(14px) translateZ(0); }
            .group.reveal.in{ opacity:1; transform:translateY(0) translateZ(0); }
            .group:last-of-type{ margin-bottom:0; }
            .group-head{
              display:flex;
              align-items:center;
              gap:8px;
              margin-bottom:10px;
            }
            .group-line{
              width:14px;
              height:1px;
              background:linear-gradient(90deg, rgba(125,211,224,0.95) 0%, rgba(14,47,90,0.25) 100%);
              box-shadow:0 0 8px rgba(125,211,224,0.45);
            }
            .grid-2{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
            .grid-3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
            button.proto{
              height:44px;
              background:rgba(255,255,255,0.035);
              backdrop-filter:blur(12px);
              -webkit-backdrop-filter:blur(12px);
              border:1px solid rgba(255,255,255,0.07);
              border-radius:11px;
              color:#E8E8E8;
              font-size:13px;
              font-weight:550;
              letter-spacing:0.02em;
              cursor:pointer;
              transition:all 0.22s cubic-bezier(0.23,1,0.32,1);
              box-shadow:inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 10px rgba(0,0,0,0.25);
              position:relative;
              overflow:hidden;
            }
            button.proto::before{
              content:"";
              position:absolute;
              inset:0;
              background:linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 55%);
              opacity:0;
              transition:opacity 0.22s ease;
              pointer-events:none;
            }
            button.proto:hover{ background:rgba(255,255,255,0.06); border-color:rgba(255,255,255,0.10); color:#FFFFFF; transform:translateY(-1px); box-shadow:inset 0 1px 0 rgba(255,255,255,0.07), 0 6px 20px rgba(0,0,0,0.35); }
            button.proto:hover::before{ opacity:1; }
            button.proto:active{ transform:translateY(0) scale(0.99); }
            button.proto.active{ background:#FFFFFF; border-color:#FFFFFF; color:#0A0A0A; font-weight:650; box-shadow:0 6px 20px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.9); }
            button.proto.active:hover{ background:#F2F2F2; border-color:#F2F2F2; }
            .output{
              margin-top:20px;
              padding-top:20px;
              border-top:1px solid rgba(255,255,255,0.06);
              display:flex;
              gap:8px;
              align-items:center;
            }
            .field{
              flex:1;
              position:relative;
              display:flex;
              align-items:center;
            }
            input#config-output{
              width:100%;
              background:rgba(10,10,12,0.6);
              backdrop-filter:blur(12px);
              -webkit-backdrop-filter:blur(12px);
              border:1px solid rgba(255,255,255,0.07);
              color:#E8E8E8;
              padding:13px 14px;
              border-radius:11px;
              font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size:12px;
              line-height:1.4;
              outline:none;
              transition:border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
              box-shadow:inset 0 1px 0 rgba(255,255,255,0.03);
            }
            input#config-output::placeholder{ color:#6A6A6A; }
            input#config-output:focus{ border-color:rgba(125,211,224,0.32); background:rgba(10,10,12,0.75); box-shadow:0 0 0 3px rgba(125,211,224,0.10); }
            .btn-copy{
              height:42px;
              padding:0 18px;
              background:rgba(242,242,242,0.95);
              backdrop-filter:blur(8px);
              color:#080808;
              border:1px solid rgba(255,255,255,0.9);
              border-radius:11px;
              font-size:13px;
              font-weight:650;
              letter-spacing:0.01em;
              cursor:pointer;
              white-space:nowrap;
              transition:all 0.2s ease;
              box-shadow:0 4px 16px rgba(0,0,0,0.25);
            }
            .btn-copy:hover{ background:#FFFFFF; transform:translateY(-1px); box-shadow:0 6px 20px rgba(0,0,0,0.3); }
            .btn-copy:active{ transform:scale(0.98); }
            .hint{
              margin-top:10px;
              font-size:11px;
              color:#8A8A8A;
              line-height:1.5;
              letter-spacing:0.01em;
            }
            .wildcard{ margin-top:18px; padding-top:18px; border-top:1px solid rgba(255,255,255,0.06); }
            .wildcard-list{ display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }
            .chip{ display:inline-flex; align-items:center; padding:8px 13px; background:rgba(255,255,255,0.04); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.07); border-radius:999px; font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size:13px; font-weight:500; color:#D0D0D0; letter-spacing:0.01em; box-shadow:inset 0 1px 0 rgba(255,255,255,0.04); transition:all 0.2s ease; }
            .chip:hover{ border-color:rgba(125,211,224,0.28); color:#FFFFFF; background:rgba(255,255,255,0.06); box-shadow:0 2px 12px rgba(30,90,138,0.18); transform:translateY(-1px); }
            .footer{
              margin-top:16px;
              text-align:center;
            }
            .support-link{
              display:inline-flex;
              align-items:center;
              gap:8px;
              color:rgba(255,255,255,0.72);
              text-decoration:none;
              font-size:13px;
              font-weight:500;
              letter-spacing:0.04em;
              background:rgba(255,255,255,0.04);
              backdrop-filter:blur(12px);
              -webkit-backdrop-filter:blur(12px);
              border:1px solid rgba(255,255,255,0.07);
              padding:9px 16px;
              border-radius:999px;
              transition:all 0.22s ease;
              box-shadow:0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.05);
            }
            .support-link:hover{ color:#FFFFFF; background:rgba(255,255,255,0.07); border-color:rgba(125,211,224,0.28); box-shadow:0 6px 20px rgba(0,0,0,0.35), 0 0 14px rgba(125,211,224,0.16); transform:translateY(-1px); }
            .support-link svg{ flex-shrink:0; filter:drop-shadow(0 0 6px rgba(125,211,224,0.35)); }
            @media (max-width:560px){
              body{ padding:28px 16px 24px; }
              .content{ padding:20px 18px 18px; }
              .grid-3{ grid-template-columns:1fr; }
              .output{ flex-direction:column; align-items:stretch; }
              .btn-copy{ width:100%; justify-content:center; }
              .orb1{ width:380px; height:380px; }
              .orb2{ width:420px; height:420px; }
              .panel{ backdrop-filter:blur(16px) saturate(140%); -webkit-backdrop-filter:blur(16px) saturate(140%); }
            }
            @supports not (backdrop-filter: blur(1px)){
              .panel, .group, .chip, input#config-output{ background:#151515; }
            }
          </style>
        </head>
        <body>
          <div class="bg-orbs" aria-hidden="true"><div class="orb orb1"></div><div class="orb orb2"></div></div>
          <div class="shell" id="shell">
            <div class="panel">
              <div class="header"><div class="brand">ARGO TUNNEL</div></div>
              <div class="content">
                <div class="group reveal">
                  <div class="group-head"><div class="group-line"></div><div class="eyebrow">Bug SNI</div></div>
                  <div class="grid-2">
                    <button class="proto" onclick="generate('native','vless',this)">VLESS</button>
                    <button class="proto" onclick="generate('native','trojan',this)">TROJAN</button>
                  </div>
                </div>
                <div class="group reveal">
                  <div class="group-head"><div class="group-line"></div><div class="eyebrow">Bug CDN</div></div>
                  <div class="grid-3">
                    <button class="proto" onclick="generate('argo','vless',this)">VLESS</button>
                    <button class="proto" onclick="generate('argo','vmess',this)">VMESS</button>
                    <button class="proto" onclick="generate('argo','trojan',this)">TROJAN</button>
                  </div>
                </div>
                <div class="output" style="justify-content:center">
                  <input type="hidden" id="config-output" />
                  <button class="btn-copy" id="copy-btn" onclick="copyConfig()">Copy</button>
                </div>
                <div class="hint" id="hint" style="text-align:center"></div>
                <div class="wildcard">
                  <div class="eyebrow">Bug Wildcard — CDN Supported</div>
                  <div class="wildcard-list">
                    <span class="chip">support.zoom.us</span>
                    <span class="chip">ava.game.naver.com</span>
                  </div>

                </div>
              </div>
            </div>
            <div class="footer">
              <a href="https://t.me/MediafairyCH" target="_blank" rel="noopener" class="support-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75l-2.2-1.45c-.95-.63-.33-.98.21-1.55l.85-.85c.09-.09.17-.17.17-.34l-2.14-1.64c-.23-.18-.39-.28-.39-.56 0-.28.2-.43.5-.57l3.4-1.29c1.02-.42 1.69-.66 1.95-.84.26-.18.33-.42.33-.67a.9.9 0 0 0-.02-.2c-.05-.26-.26-.4-.52-.4-.9-.08-1.94.6-3.06 1.4-.42.3-.8.45-1.14.45-.5 0-1.1-.4-1.6-.9-.7-.7-.9-1.2-.3-1.6.6-.4 1.8-.5 2.9-1 1.1-.5 2.1-1 4.4-.9.4 0 .9.2 1.1.6.2.4.2 1 .1 1.8z" fill="currentColor"/></svg>
                Technical Support — MediaFairy
              </a>
            </div>
          </div>
          <script>
            let activeBtn = null;
            async function generate(network, protocol, el){
              const outputEl = document.getElementById('config-output');
              const hint = document.getElementById('hint');
              if(activeBtn) activeBtn.classList.remove('active');
              if(el){ el.classList.add('active'); activeBtn = el; }
              outputEl.value = 'Loading…';
              hint.textContent = 'Fetching configuration…';
              hint.style.display='block';
              document.getElementById('copy-btn').textContent = 'Copy';
              try{
                const res = await fetch('/api/config');
                const data = await res.json();
                const val = data[network][protocol];
                outputEl.value = val;
                if(val && val.startsWith('Menunggu')) hint.textContent = 'Tunnel not ready yet. Try again in a few seconds.';
                else hint.textContent = '';
                hint.style.display = hint.textContent ? 'block' : 'none';
              }catch(e){
                outputEl.value = '';
                hint.textContent = 'Failed to load configuration.';
              }
            }
            // Liquid Glass 3D tilt + parallax + reveal
            (function(){
              const shell = document.getElementById('shell');
              const panel = document.querySelector('.panel');
              let raf = null, mx = 0, my = 0, sx = 0;
              function onMove(e){
                const x = (e.clientX / window.innerWidth - 0.5);
                const y = (e.clientY / window.innerHeight - 0.5);
                mx = x * 4; my = y * -3;
                if(!raf) raf = requestAnimationFrame(apply);
              }
              function onScroll(){
                sx = window.scrollY * 0.06;
                if(!raf) raf = requestAnimationFrame(apply);
              }
              function apply(){
                raf = null;
                if(shell) shell.style.transform = 'rotateY(' + mx + 'deg) rotateX(' + my + 'deg)';
                const o1 = document.querySelector('.orb1');
                const o2 = document.querySelector('.orb2');
                if(o1) o1.style.transform = 'translate3d(' + (mx*6) + 'px, ' + (sx*0.4) + 'px, 0)';
                if(o2) o2.style.transform = 'translate3d(' + (mx*-5) + 'px, ' + (-sx*0.35) + 'px, 0)';
                if(panel) panel.style.transform = 'translateZ(0) translateY(' + (sx*0.02) + 'px)';
              }
              window.addEventListener('mousemove', onMove, {passive:true});
              window.addEventListener('scroll', onScroll, {passive:true});
              const io = new IntersectionObserver((entries)=>{
                entries.forEach(en=>{ if(en.isIntersecting) en.target.classList.add('in'); });
              }, {threshold:0.12});
              document.querySelectorAll('.group.reveal').forEach(el=> io.observe(el));
              requestAnimationFrame(()=> document.querySelectorAll('.group.reveal').forEach((el,i)=> setTimeout(()=> el.classList.add('in'), 120*i)));
            })();
            function copyConfig(){
              const el = document.getElementById('config-output');
              const hint = document.getElementById('hint');
              if(!el.value || el.value === 'Loading…') return;
              navigator.clipboard.writeText(el.value).then(()=>{
                const btn = document.getElementById('copy-btn');
                btn.textContent = 'Copied';
                if(hint){ hint.textContent = 'Copied to clipboard.'; hint.style.display='block'; }
                setTimeout(()=>{ if(btn.textContent==='Copied'){ btn.textContent='Copy'; if(hint){ hint.textContent=''; hint.style.display='none'; } } }, 1800);
              }).catch(()=>{
                if(el.select) el.select();
                try{ document.execCommand('copy'); }catch(e){}
                const btn = document.getElementById('copy-btn');
                btn.textContent = 'Copied';
                setTimeout(()=> btn.textContent='Copy', 1500);
              });
            }
          </script>
        </body>
        </html>
      `);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not Found');
  }

  // ==================== WEBSOCKET HANDLERS ====================
  async handleWebSocketConnection(ws, request) {
    try {
      const path = url.parse(request.url, true).pathname;
      if (path === '/vless-mediafairy' || path === '/trojan-mediafairy' || path === '/vmess-mediafairy') {
        return await this.websocketHandler(ws);
      }
      ws.close(1000, "Invalid Path");
    } catch (err) { ws.close(1011); }
  }

  async websocketHandler(ws) {
    let remoteSocketWrapper = { value: null };
    ws.on('message', async (message) => {
      try {
        const chunk = Buffer.from(message);
        if (remoteSocketWrapper.value) return remoteSocketWrapper.value.write(chunk);

        const protocol = await this.protocolSniffer(chunk);
        const protocolHeader = protocol === horse ? this.readHorseHeader(chunk) : this.readFlashHeader(chunk); 
        if (protocolHeader.hasError) throw new Error(protocolHeader.message);

        if (protocolHeader.isUDP) return await this.handleUDPOutbound(protocolHeader.addressRemote, protocolHeader.portRemote, chunk.slice(protocolHeader.rawDataIndex), ws, protocolHeader.version);
        this.handleTCPOutBound(remoteSocketWrapper, protocolHeader.addressRemote, protocolHeader.portRemote, protocolHeader.rawClientData, ws, protocolHeader.version);
      } catch (err) { ws.close(1011, err.message); }
    });
    ws.on('close', () => { if (remoteSocketWrapper.value) remoteSocketWrapper.value.end(); this.cleanupUDPConnections(ws); });
    ws.on('error', () => this.cleanupUDPConnections(ws));
  }

  async protocolSniffer(buffer) {
    if (buffer.length >= 62) {
      const hd = buffer.slice(56, 60);
      if (hd[0] === 0x0d && hd[1] === 0x0a && [0x01, 0x03, 0x7f].includes(hd[2]) && [0x01, 0x03, 0x04].includes(hd[3])) return horse;
    }
    return flash; 
  }

  async handleTCPOutBound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, responseHeader) {
    try {
      const tcpSocket = net.createConnection({ host: addressRemote, port: portRemote }, () => tcpSocket.write(rawClientData));
      remoteSocket.value = tcpSocket;
      tcpSocket.on('close', () => webSocket.close());
      tcpSocket.on('error', () => webSocket.close());
      
      let header = responseHeader;
      tcpSocket.on('data', (chunk) => {
        if (webSocket.readyState !== WS_READY_STATE_OPEN) return tcpSocket.destroy();
        if (header) { webSocket.send(Buffer.concat([Buffer.from(header), chunk])); header = null; } 
        else webSocket.send(chunk);
      });
    } catch (error) { webSocket.close(); }
  }

  async handleUDPOutbound(targetAddress, targetPort, dataChunk, webSocket, responseHeader) {
    return new Promise((resolve) => {
      try {
        let header = responseHeader;
        const key = `${targetAddress}:${targetPort}:${Date.now()}`;
        const udpSocket = dgram.createSocket('udp4');
        
        this.activeUDPConnections.set(key, { socket: udpSocket, webSocket });
        udpSocket.on('error', () => { try { udpSocket.close(); } catch (_) {} this.activeUDPConnections.delete(key); });
        udpSocket.send(dataChunk, targetPort, targetAddress);
        
        udpSocket.on('message', (message) => {
          if (webSocket.readyState === WS_READY_STATE_OPEN) {
            if (header) { webSocket.send(Buffer.concat([Buffer.from(header), message])); header = null; } 
            else webSocket.send(message);
          }
        });
        
        let timeout = setTimeout(() => { try { udpSocket.close(); } catch (_) {} this.activeUDPConnections.delete(key); }, 30000);
        udpSocket.on('message', () => { clearTimeout(timeout); timeout = setTimeout(() => { try { udpSocket.close(); } catch (_) {} this.activeUDPConnections.delete(key); }, 30000); });
      } catch (e) {}
    });
  }

  cleanupUDPConnections(webSocket) {
    for (const [key, conn] of this.activeUDPConnections.entries()) {
      if (conn.webSocket === webSocket) { try { conn.socket.close(); } catch (_) {} this.activeUDPConnections.delete(key); }
    }
  }

  readFlashHeader(buffer) {
    const v = buffer[0], optLen = buffer[17], cmd = buffer[18 + optLen], portIdx = 18 + optLen + 1;
    if (cmd !== 1 && cmd !== 2) return { hasError: true, message: "cmd unsupported" };
    const port = buffer.readUInt16BE(portIdx), addrType = buffer[portIdx + 2];
    let addrLen = 0, addrIdx = portIdx + 3, addr = "";
    
    if (addrType === 1) { addrLen = 4; addr = Array.from(buffer.slice(addrIdx, addrIdx + addrLen)).join("."); }
    else if (addrType === 2) { addrLen = buffer[addrIdx]; addrIdx++; addr = buffer.slice(addrIdx, addrIdx + addrLen).toString(); }
    else if (addrType === 3) { addrLen = 16; addr = Array.from({length: 8}, (_, i) => buffer.readUInt16BE(addrIdx + i*2).toString(16)).join(":"); }
    else return { hasError: true };

    return { hasError: false, addressRemote: addr, portRemote: port, rawDataIndex: addrIdx + addrLen, rawClientData: buffer.slice(addrIdx + addrLen), version: Buffer.from([v, 0]), isUDP: cmd === 2 };
  }

  readHorseHeader(buffer) {
    const data = buffer.slice(58);
    if (data.length < 6 || (data[0] !== 1 && data[0] !== 3)) return { hasError: true };
    const addrType = data[1];
    let addrLen = 0, addrIdx = 2, addr = "";
    
    if (addrType === 1) { addrLen = 4; addr = Array.from(data.slice(addrIdx, addrIdx + addrLen)).join("."); }
    else if (addrType === 3) { addrLen = data[addrIdx]; addrIdx++; addr = data.slice(addrIdx, addrIdx + addrLen).toString(); }
    else if (addrType === 4) { addrLen = 16; addr = Array.from({length: 8}, (_, i) => data.readUInt16BE(addrIdx + i*2).toString(16)).join(":"); }
    else return { hasError: true };

    const portIdx = addrIdx + addrLen;
    return { hasError: false, addressRemote: addr, portRemote: data.readUInt16BE(portIdx), rawDataIndex: portIdx + 4, rawClientData: data.slice(portIdx + 4), version: null, isUDP: data[0] === 3 };
  }

  start(port) {
    this.httpServer = http.createServer((req, res) => this.handleHttpRequest(req, res));
    this.wss = new WebSocket.Server({ server: this.httpServer, perMessageDeflate: false });
    this.wss.on('connection', (ws, req) => this.handleWebSocketConnection(ws, req));
    this.httpServer.listen(port, '0.0.0.0', () => console.log(`[SYSTEM] Hybrid Gateway Active on Port ${port}`));
  }
}

// ==================== BOOT SEQUENCE ====================
(async () => {
  console.log('[SYSTEM] Initializing Hybrid Core...');
  const server = new HybridServer();
  server.start(PORT);
  startBackgroundServices().catch(err => console.error('[SYSTEM] Background service error:', err));
})();
