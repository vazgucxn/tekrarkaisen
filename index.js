// ===================== K A I S E N   B O T  —  TEMİZ SÜRÜM =====================
// prefix + guard + bio + etkinlik + forceban + backup sisteminin temel giriş dosyası
// Bu dosya PART 1/8’dir. Diğer partlar buna eklenir.

const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    ChannelType,
    ActivityType
} = require("discord.js");

const express = require("express");
const fs = require("fs");
const path = require("path");

// ===================== AYARLAR =====================
const PREFIX = ".";
const BOT_OWNER = "827905938923978823"; // forceban + backup yetkisi sadece sen
const TOKEN = process.env.DISCORD_BOT_TOKEN;

// ===================== TOKEN KONTROL =====================
if (!TOKEN || TOKEN.length < 20) {
    console.error("❌ Geçersiz TOKEN! Render ortamında DISCORD_BOT_TOKEN ekle.");
    process.exit(1);
}

// ===================== KEEP-ALIVE =====================
const app = express();
app.get("/", (_, res) => res.send("Kaisen bot aktif!"));
app.listen(process.env.PORT || 3000);

// ===================== CLIENT =====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Reaction, Partials.Channel]
});

// ===================== GLOBAL VERİLER =====================
const forceBannedUsers = new Set();
const botStaffRoles = new Set();
let bioChannel = null;
let bioIgnoreRoles = new Set();
const etkinlikEvents = new Map();
let backupData = null;

// ===================== YETKİ KONTROL =====================
function hasBotPermission(member) {
    if (!member) return false;
    if (member.id === BOT_OWNER) return true;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    for (const id of botStaffRoles) {
        if (member.roles.cache.has(id)) return true;
    }
    return false;
}

// ===================== BOT READY =====================
client.once("ready", () => {
    console.log(`🔵 Bot aktif: ${client.user.tag}`);

    client.user.setPresence({
        activities: [
            { name: "vazgucxn ❤ kaisen", type: ActivityType.Streaming, url: "https://twitch.tv/discord" }
        ],
        status: "online"
    });
});

// ===================================================================
//                         REKLAM GUARD
// ===================================================================
const adWords = [
    "discord.gg", "discord.com/invite", "https://", "http://",
    "t.me/", "telegram", "instagram.com", "facebook.com",
    "tiktok.com", "youtube.com", "youtu.be", ".gg", ".com", ".net"
];

client.on("messageCreate", async msg => {
    try {
        if (!msg.guild || msg.author.bot) return;

        if (hasBotPermission(msg.member)) return;

        const t = msg.content.toLowerCase();
        if (adWords.some(w => t.includes(w))) {
            await msg.delete().catch(() => {});
            const w = await msg.channel.send(`⚠️ ${msg.author}, burada reklam yasak.`);
            setTimeout(() => w.delete().catch(() => {}), 3000);
        }
    } catch (e) {
        console.log("Advertisement Guard Error:", e);
    }
});

// ===================================================================
//                      PREFIX KOMUT ALGILAYICI
// ===================================================================
client.on("messageCreate", async message => {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        let args = message.content.slice(PREFIX.length).trim().split(/\s+/);
        let cmd = args.shift()?.toLowerCase();

        // tüm komutlar tek handler içinde ileride doldurulacak (part 2/8, part 3/8...)

        // geçici test
        if (cmd === "ping") {
            return message.reply("Pong!");
        }

    } catch (err) {
        console.error("PREFIX ERROR:", err);
    }
});
// ===================================================================
//                      E T K İ N L İ K   S İ S T E M İ
// ===================================================================

if (cmd === "etkinlik") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Bu komut için yetkin yok.");

    const channel = message.mentions.channels.first();
    if (!channel)
        return message.reply("Kullanım: `.etkinlik #kanal limit açıklama`");

    args.shift();
    const limit = Number(args.shift());
    if (!limit || limit < 1)
        return message.reply("❌ Limit sayısı hatalı.");

    const title = args.join(" ");
    if (!title) return message.reply("❌ Açıklama yazmalısın.");

    const embed = new EmbedBuilder()
        .setTitle("🎟️ ETKİNLİK")
        .setColor("#000000")
        .setDescription(title)
        .addFields(
            { name: "Kişi Sınırı", value: `${limit}` },
            { name: "Durum", value: "Açık" },
            { name: "Katılımcılar", value: "Henüz kimse yok." }
        );

    const msg = await channel.send({ embeds: [embed] });
    await msg.react("✔️");

    etkinlikEvents.set(msg.id, {
        max: limit,
        title,
        participants: new Set(),
        closed: false,
        channelId: channel.id
    });

    return message.reply(`✔ Etkinlik başarıyla başladı: ${channel}`);
}

// -------------------------------------------------------------------

if (cmd === "etkinlik-bitir") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    // aktif etkinlik bul
    let active = null;
    for (const [id, data] of etkinlikEvents.entries()) {
        if (data.channelId === message.channel.id && !data.closed) {
            active = { id, data };
            break;
        }
    }
    if (!active)
        return message.reply("❌ Bu kanalda açık etkinlik yok.");

    const { id, data } = active;
    const msg = await message.channel.messages.fetch(id).catch(() => null);
    if (!msg) return message.reply("❌ Etkinlik mesajı bulunamadı!");

    data.closed = true;

    const r = msg.reactions.resolve("✔️");
    if (r) r.remove().catch(() => {});

    // final liste oluştur
    const list = [...data.participants];
    const final =
        list.length === 0
            ? "Kimse katılmadı."
            : list.map((u, i) => `${i + 1}. <@${u}> (${u})`).join("\n");

    await msg.edit({
        content: `🎟️ **${data.title}**\n\n**Etkinlik kapatıldı.**\n${final}`,
        embeds: []
    });

    return message.reply("✔ Etkinlik başarıyla kapatıldı.");
}

// -------------------------------------------------------------------

if (cmd === "etkinlik-ekle") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const user = message.mentions.users.first();
    if (!user) return message.reply("Kullanım: `.etkinlik-ekle @kullanıcı`");

    // aktif etkinlik bul
    let active = null;
    for (const [id, data] of etkinlikEvents.entries()) {
        if (data.channelId === message.channel.id && !data.closed) {
            active = { id, data };
            break;
        }
    }
    if (!active) return message.reply("❌ Bu kanalda açık etkinlik yok.");

    const { id, data } = active;
    data.participants.add(user.id);

    const msg = await message.channel.messages.fetch(id);

    // embed güncelle
    const list =
        [...data.participants].length === 0
            ? "Henüz kimse yok."
            : [...data.participants]
                  .map((u, i) => `${i + 1}. <@${u}>`)
                  .join("\n");

    const embed = new EmbedBuilder()
        .setTitle("🎟️ ETKİNLİK")
        .setColor("#000000")
        .setDescription(data.title)
        .addFields(
            { name: "Kişi Sınırı", value: `${data.max}` },
            { name: "Durum", value: "Açık" },
            { name: "Katılımcılar", value: list }
        );

    await msg.edit({ embeds: [embed] });

    return message.reply(`✔ ${user} etkinliğe eklendi.`);
}

// -------------------------------------------------------------------

if (cmd === "etkinlik-çıkar" || cmd === "etkinlik-cikar") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const user = message.mentions.users.first();
    if (!user) return message.reply("Kullanım: `.etkinlik-çıkar @kullanıcı`");

    let active = null;
    for (const [id, data] of etkinlikEvents.entries()) {
        if (data.channelId === message.channel.id && !data.closed) {
            active = { id, data };
            break;
        }
    }
    if (!active) return message.reply("❌ Bu kanalda açık etkinlik yok.");

    const { id, data } = active;

    data.participants.delete(user.id);

    const msg = await message.channel.messages.fetch(id);

    const list =
        [...data.participants].length === 0
            ? "Henüz kimse yok."
            : [...data.participants]
                  .map((u, i) => `${i + 1}. <@${u}>`)
                  .join("\n");

    const embed = new EmbedBuilder()
        .setTitle("🎟️ ETKİNLİK")
        .setColor("#000000")
        .setDescription(data.title)
        .addFields(
            { name: "Kişi Sınırı", value: `${data.max}` },
            { name: "Durum", value: "Açık" },
            { name: "Katılımcılar", value: list }
        );

    await msg.edit({ embeds: [embed] });

    return message.reply(`✔ ${user} etkinlik listesinden çıkarıldı.`);
}
// ===================================================================
//               ETKİNLİK REAKSİYON SİSTEMİ (✔️ ile Kayıt)
// ===================================================================

client.on("messageReactionAdd", async (reaction, user) => {
    try {
        if (user.bot) return;

        // partial fix
        if (reaction.partial) {
            try { await reaction.fetch(); } catch { return; }
        }

        const msg = reaction.message;
        if (!msg.guild) return;

        if (reaction.emoji.name !== "✔️") return;

        const data = etkinlikEvents.get(msg.id);
        if (!data) return;

        // Kapalı ise ✔ kabul edilmez
        if (data.closed) {
            reaction.users.remove(user.id).catch(() => {});
            return;
        }

        // Zaten listede ise bir şey yapma
        if (data.participants.has(user.id)) return;

        // Limit dolmuşsa alma
        if (data.participants.size >= data.max) {
            reaction.users.remove(user.id).catch(() => {});
            return;
        }

        // Ekle
        data.participants.add(user.id);

        // Eğer limit dolduysa otomatik kapat
        if (data.participants.size >= data.max) {
            data.closed = true;

            const r = msg.reactions.resolve("✔️");
            if (r) r.remove().catch(() => {});
        }

        // Embed güncelle
        const list =
            [...data.participants].length === 0
                ? "Henüz kimse yok."
                : [...data.participants]
                    .map((u, i) => `${i + 1}. <@${u}>`)
                    .join("\n");

        const embed = new EmbedBuilder()
            .setTitle("🎟️ ETKİNLİK")
            .setColor("#000000")
            .setDescription(data.title)
            .addFields(
                { name: "Kişi Sınırı", value: `${data.max}` },
                { name: "Durum", value: data.closed ? "KAPANDI" : "Açık" },
                { name: "Katılımcılar", value: list }
            );

        await msg.edit({ embeds: [embed] });

    } catch (err) {
        console.error("Etkinlik Reaction Add Error:", err);
    }
});


// ===================================================================
//          ✔ Tepki KALDIRILINCA Listeden Çıkma (Kapalı değilse)
// ===================================================================

client.on("messageReactionRemove", async (reaction, user) => {
    try {
        if (user.bot) return;

        if (reaction.partial) {
            try { await reaction.fetch(); } catch { return; }
        }

        const msg = reaction.message;
        if (!msg.guild) return;

        if (reaction.emoji.name !== "✔️") return;

        const data = etkinlikEvents.get(msg.id);
        if (!data) return;

        // Kapalı etkinlikten çıkamaz
        if (data.closed) return;

        if (!data.participants.has(user.id)) return;

        // Listeden çıkar
        data.participants.delete(user.id);

        // Embed güncelle
        const list =
            [...data.participants].length === 0
                ? "Henüz kimse yok."
                : [...data.participants]
                    .map((u, i) => `${i + 1}. <@${u}>`)
                    .join("\n");

        const embed = new EmbedBuilder()
            .setTitle("🎟️ ETKİNLİK")
            .setColor("#000000")
            .setDescription(data.title)
            .addFields(
                { name: "Kişi Sınırı", value: `${data.max}` },
                { name: "Durum", value: "Açık" },
                { name: "Katılımcılar", value: list }
            );

        await msg.edit({ embeds: [embed] });

    } catch (err) {
        console.error("Etkinlik Reaction Remove Error:", err);
    }
});
// ===================================================================
//                           BACKUP SİSTEMİ
// ===================================================================

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BACKUP_ZIP = path.join(__dirname, "server_backup.zip");
const BACKUP_JSON = path.join(__dirname, "server_backup.json");

// ================================================================
//                         .backup KOMUTU
// ================================================================
if (cmd === "backup") {
    if (message.author.id !== FORCE_BAN_OWNER)
        return message.reply("❌ Bu komutu sadece sunucu sahibi kullanabilir.");

    const guild = message.guild;

    await message.reply("📦 **Sunucu yedekleniyor...** (Kanallar, roller, izinler)");

    // Rolleri kaydet
    const roles = guild.roles.cache
        .filter(r => r.id !== guild.id)
        .map(r => ({
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            position: r.rawPosition,
            permissions: r.permissions.bitfield,
            mentionable: r.mentionable
        }))
        .sort((a, b) => b.position - a.position);

    // Kanalları kaydet
    const channels = [];
    guild.channels.cache
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .forEach(ch => {
            channels.push({
                name: ch.name,
                type: ch.type,
                parent: ch.parentId,
                position: ch.rawPosition,
                topic: ch.topic || null,
                nsfw: ch.nsfw || false,
                rateLimitPerUser: ch.rateLimitPerUser || 0,
                permissionOverwrites: ch.permissionOverwrites.cache.map(o => ({
                    id: o.id,
                    allow: o.allow.bitfield,
                    deny: o.deny.bitfield
                }))
            });
        });

    const backupData = { roles, channels };

    // JSON kaydet
    fs.writeFileSync(BACKUP_JSON, JSON.stringify(backupData, null, 2));

    // ZIP'e sıkıştır
    const zipped = zlib.gzipSync(JSON.stringify(backupData, null, 2));
    fs.writeFileSync(BACKUP_ZIP, zipped);

    return message.reply("✅ **Yedek başarıyla oluşturuldu!**\nDosya: `server_backup.zip`");
}

// ================================================================
//                         .startbackup KOMUTU
// ================================================================
if (cmd === "startbackup") {
    if (message.author.id !== FORCE_BAN_OWNER)
        return message.reply("❌ Bu komutu sadece sunucu sahibi kullanabilir.");

    if (!fs.existsSync(BACKUP_ZIP))
        return message.reply("❌ Herhangi bir yedek bulunamadı (`server_backup.zip`).");

    await message.reply(
        "⚠️ **Dikkat! Bu işlem tüm sunucuyu silecek ve yedekten yeniden oluşturacak.**\n" +
        "`onayla` yazarak başlat."
    );

    const filter = m => m.author.id === message.author.id;
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000 })
        .catch(() => null);

    if (!collected || collected.first().content.toLowerCase() !== "onayla")
        return message.reply("❌ İşlem iptal edildi.");

    await message.channel.send("⏳ **Yedek açılıyor...**");

    // ZIP → JSON aç
    const zipData = fs.readFileSync(BACKUP_ZIP);
    const jsonData = zlib.gunzipSync(zipData);
    const backup = JSON.parse(jsonData);

    const guild = message.guild;

    // ================================================================
    //                      FULL WIPE — TEMİZLEME
    // ================================================================
    await message.channel.send("🧹 **Sunucu temizleniyor...**");

    // Roller (owner hariç)
    const myId = message.author.id;
    for (const role of guild.roles.cache.values()) {
        if (role.managed) continue;
        if (role.id === guild.id) continue;
        if (role.members.has(myId)) continue; // SEN TEK KALIRSIN

        try { await role.delete("Backup Restore Full Wipe"); } catch {}
    }

    // Kanallar
    for (const ch of guild.channels.cache.values()) {
        try { await ch.delete("Backup Restore Full Wipe"); } catch {}
    }

    await message.channel.send("🔧 **Sunucu yeniden oluşturuluyor...**");

    // ================================================================
    //                     ROLLERİ GERİ YÜKLE
    // ================================================================
    const newRoles = {};
    for (const r of backup.roles) {
        const role = await guild.roles.create({
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            position: r.position,
            mentionable: r.mentionable,
            permissions: r.permissions,
            reason: "Backup Restore - Role"
        }).catch(() => null);

        if (role) newRoles[r.name] = role.id;
    }

    // ================================================================
    //                     KANALLARI GERİ YÜKLE
    // ================================================================
    const createdChannels = {};

    for (const ch of backup.channels) {
        const channel = await guild.channels.create({
            name: ch.name,
            type: ch.type,
            position: ch.position,
            nsfw: ch.nsfw,
            topic: ch.topic,
            rateLimitPerUser: ch.rateLimitPerUser,
            reason: "Backup Restore - Channel"
        }).catch(() => null);

        if (!channel) continue;

        createdChannels[ch.name] = channel.id;

        // İzinleri uygula
        for (const perm of ch.permissionOverwrites) {
            const role = guild.roles.cache.get(perm.id);
            const member = guild.members.cache.get(perm.id);

            if (!role && !member) continue;

            await channel.permissionOverwrites.create(perm.id, {
                allow: perm.allow,
                deny: perm.deny
            }).catch(() => {});
        }
    }

    await message.channel.send("✅ **Restore tamamlandı!**");
}
// ===================================================================
//                       BIO KONTROL SİSTEMİ
// ===================================================================

let bioKontrolChannel = null;
let bioIgnoreRoles = new Set();

const REQUIRED_TAGS = [
    "discord.gg/kaisenst",
    "kaisenst",
    "/kaisenst"
];

// ================================================================
//                   .bio-kontrol — Kanal ayarla
// ================================================================
if (cmd === "bio-kontrol") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const ch = message.mentions.channels.first();
    if (!ch) return message.reply("Kullanım: `.bio-kontrol #kanal`");

    bioKontrolChannel = ch.id;

    return message.reply(`📌 Bio kontrol kanalı ayarlandı: ${ch}`);
}

// ================================================================
//            .bio-kontrol-rol — Muaf rol ayarla
// ================================================================
if (cmd === "bio-kontrol-rol") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const role = message.mentions.roles.first();
    if (!role) return message.reply("Kullanım: `.bio-kontrol-rol @rol`");

    bioIgnoreRoles.add(role.id);

    return message.reply(`🟨 ${role} artık bio kontrolünden muaftır.`);
}

// ================================================================
//                  .bio-tara — Tek kullanıcı tarama
// ================================================================
if (cmd === "bio-tara") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const user = message.mentions.users.first();
    if (!user) return message.reply("Kullanım: `.bio-tara @kullanıcı`");

    const member = message.guild.members.cache.get(user.id);
    if (!member) return message.reply("❌ Kullanıcı sunucuda değil.");

    // MUAF roller kontrol
    if (member.roles.cache.some(r => bioIgnoreRoles.has(r.id)))
        return message.reply(`ℹ️ ${user} bio kontrolünden **muaf**.`);

    const bio = user.bio || "";
    const isValid = REQUIRED_TAGS.some(x =>
        bio.toLowerCase().includes(x)
    );

    if (isValid)
        return message.reply(`✅ ${user} bio kontrolünden geçti.`);

    // KANAL UYARISI
    if (bioKontrolChannel) {
        const ch = message.guild.channels.cache.get(bioKontrolChannel);
        if (ch) {
            ch.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Red")
                        .setTitle("⚠️ BIO TAG EKSİK (Manuel Tarama)")
                        .setDescription(`${member} bio'sunda gerekli tag yok!`)
                        .addFields({ name: "Bio:", value: `\`\`\`${bio || "Boş"}\`\`\`` })
                ]
            });
        }
    }

    // DM UYARISI
    try {
        await user.send(
            "⚠️ **Kaisen Bio Kontrol**\n" +
            "Bio’nuzda gerekli tag bulunamadı.\n" +
            "Eklemelisin:\n" +
            "`discord.gg/kaisenst`\n`kaisenst`\n`/kaisenst`"
        );
    } catch {}

    return message.reply(`⚠️ ${user} için bio uyarıları gönderildi.`);
}

// ================================================================
//                .kontrol — Roldaki herkesi tara
// ================================================================
if (cmd === "kontrol") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const role = message.mentions.roles.first();
    if (!role) return message.reply("Kullanım: `.kontrol @rol`");

    let total = 0, validCount = 0, invalidCount = 0, dmClosed = 0;

    const ch = message.guild.channels.cache.get(bioKontrolChannel);

    for (const member of role.members.values()) {
        const user = member.user;
        const bio = user.bio || "";

        // Muaf roller
        if (member.roles.cache.some(r => bioIgnoreRoles.has(r.id)))
            continue;

        // Admin bypass
        if (member.permissions.has(PermissionsBitField.Flags.Administrator))
            continue;

        total++;

        const ok = REQUIRED_TAGS.some(x =>
            bio.toLowerCase().includes(x)
        );

        if (ok) {
            validCount++;
            continue;
        }

        invalidCount++;

        // Kanal uyarısı
        if (ch) {
            ch.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor("Red")
                        .setTitle("⚠️ BIO TAG EKSİK (Rol Tarama)")
                        .setDescription(`${member} bio'sunda gerekli tag yok!`)
                        .addFields({ name: "Bio:", value: `\`\`\`${bio || "Boş"}\`\`\`` })
                ]
            });
        }

        // DM uyarısı
        try {
            await user.send(
                "⚠️ **Kaisen Bio Kontrol**\n" +
                "Bio’nuzda gerekli tag bulunamadı, lütfen ekleyin."
            );
        } catch {
            dmClosed++;
        }
    }

    return message.reply(
        `📌 **Bio Tarama Raporu**\n` +
        `Rol: ${role}\n\n` +
        `🟩 Geçen: **${validCount}**\n` +
        `🟥 Kalan: **${invalidCount}**\n` +
        `✉️ DM Kapalı: **${dmClosed}**\n` +
        `👥 Toplam İncelenen: **${total}**`
    );
}

// ===================================================================
//                OTOMATİK BIO KONTROL (userUpdate)
// ===================================================================
client.on("userUpdate", async (oldUser, newUser) => {
    try {
        const oldBio = oldUser.bio || "";
        const newBio = newUser.bio || "";

        if (oldBio === newBio) return;

        const requiredOK = REQUIRED_TAGS.some(x =>
            newBio.toLowerCase().includes(x)
        );

        if (requiredOK) return; // Bio düzgünse işlem yok

        for (const guild of client.guilds.cache.values()) {
            const member = guild.members.cache.get(newUser.id);
            if (!member) continue;

            // MUAF ROL → ATLA
            if (member.roles.cache.some(r => bioIgnoreRoles.has(r.id))) continue;

            // YETKİLİLER ATLANIR
            if (member.permissions.has(PermissionsBitField.Flags.Administrator)) continue;

            // KANAL UYARISI
            if (bioKontrolChannel) {
                const ch = guild.channels.cache.get(bioKontrolChannel);
                if (ch) {
                    ch.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("⚠️ BIO TAG EKSİK (Otomatik Kontrol)")
                                .setDescription(`${member} bio’sunda gerekli tag yok!`)
                                .addFields({
                                    name: "Yeni Bio:",
                                    value: `\`\`\`${newBio || "Boş"}\`\`\``
                                })
                        ]
                    });
                }
            }

            // DM Uyarısı
            try {
                await member.send(
                    "⚠️ **Kaisen Bio Kontrol**\n" +
                    "Bio’nuzda gerekli tag bulunamadı. Lütfen ekleyin:\n" +
                    "`discord.gg/kaisenst`\n`kaisenst`\n`/kaisenst`"
                );
            } catch {}
        }
    } catch (err) {
        console.error("Bio Otomatik Tarama Hatası:", err);
    }
});
// ===================================================================
//                     ETKİNLİK (OTOBAN) SİSTEMİ
// ===================================================================

const etkinlikler = new Map();

// Etkinlik mesajını güncelleyen fonksiyon
async function updateEtkinlikMessage(msg, data) {
    const list = [...data.users];

    const summary =
        list.length === 0
            ? "Kimse katılmadı."
            : list.map((id, i) => `${i + 1}. <@${id}>`).join("\n");

    // Etkinlik açıkken embed görünür
    if (!data.closed) {
        const embed = new EmbedBuilder()
            .setTitle("🎉 ETKİNLİK KAYIT")
            .setColor("#000000")
            .setDescription(data.title)
            .addFields(
                { name: "Kişi Limiti", value: `${data.limit}` },
                { name: "Durum", value: "Kayıtlar açık" },
                { name: "Liste", value: summary }
            );

        return msg.edit({ embeds: [embed] }).catch(() => {});
    }

    // Etkinlik kapandıysa düz liste olarak yazı atılır
    const finalList =
        list.length === 0
            ? "Katılımcı yok."
            : list.map((id, i) => `${i + 1}. <@${id}> (${id})`).join("\n");

    return msg
        .edit({
            content:
                `🎉 **${data.title}**\n\nKayıtlar sona erdi:\n` + finalList,
            embeds: []
        })
        .catch(() => {});
}

// ================================================================
//                     .etkinlik BAŞLAT
// ================================================================
if (cmd === "etkinlik") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const kanal = message.mentions.channels.first();
    if (!kanal)
        return message.reply("Kullanım: `.etkinlik #kanal limit açıklama`");

    args.shift();

    const limit = Number(args.shift());
    if (!limit || limit < 1)
        return message.reply("❌ Limit hatalı!");

    const title = args.join(" ");
    if (!title) return message.reply("❌ Açıklama yazmalısın.");

    const embed = new EmbedBuilder()
        .setTitle("🎉 ETKİNLİK KAYIT")
        .setColor("#000000")
        .setDescription(title)
        .addFields(
            { name: "Limit", value: `${limit}` },
            { name: "Durum", value: "Açık" },
            { name: "Liste", value: "Henüz kimse katılmadı." }
        );

    const msg = await kanal.send({ embeds: [embed] });
    await msg.react("✔️");

    etkinlikler.set(msg.id, {
        limit,
        title,
        channelId: kanal.id,
        closed: false,
        users: new Set()
    });

    return message.reply(`✔ Etkinlik açıldı → ${kanal}`);
}

// ================================================================
//                     .etkinlik-bitir
// ================================================================
if (cmd === "etkinlik-bitir") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const active = [...etkinlikler.entries()].find(
        ([, d]) => d.channelId === message.channel.id && !d.closed
    );

    if (!active) return message.reply("❌ Bu kanalda aktif etkinlik yok.");

    const [id, data] = active;
    data.closed = true;

    const msg = await message.channel.messages.fetch(id).catch(() => null);
    if (!msg) return message.reply("❌ Etkinlik mesajı bulunamadı.");

    const r = msg.reactions.resolve("✔️");
    if (r) r.remove().catch(() => {});

    await updateEtkinlikMessage(msg, data);

    return message.reply("✔ Etkinlik kapatıldı.");
}

// ================================================================
//                  .etkinlikekle @kullanıcı
// ================================================================
if (cmd === "etkinlikekle") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const user = message.mentions.users.first();
    if (!user)
        return message.reply("Kullanım: `.etkinlikekle @kullanıcı`");

    const active = [...etkinlikler.entries()].find(
        ([, d]) => d.channelId === message.channel.id && !d.closed
    );
    if (!active) return message.reply("❌ Aktif etkinlik yok.");

    const [id, data] = active;

    data.users.add(user.id);

    const msg = await message.channel.messages.fetch(id);
    await updateEtkinlikMessage(msg, data);

    return message.reply(`✔ ${user} listeye eklendi.`);
}

// ================================================================
//               .etkinlikçıkar @kullanıcı
// ================================================================
if (cmd === "etkinlikçıkar" || cmd === "etkinlikcikar") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const user = message.mentions.users.first();
    if (!user)
        return message.reply("Kullanım: `.etkinlikçıkar @kullanıcı`");

    const active = [...etkinlikler.entries()].find(
        ([, d]) => d.channelId === message.channel.id && !d.closed
    );
    if (!active) return message.reply("❌ Aktif etkinlik yok.");

    const [id, data] = active;

    data.users.delete(user.id);

    const msg = await message.channel.messages.fetch(id);
    await updateEtkinlikMessage(msg, data);

    return message.reply(`✔ ${user} listeden çıkarıldı.`);
}

// ===================================================================
//          ETKİNLİK Reaksiyon → ✔️ ile katılma / ayrılma
// ===================================================================
client.on("messageReactionAdd", async (reaction, user) => {
    try {
        if (user.bot) return;

        if (reaction.emoji.name !== "✔️") return;
        const msg = reaction.message;
        if (!msg.guild) return;

        const data = etkinlikler.get(msg.id);
        if (!data) return;

        if (data.closed) {
            reaction.users.remove(user.id).catch(() => {});
            return;
        }

        // Limit dolmuşsa alma
        if (data.users.size >= data.limit) {
            reaction.users.remove(user.id).catch(() => {});
            return;
        }

        // Zaten varsa atlama
        if (data.users.has(user.id)) return;

        data.users.add(user.id);

        // Limit dolduysa otomatik kapatma
        if (data.users.size >= data.limit) {
            data.closed = true;
            const r = msg.reactions.resolve("✔️");
            if (r) r.remove().catch(() => {});
        }

        updateEtkinlikMessage(msg, data);
    } catch (err) {
        console.error("Reak Add Hata:", err);
    }
});

client.on("messageReactionRemove", async (reaction, user) => {
    try {
        if (user.bot) return;

        if (reaction.emoji.name !== "✔️") return;

        const msg = reaction.message;
        if (!msg.guild) return;

        const data = etkinlikler.get(msg.id);
        if (!data) return;

        if (data.closed) return;

        if (data.users.has(user.id)) {
            data.users.delete(user.id);
            updateEtkinlikMessage(msg, data);
        }
    } catch (err) {
        console.error("Reak Remove Hata:", err);
    }
});
// ===================================================================
//                         DM GÖNDER — .dm @rol mesaj
// ===================================================================
if (cmd === "dm") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const role = message.mentions.roles.first();
    if (!role)
        return message.reply("Kullanım: `.dm @rol mesaj`");

    // Rolü argümandan çıkar
    args.shift();
    const text = args.join(" ");
    if (!text)
        return message.reply("❌ Göndermek için bir mesaj yazmalısın.");

    const embed = new EmbedBuilder()
        .setColor("#000000")
        .setDescription(text)
        .setFooter({ text: `Gönderen: ${message.author.tag}` });

    let ok = 0,
        fail = 0;

    const members = await message.guild.members.fetch();

    for (const m of members.values()) {
        if (!m.roles.cache.has(role.id)) continue;
        if (m.user.bot) continue;

        try {
            await m.send({ embeds: [embed] });
            ok++;
        } catch {
            fail++;
        }
    }

    return message.reply(
        `✉️ DM gönderildi.\n✔ Başarılı: **${ok}**\n❌ DM Kapalı: **${fail}**`
    );
}
// ===================================================================
//                BAŞVURU PANELİ OLUŞTUR — .basvurupanel @rol
// ===================================================================
if (cmd === "basvurupanel") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const role = message.mentions.roles.first();
    if (!role)
        return message.reply("Kullanım: `.basvurupanel @rol`");

    const embed = new EmbedBuilder()
        .setTitle("📨 Başvuru Paneli")
        .setDescription("Aşağıdaki butona basarak başvuru oluşturabilirsiniz.")
        .setColor("#000000");

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket_open:${role.id}`)
            .setLabel("Başvuru Aç")
            .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [embed], components: [row] });

    return message.reply("✔ Başvuru paneli oluşturuldu.");
}
// ===================================================================
//                   TICKET SİSTEMİ — BUTTON HANDLER
// ===================================================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    // ---------------------------
    // BAŞVURU OLUŞTURMA
    // ---------------------------
    if (interaction.customId.startsWith("ticket_open:")) {
        const roleId = interaction.customId.split(":")[1];
        const guild = interaction.guild;

        await interaction.deferReply({ ephemeral: true });

        const ch = await guild.channels.create({
            name: `ticket-${interaction.user.username}`.toLowerCase(),
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone,
                    deny: [PermissionsBitField.Flags.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages
                    ]
                },
                {
                    id: roleId,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages
                    ]
                }
            ]
        });

        await ch.send({
            content: `<@${interaction.user.id}> | <@&${roleId}>`,
            embeds: [
                new EmbedBuilder()
                    .setTitle("📨 Başvuru Kanalı Açıldı")
                    .setDescription("Aşağıdaki buton ile başvuruyu kapatabilirsiniz.")
                    .setColor("#000000")
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_close:${interaction.user.id}`)
                        .setLabel("Başvuruyu Kapat")
                        .setStyle(ButtonStyle.Danger)
                )
            ]
        });

        return interaction.editReply(`✔ Başvurun açıldı → ${ch}`);
    }

    // ---------------------------
    // BAŞVURU KAPATMA
    // ---------------------------
    if (interaction.customId.startsWith("ticket_close:")) {
        const ownerId = interaction.customId.split(":")[1];

        const isOwner = interaction.user.id === ownerId;
        const isAdmin = interaction.member.permissions.has(
            PermissionsBitField.Flags.ManageChannels
        );

        if (!isOwner && !isAdmin)
            return interaction.reply({
                content: "❌ Bu başvuruyu kapatamazsın.",
                ephemeral: true
            });

        const channel = interaction.channel;

        await channel.permissionOverwrites.edit(ownerId, {
            ViewChannel: false,
            SendMessages: false
        });

        if (!channel.name.startsWith("closed-"))
            await channel.setName(`closed-${channel.name}`).catch(() => {});

        return interaction.reply("🔒 Başvuru kapatıldı.");
    }
});
// ===================================================================
//                       FORCEBAN — .forceban
// ===================================================================
if (cmd === "forceban") {
    if (message.author.id !== FORCE_BAN_OWNER)
        return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir.");

    let targetId =
        message.mentions.users.first()?.id || args.shift();
    if (!targetId)
        return message.reply("Kullanım: `.forceban @kullanıcı sebep`");

    const reason = args.join(" ") || "Forceban";

    forceBannedUsers.add(targetId);

    try {
        await message.guild.bans.create(targetId, { reason });
        return message.reply(`🚫 Forceban uygulandı → ${targetId}`);
    } catch {
        return message.reply("❌ Ban atılamadı.");
    }
}
// ===================================================================
//                   UNFORCEBAN — .unforceban
// ===================================================================
if (cmd === "unforceban") {
    if (message.author.id !== FORCE_BAN_OWNER)
        return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir.");

    let targetId =
        message.mentions.users.first()?.id || args.shift();
    if (!targetId)
        return message.reply("Kullanım: `.unforceban @kullanıcı`");

    forceBannedUsers.delete(targetId);

    try {
        await message.guild.bans.remove(targetId);
    } catch {}

    return message.reply(`✔ Kullanıcı forceban listesinden çıkarıldı.`);
}
// ===================================================================
//                FORCEBAN KORUMA — Ban açılırsa tekrar banlar
// ===================================================================
client.on("guildBanRemove", async (ban) => {
    const id = ban.user.id;

    if (!forceBannedUsers.has(id)) return;

    await ban.guild.bans.create(id, {
        reason: "Forceban koruması: tekrar yasaklandı."
    });
});
// ===================================================================
//                         YARDIM MENÜSÜ — .yardım
// ===================================================================
if (cmd === "yardım" || cmd === "yardim") {
    const embed = new EmbedBuilder()
        .setTitle("🛠 Kaisen Bot Yardım Menüsü")
        .setColor("#000000")
        .addFields(

            // -----------------------------------
            // ETKİNLİK (ESKİ OTOBAN)
            // -----------------------------------
            {
                name: "🎟 ETKİNLİK SİSTEMİ",
                value:
                    "```" +
                    ".etkinlik #kanal limit açıklama\n" +
                    ".etkinlik-bitir\n" +
                    ".etkinlikekle @kullanıcı\n" +
                    ".etkinlikçıkar @kullanıcı" +
                    "```"
            },

            // -----------------------------------
            // MODERASYON
            // -----------------------------------
            {
                name: "🧹 MODERASYON",
                value:
                    "```" +
                    ".sil <miktar>   → Mesaj siler\n" +
                    ".nuke          → Kanalı sıfırlar\n" +
                    ".dm @rol mesaj → Roldakilere DM gönderir" +
                    "```"
            },

            // -----------------------------------
            // BAŞVURU SİSTEMİ
            // -----------------------------------
            {
                name: "📨 BAŞVURU (TICKET)",
                value:
                    "```" +
                    ".basvurupanel @yetkili\n" +
                    "(Butondan başvuru açılır, kapatılınca closed- olarak kalır)" +
                    "```"
            },

            // -----------------------------------
            // BIO KONTROL
            // -----------------------------------
            {
                name: "📝 BIO KONTROL",
                value:
                    "```" +
                    ".bio-kontrol #kanal      → Uyarı kanalı ayarla\n" +
                    ".bio-kontrol-rol @rol    → Bu rolü kontrolden muaf yap\n" +
                    ".bio-tara @kullanıcı     → Tek kişiyi kontrol et\n" +
                    ".kontrol @rol            → Roldaki herkesi tara\n" +
                    "(Oto tarama: Bio değişince otomatik kontrol eder)" +
                    "```"
            },

            // -----------------------------------
            // FORCEBAN
            // -----------------------------------
            {
                name: "🚫 FORCEBAN SİSTEMİ",
                value:
                    "```" +
                    ".forceban @kullanıcı sebep\n" +
                    ".unforceban @kullanıcı\n" +
                    "NOT: Sadece bot sahibi kullanabilir.\n" +
                    "Forceban koruması aktif → Ban açılırsa otomatik geri banlanır." +
                    "```"
            },

            // -----------------------------------
            // BACKUP SİSTEMİ
            // -----------------------------------
            {
                name: "💾 BACKUP SİSTEMİ (Yalnızca Bot Sahibine Özel)",
                value:
                    "```" +
                    ".backup → Sunucunun tam yedeğini alır\n" +
                    ".startbackup → Yedeği yükler (onay ister)\n" +
                    "NOT: Bu komutları sadece bot sahibi kullanabilir." +
                    "```"
            },

            // -----------------------------------
            // YETKİ SİSTEMİ
            // -----------------------------------
            {
                name: "🛡 BOT YETKİ SİSTEMİ",
                value:
                    "```" +
                    ".yetkiekle @rol\n" +
                    ".yetkicikar @rol\n" +
                    ".yetkiler" +
                    "```"
            }
        )
        .setFooter({ text: "vazgucxn ❤ Kaisen" });

    return message.channel.send({ embeds: [embed] });
}
// ===================================================================
//                         BOTU BAŞLAT
// ===================================================================
client.login(TOKEN)
    .then(() => console.log("✅ Bot başarıyla giriş yaptı!"))
    .catch(err => console.error("❌ Bot giriş yaparken hata oluştu:", err));
