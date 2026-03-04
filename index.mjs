import WebSocket from 'ws';
import tls from 'tls';
const TOKEN = '';
const GUILD_ID = '';
const PASSWORD = '';
let mfaToken = null;
let seq = null;
let hb = null;
let socket = null;
const vanities = new Map();
const headers = [
  'Host: canary.discord.com',
  'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  `Authorization: ${TOKEN}`,
  'Origin: https://canary.discord.com',
  'X-Super-Properties: '
];
function claim(code) {
  if (!socket || socket.destroyed) {
    socket = tls.connect({ 
      host: 'canary.discord.com', 
      port: 443, 
      rejectUnauthorized: false 
    });
  }
  const body = JSON.stringify({ code });
  const req = [
    `PATCH /api/v9/guilds/${GUILD_ID}/vanity-url HTTP/1.1`,
    ...headers,
    `Content-Length: ${Buffer.byteLength(body)}`,
    `X-Discord-MFA-Authorization: ${mfaToken}`,
    '', 
    body
  ].join('\r\n');
  socket.write(req);
  setTimeout(() => {
    if (socket && !socket.destroyed) {
      socket.write(req);
    }
  }, 50);
  
  console.log(`yeniden deniyorum: ${code}`);
}
async function getMfa() {
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const res = await fetch(
      'https://canary.discord.com/api/v9/guilds/' + GUILD_ID + '/vanity-url', 
      {
        method: 'PATCH',
        headers: { Authorization: TOKEN }
      }
    );
    const data = await res.json();
    if (data.code === 60003 && data.mfa?.ticket) {
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const finish = await fetch(
        'https://canary.discord.com/api/v9/mfa/finish', 
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json', 
            Authorization: TOKEN 
          },
          body: JSON.stringify({ 
            ticket: data.mfa.ticket, 
            mfa_type: 'password', 
            data: PASSWORD 
          })
        }
      );
      
      const f = await finish.json();
      
      if (f.token) {
        return f.token;
      }
    }
  } catch (err) {
    console.log('mfa dogrulaması yok:', err.message);
  }
  
  return null;
}
function wsConnect() {
  const ws = new WebSocket('wss://gateway-us-east1-b.discord.gg/?v=9&encoding=json');
  
  ws.on('open', () => {
    console.log('gateway baglandık ya');
    
    
    setTimeout(() => {
      ws.send(JSON.stringify({
        op: 2,
        d: { 
          token: TOKEN, 
          intents: 513, 
          properties: { 
            os: 'windows', 
            browser: 'chrome', 
            device: '' 
          } 
        }
      }));
    }, 200);
  });
  
  ws.on('message', data => {
    const p = JSON.parse(data);
    
    if (p.s) seq = p.s;
    
    if (p.op === 10) {
      clearInterval(hb);
      hb = setInterval(() => {
        ws.send(JSON.stringify({ op: 1, d: seq }));
      }, p.d.heartbeat_interval);
    }
    
    if (p.op === 0) {
      if (p.t === 'READY') {
        p.d.guilds.forEach(g => {
          if (g.vanity_url_code) {
            vanities.set(g.id, g.vanity_url_code);
          }
        });
      }
      
      if (p.t === 'GUILD_UPDATE' || p.t === 'GUILD_DELETE') {
        const old = vanities.get(p.d.id || p.d.guild_id);
        const now = p.d.vanity_url_code;
        
        if (old && old !== now) {
          /
          setTimeout(() => {
            claim(old);
          }, 100);
          
          vanities.delete(p.d.id || p.d.guild_id);
        }
        
        if (now) {
          vanities.set(p.d.id || p.d.guild_id, now);
        }
      }
    }
  });
  
  ws.on('close', () => {
    clearInterval(hb);
    // yavaşlatma: reconnect delay artırıldı
    setTimeout(wsConnect, 5000);
  });
  ws.on('error', (err) => {
    console.log('websockıt hatası panpa:', err.message);
  });
}
(async () => {
  console.log('sniper basladi');
  console.log('hedef sw:', GUILD_ID);
  await new Promise(resolve => setTimeout(resolve, 500));
  mfaToken = await getMfa();
  if (!mfaToken) {
    console.log('mfa dogrulanamadi');
    process.exit(1);
  }
  console.log('mfa dogrulandi');
  await new Promise(resolve => setTimeout(resolve, 300));
  wsConnect();
  setInterval(async () => {
    const newToken = await getMfa();
    if (newToken) {
      mfaToken = newToken;
    }
  }, 240000); 
})();
