//------------------------------------------------------
// 📌 MODÜLLER
//------------------------------------------------------
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
    AuditLogEvent
} = require("discord.js");
const pg = require("pg");
const { Pool } = pg;

//------------------------------------------------------
// 📌 TOKEN & DATABASE
//------------------------------------------------------
const TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.TOKEN;
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;

// TOKEN yoksa direkt hata verelim ki boşuna uğraşma
if (!TOKEN) {
    console.error("❌ TOKEN bulunamadı. Railway/Render ortam değişkenine DISCORD_BOT_TOKEN veya TOKEN ekle.");
    process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

//------------------------------------------------------
// 📌 SABİTLER – KENDİNE GÖRE DÜZENLE
//------------------------------------------------------
const OWNER_IDS = [
    "827905938923978823",
    "1129811807570247761"
];

const LOG_CHANNEL_ID = "BURAYA_LOG_KANAL_ID"; // İstersen boş bırak, log gitmez

// Guard ayarları
const GUARD_SETTINGS = {
    OWN_ID: null,        // bot açılınca dolduracağız
    KICK_LIMIT: 3,
    BAN_LIMIT: 3,
    TIMEFRAME: 10000,    // 10 saniye
    MAX_URLS: 1,
    JOIN_LIMIT: 5,
    JOIN_TIMEFRAME: 10000 // 10 saniye
};

const PREFIX = ".";

//------------------------------------------------------
// 📌 CLIENT
//------------------------------------------------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildModeration
    ]
});

//------------------------------------------------------
// 📌 DATABASE KURULUMU (Etkinlik tablosu)
//------------------------------------------------------
async function initDB() {
    if (!DATABASE_URL) {
        console.log("⚠ DATABASE_URL tanımlı değil, etkinlik verileri DB'ye kaydedilmeyecek.");
        return;
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS etkinlikler (
            message_id TEXT PRIMARY KEY,
            title TEXT,
            max_count INT
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS etkinlik_katilim (
            message_id TEXT,
            user_id TEXT
        );
    `);

    console.log("✅ PostgreSQL tabloları hazır.");
}

//------------------------------------------------------
// 📌 LOG FONKSİYONU
//------------------------------------------------------
async function logAction(guild, description, title = "Log", color = 0x000000) {
    if (!LOG_CHANNEL_ID) return;
    try {
        const channel = guild.channels.cache.get(LOG_CHANNEL_ID);
        if (!channel || channel.type !== ChannelType.GuildText) return;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(description)
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (_) { }
}

//------------------------------------------------------
// 📌 GUARD – RATE LIMIT CACHE
//------------------------------------------------------
const actionCache = new Map();         // { executorId: { kicks: [timestamps], bans: [timestamps] } }
const joinTimestamps = new Map();      // { guildId: [timestamps] }
const urlRegex = /(https?:\/\/\S+|discord\.gg\/\S+)/gi;

// Guard: çok hızlı ban/kick
function checkRateLimit(executorId, actionType, guild) {
    if (OWNER_IDS.includes(executorId) || executorId === GUARD_SETTINGS.OWN_ID) return false;

    if (!actionCache.has(executorId)) {
        actionCache.set(executorId, { kicks: [], bans: [] });
    }

    const userData = actionCache.get(executorId);
    const now = Date.now();

    userData[actionType] = userData[actionType].filter(t => now - t < GUARD_SETTINGS.TIMEFRAME);
    userData[actionType].push(now);

    const limit = actionType === "kicks" ? GUARD_SETTINGS.KICK_LIMIT : GUARD_SETTINGS.BAN_LIMIT;

    if (userData[actionType].length >= limit) {
        actionCache.delete(executorId);

        const member = guild.members.cache.get(executorId);
        if (member && member.manageable) {
            member.roles.set([]).catch(() => {});
            member.timeout(60 * 60 * 1000, `[GUARD] Çok hızlı ${actionType}`).catch(() => {});
            logAction(
                guild,
                `🛡️ **Guard devreye girdi!**\nKullanıcı: ${member.user.tag}\nEylem: Çok hızlı ${actionType} denemesi\nCeza: 1 saat timeout + roller sıfırlandı.`,
                "GUARD – Hızlı İşlem",
                0xff4500
            );
        }
        return true;
    }

    actionCache.set(executorId, userData);
    return false;
}

// AuditLog üzerinden ban/kick takibi
client.on("guildBanAdd", async ban => {
    const guild = ban.guild;
    const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberBanAdd,
        limit: 1
    }).catch(() => null);

    const entry = logs?.entries.first();
    if (!entry || !entry.executor || entry.target.id !== ban.user.id) return;

    checkRateLimit(entry.executor.id, "bans", guild);
});

client.on("guildMemberRemove", async member => {
    const guild = member.guild;
    const logs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberKick,
        limit: 1
    }).catch(() => null);

    const entry = logs?.entries.first();
    if (!entry || !entry.executor || entry.target.id !== member.id) return;
    if (Date.now() - entry.createdTimestamp > 5000) return;

    checkRateLimit(entry.executor.id, "kicks", guild);
});

// Yeni hesap & anti-raid
client.on("guildMemberAdd", async member => {
    const guild = member.guild;
    const now = Date.now();

    // Yeni hesap kontrolü (1 günden gençse kick)
    const ageDays = (now - member.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 1) {
        member.kick("[GUARD] 1 günden yeni hesap.").catch(() => {});
        logAction(
            guild,
            `🚫 Kullanıcı: ${member.user.tag}\nSebep: 1 günden yeni hesap olduğu için otomatik kick.`,
            "GUARD – Yeni Hesap",
            0x9932cc
        );
        return;
    }

    // Anti-raid (kısa sürede çok fazla giriş)
    if (!joinTimestamps.has(guild.id)) joinTimestamps.set(guild.id, []);
    const arr = joinTimestamps.get(guild.id);
    arr.push(now);
    const recent = arr.filter(t => now - t < GUARD_SETTINGS.JOIN_TIMEFRAME);
    joinTimestamps.set(guild.id, recent);

    if (recent.length >= GUARD_SETTINGS.JOIN_LIMIT) {
        logAction(
            guild,
            `🚨 Son ${GUARD_SETTINGS.JOIN_TIMEFRAME / 1000} saniyede **${recent.length}** yeni üye girişi tespit edildi.`,
            "GUARD – Olası Raid",
            0xff0000
        );
    }
});

//------------------------------------------------------
// 📌 MESAJ / KOMUT İŞLEYİCİ
//------------------------------------------------------
client.on("messageCreate", async msg => {
    if (!msg.guild || msg.author.bot) return;

    const isOwner = OWNER_IDS.includes(msg.author.id);
    const member = msg.member;

    // URL koruması (Owner/Admin değilse)
    if (!isOwner && !member.permissions.has(PermissionFlagsBits.Administrator)) {
        if (urlRegex.test(msg.content)) {
            const count = (msg.content.match(urlRegex) || []).length;
            if (count > GUARD_SETTINGS.MAX_URLS) {
                await msg.delete().catch(() => {});
                logAction(
                    msg.guild,
                    `🛡️ URL engellendi.\nKullanıcı: ${msg.author.tag}\nKanal: ${msg.channel}`,
                    "GUARD – URL",
                    0x1e90ff
                );
                return msg.channel.send(`❌ ${msg.author}, bu kanalda link paylaşımı kısıtlanmıştır.`)
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
            }
        }
    }

    // Prefix kontrolü
    if (!msg.content.startsWith(PREFIX)) return;

    const args = msg.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();

    //--------------------------------------------------
    // 🎉 ETKİNLİK KOMUTLARI
    //--------------------------------------------------
    if (cmd === "etkinlik") {
        if (!isOwner) return msg.reply("Bu komutu kullanmaya yetkin yok.");

        const maxCount = parseInt(args[0]);
        const title = args.slice(1).join(" ");

        if (!maxCount || !title) {
            return msg.reply("❌ Kullanım: `.etkinlik 10 Film Gecesi`");
        }

        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle(`🎉 YENİ ETKİNLİK: ${title}`)
            .setDescription("Katılmak için aşağıdaki 🟢 emojisine tıklayın!")
            .addFields([
                { name: `Katılımcılar (0/${maxCount})`, value: "(Henüz kimse katılmadı)" }
            ])
            .setTimestamp();

        const eventMsg = await msg.channel.send({ embeds: [embed] });
        await eventMsg.react("🟢");

        if (DATABASE_URL) {
            await pool.query(
                "INSERT INTO etkinlikler (message_id, title, max_count) VALUES ($1,$2,$3) ON CONFLICT (message_id) DO NOTHING",
                [eventMsg.id, title, maxCount]
            );
        }

        return;
    }

    if (cmd === "etekle") {
        if (!isOwner) return msg.reply("Bu komutu kullanmaya yetkin yok.");
        if (!DATABASE_URL) return msg.reply("Bu komut için veritabanı gerekli (DATABASE_URL).");

        const user = msg.mentions.users.first();
        const messageId = args[1];

        if (!user || !messageId)
            return msg.reply("Kullanım: `.etekle @kullanıcı mesajID`");

        await pool.query(
            "INSERT INTO etkinlik_katilim (message_id, user_id) VALUES ($1,$2)",
            [messageId, user.id]
        ).catch(() => {});

        const m = await msg.channel.messages.fetch(messageId).catch(() => null);
        if (m) await updateEmbed(m);

        return msg.reply("✔ Kullanıcı eklendi.");
    }

    if (cmd === "etçıkar") {
        if (!isOwner) return msg.reply("Bu komutu kullanmaya yetkin yok.");
        if (!DATABASE_URL) return msg.reply("Bu komut için veritabanı gerekli (DATABASE_URL).");

        const user = msg.mentions.users.first();
        const messageId = args[1];

        if (!user || !messageId)
            return msg.reply("Kullanım: `.etçıkar @kullanıcı mesajID`");

        await pool.query(
            "DELETE FROM etkinlik_katilim WHERE message_id = $1 AND user_id = $2",
            [messageId, user.id]
        ).catch(() => {});

        const m = await msg.channel.messages.fetch(messageId).catch(() => null);
        if (m) await updateEmbed(m);

        return msg.reply("❌ Kullanıcı etkinlikten çıkarıldı.");
    }

    //--------------------------------------------------
    // 🔨 MODERASYON KOMUTLARI
    //--------------------------------------------------
    if (["ban", "unban", "kick", "timeout", "untimeout", "sil", "lock", "unlock", "yavaşmod", "nuke"].includes(cmd)) {
        if (!isOwner && !member.permissions.has(PermissionFlagsBits.Administrator)) {
            return msg.reply("Bu komutu kullanmak için admin olman gerekiyor.");
        }
    }

    // .ban @kişi [sebep]
    if (cmd === "ban") {
        const target = msg.mentions.members.first();
        if (!target) return msg.reply("Kullanım: `.ban @kullanıcı [sebep]`");

        const reason = args.slice(1).join(" ") || "Sebep belirtilmedi.";
        await target.ban({ reason }).catch(() => msg.reply("Ban atılamadı. Yetkileri kontrol et."));
        logAction(msg.guild, `Kullanıcı: ${target.user.tag}\nYetkili: ${msg.author.tag}\nSebep: ${reason}`, "Ban", 0xff0000);
        return;
    }

    // .unban ID
    if (cmd === "unban") {
        const id = args[0];
        if (!id) return msg.reply("Kullanım: `.unban kullanıcıID`");

        try {
            const user = await client.users.fetch(id);
            await msg.guild.bans.remove(user.id, "Unban komutu.");
            logAction(msg.guild, `Kullanıcı: ${user.tag}\nYetkili: ${msg.author.tag}`, "Unban", 0x00ff00);
        } catch (_) {
            return msg.reply("Unban hatası. ID doğru mu?");
        }
        return;
    }

    // .kick @kişi [sebep]
    if (cmd === "kick") {
        const target = msg.mentions.members.first();
        if (!target) return msg.reply("Kullanım: `.kick @kullanıcı [sebep]`");
        const reason = args.slice(1).join(" ") || "Sebep belirtilmedi.";
        await target.kick(reason).catch(() => msg.reply("Kick atılamadı."));
        logAction(msg.guild, `Kullanıcı: ${target.user.tag}\nYetkili: ${msg.author.tag}\nSebep: ${reason}`, "Kick", 0xffa500);
        return;
    }

    // .timeout @kişi dakika [sebep]
    if (cmd === "timeout") {
        const target = msg.mentions.members.first();
        const minutes = parseInt(args[1]);
        if (!target || !minutes) return msg.reply("Kullanım: `.timeout @kullanıcı dakika [sebep]`");
        const reason = args.slice(2).join(" ") || "Sebep belirtilmedi.";
        await target.timeout(minutes * 60 * 1000, reason).catch(() => msg.reply("Timeout atılamadı."));
        logAction(msg.guild, `Kullanıcı: ${target.user.tag}\nSüre: ${minutes} dk\nYetkili: ${msg.author.tag}`, "Timeout", 0x808080);
        return;
    }

    // .untimeout @kişi
    if (cmd === "untimeout") {
        const target = msg.mentions.members.first();
        if (!target) return msg.reply("Kullanım: `.untimeout @kullanıcı`");
        await target.timeout(null, "Timeout kaldırıldı.").catch(() => msg.reply("Timeout kaldırılamadı."));
        logAction(msg.guild, `Kullanıcı: ${target.user.tag}\nYetkili: ${msg.author.tag}`, "Timeout Kaldırıldı", 0x00ff00);
        return;
    }

    // .sil 1-100
    if (cmd === "sil") {
        const amount = parseInt(args[0]);
        if (!amount || amount < 1 || amount > 100) return msg.reply("Kullanım: `.sil 1-100`");
        await msg.delete().catch(() => {});
        await msg.channel.bulkDelete(amount, true).catch(() => msg.reply("Silme hatası."));
        logAction(msg.guild, `Kanal: ${msg.channel}\nYetkili: ${msg.author.tag}\nMiktar: ${amount}`, "Mesaj Silme", 0x000000);
        return;
    }

    // .lock
    if (cmd === "lock") {
        await msg.channel.permissionOverwrites.edit(msg.guild.id, { SendMessages: false }).catch(() => msg.reply("Kanal kilitlenemedi."));
        logAction(msg.guild, `Kanal: ${msg.channel}\nYetkili: ${msg.author.tag}`, "Kanal Kilitlendi", 0xff0000);
        return msg.reply("🔒 Kanal kilitlendi.");
    }

    // .unlock
    if (cmd === "unlock") {
        await msg.channel.permissionOverwrites.edit(msg.guild.id, { SendMessages: null }).catch(() => msg.reply("Kanal açılamadı."));
        logAction(msg.guild, `Kanal: ${msg.channel}\nYetkili: ${msg.author.tag}`, "Kanal Açıldı", 0x00ff00);
        return msg.reply("🔓 Kanalın kilidi açıldı.");
    }

    // .yavaşmod saniye
    if (cmd === "yavaşmod") {
        const sec = parseInt(args[0]);
        if (isNaN(sec) || sec < 0 || sec > 21600) return msg.reply("Kullanım: `.yavaşmod 0-21600`");
        await msg.channel.setRateLimitPerUser(sec, `Yavaş mod: ${msg.author.tag}`).catch(() => msg.reply("Yavaş mod ayarlanamadı."));
        logAction(msg.guild, `Kanal: ${msg.channel}\nYetkili: ${msg.author.tag}\nSüre: ${sec} sn`, "Yavaş Mod", 0x0000ff);
        return msg.reply(sec === 0 ? "⏱️ Yavaş mod kapatıldı." : `⏱️ Yavaş mod **${sec} saniye** olarak ayarlandı.`);
    }

    // .nuke
    if (cmd === "nuke") {
        const oldChannel = msg.channel;
        const newChannel = await oldChannel.clone().catch(() => null);
        if (!newChannel) return msg.reply("Nuke başarısız.");
        await newChannel.setPosition(oldChannel.position).catch(() => {});
        await oldChannel.delete().catch(() => {});
        logAction(msg.guild, `Kanal: #${newChannel.name}\nYetkili: ${msg.author.tag}`, "Nuke", 0xff0000);
        return newChannel.send("☢️ Kanal patlatıldı, tertemiz!");
    }
});

//------------------------------------------------------
// 📌 ETKİNLİK EMBED GÜNCELLEME
//------------------------------------------------------
async function updateEmbed(message) {
    if (!DATABASE_URL) return;
    const etkinlik = await pool.query("SELECT * FROM etkinlikler WHERE message_id = $1", [message.id]);
    if (etkinlik.rowCount === 0) return;

    const title = etkinlik.rows[0].title;
    const maxCount = etkinlik.rows[0].max_count;

    const data = await pool.query(
        "SELECT user_id FROM etkinlik_katilim WHERE message_id = $1",
        [message.id]
    );

    const list = data.rowCount
        ? data.rows.map(r => `<@${r.user_id}>`).join("\n")
        : "(Henüz kimse katılmadı)";

    const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle(`🎉 YENİ ETKİNLİK: ${title}`)
        .setDescription("Katılmak için aşağıdaki 🟢 emojisine tıklayın!")
        .addFields([
            { name: `Katılımcılar (${data.rowCount}/${maxCount})`, value: list }
        ])
        .setTimestamp();

    await message.edit({ embeds: [embed] }).catch(() => {});
}

//------------------------------------------------------
// 📌 REACTION HANDLER (Etkinlik)
//------------------------------------------------------
client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot || reaction.emoji.name !== "🟢") return;
    if (!DATABASE_URL) return;

    const msg = reaction.message;
    if (!msg.guild) return;

    const etkinlik = await pool.query("SELECT * FROM etkinlikler WHERE message_id = $1", [msg.id]);
    if (etkinlik.rowCount === 0) return;

    const maxCount = etkinlik.rows[0].max_count;

    const katilim = await pool.query(
        "SELECT * FROM etkinlik_katilim WHERE message_id = $1",
        [msg.id]
    );

    if (katilim.rowCount >= maxCount) {
        reaction.users.remove(user.id).catch(() => {});
        return;
    }

    await pool.query(
        "INSERT INTO etkinlik_katilim (message_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [msg.id, user.id]
    );

    await updateEmbed(msg);
});

client.on("messageReactionRemove", async (reaction, user) => {
    if (user.bot || reaction.emoji.name !== "🟢") return;
    if (!DATABASE_URL) return;

    const msg = reaction.message;
    if (!msg.guild) return;

    await pool.query(
        "DELETE FROM etkinlik_katilim WHERE message_id = $1 AND user_id = $2",
        [msg.id, user.id]
    );

    await updateEmbed(msg);
});

//------------------------------------------------------
// 📌 READY
//------------------------------------------------------
client.once("ready", () => {
    console.log(`✅ Bot giriş yaptı: ${client.user.tag}`);
    GUARD_SETTINGS.OWN_ID = client.user.id;
});

//------------------------------------------------------
// 📌 BAŞLAT
//------------------------------------------------------
initDB()
    .catch(err => console.error("DB init hatası:", err))
    .finally(() => client.login(TOKEN));
