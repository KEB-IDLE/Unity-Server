const express = require("express");
const { createServer } = require("http");
const WebSocket = require("ws");

const app = express();
const port = 3000;

app.use(express.json());

// 유저 정보
app.get("/api/user", (req, res) => {
  res.json({
    user_id: 1,
    nickname: "TestUser",
    profile_icon_id: 1,
    profile_char_id: 1,
    level: 1,
    exp: 0,
    gold: 1000,
  });
});

// 보유한 아이콘 목록
app.get("/api/user/icons", (req, res) => {
  res.json([1, 2, 3]);
});

// 랭크 기록
app.get("/api/user/record", (req, res) => {
  res.json({
    user_id: 1,
    last_login_at: new Date().toISOString(),
    rank_match_count: 10,
    rank_wins: 6,
    rank_losses: 4,
    rank_point: 1200,
    tier: "Bronze",
    global_rank: 123,
  });
});

// 글로벌 랭킹
app.get("/api/ranking", (req, res) => {
  res.json({
    success: true,
    data: [
      { rank: 1, nickname: "Alice", profile_icon_id: 1, rank_point: 1500 },
      { rank: 2, nickname: "Bob", profile_icon_id: 2, rank_point: 1400 },
      { rank: 3, nickname: "Charlie", profile_icon_id: 3, rank_point: 1300 },
    ],
  });
});

// 매칭 큐 등록
app.post("/api/match/join", (req, res) => {
  console.log("🟢 매칭 큐 등록 요청:", req.body);
  res.json({ matched: false }); // 매칭 성공 여부 (false로 고정)
});

// 매칭 상태 확인
app.get("/api/match/status", (req, res) => {
  console.log("🟡 매칭 상태 요청:", req.query);

  const now = Date.now();
  const startTime = Math.floor((now + 3000) / 1000); // 3초 뒤 시작

  res.json({
    matched: true,
    opponentId: "user-1",
    roomId: "room-abc",
    start_at: startTime.toString(),
  });
});

// 매칭 종료 처리
app.post("/api/match/end", (req, res) => {
  console.log("🏁 매칭 종료 처리:", req.body);
  res.json({ success: true, message: "게임 종료 처리 완료" });
});

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

          // ✅ ready 상태 초기화 (중복 방지)
          for (const client of clients) {
            const state = clientStates.get(client);
            if (state) state.ready = false;
          }
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
