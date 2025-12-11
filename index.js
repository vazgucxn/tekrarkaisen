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
    console.log(`🔵 Bot aktif: ${client.user.tag}`);

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
                            "Lütfen ekleyin."
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
            .setDescription("**Sunucu başarıyla patlatıldı!**\n\n> *Şaka yaptım 😎 hiçbir şey olmadı.*");

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

// ===================================================================
//                         BOT LOGIN
// ===================================================================
client.login(TOKEN);













