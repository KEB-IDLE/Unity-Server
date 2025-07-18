const express = require("express");
const { createServer } = require("http");
const WebSocket = require("ws");

const app = express();
const port = 3000;
const server = createServer(app);
const wss = new WebSocket.Server({ server });

let clients = [];

/**
 * 모든 클라이언트에게 메시지 전송
 */
function broadcast(type, data = {}) {
  const message = JSON.stringify({ type, ...data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

/**
 * sender를 제외한 모든 클라이언트에게 메시지 전송
 */
function broadcastExceptSender(sender, message) {
  for (const client of clients) {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

// 각 클라이언트의 ready 상태 추적
const clientStates = new Map();

wss.on("connection", function (ws) {

  const totalClients = clients.length + 1;

  if (totalClients > 2) {
    console.log("❌ 최대 2명까지만 허용됩니다. 연결 거부");
    ws.send(JSON.stringify({ type: "error", message: "최대 2명까지만 허용됩니다." }));
    ws.close();
    return;
  }

  clients.push(ws);
  clientStates.set(ws, { ready: false });

  console.log("🔗 클라이언트 연결됨. 현재 접속자 수:", clients.length);

  if (clients.length === 2) {
    console.log("✅ 두 명 접속함 → startCountdown 메시지 브로드캐스트");
    broadcast("startCountdown");
  };



  ws.on("message", function (data) {
    try {
      const json = JSON.parse(data);
      const { type } = json;

      if (type === "ready") {
        clientStates.set(ws, { ready: true });
        console.log(`✅ 클라이언트 ready 수신 (${[...clientStates.values()].filter(c => c.ready).length}/2)`);

        // 모든 클라이언트가 ready 상태면 gameStart
        const allReady = [...clientStates.values()].every(c => c.ready);
        if (allReady && clients.length === 2) {
          console.log("🚀 모든 유저 ready → gameStart 전송");
          broadcast("gameStart");
        }
      }

      else if (["init", "stateUpdate"].includes(type)) {
        console.log(`📤 [RELAY] ${type} 메시지 중계`);

        if (type === "stateUpdate" && Array.isArray(json.units)) {
          json.units.forEach((unit, index) => {
            const pos = unit.position?.map(p => p.toFixed(2)).join(", ");
            console.log(`  🔄 유닛 ${index + 1}: id=${unit.unitId}, pos=[${pos}]`);
          });
        }

        broadcastExceptSender(ws, JSON.stringify(json));
      }


      else {
        console.log(`⚠️ 알려지지 않은 타입 수신: ${type}`);
      }
    } catch (err) {
      console.error("❌ 메시지 처리 오류:", err);
    }
  });

  ws.on("close", function () {
    console.log("❌ 클라이언트 연결 해제됨.");
    clients = clients.filter(c => c !== ws);
    clientStates.delete(ws);
  });
});

server.listen(port, () => {
  console.log(`🌐 서버 실행 중: http://localhost:${port}`);
});
