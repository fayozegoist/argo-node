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
          <title>GATEWAY</title>
          <style>
            *{box-sizing:border-box;margin:0;padding:0}
            html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
            body{
              background:#080808;
              color:#f2f2f2;
              font-family:-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif;
              min-height:100vh;
              display:flex;
              flex-direction:column;
              align-items:center;
              padding:56px 20px 40px;
            }
            .shell{
              width:100%;
              max-width:520px;
            }
            .panel{
              background:#111111;
              border:1px solid #1e1e1e;
              border-radius:16px;
              overflow:hidden;
            }
            .header{
              height:54px;
              display:flex;
              align-items:center;
              justify-content:center;
              border-bottom:1px solid #1a1a1a;
              background:#111111;
            }
            .brand{
              font-size:10px;
              font-weight:600;
              letter-spacing:0.32em;
              text-transform:uppercase;
              color:#8a8a8a;
            }
            .content{ padding:26px 26px 22px; }
            .eyebrow{
              font-size:10px;
              font-weight:600;
              letter-spacing:0.14em;
              text-transform:uppercase;
              color:#5a5a5a;
              margin-bottom:12px;
            }
            .group{ margin-bottom:20px; }
            .group:last-of-type{ margin-bottom:0; }
            .group-head{
              display:flex;
              align-items:center;
              gap:8px;
              margin-bottom:10px;
            }
            .group-line{
              width:12px;
              height:1px;
              background:#2a2a2a;
            }
            .grid-2{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
            .grid-3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
            button.proto{
              height:42px;
              background:#161616;
              border:1px solid #232323;
              border-radius:9px;
              color:#d4d4d4;
              font-size:13px;
              font-weight:500;
              letter-spacing:0.01em;
              cursor:pointer;
              transition:background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.08s ease;
            }
            button.proto:hover{ background:#1a1a1a; border-color:#2a2a2a; color:#f2f2f2; }
            button.proto:active{ transform:scale(0.99); }
            button.proto.active{ background:#f2f2f2; border-color:#f2f2f2; color:#080808; }
            .output{
              margin-top:20px;
              padding-top:20px;
              border-top:1px solid #1a1a1a;
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
              background:#0a0a0a;
              border:1px solid #1e1e1e;
              color:#a8a8a8;
              padding:13px 14px;
              border-radius:9px;
              font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size:12px;
              line-height:1.4;
              outline:none;
              transition:border-color 0.15s ease, color 0.15s ease;
            }
            input#config-output::placeholder{ color:#4a4a4a; }
            input#config-output:focus{ border-color:#2a2a2a; color:#f2f2f2; }
            .btn-copy{
              height:42px;
              padding:0 18px;
              background:#f2f2f2;
              color:#080808;
              border:1px solid #f2f2f2;
              border-radius:9px;
              font-size:13px;
              font-weight:600;
              letter-spacing:0.01em;
              cursor:pointer;
              white-space:nowrap;
              transition:background 0.15s ease, border-color 0.15s ease, transform 0.08s ease;
            }
            .btn-copy:hover{ background:#e8e8e8; border-color:#e8e8e8; }
            .btn-copy:active{ transform:scale(0.98); }
            .hint{
              margin-top:10px;
              font-size:11px;
              color:#4a4a4a;
              line-height:1.5;
              letter-spacing:0.01em;
            }
            .footer{
              margin-top:14px;
              text-align:center;
              font-size:11px;
              color:#3a3a3a;
              letter-spacing:0.02em;
            }
            @media (max-width:560px){
              body{ padding:28px 16px 24px; }
              .content{ padding:20px 18px 18px; }
              .grid-3{ grid-template-columns:1fr; }
              .output{ flex-direction:column; align-items:stretch; }
              .btn-copy{ width:100%; justify-content:center; }
            }
          </style>
        </head>
        <body>
          <div class="shell">
            <div class="panel">
              <div class="header"><div class="brand">Gateway</div></div>
              <div class="content">
                <div class="group">
                  <div class="group-head"><div class="group-line"></div><div class="eyebrow">Bug SNI</div></div>
                  <div class="grid-2">
                    <button class="proto" onclick="generate('native','vless',this)">VLESS</button>
                    <button class="proto" onclick="generate('native','trojan',this)">TROJAN</button>
                  </div>
                </div>
                <div class="group">
                  <div class="group-head"><div class="group-line"></div><div class="eyebrow">Bug CDN</div></div>
                  <div class="grid-3">
                    <button class="proto" onclick="generate('argo','vless',this)">VLESS</button>
                    <button class="proto" onclick="generate('argo','vmess',this)">VMESS</button>
                    <button class="proto" onclick="generate('argo','trojan',this)">TROJAN</button>
                  </div>
                </div>
                <div class="output">
                  <div class="field"><input type="text" id="config-output" readonly placeholder="Select a configuration to generate" /></div>
                  <button class="btn-copy" id="copy-btn" onclick="copyConfig()">Copy</button>
                </div>
                <div class="hint" id="hint">Choose VLESS / VMESS / TROJAN above. Config will appear here.</div>
              </div>
            </div>
            <div class="footer">Monochrome &middot; No telemetry</div>
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
              document.getElementById('copy-btn').textContent = 'Copy';
              try{
                const res = await fetch('/api/config');
                const data = await res.json();
                const val = data[network][protocol];
                outputEl.value = val;
                if(val && val.startsWith('Menunggu')) hint.textContent = 'Tunnel not ready yet. Try again in a few seconds.';
                else hint.textContent = network === 'native' ? 'SNI mode — uses current host as SNI.' : 'CDN mode — uses Cloudflare tunnel domain.';
                outputEl.focus(); outputEl.select();
              }catch(e){
                outputEl.value = '';
                hint.textContent = 'Failed to load configuration.';
              }
            }
            function copyConfig(){
              const el = document.getElementById('config-output');
              const hint = document.getElementById('hint');
              if(!el.value || el.value === 'Loading…') return;
              navigator.clipboard.writeText(el.value).then(()=>{
                const btn = document.getElementById('copy-btn');
                const prev = btn.textContent;
                btn.textContent = 'Copied';
                hint.textContent = 'Copied to clipboard.';
                setTimeout(()=>{ if(btn.textContent==='Copied'){ btn.textContent='Copy'; hint.textContent='Ready.'; } }, 1800);
              }).catch(()=>{
                el.select(); document.execCommand('copy');
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
