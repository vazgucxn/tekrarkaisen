// ===================== Kaisen Özel Discord Botu (Prefix + Guard + Bio) =====================
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

// ----------- Prefix & Owner Ayarları -----------
const PREFIX = ".";
const FORCE_BAN_OWNER = "827905938923978823"; // Forceban sahibi

// ----------- Express Keep-Alive (Render için) -----------
const app = express();
app.get("/", (_req, res) => res.send("Kaisen bot aktif!"));
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
const otobanEvents = new Map();      // otoban verisi
const forceBannedUsers = new Set();  // forceban kayıtları
const botStaffRoles = new Set();     // ek yetkili roller
let bioKontrolChannel = null;        // bio uyarı kanalı (tek sunucu)
let bioIgnoreRoles = new Set();      // bio kontrol dışı roller

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

// --- Aktif Otoban Bul ---
function findActiveOtobanInChannel(channelId) {
    for (const [msgId, data] of otobanEvents.entries()) {
        if (data.channelId === channelId && !data.closed)
            return { msgId, data };
    }
    return null;
}

// --- Otoban Mesaj Güncelle ---
async function updateOtobanMessage(message, data) {
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
            .setTitle("🎟️ OTOBAN / ETKİNLİK")
            .setDescription(data.title)
            .addFields(
                { name: "Kişi Sınırı", value: `${data.max}` },
                { name: "Durum", value: "Kayıtlar açık" },
                { name: "Liste", value: embedList }
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
    console.log(`🔵 Bot aktif: ${client.user.tag}`);

    client.user.setPresence({
        activities: [
            {
                name: "vazgucxn ❤ Kaisen",
                type: ActivityType.Streaming,
                url: "https://twitch.tv/discord"
            }
        ],
        status: "online"
    });
});

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

// Reklam kontrol eventi
client.on("messageCreate", checkAd);

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

client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();

    // ================================================================
    //                     BACKUP GERİ YÜKLE — .startbackup
    // ================================================================
    if (cmd === "startbackup") {
    if (message.author.id !== FORCE_BAN_OWNER)
        return message.reply("❌ Bu komutu sadece sunucu sahibi kullanabilir.");

    const fs = require("fs");
    const path = require("path");
    const zlib = require("zlib");

    const zipFilePath = path.join(__dirname, "server_backup.zip");
    const jsonPath = path.join(__dirname, "server_backup.json");

    if (!fs.existsSync(zipFilePath))
        return message.reply("❌ Yedek ZIP dosyası bulunamadı!");

    await message.reply("⚠️ Sunucu yedeğe göre yeniden oluşturulacak. `onayla` yaz.");

    const filter = m => m.author.id === message.author.id;
    const collected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 20000
    }).catch(() => null);

    if (!collected || collected.first().content.toLowerCase() !== "onayla")
        return message.reply("❌ İşlem iptal edildi.");

    await message.channel.send("🧹 Kanallar temizleniyor...");

    // ✔ SUNUCU TEMİZLEME KISMI BURADA async İÇİNDE!
    const guild = message.guild;

    // --- TÜM KANALLARI SİL ---
    for (const ch of guild.channels.cache.values()) {
        try {
            await ch.delete("Backup Restore"); // ← Artık async içinde olduğu için hata yok
        } catch {}
    }

    await message.channel.send("📁 Yedek yükleniyor...");

    // ZIP → JSON
    try {
        const zipData = fs.readFileSync(zipFilePath);
        const jsonData = zlib.gunzipSync(zipData);
        fs.writeFileSync(jsonPath, jsonData);

        const backup = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

        // --- Buraya yedeğe göre yeni kanallar / roller oluşturma gelecek ---

        await message.channel.send("✅ Backup başarıyla yüklendi!");

    } catch (err) {
        console.error(err);
        return message.reply("❌ Backup yüklenirken hata oluştu!");
    }
}


        // ====================================================
        //                     SUNUCU TEMİZLE
        // ====================================================
        // Kanallar sil
        for (const ch of message.guild.channels.cache.values()) {
            try { await ch.delete("Backup Restore"); } catch {}
        }

        // Roller sil (EN ÜST ROL → EN ALT ROL olarak silinir)
        const sortedRoles = message.guild.roles.cache
            .filter(r => r.id !== message.guild.id)
            .sort((a, b) => b.position - a.position);

        for (const role of sortedRoles.values()) {
            try { await role.delete("Backup Restore"); } catch {}
        }

        await message.channel.send("📦 Roller & Kanallar silindi. Yeniden oluşturuluyor...");

        // ====================================================
        //                    ROLLERİ YENİ OLUŞTUR
        // ====================================================
        const createdRoles = {};

        for (const r of backup.roles) {
            try {
                const newRole = await message.guild.roles.create({
                    name: r.name,
                    color: r.color,
                    hoist: r.hoist,
                    mentionable: r.mentionable,
                    permissions: BigInt(r.permissions),
                    reason: "Backup Restore"
                });

                createdRoles[r.id] = newRole.id;

                await new Promise(res => setTimeout(res, 300)); // rate limit koruması

            } catch (err) {
                console.error("ROL OLUŞTURMA HATASI:", err);
            }
        }

        await message.channel.send("📌 Roller oluşturuldu. Kanallar oluşturuluyor...");

        // ====================================================
        //                KANALLARI YENİ OLUŞTUR
        // ====================================================
        const createdChannels = {};

        // İlk kategoriler
        for (const ch of backup.channels.filter(c => c.type === 4)) {
            try {
                const newCat = await message.guild.channels.create({
                    name: ch.name,
                    type: 4,
                    position: ch.position
                });

                createdChannels[ch.id] = newCat.id;
            } catch {}
        }

        // Normal kanallar
        for (const ch of backup.channels.filter(c => c.type !== 4)) {
            try {
                const parent = ch.parent ? createdChannels[ch.parent] : null;

                const newCh = await message.guild.channels.create({
                    name: ch.name,
                    type: ch.type,
                    nsfw: ch.nsfw,
                    topic: ch.topic,
                    rateLimitPerUser: ch.rateLimit,
                    parent: parent || undefined,
                    position: ch.position
                });

                createdChannels[ch.id] = newCh.id;

            } catch (err) {
                console.error("KANAL OLUŞTURMA HATASI:", err);
            }
        }

        await message.channel.send("🔐 Kanal izinleri uygulanıyor...");

        // ====================================================
        //                PERMISSION OVERWRITES
        // ====================================================
        for (const oldCh of backup.channels) {
            const newChId = createdChannels[oldCh.id];
            if (!newChId) continue;

            const newCh = message.guild.channels.cache.get(newChId);
            if (!newCh) continue;

            for (const perm of oldCh.permissionOverwrites) {
                const targetId = createdRoles[perm.id] || perm.id;

                try {
                    await newCh.permissionOverwrites.create(targetId, {
                        allow: BigInt(perm.allow),
                        deny: BigInt(perm.deny)
                    });
                } catch {}
            }

            await new Promise(res => setTimeout(res, 150));
        }

        await message.channel.send("🎉 **Backup tamamlandı! Sunucu başarıyla geri yüklendi.**");

    } catch (err) {
        console.error("RESTORE ERROR:", err);
        return message.channel.send("❌ Restore sırasında hata oluştu!");
    }
}

// ================================================================
//                       BACKUP OLUŞTUR (ZIP) — .backup
// ================================================================
if (cmd === "backup") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    const msg = await message.reply("⏳ Sunucu yedekleniyor, lütfen bekleyin...");

    const guild = message.guild;
    const fs = require("fs");
    const path = require("path");
    const zlib = require("zlib");

    try {
        // ============= ROLLERİ YEDEKLE =============
        const rolesBackup = guild.roles.cache
            .filter(r => r.id !== guild.id)
            .sort((a, b) => b.position - a.position)
            .map(r => ({
                id: r.id,
                name: r.name,
                color: r.color,
                hoist: r.hoist,
                position: r.position,
                permissions: r.permissions.bitfield,
                mentionable: r.mentionable
            }));

        // ============= KANAL + PERM YEDEĞİ =============
        const channelsBackup = [];

        const sorted = guild.channels.cache.sort((a, b) => a.rawPosition - b.rawPosition);

        sorted.forEach(ch => {
            const base = {
                id: ch.id,
                name: ch.name,
                type: ch.type,
                parent: ch.parent?.id || null,
                position: ch.rawPosition,
                nsfw: ch.nsfw || false,
                topic: ch.topic || null,
                rateLimit: ch.rateLimitPerUser || 0,
                permissionOverwrites: []
            };

            ch.permissionOverwrites.cache.forEach(ow => {
                base.permissionOverwrites.push({
                    id: ow.id,
                    allow: ow.allow.bitfield,
                    deny: ow.deny.bitfield,
                    type: ow.type
                });
            });

            channelsBackup.push(base);
        });

        // ============= YEDEK JSON DOSYASI =============
        const backupData = {
            server: {
                id: guild.id,
                name: guild.name,
                created: guild.createdTimestamp,
                icon: guild.iconURL({ dynamic: true })
            },
            roles: rolesBackup,
            channels: channelsBackup,
            time: Date.now()
        };

        const json = JSON.stringify(backupData, null, 2);

        // Geçici JSON dosyası
        const tempJson = path.join(__dirname, "server_backup.json");
        fs.writeFileSync(tempJson, json);

        // ============= ZIP OLUŞTUR =============
        const zipPath = path.join(__dirname, "server_backup.zip");
        const zip = zlib.gzipSync(fs.readFileSync(tempJson));

        fs.writeFileSync(zipPath, zip);

        // JSON dosyasını gereksiz olduğu için sil
        fs.unlinkSync(tempJson);

        // ============= DM İLE GÖNDER =============
        try {
            await message.author.send({
                content: "📦 **Sunucu Yedeği Hazır (ZIP Formatında)!**",
                files: [zipPath]
            });

            await msg.edit("✔ Yedek başarıyla oluşturuldu ve **DM'den ZIP olarak gönderildi!**");

        } catch (dmErr) {
            await msg.edit("⚠️ DM kapalı! ZIP dosyası buraya gönderiliyor...");

            try {
                await message.channel.send({
                    content: "📦 Yedek ZIP dosyan:",
                    files: [zipPath]
                });
            } catch {
                return msg.edit("❌ ZIP dosyası gönderilemedi! (Dosya çok büyük olabilir)");
            }
        }

        // ZIP dosyasını sil
        fs.unlinkSync(zipPath);

    } catch (err) {
        console.error("BACKUP ERROR:", err);
        return msg.edit("❌ Backup alınırken hata oluştu!");
    }
}

// ================================================================
//                       BACKUP OLUŞTUR (.backup)
// ================================================================
if (cmd === "backup") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Yetkin yok.");

    message.reply("⏳ Sunucu yedekleniyor, lütfen bekleyin...");

    const guild = message.guild;

    // ============= ROLLERİ YEDEKLE =============
    const rolesBackup = guild.roles.cache
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map(r => ({
            id: r.id,
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            position: r.position,
            permissions: r.permissions.bitfield,
            mentionable: r.mentionable
        }));

    // ============= KATEGORİ + KANAL YEDEĞİ =============
    const channelsBackup = [];

    const sorted = guild.channels.cache.sort((a, b) => a.rawPosition - b.rawPosition);

    sorted.forEach(ch => {
        const base = {
            id: ch.id,
            name: ch.name,
            type: ch.type,
            parent: ch.parent?.id || null,
            position: ch.rawPosition,
            nsfw: ch.nsfw || false,
            topic: ch.topic || null,
            rateLimit: ch.rateLimitPerUser || 0,
            permissionOverwrites: []
        };

        ch.permissionOverwrites.cache.forEach(ow => {
            base.permissionOverwrites.push({
                id: ow.id,
                allow: ow.allow.bitfield,
                deny: ow.deny.bitfield,
                type: ow.type
            });
        });

        channelsBackup.push(base);
    });

    // ============= YEDEK DOSYASI =============
    const backupData = {
        server: {
            id: guild.id,
            name: guild.name,
            created: guild.createdTimestamp,
            icon: guild.iconURL({ dynamic: true })
        },
        roles: rolesBackup,
        channels: channelsBackup,
        time: Date.now()
    };

    // JSON’a çevir
    const json = JSON.stringify(backupData, null, 2);

    // Geçici dosya yolunu belirle
    const fs = require("fs");
    const path = require("path");
    const tempPath = path.join(__dirname, "server_backup.json");

    fs.writeFileSync(tempPath, json);

    // DM olarak gönder
    try {
        await message.author.send({
            content: "📦 **Sunucu Yedeği Hazır!**\n`server_backup.json` dosyan aşağıdadır:",
            files: [tempPath]
        });

        message.channel.send("✔ **Yedek başarıyla oluşturuldu ve DM’den gönderildi!**");

        // Dosyayı sil
        fs.unlinkSync(tempPath);

    } catch (err) {
        console.error(err);
        message.reply("❌ DM kapalı olduğu için yedek gönderilemedi!");
    }
}

// ===================================================================
//                       PREFIX KOMUTLARI (TEK EVENT)
// ===================================================================
client.on("messageCreate", async (message) => {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        // Çift işlem engelleme
        if (message._executed) return;
        message._executed = true;

        const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
        const cmd = args.shift()?.toLowerCase();

        // ================================================================
        //                     YARDIM MENÜSÜ
        // ================================================================
        if (cmd === "yardım" || cmd === "yardim") {
            const embed = new EmbedBuilder()
                .setTitle("🛠 Kaisen Bot Yardım Menüsü")
                .setColor("#000000")
                .addFields(
                    {
                        name: "🎟 OTOBAN Sistem",
                        value:
                            "`" +
                            ".otoban #kanal limit açıklama\n" +
                            ".otoban-bitir\n" +
                            ".otobanekle @kullanıcı\n" +
                            ".otobançıkar @kullanıcı" +
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
                        name: "🛡 Yetki Sistemi",
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
                    }
                )
                .setFooter({ text: "vazgucxn ❤ Kaisen" });

            return message.channel.send({ embeds: [embed] });
        }

        // ================================================================
        //                   BIO KONTROL KANALI AYARI
        // ================================================================
        if (cmd === "bio-kontrol") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const ch = message.mentions.channels.first();
            if (!ch) return message.reply("Kullanım: `.bio-kontrol #kanal`");

            bioKontrolChannel = ch.id;

            return message.reply(`✅ Bio kontrol uyarı kanalı ayarlandı: ${ch}`);
        }

        // ================================================================
        //                BIO KONTROL MUAF ROL AYARI
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
        //                TEK KİŞİYİ BIO KONTROL (bio-tara)
        // ================================================================
        if (cmd === "bio-tara") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const user = message.mentions.users.first();
            if (!user) return message.reply("Kullanım: `.bio-tara @kullanıcı`");

            const member = message.guild.members.cache.get(user.id);
            if (!member) return message.reply("❌ Kullanıcı sunucuda değil.");

            const bio = user.bio || "";
            const required = ["discord.gg/kaisenst", "kaisenst", "/kaisenst"];

            // Muaf rol kontrolü
            if (member.roles.cache.some(r => bioIgnoreRoles.has(r.id)))
                return message.reply("ℹ️ Bu kullanıcı bio kontrolünden muaftır.");

            const isValid = required.some(tag =>
                bio.toLowerCase().includes(tag)
            );

            if (isValid)
                return message.reply(`✅ ${user} bio kontrolünden geçti.`);

            // Kanal uyarısı
            if (bioKontrolChannel) {
                const ch = message.guild.channels.cache.get(bioKontrolChannel);
                if (ch) {
                    ch.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("⚠️ Bio Tag Eksik!")
                                .setDescription(`${user} bio’sunda tag bulunamadı!`)
                                .addFields(
                                    { name: "Bio:", value: bio || "Boş" }
                                )
                        ]
                    });
                }
            }

            // DM uyarısı
            try {
                await user.send(
                    "⚠️ **Bio kontrol uyarısı:** Bio’nuzda Kaisen tagleri bulunmuyor!\n" +
                    "Ekleyiniz: `discord.gg/kaisenst`, `kaisenst` veya `/kaisenst`"
                );
            } catch {}

            return message.reply(`⚠️ ${user} için bio uyarıları gönderildi.`);
        }

        // ================================================================
        //              ROLDEKİ HERKESİ BIO TARAMA (.kontrol)
        // ================================================================
        if (cmd === "kontrol") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.kontrol @rol`");

            const required = ["discord.gg/kaisenst", "kaisenst", "/kaisenst"];

            let total = 0, passed = 0, failed = 0, dmClosed = 0;

            const logCh = bioKontrolChannel
                ? message.guild.channels.cache.get(bioKontrolChannel)
                : null;

            for (const member of role.members.values()) {
                const user = member.user;
                const bio = user.bio || "";

                // Admin, yetkili, muaf roller → atla
                if (
                    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    member.roles.cache.some(r => botStaffRoles.has(r.id)) ||
                    member.roles.cache.some(r => bioIgnoreRoles.has(r.id))
                ) continue;

                total++;

                const ok = required.some(tag =>
                    bio.toLowerCase().includes(tag)
                );

                if (ok) {
                    passed++;
                    continue;
                }

                failed++;

                // Kanal uyarısı
                if (logCh) {
                    logCh.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("⚠️ Bio Eksik (Toplu Kontrol)")
                                .setDescription(`${member} bio’sunda tag yok!`)
                                .addFields(
                                    { name: "Bio:", value: bio || "Boş" }
                                )
                        ]
                    });
                }

                // DM
                try {
                    await user.send(
                        "⚠️ **Bio Kontrol**\n" +
                        "Bio’nuzda gerekli tagler bulunamadı.\n" +
                        "Ekleyiniz: `discord.gg/kaisenst`, `kaisenst` veya `/kaisenst`"
                    );
                } catch {
                    dmClosed++;
                }
            }

            return message.reply(
                `📌 **Bio Kontrol Raporu**\n` +
                `Rol: ${role}\n\n` +
                `🟩 Geçen: **${passed}**\n` +
                `🟥 Kalan: **${failed}**\n` +
                `✉️ DM Kapalı: **${dmClosed}**\n` +
                `👥 İncelenen: **${total} kişi**`
            );
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

            await message.channel.bulkDelete(amount, true);

            const msg = await message.channel.send(`🧹 **${amount} mesaj silindi.**`);
            setTimeout(() => msg.delete().catch(() => {}), 3000);
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

            newCh.send("💣 **Kanal başarıyla nuke edildi!**");
            return;
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
            return message.reply(`🛡 ${role} artık bot yetkilisi.`);
        }

        if (cmd === "yetkicikar") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return message.reply("❌ Sadece admin kaldırabilir.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.yetkicikar @rol`");

            botStaffRoles.delete(role.id);
            return message.reply(`🛡 ${role} artık bot yetkilisi değil.`);
        }

        if (cmd === "yetkiler") {
            if (botStaffRoles.size === 0)
                return message.reply("🛡 Hiç yetkili rol yok.");

            return message.reply(
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

            const members = await message.guild.members.fetch();
            const targets = members.filter(m => m.roles.cache.has(role.id) && !m.user.bot);

            const embed = new EmbedBuilder()
                .setColor("#000000")
                .setDescription(text)
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

            return message.reply(
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
                .setTitle("📨 Başvuru Paneli")
                .setColor("#000000")
                .setDescription("Aşağıdaki butona tıklayarak başvuru açabilirsiniz.");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`apply_create:${role.id}`)
                    .setLabel("Başvuru Aç")
                    .setStyle(ButtonStyle.Success)
            );

            await message.channel.send({ embeds: [embed], components: [row] });
            return message.reply("✔ Başvuru paneli oluşturuldu.");
        }

        // ================================================================
        //                       FORCEBAN SISTEMI
        // ================================================================
        if (cmd === "forceban") {
            if (message.author.id !== FORCE_BAN_OWNER)
                return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir.");

            let targetId = message.mentions.users.first()?.id || args.shift();
            if (!targetId) return message.reply("Kullanım: `.forceban @kullanıcı/id sebep`");

            const reason = args.join(" ") || "Forceban";

            forceBannedUsers.add(targetId);

            try {
                await message.guild.bans.create(targetId, { reason });
                return message.reply(`🚫 Forceban uygulandı → ${targetId}`);
            } catch {
                return message.reply("❌ Ban atılamadı. ID doğru mu?");
            }
        }

        if (cmd === "unforceban") {
            if (message.author.id !== FORCE_BAN_OWNER)
                return message.reply("❌ Bu komutu sadece bot sahibi açabilir.");

            let targetId = message.mentions.users.first()?.id || args.shift();
            if (!targetId) return message.reply("Kullanım: `.unforceban @kullanıcı/id`");

            forceBannedUsers.delete(targetId);

            try { await message.guild.bans.remove(targetId); } catch {}

            return message.reply(`✔ Unforceban → ${targetId}`);
        }

        // ================================================================
        //                         OTOBAN BAŞLAT (.otoban)
        // ================================================================
        if (cmd === "otoban") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const channel = message.mentions.channels.first();
            if (!channel) return message.reply("Kullanım: `.otoban #kanal limit açıklama`");

            args.shift();
            const limit = Number(args.shift());
            if (!limit || limit < 1) return message.reply("❌ Limit hatalı.");

            const title = args.join(" ");
            if (!title) return message.reply("❌ Açıklama gir.");

            const embed = new EmbedBuilder()
                .setTitle("🎟️ OTOBAN")
                .setColor("#000000")
                .setDescription(title)
                .addFields(
                    { name: "Limit", value: `${limit}` },
                    { name: "Durum", value: "Açık" },
                    { name: "Liste", value: "Henüz kimse yok." }
                );

            const msg = await channel.send({ embeds: [embed] });
            await msg.react("✅");

            otobanEvents.set(msg.id, {
                max: limit,
                title,
                participants: new Set(),
                closed: false,
                channelId: channel.id
            });

            return message.reply(`✔ Otoban açıldı: ${channel}`);
        }

        // ================================================================
        //                     OTOBAN BİTİR (.otoban-bitir)
        // ================================================================
        if (cmd === "otoban-bitir") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const event = findActiveOtobanInChannel(message.channel.id);
            if (!event) return message.reply("❌ Aktif otoban yok.");

            const { msgId, data } = event;
            const msg = await message.channel.messages.fetch(msgId);

            data.closed = true;

            const r = msg.reactions.resolve("✅");
            if (r) await r.remove().catch(() => {});

            await updateOtobanMessage(msg, data);

            return message.reply(`✔ Otoban kapatıldı.`);
        }

        // ================================================================
        //                OTOBAN EKLE / ÇIKAR
        // ================================================================
        if (cmd === "otobanekle") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const event = findActiveOtobanInChannel(message.channel.id);
            if (!event) return message.reply("❌ Aktif otoban yok.");

            const user = message.mentions.users.first();
            if (!user) return message.reply("Kullanım: `.otobanekle @kullanıcı`");

            const { msgId, data } = event;
            data.participants.add(user.id);

            const msg = await message.channel.messages.fetch(msgId);
            await updateOtobanMessage(msg, data);

            return message.reply(`✔ ${user} listeye eklendi.`);
        }

        if (cmd === "otobançıkar" || cmd === "otobancikar") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const event = findActiveOtobanInChannel(message.channel.id);
            if (!event) return message.reply("❌ Aktif otoban yok.");

            const user = message.mentions.users.first();
            if (!user) return message.reply("Kullanım: `.otobançıkar @kullanıcı`");

            const { msgId, data } = event;
            data.participants.delete(user.id);

            const msg = await message.channel.messages.fetch(msgId);
            await updateOtobanMessage(msg, data);

            return message.reply(`✔ ${user} listeden çıkarıldı.`);
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

        // ---------------------------------------------------------------
        //                     BAŞVURU AÇMA
        // ---------------------------------------------------------------
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
                        .setDescription("Aşağıdaki butondan başvuruyu kapatabilirsin.")
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
        }

        // ---------------------------------------------------------------
        //                     BAŞVURUYU KAPATMA
        // ---------------------------------------------------------------
        if (interaction.customId.startsWith("apply_close:")) {
            const [, staffRoleId, ownerId] = interaction.customId.split(":");

            const channel = interaction.channel;

            const isOwner = interaction.user.id === ownerId;
            const isStaff =
                interaction.member.roles.cache.has(staffRoleId) ||
                interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!isOwner && !isStaff) {
                return interaction.reply({
                    content: "❌ Bu başvuruyu kapatmaya yetkin yok.",
                    ephemeral: true
                });
            }

            await channel.permissionOverwrites.edit(ownerId, {
                ViewChannel: false,
                SendMessages: false
            }).catch(() => {});

            if (!channel.name.startsWith("closed-")) {
                await channel.setName(`closed-${channel.name}`.slice(0, 32)).catch(() => {});
            }

            await interaction.reply("🔒 Başvuru kapatıldı. Kanal kayıt için saklandı.");
        }
    } catch (err) {
        console.error("interactionCreate error:", err);
    }
});

// ===================================================================
//              OTOBAN REAKSİYON SİSTEMİ (✅ ile kayıt)
// ===================================================================
client.on("messageReactionAdd", async (reaction, user) => {
    try {
        if (user.bot) return;

        if (reaction.partial) {
            try { await reaction.fetch(); } catch { return; }
        }

        const msg = reaction.message;
        if (!msg.guild) return;
        if (reaction.emoji.name !== "✅") return;

        const data = otobanEvents.get(msg.id);
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

            const r = msg.reactions.resolve("✅");
            if (r) r.remove().catch(() => {});
        }

        updateOtobanMessage(msg, data);
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
        if (reaction.emoji.name !== "✅") return;

        const data = otobanEvents.get(msg.id);
        if (!data) return;
        if (data.closed) return; // Kapandıysa listeden düşme yok

        if (data.participants.has(user.id)) {
            data.participants.delete(user.id);
            updateOtobanMessage(msg, data);
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

        const required = ["discord.gg/kaisenst", "kaisenst", "/kaisenst"];
        const valid = required.some(t => newBio.toLowerCase().includes(t));

        if (valid) return;

        for (const guild of client.guilds.cache.values()) {
            const member = guild.members.cache.get(newUser.id);
            if (!member) continue;

            // YETKİLİLER ve İGNORE ROL → Uyarı yemeyecek
            if (member.permissions.has(PermissionsBitField.Flags.Administrator)) continue;
            if (member.roles.cache.some(r => botStaffRoles.has(r.id))) continue;
            if (member.roles.cache.some(r => bioIgnoreRoles.has(r.id))) continue;

            // Kanal bildirimi
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
                                    { name: "Bio:", value: newBio || "Boş" }
                                )
                                .setTimestamp()
                        ]
                    });
                }
            }

            // DM Bildirimi
            try {
                await member.send(
                    "⚠️ **Kaisen Sunucusu Bio Kontrol**\n" +
                    "Bio’nuzda gerekli tag bulunamadı. Ekleyiniz:\n" +
                    "`discord.gg/kaisenst`\n`kaisenst`\n`/kaisenst`"
                );
            } catch {}
        }

    } catch (err) {
        console.error("userUpdate bio error:", err);
    }
});

// ===================================================================
//                         BOT LOGIN
// ===================================================================
client.login(TOKEN);




