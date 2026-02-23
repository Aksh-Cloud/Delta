import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { Chess } from "https://cdn.jsdelivr.net/npm/chess.js@1.0.0/dist/esm/chess.js";

const canvas = document.getElementById("eyes");
const ctx = canvas.getContext("2d");
//setupHiResCanvas(canvas, ctx);
/* =====================
   STATE
===================== */
let blinkValue = 1;
let blinkTarget = 1;
let blinkTimer = 0;
let nextBlink = randomBlinkTime();
const SUPABASE_URL = "https://uamazwssxpdzwexvlvzf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_oYKeoDzCAN2deb-3pbBQZg_wYie4nB6";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let playerSide = null;
let lookX = 0;
let listenMode = "wake"; // "wake" | "command"
let lookY = 0;
let targetLookX = 0;
let targetLookY = 0;
let wakePulse = 0;      // 0 → 1 → 0
let waking = false;
let emotion = "neutral"; // neutral, happy, angry, sleepy
let wakeColor = 0;   // 0 → 1 → 0 (slow)
let colorDecay = false;
let sleeping = false;
let sleepBlinkSpeed = 0.04;
let zzzOffset = 0;
let zzzAlpha = 0;
let charging = false;
let chargePhase = 0;   // 0 → 1 looping
let recognition;
let listeningForWake = false;
const WAKE_WORD = "delta";
let isSpeaking = false;
let utterance = null;
let silenceTimer = null;
let lastHeardTime = Date.now();
let processingCommand = false; // prevent duplicate command handling
let preferredVoiceName = null;
const TARGET_VOICE_NAME = "Microsoft Mark - English";

const logSpan = document.getElementById("moveText");
const speakMoveBtn = document.getElementById("speakM");
const game = new Chess();


const SILENCE_DELAY = 12000; // 12 seconds

const refresh = document.getElementById('refresh');

refresh.addEventListener('dblclick', (event) => {
  window.location.reload();
});

const sleep = document.getElementById('sleep');

sleep.addEventListener('dblclick', (event) => {
  if (sleeping) {
    wakeFromSleep();
  } else {
    goToSleep();
  }
});

/* POWER ON */
let bootPhase = 0;
// 0 = off
// 1 = scan line
// 2 = expand
// 3 = glow fade
// 4 = online
let bootProgress = 0;

let VOICE = null;

/* ============================= */
/* DELTA ENGINE CLASS            */
/* ============================= */

class DeltaEngine {
    constructor() {
        this.worker = new Worker("deltaengine.js");
        this.moves = [];

        this.worker.postMessage("uci");

        this.worker.onmessage = (event) => {
            if (event.data.startsWith("bestmove")) {
                const move = event.data.split(" ")[1];
                if (move && move !== "(none)") {
                    this.moves.push(move);
                    this.onEngineMove(move);
                }
            }
        };
    }

    play(move) {
        if (move) this.moves.push(move);

        this.worker.postMessage(
            "position startpos moves " + this.moves.join(" ")
        );

        // FAST but strong
        this.worker.postMessage("go movetime 500");
    }

    onEngineMove(move) {}
}
const engine = new DeltaEngine();

function listenForC(callback) {
    const recognition =
        new (window.SpeechRecognition || window.webkitSpeechRecognition)();

    recognition.lang = "en-US";
    recognition.start();

    recognition.onresult = (event) => {
        const text = event.results[0][0].transcript.toLowerCase();
        callback(text);
    };
}

// Lightweight listen helper for single-shot speech (used for move input)
function listen(callback) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Speech Recognition not supported');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript.toLowerCase();
    try { callback(text); } catch (err) { console.error(err); }
    recognition.stop();
  };

  recognition.onerror = (e) => {
    console.warn('Speech error:', e.error);
    recognition.stop();
  };

  recognition.start();
}

function loadVoices() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;

  // Prefer explicit target voice when available, otherwise fall back to sensible defaults
  VOICE =
    voices.find(v => v.name === TARGET_VOICE_NAME) ||
    voices.find(v => v.name.includes("Mark")) ||
    voices.find(v => v.name.includes("Google US English")) ||
    voices.find(v => v.name.includes("David")) ||
    voices.find(v => v.lang.startsWith("en"));

  if (VOICE) {
    preferredVoiceName = VOICE.name;
    console.log("Locked voice:", VOICE.name);
  } else {
    console.log("Preferred voice not found. Available voices:", voices.map(v => v.name));
  }
}

// Chrome / Edge fix
speechSynthesis.onvoiceschanged = loadVoices;

// Fallback (some browsers)
loadVoices();


/* =====================
   HELPERS
===================== */
function randomBlinkTime() {
  return 90 + Math.random() * 220;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

async function detectEmotion(text) {
  //const res = await fetch(
  //  "https://uamazwssxpdzwexvlvzf.supabase.co/functions/v1/detect_emotion",
  //  {
  //    method: "POST",
  //    headers: { "Content-Type": "application/json" },
  //    body: JSON.stringify({ text }),
  //}
  //);

  const data = { emotion: "angry"};
  return data.emotion; // "angry" or "neutral"
}

function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
let speakQueue = [];
let speaking = false;

function chunkText(text, max = 120) {
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
}

function speak(text) {
  return new Promise(resolve => {
    if (!VOICE) {
      const id = setInterval(() => {
        if (VOICE) {
          clearInterval(id);
          speak(text).then(resolve);
        }
      }, 100);
      return;
    }

    const chunks = chunkText(text);
    speakQueue.push({ chunks, resolve });
    runSpeakQueue();
  });
}
function normalizeForSpeech(text) {
  if (text.includes("3.7")) {
    text = text.replace(/3\.7/g, "three point seven");
  }
  return text;
}

function runSpeakQueue() {
  if (speaking || speakQueue.length === 0) return;

  const item = speakQueue.shift();
  item.chunks = item.chunks.map(normalizeForSpeech);
  let i = 0;
  speaking = true;

  function speakNext() {
    if (i >= item.chunks.length) {
      speaking = false;
      item.resolve();
      runSpeakQueue();
      return;
    }

    // Ensure preferred voice is selected (helps on mobile where voices may arrive late)
    if (!VOICE) {
      const voices = speechSynthesis.getVoices();
      if (voices && voices.length) {
        if (preferredVoiceName) {
          VOICE = voices.find(v => v.name === preferredVoiceName) || voices.find(v => v.lang.startsWith('en'));
        } else {
          VOICE = voices.find(v => v.name.includes("Mark")) || voices.find(v => v.name.includes("Google US English")) || voices.find(v => v.lang.startsWith("en"));
          if (VOICE) preferredVoiceName = VOICE.name;
        }
      }
    }

    const utterance = new SpeechSynthesisUtterance(item.chunks[i++]);
    if (VOICE) utterance.voice = VOICE;

    // 👦 Boy-ish tuning
    utterance.rate = 1.05;
    utterance.pitch = 0.9;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      isSpeaking = true;
      recognition?.stop();
    };

    utterance.onend = () => {
      isSpeaking = false;
      setTimeout(speakNext, 90); // human pause
    };

    utterance.onerror = () => {
      isSpeaking = false;
      speakNext();
    };

    speechSynthesis.speak(utterance);
  }

  speakNext();
}

function startSpeakingEyes() {
  isSpeaking = true;   // if you still use this
}

function stopSpeakingEyes() {
  isSpeaking = false;
}
function goToSleep() {
  sleeping = true;
  wakeColor = 0;
  waking = false;
}

function wakeFromSleep() {
  sleeping = false;
  zzzAlpha = 0;
  blinkTarget = 1;
  blinkValue = 0.3;
}
function wakeWord() {
  if (bootPhase !== 4) return;

  waking = true;
  wakePulse = 1;
  wakeColor = 1;
  colorDecay = false;

  blinkTarget = 1;
  blinkValue = 0.3;

  setTimeout(() => {
    wakePulse = 0.6;
  }, 120);

  setTimeout(() => {
    wakePulse = 0;
    waking = false;
    colorDecay = true; // start slow fade
  }, 260);
}
function startCharging() {
  charging = true;
  sleeping = false;
}
function toLowerCaseAndTrim(text) {
  return text.toLowerCase().trim();
}
function startListening() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn("Speech Recognition not supported");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-UK";
  recognition.onresult = async (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
        .toLowerCase()
        .trim();

      if (event.results[i].isFinal) {
        console.log("User said:", transcript);
        if (listenMode === "command") {
            (async () => {
              try {
                await askDelta(transcript);
              } catch (err) {
                console.error(err);
              } finally {
                processingCommand = false;
              }
            })();
            recognition.stop();
            listeningForWake = false;
        }
      }
    }
  };

  recognition.onerror = e => {
    console.warn("Speech error:", e.error);
  };

  recognition.onend = () => {
    // auto-restart (important)
    try {
      if (listeningForWake) recognition.start();
    } catch (err) {
      console.log("SS");
    }
  };

  recognition.start();
  listeningForWake = true;
}
function setupHiResCanvas(canvas, ctx) {
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();

  canvas.width  = rect.width * dpr;
  canvas.height = rect.height * dpr;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function stopCharging() {
  charging = false;
  chargePhase = 0;
}
function startWakeWordListening() {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    console.warn("Speech Recognition not supported");
    return;
  }
  console.log("Starting wake-word recognition...");

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  recognition.onresult = async (event) => {
    // If we're already handling a wake -> command transition, ignore further results
    if (listenMode !== "wake") return;

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript
        .toLowerCase()
        .trim();

      if (transcript.includes(WAKE_WORD)) {
        console.log("Wake word detected:", transcript);

        if (processingCommand) return; // already processing a command
        processingCommand = true;

        if (sleeping) if(!isSpeaking) wakeFromSleep();
        // mark mode immediately to prevent duplicate handling from interim/final results
        listenMode = "command";
        await speak("Yes?");
        recognition.stop();
        canvas.classList.add("listening");
        wakeWord();
        startListening();
        // do not clear processingCommand here — it will be cleared when askDelta completes
        break;
      }
    }
  };

  recognition.onerror = e => {
    console.warn("Speech error:", e.error);
  };

  

  recognition.start();
  listeningForWake = true;
}
document.addEventListener("click", (e) => {
  // Ignore clicks on UI elements that intentionally start speech (class "speak")
  // so pressing the Speak buttons doesn't also start wake-word recognition.
  try {
    if (e.target && e.target.closest && e.target.closest('.speak')) return;
  } catch (err) {}

  if (!listeningForWake) {
    startWakeWordListening();
    console.log("Wake-word listening started");
  }
});
/* =====================
   DRAW EYE
===================== */
function drawEye(cx, cy) {
  const fullSize = 80;

  // ----- BASE SHAPE -----
  let pulse = waking ? wakePulse : 0;
  let size = fullSize * (1 + pulse * 0.08);
  let height = fullSize * blinkValue * (1 + pulse * 0.05);
  let radius = emotion === "angry" ? 6 : 18;

  let glow = 6;

  // ----- BOOT PHASES -----
  if (bootPhase === 0) return;

  if (bootPhase === 1) {
    // scan line
    height = 4;
    size = fullSize * 0.9;
    glow = 0;
  }

  if (bootPhase === 2) {
    // expanding
    height = fullSize * bootProgress;
    glow = 2;
  }

  if (bootPhase === 3) {
    // glow fade in
    height = fullSize;
    glow = 6 * bootProgress;
  }

  // ----- POSITION -----
  const x = cx - size / 2;
  const y = cy - height / 2;

  // ----- COLOR SYSTEM -----
  const base =
    emotion === "angry"
      ? { r: 255, g: 40, b: 40 }
      : { r: 25, g: 242, b: 242 };
  const wakeTint = { r: 127, g: 252, b: 255 };   // wake highlight
  const chargeTint = { r: 120, g: 255, b: 180 }; // charging green

  let mix = 0;

  
  if (charging) mix = 0.4;
  else mix = wakeColor;

  let r = Math.round(lerp(base.r, charging ? chargeTint.r : wakeTint.r, mix));
  let g = Math.round(lerp(base.g, charging ? chargeTint.g : wakeTint.g, mix));
  let b = Math.round(lerp(base.b, charging ? chargeTint.b : wakeTint.b, mix));

  // sleep dim
  if (sleeping) {
    r *= 0.4;
    g *= 0.4;
    b *= 0.4;
    glow = 2;
  }

  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = charging ? 8 : glow;

  // ----- CHARGING FILL PULSE -----
  let fillRatio = 1;
  if (charging) {
    fillRatio = Math.abs(Math.sin(chargePhase * Math.PI));
  }
  ctx.save();
  ctx.beginPath();
  drawRoundedRect(x, y, size, height * fillRatio, radius);
  ctx.clip();

  drawRoundedRect(x, y, size, height, radius);
  ctx.fill();
  ctx.restore();

  ctx.shadowBlur = 0;
}
function drawChargingIcon() {
  if (!charging) return;

  ctx.font = "18px monospace";
  ctx.fillStyle = "rgba(120,255,180,0.9)";
  ctx.fillText("⚡", canvas.width - 30, 30);
}

function drawZzz() {
  if (!sleeping) return;

  zzzOffset += 0.15;
  zzzAlpha = Math.min(zzzAlpha + 0.01, 1);

  const x = canvas.width - 60;
  const y = 30 - (zzzOffset % 20);

  ctx.font = "20px monospace";
  ctx.fillStyle = `rgba(25,242,242,${zzzAlpha})`;
  ctx.fillText("Zzz", x, y);
}
/* =====================
   SANITIZE MATH FOR DISPLAY & SPEECH
===================== */
function sanitizeDisplay(text) {
  if (!text) return text;
  let t = String(text);

  t = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, (m, num, den) => {
    return sanitizeDisplay(num) + '/' + sanitizeDisplay(den);
  });
  t = t.replace(/\/\(?sqrt\(?\{?([^\)\}]+)\}?\)?\)?/gi, '/ √$1');
  t = t.replace(/sqrt\(?\{?([^\)\}]+)\}?\)?/gi, '√$1');
  t = t.replace(/\\\(|\\\)|\$\$/g, '');
  t = t.replace(/\$/g, '');
  t = t.replace("\\div", "divided by");
  t = t.replace("\\times", "multiplied by");
  return t;
}
function sanitizeSpeech(text) {
  if (!text) return text;
  let t = String(text);
  // Handle \frac{a}{b} -> 'a divided by b' (recursively sanitize parts for speech)
  t = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, (m, num, den) => {
    return sanitizeSpeech(num) + ' divided by ' + sanitizeSpeech(den);
  });

  t = t.replace(/\/\(?sqrt\(?\{?([^\)\}]+)\}?\)?\)?/gi, ' divided by square root of $1');
  t = t.replace(/sqrt\(?\{?([^\)\}]+)\}?\)?/gi, 'square root of $1');
  t = t.replace(/\\\(|\\\)|\$\$/g, '');
  t = t.replace(/\$/g, '');
  t = t.replace("\\div", "divided by");
  t = t.replace("\\times", "multiplied by");
  t = t.replace(/\^/g, " to the power of ");
  t = t.replace(/_/g, " sub ");
  return t;
}
/* =====================
   MAIN LOOP
===================== */
function update() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  /* BOOT SEQUENCE */
  if (bootPhase > 0 && bootPhase < 4) {
    bootProgress += 0.02;

    if (bootPhase === 1 && bootProgress >= 1) {
      bootPhase = 2;
      bootProgress = 0;
    }

    if (bootPhase === 2 && bootProgress >= 1) {
      bootPhase = 3;
      bootProgress = 0;
    }

    if (bootPhase === 3 && bootProgress >= 1) {
      bootPhase = 4;
      blinkValue = 0;
      blinkTarget = 1;
    }
  }
  if (listeningForWake && !sleeping) {
  // subtle breathing glow when listening
  wakeColor = Math.max(
    wakeColor,
    Math.abs(Math.sin(Date.now() / 1200)) * 0.15
  );
}
  /* BLINKING (only when online) */
  if (bootPhase === 4) {

  if (sleeping) {
    blinkTarget = 0.35;
    blinkValue = lerp(blinkValue, blinkTarget, sleepBlinkSpeed);
  } else {
    blinkTimer++;
    if (blinkTimer > nextBlink) {
      blinkTarget = 0;
      if (blinkTimer > nextBlink + 10) {
        blinkTarget = 1;
        blinkTimer = 0;
        nextBlink = randomBlinkTime();
      }
    }
    blinkValue = lerp(blinkValue, blinkTarget, 0.22);
  }
}
  if (colorDecay) {
    wakeColor = lerp(wakeColor, 0, 0.08);
    if (wakeColor < 0.01) {
      wakeColor = 0;
      colorDecay = false;
    }
  }
  if (charging) {
  chargePhase += 0.015;
  if (chargePhase > 1) chargePhase = 0;

  // charging blink behavior
  blinkTarget = 0.9;
  blinkValue = lerp(blinkValue, blinkTarget, 0.08);
}

  /* DRAW */
  drawEye(140 + lookX, 90 + lookY);
  drawEye(280 + lookX, 90 + lookY);

  requestAnimationFrame(update);
  drawZzz();
  drawChargingIcon();
}

/* =====================
   START BOOT
===================== */
setTimeout(() => {
  bootPhase = 1;
  bootProgress = 0;
}, 500);

update();
/* ===== DEBUG CONTROLS ===== */
document.addEventListener("keydown", e => {
  if (e.key === "1") emotion = "neutral";
  if (e.key === "2") emotion = "angry";
});
document.addEventListener("keydown", e => {
  if (e.key === " ") wakeWord(); 
});
document.addEventListener("keydown", e => {
  if (e.key === "l") startListening();
});
document.addEventListener("keydown", e => {
  if (e.key === "s") goToSleep();       
  if (e.key === "w") wakeFromSleep();   
});
document.addEventListener("keydown", e => {
  if (e.key === "c") startCharging();
  if (e.key === "x") stopCharging();
});

/* =====================
   AI-Brain 
===================== */
async function chatWithDelta(userText) {
  let { data: model, error } = await supabase
  .from('apiSettings')
  .select(`
    type
  `)
  .eq('id', 1)
  .single();
   
  if (error) {
    console.error("Error fetching model from Supabase:", error);
    document.getElementById("deltaRes").innerText =
      "DELTA: I'm having trouble right now.";
    return null;
  }
  let modelUrl = "delta_brainNL"; // default
  if (model.type === "Norm") {
    modelUrl = "delta_brainNL";
  }
  if (model.type === "Lite") {
    modelUrl = "delta_brain";
  }
  if (model.type === "Em") {
    modelUrl = "delta_brainEM";
  }
  if (model.type === "EmLite") {
    modelUrl = "delta_brainEM-L";
  }

  return await sendRequest(userText, modelUrl);
}
async function sendRequest(userText, model) {
  try {
    const { data, error } = await supabase.functions.invoke(model, {
      body: { message: userText }
    });

    console.log("Supabase response:", data);
    console.log("Supabase error:", error);

    // If Supabase returned a function error
    if (error) {
      throw error;
    }

    // If backend returned structured error
    if (!data) {
      throw new Error("No data returned from Edge Function");
    }

    if (data.error) {
      throw new Error(data.error);
    }

    // Accept multiple possible reply formats
    const reply =
      data.reply ||
      data.message ||
      data.text ||
      null;

    if (!reply) {
      throw new Error("No valid reply field returned");
    }

    document.getElementById("deltaRes").innerText =
      "DELTA: " + sanitizeDisplay(reply);

    return reply;

  } catch (err) {
    console.error("Delta brain error:", err);

    let errorMessage = "I'm having trouble right now.";

    if (err?.message) {
      errorMessage = err.message;
    }

    document.getElementById("deltaRes").innerText =
      "DELTA: " + errorMessage;

    return null;
  }
}


async function checkEmotion(userText) {
  const ans = await detectEmotion(userText);

  if (typeof ans === "string" && ans.toLowerCase().includes("true")) {
    emotion = "angry";
    return "true";
  } else {
    emotion = "neutral";
    return "false";
  }
}

/* ============================= */
/* GAME STATE CHECK              */
/* ============================= */

function checkGameOver() {

    if (game.isCheckmate()) {
        addLog("Checkmate!", "engine");
        speak("Checkmate. Game over.");
        return true;
    }

    if (game.isStalemate()) {
        addLog("Stalemate.", "engine");
        speak("Stalemate.");
        return true;
    }

    if (game.isCheck()) {
        speak("Check.");
    }

    return false;
}

function addLog(text, type) {
  logSpan.innerText = text;
  logSpan.className = type
}


engine.onEngineMove = (move) => {

    game.move({
        from: move.substring(0, 2),
        to: move.substring(2, 4),
        promotion: "q"
    });

    addLog("DeltaEngine: " + move, "engine");

    speak("My move is " + move.split("").join(" "));

    checkGameOver();
};

async function ChessMode() {
  const sp = [
    "Let's battle ... in Chess",
    "Sure, Let's Play Chess!"
  ];
  const openN = (sp) => sp[Math.floor(Math.random() * sp.length)];
  document.getElementById("deltaRes").innerText =
    "DELTA: " + openN(sp);
  await speak(openN(sp));

  document.getElementById("deltaRes").innerText =
    "DELTA: By the way, how good are you at the game?";
  await speak("By the way, how good are you at the game?");

  // enter chess mode: stop wake-word listening so it doesn't interfere
  if (listeningForWake && recognition) {
    try { recognition.stop(); } catch (e) {}
    listeningForWake = false;
  }
  listenMode = "command";

  document.getElementById("diff").style.display = "flex";
  let response = "";

  document.getElementById("speakD").onclick = async () => {
    listenForC(async (text) => {
      const skill = toLowerCaseAndTrim(text);
      let respLocal = "Really? me too Let's Begin!";
      document.getElementById("deltaRes").innerText =
        "DELTA: " + respLocal;
      await speak(respLocal);
      document.getElementById("diff").style.display = "none";

      // After acknowledging skill, prompt for side and show color panel
      response = "Which side do you want to play? white or black?";
      document.getElementById("deltaRes").innerText =
        "DELTA: " + response;
      document.getElementById("color").style.display = "flex";
      await speak(response);
    });
  }

  document.getElementById("speakC").onclick = async () => {
    listenForC(async (text) => {
      const side = toLowerCaseAndTrim(text);
      if (side.includes("white")) {
        playerSide = "white";
        response = "Great! You will play white and I will play black. Your move!";
      }
      if (side.includes("black")) {
        playerSide = "black";
        response = "Great! You will play black and I will play white. Your move!";
        // If player chooses black, engine (white) should move first
        try { engine.play(); } catch (err) { console.error('Engine play error:', err); }
      }
      // show move panel now that side is chosen
      document.getElementById("movePannel").style.display = "flex";
      document.getElementById("deltaRes").innerText =
        "DELTA: " + response;
      await speak(response);
      document.getElementById("color").style.display = "none";
    });};
  
speakMoveBtn.onclick = () => {


    listen((spoken) => {

        const cleaned = spoken.replace(/\s/g, "").toLowerCase();

        /* ---------- 1️⃣ FORMAT CHECK ---------- */

        const formatRegex = /^[a-h][1-8][a-h][1-8]$/;

        if (!formatRegex.test(cleaned)) {
            addLog("Invalid format: " + spoken, "illegal");
            speak("Invalid format. Say move like e two e four.");
            return;
        }

        /* ---------- 2️⃣ LEGALITY CHECK ---------- */

        const from = cleaned.substring(0, 2);
        const to = cleaned.substring(2, 4);

        const legalMoves = game.moves({ verbose: true });

        const isLegal = legalMoves.some(
            m => m.from === from && m.to === to
        );

        if (!isLegal) {
            addLog("Illegal move: " + cleaned, "illegal");
            speak("That move is illegal.");
            return;
        }

        /* ---------- 3️⃣ EXECUTE PLAYER MOVE ---------- */

        game.move({
            from: from,
            to: to,
            promotion: "q"
        });

        addLog("You: " + cleaned, "user");

        if (checkGameOver()) return;
        

        engine.play(cleaned);
    });
};


}

async function askDelta(text) {
  //if (processingCommand) return;
  processingCommand = true;
  try {
    document.getElementById("userText").innerText =
      "USER: " + sanitizeDisplay(text);

    if (text.toLowerCase().includes("lets have a quick match of chess") || text.toLowerCase().includes("play chess") || text.toLowerCase().includes("let's play chess")) {
      ChessMode();
      return;
    }
    await checkEmotion(text);

    const reply = await chatWithDelta(text);
    if (!reply) return;

    await speak(sanitizeSpeech(reply));

    // 🔁 return to wake-word listening
    listenMode = "wake";
    startWakeWordListening();
    canvas.classList.remove("listening");
  } finally {
    processingCommand = false;
  }
}


