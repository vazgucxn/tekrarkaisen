// ===================== Kaisen Discord Bot (Full Sistem) =====================
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
const zlib = require("zlib");

// ===================== AYARLAR =====================
const PREFIX = ".";
const OWNER = "827905938923978823"; // her şeyin sahibi sensin

// ===================== KEEP ALIVE =====================
const app = express();
app.get("/", (_, res) => res.send("Kaisen Bot Çalışıyor"));
app.listen(process.env.PORT || 3000);

// ===================== TOKEN KONTROL =====================
const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) {
    console.error("❌ DISCORD_BOT_TOKEN bulunamadı.");
    process.exit(1);
}

// ===================== CLIENT =====================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildBans
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ===================== GLOBAL VERİLER =====================
const etkinlikEvents = new Map();
const forceBanned = new Set();
const botStaff = new Set();

let bioKontrolChannel = null;
let bioIgnoreRoles = new Set();

// ================================================================
//                     YETKİ KONTROL FONKSİYONU
// ================================================================
function hasPerm(member) {
    return (
        member.id === OWNER ||
        member.permissions.has(PermissionsBitField.Flags.Administrator) ||
        [...botStaff].some(id => member.roles.cache.has(id))
    );
}

// ================================================================
//                     BOT READY
// ================================================================
client.once("ready", () => {
    console.log(`Bot aktif: ${client.user.tag}`);

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

// ================================================================
//                     REKLAM ENGEL
// ================================================================
const adWords = ["discord.gg", "http://", "https://", "t.me/", "instagram.com"];

client.on("messageCreate", message => {
    if (!message.guild || message.author.bot) return;

    if (hasPerm(message.member)) return;

    const msg = message.content.toLowerCase();
    if (adWords.some(w => msg.includes(w))) {
        message.delete().catch(() => {});
        message.channel.send(`⚠️ ${message.author}, reklam yasak!`).then(m => {
            setTimeout(() => m.delete().catch(() => {}), 3000);
        });
    }
});

// ================================================================
//                     YARDIM MENÜSÜ
// ================================================================
function sendHelp(channel) {
    const embed = new EmbedBuilder()
        .setTitle("🛠 Kaisen Yardım Menüsü")
        .setColor("#000000")
        .addFields(
            {
                name: "🎯 Etkinlik Sistemi",
                value:
                    "`" +
                    ".etkinlik #kanal limit açıklama\n" +
                    ".etkinlik-bitir\n" +
                    ".etkinlik-ekle @kullanıcı\n" +
                    ".etkinlik-çıkar @kullanıcı\n" +
                    "`"
            },
            {
                name: "🚫 ForceBan",
                value:
                    "`.forceban @kullanıcı/id sebep`\n" +
                    "`.unforceban @kullanıcı/id` (Sadece **sahip**)"
            },
            {
                name: "📨 Başvuru Sistemi",
                value: "`.basvurupanel @YetkiliRol`"
            },
            {
                name: "📩 DM Sistemi",
                value: "`.dm @rol mesaj`"
            },
            {
                name: "🛡 Yetkili Yönetimi",
                value:
                    "`.yetkiekle @rol`\n" +
                    "`.yetkicikar @rol`\n" +
                    "`.yetkiler`"
            },
            {
                name: "📝 Bio Kontrol",
                value:
                    "`.bio-kontrol #kanal`\n" +
                    "`.bio-kontrol-rol @rol`\n" +
                    "`.bio-tara @kullanıcı`\n" +
                    "`.kontrol @rol`"
            },
            {
                name: "💾 Backup Sistemi",
                value:
                    "`.backup` (Yedek alır – sadece sahip)\n" +
                    "`.startbackup` (Yedeği yükler – sadece sahip)"
            }
        );

    channel.send({ embeds: [embed] });
}

// ================================================================
//                     PREFIX KOMUTLARI
// ================================================================
client.on("messageCreate", async message => {
    if (!message.guild || message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const cmd = args.shift()?.toLowerCase();

    // -----------------------------------------------------------
    // Yardım
    // -----------------------------------------------------------
    if (cmd === "yardım" || cmd === "yardim") return sendHelp(message.channel);

    // -----------------------------------------------------------
    // Yetkili Ekle / Çıkar
    // -----------------------------------------------------------
    if (cmd === "yetkiekle") {
        if (!hasPerm(message.member)) return message.reply("❌ Yetkin yok.");
        const role = message.mentions.roles.first();
        if (!role) return message.reply("Kullanım: `.yetkiekle @rol`");

        botStaff.add(role.id);
        return message.reply(`✔ ${role} bot yetkilisi olarak eklendi.`);
    }

    if (cmd === "yetkicikar") {
        if (!hasPerm(message.member)) return message.reply("❌ Yetkin yok.");
        const role = message.mentions.roles.first();
        if (!role) return message.reply("Kullanım: `.yetkicikar @rol`");

        botStaff.delete(role.id);
        return message.reply(`✔ ${role} artık bot yetkilisi değil.`);
    }

    if (cmd === "yetkiler") {
        if (botStaff.size === 0) return message.reply("Henüz yetkili yok.");

        return message.reply(
            [...botStaff].map(id => `<@&${id}>`).join("\n")
        );
    }

    // ================================================================
    //                     ETKİNLİK SİSTEMİ
    // ================================================================
    if (cmd === "etkinlik") {
        if (!hasPerm(message.member)) return message.reply("❌ Yetkin yok.");

        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("Kullanım: `.etkinlik #kanal limit açıklama`");

        args.shift();
        const limit = Number(args.shift());
        if (!limit || limit < 1) return message.reply("Limit hatalı.");

        const desc = args.join(" ");
        if (!desc) return message.reply("Açıklama gir.");

        const embed = new EmbedBuilder()
            .setTitle("🎟️ ETKİNLİK")
            .setColor("#000000")
            .setDescription(desc)
            .addFields(
                { name: "Limit", value: `${limit}` },
                { name: "Durum", value: "Açık" },
                { name: "Katılımcılar", value: "Henüz kimse yok." }
            );

        const msg = await channel.send({ embeds: [embed] });
        await msg.react("✔️");

        etkinlikEvents.set(msg.id, {
            max: limit,
            title: desc,
            participants: new Set(),
            closed: false,
            channelId: channel.id
        });

        return message.reply(`✔ Etkinlik başlatıldı: ${channel}`);
    }

    if (cmd === "etkinlik-bitir") {
        if (!hasPerm(message.member)) return message.reply("❌ Yetkin yok.");

        let found = null;
        for (const [id, data] of etkinlikEvents.entries()) {
            if (data.channelId === message.channel.id && !data.closed)
                found = { id, data };
        }

        if (!found) return message.reply("Bu kanalda açık etkinlik yok.");

        const msg = await message.channel.messages.fetch(found.id);

        found.data.closed = true;

        const react = msg.reactions.resolve("✔️");
        if (react) react.remove().catch(() => {});

        const final = [...found.data.participants].map((id, i) => `${i + 1}. <@${id}>`).join("\n");

        await msg.edit({
            content: `🎟️ **Etkinlik Bitti**\n${final || "Kimse katılmadı."}`,
            embeds: []
        });

        return message.reply("✔ Etkinlik kapatıldı.");
    }

    if (cmd === "etkinlik-ekle") {
        if (!hasPerm(message.member)) return message.reply("❌ Yetkin yok.");

        let found = null;
        for (const [id, data] of etkinlikEvents.entries()) {
            if (data.channelId === message.channel.id && !data.closed)
                found = { id, data };
        }

        if (!found) return message.reply("Açık etkinlik yok.");

        const user = message.mentions.users.first();
        if (!user) return message.reply("`.etkinlik-ekle @kullanıcı`");

        found.data.participants.add(user.id);

        return message.reply(`✔ ${user} eklendi.`);
    }

    if (cmd === "etkinlik-çıkar" || cmd === "etkinlik-cikar") {
        if (!hasPerm(message.member)) return message.reply("❌ Yetkin yok.");

        let found = null;
        for (const [id, data] of etkinlikEvents.entries()) {
            if (data.channelId === message.channel.id && !data.closed)
                found = { id, data };
        }

        if (!found) return message.reply("Açık etkinlik yok.");

        const user = message.mentions.users.first();
        if (!user) return message.reply("`.etkinlik-çıkar @kullanıcı`");

        found.data.participants.delete(user.id);

        return message.reply(`✔ ${user} çıkarıldı.`);
    }

    // ================================================================
    //                     FORCEBAN SİSTEMİ
    // ================================================================
    if (cmd === "forceban") {
        if (message.author.id !== OWNER) return message.reply("❌ Bu komut sadece SAHİP kullanabilir.");

        let target = message.mentions.users.first()?.id || args.shift();
        if (!target) return message.reply("Kullanım: `.forceban @kullanıcı sebep`");

        forceBanned.add(target);

        try {
            await message.guild.bans.create(target, { reason: "ForceBan" });
        } catch {}

        return message.reply(`🚫 Forceban uygulandı → ${target}`);
    }

    if (cmd === "unforceban") {
        if (message.author.id !== OWNER) return message.reply("❌ Bu komut sadece SAHİP kullanabilir.");

        let target = message.mentions.users.first()?.id || args.shift();
        if (!target) return message.reply("Kullanım: `.unforceban @kullanıcı`");

        forceBanned.delete(target);

        try {
            await message.guild.bans.remove(target);
        } catch {}

        return message.reply(`✔ Unforceban → ${target}`);
    }

    // ================================================================
    //                     BACKUP ALMA (sadece SAHİP)
    // ================================================================
    if (cmd === "backup") {
        if (message.author.id !== OWNER)
            return message.reply("❌ Bu komutu sadece SAHİP kullanabilir.");

        const guild = message.guild;

        const data = {
            name: guild.name,
            channels: [],
            roles: []
        };

        guild.roles.cache.forEach(role => {
            data.roles.push({
                name: role.name,
                color: role.color,
                perms: role.permissions.bitfield,
                hoist: role.hoist
            });
        });

        guild.channels.cache.forEach(ch => {
            data.channels.push({
                name: ch.name,
                type: ch.type,
                parent: ch.parentId
            });
        });

        const json = JSON.stringify(data, null, 2);
        const zip = zlib.gzipSync(json);

        fs.writeFileSync(path.join(__dirname, "backup.zip"), zip);

        return message.reply("✔ Sunucu yedeği oluşturuldu (backup.zip)");
    }

    // ================================================================
    //                     BACKUP YÜKLEME
    // ================================================================
    if (cmd === "startbackup") {
        if (message.author.id !== OWNER)
            return message.reply("❌ Bu komutu sadece SAHİP kullanabilir.");

        const zipPath = path.join(__dirname, "backup.zip");
        if (!fs.existsSync(zipPath))
            return message.reply("❌ backup.zip bulunamadı.");

        message.reply("⚠️ **Sunucu sıfırlanacak!**\n`onayla` yazarak işlemi başlat.");

        const collected = await message.channel.awaitMessages({
            filter: m => m.author.id === OWNER,
            max: 1,
            time: 15000
        });

        if (!collected.first() || collected.first().content !== "onayla")
            return message.reply("❌ İşlem iptal edildi.");

        message.channel.send("⏳ Yedek yükleniyor...");

        const json = zlib.gunzipSync(fs.readFileSync(zipPath)).toString();
        const data = JSON.parse(json);

        // Rol, kanal vs restore etmek istiyorsan buraya eklenir.
        return message.channel.send("✔ Yedek okundu. (Sunucu restore kısmı manuel eklenebilir.)");
    }

});

// ================================================================
//              ETKİNLİK TEPKİ SİSTEMİ
// ================================================================
client.on("messageReactionAdd", async (r, user) => {
    if (user.bot) return;

    if (r.partial) await r.fetch();
    const msg = r.message;

    const data = etkinlikEvents.get(msg.id);
    if (!data) return;

    if (r.emoji.name !== "✔️") return;

    if (data.closed) {
        r.users.remove(user.id);
        return;
    }

    if (data.participants.has(user.id)) return;

    if (data.participants.size >= data.max) {
        r.users.remove(user.id);
        return;
    }

    data.participants.add(user.id);

    if (data.participants.size >= data.max) {
        data.closed = true;
        const react = msg.reactions.resolve("✔️");
        if (react) react.remove().catch(() => {});
    }
});

// ================================================================
//              FORCEBAN KORUMA
// ================================================================
client.on("guildBanRemove", async ban => {
    if (!forceBanned.has(ban.user.id)) return;

    try {
        await ban.guild.bans.create(ban.user.id, {
            reason: "ForceBan Koruma"
        });
    } catch {}
});

// ================================================================
//                     BOT LOGIN
// ================================================================
client.login(TOKEN);
