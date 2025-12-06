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
const TOKEN = process.env.TOKEN;         // BOT TOKEN (Render env)
const CLIENT_ID = process.env.CLIENT_ID; // APPLICATION ID (Render env)
const GUILD_ID = process.env.GUILD_ID;   // KAISEN SUNUCU ID (Render env)

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.log('⚠ TOKEN, CLIENT_ID veya GUILD_ID environment değişkenleri eksik!');
}

// ------------- CLIENT -------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ------------- SLASH KOMUTLARI TANIMI -------------
const commands = [
    {
        name: 'otoban',
        description: 'Belirli sayıda kişi alabileceğin etkinlik / otoban oluştur.',
        options: [
            {
                name: 'kanal',
                description: 'Etkinlik mesajının atılacağı kanal',
                type: 7, // CHANNEL
                required: true,
            },
            {
                name: 'kisi_sayisi',
                description: 'Maksimum kişi sayısı',
                type: 4, // INTEGER
                required: true,
            },
            {
                name: 'aciklama',
                description: 'Etkinlik açıklaması',
                type: 3, // STRING
                required: true,
            },
        ],
    },
    {
        name: 'ban',
        description: 'Bir kullanıcıyı sunucudan yasakla.',
        options: [
            {
                name: 'kullanici',
                description: 'Yasaklanacak kullanıcı',
                type: 6, // USER
                required: true,
            },
            {
                name: 'sebep',
                description: 'Ban sebebi',
                type: 3, // STRING
                required: false,
            },
        ],
    },
    {
        name: 'unban',
        description: 'Yasaklı bir kullanıcının banını kaldır.',
        options: [
            {
                name: 'kullanici_id',
                description: 'Banı kaldırılacak kişinin ID\'si',
                type: 3, // STRING
                required: true,
            },
            {
                name: 'sebep',
                description: 'Unban sebebi',
                type: 3, // STRING
                required: false,
            },
        ],
    },
    {
        name: 'ticketpanel',
        description: 'Ticket açma paneli oluştur.',
        options: [
            {
                name: 'yetkili_rol',
                description: 'Ticketlarla ilgilenecek admin/yetkili rolü',
                type: 8, // ROLE
                required: true,
            },
        ],
    },
];

// ------------- OTOBAN / ETKİNLİK VERİLERİ -------------
/*
    Map: key = messageId
    value = {
        max: number,
        description: string,
        participants: Set<userId>,
        closed: boolean,
        channelId: string,
        ownerId: string
    }
*/
const otobanEvents = new Map();

// ------------- READY -------------
client.once('ready', async () => {
    console.log(`✅ Bot giriş yaptı: ${client.user.tag}`);

    // Yayın yapan status
    client.user.setPresence({
        activities: [
            {
                name: 'Kaisen Sunucusu',
                type: ActivityType.Streaming,
                url: 'https://twitch.tv/discord',
            },
        ],
        status: 'online',
    });

    // Slash komutlarını SADECE Kaisen sunucusuna yükle
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.commands.set(commands);
        console.log('✅ Slash komutları Kaisen sunucusuna yüklendi.');
    } catch (err) {
        console.error('Slash komutları yüklenirken hata:', err);
    }
});

// ------------- ETKİLEŞİM (SLASH & BUTTON) -------------
client.on('interactionCreate', async (interaction) => {
    try {
        // SLASH KOMUTLAR
        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;

            // /otoban
            if (commandName === 'otoban') {
                const channel = interaction.options.getChannel('kanal');
                const max = interaction.options.getInteger('kisi_sayisi');
                const desc = interaction.options.getString('aciklama');

                if (!channel || channel.type !== ChannelType.GuildText) {
                    return interaction.reply({
                        content: 'Lütfen metin kanalı seç.',
                        ephemeral: true,
                    });
                }

                if (max < 1) {
                    return interaction.reply({
                        content: 'Kişi sayısı en az 1 olmalı.',
                        ephemeral: true,
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle('🎟️ OTOBAN / ETKİNLİK KAYIT')
                    .setDescription(desc)
                    .addFields(
                        { name: 'Kişi Sınırı', value: `${max}`, inline: true },
                        { name: 'Durum', value: 'Kayıtlar açık.', inline: true },
                        { name: 'Liste', value: 'Henüz kimse katılmadı.' },
                    )
                    .setColor('Aqua')
                    .setFooter({ text: `Oluşturan: ${interaction.user.tag}` })
                    .setTimestamp();

                const msg = await channel.send({ embeds: [embed] });
                await msg.react('✅');

                otobanEvents.set(msg.id, {
                    max,
                    description: desc,
                    participants: new Set(),
                    closed: false,
                    channelId: channel.id,
                    ownerId: interaction.user.id,
                });

                return interaction.reply({
                    content: `✅ Oto-ban / etkinlik mesajı ${channel} kanalına gönderildi. Katılmak için kullanıcılar ✅ emojisine tıklayacak.`,
                    ephemeral: true,
                });
            }

            // /ban
            if (commandName === 'ban') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                    return interaction.reply({
                        content: 'Bu komutu kullanmak için **Üyeleri Yasakla** yetkisine sahip olmalısın.',
                        ephemeral: true,
                    });
                }

                const user = interaction.options.getUser('kullanici');
                const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';

                const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                if (!member) {
                    return interaction.reply({
                        content: 'Kullanıcı sunucuda bulunamadı.',
                        ephemeral: true,
                    });
                }

                if (member.id === interaction.user.id) {
                    return interaction.reply({
                        content: 'Kendini banlayamazsın.',
                        ephemeral: true,
                    });
                }

                if (member.roles.highest.position >= interaction.member.roles.highest.position &&
                    interaction.guild.ownerId !== interaction.user.id) {
                    return interaction.reply({
                        content: 'Bu kişiyi banlayamıyorsun. (Rolü senden yüksek veya eşit.)',
                        ephemeral: true,
                    });
                }

                await member.ban({ reason }).catch((err) => {
                    console.error(err);
                    return interaction.reply({
                        content: 'Kullanıcı banlanırken bir hata oluştu.',
                        ephemeral: true,
                    });
                });

                return interaction.reply({
                    content: `✅ ${user.tag} sunucudan banlandı.\nSebep: **${reason}**`,
                });
            }

            // /unban
            if (commandName === 'unban') {
                if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                    return interaction.reply({
                        content: 'Bu komutu kullanmak için **Üyeleri Yasakla** yetkisine sahip olmalısın.',
                        ephemeral: true,
                    });
                }

                const userId = interaction.options.getString('kullanici_id');
                const reason = interaction.options.getString('sebep') || 'Sebep belirtilmedi';

                try {
                    await interaction.guild.bans.remove(userId, reason);
                    return interaction.reply({
                        content: `✅ <@${userId}> kullanıcısının banı kaldırıldı.\nSebep: **${reason}**`,
                    });
                } catch (err) {
                    console.error(err);
                    return interaction.reply({
                        content: 'Ban kaldırılırken bir hata oluştu. ID doğru mu, kullanıcı gerçekten banlı mı kontrol et.',
                        ephemeral: true,
                    });
                }
            }

            // /ticketpanel
            if (commandName === 'ticketpanel') {
                const role = interaction.options.getRole('yetkili_rol');

                const embed = new EmbedBuilder()
                    .setTitle('🎫 Kaisen Ticket Sistemi')
                    .setDescription(
                        'Bir sorun, istek veya başvurun mu var?\n\n' +
                        'Aşağıdaki butona tıklayarak bir **ticket açabilirsin**.\n' +
                        'Ticket açıldığında sadece sen ve yetkililer görebilir.'
                    )
                    .setColor('Green');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_create:${role.id}`)
                        .setLabel('🎫 Ticket Aç')
                        .setStyle(ButtonStyle.Success),
                );

                await interaction.reply({
                    content: '✅ Ticket paneli oluşturuldu.',
                    ephemeral: true,
                });

                await interaction.channel.send({ embeds: [embed], components: [row] });
            }
        }

        // BUTTONLAR
        if (interaction.isButton()) {
            // Ticket oluşturma
            if (interaction.customId.startsWith('ticket_create:')) {
                const staffRoleId = interaction.customId.split(':')[1];
                const guild = interaction.guild;

                const existing = guild.channels.cache.find(
                    (ch) =>
                        ch.type === ChannelType.GuildText &&
                        ch.name.includes(`ticket-${interaction.user.id}`) &&
                        ch.permissionsFor(interaction.user.id)?.has(PermissionsBitField.Flags.ViewChannel)
                );
                if (existing) {
                    return interaction.reply({
                        content: `Zaten açık bir ticket kanalın var: ${existing}`,
                        ephemeral: true,
                    });
                }

                const baseName = `ticket-${interaction.user.username}`
                    .toLowerCase()
                    .replace(/[^a-z0-9\-]/g, '')
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

                const ticketEmbed = new EmbedBuilder()
                    .setTitle('🎫 Ticket Açıldı')
                    .setDescription(
                        `Merhaba ${interaction.user},\n` +
                        'Yetkililer kısa süre içinde seninle ilgilenecek.\n\n' +
                        'İşin bittiyse aşağıdaki butondan ticketı kapatabilirsin.'
                    )
                    .setColor('Blue')
                    .setTimestamp();

                const closeRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`ticket_close:${staffRoleId}:${interaction.user.id}`)
                        .setLabel('🔒 Ticket Kapat')
                        .setStyle(ButtonStyle.Danger),
                );

                await ticketChannel.send({
                    content: `<@${interaction.user.id}> | <@&${staffRoleId}>`,
                    embeds: [ticketEmbed],
                    components: [closeRow],
                });

                return interaction.reply({
                    content: `✅ Ticket kanalın açıldı: ${ticketChannel}`,
                    ephemeral: true,
                });
            }

            // Ticket kapatma
            if (interaction.customId.startsWith('ticket_close:')) {
                const [, staffRoleId, ownerId] = interaction.customId.split(':');
                const channel = interaction.channel;

                const isOwner = interaction.user.id === ownerId;
                const isStaff = interaction.member.roles.cache.has(staffRoleId) ||
                    interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

                if (!isOwner && !isStaff) {
                    return interaction.reply({
                        content: 'Bu ticketı kapatmak için yetkin yok.',
                        ephemeral: true,
                    });
                }

                // Sahip artık göremesin
                await channel.permissionOverwrites.edit(ownerId, {
                    ViewChannel: false,
                    SendMessages: false,
                }).catch(() => {});

                // Staff/admin görmeye devam etsin
                await channel.permissionOverwrites.edit(staffRoleId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                }).catch(() => {});

                // Kanal adı closed- ile başlasın
                if (!channel.name.startsWith('closed-')) {
                    const newName = `closed-${channel.name}`.slice(0, 30);
                    await channel.setName(newName).catch(() => {});
                }

                // Butonu disable et
                let components = [];
                if (interaction.message.components?.length) {
                    const row = ActionRowBuilder.from(interaction.message.components[0]);
                    if (row.components[0]) {
                        const btn = ButtonBuilder.from(row.components[0]).setDisabled(true);
                        components = [new ActionRowBuilder().addComponents(btn)];
                    }
                }

                const closedEmbed = new EmbedBuilder()
                    .setTitle('🔒 Ticket Kapatıldı')
                    .setDescription(
                        'Ticket kapatıldı. Kanal silinmedi, sadece yetkililer görebiliyor.\n' +
                        'Gerekirse geçmiş konuşmaları buradan inceleyebilirsiniz.'
                    )
                    .setColor('Red')
                    .setTimestamp();

                await interaction.update({
                    embeds: [closedEmbed],
                    components,
                });
            }
        }
    } catch (err) {
        console.error('interactionCreate hatası:', err);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: 'Bir hata oluştu.', ephemeral: true });
            }
        } catch (_) {}
    }
});

// ------------- OTOBAN YARDIMCI FONKSİYON -------------
async function handleOtobanUpdate(message) {
    const data = otobanEvents.get(message.id);
    if (!data) return;

    const participantsArray = Array.from(data.participants);

    const listText =
        participantsArray.length === 0
            ? 'Henüz kimse katılmadı.'
            : participantsArray.map((id, index) => `${index + 1}. <@${id}>`).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(data.closed ? '🎟️ OTOBAN / ETKİNLİK KAYIT (KAPANDI)' : '🎟️ OTOBAN / ETKİNLİK KAYIT')
        .setDescription(data.description)
        .addFields(
            { name: 'Kişi Sınırı', value: `${data.max}`, inline: true },
            {
                name: 'Durum',
                value: data.closed
                    ? 'Kayıtlar kapandı. Aşağıda son listeyi görüyorsun.'
                    : 'Kayıtlar açık. ✅ emojisine basarak katılabilirsin.',
                inline: true,
            },
            { name: 'Liste', value: listText },
        )
        .setColor(data.closed ? 'Red' : 'Aqua')
        .setFooter({ text: 'Kaisen OtoBan Sistemi' })
        .setTimestamp();

    await message.edit({ embeds: [embed] }).catch(() => {});
}

// ------------- REACTION HANDLER (OTOBAN) -------------
client.on('messageReactionAdd', async (reaction, user) => {
    try {
        if (user.bot) return;
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch {
                return;
            }
        }

        const data = otobanEvents.get(reaction.message.id);
        if (!data) return;
        if (reaction.emoji.name !== '✅') return;

        // Kayıtlar kapalıysa yeni kişi alma
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

        const msg = await reaction.message.fetch().catch(() => null);
        if (!msg) return;

        // Limit dolduysa kayıtları kapat ve tiki kaldır
        if (data.participants.size >= data.max) {
            data.closed = true;
            const r = msg.reactions.resolve('✅');
            if (r) {
                await r.remove().catch(() => {});
            }
        }

        await handleOtobanUpdate(msg);
    } catch (err) {
        console.error('messageReactionAdd hatası:', err);
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    try {
        if (user.bot) return;
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch {
                return;
            }
        }

        const data = otobanEvents.get(reaction.message.id);
        if (!data) return;
        if (reaction.emoji.name !== '✅') return;

        // Etkinlik hala açıksa listeden çıkar
        if (!data.closed && data.participants.has(user.id)) {
            data.participants.delete(user.id);
            const msg = await reaction.message.fetch().catch(() => null);
            if (msg) await handleOtobanUpdate(msg);
        }
    } catch (err) {
        console.error('messageReactionRemove hatası:', err);
    }
});

// ------------- BOTU ÇALIŞTIR -------------
client.login(TOKEN);
