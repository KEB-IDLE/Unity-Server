const express = require("express");
const { createServer } = require("http");
const WebSocket = require("ws");

const app = express();
const port = 3000;
const server = createServer(app);
const wss = new WebSocket.Server({ server });

const TEAM_LIST = ["Red", "Blue"];
let clients = [];
let nextClientId = 0;

const clientStates = new Map();           // team, ready
const clientInitData = new Map();         // unit init info

function broadcast(type, data = {}) {
  const message = JSON.stringify({ type, ...data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

wss.on("connection", function (ws) {
  if (clients.length >= 2) {
    ws.send(JSON.stringify({ type: "error", message: "최대 2명까지만 허용됩니다." }));
    ws.close();
    return;
  }

  ws.clientId = `${nextClientId++}`;
  ws.userId = `user-${ws.clientId}`;
  clients.push(ws);
  console.log(`🔗 클라이언트 연결됨 (ID: ${ws.clientId}) 현재 접속자 수: ${clients.length}`);

  ws.send(JSON.stringify({ type: "assignId", clientId: ws.userId }));

  if (clients.length === 2) {
    console.log("✅ 두 명 접속 완료 → 팀 배정 시작");

    const shuffled = TEAM_LIST.sort(() => Math.random() - 0.5);
    clientStates.set(clients[0], { team: shuffled[0], ready: false });
    clientStates.set(clients[1], { team: shuffled[1], ready: false });

    clients.forEach((client, i) => {
      const team = clientStates.get(client).team;
      client.send(JSON.stringify({ type: "teamAssign", team }));
    });

    console.log(`🎯 팀 할당됨 (랜덤): ${shuffled[0]}, ${shuffled[1]}`);

    setTimeout(() => {
      console.log("⏳ 카운트다운 시작");
      broadcast("startCountdown");
    }, 500);
  }

  ws.on("message", function (data) {
    try {
      const json = JSON.parse(data);
      const { type } = json;

      if (type === "init") {
        if (!clientInitData.has(ws)) {
          clientInitData.set(ws, []);
        }
        clientInitData.get(ws).push(json);
        console.log(`📥 init 메시지 저장됨: ${json.unitId}`);

        // ✅ 자신과 상대방 모두에게 전송
        for (const client of clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(json));
          }
        }

        console.log(`📤 init 메시지 양쪽 모두에게 전송됨: ${json.unitId}`);
      }

      else if (type === "ready") {
        const state = clientStates.get(ws);
        if (state) state.ready = true;

        const readyCount = [...clientStates.values()].filter(c => c.ready).length;
        console.log(`✅ 클라이언트 ready 수신 (${readyCount}/2)`);

        if (readyCount === 2 && clients.length === 2) {
          console.log("🚀 모든 유저 ready → gameStart 브로드캐스트");
          broadcast("gameStart");
        }
      }

      else {
        console.log(`⚠️ 알려지지 않은 타입 수신: ${type}`);
      }
    } catch (err) {
      console.error("❌ 메시지 처리 오류:", err);
    }
  });

  ws.on("close", () => {
    console.log(`❌ 클라이언트 연결 해제됨 (ID: ${ws.clientId})`);

    // 모든 클라이언트 연결 종료
    clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "forceDisconnect", message: "상대방 연결 종료로 게임이 종료됩니다." }));
        client.close();
      }
    });

    // 내부 상태 초기화
    clients = [];
    clientStates.clear();
    clientInitData.clear();

    console.log("📉 모든 연결 해제됨. 서버 상태 초기화");
  });
});

server.listen(port, () => {
  console.log(`🌐 서버 실행 중: http://localhost:${port}`);
});
