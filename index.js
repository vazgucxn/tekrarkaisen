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
const otobanEvents = new Map();              // otoban sistem veri
const forceBannedUsers = new Set();          // forceban kayıtları
const botStaffRoles = new Set();             // ek yetkili roller
let bioKontrolChannel = null;                // bio uyarı kanal ID
let bioKontrolIgnoreRoles = [];              // bio kontrol dışı roller

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

// Mesaj atıldığında reklam kontrolü
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
// ===================================================================
//                       PREFIX KOMUTLARI
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

            if (!bioKontrolIgnoreRoles.includes(role.id))
                bioKontrolIgnoreRoles.push(role.id);

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
            if (member.roles.cache.some(r => bioKontrolIgnoreRoles.includes(r.id)))
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
                                    { name: "Bio:", value: `\`\`\`${bio || "Boş"}\`\`\`` }
                                )
                        ]
                    });
                }
            }

            // DM uyarısı
            try {
                await user.send(
                    "⚠️ **Bio kontrol uyarısı:** Bio’nuzda Kaisen tagleri bulunmuyor!"
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

            const logCh = message.guild.channels.cache.get(bioKontrolChannel);

            for (const member of role.members.values()) {
                const user = member.user;
                const bio = user.bio || "";

                // Admin, yetkili, muaf roller → atla
                if (
                    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                    member.roles.cache.some(r => botStaffRoles.has(r.id)) ||
                    member.roles.cache.some(r => bioKontrolIgnoreRoles.includes(r.id))
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
                                    { name: "Bio:", value: `\`\`\`${bio || "Boş"}\`\`\`` }
                                )
                        ]
                    });
                }

                // DM
                try {
                    await user.send("⚠️ Bio’nuzda gerekli tagler bulunamadı!");
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
            await msg.react("✔️");

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

            const r = msg.reactions.resolve("✔️");
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
            updateOtobanMessage(msg, data);

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
            updateOtobanMessage(msg, data);

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
//              OTOBAN REAKSİYON SİSTEMİ (✔️ ile kayıt)
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

            const r = msg.reactions.resolve("✔️");
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
        if (reaction.emoji.name !== "✔️") return;

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
// ================================================================
//                     BIO KONTROL AYARLARI
// ================================================================
let bioKontrolChannel = null;
let bioIgnoreRoles = new Set(); // Bio kontrolünden muaf roller

// ================================================================
//                 MANUEL BIO TARAMA KOMUTLARI
// ================================================================
client.on("messageCreate", async (message) => {
    try {
        if (!message.guild || message.author.bot) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
        const cmd = args.shift()?.toLowerCase();

        // ------------------------------------------------------------------
        //            .bio-kontrol #kanal
        // ------------------------------------------------------------------
        if (cmd === "bio-kontrol") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Bu komut için yetkin yok.");

            const ch = message.mentions.channels.first();
            if (!ch) return message.reply("Kullanım: `.bio-kontrol #kanal`");

            bioKontrolChannel = ch.id;

            return message.reply(`✅ Bio kontrol kanalın ayarlandı: ${ch}`);
        }

        // ------------------------------------------------------------------
        //            .bio-kontrol-rol @rol
        // ------------------------------------------------------------------
        if (cmd === "bio-kontrol-rol") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Bu komut için yetkin yok.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.bio-kontrol-rol @rol`");

            bioIgnoreRoles.add(role.id);

            return message.reply(`🛡 ${role} bio kontrolünden muaf yapıldı.`);
        }

        // ------------------------------------------------------------------
        //            .bio-tara @kullanıcı
        // ------------------------------------------------------------------
        if (cmd === "bio-tara") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const user = message.mentions.users.first();
            if (!user) return message.reply("Kullanım: `.bio-tara @kullanıcı`");

            const member = await message.guild.members.fetch(user.id).catch(() => null);
            if (!member) return message.reply("❌ Kullanıcı bulunamadı.");

            const bio = user.bio || "";

            const required = ["discord.gg/kaisenst", "kaisenst", "/kaisenst"];
            const valid = required.some(x => bio.toLowerCase().includes(x.toLowerCase()));

            if (valid)
                return message.reply(`✅ ${user} bio kontrolünden geçti.`);

            // Uyarı embed (kanala)
            if (bioKontrolChannel) {
                const ch = message.guild.channels.cache.get(bioKontrolChannel);
                if (ch) {
                    ch.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor("Red")
                                .setTitle("⚠️ BIO TAG EKSİK (Manuel Tarama)")
                                .setDescription(`${member} bio’sunda gerekli tag yok.`)
                                .addFields(
                                    { name: "Bio:", value: `\`\`\`${bio || "Boş"}\`\`\`` },
                                    { name: "Gerekli:", value: "`discord.gg/kaisenst`\n`kaisenst`\n`/kaisenst`" }
                                )
                        ]
                    });
                }
            }

            // DM uyarı
            try {
                await user.send(
                    "⚠️ **Kaisen Bio Kontrol**\n" +
                    "Profil bio’nuzda gerekli tag bulunamadı!\n\n" +
                    "Eklemelisin:\n`discord.gg/kaisenst`\n`kaisenst`\n`/kaisenst`"
                );
            } catch {}

            return message.reply(`⚠️ ${user} tag eksik, uyarı gönderildi.`);
        }

        // ------------------------------------------------------------------
        //            .kontrol @rol  → Roldeki herkesin biosunu tarar
        // ------------------------------------------------------------------
        if (cmd === "kontrol") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.kontrol @rol`");

            const members = role.members;
            if (members.size === 0)
                return message.reply("❌ Bu rolde kullanıcı yok.");

            let eksik = 0;

            for (const member of members.values()) {
                const bio = member.user.bio || "";
                const required = ["discord.gg/kaisenst", "kaisenst", "/kaisenst"];
                const valid = required.some(x => bio.toLowerCase().includes(x.toLowerCase()));

                if (!valid) {
                    eksik++;

                    // Kanal uyarısı
                    if (bioKontrolChannel) {
                        const ch = message.guild.channels.cache.get(bioKontrolChannel);
                        if (ch) {
                            ch.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setColor("Red")
                                        .setTitle("⚠️ BIO TAG EKSİK (Rol Tarama)")
                                        .setDescription(`${member} bio’sunda tag bulunamadı.`)
                                        .addFields(
                                            { name: "Bio:", value: `\`\`\`${bio || "Boş"}\`\`\`` },
                                            { name: "Gerekli:", value: "`discord.gg/kaisenst`\n`kaisenst`\n`/kaisenst`" }
                                        )
                                ]
                            });
                        }
                    }

                    // DM uyarı
                    try {
                        await member.send(
                            "⚠️ **Kaisen Bio Kontrol**\n" +
                            "Profil bio’nuzda gerekli tag bulunamadı.\n" +
                            "Lütfen ekleyin."
                        );
                    } catch {}
                }
            }

            return message.reply(`⌛ Rol taraması tamamlandı. Eksik bio: **${eksik} kişi**`);
        }

    } catch (err) {
        console.error("Bio manuel komut hatası:", err);
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
                                    { name: "Bio:", value: `\`\`\`${newBio || "Boş"}\`\`\`` }
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
