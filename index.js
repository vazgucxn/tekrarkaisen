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
const PREFIX = "."; // .otoban, .ban, .unban, .ticketpanel

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
        GatewayIntentBits.MessageContent, // prefix komutlar için
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ------------- OTOBAN VERİLERİ -------------
/*
Map: key = messageId
value = {
    max: number,
    title: string,
    participants: Set<userId>,
    closed: boolean,
    channelId: string,
    ownerId: string
}
*/
const otobanEvents = new Map();

// ------------- READY -------------
client.once("ready", () => {
    console.log(`✅ Bot giriş yaptı: ${client.user.tag}`);

    client.user.setPresence({
        activities: [
            {
                name: "Kaisen Sunucusu",
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

            const content =
                `${title} için katılımlar başlamıştır.\n` +
                `Katılmak için bu mesaja ✅ ile tepki ver.\n` +
                `Maksimum: **${max}** kişi.\n\n` +
                `Katılımcılar:\nHenüz kimse katılmadı.`;

            const msg = await channel.send({ content });
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
        // .ban @kişi sebep
        // ------------------------------------------------
        if (cmd === "ban") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return message.reply("❌ Bu komutu kullanmak için `Üyeleri Yasakla` yetkisine sahip olmalısın.");
            }

            const user = message.mentions.users.first();
            if (!user) {
                return message.reply("❌ Kullanım: `.ban @kişi sebep`");
            }

            const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";

            const member = await message.guild.members.fetch(user.id).catch(() => null);
            if (!member) {
                return message.reply("❌ Bu kullanıcı sunucuda bulunamadı.");
            }

            if (member.id === message.author.id) {
                return message.reply("❌ Kendini banlayamazsın.");
            }

            await member
                .ban({ reason })
                .then(() => {
                    message.reply(`✅ ${user.tag} banlandı.\nSebep: **${reason}**`);
                })
                .catch((err) => {
                    console.error(err);
                    message.reply("❌ Kullanıcı banlanırken bir hata oluştu.");
                });

            return;
        }

        // ------------------------------------------------
        // .unban kullanıcı_id sebep
        // ------------------------------------------------
        if (cmd === "unban") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return message.reply("❌ Bu komutu kullanmak için `Üyeleri Yasakla` yetkisine sahip olmalısın.");
            }

            const userId = args.shift();
            if (!userId) {
                return message.reply("❌ Kullanım: `.unban kullanıcı_id sebep`");
            }

            const reason = args.join(" ") || "Sebep belirtilmedi";

            await message.guild.bans
                .remove(userId, reason)
                .then(() => {
                    message.reply(`✅ <@${userId}> kullanıcısının banı kaldırıldı.\nSebep: **${reason}**`);
                })
                .catch((err) => {
                    console.error(err);
                    message.reply(
                        "❌ Ban kaldırılırken bir hata oluştu. ID doğru mu ve kullanıcı gerçekten banlı mı kontrol et."
                    );
                });

            return;
        }

        // ------------------------------------------------
        // .ticketpanel @yetkiliRol
        // ------------------------------------------------
        if (cmd === "ticketpanel") {
            if (
                !message.member.permissions.has(PermissionsBitField.Flags.Administrator) &&
                !message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)
            ) {
                return message.reply("❌ Ticket paneli oluşturmak için yeterli yetkin yok.");
            }

            const role = message.mentions.roles.first();
            if (!role) {
                return message.reply("❌ Kullanım: `.ticketpanel @yetkiliRol`");
            }

            const embed = new EmbedBuilder()
                .setTitle("🎫 Kaisen Ticket Sistemi")
                .setDescription(
                    "Bir sorun, istek veya başvurun mu var?\n\n" +
                    "Aşağıdaki butona tıklayarak bir **ticket açabilirsin**.\n" +
                    "Ticket açıldığında sadece sen ve yetkililer görebilir."
                )
                .setColor("Green");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_create:${role.id}`)
                    .setLabel("🎫 Ticket Aç")
                    .setStyle(ButtonStyle.Success)
            );

            await message.channel.send({ embeds: [embed], components: [row] });
            return message.reply("✅ Ticket paneli oluşturuldu.");
        }
    } catch (err) {
        console.error("messageCreate hatası:", err);
    }
});

// ===================================================================
//                          TICKET BUTONLARI
// ===================================================================
client.on("interactionCreate", async (interaction) => {
    try {
        if (!interaction.isButton()) return;
        if (GUILD_ID && interaction.guildId !== GUILD_ID) return;

        // Her butonda önce deferReply -> "uygulama yanıt vermedi" çıkmaz
        await interaction.deferReply({ ephemeral: true });

        // -------- Ticket oluştur --------
        if (interaction.customId.startsWith("ticket_create:")) {
            const staffRoleId = interaction.customId.split(":")[1];
            const guild = interaction.guild;

            const existing = guild.channels.cache.find(
                (ch) =>
                    ch.type === ChannelType.GuildText &&
                    ch.name.includes(`ticket-${interaction.user.id}`) &&
                    ch.permissionsFor(interaction.user.id)?.has(PermissionsBitField.Flags.ViewChannel)
            );
            if (existing) {
                return interaction.editReply({
                    content: `Zaten açık bir ticket kanalın var: ${existing}`,
                });
            }

            const baseName = `ticket-${interaction.user.username}`
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
                        .setTitle("🎫 Ticket Açıldı")
                        .setDescription(
                            `Merhaba ${interaction.user},\n` +
                            "Yetkililer kısa süre içinde seninle ilgilenecek.\n\n" +
                            "İşin bittiyse aşağıdaki butondan ticketı kapatabilirsin."
                        )
                        .setColor("Blue")
                        .setTimestamp(),
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`ticket_close:${staffRoleId}:${interaction.user.id}`)
                            .setLabel("🔒 Ticket Kapat")
                            .setStyle(ButtonStyle.Danger)
                    ),
                ],
            });

            return interaction.editReply({
                content: `✅ Ticket kanalın açıldı: ${ticketChannel}`,
            });
        }

        // -------- Ticket kapat --------
        if (interaction.customId.startsWith("ticket_close:")) {
            const [, staffRoleId, ownerId] = interaction.customId.split(":");
            const channel = interaction.channel;

            const isOwner = interaction.user.id === ownerId;
            const isStaff =
                interaction.member.roles.cache.has(staffRoleId) ||
                interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

            if (!isOwner && !isStaff) {
                return interaction.editReply({
                    content: "❌ Bu ticketı kapatmak için yetkin yok.",
                });
            }

            await channel.permissionOverwrites
                .edit(ownerId, {
                    ViewChannel: false,
                    SendMessages: false,
                })
                .catch(() => {});

            await channel.permissionOverwrites
                .edit(staffRoleId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                })
                .catch(() => {});

            if (!channel.name.startsWith("closed-")) {
                const newName = `closed-${channel.name}`.slice(0, 30);
                await channel.setName(newName).catch(() => {});
            }

            let components = [];
            if (interaction.message.components?.length) {
                const row = ActionRowBuilder.from(interaction.message.components[0]);
                const btn = ButtonBuilder.from(row.components[0]).setDisabled(true);
                components = [new ActionRowBuilder().addComponents(btn)];
            }

            await interaction.message.edit({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("🔒 Ticket Kapatıldı")
                        .setDescription(
                            "Ticket kapatıldı. Kanal silinmedi, sadece yetkililer görebiliyor.\n" +
                            "Gerekirse geçmiş konuşmaları buradan inceleyebilirsiniz."
                        )
                        .setColor("Red")
                        .setTimestamp(),
                ],
                components,
            });

            return interaction.editReply({
                content: "✅ Ticket kapatıldı.",
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
        if (data.participants.size >= data.max) {
            data.closed = true;
            const r = reaction.message.reactions.resolve("✅");
            if (r) await r.remove().catch(() => {});
        }

        await updateOtobanMessage(reaction.message, data);
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
            await updateOtobanMessage(reaction.message, data);
        }
    } catch (err) {
        console.error("messageReactionRemove hatası:", err);
    }
});

// ---------------- OTOBAN MESAJ GÜNCELLEYİCİ ----------------
async function updateOtobanMessage(message, data) {
    const arr = Array.from(data.participants);
    let listText;

    if (arr.length === 0) {
        listText = "Katılımcı yok.";
    } else {
        listText = arr
            .map((id, index) => `${index + 1}- <@${id}> ( ${id} )`)
            .join("\n");
    }

    let content;
    if (data.closed) {
        // SENİN İSTEDİĞİN FORM: "katılımlar sona erdi. Katılımcılar aşağıdaki listede gösteriliyor..."
        content =
            `${data.title} için katılımlar sona erdi.\n` +
            `Katılımcılar aşağıdaki listede gösteriliyor...\n\n` +
            listText;
    } else {
        content =
            `${data.title} için katılımlar devam ediyor.\n` +
            `Maksimum: **${data.max}** kişi. Katılmak için ✅ tepki ver.\n\n` +
            `Katılımcılar:\n` +
            listText;
    }

    await message.edit({ content }).catch(() => {});
}

// ------------- BOTU BAŞLAT -------------
client.login(TOKEN);
