// ===================== Savénia Özel Discord Botu (Prefix + Guard + Bio + Backup) =====================
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


function cleanFiveMName(name = "") {
    return name.replace(/\^\d/g, "").toLowerCase();
}


async function getPlayerFromCFX(playerId) {
    try {
        console.log("CFX API isteği atılıyor...");

        const res = await fetch(
            "https://servers-frontend.fivem.net/api/servers/single/xjx5kr",
            {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json"
                }
            }
        );

        console.log("CFX STATUS:", res.status);

        const json = await res.json();
        const players = json?.Data?.players || [];

        const player = players.find(p => String(p.id) === String(playerId));
        if (!player) return { found: false };

        const identifiers = player.identifiers || [];

        return {
            found: true,
            id: player.id,
            name: player.name ?? "Bilinmiyor",
            ping: player.ping ?? "N/A",
            steamHex: identifiers.find(i => i.startsWith("steam:")) ?? "Bulunamadı",
            discordId:
                identifiers.find(i => i.startsWith("discord:"))
                    ?.replace("discord:", "") ?? "Bulunamadı"
        };

    } catch (err) {
        console.error("CFX FETCH HATASI:", err);
        return { serverDown: true };
    }
}

// ===================== GUARD VERİLERİ =====================
const guardSettings = {
    banLimit: 0,
    kickLimit: 0,
    channelDeleteLimit: 0,
    roleDeleteLimit: 0
};

const guardWhitelist = new Set(); // guard muaf kullanıcılar
const guardActions = new Map();   // userId -> { ban, kick, channel, role }
let guardLogChannelId = null;


// ----------- Prefix & Owner Ayarları -----------
const PREFIX = ".";
const FORCE_BAN_OWNER = "827905938923978823"; // Forceban + backup sahibi (sadece sen)

// ----------- Express Keep-Alive (Render için) -----------
const app = express();
app.get("/", (_req, res) => res.send("impêrion aktif!"));
app.listen(process.env.PORT || 3000, () =>
    console.log("Render KeepAlive aktif.")
);

// ----------- ENV Kontrolü -----------
const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN || TOKEN.length < 20) {
    console.error("❌ Geçersiz DISCORD_BOT_TOKEN!");
    process.exit(1);
}

// ----------- Discord Client -----------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildBans
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ===================== Global Veriler =====================
const etkinlikEvents = new Map();        // etkinlik messageId -> data
const forceBannedUsers = new Set();      // forceban kayıtları
const botStaffRoles = new Set();         // ek yetkili roller
let bioKontrolChannel = null;            // bio uyarı kanal ID (tek sunucu)
let bioIgnoreRoles = new Set();          // bio kontrol dışı roller
const serverBackups = new Map();         // guildId -> backup objesi (RAM içi)

// ===================== Yardımcı Fonksiyonlar =====================

// --- Bot Yetki Kontrolü ---
function hasBotPermission(member) {
    if (!member) return false;

    if (member.permissions.has(PermissionsBitField.Flags.Administrator))
        return true;

    if (member.permissions.has(PermissionsBitField.Flags.ManageGuild))
        return true;

    for (const roleId of botStaffRoles) {
        if (member.roles.cache.has(roleId)) return true;
    }
    return false;
}

// --- Etkinlik bul ---
function findActiveEtkinlikInChannel(channelId) {
    for (const [msgId, data] of etkinlikEvents.entries()) {
        if (data.channelId === channelId && !data.closed)
            return { msgId, data };
    }
    return null;
}


async function sendGuardLog(guild, embed) {
    if (!guardLogChannelId) return;

    const channel = guild.channels.cache.get(guardLogChannelId);
    if (!channel) return;

    channel.send({ embeds: [embed] }).catch(() => {});
}

// --- Etkinlik mesajını güncelle ---
async function updateEtkinlikMessage(message, data) {
    const listArr = Array.from(data.participants);

    const embedList =
        listArr.length === 0
            ? "Henüz kimse katılmadı."
            : listArr.map((id, i) => `${i + 1}. <@${id}>`).join("\n");

    const finalList =
        listArr.length === 0
            ? "Katılımcı yok."
            : listArr.map((id, i) => `${i + 1}- <@${id}> ( ${id} )`).join("\n");

    if (!data.closed) {
        const embed = new EmbedBuilder()
            .setColor("#000000")
            .setTitle("🎟️ ETKİNLİK")
            .setDescription(data.title)
            .addFields(
                { name: "Kişi Sınırı", value: `${data.max}` },
                { name: "Durum", value: "Kayıtlar açık" },
                { name: "Katılımcılar", value: embedList }
            );
        return message.edit({ embeds: [embed], content: null }).catch(() => {});
    }

    return message.edit({
        content: `**${data.title}**\n\nKatılımlar sona erdi:\n${finalList}`,
        embeds: []
    }).catch(() => {});
}

// ===================== BOT READY =====================
client.once("ready", () => {
    console.log(`🔵 Bot aktif: ${client.user}`);

    client.user.setPresence({
        activities: [
            {
                name: "vazgucxn ❤ impêrion",
                type: ActivityType.Streaming,
                url: "https://twitch.tv/discord"
            }
        ],
        status: "online"
    });
});

function isGuardWhitelisted(userId) {
    return (
        userId === FORCE_BAN_OWNER ||
        guardWhitelist.has(userId)
    );
}

// ===================================================================
//                      GUARD: REKLAM ENGEL
// ===================================================================
const adWords = [
    "discord.gg",
    "discord.com/invite",
    "http://",
    "https://",
    "t.me/",
    "telegram.me/",
    "instagram.com",
    "tiktok.com",
    "facebook.com",
    "youtu.be",
    "youtube.com",
    ".gg",
    ".com",
    ".net"
];

async function checkAd(message) {
    try {
        if (!message.guild || message.author.bot) return;

        const member = message.member;
        if (!member) return;

        // Yetkili ve bot staff reklam filtresinden muaf
        if (
            hasBotPermission(member) ||
            member.permissions.has(PermissionsBitField.Flags.ManageMessages)
        ) {
            return;
        }

        const content = (message.content || "").toLowerCase();
        if (!content) return;

        if (adWords.some((w) => content.includes(w))) {
            await message.delete().catch(() => {});
            const warn = await message.channel.send(
                `⚠️ ${message.author}, bu kanalda reklam linki paylaşamazsın.`
            );
            setTimeout(() => warn.delete().catch(() => {}), 5000);
        }
    } catch (err) {
        console.error("Ad guard error:", err);
    }
}

// Mesaj atıldığında reklam kontrolü (komutlardan ayrı, çifte tetik yok)
client.on("messageCreate", (message) => {
    checkAd(message);
});

// Mesaj düzenlendiğinde tekrar reklam kontrolü
client.on("messageUpdate", async (_oldMsg, newMsg) => {
    try {
        if (newMsg.partial) {
            newMsg = await newMsg.fetch();
        }
    } catch {
        return;
    }
    checkAd(newMsg);
});

// ===================================================================
//                       PREFIX KOMUTLARI (TEK LİSTENER)
// ===================================================================
client.on("messageCreate", async (message) => {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        // Aynı mesaj için ikinci kez çalışmayı engelle
        if (message._executed) return;
        message._executed = true;

        const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
        const cmd = (args.shift() || "").toLowerCase();

        const guild = message.guild;

        // ================================================================
        //                     YARDIM MENÜSÜ
        // ================================================================
        if (cmd === "yardım" || cmd === "yardim") {
    const embed = new EmbedBuilder()
        .setTitle("impêrion Yardım")
        .setColor("#000000")
        .addFields(
            {
                name: "🎟 Etkinlik Sistemi",
                value:
                    "`" +
                    ".etkinlik #kanal limit açıklama\n" +
                    ".etkinlik-bitir\n" +
                    ".etkinlikekle @kullanıcı\n" +
                    ".etkinlikçıkar @kullanıcı" +
                    "`"
            },
            {
                name: "🧹 Moderasyon",
                value:
                    "`" +
                    ".sil <miktar> → Mesaj siler\n" +
                    ".nuke → Kanalı sıfırlar" +
                    "`"
            },
            {
                name: "💌 DM Sistemi",
                value: "`" + ".dm @rol mesaj" + "`"
            },
            {
                name: "📨 Başvuru Sistemi",
                value: "`" + ".basvurupanel @YetkiliRol" + "`"
            },
            {
                name: "🛡 Yetkili Sistemi",
                value:
                    "`" +
                    ".yetkiekle @rol\n" +
                    ".yetkicikar @rol\n" +
                    ".yetkiler" +
                    "`"
            },
            {
                name: "🚫 ForceBan Sistemi",
                value:
                    "`" +
                    ".forceban @kullanıcı/id sebep\n" +
                    ".unforceban @kullanıcı/id" +
                    "`\n(Sadece <@" + FORCE_BAN_OWNER + "> kullanabilir!)"
            },
            {
                name: "📝 Bio Kontrol Sistemi",
                value:
                    "`" +
                    ".bio-kontrol #kanal → Uyarı kanalı seç\n" +
                    ".bio-kontrol-rol @rol → Bio kontrol dışı rol\n" +
                    ".bio-tara @kullanıcı → Tek kişiyi tara\n" +
                    ".kontrol @rol → Roldaki herkesi tara" +
                    "`"
            },
            {
                name: "💾 Yedek Sistemi (Sadece Sen)",
                value:
                    "`" +
                    ".backup → Sunucu yapısını RAM’e yedekler\n" +
                    ".startbackup → Yedeği uygular (rol + kanal isimleri)" +
                    "`"
            },
            {
    name: "🕹️ Oyuncu Sorgulama",
    value:
        "`" +
        ".id <oyuncuID>\n" +
        ".tag <kelime>\n" +
        "`"
},
{
    name: "🛡 Gelişmiş Guard",
    value:
        "`" +
        ".bankoruma <limit>\n" +
        ".kickkoruma <limit>\n" +
        ".kanalkoruma <limit>\n" +
        ".rolkoruma <limit>\n" +
        ".whitelist @kullanıcı\n" +
        ".whitelistkaldır @kullanıcı\n" +
        ".whitelistler" +
        "`"
},
{
    name: "🛡 Guard & Log",
    value:
        "`" +
        ".guardlog #kanal\n" +
        ".guardpanel\n" +
        ".sesgir\n" +
        ".sesçık" +
        "`"
}

        )
        .setFooter({ text: "vazgucxn ❤ impêrion" });

    return void message.channel.send({ embeds: [embed] });
}

        // ================================================================
        //                    SADECE SAHİP KOMUTLARI
        // ================================================================
        const isOwner = message.author.id === FORCE_BAN_OWNER;

        // --------- BACKUP AL (.backup) ---------
        if (cmd === "backup") {
            if (!isOwner) return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir.");

            const roleData = guild.roles.cache
                .filter(r => !r.managed) // managed rolleri karıştırma
                .map(r => ({
                    name: r.name,
                    color: r.color,
                    hoist: r.hoist,
                    permissions: r.permissions.bitfield.toString(),
                    mentionable: r.mentionable
                }));

            const channelData = guild.channels.cache
                .filter(ch => ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildCategory)
                .map(ch => ({
                    name: ch.name,
                    type: ch.type,
                    parentName: ch.parent ? ch.parent.name : null,
                    topic: ch.topic || null,
                    nsfw: ch.nsfw || false,
                    rateLimitPerUser: ch.rateLimitPerUser || 0
                }));

            const backup = {
                guildId: guild.id,
                createdAt: Date.now(),
                roles: roleData,
                channels: channelData
            };

            serverBackups.set(guild.id, backup);

            return void message.reply("✅ Sunucu yapısı RAM içinde yedeklendi. (Bu yedek, bot yeniden başlarsa sıfırlanır.)");
        }

        // --------- BACKUP UYGULA (.startbackup) ---------
        if (cmd === "startbackup") {
            if (!isOwner) return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir.");

            const backup = serverBackups.get(guild.id);
            if (!backup)
                return message.reply("❌ Bu sunucu için kayıtlı bir yedek bulunamadı. Önce `.backup` kullan.");

            await message.reply("⚠️ **Dikkat!** Yedek uygulanırken yeni roller ve kanallar oluşturulacak.\n`onayla` yazarak işlemi başlat.");

            const filter = m => m.author.id === message.author.id;
            const collected = await message.channel.awaitMessages({
                filter,
                max: 1,
                time: 20000
            }).catch(() => null);

            if (!collected || collected.first().content.toLowerCase() !== "onayla")
                return message.reply("❌ İşlem iptal edildi.");

            await message.channel.send("⏳ Yedek uygulanıyor... (Bu işlem tam sıfırlama yapmaz, eksikleri tamamlar)");

            // ---- Eksik rolleri oluştur ----
            for (const r of backup.roles) {
                const exists = guild.roles.cache.find(x => x.name === r.name);
                if (exists) continue;

                try {
                    await guild.roles.create({
                        name: r.name,
                        color: r.color,
                        hoist: r.hoist,
                        mentionable: r.mentionable,
                        permissions: BigInt(r.permissions)
                    });
                } catch (err) {
                    console.error("Role create error:", err);
                }
            }
            // ---- Kanal isimlerine göre eksikleri oluştur ----
            for (const c of backup.channels) {
                const exists = guild.channels.cache.find(x => x.name === c.name);
                if (exists) continue;

                try {
                    if (c.type === ChannelType.GuildCategory) {
                        await guild.channels.create({
                            name: c.name,
                            type: ChannelType.GuildCategory
                        });
                    } else if (c.type === ChannelType.GuildText) {
                        await guild.channels.create({
                            name: c.name,
                            type: ChannelType.GuildText,
                            topic: c.topic || undefined,
                            nsfw: c.nsfw,
                            rateLimitPerUser: c.rateLimitPerUser
                        });
                    } else if (c.type === ChannelType.GuildVoice) {
                        await guild.channels.create({
                            name: c.name,
                            type: ChannelType.GuildVoice
                        });
                    }
                } catch (err) {
                    console.error("Channel create error:", err);
                }
            }

            return void message.channel.send("✅ Yedek uygulanması tamamlandı. (Eksik rolleri ve kanalları ekledi, mevcutları silmedi.)");
        }
if (cmd === "guardlog") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return message.reply("❌ Sadece admin ayarlayabilir.");

    const ch = message.mentions.channels.first();
    if (!ch) return message.reply("Kullanım: `.guardlog #kanal`");

    guardLogChannelId = ch.id;
    return message.reply(`🛡 Guard log kanalı ayarlandı → ${ch}`);
}

// ===================== GUARD KOMUTLARI =====================

// .bankoruma <limit>
if (cmd === "bankoruma") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return message.reply("❌ Sadece admin kullanabilir.");

    const limit = Number(args[0]);
    if (!limit || limit < 1)
        return message.reply("Kullanım: `.bankoruma <limit>`");

    guardSettings.banLimit = limit;
    return message.reply(`🛡️ Ban koruması aktif → Limit: **${limit}**`);
}

// .kickkoruma <limit>
if (cmd === "kickkoruma") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return message.reply("❌ Sadece admin kullanabilir.");

    const limit = Number(args[0]);
    if (!limit || limit < 1)
        return message.reply("Kullanım: `.kickkoruma <limit>`");

    guardSettings.kickLimit = limit;
    return message.reply(`🛡️ Kick koruması aktif → Limit: **${limit}**`);
}

// .whitelist @kullanıcı
if (cmd === "whitelist") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return message.reply("❌ Yetkin yok.");

    const user = message.mentions.users.first();
    if (!user) return message.reply("Kullanım: `.whitelist @kullanıcı`");

    guardWhitelist.add(user.id);
    return message.reply(`✅ ${user} guard sisteminden muaf edildi.`);
}

// .whitelistkaldır
if (cmd === "whitelistkaldır") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return message.reply("❌ Yetkin yok.");

    const user = message.mentions.users.first();
    if (!user) return message.reply("Kullanım: `.whitelistkaldır @kullanıcı`");

    guardWhitelist.delete(user.id);
    return message.reply(`❌ ${user} guard muafiyetinden çıkarıldı.`);
}
// ===================== EK GUARD KOMUTLARI =====================

// .kanalkoruma <limit>
if (cmd === "kanalkoruma") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return message.reply("❌ Sadece admin kullanabilir.");

    const limit = Number(args[0]);
    if (!limit || limit < 1)
        return message.reply("Kullanım: `.kanalkoruma <limit>`");

    guardSettings.channelDeleteLimit = limit;
    return message.reply(`🛡️ Kanal silme koruması aktif → Limit: **${limit}**`);
}

// .rolkoruma <limit>
if (cmd === "rolkoruma") {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
        return message.reply("❌ Sadece admin kullanabilir.");

    const limit = Number(args[0]);
    if (!limit || limit < 1)
        return message.reply("Kullanım: `.rolkoruma <limit>`");

    guardSettings.roleDeleteLimit = limit;
    return message.reply(`🛡️ Rol silme koruması aktif → Limit: **${limit}**`);
}

// .whitelistler
if (cmd === "whitelistler") {
    if (guardWhitelist.size === 0)
        return message.reply("📭 Guard whitelist boş.");

    return message.reply(
        "🛡️ Guard Whitelist:\n" +
        [...guardWhitelist].map(id => `<@${id}>`).join("\n")
    );
}

        
        // ================================================================
        //                      BIO KONTROL KOMUTLARI
        // ================================================================
        if (cmd === "bio-kontrol") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const ch = message.mentions.channels.first();
            if (!ch) return message.reply("Kullanım: `.bio-kontrol #kanal`");

            bioKontrolChannel = ch.id;
            return void message.reply(`✅ Bio kontrol uyarı kanalı ayarlandı: ${ch}`);
        }

        if (cmd === "bio-kontrol-rol") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.bio-kontrol-rol @rol`");

            bioIgnoreRoles.add(role.id);
            return void message.reply(`🛡 ${role} bio kontrolünden muaf yapıldı.`);
        }

        if (cmd === "bio-tara") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const user = message.mentions.users.first();
            if (!user) return message.reply("Kullanım: `.bio-tara @kullanıcı`");

            const member = await guild.members.fetch(user.id).catch(() => null);
            if (!member) return message.reply("❌ Kullanıcı sunucuda değil.");

            const bio = user.bio || "";
            const required = ["discord.gg/imperionmd", "imperionmd", "/imperionmd"];

            if (member.roles.cache.some(r => bioIgnoreRoles.has(r.id)))
                return message.reply("ℹ️ Bu kullanıcı bio kontrolünden muaftır.");

            const valid = required.some(x => bio.toLowerCase().includes(x.toLowerCase()));

            if (valid)
                return message.reply(`✅ ${user} bio kontrolünden geçti.`);

            // Kanal uyarısı
            if (bioKontrolChannel) {
                const ch = guild.channels.cache.get(bioKontrolChannel);
                if (ch) {
                    ch.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("⚠️ BIO TAG EKSİK (Manuel Tarama)")
                                .setDescription(`${member} bio’sunda gerekli tag yok.`)
                                .addFields(
                                    { name: "Bio:", value: `\`\`\`${bio || "Boş"}\`\`\`` },
                                    { name: "Gerekli:", value: "`discord.gg/imperionmd`\n`imperionmd`\n`/imperionmd`" }
                                )
                        ]
                    }).catch(() => {});
                }
            }

            // DM uyarı
            try {
                await user.send(
                    "⚠️ **impêrion Bio Kontrol**\n" +
                    "Profil bio’nuzda gerekli tag bulunamadı!\n\n" +
                    "Eklemelisin:\n`discord.gg/imperionmd`\n`imperionmd`\n`/imperionmd`"
                );
            } catch {}

            return void message.reply(`⚠️ ${user} tag eksik, uyarı gönderildi.`);
        }

        if (cmd === "kontrol") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.kontrol @rol`");

            const members = role.members;
            if (members.size === 0)
                return message.reply("❌ Bu rolde kullanıcı yok.");

            const required = ["discord.gg/imperionmd", "imperionmd", "/imperionmd"];

            let eksik = 0;

            for (const member of members.values()) {
                const bio = member.user.bio || "";
                const valid = required.some(x => bio.toLowerCase().includes(x.toLowerCase()));

                if (!valid) {
                    eksik++;

                    if (bioKontrolChannel) {
                        const ch = guild.channels.cache.get(bioKontrolChannel);
                        if (ch) {
                            ch.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor("Red")
                                        .setTitle("⚠️ BIO TAG EKSİK (Rol Tarama)")
                                        .setDescription(`${member} bio’sunda tag bulunamadı.`)
                                        .addFields(
                                            { name: "Bio:", value: `\`\`\`${bio || "Boş"}\`\`\`` },
                                            { name: "Gerekli:", value: "`discord.gg/imperionmd`\n`imperionmd`\n`/imperionmd`" }
                                        )
                                ]
                            }).catch(() => {});
                        }
                    }

                    try {
                        await member.send(
                            "⚠️ **impêrion Bio Kontrol**\n" +
                            "Profil bio’nuzda gerekli tag bulunamadı.\n" +
                            "Lütfen ekleyin. Eğer tagınız var ise bu uyarıyı görmezden gelin."
                        );
                    } catch {}
                }
            }

            return void message.reply(`⌛ Rol taraması tamamlandı. Eksik bio: **${eksik} kişi**`);
        }

        // ================================================================
        //                    .sil (mesaj sil)
        // ================================================================
        if (cmd === "sil") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const amount = Number(args[0]);
            if (!amount || amount < 1 || amount > 100)
                return message.reply("Kullanım: `.sil 1-100`");

            await message.channel.bulkDelete(amount, true).catch(() => {});

            const msg = await message.channel.send(`🧹 **${amount} mesaj silindi.**`);
            setTimeout(() => msg.delete().catch(() => {}), 3000);
            return;
        }

//-------------------------// SES GİR // 
if (cmd === "sesgir") {
    if (!message.member.voice.channel)
        return message.reply("❌ Bir ses kanalında değilsin.");

    const channel = message.member.voice.channel;

    const { joinVoiceChannel } = require("@discordjs/voice");

    joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator
    });

    return message.reply(`🔊 Ses kanalına girildi → ${channel.name}`);
}
// SES ÇIK 
if (cmd === "sesçık" || cmd === "sescik") {
    const { getVoiceConnection } = require("@discordjs/voice");
    const connection = getVoiceConnection(message.guild.id);

    if (!connection)
        return message.reply("❌ Bot ses kanalında değil.");

    connection.destroy();
    return message.reply("🔕 Ses kanalından çıkıldı.");
}

// ==========================
//        .id Komutu
// ==========================
if (cmd === "id") {
    const playerId = args[0];

    if (!playerId || isNaN(playerId)) {
        return message.reply("Kullanım: `.id <oyuncuID>`");
    }

    const loadingMsg = await message.channel.send(
        `⏱️ **CFX** üzerinden **${playerId}** ID'li oyuncu aranıyor...`
    );

    const player = await getPlayerFromCFX(playerId);

    let embed;

    if (player.serverDown) {
        embed = new EmbedBuilder()
            .setColor("Red")
            .setTitle("🔴 Sunucuya Ulaşılamıyor")
            .setDescription("VAZGUCXN APİ YANIT VERMİYOR");
    } 
    else if (!player.found) {
        embed = new EmbedBuilder()
            .setColor("Orange")
            .setTitle("🟠 Oyuncu Bulunamadı")
            .setDescription(`**${playerId}** ID'li oyuncu sunucuda yok.`);
    } 
    else {
        embed = new EmbedBuilder()
            .setColor("#000000")
            .setTitle(`👤 Oyuncu Bilgileri`)
            .addFields(
                { name: "İsim", value: `\`${player.name}\`` },
                { name: "Oyun İçi ID", value: `\`${player.id}\``, inline: true },
                { name: "Ping", value: `\`${player.ping}\``, inline: true },
                { name: "Steam Hex", value: `\`${player.steamHex}\`` },
                { name: "Discord ID", value: `\`${player.discordId}\`` }
            )
            .setFooter({ text: "VAZGUCXN APİ CHECKİNG" });
    }

    await loadingMsg.edit({ content: "", embeds: [embed] });
    return;
}

// ==========================
//        .tag (FiveM)
// ==========================
if (cmd === "tag") {
    const search = args.join(" ").toLowerCase();
    if (!search) {
        return message.reply("Kullanım: `.tag <kelime veya cümle>`");
    }

    const loadingMsg = await message.channel.send(
        `🔍 **CFX** üzerinden \`${search}\` aranıyor...`
    );

    let embed;

    try {
        const res = await fetch(
            "https://servers-frontend.fivem.net/api/servers/single/xjx5kr",
            { timeout: 8000 } // 🔴 KRİTİK
        );

        if (!res.ok) throw new Error("CFX API cevap vermedi");

        const json = await res.json();
        const players = json?.Data?.players || [];

        const matched = players.filter(p =>
            cleanFiveMName(p.name).includes(search)
        );

        if (matched.length === 0) {
            embed = new EmbedBuilder()
                .setColor("Orange")
                .setTitle("🟠 Oyuncu Bulunamadı")
                .setDescription(`Nickinde **${search}** geçen oyuncu yok.`);
        } else {
            embed = new EmbedBuilder()
                .setColor("#000000")
                .setTitle(`🔎 Bulunan Oyuncular (${matched.length})`)
                .setDescription(
                    matched
                        .slice(0, 20)
                        .map(p => `• ${p.name} (ID: ${p.id})`)
                        .join("\n")
                )
                .setFooter({ text: "CFX üzerinden çekildi" });
        }

    } catch (err) {
        embed = new EmbedBuilder()
            .setColor("Red")
            .setTitle("🔴 Hata")
            .setDescription("CFX API'den veri alınamadı veya zaman aşımı.");
    }

    await loadingMsg.edit({ content: "", embeds: [embed] });
    return;
}




        // ================================================================
        //                      .nuke
        // ================================================================
        if (cmd === "nuke") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const channel = message.channel;
            const position = channel.position;
            const parent = channel.parent;
            const perms = channel.permissionOverwrites.cache.map(p => ({
                id: p.id,
                allow: p.allow.bitfield,
                deny: p.deny.bitfield
            }));

            const newCh = await channel.clone({ permissionOverwrites: perms });
            await newCh.setParent(parent || null);
            await newCh.setPosition(position);
            await channel.delete().catch(() => {});

            newCh.send("💣 **Kanal başarıyla nuke edildi!**").catch(() => {});
            return;
        }
// GUARD PANEL
if (cmd === "guardpanel") {
    const embed = new EmbedBuilder()
        .setColor("#000000")
        .setTitle("🛡 Guard Panel")
        .addFields(
            { name: "Ban Limiti", value: `${guardSettings.banLimit}` },
            { name: "Kick Limiti", value: `${guardSettings.kickLimit}` },
            { name: "Kanal Silme", value: `${guardSettings.channelDeleteLimit}` },
            { name: "Rol Silme", value: `${guardSettings.roleDeleteLimit}` },
            { name: "Whitelist", value: `${guardWhitelist.size} kişi` }
        );

    return message.channel.send({ embeds: [embed] });
}

        // ================================================================
        //                      YETKİ KOMUTLARI
        // ================================================================
        if (cmd === "yetkiekle") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return message.reply("❌ Sadece admin ekleyebilir.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.yetkiekle @rol`");

            botStaffRoles.add(role.id);
            return void message.reply(`🛡 ${role} artık bot yetkilisi.`);
        }

        if (cmd === "yetkicikar") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return message.reply("❌ Sadece admin kaldırabilir.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.yetkicikar @rol`");

            botStaffRoles.delete(role.id);
            return void message.reply(`🛡 ${role} artık bot yetkilisi değil.`);
        }

        if (cmd === "yetkiler") {
            if (botStaffRoles.size === 0)
                return message.reply("🛡 Hiç yetkili rol yok.");

            return void message.reply(
                "🛡 Yetkili Roller:\n" +
                [...botStaffRoles].map(id => `<@&${id}>`).join("\n")
            );
        }

        // ================================================================
        //                      DM GÖNDER (rol)
        // ================================================================
        if (cmd === "dm") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.dm @rol mesaj`");

            args.shift();
            const text = args.join(" ");
            if (!text) return message.reply("❌ Mesaj girilmedi.");

            const members = await guild.members.fetch();
            const targets = members.filter(m => m.roles.cache.has(role.id) && !m.user.bot);

            const embed = new EmbedBuilder()
                .setColor("#000000")
                .setDescription("```" + text + "```") // kutu içinde
                .setFooter({ text: `Gönderen: ${message.author.tag}` });

            let ok = 0, fail = 0;

            for (const member of targets.values()) {
                try {
                    await member.send({ embeds: [embed] });
                    ok++;
                } catch {
                    fail++;
                }
            }

            return void message.reply(
                `✉️ DM Gönderildi → Başarılı: ${ok}, Başarısız (DM Kapalı): ${fail}`
            );
        }

        // ================================================================
        //                BAŞVURU PANELİ KUR (.basvurupanel)
        // ================================================================
        if (cmd === "basvurupanel") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.basvurupanel @rol`");

            const embed = new EmbedBuilder()
                .setTitle("impêrion Başvuru")
                .setColor("#000000")
                .setDescription("Aşağıdaki butona tıklayarak başvuru açabilirsiniz.");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`apply_create:${role.id}`)
                    .setLabel("Başvur")
                    .setStyle(ButtonStyle.Success)
            );

            await message.channel.send({ embeds: [embed], components: [row] });
            return;
        }

 // ===================================================================
//                           ŞAKA PATLATMA (.patlat)
// ===================================================================
if (cmd === "patlat") {
    const embed1 = new EmbedBuilder()
        .setColor("#000000")
        .setTitle("💣 Sunucu Patlatma Başlatılıyor...")
        .setDescription("Hazırlanıyor...");

    const msg = await message.channel.send({ embeds: [embed1] });

    setTimeout(async () => {
        const embed2 = new EmbedBuilder()
            .setColor("#000000")
            .setTitle("💣 Sunucu Patlatma")
            .setDescription("**3**");

        await msg.edit({ embeds: [embed2] });
    }, 1000);

    setTimeout(async () => {
        const embed3 = new EmbedBuilder()
            .setColor("#000000")
            .setTitle("💣 Sunucu Patlatma")
            .setDescription("**2**");

        await msg.edit({ embeds: [embed3] });
    }, 2000);

    setTimeout(async () => {
        const embed4 = new EmbedBuilder()
            .setColor("#000000")
            .setTitle("💣 Sunucu Patlatma")
            .setDescription("**1**");

        await msg.edit({ embeds: [embed4] });
    }, 3000);

    setTimeout(async () => {
        const embed5 = new EmbedBuilder()
    .setColor("#000000")
    .setTitle("💥 PATLAMA GERÇEKLEŞTİ 💥")
    .setDescription(`**Allah başarıyla patlatıldı!**\n\n> *Şaka yaptım yarram 🤣*`);

        await msg.edit({ embeds: [embed5] });
    }, 4000);
}

        // ================================================================
        //                       FORCEBAN SISTEMI
        // ================================================================
        if (cmd === "forceban") {
            if (!isOwner)
                return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir.");

            let targetId = message.mentions.users.first()?.id || args.shift();
            if (!targetId) return message.reply("Kullanım: `.forceban @kullanıcı/id sebep`");

            const reason = args.join(" ") || "Forceban";

            forceBannedUsers.add(targetId);

            try {
                await guild.bans.create(targetId, { reason });
                return message.reply(`🚫 Forceban uygulandı → ${targetId}`);
            } catch {
                return message.reply("❌ Ban atılamadı. ID doğru mu?");
            }
        }

        if (cmd === "unforceban") {
            if (!isOwner)
                return message.reply("❌ Bu komutu sadece bot sahibi açabilir.");

            let targetId = message.mentions.users.first()?.id || args.shift();
            if (!targetId) return message.reply("Kullanım: `.unforceban @kullanıcı/id`");

            forceBannedUsers.delete(targetId);

            try { await guild.bans.remove(targetId); } catch {}

            return void message.reply(`✔ Unforceban → ${targetId}`);
        }

        // ================================================================
        //                         ETKİNLİK SİSTEMİ
        // ================================================================
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

            return void message.reply(`✔ Etkinlik başarıyla başladı: ${channel}`);
        }

        if (cmd === "etkinlik-bitir") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const active = findActiveEtkinlikInChannel(message.channel.id);
            if (!active)
                return message.reply("❌ Bu kanalda açık etkinlik yok.");

            const { msgId, data } = active;
            const msg = await message.channel.messages.fetch(msgId).catch(() => null);
            if (!msg) return message.reply("❌ Etkinlik mesajı bulunamadı!");

            data.closed = true;

            const r = msg.reactions.resolve("✔️");
            if (r) r.remove().catch(() => {});

            await updateEtkinlikMessage(msg, data);

            return;
        }

        if (cmd === "etkinlikekle") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const active = findActiveEtkinlikInChannel(message.channel.id);
            if (!active) return message.reply("❌ Bu kanalda açık etkinlik yok.");

            const user = message.mentions.users.first();
            if (!user) return message.reply("Kullanım: `.etkinlikekle @kullanıcı`");

            const { msgId, data } = active;
            data.participants.add(user.id);

            const msg = await message.channel.messages.fetch(msgId).catch(() => null);
            if (msg) await updateEtkinlikMessage(msg, data);

            return;
        }

        if (cmd === "etkinlikçıkar" || cmd === "etkinlikcikar") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const active = findActiveEtkinlikInChannel(message.channel.id);
            if (!active) return message.reply("❌ Bu kanalda açık etkinlik yok.");

            const user = message.mentions.users.first();
            if (!user) return message.reply("Kullanım: `.etkinlikçıkar @kullanıcı`");

            const { msgId, data } = active;
            data.participants.delete(user.id);

            const msg = await message.channel.messages.fetch(msgId).catch(() => null);
            if (msg) await updateEtkinlikMessage(msg, data);

            return;
        }

    } catch (err) {
        console.error("Prefix komut hatası:", err);
    }
});

// ===================================================================
//              BAŞVURU BUTTON SİSTEMİ (Başvuru Aç / Kapat)
// ===================================================================
client.on("interactionCreate", async (interaction) => {
    try {
        if (!interaction.isButton()) return;

        // BAŞVURU AÇ
        if (interaction.customId.startsWith("apply_create:")) {
            await interaction.deferReply({ ephemeral: true });

            const staffRoleId = interaction.customId.split(":")[1];
            const guild = interaction.guild;

            const baseName = `basvuru-${interaction.user.username}`
                .toLowerCase()
                .replace(/[^a-z0-9\-]/g, "")
                .slice(0, 20);

            const ticketChannel = await guild.channels.create({
                name: `${baseName}-${interaction.user.id.slice(-4)}`,
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
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    },
                    {
                        id: staffRoleId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    }
                ]
            });

             await ticketChannel.send({
    content: `<@${interaction.user.id}> | <@&${staffRoleId}>`,
    embeds: [
        new EmbedBuilder()
            .setTitle("📨 Başvuru Kanalı Açıldı")
            .setDescription("Başvuru kanalındaki formu doldurup eksiksiz bir şekilde atınız.")
            .setColor("#000000")
    ],
    components: [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`apply_close:${staffRoleId}:${interaction.user.id}`)
                .setLabel("Başvuruyu Kapat")
                .setStyle(ButtonStyle.Danger)
        )
    ]
});

return interaction.editReply(`✔ Başvuru kanalın açıldı: ${ticketChannel}`);

} // buton apply_create kapanış

    } catch (err) {
        console.error("interactionCreate error:", err);
    }
}); // ← BU BOTTA YOKTU, EKLEMEN LAZIM !!!


// ===================================================================
//              ETKİNLİK REAKSİYON SİSTEMİ (✔️ ile kayıt)
// ===================================================================
client.on("messageReactionAdd", async (reaction, user) => {
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

        // Kapandıysa kimse katılamaz
        if (data.closed) {
            reaction.users.remove(user.id).catch(() => {});
            return;
        }

        // Zaten listede ise tekrar ekleme
        if (data.participants.has(user.id)) return;

        // Limit dolmuşsa alma
        if (data.participants.size >= data.max) {
            reaction.users.remove(user.id).catch(() => {});
            return;
        }

        data.participants.add(user.id);

        // Limit dolduysa oto kapanır
        if (data.participants.size >= data.max) {
            data.closed = true;

            const r = msg.reactions.resolve("✔️");
            if (r) r.remove().catch(() => {});
        }

        updateEtkinlikMessage(msg, data);
    } catch (err) {
        console.error("messageReactionAdd error:", err);
    }
});

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
        if (data.closed) return; // Kapandıysa listeden düşme yok

        if (data.participants.has(user.id)) {
            data.participants.delete(user.id);
            updateEtkinlikMessage(msg, data);
        }
    } catch (err) {
        console.error("messageReactionRemove error:", err);
    }
});

// ===================================================================
//                      FORCEBAN KORUMA
// ===================================================================
client.on("guildBanRemove", async (ban) => {
    try {
        const userId = ban.user.id;
        if (!forceBannedUsers.has(userId)) return;

        await ban.guild.bans.create(userId, {
            reason: "Forceban koruması: tekrar yasaklandı."
        });

        console.log(`Forceban koruması → ${userId} tekrar banlandı.`);
    } catch (err) {
        console.error("guildBanRemove error:", err);
    }
});


// ===================================================================
//                OTOMATİK BIO KONTROL (userUpdate)
// ===================================================================
client.on("userUpdate", async (oldUser, newUser) => {
    try {
        const oldBio = oldUser.bio || "";
        const newBio = newUser.bio || "";

        if (oldBio === newBio) return;

        const required = ["discord.gg/imperionmd", "imperionmd", "/imperionmd"];
        const valid = required.some(t => newBio.toLowerCase().includes(t));

        if (valid) return;

        for (const guild of client.guilds.cache.values()) {
            const member = guild.members.cache.get(newUser.id);
            if (!member) continue;

            if (member.permissions.has(PermissionsBitField.Flags.Administrator)) continue;
            if (member.roles.cache.some(r => botStaffRoles.has(r.id))) continue;
            if (member.roles.cache.some(r => bioIgnoreRoles.has(r.id))) continue;

            if (bioKontrolChannel) {
                const ch = guild.channels.cache.get(bioKontrolChannel);
                if (ch) {
                    ch.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("⚠️ BIO TAG EKSİK (Otomatik Kontrol)")
                                .setDescription(`${member} bio’sunda zorunlu tag yok.`)
                                .addFields(
                                    { name: "Bio:", value: `\`\`\`${newBio || "Boş"}\`\`\`` }
                                )
                                .setTimestamp()
                        ]
                    }).catch(() => {});
                }
            }

            try {
                await member.send(
                    "⚠️ **impêrion Bio Kontrol**\n" +
                    "Bio’nuzda gerekli tag bulunamadı. Ekleyiniz:\n" +
                    "`discord.gg/imperionmd`\n`imperionmd`\n`/imperionmd`"
                );
            } catch {}
        }

    } catch (err) {
        console.error("userUpdate bio error:", err);
    }
});

client.on("channelDelete", async (channel) => {
    try {
        if (!channel.guild) return;
        if (guardSettings.channelDeleteLimit <= 0) return;

        const logs = await channel.guild.fetchAuditLogs({
            type: 12,
            limit: 1
        });

        const entry = logs.entries.first();
        if (!entry) return;

        const executor = entry.executor;
        if (!executor) return;
        if (isGuardWhitelisted(executor.id)) return;

        const data = guardActions.get(executor.id) || {
            ban: 0,
            kick: 0,
            channel: 0,
            role: 0
        };

        data.channel++;
        guardActions.set(executor.id, data);

        if (data.channel > guardSettings.channelDeleteLimit) {
            await channel.guild.members.ban(executor.id, {
                reason: "Kanal silme guard limiti aşıldı"
            });

            guardActions.delete(executor.id);
        }
    } catch (err) {
        console.error("Channel delete guard error:", err);
    }
});

client.on("guildBanAdd", async (ban) => {
    try {
        const logs = await ban.guild.fetchAuditLogs({
            type: 22,
            limit: 1
        });

        const entry = logs.entries.first();
        if (!entry) return;

        const executor = entry.executor;
        if (!executor) return;
        if (isGuardWhitelisted(executor.id)) return;
        if (guardSettings.banLimit <= 0) return;

        const data = guardActions.get(executor.id) || { ban: 0, kick: 0 };
        data.ban++;
        guardActions.set(executor.id, data);

        if (data.ban > guardSettings.banLimit) {
            await ban.guild.members.ban(executor.id, {
                reason: "Ban guard limit aşıldı"
            });

            guardActions.delete(executor.id);
        }
    } catch (err) {
        console.error("Ban guard error:", err);
    }
});
client.on("guildMemberRemove", async (member) => {
    try {
        const logs = await member.guild.fetchAuditLogs({
            type: 20,
            limit: 1
        });

        const entry = logs.entries.first();
        if (!entry) return;

        const executor = entry.executor;
        if (!executor) return;
        if (isGuardWhitelisted(executor.id)) return;
        if (guardSettings.kickLimit <= 0) return;

        const data = guardActions.get(executor.id) || { ban: 0, kick: 0 };
        data.kick++;
        guardActions.set(executor.id, data);

        if (data.kick > guardSettings.kickLimit) {
            await member.guild.members.ban(executor.id, {
                reason: "Kick guard limit aşıldı"
            });

            guardActions.delete(executor.id);
        }
    } catch (err) {
        console.error("Kick guard error:", err);
    }
});
client.on("roleDelete", async (role) => {
    try {
        if (!role.guild) return;
        if (guardSettings.roleDeleteLimit <= 0) return;

        const logs = await role.guild.fetchAuditLogs({
            type: 32,
            limit: 1
        });

        const entry = logs.entries.first();
        if (!entry) return;

        const executor = entry.executor;
        if (!executor) return;
        if (isGuardWhitelisted(executor.id)) return;

        const data = guardActions.get(executor.id) || {
            ban: 0,
            kick: 0,
            channel: 0,
            role: 0
        };

        data.role++;
        guardActions.set(executor.id, data);

        if (data.role > guardSettings.roleDeleteLimit) {
            await role.guild.members.ban(executor.id, {
                reason: "Rol silme guard limiti aşıldı"
            });

            guardActions.delete(executor.id);
        }
    } catch (err) {
        console.error("Role delete guard error:", err);
    }
});
client.on("guildMemberAdd", member => {
    const embed = new EmbedBuilder()
        .setColor("Green")
        .setTitle("➕ Sunucuya Giriş")
        .setDescription(`${member.user.tag} (${member.id})`)
        .setTimestamp();

    sendGuardLog(member.guild, embed);
});

client.on("guildMemberRemove", member => {
    const embed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("➖ Sunucudan Çıkış")
        .setDescription(`${member.user.tag} (${member.id})`)
        .setTimestamp();

    sendGuardLog(member.guild, embed);
});
client.on("messageDelete", async message => {
    if (!message.guild || !message.author) return;

    const logs = await message.guild.fetchAuditLogs({
        type: 72,
        limit: 1
    }).catch(() => null);

    const entry = logs?.entries.first();
    const deleter = entry?.executor;

    const embed = new EmbedBuilder()
        .setColor("Orange")
        .setTitle("🗑️ Mesaj Silindi")
        .addFields(
            { name: "Yazan", value: `${message.author.tag}` },
            { name: "Silen", value: deleter ? deleter.tag : "Bilinmiyor" },
            { name: "Kanal", value: `${message.channel}` },
            { name: "Mesaj", value: `\`\`\`${message.content || "Boş / Embed"}\`\`\`` }
        )
        .setTimestamp();

    sendGuardLog(message.guild, embed);
});
client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const oldRoles = oldMember.roles.cache;
    const newRoles = newMember.roles.cache;

    const added = newRoles.filter(r => !oldRoles.has(r.id));
    const removed = oldRoles.filter(r => !newRoles.has(r.id));

    if (!added.size && !removed.size) return;

    const logs = await newMember.guild.fetchAuditLogs({
        type: 25,
        limit: 1
    }).catch(() => null);

    const entry = logs?.entries.first();
    const executor = entry?.executor;

    if (added.size) {
        const embed = new EmbedBuilder()
            .setColor("Green")
            .setTitle("➕ Rol Verildi")
            .addFields(
                { name: "Kullanıcı", value: newMember.user.tag },
                { name: "Rol", value: added.map(r => r.name).join(", ") },
                { name: "Yetkili", value: executor ? executor.tag : "Bilinmiyor" }
            )
            .setTimestamp();

        sendGuardLog(newMember.guild, embed);
    }

   if (removed.size) {
    const embed = new EmbedBuilder()
        .setColor("Red")
        .setTitle("➖ Rol Alındı")
        .addFields(
            { name: "Kullanıcı", value: newMember.user.tag },
            { name: "Rol", value: removed.map(r => r.name).join(", ") }
        )
        .setTimestamp();

    sendGuardLog(newMember.guild, embed);
}

if (!oldMember.isCommunicationDisabled() && newMember.isCommunicationDisabled()) {
    const embed = new EmbedBuilder()
        .setColor("DarkRed")
        .setTitle("🔇 Mute Atıldı")
        .setDescription(`${newMember.user.tag} susturuldu`)
        .setTimestamp();

    sendGuardLog(newMember.guild, embed);
}

});

// ===================================================================
//                         BOT LOGIN
// ===================================================================
client.login(TOKEN);
































