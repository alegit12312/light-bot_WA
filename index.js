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
const PREFIXES = [".", "#"]
const DB_FILE = "./economy.json"
const OWNER = "56985529966@s.whatsapp.net"

// ====================
// ECONOMÍA SIMPLE
// ====================
if (!fs.existsSync(DB_FILE)) fs.writeJsonSync(DB_FILE, {})

function getUser(db, id) {
  if (!db[id]) db[id] = { dinero: 1000, ultimoTrabajo: 0, ultimoMinado: 0 }
  return db[id]
}

// ====================
// BOT
// ====================
async function startBot() {
  console.log(">>> startBot() iniciado")
  const { state, saveCreds } = await useMultiFileAuthState("./auth")
  console.log(">>> auth state cargado")

  const sock = makeWASocket({ logger: P({ level: "silent" }), auth: state })
  console.log(">>> socket creado")

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", (update) => {
    const { connection, qr, lastDisconnect } = update
    if (qr) {
      console.log("📱 Escanea este QR con WhatsApp:")
      qrcode.generate(qr, { small: true })
    }
    if (connection === "open") console.log("✅ Bot conectado")
    if (connection === "close") {
      console.log("❌ Conexión cerrada")
      console.log("💥 lastDisconnect:", lastDisconnect)
    }
  })

  // ====================
  // MENSAJES
  // ====================
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0]
    if (!m.message) return
    const from = m.key.remoteJid
    const isGroup = from.endsWith("@g.us")
    const sender = isGroup ? m.key.participant : from
    const texto = m.message.conversation || m.message.extendedTextMessage?.text || ""
    if (!PREFIXES.some(p => texto.startsWith(p))) return

    const prefijo = PREFIXES.find(p => texto.startsWith(p))
    const comando = texto.slice(prefijo.length).split(" ")[0].toLowerCase()
    const args = texto.slice(prefijo.length).trim().split(" ").slice(1)

    // ====================
    // ECONOMÍA
    // ====================
    const db = fs.readJsonSync(DB_FILE)
    const user = getUser(db, sender)

    if (["trabajar", "work"].includes(comando)) {
      const ahora = Date.now()
      if (ahora - user.ultimoTrabajo < 3 * 60 * 1000) {
        return sock.sendMessage(from, { text: "⏳ Espera 3 minutos para volver a trabajar." })
      }
      const ganancia = Math.floor(Math.random() * 300) + 200
      user.dinero += ganancia
      user.ultimoTrabajo = ahora
      fs.writeJsonSync(DB_FILE, db)
      return sock.sendMessage(from, { text: `💼 Trabajaste y ganaste ${ganancia} monedas.` })
    }

    if (["minar", "mine"].includes(comando)) {
      const ahora = Date.now()
      if (ahora - user.ultimoMinado < 15 * 60 * 1000) {
        return sock.sendMessage(from, { text: "⛏️ Espera 15 minutos para volver a minar." })
      }
      const ganancia = Math.floor(Math.random() * 2000)
      user.dinero += ganancia
      user.ultimoMinado = ahora
      fs.writeJsonSync(DB_FILE, db)
      return sock.sendMessage(from, { text: `⛏️ Minaste y obtuviste ${ganancia} monedas.` })
    }

    if (["caja", "box"].includes(comando)) {
      return sock.sendMessage(from, { text: "📦 Caja misteriosa ($500). Usa .caja_abrir" })
    }

    if (["caja_abrir", "box_open"].includes(comando)) {
      const precio = 500
      if (user.dinero < precio) return sock.sendMessage(from, { text: "❌ No tienes suficiente dinero." })
      user.dinero -= precio
      const premio = Math.floor(Math.random() * 900)
      if (premio < 500) {
        fs.writeJsonSync(DB_FILE, db)
        return sock.sendMessage(from, { text: `📦 Perdiste dinero (${premio} monedas 😭)` })
      }
      user.dinero += premio
      fs.writeJsonSync(DB_FILE, db)
      return sock.sendMessage(from, { text: `🎉 ¡Ganaste ${premio} monedas!` })
    }

    if (comando === "blackjack") {
      const apuesta = Number(args[0])
      if (!apuesta || apuesta <= 0) return sock.sendMessage(from, { text: "♠️ Usa: .blackjack <cantidad>" })
      if (user.dinero < apuesta) return sock.sendMessage(from, { text: "❌ No tienes suficiente dinero." })

      const bot = Math.floor(Math.random() * 21) + 1
      const jugador = Math.floor(Math.random() * 21) + 1
      if (jugador > bot) user.dinero += apuesta
      else user.dinero -= apuesta
      fs.writeJsonSync(DB_FILE, db)
      return sock.sendMessage(from, { text: `🃏 ${jugador > bot ? "Ganaste" : "Perdiste"} (${jugador} vs ${bot}) ${jugador > bot ? "+" : "-"}${apuesta}` })
    }

    // ====================
    // UTILIDADES
    // ====================
    if (comando === "menu") {
      return sock.sendMessage(from, { text: `📜 MENÚ
💰 Dinero: ${user.dinero}

💲 ECONOMÍA
.trabajar / #work
.minar / #mine
.caja / #box
.caja_abrir / #box_open
.blackjack <cantidad>

🛠 UTILIDADES
.menu
.ping
.etiquetar
.grupoinfo

👤 ADMINS
.antilink (on/off)
.permitirlink @usuario (usos) (tiempo)` })
    }

    if (comando === "ping") {
      const inicio = Date.now()
      await sock.sendMessage(from, { text: "🏓 Pong..." })
      const ping = Date.now() - inicio
      return sock.sendMessage(from, { text: `🏓 Pong!\n📡 Ping: ${ping} ms` })
    }

    if (comando === "etiquetar" && isGroup) {
      const metadata = await sock.groupMetadata(from)
      const participantes = metadata.participants.map(p => p.id)
      const mensaje = "📢 Etiquetando a todos:\n" + participantes.map(p => `@${p.split("@")[0]}`).join(" ")
      return sock.sendMessage(from, { text: mensaje, mentions: participantes })
    }

    if (comando === "grupoinfo" && isGroup) {
      const metadata = await sock.groupMetadata(from)
      const admins = metadata.participants.filter(p => p.admin || p.superAdmin).length
      return sock.sendMessage(from, { text: `📋 Grupo: ${metadata.subject}\n👥 Miembros: ${metadata.participants.length}\n⭐ Admins: ${admins}\n📝 Descripción: ${metadata.desc || "Sin descripción"}` })
    }

    // ====================
    // MEDIA
    // ====================
    if (comando === "ytaudiosearch" && args.length > 0) {
      const query = args.join(" ")
      const results = await youtubeSearch.search(query)
      if (!results || results.length === 0) return sock.sendMessage(from, { text: "❌ No se encontraron resultados." })
      const video = results[0]
      return sock.sendMessage(from, { text: `🎵 ${video.title}\n${video.url}` })
    }

    if (comando === "toimg") {
      const media = m.message.imageMessage || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage
      if (!media) return sock.sendMessage(from, { text: "❌ Responde a una imagen para convertirla." })
      const buffer = Buffer.from(media.data, "base64")
      const webpBuffer = await sharp(buffer).webp().toBuffer()
      await sock.sendMessage(from, { sticker: { url: webpBuffer } })
    }
  })
}

startBot()