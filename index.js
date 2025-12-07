// ===================== Kaisen Özel Discord Botu (Prefix) =====================
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
const PREFIX = "."; // .otoban, .dm, .basvurupanel, .forceban, .yardım vs

// ------------- Render için mini web server -------------
const app = express();
app.get("/", (_req, res) => res.send("Kaisen bot aktif"));
app.listen(process.env.PORT || 3000, () => {
    console.log("Web sunucusu çalışıyor (Render için).");
});

// ------------- ENV DEĞİŞKENLERİ -------------
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID || null;

console.log(
    "ENV KONTROL:",
    "TOKEN uzunluk =", TOKEN ? TOKEN.length : 0,
    "| GUILD_ID =", GUILD_ID
);

if (!TOKEN || TOKEN.length < 20) {
    console.error("❌ HATA: DISCORD_BOT_TOKEN yok veya çok kısa. Render > Environment kontrol et.");
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

// ------------- GLOBAL VERİLER -------------
/*
otobanEvents: Map<messageId, {
    max: number,
    title: string,
    participants: Set<userId>,
    closed: boolean,
    channelId: string,
    ownerId: string
}>
*/
const otobanEvents = new Map();

/*
forceBannedUsers: Set<userId>  -> force ban takibi
*/
const forceBannedUsers = new Set();

/*
botStaffRoles: Set<roleId>  -> özel bot yetkisi olan roller
*/
const botStaffRoles = new Set();

// ------------- HELPER FONKSİYONLAR -------------

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
    let lastEntry = null;
    for (const [msgId, data] of otobanEvents.entries()) {
        if (data.channelId === channelId && !data.closed) {
            lastEntry = { msgId, data };
        }
    }
    return lastEntry;
}

// ---------------- OTOBAN MESAJ GÜNCELLEYİCİ ----------------
async function updateOtobanMessage(message, data) {
    const arr = Array.from(data.participants);

    const embedListText =
        arr.length === 0
            ? "Henüz kimse katılmadı."
            : arr.map((id, index) => `${index + 1}. <@${id}>`).join("\n");

    const finalListText =
        arr.length === 0
            ? "Katılımcı yok."
            : arr.map((id, index) => `${index + 1}- <@${id}> ( ${id} )`).join("\n");

    // Katılım açıkken -> EMBED
    if (!data.closed) {
        const embed = new EmbedBuilder()
            .setTitle("🎟️ OTOBAN / ETKİNLİK")
            .setDescription(data.title)
            .addFields(
                { name: "Kişi Sınırı", value: `${data.max}`, inline: true },
                { name: "Durum", value: "Kayıtlar açık.", inline: true },
                { name: "Liste", value: embedListText },
            )
            .setColor(0x00ffff)
            .setFooter({ text: "Kaisen OtoBan Sistemi" })
            .setTimestamp();

        return message.edit({ content: null, embeds: [embed] }).catch(() => {});
    }

    // Kapandıysa -> DÜZ YAZI
    const finalText =
        `${data.title} için katılımlar sona erdi.\n` +
        `Katılımcılar aşağıdaki listede gösteriliyor...\n\n` +
        finalListText;

    return message.edit({ embeds: [], content: finalText }).catch(() => {});
}

// ------------- READY -------------
client.once("ready", () => {
    console.log(`✅ Bot giriş yaptı: ${client.user.tag}`);

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
//                          PREFIX KOMUTLAR
// ===================================================================
client.on("messageCreate", async (message) => {
    try {
        if (!message.guild || message.author.bot) return;
        if (GUILD_ID && message.guild.id !== GUILD_ID) return;
        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
        const cmd = args.shift()?.toLowerCase();

        // ------------------------------------------------
        // .yardım
        // ------------------------------------------------
        if (cmd === "yardım" || cmd === "yardim") {
            const embed = new EmbedBuilder()
                .setTitle("🛠 Kaisen Bot Yardım Menüsü")
                .setDescription("Aşağıda botun tüm komutlarını ve açıklamalarını bulabilirsin.")
                .setColor(0x5865f2)
                .addFields(
                    {
                        name: "🎟 OTOBAN SİSTEMİ",
                        value:
                            "`" +
                            [
                                ".otoban #kanal kişi_sayısı açıklama",
                                ".otoban-bitir",
                                ".otobanekle @kullanıcı",
                                ".otobançıkar @kullanıcı",
                            ].join("`\n`") +
                            "`",
                    },
                    {
                        name: "💌 DM SİSTEMİ",
                        value: "`" + ".dm @rol mesaj" + "`",
                    },
                    {
                        name: "📨 BAŞVURU SİSTEMİ",
                        value: "`" + ".basvurupanel @YetkiliRol" + "`",
                    },
                    {
                        name: "🚫 FORCE BAN SİSTEMİ",
                        value:
                            "`" +
                            [
                                ".forceban @kullanıcı/id sebep",
                                ".unforceban @kullanıcı/id",
                            ].join("`\n`") +
                            "`",
                    },
                    {
                        name: "🛡 YETKİ SİSTEMİ",
                        value:
                            "`" +
                            [
                                ".yetkiekle @rol",
                                ".yetkicikar @rol",
                                ".yetkiler",
                            ].join("`\n`") +
                            "`",
                    }
                )
                .setFooter({ text: "vazgucxn ❤ Kaisen" })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

        // ------------------------------------------------
        // .yetkiekle @rol
        // ------------------------------------------------
        if (cmd === "yetkiekle") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return message.reply("❌ Bu komutu sadece **Yönetici** kullanabilir.");
            }

            const role = message.mentions.roles.first();
            if (!role) {
                return message.reply("❌ Kullanım: `.yetkiekle @rol`");
            }

            botStaffRoles.add(role.id);
            return message.reply(`✅ ${role} rolüne bot yetkisi verildi.`);
        }

        // ------------------------------------------------
        // .yetkicikar @rol
        // ------------------------------------------------
        if (cmd === "yetkicikar") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return message.reply("❌ Bu komutu sadece **Yönetici** kullanabilir.");
            }

            const role = message.mentions.roles.first();
            if (!role) {
                return message.reply("❌ Kullanım: `.yetkicikar @rol`");
            }

            botStaffRoles.delete(role.id);
            return message.reply(`✅ ${role} rolünden bot yetkisi kaldırıldı.`);
        }

        // ------------------------------------------------
        // .yetkiler
        // ------------------------------------------------
        if (cmd === "yetkiler") {
            if (botStaffRoles.size === 0) {
                return message.reply("ℹ Şu anda ekstra bot yetkisi verilmiş bir rol yok. Sadece Admin / Sunucu Yöneticisi botun yönetim komutlarını kullanabilir.");
            }
            const names = botStaffRoles
                .map((id) => {
                    const r = message.guild.roles.cache.get(id);
                    return r ? r.toString() : `\`${id}\``;
                })
                .join("\n");

            return message.reply(`🛡 Bot yetkili rolleri:\n${names}`);
        }

        // Aşağıdaki komutlar için bot yetkisi gereksin
        const needsPerm = ["otoban", "otoban-bitir", "otobanekle", "otobançıkar", "otobancikar", "dm", "basvurupanel", "forceban", "unforceban"];
        if (needsPerm.includes(cmd) && !hasBotPermission(message.member)) {
            return message.reply("❌ Bu komutu kullanmak için bot yetkisine sahip olmalısın. (Admin / Manage Server / bot yetkili rol)");
        }

        // ------------------------------------------------
        // .otoban #kanal kişi_sayısı açıklama
        // ------------------------------------------------
        if (cmd === "otoban") {
            const channel = message.mentions.channels.first();

            if (!channel || channel.type !== ChannelType.GuildText) {
                return message.reply("❌ Kullanım: `.otoban #kanal kişi_sayısı açıklama`");
            }

            // mention'ı args listesinden çıkar
            args.shift(); // <#id>

            const maxStr = args.shift();
            const max = Number(maxStr);
            if (!maxStr || isNaN(max) || max < 1) {
                return message.reply(
                    "❌ Kişi sayısını doğru gir. Örn: `.otoban #kanal 20 redzone etkinliği`"
                );
            }

            const title = args.join(" ");
            if (!title) {
                return message.reply("❌ Bir açıklama / etkinlik adı girmen gerekiyor.");
            }

            // Katılım açıkken EMBED
            const embed = new EmbedBuilder()
                .setTitle("🎟️ OTOBAN / ETKİNLİK")
                .setDescription(title)
                .addFields(
                    { name: "Kişi Sınırı", value: `${max}`, inline: true },
                    { name: "Durum", value: "Kayıtlar açık.", inline: true },
                    { name: "Liste", value: "Henüz kimse katılmadı." },
                )
                .setColor(0x00ffff)
                .setFooter({ text: "Kaisen OtoBan Sistemi" })
                .setTimestamp();

            const msg = await channel.send({ embeds: [embed] });
            await msg.react("✅");

            otobanEvents.set(msg.id, {
                max,
                title,
                participants: new Set(),
                closed: false,
                channelId: channel.id,
                ownerId: message.author.id,
            });

            return message.reply(`✅ Oto-ban mesajı ${channel} kanalına gönderildi.`);
        }

        // ------------------------------------------------
        // .otoban-bitir
        // ------------------------------------------------
        if (cmd === "otoban-bitir") {
            const entry = findActiveOtobanInChannel(message.channel.id);
            if (!entry) {
                return message.reply("ℹ Bu kanalda aktif bir otoban bulunamadı.");
            }
            const { msgId, data } = entry;

            try {
                const msg = await message.channel.messages.fetch(msgId);
                data.closed = true;
                const r = msg.reactions.resolve("✅");
                if (r) await r.remove().catch(() => {});
                await updateOtobanMessage(msg, data);
                return message.reply("✅ Oto-ban başarıyla kapatıldı.");
            } catch (err) {
                console.error(err);
                return message.reply("❌ Oto-ban mesajı bulunamadı veya güncellenemedi.");
            }
        }

        // ------------------------------------------------
        // .otobanekle @kullanıcı
        // ------------------------------------------------
        if (cmd === "otobanekle") {
            const entry = findActiveOtobanInChannel(message.channel.id);
            if (!entry) {
                return message.reply("ℹ Bu kanalda aktif bir otoban bulunamadı.");
            }
            const { msgId, data } = entry;
            const user = message.mentions.users.first();
            if (!user) {
                return message.reply("❌ Kullanım: `.otobanekle @kullanıcı`");
            }

            if (data.closed) {
                return message.reply("❌ Bu otoban zaten kapalı.");
            }

            if (data.participants.has(user.id)) {
                return message.reply("ℹ Bu kullanıcı zaten listede.");
            }

            if (data.participants.size >= data.max) {
                return message.reply("❌ Zaten maksimum kişi sayısına ulaşıldı.");
            }

            data.participants.add(user.id);

            try {
                const msg = await message.channel.messages.fetch(msgId);
                if (data.participants.size >= data.max) {
                    data.closed = true;
                    const r = msg.reactions.resolve("✅");
                    if (r) await r.remove().catch(() => {});
                }
                await updateOtobanMessage(msg, data);
                return message.reply(`✅ ${user} otoban listesine eklendi.`);
            } catch (err) {
                console.error(err);
                return message.reply("❌ Oto-ban mesajı güncellenirken hata oluştu.");
            }
        }

        // ------------------------------------------------
        // .otobançıkar / .otobancikar @kullanıcı
        // ------------------------------------------------
        if (cmd === "otobançıkar" || cmd === "otobancikar") {
            const entry = findActiveOtobanInChannel(message.channel.id);
            if (!entry) {
                return message.reply("ℹ Bu kanalda aktif bir otoban bulunamadı.");
            }
            const { msgId, data } = entry;
            const user = message.mentions.users.first();
            if (!user) {
                return message.reply("❌ Kullanım: `.otobançıkar @kullanıcı`");
            }

            if (!data.participants.has(user.id)) {
                return message.reply("ℹ Bu kullanıcı listede değil.");
            }

            data.participants.delete(user.id);

            try {
                const msg = await message.channel.messages.fetch(msgId);
                await updateOtobanMessage(msg, data);
                return message.reply(`✅ ${user} otoban listesinden çıkarıldı.`);
            } catch (err) {
                console.error(err);
                return message.reply("❌ Oto-ban mesajı güncellenirken hata oluştu.");
            }
        }

        // ------------------------------------------------
        // .dm @rol mesaj
        // ------------------------------------------------
        if (cmd === "dm") {
            const role = message.mentions.roles.first();
            if (!role) {
                return message.reply("❌ Kullanım: `.dm @rol mesaj`");
            }

            // rol mention'ı args'tan çıkar
            args.shift();
            const text = args.join(" ");
            if (!text) {
                return message.reply("❌ Göndermek istediğin mesajı yazmalısın. Örn: `.dm @rol Deneme duyurusu`");
            }

            await message.reply(
                `⏳ ${role} rolündeki kullanıcılara DM gönderiliyor, biraz sürebilir...`
            );

            const members = await message.guild.members.fetch();
            const targets = members.filter(
                (m) => !m.user.bot && m.roles.cache.has(role.id)
            );

            const embed = new EmbedBuilder()
                .setDescription(text)
                .setColor(0x000000) // SİYAH ŞERİT
                .setFooter({
                    text: `Gönderen: ${message.author.tag} • Sunucu: ${message.guild.name}`,
                })
                .setTimestamp();

            let ok = 0;
            let fail = 0;

            const promises = targets.map(async (member) => {
                try {
                    await member.send({ embeds: [embed] });
                    ok++;
                } catch {
                    fail++;
                }
            });

            await Promise.allSettled(promises);

            return message.channel.send(
                `✅ DM gönderimi tamamlandı. Başarılı: **${ok}** | Başarısız (DM kapalı vb.): **${fail}**`
            );
        }

        // ------------------------------------------------
        // .basvurupanel @YetkiliRol
        // ------------------------------------------------
        if (cmd === "basvurupanel") {
            const role = message.mentions.roles.first();
            if (!role) {
                return message.reply("❌ Kullanım: `.basvurupanel @YetkiliRol`");
            }

            const embed = new EmbedBuilder()
                .setTitle("📨 Kaisen Başvuru Sistemi")
                .setDescription(
                    "Sunucu ekibine / özel rollere başvurmak için aşağıdaki butona tıkla.\n" +
                    "Senin için özel bir kanal açılacak, soruları orada cevaplayacaksın.\n\n" +
                    "❗ Spam başvuru açmak yasaktır."
                )
                .setColor(0x5865f2);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`apply_create:${role.id}`)
                    .setLabel("📨 Başvuru Aç")
                    .setStyle(ButtonStyle.Primary)
            );

            await message.channel.send({ embeds: [embed], components: [row] });
            return message.reply("✅ Başvuru paneli oluşturuldu.");
        }

        // ------------------------------------------------
        // .forceban @kullanıcı/id sebep
        // ------------------------------------------------
        if (cmd === "forceban") {
            let targetId;
            const mentioned = message.mentions.users.first();
            if (mentioned) {
                targetId = mentioned.id;
                args.shift(); // mention'ı kaldır
            } else {
                const idArg = args.shift();
                if (!idArg) {
                    return message.reply("❌ Kullanım: `.forceban @kullanıcı/id sebep`");
                }
                targetId = idArg;
            }

            const reason = args.join(" ") || "Force ban uygulandı.";

            try {
                forceBannedUsers.add(targetId);
                await message.guild.bans.create(targetId, {
                    reason: `ForceBan: ${reason}`,
                });
                return message.reply(`🚫 Force ban uygulandı. Kullanıcı ID: \`${targetId}\``);
            } catch (err) {
                console.error(err);
                return message.reply("❌ Force ban uygulanırken hata oluştu. ID doğru mu?");
            }
        }

        // ------------------------------------------------
        // .unforceban @kullanıcı/id
        // ------------------------------------------------
        if (cmd === "unforceban") {
            let targetId;
            const mentioned = message.mentions.users.first();
            if (mentioned) {
                targetId = mentioned.id;
                args.shift();
            } else {
                const idArg = args.shift();
                if (!idArg) {
                    return message.reply("❌ Kullanım: `.unforceban @kullanıcı/id`");
                }
                targetId = idArg;
            }

            forceBannedUsers.delete(targetId);

            try {
                await message.guild.bans.remove(targetId, "UnForceBan ile ban kaldırıldı.");
            } catch {
                // ban yoksa sessiz geç
            }

            return message.reply(`✅ Force ban kaldırıldı. Kullanıcı ID: \`${targetId}\``);
        }
    } catch (err) {
        console.error("messageCreate hatası:", err);
    }
});

// ===================================================================
//                          BAŞVURU BUTONLARI
// ===================================================================
client.on("interactionCreate", async (interaction) => {
    try {
        if (!interaction.isButton()) return;
        if (GUILD_ID && interaction.guildId !== GUILD_ID) return;

        await interaction.deferReply({ ephemeral: true });

        // -------- Başvuru oluştur --------
        if (interaction.customId.startsWith("apply_create:")) {
            const staffRoleId = interaction.customId.split(":")[1];
            const guild = interaction.guild;

            const existing = guild.channels.cache.find(
                (ch) =>
                    ch.type === ChannelType.GuildText &&
                    ch.name.includes(`basvuru-${interaction.user.id}`) &&
                    ch.permissionsFor(interaction.user.id)?.has(PermissionsBitField.Flags.ViewChannel)
            );
            if (existing) {
                return interaction.editReply({
                    content: `Zaten açık bir başvuru kanalın var: ${existing}`,
                });
            }

            const baseName = `basvuru-${interaction.user.username}`
                .toLowerCase()
                .replace(/[^a-z0-9\-]/g, "")
                .slice(0, 20);

            const ticketChannel = await guild.channels.create({
                name: `${baseName}-${interaction.user.id.slice(-4)}`,
                type: ChannelType.GuildText,
                parent: interaction.channel.parentId ?? null,
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
                            PermissionsBitField.Flags.AttachFiles,
                            PermissionsBitField.Flags.AddReactions,
                        ],
                    },
                    {
                        id: staffRoleId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory,
                            PermissionsBitField.Flags.ManageMessages,
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
                            "Merhaba, başvurun için teşekkürler.\n\n" +
                            "Lütfen aşağıdaki örneğe göre cevap ver:\n" +
                            "• Yaşın:\n" +
                            "• Deneyimin / önceki görevlerin:\n" +
                            "• Neden seni seçelim?:\n\n" +
                            "İşin bittiğinde aşağıdaki butondan başvuruyu kapatabilirsin."
                        )
                        .setColor(0x2f3136)
                        .setTimestamp(),
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`apply_close:${staffRoleId}:${interaction.user.id}`)
                            .setLabel("🔒 Başvuruyu Kapat")
                            .setStyle(ButtonStyle.Danger)
                    ),
                ],
            });

            return interaction.editReply({
                content: `✅ Başvuru kanalın açıldı: ${ticketChannel}`,
            });
        }

        // -------- Başvuru kapat --------
        if (interaction.customId.startsWith("apply_close:")) {
            const [, staffRoleId, ownerId] = interaction.customId.split(":");
            const channel = interaction.channel;

            const isOwner = interaction.user.id === ownerId;
            const isStaff =
                interaction.member.roles.cache.has(staffRoleId) ||
                interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!isOwner && !isStaff) {
                return interaction.editReply({
                    content: "❌ Bu başvuruyu kapatmak için yetkin yok.",
                });
            }

            // Başvuran artık göremesin
            await channel.permissionOverwrites
                .edit(ownerId, {
                    ViewChannel: false,
                    SendMessages: false,
                })
                .catch(() => {});

            // Yetkili rol görmeye devam etsin
            await channel.permissionOverwrites
                .edit(staffRoleId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                })
                .catch(() => {});

            // Kanal adı closed- ile başlasın
            if (!channel.name.startsWith("closed-")) {
                const newName = `closed-${channel.name}`.slice(0, 32);
                await channel.setName(newName).catch(() => {});
            }

            // Butonu disable et + embed güncelle
            let components = [];
            if (interaction.message.components?.length) {
                const row = ActionRowBuilder.from(interaction.message.components[0]);
                const btn = ButtonBuilder.from(row.components[0]).setDisabled(true);
                components = [new ActionRowBuilder().addComponents(btn)];
            }

            await interaction.message
                .edit({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("🔒 Başvuru Kapatıldı")
                            .setDescription(
                                "Başvuru kapatıldı. Kanal silinmedi, sadece yetkililer görebiliyor.\n" +
                                "Gerekirse geçmiş konuşmaları buradan inceleyebilirsiniz."
                            )
                            .setColor(0x992d22)
                            .setTimestamp(),
                    ],
                    components,
                })
                .catch(() => {});

            return interaction.editReply({
                content: "✅ Başvuru kapatıldı.",
            });
        }

        return interaction.editReply({ content: "Bu buton artık geçersiz." });
    } catch (err) {
        console.error("interactionCreate hatası:", err);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: "❌ Bir hata oluştu, lütfen tekrar dene.",
                    ephemeral: true,
                });
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({
                    content: "❌ Bir hata oluştu, lütfen tekrar dene.",
                });
            }
        } catch (_) {}
    }
});

// ===================================================================
//                          OTOBAN REACTİONS
// ===================================================================
client.on("messageReactionAdd", async (reaction, user) => {
    try {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch();
        if (!reaction.message.guild) return;
        if (GUILD_ID && reaction.message.guild.id !== GUILD_ID) return;

        const data = otobanEvents.get(reaction.message.id);
        if (!data) return;
        if (reaction.emoji.name !== "✅") return;

        if (data.closed) {
            await reaction.users.remove(user.id).catch(() => {});
            return;
        }

        if (data.participants.has(user.id)) return;

        if (data.participants.size >= data.max) {
            await reaction.users.remove(user.id).catch(() => {});
            return;
        }

        data.participants.add(user.id);

        // Limit dolduysa kapat
        const msg = await reaction.message.fetch().catch(() => null);
        if (!msg) return;

        if (data.participants.size >= data.max) {
            data.closed = true;
            const r = msg.reactions.resolve("✅");
            if (r) await r.remove().catch(() => {});
        }

        await updateOtobanMessage(msg, data);
    } catch (err) {
        console.error("messageReactionAdd hatası:", err);
    }
});

client.on("messageReactionRemove", async (reaction, user) => {
    try {
        if (user.bot) return;
        if (reaction.partial) await reaction.fetch();
        if (!reaction.message.guild) return;
        if (GUILD_ID && reaction.message.guild.id !== GUILD_ID) return;

        const data = otobanEvents.get(reaction.message.id);
        if (!data) return;
        if (reaction.emoji.name !== "✅") return;
        if (data.closed) return; // kapandıysa liste değişmesin

        if (data.participants.has(user.id)) {
            data.participants.delete(user.id);
            const msg = await reaction.message.fetch().catch(() => null);
            if (msg) await updateOtobanMessage(msg, data);
        }
    } catch (err) {
        console.error("messageReactionRemove hatası:", err);
    }
});

// ===================================================================
//                          FORCE BAN WATCH
// ===================================================================
client.on("guildBanRemove", async (ban) => {
    try {
        if (GUILD_ID && ban.guild.id !== GUILD_ID) return;
        const userId = ban.user.id;
        if (!forceBannedUsers.has(userId)) return;

        console.log(`ForceBan koruması: ${userId} için otomatik tekrar ban.`);
        await ban.guild.bans.create(userId, {
            reason: "ForceBan koruması: otomatik tekrar banlandı.",
        });
    } catch (err) {
        console.error("guildBanRemove / forceban hatası:", err);
    }
});

// ------------- BOTU BAŞLAT -------------
client.login(TOKEN);
