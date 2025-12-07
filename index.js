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
const PREFIX = ".";
const FORCE_BAN_OWNER = "827905938923978823"; // Forceban kullanabilen tek kişi

// ------------- Render için mini web server -------------
const app = express();
app.get("/", (_req, res) => res.send("Kaisen bot aktif!"));
app.listen(process.env.PORT || 3000, () => {
    console.log("Web sunucusu başlatıldı (Render için).");
});

// ------------- ENV DEĞİŞKENLERİ -------------
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
const otobanEvents = new Map();
const forceBannedUsers = new Set();
const botStaffRoles = new Set();

// PERMISSION KONTROL
function hasBotPermission(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return true;
    for (const roleId of botStaffRoles) {
        if (member.roles.cache.has(roleId)) return true;
    }
    return false;
}

// OTOBAN BUL
function findActiveOtobanInChannel(channelId) {
    let found = null;
    for (const [msgId, data] of otobanEvents.entries()) {
        if (data.channelId === channelId && !data.closed) found = { msgId, data };
    }
    return found;
}

// OTOBAN MESAJ GÜNCELLE
async function updateOtobanMessage(message, data) {
    const arr = Array.from(data.participants);

    const embedList =
        arr.length === 0 ? "Henüz kimse katılmadı." :
        arr.map((id, i) => `${i + 1}. <@${id}>`).join("\n");

    const finalList =
        arr.length === 0 ? "Katılımcı yok." :
        arr.map((id, i) => `${i + 1}- <@${id}> ( ${id} )`).join("\n");

    if (!data.closed) {
        const embed = new EmbedBuilder()
            .setTitle("🎟️ OTOBAN / ETKİNLİK")
            .setDescription(data.title)
            .addFields(
                { name: "Kişi Sınırı", value: `${data.max}` },
                { name: "Durum", value: "Kayıtlar açık" },
                { name: "Liste", value: embedList }
            )
            .setColor("#000000");

        return message.edit({ embeds: [embed], content: null });
    }

    const txt = `${data.title}\n\nKatılımlar sona erdi:\n\n${finalList}`;
    return message.edit({ embeds: [], content: txt });
}

// READY
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
//                           PREFIX KOMUTLAR
// ===================================================================
client.on("messageCreate", async (message) => {
    try {
        if (!message.guild || message.author.bot) return;

        // ÇİFT ÇALIŞMA ENGELLEYİCİ
        if (message._executed) return;
        message._executed = true;

        if (!message.content.startsWith(PREFIX)) return;

        const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
        const cmd = args.shift()?.toLowerCase();

        // ----------------- SİL KOMUTU -----------------
        if (cmd === "sil") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok!");

            const amount = Number(args[0]);
            if (!amount || amount < 1 || amount > 100)
                return message.reply("Kullanım: `.sil 1-100`");

            await message.channel.bulkDelete(amount, true);
            return message.channel.send(`🧹 **${amount} mesaj silindi.**`).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 3000);
            });
        }

        // ----------------- NUKE KOMUTU -----------------
        if (cmd === "nuke") {
            if (!hasBotPermission(message.member))
                return message.reply("❌ Yetkin yok!");

            const channel = message.channel;
            const position = channel.position;
            const parent = channel.parent;
            const perms = channel.permissionOverwrites.cache.map(p => ({
                id: p.id,
                allow: p.allow.bitfield,
                deny: p.deny.bitfield
            }));

            const newChannel = await channel.clone({
                permissionOverwrites: perms
            });

            await newChannel.setParent(parent);
            await newChannel.setPosition(position);
            await channel.delete();

            return newChannel.send("💣 **Kanal başarıyla nuke edildi!**");
        }

        // ----------------- YARDIM MENÜSÜ -----------------
        if (cmd === "yardım" || cmd === "yardim") {
            const embed = new EmbedBuilder()
                .setTitle("🛠 Kaisen Bot Yardım Menüsü")
                .setColor("#000000")
                .addFields(
                    {
                        name: "🎟 OTOBAN",
                        value: "`" +
                            ".otoban #kanal limit açıklama\n" +
                            ".otoban-bitir\n" +
                            ".otobanekle @kullanıcı\n" +
                            ".otobançıkar @kullanıcı" +
                            "`"
                    },
                    {
                        name: "🧹 Moderasyon",
                        value: "`" +
                            ".sil miktar\n" +
                            ".nuke" +
                            "`"
                    },
                    {
                        name: "💌 DM",
                        value: "`" + ".dm @rol mesaj" + "`"
                    },
                    {
                        name: "📨 BAŞVURU",
                        value: "`" + ".basvurupanel @yetkili" + "`"
                    },
                    {
                        name: "🚫 FORCEBAN",
                        value: "`" +
                            ".forceban @kullanıcı/id sebep\n" +
                            ".unforceban @kullanıcı/id" +
                            "`"
                    },
                )
                .setFooter({ text: "vazgucxn ❤ Kaisen" });

            return message.channel.send({ embeds: [embed] });
        }

        // ----------------- YETKİ KOMUTLARI -----------------
        if (cmd === "yetkiekle") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return message.reply("❌ Bu komutu sadece Administrator kullanabilir.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.yetkiekle @rol`");

            botStaffRoles.add(role.id);
            return message.reply(`🛡 ${role} artık bot yetkilisi.`);
        }

        if (cmd === "yetkicikar") {
            if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
                return message.reply("❌ Bu komutu sadece Administrator kullanabilir.");

            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.yetkicikar @rol`");

            botStaffRoles.delete(role.id);
            return message.reply(`🛡 ${role} artık bot yetkilisi değil.`);
        }

        if (cmd === "yetkiler") {
            if (botStaffRoles.size === 0)
                return message.reply("🛡 Hiç bot yetkilisi yok.");

            return message.reply(
                "🛡 Yetkili roller:\n" +
                [...botStaffRoles].map(id => `<@&${id}>`).join("\n")
            );
        }

        // ----------------- FORCEBAN -----------------
        if (cmd === "forceban") {
            if (message.author.id !== FORCE_BAN_OWNER)
                return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir!");

            let targetId = message.mentions.users.first()?.id || args.shift();
            if (!targetId) return message.reply("Kullanım: `.forceban @kullanıcı/id sebep`");

            const reason = args.join(" ") || "Forceban";

            try {
                forceBannedUsers.add(targetId);
                await message.guild.bans.create(targetId, { reason });
                return message.reply(`🚫 Forceban uygulandı: \`${targetId}\``);
            } catch {
                return message.reply("❌ Kullanıcı banlanamadı.");
            }
        }

        // ----------------- UNFORCEBAN -----------------
        if (cmd === "unforceban") {
            if (message.author.id !== FORCE_BAN_OWNER)
                return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir!");

            let targetId = message.mentions.users.first()?.id || args.shift();
            if (!targetId) return message.reply("Kullanım: `.unforceban @kullanıcı/id`");

            forceBannedUsers.delete(targetId);

            try {
                await message.guild.bans.remove(targetId);
            } catch {}

            return message.reply(`✅ Unforceban uygulandı: \`${targetId}\``);
        }

        // ----------------- OTOBAN -----------------
        if (cmd === "otoban") {
            const channel = message.mentions.channels.first();
            if (!channel) return message.reply("Kullanım: `.otoban #kanal limit açıklama`");

            args.shift();

            const limit = Number(args.shift());
            if (!limit) return message.reply("❌ Limit hatalı!");

            const title = args.join(" ");
            if (!title) return message.reply("❌ Açıklama eksik!");

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
                channelId: channel.id
            });

            return message.reply("✔ Otoban oluşturuldu.");
        }

        if (cmd === "otoban-bitir") {
            const event = findActiveOtobanInChannel(message.channel.id);
            if (!event) return message.reply("Aktif otoban yok.");

            const { msgId, data } = event;
            const msg = await message.channel.messages.fetch(msgId);

            data.closed = true;

            const r = msg.reactions.resolve("✅");
            if (r) await r.remove().catch(() => {});

            await updateOtobanMessage(msg, data);
            return message.reply("✔ Otoban kapatıldı.");
        }

        if (cmd === "otobanekle") {
            const event = findActiveOtobanInChannel(message.channel.id);
            if (!event) return message.reply("Aktif otoban yok.");

            const user = message.mentions.users.first();
            if (!user) return message.reply("Kullanım: `.otobanekle @kullanıcı`");

            const { msgId, data } = event;
            data.participants.add(user.id);

            const msg = await message.channel.messages.fetch(msgId);
            updateOtobanMessage(msg, data);

            return message.reply(`✔ ${user} eklendi.`);
        }

        if (cmd === "otobançıkar" || cmd === "otobancikar") {
            const event = findActiveOtobanInChannel(message.channel.id);
            if (!event) return message.reply("Aktif otoban yok.");

            const user = message.mentions.users.first();
            if (!user) return message.reply("Kullanım: `.otobançıkar @kullanıcı`");

            const { msgId, data } = event;
            data.participants.delete(user.id);

            const msg = await message.channel.messages.fetch(msgId);
            updateOtobanMessage(msg, data);

            return message.reply(`✔ ${user} çıkarıldı.`);
        }

        // ----------------- DM SISTEMI -----------------
        if (cmd === "dm") {
            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.dm @rol mesaj`");

            args.shift();
            const text = args.join(" ");
            if (!text) return message.reply("Mesaj eksik!");

            const members = await message.guild.members.fetch();
            const targets = members.filter(m => m.roles.cache.has(role.id) && !m.user.bot);

            const embed = new EmbedBuilder()
                .setDescription(text)
                .setColor("#000000");

            let ok = 0, fail = 0;

            for (const m of targets.values()) {
                try {
                    await m.send({ embeds: [embed] });
                    ok++;
                } catch {
                    fail++;
                }
            }

            return message.reply(`DM gönderildi. Başarılı: ${ok}, Hata: ${fail}`);
        }

        // ----------------- BAŞVURU PANEL -----------------
        if (cmd === "basvurupanel") {
            const role = message.mentions.roles.first();
            if (!role) return message.reply("Kullanım: `.basvurupanel @yetkili`");

            const embed = new EmbedBuilder()
                .setTitle("📨 Başvuru Paneli")
                .setDescription("Aşağıdaki butona tıklayarak başvuru açabilirsiniz.")
                .setColor("#000000");

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`apply_create:${role.id}`)
                    .setLabel("Başvuru Aç")
                    .setStyle(ButtonStyle.Success)
            );

            await message.channel.send({ embeds: [embed], components: [row] });
            return message.reply("Başvuru paneli oluşturuldu!");
        }

    } catch (err) {
        console.error("MESSAGE ERROR:", err);
    }
});

// ===================================================================
//                      FORCEBAN OTOMATİK BAN
// ===================================================================
client.on("guildBanRemove", async (ban) => {
    try {
        const userId = ban.user.id;
        if (!forceBannedUsers.has(userId)) return;

        await ban.guild.bans.create(userId, {
            reason: "Forceban koruması – tekrar banlandı."
        });
    } catch (err) {
        console.error("guildBanRemove error:", err);
    }
});

// ===================================================================
//                          BOTU BAŞLAT
// ===================================================================
client.login(TOKEN);
