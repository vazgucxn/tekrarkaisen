// ===================== Kaisen Özel Discord Botu =====================
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
} = require('discord.js');
const express = require('express');

// ------------- Render için mini web server -------------
const app = express();
app.get('/', (_req, res) => res.send('Kaisen bot aktif'));
app.listen(process.env.PORT || 3000, () => {
    console.log('Web sunucusu çalışıyor (Render için).');
});

// ------------- ENV DEĞİŞKENLERİ -------------
const TOKEN = process.env.DISCORD_BOT_TOKEN;  // <-- FİX: ARTIK BUNU OKUYOR
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

// LOG - Güvenli test
console.log(
    "ENV KONTROL:",
    "TOKEN uzunluk =", TOKEN ? TOKEN.length : 0,
    "| CLIENT_ID =", CLIENT_ID,
    "| GUILD_ID =", GUILD_ID
);

if (!TOKEN || TOKEN.length < 20) {
    console.error("❌ HATA: DISCORD_BOT_TOKEN environment değişkeni bulunamadı veya çok kısa!");
    process.exit(1);
}

// ------------- CLIENT OLUŞTURMA -------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ------------- SLASH KOMUTLARI -------------
const commands = [
    {
        name: 'otoban',
        description: 'Belirli sayıda kişi alabileceğin etkinlik / otoban oluştur.',
        options: [
            { name: 'kanal', type: 7, description: 'Mesajın gideceği kanal', required: true },
            { name: 'kisi_sayisi', type: 4, description: 'Maksimum kişi', required: true },
            { name: 'aciklama', type: 3, description: 'Etkinlik açıklaması', required: true },
        ],
    },
    {
        name: 'ban',
        description: 'Bir kullanıcıyı sunucudan yasakla',
        options: [
            { name: 'kullanici', type: 6, description: 'Banlanacak kişi', required: true },
            { name: 'sebep', type: 3, description: 'Ban sebebi', required: false },
        ],
    },
    {
        name: 'unban',
        description: 'Bir kullanıcının banını kaldır',
        options: [
            { name: 'kullanici_id', type: 3, description: 'Banı açılacak ID', required: true },
            { name: 'sebep', type: 3, description: 'Sebep', required: false },
        ],
    },
    {
        name: 'ticketpanel',
        description: 'Ticket paneli oluşturur',
        options: [
            { name: 'yetkili_rol', type: 8, description: 'Yetkili rolü', required: true },
        ],
    },
];

// Hafızada tutulan otoban eventleri
const otobanEvents = new Map();

// ---------------------- READY ----------------------
client.once("ready", async () => {
    console.log(`✅ Bot giriş yaptı: ${client.user.tag}`);

    // Slash komutları yükle
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.commands.set(commands);
        console.log("Slash komutları yüklendi.");
    } catch (err) {
        console.log("Slash komut yükleme hatası:", err);
    }

    // Yayın durumu
    client.user.setPresence({
        activities: [{ name: "Kaisen Sunucusu", type: ActivityType.Streaming, url: "https://twitch.tv/discord" }],
        status: "online",
    });
});

// ---------------------- KOMUTLAR ----------------------
client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // /otoban
    if (interaction.commandName === "otoban") {
        const channel = interaction.options.getChannel("kanal");
        const max = interaction.options.getInteger("kisi_sayisi");
        const desc = interaction.options.getString("aciklama");

        const embed = new EmbedBuilder()
            .setTitle("🎟️ OTOBAN / ETKİNLİK")
            .setDescription(desc)
            .addFields(
                { name: "Kişi Sınırı", value: `${max}`, inline: true },
                { name: "Durum", value: "Kayıtlar açık.", inline: true },
                { name: "Liste", value: "Henüz kimse katılmadı." },
            )
            .setColor("Aqua");

        const msg = await channel.send({ embeds: [embed] });
        await msg.react("✅");

        otobanEvents.set(msg.id, {
            max,
            description: desc,
            participants: new Set(),
            closed: false,
            channelId: channel.id,
        });

        return interaction.reply({ content: "Oto-ban oluşturuldu!", ephemeral: true });
    }

    // /ban
    if (interaction.commandName === "ban") {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
            return interaction.reply({ content: "Yetkin yok.", ephemeral: true });

        const user = interaction.options.getUser("kullanici");
        const reason = interaction.options.getString("sebep") || "Sebep belirtilmedi";

        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        if (!member) return interaction.reply({ content: "Bu kullanıcı sunucuda değil.", ephemeral: true });

        await member.ban({ reason });
        return interaction.reply({ content: `${user.tag} yasaklandı.`, ephemeral: false });
    }

    // /unban
    if (interaction.commandName === "unban") {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers))
            return interaction.reply({ content: "Yetkin yok.", ephemeral: true });

        const userId = interaction.options.getString("kullanici_id");
        await interaction.guild.bans.remove(userId).catch(() => null);

        return interaction.reply({ content: `Ban açıldı: <@${userId}>` });
    }

    // /ticketpanel
    if (interaction.commandName === "ticketpanel") {
        const role = interaction.options.getRole("yetkili_rol");

        const embed = new EmbedBuilder()
            .setTitle("🎫 Ticket Paneli")
            .setDescription("Bir ticket açmak için aşağıdaki butona bas!")
            .setColor("Green");

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`ticket_create:${role.id}`)
                .setLabel("🎫 Ticket Aç")
                .setStyle(ButtonStyle.Success)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: "Ticket paneli oluşturuldu.", ephemeral: true });
    }
});

// ---------------------- OTOBAN REACTION ----------------------
client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    if (reaction.emoji.name !== "✅") return;

    const data = otobanEvents.get(reaction.message.id);
    if (!data) return;

    if (data.closed) return reaction.users.remove(user.id);

    data.participants.add(user.id);

    if (data.participants.size >= data.max) {
        data.closed = true;
        const r = reaction.message.reactions.resolve("✅");
        if (r) await r.remove();
    }

    updateOtobanEmbed(reaction.message, data);
});

client.on("messageReactionRemove", async (reaction, user) => {
    if (user.bot) return;

    const data = otobanEvents.get(reaction.message.id);
    if (!data || data.closed) return;

    data.participants.delete(user.id);
    updateOtobanEmbed(reaction.message, data);
});

async function updateOtobanEmbed(msg, data) {
    const participants = [...data.participants].map((id, i) => `${i + 1}. <@${id}>`).join("\n") || "Henüz kimse katılmadı.";

    const embed = new EmbedBuilder()
        .setTitle(data.closed ? "🎟️ OTOBAN (KAPANDI)" : "🎟️ OTOBAN ETKİNLİK")
        .setDescription(data.description)
        .addFields(
            { name: "Kişi Sınırı", value: `${data.max}`, inline: true },
            { name: "Durum", value: data.closed ? "Kayıt kapalı." : "Kayıtlar açık.", inline: true },
            { name: "Liste", value: participants },
        )
        .setColor(data.closed ? "Red" : "Aqua");

    msg.edit({ embeds: [embed] });
}

// ---------------------- BOTU BAŞLAT ----------------------
client.login(TOKEN);
