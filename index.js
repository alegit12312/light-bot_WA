import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys"
import P from "pino"
import qrcode from "qrcode-terminal"
import fs from "fs"
import sharp from "sharp"
import ytdl from "ytdl-core"
import * as youtubeSearch from "youtube-search-without-api-key"

// ====================
// CONFIG
// ====================
// ====================
// IMPORTS
// ====================
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState
} from "@whiskeysockets/baileys"

import P from "pino"
import qrcode from "qrcode-terminal"
import fs from "fs"

// ====================
// CONFIG
// ====================
const PREFIXES = [".", "#"]
const DB_FILE = "./economy.json"

// ====================
// ECONOMÍA
// ====================
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({}))
}

function loadDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"))
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2))
}

function getUser(db, id) {
  if (!db[id]) db[id] = { money: 0 }
  return db[id]
}

// ====================
// BOT
// ====================
async function startBot() {
  console.log(">>> startBot() iniciado")

  const { state, saveCreds } = await useMultiFileAuthState("./session")
  console.log(">>> auth state cargado")

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: "silent" })
  })

  console.log(">>> socket creado")

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log("📱 Escanea el QR")
      qrcode.generate(qr, { small: true })
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode
      console.log("❌ Conexión cerrada:", reason)

      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔄 Reintentando en 5s...")
        setTimeout(startBot, 5000)
      } else {
        console.log("🚪 Sesión cerrada, borra ./session")
      }
    }

    if (connection === "open") {
      console.log("✅ BOT CONECTADO")
    }
  })

  // ====================
  // MENSAJES
  // ====================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text

    if (!text) return

    const prefix = PREFIXES.find(p => text.startsWith(p))
    if (!prefix) return

    const args = text.slice(prefix.length).trim().split(/ +/)
    const cmd = args.shift().toLowerCase()

    const db = loadDB()
    const user = getUser(db, from)

    // ====================
    // COMANDOS
    // ====================
    if (cmd === "ping") {
      await sock.sendMessage(from, { text: "🏓 pong" })
    }

    if (cmd === "money") {
      await sock.sendMessage(from, {
        text: `💰 Dinero: ${user.money}`
      })
    }

    if (cmd === "work") {
      const earn = Math.floor(Math.random() * 50) + 10
      user.money += earn
      saveDB(db)

      await sock.sendMessage(from, {
        text: `🛠️ Trabajaste y ganaste ${earn}`
      })
    }

    if (cmd === "give") {
      const amount = parseInt(args[0])
      if (isNaN(amount)) {
        return sock.sendMessage(from, { text: "❌ Monto inválido" })
      }

      user.money += amount
      saveDB(db)

      await sock.sendMessage(from, {
        text: `➕ Recibiste ${amount}`
      })
    }
  })
}

// ====================
// START
// ====================
console.log(">>> index.js SE ESTÁ EJECUTANDO")
startBot()
