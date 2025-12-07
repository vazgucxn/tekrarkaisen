// ===================== Kaisen Özel Discord Botu (Prefix + Guard) =====================
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
    ActivityType,
} = require("discord.js");
const express = require("express");

// ----------- Ayarlar -----------
const PREFIX = ".";
const FORCE_BAN_OWNER = "827905938923978823"; // forceban sahibi

// ------------- Render için mini web server -------------
const app = express();
app.get("/", (_req, res) => res.send("Kaisen bot aktif!"));
app.listen(process.env.PORT || 3000, () => {
    console.log("Web sunucusu başlatıldı (Render için).");
});

// ------------- ENV -------------
const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN || TOKEN.length < 20) {
    console.error("❌ DISCORD_BOT_TOKEN Eksik veya Hatalı!");
    process.exit(1);
}

// ------------- CLIENT -------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildBans,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// GLOBAL VERİLER
const otobanEvents = new Map();      // messageId -> {max,title,participants,set,...}
const forceBannedUsers = new Set();  // userId
const botStaffRoles = new Set();     // roleId

// ---------------- YARDIMCI FONKSİYONLAR ----------------
function hasBotPermission(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
    for (const roleId of botStaffRoles) {
        if (member.roles.cache.has(roleId)) return true;
    }
    return false;
}

function findActiveOtobanInChannel(channelId) {
    let found = null;
    for (const [msgId, data] of otobanEvents.entries()) {
        if (data.channelId === channelId && !data.closed) found = { msgId, data };
    }
    return found;
}

async function updateOtobanMessage(message, data) {
    const arr = Array.from(data.participants);

    const embedList =
        arr.length === 0
            ? "Henüz kimse katılmadı."
            : arr.map((id, i) => `${i + 1}. <@${id}>`).join("\n");

    const finalList =
        arr.length === 0
            ? "Katılımcı yok."
            : arr.map((id, i) => `${i + 1}- <@${id}> ( ${id} )`).join("\n");

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

    return message
        .edit({
            embeds: [],
            content: `${data.title}\n\n**Katılımlar sona erdi. Liste:**\n${finalList}`,
        })
        .catch(() => {});
}

// ---------------- READY ----------------
client.once("ready", () => {
    console.log(`Bot aktif: ${client.user.tag}`);

    client.user.setPresence({
        activities: [
            {
                name: "vazgucxn ❤ Kaisen",
                type: ActivityType.Streaming,
                url: "https://twitch.tv/discord",
            },
        ],
        status: "online",
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
    ".net",
];

async function checkAd(message) {
    try {
        if (!message.guild || message.author.bot) return;
        const member = message.member;
        if (!member) return;

        // Yetkiliyse reklam filtresinden muaf
        if (hasBotPermission(member) || member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
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

client.on("messageCreate", checkAd);
client.on("messageUpdate", async (_oldMsg, newMsg) => {
    if (newMsg.partial) {
        try {
            newMsg = await newMsg.fetch();
        } catch {
            return;
        }
    }
    checkAd(newMsg);
});

// ===================================================================
//                       PREFIX KOMUTLAR
// ===================================================================
client.on("messageCreate", async (message) => {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        // Çift çalışmayı engelle (aynı mesaj için)
        if (message._executed) return;
        message._executed = true;

        const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
        const cmd = args.shift()?.toLowerCase();

        // ===================== BIO KONTROL KANALINI AYARLAMA =====================
if (cmd === "bio-kontrol") {
    if (!hasBotPermission(message.member))
        return message.reply("❌ Bu komut için yetkin yok.");

    const ch = message.mentions.channels.first();
    if (!ch) return message.reply("Kullanım: `.bio-kontrol #kanal`");

    bioKontrolChannel = ch.id;

    return message.reply(`✅ Bio kontrol uyarı kanalı ayarlandı: ${ch}`);
}


        // ----------------- .sil -----------------
        if (cmd === "sil") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Bu komut için yetkin yok.");

            const amount = Number(args[0]);
            if (!amount || amount < 1 || amount > 100)
                return message.reply("Kullanım: `.sil 1-100`");

            await message.channel.bulkDelete(amount, true);
            const info = await message.channel.send(`🧹 **${amount} mesaj silindi.**`);
            setTimeout(() => info.delete().catch(() => {}), 3000);
            return;
        }

        // ----------------- .nuke -----------------
        if (cmd === "nuke") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Bu komut için yetkin yok.");

            const channel = message.channel;
            const position = channel.position;
            const parent = channel.parent;
            const perms = channel.permissionOverwrites.cache.map((p) => ({
                id: p.id,
                allow: p.allow.bitfield,
                deny: p.deny.bitfield,
            }));

            const newCh = await channel.clone({ permissionOverwrites: perms });
            await newCh.setParent(parent || null);
            await newCh.setPosition(position);
            await channel.delete().catch(() => {});

            await newCh.send("💣 **Kanal başarıyla nuke edildi!**");
            return;
        }

        // ----------------- .yardım -----------------
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
                    ".nuke → Kanalı yeniden oluşturur" +
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
                name: "🚫 ForceBan Sistemi",
                value:
                    "`" +
                    ".forceban @kullanıcı/id sebep\n" +
                    ".unforceban @kullanıcı/id" +
                    "`\n(sadece <@" + FORCE_BAN_OWNER + "> kullanabilir)"
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
                name: "📝 Bio Kontrol Sistemi",
                value:
                    "`" +
                    ".bio-kontrol #kanal → Bio uyarı kanalını ayarlar" +
                    "`\nKullanıcıların bio’sunda `discord.gg/kaisenst` bulunmuyorsa DM + kanal uyarısı gönderir."
            }
        )
        .setFooter({ text: "vazgucxn ❤ Kaisen" });

    return message.channel.send({ embeds: [embed] });
}


        // ----------------- Yetki Komutları -----------------
        if (cmd === "yetkiekle") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return message.reply("❌ Sadece Administrator kullanabilir.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.yetkiekle @rol`");

            botStaffRoles.add(role.id);
            return message.reply(`🛡 ${role} artık bot yetkilisi.`);
        }

        if (cmd === "yetkicikar") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return message.reply("❌ Sadece Administrator kullanabilir.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.yetkicikar @rol`");

            botStaffRoles.delete(role.id);
            return message.reply(`🛡 ${role} bot yetkililiğinden çıkarıldı.`);
        }

        if (cmd === "yetkiler") {
            if (botStaffRoles.size === 0)
                return message.reply("🛡 Henüz bot yetkilisi rol eklenmemiş.");
            return message.reply(
                "🛡 Bot yetkili rolleri:\n" +
                    [...botStaffRoles].map((id) => `<@&${id}>`).join("\n")
            );
        }

        // ----------------- FORCEBAN -----------------
        if (cmd === "forceban") {
            if (message.author.id !== FORCE_BAN_OWNER)
                return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir.");

            let targetId = message.mentions.users.first()?.id || args.shift();
            if (!targetId)
                return message.reply("Kullanım: `.forceban @kullanıcı/id sebep`");

            const reason = args.join(" ") || "Forceban";

            try {
                forceBannedUsers.add(targetId);
                await message.guild.bans.create(targetId, { reason });
                return message.reply(`🚫 Forceban uygulandı: \`${targetId}\``);
            } catch (err) {
                console.error(err);
                return message.reply("❌ Kullanıcı banlanamadı. ID doğru mu?");
            }
        }

        if (cmd === "unforceban") {
            if (message.author.id !== FORCE_BAN_OWNER)
                return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir.");

            let targetId = message.mentions.users.first()?.id || args.shift();
            if (!targetId)
                return message.reply("Kullanım: `.unforceban @kullanıcı/id`");

            forceBannedUsers.delete(targetId);
            try {
                await message.guild.bans.remove(targetId);
            } catch {}

            return message.reply(`✅ Unforceban uygulandı: \`${targetId}\``);
        }

        // ----------------- OTOBAN -----------------
        if (cmd === "otoban") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Bu komut için bot yetkisi gerekiyor.");

            const channel = message.mentions.channels.first();
            if (!channel || channel.type !== ChannelType.GuildText)
                return message.reply("Kullanım: `.otoban #kanal limit açıklama`");

            args.shift(); // kanal arg
            const limit = Number(args.shift());
            if (!limit || limit < 1)
                return message.reply("❌ Limit sayısı hatalı.");

            const title = args.join(" ");
            if (!title) return message.reply("❌ Açıklama gir.");

            const embed = new EmbedBuilder()
                .setTitle("🎟️ OTOBAN")
                .setDescription(title)
                .setColor("#000000")
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
                channelId: channel.id,
            });

            return message.reply(`✔ OtoBan ${channel} kanalında başlatıldı.`);
        }

        if (cmd === "otoban-bitir") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const event = findActiveOtobanInChannel(message.channel.id);
            if (!event) return message.reply("Aktif otoban yok.");

            const { msgId, data } = event;
            const msg = await message.channel.messages.fetch(msgId);

            data.closed = true;
            const r = msg.reactions.resolve("✅");
            if (r) await r.remove().catch(() => {});
            await updateOtobanMessage(msg, data);

            return message.reply("✔ OtoBan kapatıldı.");
        }

        if (cmd === "otobanekle") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const event = findActiveOtobanInChannel(message.channel.id);
            if (!event) return message.reply("Aktif otoban yok.");

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
            if (!event) return message.reply("Aktif otoban yok.");

            const user = message.mentions.users.first();
            if (!user) return message.reply("Kullanım: `.otobançıkar @kullanıcı`");

            const { msgId, data } = event;
            data.participants.delete(user.id);

            const msg = await message.channel.messages.fetch(msgId);
            await updateOtobanMessage(msg, data);

            return message.reply(`✔ ${user} listeden çıkarıldı.`);
        }

        // ----------------- DM -----------------
        if (cmd === "dm") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Bu komut için yetkin yok.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.dm @rol mesaj`");

            args.shift();
            const text = args.join(" ");
            if (!text) return message.reply("❌ Mesaj gir.");

            const members = await message.guild.members.fetch();
            const targets = members.filter(
                (m) => m.roles.cache.has(role.id) && !m.user.bot
            );

            const embed = new EmbedBuilder()
                .setDescription(text)
                .setColor("#000000")
                .setFooter({
                    text: `Gönderen: ${message.author.tag} • Sunucu: ${message.guild.name}`,
                });

            let ok = 0,
                fail = 0;
            for (const m of targets.values()) {
                try {
                    await m.send({ embeds: [embed] });
                    ok++;
                } catch {
                    fail++;
                }
            }

            return message.reply(
                `✉️ DM gönderimi tamamlandı. Başarılı: ${ok} | Hata: ${fail}`
            );
        }

        // ----------------- BAŞVURU PANEL -----------------
        if (cmd === "basvurupanel") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Bu komut için yetkin yok.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.basvurupanel @YetkiliRol`");

            const embed = new EmbedBuilder()
                .setTitle("📨 Başvuru Paneli")
                .setDescription(
                    "Aşağıdaki butona tıklayarak kendine özel bir başvuru kanalı açabilirsin."
                )
                .setColor("#000000");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`apply_create:${role.id}`)
                    .setLabel("Başvuru Aç")
                    .setStyle(ButtonStyle.Success)
            );

            await message.channel.send({ embeds: [embed], components: [row] });
            return message.reply("✅ Başvuru paneli oluşturuldu.");
        }
    } catch (err) {
        console.error("messageCreate error:", err);
    }
});

// ===================================================================
//              BAŞVURU BUTTON SİSTEMİ (Başvuru Aç / Kapat)
// ===================================================================
client.on("interactionCreate", async (interaction) => {
    try {
        if (!interaction.isButton()) return;

        // Başvuru aç
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
                        deny: [PermissionsBitField.Flags.ViewChannel],
                    },
                    {
                        id: interaction.user.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                        ],
                    },
                    {
                        id: staffRoleId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                        ],
                    },
                ],
            });

            await ticketChannel.send({
                content: `<@${interaction.user.id}> | <@&${staffRoleId}>`,
                embeds: [
                    new EmbedBuilder()
                        .setTitle("📨 Başvuru Kanalı Açıldı")
                        .setDescription(
                            "Soruları cevapla, işin bitince aşağıdaki butondan kapatabilirsin."
                        )
                        .setColor("#000000"),
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(
                                `apply_close:${staffRoleId}:${interaction.user.id}`
                            )
                            .setLabel("Başvuruyu Kapat")
                            .setStyle(ButtonStyle.Danger)
                    ),
                ],
            });

            return interaction.editReply(
                `✅ Başvuru kanalın açıldı: ${ticketChannel}`
            );
        }

        // Başvuru kapat
        if (interaction.customId.startsWith("apply_close:")) {
            const [, staffRoleId, ownerId] = interaction.customId.split(":");
            const channel = interaction.channel;

            const isOwner = interaction.user.id === ownerId;
            const isStaff =
                interaction.member.roles.cache.has(staffRoleId) ||
                interaction.member.permissions.has(
                    PermissionsBitField.Flags.Administrator
                );

            if (!isOwner && !isStaff) {
                return interaction.reply({
                    content: "❌ Bu başvuruyu kapatmaya yetkin yok.",
                    ephemeral: true,
                });
            }

            await channel.permissionOverwrites
                .edit(ownerId, {
                    ViewChannel: false,
                    SendMessages: false,
                })
                .catch(() => {});

            if (!channel.name.startsWith("closed-")) {
                await channel
                    .setName(`closed-${channel.name}`.slice(0, 32))
                    .catch(() => {});
            }

            await interaction.reply("🔒 Başvuru kapatıldı (kanal kayıt için saklandı).");
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
            try {
                await reaction.fetch();
            } catch {
                return;
            }
        }
        const msg = reaction.message;
        if (!msg.guild) return;
        if (reaction.emoji.name !== "✅") return;

        const data = otobanEvents.get(msg.id);
        if (!data) return;

        if (data.closed) {
            // Kapandıysa kimse katılamasın
            await reaction.users.remove(user.id).catch(() => {});
            return;
        }

        if (data.participants.has(user.id)) return;

        if (data.participants.size >= data.max) {
            await reaction.users.remove(user.id).catch(() => {});
            return;
        }

        data.participants.add(user.id);

        // Limit doldu mu?
        if (data.participants.size >= data.max) {
            data.closed = true;
            const r = msg.reactions.resolve("✅");
            if (r) await r.remove().catch(() => {});
        }

        await updateOtobanMessage(msg, data);
    } catch (err) {
        console.error("messageReactionAdd error:", err);
    }
});

client.on("messageReactionRemove", async (reaction, user) => {
    try {
        if (user.bot) return;
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch {
                return;
            }
        }
        const msg = reaction.message;
        if (!msg.guild) return;
        if (reaction.emoji.name !== "✅") return;

        const data = otobanEvents.get(msg.id);
        if (!data) return;
        if (data.closed) return; // kapanmışsa listeden düşmesin

        if (data.participants.has(user.id)) {
            data.participants.delete(user.id);
            await updateOtobanMessage(msg, data);
        }
    } catch (err) {
        console.error("messageReactionRemove error:", err);
    }
});

// ===================================================================
//                      FORCEBAN WATCHER
// ===================================================================
client.on("guildBanRemove", async (ban) => {
    try {
        const userId = ban.user.id;
        if (!forceBannedUsers.has(userId)) return;

        await ban.guild.bans.create(userId, {
            reason: "Forceban koruması: tekrar banlandı.",
        });
        console.log(`Forceban koruması: ${userId} yeniden banlandı.`);
    } catch (err) {
        console.error("guildBanRemove error:", err);
    }
});

// ===================================================================
//                          BOTU BAŞLAT
// ===================================================================

     // ===================================================================
//                   Kaisen BIO KONTROL SİSTEMİ (ROL YOK)
// ===================================================================
client.on("userUpdate", async (oldUser, newUser) => {
    try {
        const oldBio = oldUser.bio || "";
        const newBio = newUser.bio || "";

        // Bio değişmediyse işlem yok
        if (oldBio === newBio) return;

        // Zorunlu tagler
        const required = ["discord.gg/kaisenst", "kaisenst", "/kaisenst"];

        const isValid = required.some((tag) =>
            newBio.toLowerCase().includes(tag.toLowerCase())
        );

        // Bio uygun → hiçbir şey yapma
        if (isValid) return;

        // Tüm sunucular üzerinde kontrol
        for (const guild of client.guilds.cache.values()) {
            const member = guild.members.cache.get(newUser.id);
            if (!member) continue;

            // Admin ve bot yetkilileri etkilenmesin
            if (
                member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                member.roles.cache.some(r => botStaffRoles.has(r.id))
            ) continue;

            // Kanal ayarlı değilse uyarı gönderme
            if (!bioKontrolChannel) continue;

            const logCh = guild.channels.cache.get(bioKontrolChannel);

            // Kanal varsa uyarı embed gönder
            if (logCh) {
                logCh.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("⚠️ BIO Tag Eksik!")
                            .setDescription(`${member} profil bio’sunda gerekli tag yok!`)
                            .addFields(
                                { name: "Bio:", value: `\`\`\`${newBio || "Boş"}\`\`\`` },
                                { name: "Gerekli Tagler:", value: "`discord.gg/kaisenst`\n`kaisenst`\n`/kaisenst`" }
                            )
                            .setTimestamp()
                    ]
                });
            }

            // Kullanıcıya DM uyarısı
            try {
                await member.send(
                    "⚠️ **Kaisen Sunucusu Bio Kontrol**\n" +
                    "Profil bio’nuzda zorunlu tag bulunamadı.\n\n" +
                    "Lütfen aşağıdakilerden birini ekleyin:\n" +
                    "• `discord.gg/kaisenst`\n" +
                    "• `kaisenst`\n" +
                    "• `/kaisenst`"
                );
            } catch {
                console.log(`DM gönderilemedi: ${newUser.username}`);
            }
        }
    } catch (err) {
        console.error("Bio kontrol hatası:",
   
client.login(TOKEN);
        


