/* 류람쥐와 친구들 — MSU Arcade 이식판 (2호기)
 * 원작: Unity WebGL (playables-lab/stacker) — 룰·수치·연출을 1:1 이식
 * 스택: 순수 Canvas + Matter.js 물리 + WebAudio 칩튠 + MSU Arcade SDK
 * 에셋 0개 원칙 유지 — 동물·배경·음악 전부 코드 생성
 */
(function () {
  'use strict';

  // ── 상수 (1 Unity unit = 60px, y축은 캔버스 방향으로 뒤집힘) ──
  var U = 60;
  var VW = 960, VH = 600;              // 논리 해상도
  var GRAVITY_Y = 1.5;                 // Unity 25u/s² ≈ 1500px/s² → Matter 1.5
  var ISLAND_W = 5 * U, ISLAND_H = 1 * U;
  var KILL_Y = 3 * U;                  // 섬 위표면(0)보다 이만큼 아래로 떨어지면 사망
  var CLEAR_SCORE = 10;
  var AUTO_DROP = 3.5;                 // 초
  var SWING_AMP = 2.6 * U;
  var SPAWN_ABOVE = 4.2 * U;

  var M = window.Matter;
  var Engine = M.Engine, Bodies = M.Bodies, Body = M.Body, World = M.World, Events = M.Events;

  // ── 팔레트 ──
  var COL = {
    sky: '#8FC9F5', skyTop: '#79b8ef',
    grass: '#6BBA52', grassDark: '#54a341', dirt: '#75563A', dirtDark: '#61472f',
    navy: 'rgba(26,33,56,0.92)', mint: '#5CD48C', gold: '#FFD142', red: '#FF5950',
    cloud: '#FAFCFF', sun: '#FFE559', eye: '#14141A', white: '#FFFFFF'
  };

  // ── 동물 정의 (Unity AnimalFactory 이식 — 단위: Unity u, y는 위가 + ) ──
  // phys: 콜라이더 파츠 / deco: 그리기 전용
  function P(x, y, w, h, rot) { return { x: x, y: y, w: w, h: h, rot: rot || 0 }; }
  var ANIMALS = {
    Elephant: {
      mass: 5.5, color: '#8C94A6',
      phys: [P(0, 0.8, 2.4, 1.3), P(1.5, 1.25, 0.9, 0.9), P(1.95, 0.65, 0.25, 0.95), P(-0.8, 0.25, 0.38, 0.5), P(0.8, 0.25, 0.38, 0.5)],
      deco: [{ p: P(1.4, 1.55, 0.5, 0.55), c: '#7d8598' }],
      eyes: [{ x: 1.62, y: 1.4 }], eyeSize: 0.12
    },
    Squirrel: {
      mass: 0.6, color: '#9E6638',
      phys: [P(0, 0.3, 0.6, 0.5), P(0.4, 0.55, 0.35, 0.35), P(-0.42, 0.55, 0.22, 0.75, 22)],
      deco: [], eyes: [{ x: 0.46, y: 0.6 }], eyeSize: 0.08
    },
    Giraffe: {
      mass: 4, color: '#EDC240',
      phys: [P(0, 0.9, 1.5, 0.8), P(0.5, 1.95, 0.3, 1.7, -8), P(0.75, 2.85, 0.55, 0.35), P(-0.5, 0.3, 0.22, 0.62), P(0.5, 0.3, 0.22, 0.62)],
      deco: [], eyes: [{ x: 0.82, y: 2.9 }], eyeSize: 0.1
    },
    Pig: {
      mass: 2.5, color: '#F5A6B8',
      phys: [P(0, 0.5, 1.3, 0.8), P(0.72, 0.55, 0.28, 0.32), P(-0.42, 0.12, 0.24, 0.24), P(0.42, 0.12, 0.24, 0.24)],
      deco: [{ p: P(0.45, 0.98, 0.15, 0.2), c: '#e895a8' }, { p: P(0.875, 0.58, 0.05, 0.09), c: '#B86B80' }],
      eyes: [{ x: 0.5, y: 0.72 }], eyeSize: 0.1
    },
    Duck: {
      mass: 1, color: '#F7F2E0',
      phys: [P(0, 0.4, 0.9, 0.6), P(0.42, 0.9, 0.4, 0.42)],
      deco: [{ p: P(0.72, 0.85, 0.26, 0.12), c: '#F28C26' }],
      eyes: [{ x: 0.5, y: 0.96 }], eyeSize: 0.09
    }
  };
  var POOL = ['Elephant', 'Squirrel', 'Giraffe', 'Pig', 'Duck'];
  var WEIGHTS = [22, 20, 16, 20, 22];

  // ── 상태 ──
  var canvas, ctx, dpr = 1, viewScale = 1, viewOX = 0, viewOY = 0;
  var engine, ground;
  var animals = [];        // {body, kind, def, landed, dying, eyeScale, faceFront, alpha, drawScale, event}
  var current = null;      // 스윙 중인 동물
  var swingPhase = 0, spawnedAt = 0, lastKind = null;
  var score = 0, playing = true, cleared = false, eventsFired = 0;
  var towerTop = 0;        // 월드 y (위로 갈수록 음수)
  var camY = -60, camS = 1;
  var now = 0;             // 게임 시계(초)
  var online = false, bestScore = 0, leaderboard = null, submitted = false;
  var muteRect = { x: VW - 128, y: 14, w: 112, h: 36 };

  // ══════════════════════ 초기화 ══════════════════════

  function boot() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', fit);
    fit();

    canvas.addEventListener('pointerdown', onTap);

    initWorld();

    // SDK: 셸 연결을 기다리되 1.5초 안 오면 오프라인 진행 (가이드 권장 패턴)
    var A = window.Arcade;
    if (A && A.ready) {
      Promise.race([A.ready().then(function () { return true; }), new Promise(function (r) { setTimeout(function () { r(false); }, 1500); })])
        .then(function (ok) {
          online = ok;
          if (ok) A.collection.create('scores', ['score']).catch(function () { online = false; });
        });
      A.save.get('best').then(function (v) { if (v) bestScore = v; });
    }

    requestAnimationFrame(loop);
  }

  function fit() {
    dpr = window.devicePixelRatio || 1;
    var cw = canvas.clientWidth, ch = canvas.clientHeight;
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    viewScale = Math.min(cw / VW, ch / VH);
    viewOX = (cw - VW * viewScale) / 2;
    viewOY = (ch - VH * viewScale) / 2;
  }

  function initWorld() {
    engine = Engine.create();
    engine.gravity.y = GRAVITY_Y;
    ground = Bodies.rectangle(0, ISLAND_H / 2, ISLAND_W, ISLAND_H, { isStatic: true, friction: 0.9, label: 'ground' });
    World.add(engine.world, ground);
    Events.on(engine, 'collisionStart', onCollision);

    animals = []; current = null; score = 0; playing = true; cleared = false;
    eventsFired = 0; towerTop = 0; camY = -60; camS = 1; submitted = false; leaderboard = null;
    spawnNext();
  }

  // ══════════════════════ 동물 생성 ══════════════════════

  function weightedPick() {
    var total = 0, i;
    for (i = 0; i < WEIGHTS.length; i++) total += WEIGHTS[i];
    var roll = Math.random() * total;
    for (i = 0; i < POOL.length; i++) { roll -= WEIGHTS[i]; if (roll < 0) return POOL[i]; }
    return POOL[0];
  }
  function pickKind() {
    var k = weightedPick();
    if (lastKind && k === lastKind) k = weightedPick();
    lastKind = k;
    return k;
  }

  // feet(발바닥) 기준점 (fx, fy)에 동물 컴파운드 바디 생성
  function buildAnimal(kind, fx, fy) {
    var def = ANIMALS[kind];
    var parts = def.phys.map(function (p) {
      return Bodies.rectangle(fx + p.x * U, fy - p.y * U, p.w * U, p.h * U, {
        angle: -p.rot * Math.PI / 180, friction: 0.9, restitution: 0, label: 'animal-part'
      });
    });
    var body = Body.create({ parts: parts, friction: 0.9, restitution: 0, frictionAir: 0.015 });
    Body.setMass(body, def.mass);
    Body.setStatic(body, true);
    var a = { body: body, kind: kind, def: def, landed: false, dying: false, eyeScale: 1, faceFront: false, alpha: 1, drawScale: 1, evt: null, feetRef: { x: fx, y: fy } };
    body.plugin.animal = a;
    animals.push(a);
    World.add(engine.world, body);
    return a;
  }

  function spawnNext() {
    var top = towerTop; // 월드 y (음수 = 높음)
    var a = buildAnimal(pickKind(), 0, top - SPAWN_ABOVE + 0); // 발 기준 스폰
    current = a;
    spawnedAt = now;
  }

  // ══════════════════════ 게임 루프 ══════════════════════

  var lastT = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0.016;
    lastT = t; now += dt;

    if (current) {
      var speed = Math.min(3.6, 1.7 + 0.08 * score);
      swingPhase += dt * speed;
      var sx = Math.sin(swingPhase) * SWING_AMP;
      Body.setPosition(current.body, { x: sx + (current.body.position.x - feetX(current)), y: current.body.position.y });
      // 위 한 줄 대신 발 기준 위치 재계산이 안전:
      positionByFeet(current, sx, towerTop - SPAWN_ABOVE);
      if (playing && now - spawnedAt > AUTO_DROP) drop();
    }

    tickAntics(dt);
    Engine.update(engine, dt * 1000);

    // 추락 감시
    if (playing) {
      for (var i = 0; i < animals.length; i++) {
        var a = animals[i];
        if (!a.dying && a.body.position.y > KILL_Y) { gameOver(); break; }
      }
    }

    // 카메라 (탑 중간 + 줌아웃)
    var hUnits = Math.max(0, -towerTop / U);
    var targetS = 11 / (11 + Math.max(0, hUnits - 2) * 1.1);
    var targetY = towerTop * 0.55 - 60;
    camS += (targetS - camS) * Math.min(1, dt * 3);
    camY += (targetY - camY) * Math.min(1, dt * 3);

    render();
  }

  function feetX(a) { return a.feetRef.x; }
  function positionByFeet(a, fx, fy) {
    // 컴파운드 중심과 발 기준점의 오프셋 유지
    var dx = fx - a.feetRef.x, dy = fy - a.feetRef.y;
    Body.setPosition(a.body, { x: a.body.position.x + dx, y: a.body.position.y + dy });
    a.feetRef.x = fx; a.feetRef.y = fy;
  }

  function drop() {
    if (!current) return;
    var a = current;
    current = null;
    Body.setStatic(a.body, false);
  }

  // ══════════════════════ 판정 ══════════════════════

  function onCollision(ev) {
    for (var i = 0; i < ev.pairs.length; i++) {
      var pa = ev.pairs[i].bodyA.parent, pb = ev.pairs[i].bodyB.parent;
      checkLand(pa, pb); checkLand(pb, pa);
    }
  }

  function checkLand(b, other) {
    var a = b.plugin && b.plugin.animal;
    if (!a || a.landed || b.isStatic) return; // 스윙 대기(스태틱) 중엔 착지 없음
    var onGround = other === ground;
    var otherAnimal = other.plugin && other.plugin.animal;
    if (onGround || (otherAnimal && otherAnimal !== a)) {
      a.landed = true;
      Body.setVelocity(b, { x: b.velocity.x * 0.25, y: b.velocity.y * 0.25 });
      Body.setAngularVelocity(b, b.angularVelocity * 0.3);
      onLanded(a);
    }
  }

  function onLanded(a) {
    if (!playing) return;
    score++;
    if (score >= CLEAR_SCORE && !cleared) { cleared = true; sfxClear(); }
    var topY = a.body.bounds.min.y;
    if (topY < towerTop) towerTop = topY;
    sfxLand();
    spawnNext();
    scheduleAntics(a);
  }

  function gameOver() {
    playing = false;
    if (score > bestScore) { bestScore = score; if (window.Arcade) window.Arcade.save.set('best', bestScore).catch(function () {}); }
    if (online && !submitted) {
      submitted = true;
      var A = window.Arcade;
      A.collection.add('scores', { score: score }).catch(function () {});
      A.collection.maxByOwner('scores', 'score', 5).then(function (rows) { leaderboard = rows || []; }).catch(function () {});
    }
  }

  function restart() { World.clear(engine.world); Events.off(engine); initWorld(); }

  // ══════════════════════ 얼탱이 이벤트 (에스컬레이션 + pity) ══════════════════════

  function scheduleAntics(a) {
    var chaos = Math.min(1, score / 6);
    var pity = eventsFired === 0 && score >= 3;
    a.evt = { wiggleAt: now + rand(2.5, 6) };
    var shrink = 1 - 0.65 * chaos;
    if (a.kind === 'Duck') {
      var fc = pity ? 1 : lerp(0.4, 0.9, chaos);
      if (Math.random() < fc) a.evt.flightAt = now + (pity ? rand(1.5, 3) : rand(3, 6) * shrink);
    } else {
      var wc = pity ? 1 : lerp(0.25, 0.75, chaos);
      if (Math.random() < wc) a.evt.walkAt = now + (pity ? rand(1.5, 3) : rand(3, 6) * shrink);
    }
  }

  function tickAntics(dt) {
    for (var i = animals.length - 1; i >= 0; i--) {
      var a = animals[i];
      if (!a.evt || a.dying) continue;
      var e = a.evt;

      // 곁눈질 텔레그래프: 이벤트 1.6초 전부터 흘끔거림
      var pending = e.walkAt || e.flightAt;
      a.glancing = playing && pending && (pending - now) < 1.6 && !e.phase;

      if (playing && e.wiggleAt && now >= e.wiggleAt && alive(a)) {
        e.wiggleAt = now + rand(2.5, 6);
        wiggle(a);
      }
      if (playing && e.walkAt && now >= e.walkAt && alive(a) && !e.phase) startWalkout(a);
      if (playing && e.flightAt && now >= e.flightAt && alive(a) && !e.phase) startFlight(a);

      if (e.phase) tickEvent(a, dt);
    }
  }

  function alive(a) { return a.landed && !a.body.isStatic && playing && a.body.position.y < KILL_Y - 30; }

  function wiggle(a) {
    var b = a.body, s = Math.random() < 0.5 ? -1 : 1, mode = Math.floor(Math.random() * 3);
    if (mode === 0) Body.setVelocity(b, { x: b.velocity.x + s * rand(12, 30), y: b.velocity.y - rand(54, 84) });
    else if (mode === 1) Body.setVelocity(b, { x: b.velocity.x + s * rand(36, 60), y: b.velocity.y - 15 });
    else Body.setAngularVelocity(b, b.angularVelocity + s * rand(1.2, 2.2));
  }

  function startWalkout(a) {
    eventsFired++;
    a.evt.phase = 'stare'; a.evt.t = 0;
    Body.setStatic(a.body, true);
    a.faceFront = true; a.eyeScale = 1.7;
    sfxEvent();
  }

  function startFlight(a) {
    eventsFired++;
    a.evt.phase = 'fly'; a.evt.t = 0;
    a.evt.start = { x: a.body.position.x, y: a.body.position.y };
    a.evt.dur = rand(2.2, 3.2);
    Body.setStatic(a.body, true);
    a.eyeScale = 1.6;
    sfxEvent();
  }

  function tickEvent(a, dt) {
    var e = a.evt; e.t += dt;
    if (e.phase === 'stare') {
      if (e.t > 1.0) { e.phase = 'walk'; e.t = 0; }
    } else if (e.phase === 'walk') {
      // 카메라 쪽으로 뒤뚱뒤뚱 다가오며 커지다 사라진다 (2D식 '화면 밖 퇴장')
      var u = e.t / 2.0;
      a.drawScale = 1 + u * 1.4;
      a.alpha = 1 - Math.max(0, u - 0.55) / 0.45;
      a.waddle = Math.sin(e.t * 9) * 8;
      if (u >= 1) removeAnimal(a);
    } else if (e.phase === 'fly') {
      var s = e.start, t = e.t;
      Body.setPosition(a.body, {
        x: s.x + Math.sin(t * 2.3) * 2.4 * U,
        y: s.y - (1.0 + (t / e.dur) * 3.2) * U - Math.sin(t * 5) * 0.3 * U
      });
      Body.setAngle(a.body, Math.sin(t * 14) * 0.24);
      if (t >= e.dur) {
        e.phase = null;
        a.eyeScale = 2.4;                 // "아 맞다 나 못 날지"
        Body.setStatic(a.body, false);    // 자유낙하 — 운명에 맡긴다
      }
    }
  }

  function removeAnimal(a) {
    a.dying = true;
    World.remove(engine.world, a.body);
    var i = animals.indexOf(a);
    if (i >= 0) animals.splice(i, 1);
  }

  // ══════════════════════ 입력 ══════════════════════

  function onTap(ev) {
    var r = canvas.getBoundingClientRect();
    var x = (ev.clientX - r.left - viewOX) / viewScale;
    var y = (ev.clientY - r.top - viewOY) / viewScale;
    startAudio();
    if (x >= muteRect.x && x <= muteRect.x + muteRect.w && y >= muteRect.y && y <= muteRect.y + muteRect.h) { toggleMute(); return; }
    if (!playing) { restart(); return; }
    if (current) { drop(); }
  }

  // ══════════════════════ 렌더 ══════════════════════

  function render() {
    var cw = canvas.width / dpr, ch = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 하늘
    var g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, COL.skyTop); g.addColorStop(1, COL.sky);
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.translate(viewOX, viewOY); ctx.scale(viewScale, viewScale);
    ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();

    // 원경 (스크린 공간): 해 + 구름
    sun(830, 90, 42);
    cloud(140, 120, 1.2); cloud(700, 70, 0.9); cloud(430, 170, 0.7); cloud(860, 250, 1.0);

    // ── 월드 공간 ──
    ctx.save();
    ctx.translate(VW / 2, VH * 0.66);
    ctx.scale(camS, camS);
    ctx.translate(0, -camY);

    // 관중 링 (구름 탄 동물들)
    drawSpectators();

    // 섬 (잔디 캡 + 흙 몸통)
    ctx.fillStyle = COL.dirt;
    ctx.fillRect(-ISLAND_W / 2, 14, ISLAND_W, ISLAND_H - 14);
    ctx.fillStyle = COL.dirtDark;
    ctx.fillRect(-ISLAND_W / 2, ISLAND_H - 10, ISLAND_W, 10);
    ctx.fillStyle = COL.grass;
    ctx.fillRect(-ISLAND_W / 2 - 2, 0, ISLAND_W + 4, 16);
    ctx.fillStyle = COL.grassDark;
    ctx.fillRect(-ISLAND_W / 2 - 2, 12, ISLAND_W + 4, 4);

    // 동물들
    for (var i = 0; i < animals.length; i++) drawAnimal(animals[i]);

    ctx.restore();

    // ── UI (스크린 공간) ──
    drawUI();
    ctx.restore();

    // 레터박스
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d1322';
    if (viewOY > 0) { ctx.fillRect(0, 0, cw, viewOY); ctx.fillRect(0, ch - viewOY - 1, cw, viewOY + 1); }
    if (viewOX > 0) { ctx.fillRect(0, 0, viewOX, ch); ctx.fillRect(cw - viewOX - 1, 0, viewOX + 1, ch); }
  }

  function sun(x, y, r) {
    ctx.fillStyle = COL.sun;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  function cloud(x, y, s) {
    ctx.fillStyle = COL.cloud;
    ctx.beginPath();
    ctx.ellipse(x, y, 55 * s, 20 * s, 0, 0, 7);
    ctx.ellipse(x + 34 * s, y - 8 * s, 34 * s, 16 * s, 0, 0, 7);
    ctx.ellipse(x - 30 * s, y - 5 * s, 28 * s, 14 * s, 0, 0, 7);
    ctx.fill();
  }

  var SPECTATORS = [];
  (function () {
    var kinds = ['Elephant', 'Squirrel', 'Giraffe', 'Pig', 'Duck', 'Pig', 'Squirrel', 'Duck'];
    for (var i = 0; i < kinds.length; i++) {
      var t = i / (kinds.length - 1);
      var x = lerp(-430, 430, t);
      var y = 40 + Math.sin(i * 1.7) * 55 + Math.abs(x) * 0.12;
      if (Math.abs(x) < 210) continue; // 섬 자리는 비움
      SPECTATORS.push({ kind: kinds[i], x: x, y: y, flip: x > 0 });
    }
  })();

  function drawSpectators() {
    for (var i = 0; i < SPECTATORS.length; i++) {
      var s = SPECTATORS[i];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(0.62, 0.62);
      cloud(0, 26, 0.85);
      if (s.flip) ctx.scale(-1, 1);
      drawAnimalShape(ANIMALS[s.kind], 1, 1, false);
      ctx.restore();
    }
  }

  // def 모양을 발 기준 (0,0)에 그림 (위 = -y)
  function drawAnimalShape(def, eyeScale, alpha, faceFront) {
    ctx.globalAlpha = alpha;
    var i, p;
    for (i = 0; i < def.phys.length; i++) { p = def.phys[i]; rectPart(p, def.color); }
    for (i = 0; i < def.deco.length; i++) { p = def.deco[i]; rectPart(p.p, p.c); }
    // 눈
    ctx.fillStyle = COL.eye;
    for (i = 0; i < def.eyes.length; i++) {
      var e = def.eyes[i], es = def.eyeSize * U * eyeScale;
      if (faceFront) {
        // 정면 얼굴: 눈 두 개를 나란히 (돌아본 컨셉)
        ctx.fillRect(e.x * U - es * 1.3, -e.y * U - es / 2, es, es);
        ctx.fillRect(e.x * U + es * 0.3, -e.y * U - es / 2, es, es);
      } else {
        ctx.fillRect(e.x * U - es / 2, -e.y * U - es / 2, es, es);
      }
    }
    ctx.globalAlpha = 1;
  }
  function rectPart(p, color) {
    ctx.save();
    ctx.translate(p.x * U, -p.y * U);
    if (p.rot) ctx.rotate(-p.rot * Math.PI / 180);
    ctx.fillStyle = color;
    ctx.fillRect(-p.w * U / 2, -p.h * U / 2, p.w * U, p.h * U);
    ctx.restore();
  }

  function drawAnimal(a) {
    var b = a.body;
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle + (a.waddle ? a.waddle * Math.PI / 180 : 0));
    if (a.drawScale !== 1) ctx.scale(a.drawScale, a.drawScale);
    // 컴파운드 중심 → 발 기준 보정
    var cx = b.position.x, cy = b.position.y;
    // 파츠는 실제 물리 좌표로 그리는 게 정확: 여기선 중심 기준 원본 def를 재현
    var off = compoundOffset(a);
    ctx.translate(off.x, off.y);
    var glance = a.glancing ? Math.sin(now * 6) > 0.3 : false;
    drawAnimalShape(a.def, a.eyeScale * (glance ? 1.35 : 1), a.alpha, a.faceFront || glance);
    ctx.restore();
  }

  // def 발 기준점이 컴파운드 중심에서 어디인지 (생성 시점 기하로 계산)
  function compoundOffset(a) {
    if (!a._off) {
      var def = a.def, sx = 0, sy = 0, sm = 0;
      for (var i = 0; i < def.phys.length; i++) {
        var p = def.phys[i], m = p.w * p.h;
        sx += p.x * m; sy += -p.y * m; sm += m;
      }
      a._off = { x: -(sx / sm) * U, y: -(sy / sm) * U };
    }
    return a._off;
  }

  // ── UI ──
  function drawUI() {
    // 게이지
    var gw = 440, gh = 32, gx = (VW - gw) / 2, gy = 16;
    rounded(gx - 4, gy - 4, gw + 8, gh + 8, 14, COL.navy);
    var fillW = gw * Math.min(1, score / CLEAR_SCORE);
    if (fillW > 8) rounded(gx, gy, fillW, gh, 10, cleared ? COL.gold : COL.mint);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (var i = 1; i < CLEAR_SCORE; i++) ctx.fillRect(gx + gw * i / CLEAR_SCORE - 1, gy + 3, 2, gh - 6);
    text(score + ' / ' + CLEAR_SCORE + '  ·  GOAL = TOP 0.01%', VW / 2, gy + gh / 2, 16, COL.white, 'center', true);

    // 사운드
    rounded(muteRect.x, muteRect.y, muteRect.w, muteRect.h, 12, audioMuted ? 'rgba(90,50,56,0.92)' : COL.navy);
    text(audioMuted ? '♪ OFF' : '♪ ON', muteRect.x + muteRect.w / 2, muteRect.y + muteRect.h / 2, 13, COL.white, 'center', true);

    // 최고기록
    if (bestScore > 0) text('BEST ' + bestScore, 24, 34, 14, 'rgba(255,255,255,0.85)', 'left', true);

    // 카운트다운
    if (playing && current) {
      var tl = AUTO_DROP - (now - spawnedAt);
      if (tl <= 3.05) {
        var n = Math.max(1, Math.ceil(tl));
        text(n + '!', VW / 2, 100, 56, n <= 1 ? COL.red : COL.white, 'center', true);
      }
    }

    if (cleared) text('★ CLEAR! YOU ARE TOP 0.01% ★', VW / 2, 96 + 46, 30, COL.gold, 'center', true);

    // 게임오버 패널
    if (!playing) {
      var pw = 480, ph = leaderboard && leaderboard.length ? 150 + leaderboard.length * 24 : 120;
      var px = (VW - pw) / 2, py = VH * 0.32;
      rounded(px, py, pw, ph, 16, COL.navy);
      text(cleared ? 'FINISHED AS TOP 0.01%' : 'GAME OVER', VW / 2, py + 32, 26, cleared ? COL.gold : COL.white, 'center', true);
      text('SCORE ' + score + '   ·   BEST ' + bestScore, VW / 2, py + 64, 15, 'rgba(220,228,244,0.95)', 'center', true);
      var ly = py + 92;
      if (leaderboard && leaderboard.length) {
        text('— LEADERBOARD —', VW / 2, ly, 13, 'rgba(180,190,215,0.9)', 'center', true);
        ly += 22;
        for (var r = 0; r < leaderboard.length; r++) {
          var row = leaderboard[r];
          var who = String(row.owner || '???');
          who = who.length > 10 ? who.slice(0, 10) + '…' : who;
          text((r + 1) + '.  ' + who + '  —  ' + row.max, VW / 2, ly, 14, COL.white, 'center', true);
          ly += 24;
        }
      } else if (online) {
        text('리더보드 불러오는 중…', VW / 2, ly, 13, 'rgba(180,190,215,0.9)', 'center', true);
        ly += 24;
      }
      text('TAP TO RETRY', VW / 2, py + ph - 22, 15, 'rgba(200,210,235,0.95)', 'center', true);
    }
  }

  function rounded(x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.fill();
  }
  function text(s, x, y, size, color, align, shadow) {
    ctx.font = '700 ' + size + 'px system-ui, -apple-system, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillText(s, x + 2, y + 2); }
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  // ══════════════════════ 오디오 (WebAudio 칩튠 — 유니티 MusicBox 이식) ══════════════════════

  var actx = null, audioMuted = false, bgmTimer = null, masterGain = null;

  function startAudio() {
    if (actx) return;
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    masterGain = actx.createGain(); masterGain.gain.value = 0.3; masterGain.connect(actx.destination);
    scheduleBgmLoop();
  }
  function toggleMute() {
    audioMuted = !audioMuted;
    if (masterGain) masterGain.gain.value = audioMuted ? 0 : 0.3;
  }

  var MELODY = [72, 76, 79, 76, 72, 76, 79, 81, 77, 81, 84, 81, 77, 81, 79, 76, 74, 77, 81, 77, 74, 77, 76, 72, 67, 71, 74, 71, 67, 71, 72, -1];
  var BASS = [48, 53, 50, 55];
  var EIGHTH = 60 / 132 / 2;

  function midiFreq(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function scheduleBgmLoop() {
    var loopLen = EIGHTH * MELODY.length;
    var startT = actx.currentTime + 0.1;
    function scheduleOnce(t0) {
      for (var i = 0; i < MELODY.length; i++) {
        var t = t0 + i * EIGHTH;
        if (MELODY[i] >= 0) tone(midiFreq(MELODY[i]), t, EIGHTH * 0.95, 'square', 0.5);
        if (i % 2 === 0) tone(midiFreq(BASS[Math.floor(i / 8)]), t, EIGHTH * 1.9, 'triangle', 0.38);
      }
    }
    scheduleOnce(startT);
    var next = startT + loopLen;
    bgmTimer = setInterval(function () {
      if (actx.currentTime > next - 0.3) { scheduleOnce(next); next += loopLen; }
    }, 100);
  }

  function tone(freq, t, dur, type, vol) {
    var o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(masterGain);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function sfx(freq, dur, type, vol) {
    if (!actx || audioMuted) return;
    tone(freq, actx.currentTime, dur, type || 'square', vol || 0.4);
  }
  function sfxLand() { sfx(220, 0.09, 'square', 0.35); }
  function sfxEvent() { sfx(660, 0.12, 'square', 0.3); setTimeout(function () { sfx(880, 0.12, 'square', 0.3); }, 110); }
  function sfxClear() { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { sfx(f, 0.18, 'square', 0.35); }, i * 120); }); }

  // ══════════════════════ 유틸 ══════════════════════

  function rand(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
