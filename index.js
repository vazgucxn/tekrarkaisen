// ===================== Kaisen Özel Discord Botu (Prefix + Guard + Bio Kontrol) =====================
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
const otobanEvents = new Map();      
const forceBannedUsers = new Set(); 
const botStaffRoles = new Set();    

let bioKontrolChannel = null;        // Bio kontrol için kanal
let bioIgnoreRole = null;            // Bio kontrol yapılmayacak rol ID

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

// Diğer yardımcı fonksiyonlar...
// ===================================================================
//                       OTOBAN GÜNCELLEME FONKSİYONU
// ===================================================================
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

// ===================================================================
// BOT ONREADY
// ===================================================================
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
// REKLAM ENGEL (GUARD)
// ===================================================================
const adWords = ["discord.gg","discord.com/invite","http://","https://","t.me/","instagram.com","tiktok.com","facebook.com","youtu.be","youtube.com",".gg",".com",".net"];

async function checkAd(message) {
    if (!message.guild || message.author.bot) return;

    const member = message.member;
    if (!member) return;

    if (hasBotPermission(member) || member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return;
    }

    const content = (message.content || "").toLowerCase();
    if (!content) return;

    if (adWords.some((w) => content.includes(w))) {
        await message.delete().catch(() => {});
        const warn = await message.channel.send(`⚠️ ${message.author}, reklam linki paylaşamazsın.`);
        setTimeout(() => warn.delete().catch(() => {}), 5000);
    }
}

client.on("messageCreate", checkAd);
client.on("messageUpdate", async (_o, newMsg) => {
    try {
        if (newMsg.partial) newMsg = await newMsg.fetch();
    } catch {}
    checkAd(newMsg);
});

// ===================================================================
// PREFIX KOMUTLAR
// ===================================================================
client.on("messageCreate", async (message) => {

    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    if (message._executed) return;
    message._executed = true;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();

    // ================ BIO KONTROL KANAL AYARI ================
    if (cmd === "bio-kontrol") {
        if (!hasBotPermission(message.member))
            return message.reply("❌ Yetkin yok.");

        const ch = message.mentions.channels.first();
        if (!ch) return message.reply("Kullanım: `.bio-kontrol #kanal`");

        bioKontrolChannel = ch.id;
        return message.reply(`✅ Bio kontrol log kanalı ayarlandı: ${ch}`);
    }

    // ================ BIO KONTROL ROL AYARI ================
    if (cmd === "bio-kontrol-rol") {
        if (!hasBotPermission(message.member))
            return message.reply("❌ Yetkin yok.");

        const role = message.mentions.roles.first();
        if (!role) return message.reply("Kullanım: `.bio-kontrol-rol @rol`");

        bioIgnoreRole = role.id;
        return message.reply(`✅ Artık **${role}** rolündeki kişilere bio kontrol yapılmayacak.`);
    }

    // ================ YARDIM MENÜSÜ ================
    if (cmd === "yardım" || cmd === "yardim") {
        const embed = new EmbedBuilder()
            .setTitle("🛠 Kaisen Bot Yardım Menüsü")
            .setColor("#000000")
            .addFields(
                { name: "🎟 OTOBAN", value: "`.otoban #kanal limit açıklama`\n`.otoban-bitir`\n`.otobanekle @kullanıcı`\n`.otobançıkar @kullanıcı`" },
                { name: "💌 DM", value: "`.dm @rol mesaj`" },
                { name: "🚫 ForceBan", value: "`.forceban @kullanıcı/id sebep`\n`.unforceban @kullanıcı/id`\n(sadece <@" + FORCE_BAN_OWNER + "> )" },
                { name: "🛡 Yetki", value: "`.yetkiekle @rol`\n`.yetkicikar @rol`\n`.yetkiler`" },
                { name: "📝 Bio Kontrol", value: "`.bio-kontrol #kanal`\n`.bio-kontrol-rol @rol`\n→ Bu roldekilere bio kontrol uygulanmaz." },
            )
            .setFooter({ text: "vazgucxn ❤ Kaisen" });

        return message.channel.send({ embeds: [embed] });
    }

    // ================ .sil ================
    if (cmd === "sil") {
        if (!hasBotPermission(message.member))
            return message.reply("❌ Yetkin yok.");

        const amount = Number(args[0]);
        if (!amount || amount < 1 || amount > 100)
            return message.reply("1-100 arası sayı gir.");

        await message.channel.bulkDelete(amount, true);
        const info = await message.channel.send(`🧹 ${amount} mesaj silindi.`);
        setTimeout(() => info.delete().catch(() => {}), 3000);
        return;
    }

    // ================ .nuke ================
    if (cmd === "nuke") {
        if (!hasBotPermission(message.member))
            return message.reply("❌ Yetkin yok.");

        const channel = message.channel;
        const position = channel.position;
        const parent = channel.parent;

        const perms = channel.permissionOverwrites.cache.map(p => ({
            id: p.id,
            allow: p.allow.bitfield,
            deny: p.deny.bitfield,
        }));

        const newCh = await channel.clone({ permissionOverwrites: perms });
        await newCh.setParent(parent || null);
        await newCh.setPosition(position);
        await channel.delete().catch(() => {});

        newCh.send("💣 Kanal başarıyla nuke edildi!");
        return;
    }

    // ================ YETKI SISTEMI ================
    if (cmd === "yetkiekle") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
            return message.reply("❌ Admin değilsin.");

        const role = message.mentions.roles.first();
        if (!role) return message.reply("`.yetkiekle @rol`");

        botStaffRoles.add(role.id);
        return message.reply(`🛡 ${role} artık bot yetkilisi.`);
    }

    if (cmd === "yetkicikar") {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
            return message.reply("❌ Admin değilsin.");

        const role = message.mentions.roles.first();
        if (!role) return message.reply("`.yetkicikar @rol`");

        botStaffRoles.delete(role.id);
        return message.reply(`🛡 ${role} bot yetkisi kaldırıldı.`);
    }

    if (cmd === "yetkiler") {
        if (botStaffRoles.size === 0) return message.reply("🛡 Yetkili rol yok.");
        return message.reply([...botStaffRoles].map(id => `<@&${id}>`).join("\n"));
    }

    // ================ FORCEBAN ================
    if (cmd === "forceban") {
        if (message.author.id !== FORCE_BAN_OWNER)
            return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir.");

        let targetId = message.mentions.users.first()?.id || args.shift();
        if (!targetId) return message.reply("`.forceban @kullanıcı sebep`");

        const reason = args.join(" ") || "Forceban";

        forceBannedUsers.add(targetId);

        try {
            await message.guild.bans.create(targetId, { reason });
        } catch {}

        return message.reply(`🚫 Forceban uygulandı: \`${targetId}\``);
    }

    if (cmd === "unforceban") {
        if (message.author.id !== FORCE_BAN_OWNER)
            return message.reply("❌ Bu komutu sadece bot sahibi kullanabilir.");

        let targetId = message.mentions.users.first()?.id || args.shift();

        forceBannedUsers.delete(targetId);

        try {
            await message.guild.bans.remove(targetId);
        } catch {}

        return message.reply(`✅ Unforceban: \`${targetId}\``);
    }

    // ================ OTOBAN KOMUTLARI ================
    if (cmd === "otoban") {
        if (!hasBotPermission(message.member))
            return message.reply("❌ Yetkin yok.");

        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("`.otoban #kanal limit açıklama`");

        args.shift();
        const limit = Number(args.shift());
        const title = args.join(" ");

        if (!limit || !title) return message.reply("Limit + açıklama gir.");

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
            channelId: channel.id,
        });

        return message.reply(`✔ OtoBan ${channel} kanalında açıldı.`);
    }

    if (cmd === "otoban-bitir") {
        if (!hasBotPermission(message.member))
            return message.reply("❌ Yetkin yok.");

        const event = [...otobanEvents.entries()].find(([_, d]) => d.channelId === message.channel.id && !d.closed);
        if (!event) return message.reply("Aktif otoban yok.");

        const [msgId, data] = event;
        const msg = await message.channel.messages.fetch(msgId);

        data.closed = true;
        msg.reactions.removeAll().catch(() => {});
        await updateOtobanMessage(msg, data);

        return message.reply("✔ OtoBan kapatıldı.");
    }

    if (cmd === "otobanekle") {
        if (!hasBotPermission(message.member))
            return message.reply("❌ Yetkin yok.");

        const user = message.mentions.users.first();
        if (!user) return message.reply("`.otobanekle @kullanıcı`");

        const event = [...otobanEvents.entries()].find(([_, d]) => d.channelId === message.channel.id && !d.closed);
        if (!event) return message.reply("Aktif otoban yok.");

        const [msgId, data] = event;
        data.participants.add(user.id);

        const msg = await message.channel.messages.fetch(msgId);
        await updateOtobanMessage(msg, data);

        return message.reply(`✔ ${user} listeye eklendi.`);
    }

    if (cmd === "otobançıkar" || cmd === "otobancikar") {
        if (!hasBotPermission(message.member))
            return message.reply("❌ Yetkin yok.");

        const user = message.mentions.users.first();
        if (!user) return message.reply("`.otobançıkar @kullanıcı`");

        const event = [...otobanEvents.entries()].find(([_, d]) => d.channelId === message.channel.id && !d.closed);
        if (!event) return message.reply("Aktif otoban yok.");

        const [msgId, data] = event;
        data.participants.delete(user.id);

        const msg = await message.channel.messages.fetch(msgId);
        await updateOtobanMessage(msg, data);

        return message.reply(`✔ ${user} çıkarıldı.`);
    }

    // ================ DM @ROL MESAJ ================
    if (cmd === "dm") {
        if (!hasBotPermission(message.member))
            return message.reply("❌ Yetkin yok.");

        const role = message.mentions.roles.first();
        if (!role) return message.reply("`.dm @rol mesaj`");

        args.shift();
        const text = args.join(" ");
        if (!text) return message.reply("Mesaj içeriği gir.");

        const members = await message.guild.members.fetch();
        const targets = members.filter(m => m.roles.cache.has(role.id) && !m.user.bot);

        let ok = 0, fail = 0;
        for (const m of targets.values()) {
            try {
                await m.send(text);
                ok++;
            } catch { fail++; }
        }

        return message.reply(`✉️ DM tamamlandı. Başarılı: ${ok} | Başarısız: ${fail}`);
    }

    // ================ BAŞVURU PANELİ ================
    if (cmd === "basvurupanel") {
        if (!hasBotPermission(message.member))
            return message.reply("❌ Yetkin yok.");

        const role = message.mentions.roles.first();
        if (!role) return message.reply("`.basvurupanel @YetkiliRol`");

        const embed = new EmbedBuilder()
            .setTitle("📨 Başvuru Paneli")
            .setColor("#000000")
            .setDescription("Butona tıklayarak başvuru kanalı açabilirsin.");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`apply_create:${role.id}`)
                .setLabel("Başvuru Aç")
                .setStyle(ButtonStyle.Success)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        return message.reply("Başvuru paneli oluşturuldu.");
    }

});

// ===================================================================
// BAŞVURU BUTTON SİSTEMİ
// ===================================================================
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith("apply_create:")) {
        await interaction.deferReply({ ephemeral: true });

        const roleId = interaction.customId.split(":")[1];
        const guild = interaction.guild;

        const baseName = `basvuru-${interaction.user.username}`
            .toLowerCase()
            .replace(/[^a-z0-9\-]/g, "")
            .slice(0, 20);

        const ch = await guild.channels.create({
            name: `${baseName}-${interaction.user.id.slice(-4)}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ],
        });

        await ch.send({
            content: `<@${interaction.user.id}> | <@&${roleId}>`,
            embeds: [
                new EmbedBuilder()
                    .setTitle("📨 Başvuru Açıldı")
                    .setColor("#000000")
                    .setDescription("Soruları yanıtla, iş bitince aşağıdan kapat.")
            ],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`apply_close:${roleId}:${interaction.user.id}`)
                        .setLabel("Kapat")
                        .setStyle(ButtonStyle.Danger)
                )
            ]
        });

        return interaction.editReply("Başvuru kanalın açıldı.");
    }

    if (interaction.customId.startsWith("apply_close:")) {
        const [, roleId, ownerId] = interaction.customId.split(":");

        const isOwner = interaction.user.id === ownerId;
        const isStaff = interaction.member.roles.cache.has(roleId);

        if (!isOwner && !isStaff)
            return interaction.reply({ content: "❌ Yetkin yok.", ephemeral: true });

        const channel = interaction.channel;

        await channel.permissionOverwrites.edit(ownerId, { ViewChannel: false }).catch(() => {});
        await channel.setName(`closed-${channel.name}`.slice(0, 32)).catch(() => {});

        return interaction.reply("🔒 Başvuru kapatıldı ve kanal saklandı.");
    }
});

// ===================================================================
// OTOBAN REACTION SİSTEMİ
// ===================================================================
client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    try {
        if (reaction.partial) await reaction.fetch();
    } catch {}

    if (reaction.emoji.name !== "✅") return;

    const msg = reaction.message;
    const data = otobanEvents.get(msg.id);
    if (!data) return;

    if (data.closed) {
        reaction.users.remove(user.id).catch(() => {});
        return;
    }

    if (data.participants.size >= data.max) {
        reaction.users.remove(user.id).catch(() => {});
        return;
    }

    data.participants.add(user.id);

    if (data.participants.size >= data.max) {
        data.closed = true;
        reaction.message.reactions.removeAll().catch(() => {});
    }

    updateOtobanMessage(msg, data);
});

client.on("messageReactionRemove", async (reaction, user) => {
    if (user.bot) return;
    try { if (reaction.partial) await reaction.fetch(); } catch {}

    const msg = reaction.message;
    const data = otobanEvents.get(msg.id);
    if (!data || data.closed) return;

    if (data.participants.has(user.id)) {
        data.participants.delete(user.id);
        updateOtobanMessage(msg, data);
    }
});

// ===================================================================
// FORCEBAN WATCHER
// ===================================================================
client.on("guildBanRemove", async (ban) => {
    const userId = ban.user.id;

    if (!forceBannedUsers.has(userId)) return;

    await ban.guild.bans.create(userId, {
        reason: "Forceban koruması: tekrar banlandı."
    });
});

// ===================================================================
// BIO KONTROL SİSTEMİ — ROL BYPASS DESTEKLİ
// ===================================================================
client.on("userUpdate", async (oldUser, newUser) => {
    try {
        const oldBio = oldUser.bio || "";
        const newBio = newUser.bio || "";

        if (oldBio === newBio) return;

        const required = ["discord.gg/kaisenst", "kaisenst", "/kaisenst"];
        const isValid = required.some(tag =>
            newBio.toLowerCase().includes(tag.toLowerCase())
        );

        if (isValid) return;
        if (!bioKontrolChannel) return;

        for (const guild of client.guilds.cache.values()) {
            const member = guild.members.cache.get(newUser.id);
            if (!member) continue;

            // ROL BYPASS
            if (bioIgnoreRole && member.roles.cache.has(bioIgnoreRole)) continue;

            // Bot yetkilisi ve admin bypass
            if (
                member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                member.roles.cache.some(r => botStaffRoles.has(r.id))
            ) continue;

            const logCh = guild.channels.cache.get(bioKontrolChannel);
            if (logCh) {
                logCh.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("Red")
                            .setTitle("⚠️ BIO TAG EKSİK")
                            .setDescription(`${member} gerekli tagleri bio’ya eklememiş.`)
                            .addFields(
                                { name: "Bio:", value: `\`\`\`${newBio || "Boş"}\`\`\`` },
                                { name: "Gerekli Tagler:", value: "`discord.gg/kaisenst`\n`kaisenst`\n`/kaisenst`" }
                            )
                    ]
                });
            }

            try {
                await member.send(
                    "⚠️ Kaisen Bio Kontrol\nBio’nuzda zorunlu tag yok.\nEkleyiniz:\n• discord.gg/kaisenst\n• kaisenst\n• /kaisenst"
                );
            } catch {}
        }
    } catch (err) {
        console.error("Bio kontrol hatası:", err);
    }
});

// ===================================================================
// BOTU BAŞLAT
// ===================================================================
client.login(TOKEN);
