const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    ComponentType, ActivityType, ModalBuilder, TextInputBuilder, TextInputStyle, 
    ChannelType, PermissionFlagsBits, AuditLogEvent
} = require('discord.js'); 
const express = require('express'); 
const pg = require('pg'); 
const { Pool } = pg;       
const axios = require('axios'); 
// Ses kütüphaneleri isteğiniz üzerine kaldırılmıştır.

    // --- .etkinlik (Katıl – Ayrıl – SQL ile yönetim) ---
    if (command === '.etkinlik') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");

        const maxParticipants = parseInt(args[1]) || 20;
        const eventTitle = args.slice(2).join(" ");

        if (!eventTitle)
            return message.reply("Kullanım: `.etkinlik [Max Kişi] [Etkinlik Adı]`");

        const eventEmbed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle(`🎉 YENİ ETKİNLİK: ${eventTitle}`)
            .setDescription(`**Katılmak için aşağıdaki ✅ emojisine tıklayın!**`)
            .addFields([
                { name: `Katılımcılar (0/${maxParticipants})`, value: "(Henüz kimse katılmadı)" }
            ])
            .setFooter({ text: `Maksimum Katılımcı: ${maxParticipants}` })
            .setTimestamp();

        const sentMessage = await message.channel.send({
            content: "@here",
            embeds: [eventEmbed],
        });

        await sentMessage.react("✅").catch(console.error);

        // SQL'e etkinlik oluştur (MAX_COUNT, sadece bu mesaj bu etkinliktir diye işaret)
        await pool.query(
            `INSERT INTO etkinlik_katilim (message_id, user_id)
             VALUES ($1, $2)`,
            [sentMessage.id, "MAX_COUNT"]
        ).catch(console.error);

        const collector = sentMessage.createReactionCollector({ dispose: true });

        // --- KATILMA ---
        collector.on("collect", async (reaction, user) => {
            if (reaction.emoji.name !== "✅" || user.bot) return;

            try {
                const countCheck = await pool.query(
                    `SELECT * FROM etkinlik_katilim WHERE message_id = $1`,
                    [sentMessage.id]
                );
                const actualCount = countCheck.rowCount - 1; // MAX_COUNT hariç

                if (actualCount >= maxParticipants) {
                    // Etkinlik dolu
                    reaction.users.remove(user.id).catch(() => {});
                    return user.send("❌ Bu etkinlik dolu!").catch(() => {});
                }

                const exist = await pool.query(
                    `SELECT * FROM etkinlik_katilim 
                     WHERE message_id = $1 AND user_id = $2`,
                    [sentMessage.id, user.id]
                );

                if (exist.rowCount === 0) {
                    await pool.query(
                        `INSERT INTO etkinlik_katilim (message_id, user_id)
                         VALUES ($1, $2)`,
                        [sentMessage.id, user.id]
                    );
                }

                await updateEventEmbed(sentMessage);

            } catch (err) {
                console.error("Katılım hatası:", err);
            }
        });

        // --- AYRILMA (Tepkiyi kaldırırsa) ---
        collector.on("remove", async (reaction, user) => {
            if (reaction.emoji.name !== "✅" || user.bot) return;

            try {
                await pool.query(
                    `DELETE FROM etkinlik_katilim 
                     WHERE message_id = $1 AND user_id = $2`,
                    [sentMessage.id, user.id]
                );

                await updateEventEmbed(sentMessage);

            } catch (err) {
                console.error("Çıkarma hatası:", err);
            }
        });

        return;
    }

    // --- .etkinlik-bitir ---
    if (command === '.etkinlik-bitir') {
        if (!isOwner) return message.reply("Bu komutu kullanamazsın.");

        const msgId = args[1];
        if (!msgId) return message.reply("Kullanım: `.etkinlik-bitir [mesajID]`");

        try {
            await pool.query(
                `DELETE FROM etkinlik_katilim WHERE message_id = $1`,
                [msgId]
            );

            const channel = message.channel;
            const targetMsg = await channel.messages.fetch(msgId);

            const endedEmbed = EmbedBuilder.from(targetMsg.embeds[0])
                .setTitle("❌ Etkinlik Sona Erdi")
                .setDescription("Bu etkinlik artık kapatılmıştır.")
                .setFields([]);

            await targetMsg.edit({ embeds: [endedEmbed] });
            await targetMsg.reactions.removeAll().catch(console.error);

            return message.reply("Etkinlik başarıyla sonlandırıldı!");
        } catch (err) {
            console.error(err);
            return message.reply("Hata: Böyle bir etkinlik bulunamadı.");
        }
    }

    // --- .etkinlik-liste ---
    if (command === '.etkinlik-liste') {
        if (!isOwner) return message.reply("Bu komutu kullanamazsın.");

        const data = await pool.query(
            `SELECT DISTINCT message_id 
             FROM etkinlik_katilim 
             WHERE user_id = 'MAX_COUNT'`
        );

        if (data.rowCount === 0)
            return message.reply("Aktif bir etkinlik yok.");

        const list = data.rows
            .map(r => `• Mesaj ID: **${r.message_id}**`)
            .join("\n");

        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle("📋 Açık Etkinlikler")
            .setDescription(list);

        return message.reply({ embeds: [embed] });
    }

    // --- .etkinlik-sil ---
    if (command === '.etkinlik-sil') {
        if (!isOwner) return message.reply("Bu komutu kullanamazsın.");

        const msgId = args[1];
        if (!msgId) return message.reply("Kullanım: `.etkinlik-sil [mesajID]`");

        await pool.query(
            `DELETE FROM etkinlik_katilim WHERE message_id = $1`,
            [msgId]
        );

        return message.reply("SQL’den etkinlik verileri temizlendi.");
    }

    // --- .etekle ---
    if (command === '.etekle') {
        if (!isOwner) return message.reply("Bu komutu kullanamazsın.");

        const msgId = args[1];
        const user = message.mentions.users.first();

        if (!msgId || !user)
            return message.reply("Kullanım: `.etekle [mesajID] @kullanıcı`");

        const exists = await pool.query(
            `SELECT * FROM etkinlik_katilim WHERE message_id = $1 AND user_id = $2`,
            [msgId, user.id]
        );

        if (exists.rowCount > 0)
            return message.reply("Bu kullanıcı zaten etkinlikte.");

        await pool.query(
            `INSERT INTO etkinlik_katilim (message_id, user_id) VALUES ($1, $2)`,
            [msgId, user.id]
        );

        message.reply(`<@${user.id}> etkinliğe eklendi.`);

        let targetMsg;
        try {
            targetMsg = await message.channel.messages.fetch(msgId);
        } catch (err) {
            return message.reply("Etkinlik mesajı bu kanalda bulunamadı. Mesaj farklı kanalda olabilir.");
        }

        await updateEventEmbed(targetMsg);
        return;
    }

    // --- .etçıkar ---
    if (command === '.etçıkar') {
        if (!isOwner) return message.reply("Bu komutu sadece bot sahibi kullanabilir.");
        const member = message.mentions.users.first();
        if (!member) return message.reply("Lütfen çıkarılacak kullanıcıyı etiketleyin.");

        const result = await pool.query(
            "SELECT message_id FROM etkinlik_katilim WHERE user_id = 'MAX_COUNT' LIMIT 1"
        );

        if (result.rowCount === 0) {
            return message.reply("Aktif etkinlik bulunamadı!");
        }

        const etkinlikMessageId = result.rows[0].message_id;

        let eventMessage;
        try {
            eventMessage = await message.channel.messages.fetch(etkinlikMessageId);
        } catch (e) {
            return message.reply("Etkinlik mesajı bulunamadı (muhtemelen farklı kanalda veya silinmiş).");
        }

        await pool.query(
            "DELETE FROM etkinlik_katilim WHERE user_id = $1 AND message_id = $2",
            [member.id, etkinlikMessageId]
        );

        await updateEventEmbed(eventMessage);

        return message.reply(`<@${member.id}> etkinlikten çıkarıldı.`);
    }


// =======================================================
// 🔑 GİZLİ AYARLAR VE YAPILANDIRMALAR
// =======================================================

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN; 
const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;

// Lütfen kendi bot sahibi ID'lerinizi buraya ekleyin
let OWNER_IDS = ['827905938923978823', '1129811807570247761']; 

// 🚨 TICKET SİSTEMİ KATEGORİ ID'Sİ (ZORUNLU)
const TICKET_CATEGORY_ID = "1414937528682807400"; 

// Guard Ayarları
const GUARD_SETTINGS = {
    OWN_ID: '1446184127098523710', 
    KICK_LIMIT: 3, 
    BAN_LIMIT: 3, 
    TIMEFRAME: 10000, // 10 saniye (miliseconds)
    MAX_URLS: 1, // Sunucu içi URL limiti
    JOIN_LIMIT: 5, JOIN_TIMEFRAME: 10000 // Anti-Raid için
};

// =======================================================
// 💾 POSTGRESQL VERİTABANI VE İLK YÜKLEME
// =======================================================

const pool = new Pool({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
});

const actionCache = new Map(); 
let logChannelId = null; 
const joinTimestamps = new Map();

async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS owners (user_id VARCHAR(255) PRIMARY KEY, username VARCHAR(255));
            CREATE TABLE IF NOT EXISTS webhooks (type VARCHAR(50) PRIMARY KEY, url TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS log_settings (guild_id VARCHAR(255) PRIMARY KEY, channel_id VARCHAR(255) NOT NULL);
            CREATE TABLE IF NOT EXISTS etkinlik_katilim (message_id VARCHAR(255) NOT NULL, user_id VARCHAR(255) NOT NULL, PRIMARY KEY (message_id, user_id));
            CREATE TABLE IF NOT EXISTS user_strikes (user_id VARCHAR(255) PRIMARY KEY, strike_count INTEGER DEFAULT 0);
        `);

        console.log('✅ PostgreSQL temel tablolar ve Strike sistemi başarıyla hazırlandı.');

        const res = await pool.query('SELECT user_id FROM owners');
        if (res.rows.length === 0 && OWNER_IDS.length > 0) {
            for (const id of OWNER_IDS) {
                await pool.query('INSERT INTO owners (user_id, username) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [id, `Initial_${id}`]);
            }
        } else {
            OWNER_IDS = res.rows.map(row => row.user_id);
        }

        const logRes = await pool.query('SELECT channel_id FROM log_settings LIMIT 1');
        if (logRes.rows.length > 0) {
            logChannelId = logRes.rows[0].channel_id;
        }

        console.log(`Bot sahipleri: ${OWNER_IDS.join(', ')}`);
        return true;

    } catch (error) {
        console.error('❌ PostgreSQL bağlantı veya veri çekme hatası:', error.message);
        return false;
    }
}

// =======================================================
// 💻 BOT BAĞLANTISI VE AKTİFLİK KODU
// =======================================================

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessageReactions, 
        GatewayIntentBits.GuildModeration, 
        GatewayIntentBits.GuildIntegrations, 
    ] 
});

// --- KEEP-ALIVE SUNUCUSU ---
const app = express();
const port = 3000; 
app.get('/', (req, res) => {
    pool.query('SELECT 1').then(() => res.send('Bot aktif ve çalışıyor! DB: Aktif')).catch(() => res.send('Bot aktif ve çalışıyor! DB: Pasif'));
});
app.listen(port, () => console.log(`Keep-Alive sunucusu ${port} portunda çalışıyor.`));


client.on('ready', async () => {
    console.log(`Botunuz başarıyla giriş yaptı: ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: 'vazgucxn ❤️ Kaisen', type: ActivityType.Streaming, url: 'https://www.twitch.tv/discord' }],
        status: 'online',
    });
    await initializeDatabase();
    GUARD_SETTINGS.OWN_ID = client.user.id;
 
});


// =======================================================
// 🛡️ GUARD SİSTEMİ TEMEL FONKSİYONLARI 🛡️
// =======================================================

function checkRateLimit(executorId, actionType, guild) {
    if (OWNER_IDS.includes(executorId) || executorId === GUARD_SETTINGS.OWN_ID) return false;

    if (!actionCache.has(executorId)) actionCache.set(executorId, { kicks: [], bans: [] });

    const userData = actionCache.get(executorId);
    const now = Date.now();

    userData[actionType] = userData[actionType].filter(time => now - time < GUARD_SETTINGS.TIMEFRAME);
    userData[actionType].push(now);

    const limit = actionType === 'kicks' ? GUARD_SETTINGS.KICK_LIMIT : GUARD_SETTINGS.BAN_LIMIT;

    if (userData[actionType].length >= limit) {
        actionCache.delete(executorId);
        const executor = guild.members.cache.get(executorId);
        if (executor && executor.manageable) {
            executor.roles.cache.clear(); 
            executor.timeout(3600000, `[GUARD] ${actionType.toUpperCase()} Limiti aşıldı.`); 
            logAction(guild, `🛡️ **[GUARD] KORUMA DEVREDE**\nKullanıcı: ${executor.user.tag}\nEylem: Hızlı ${actionType.toUpperCase()} Limiti\nCeza: 1 saat Timeout`, 'GUARD AKTİF', 0xFF4500);
        }
        return true;
    }
    actionCache.set(executorId, userData);
    return false;
}

client.on('guildBanAdd', async (ban) => {
    const guild = ban.guild;
    const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 }).catch(() => null);
    const logEntry = auditLogs?.entries.first();

    if (logEntry && logEntry.target.id === ban.user.id && logEntry.executor) {
        checkRateLimit(logEntry.executor.id, 'bans', guild);
    }
});

client.on('guildMemberRemove', async (member) => {
    const guild = member.guild;
    const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 }).catch(() => null);
    const logEntry = auditLogs?.entries.first();

    if (logEntry && logEntry.target.id === member.id && logEntry.executor) {
        if (Date.now() - logEntry.createdTimestamp < 5000) {
            checkRateLimit(logEntry.executor.id, 'kicks', guild);
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    const guild = member.guild;
    const now = Date.now();

    const ageInDays = (now - member.user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays < 1) { 
        member.kick(`[GUARD] Yeni Hesap Koruması: Hesap 1 günden yenidir.`).catch(() => {});
        logAction(guild, `🚫 **[GUARD] YENİ HESAP ENGELİ**\nKullanıcı: ${member.user.tag}\nEylem: 1 günden yeni olduğu için otomatik kicklendi.`, 'HESAP FİLTRESİ', 0x9932CC);
        return;
    }

    if (!joinTimestamps.has(guild.id)) {
        joinTimestamps.set(guild.id, []);
    }

    const timestamps = joinTimestamps.get(guild.id);
    timestamps.push(now);

    const recentJoins = timestamps.filter(time => now - time < GUARD_SETTINGS.JOIN_TIMEFRAME);
    joinTimestamps.set(guild.id, recentJoins);

    if (recentJoins.length >= GUARD_SETTINGS.JOIN_LIMIT) {
        logAction(guild, `🚨 **[ANTI-RAID] KORUMA DEVREDE**\nBot, ${GUARD_SETTINGS.JOIN_LIMIT} kişi/saniye limitini aştı.`, 'RAID TESPİT EDİLDİ', 0xFF0000);
    }
});

const urlRegex = /(http(s)?:\/\/(www\.)?|discord\.gg\/)\S+/gi;

// =======================================================
// 📝 LOG SİSTEMİ FONKSİYONLARI 📝
// =======================================================

async function getLogChannel(guild) {
    if (!guild) return null;
    if (logChannelId) {
        const channel = guild.channels.cache.get(logChannelId);
        if (channel) return channel;
    }

    try {
        const res = await pool.query('SELECT channel_id FROM log_settings WHERE guild_id = $1', [guild.id]);
        if (res.rows.length > 0) {
            logChannelId = res.rows[0].channel_id;
            return guild.channels.cache.get(logChannelId);
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function logAction(guild, description, title = 'BOT LOG', color = 0x000000) {
    const logChannel = await getLogChannel(guild);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {}); 
}

client.on('messageDelete', async message => {
    if (message.author.bot || !message.guild || message.embeds.length > 0 || message.content.startsWith('.')) return;

    logAction(
        message.guild,
        `**İçerik:** \`\`\`${message.content.substring(0, 1000)}\`\`\`\n**Kullanıcı:** ${message.author.tag} (<@${message.author.id}>)\n**Kanal:** ${message.channel}`,
        '🗑️ MESAJ SİLİNDİ',
        0xFF0000 
    );
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (oldMessage.author.bot || !oldMessage.guild || oldMessage.content === newMessage.content) return;

    logAction(
        oldMessage.guild,
        `**Kanal:** ${oldMessage.channel}\n**Kullanıcı:** ${oldMessage.author.tag} (<@${oldMessage.author.id}>)\n\n**Eski İçerik:** \`\`\`${oldMessage.content.substring(0, 500)}\`\`\`\n**Yeni İçerik:** \`\`\`${newMessage.content.substring(0, 500)}\`\`\``,
        '✏️ MESAJ DÜZENLENDİ',
        0xFFFF00 
    );
});


// =======================================================
// 💥 STRIKE SİSTEMİ VE YARDIMCI FONKSİYONLARI 💥
// =======================================================

async function getStrikeCount(userId) {
    try {
        const result = await pool.query('SELECT strike_count FROM user_strikes WHERE user_id = $1', [userId]);
        return result.rows.length > 0 ? result.rows[0].strike_count : 0;
    } catch (e) {
        console.error("Strike bilgisi çekme hatası:", e);
        return 0;
    }
}

async function addStrike(userId) {
    try {
        const query = `
            INSERT INTO user_strikes (user_id, strike_count) 
            VALUES ($1, 1) 
            ON CONFLICT (user_id) 
            DO UPDATE SET strike_count = user_strikes.strike_count + 1 
            RETURNING strike_count;
        `;
        const result = await pool.query(query, [userId]);
        return result.rows[0].strike_count;
    } catch (e) {
        console.error("Strike ekleme hatası:", e);
        return -1;
    }
}

async function removeStrike(userId, amountToRemove = 1) {
     try {
        const currentCount = await getStrikeCount(userId);
        if (currentCount <= 0) return 0;

        const newCount = Math.max(0, currentCount - amountToRemove);

        if (newCount === 0) {
            await pool.query('DELETE FROM user_strikes WHERE user_id = $1', [userId]);
        } else {
             await pool.query('UPDATE user_strikes SET strike_count = $1 WHERE user_id = $2', [newCount, userId]);
        }
        return newCount;
    } catch (e) {
        console.error("Strike silme hatası:", e);
        return -1;
    }
}

async function getWebhookUrl(type) {
    try {
        const res = await pool.query('SELECT url FROM webhooks WHERE type = $1', [type]);
        return res.rows.length > 0 ? res.rows[0].url : null;
    } catch (error) {
        console.error(`Webhook URL çekme hatası (${type}):`, error);
        return null;
    }
}

async function sendWebhookMessage(type, content) {
    const url = await getWebhookUrl(type);

    if (!url) {
        return `❌ Webhook URL'si (${type}) veritabanında kayıtlı değil. Lütfen önce .${type}webhook komutuyla kaydedin.`;
    }

    try {
        const payload = {
            content: content,
            username: client.user.username,
            avatar_url: client.user.displayAvatarURL(),
        };

        await axios.post(url, payload);
        return `✅ Mesaj, **${type.toUpperCase()}** Webhook'una başarıyla gönderildi.`;

    } catch (error) {
        console.error(`Webhook gönderme hatası (${type}):`, error.message);
        return `❌ Webhook gönderimi başarısız oldu. URL'yi veya yetkileri kontrol edin.`;
    }
}


// =======================================================
// 💬 KOMUT İŞLEYİCİ (client.on('messageCreate'))
// =======================================================

client.on('messageCreate', async message => {

    // 1. URL Koruması
    if (!message.member?.permissions.has(PermissionFlagsBits.Administrator) && !OWNER_IDS.includes(message.author.id)) {
        if (urlRegex.test(message.content)) {
            const urlCount = (message.content.match(urlRegex) || []).length;

            if (urlCount > GUARD_SETTINGS.MAX_URLS) {
                await message.delete().catch(() => {});
                message.channel.send(`❌ ${message.author}, bu kanalda link paylaşımı kısıtlanmıştır.`)
                    .then(m => setTimeout(() => m.delete().catch(() => {}), 5000));

                logAction(message.guild,
                    `🛡️ **URL ENGEL**\nKullanıcı: ${message.author.tag}\nKanal: ${message.channel}\nEylem: Link Paylaşımı Engellendi.`,
                    'URL KORUMASI',
                    0x1E90FF
                );

                return;
            }
        }
    }



    // 2. Temel Kontroller
    if (message.author.bot || !message.guild || !message.content.startsWith('.')) return;

    const args = message.content.trim().split(/\s+/);
    const command = args[0];
    const commandKey = command.slice(1);

    const isOwner = OWNER_IDS.includes(message.author.id); 

    // --- .ticketkur (Ticket Sistemi Kurulumu) ---
    if (command === '.ticketkur') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");

        const setupEmbed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('🎫 Destek / Talep Sistemi')
            .setDescription('Aşağıdaki butona tıklayarak yeni bir destek talebi (ticket) oluşturabilirsiniz.')
            .setFooter({ text: 'Lütfen gereksiz yere ticket açmayın.' });

        const setupRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('open_ticket')
                    .setLabel('Ticket Aç')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🎫'),
            );

        message.channel.send({ embeds: [setupEmbed], components: [setupRow] });
        await message.delete().catch(() => {});
        return;
    }

    // --- Webhook Kayıt Komutları ---
    if (commandKey.endsWith('webhook')) {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");

        const type = commandKey.replace('webhook', ''); 
        const url = args[1];

        if (!url || !url.startsWith('https://discord.com/api/webhooks/')) {
            return message.reply(`Kullanım: \`${command} [Webhook URL]\`. Lütfen geçerli bir Discord Webhook URL'si girin.`);
        }

        try {
            await pool.query(
                'INSERT INTO webhooks (type, url) VALUES ($1, $2) ON CONFLICT (type) DO UPDATE SET url = EXCLUDED.url',
                [type, url]
            );
            message.reply(`✅ **${type.toUpperCase()}** Webhook URL'si başarıyla güncellendi/kaydedildi.`);
        } catch (error) {
            message.reply(`❌ Webhook URL'sini kaydederken bir hata oluştu.`);
        }
        return;
    }

    // --- Webhook Mesaj Komutları ---
    if (commandKey.endsWith('mesaj')) {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");

        const type = commandKey.replace('mesaj', ''); 
        const content = args.slice(1).join(' ');

        if (!content) {
            return message.reply(`Kullanım: \`${command} [Mesaj içeriği]\`. Lütfen göndermek istediğiniz mesajı girin.`);
        }

        const result = await sendWebhookMessage(type, content);
        message.reply(result);
        return;
    }

    // --- .restart ---
    if (command === '.restart') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");

        try {
            await message.channel.send('🔄 Bot yeniden başlatılıyor...');
            process.exit(1); 
        } catch (error) {
            message.reply('❌ Yeniden başlatma sırasında bir hata oluştu.');
        }
        return;
    }

    // --- .sil ---
    if (command === '.sil') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");

        const amount = parseInt(args[1]);

        if (isNaN(amount) || amount <= 0 || amount > 100) {
            return message.reply("Kullanım: `.sil [1-100 arası miktar]`");
        }

        try {
            await message.delete().catch(() => {}); 
            await message.channel.bulkDelete(amount, true); 
            const reply = await message.channel.send(`✅ **${amount}** adet mesaj başarıyla silindi.`);
            setTimeout(() => reply.delete().catch(() => {}), 5000); 

        } catch (error) {
            message.reply("❌ Mesajları silerken bir hata oluştu. Mesajların 14 günden eski olmadığından emin olun.");
        }
        return;
    }

    // --- .yolla ---
    if (command === '.yolla') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");

        const target = message.mentions.channels.first() || message.mentions.roles.first();
        const isMoveCommand = !isNaN(args[1]) && message.mentions.channels.first();

        if (isMoveCommand) { 
            const messageId = args[1];
            const newChannel = message.mentions.channels.first();

            try {
                const currentChannel = message.channel;
                const msgToMove = await currentChannel.messages.fetch(messageId);

                const sentEmbed = new EmbedBuilder()
                    .setDescription(msgToMove.content)
                    .setColor(0x000000)
                    .setAuthor({ name: msgToMove.author.tag, iconURL: msgToMove.author.displayAvatarURL() })
                    .setTimestamp(msgToMove.createdTimestamp);

                await newChannel.send({ embeds: [sentEmbed] });
                await msgToMove.delete();

                message.reply(`✅ Mesaj, <#${newChannel.id}> kanalına başarıyla taşındı.`);

            } catch (error) {
                message.reply("Mesaj taşınırken bir hata oluştu. ID'lerin doğru olduğundan emin olun.");
            }
             return;
        } else if (message.mentions.roles.first()) { 
            const role = message.mentions.roles.first();
            const messageContent = args.slice(2).join(' '); 

            if (!messageContent) return message.reply("Lütfen bir duyuru mesajı girin.");

            let successCount = 0;
            let failCount = 0;

            await message.guild.members.fetch(); 
            const members = message.guild.members.cache.filter(member => 
                member.roles.cache.has(role.id) && !member.user.bot
            );

            const dmEmbed = new EmbedBuilder()
                .setColor(0x000000) // Siyah
                .setTitle(`📢 ${message.guild.name} Sunucu Duyurusu`)
                .setDescription(`**${role.name}** rolüne özel mesaj:\n\n${messageContent}`)
                .setTimestamp();

            for (const member of members.values()) {
                try {
                    await member.send({ embeds: [dmEmbed] }); 
                    successCount++;
                } catch (e) {
                    failCount++;
                }
            }
            message.reply(`✅ **${role.name}** rolündeki **${successCount}** üyeye DM gönderildi. (${failCount} üye DM kapalı.)`);
            return;
        } else {
             return message.reply("Kullanım: `.yolla [mesajID] [#kanal]` VEYSA `.yolla [@rol] [mesaj]`");
        }
    }

    // --- .yetki (DB) ---
    if (command === '.yetki') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const action = args[1]?.toLowerCase();
        const targetUser = message.mentions.users.first();

        if (!action || !targetUser || (action !== 'ekle' && action !== 'çıkar')) {
            return message.reply("Kullanım: `.yetki [ekle/çıkar] [@kullanıcı]`");
        }

        const targetID = targetUser.id;
        const isTargetOwner = OWNER_IDS.includes(targetID);

        try {
            if (action === 'ekle') {
                if (isTargetOwner) return message.reply(`❌ ${targetUser} zaten bot sahibi yetkisine sahip.`);
                await pool.query('INSERT INTO owners (user_id, username) VALUES ($1, $2)', [targetID, targetUser.tag]);
                OWNER_IDS.push(targetID);
                message.reply(`✅ **${targetUser.tag}** kullanıcı artık bot sahibidir.`);
            } else if (action === 'çıkar') {
                if (!isTargetOwner) return message.reply(`❌ ${targetUser} zaten bot sahibi yetkisine sahip değil.`);
                if (targetID === message.author.id) return message.reply("❌ Kendi bot sahibi yetkinizi kaldıramazsınız.");

                await pool.query('DELETE FROM owners WHERE user_id = $1', [targetID]);
                OWNER_IDS = OWNER_IDS.filter(id => id !== targetID);
                message.reply(`✅ **${targetUser.tag}** kullanıcısının bot sahibi yetkisi kaldırıldı.`);
            }
        } catch (error) {
            message.reply('Veritabanı işlemi sırasında bir hata oluştu.');
        }
        return;
    }

    // --- .logkur (Log Kanalı Kurulumu) ---
    if (command === '.logkur') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");

        const logChannelName = 'bot-denetim-kaydı';
        let channel = message.guild.channels.cache.find(c => c.name === logChannelName && c.type === ChannelType.GuildText);

        if (!channel) {
            try {
                channel = await message.guild.channels.create({
                    name: logChannelName,
                    type: ChannelType.GuildText,
                    topic: 'Bot tarafından otomatik olarak oluşturulmuştur. Sunucu denetim loglarını tutar.',
                    permissionOverwrites: [
                        { id: message.guild.id, deny: [PermissionFlagsBits.SendMessages], allow: [PermissionFlagsBits.ViewChannel] }
                    ]
                });
                message.reply(`✅ Log kanalı (**#${logChannelName}**) başarıyla oluşturuldu.`);
            } catch (e) {
                return message.reply("❌ Log kanalı oluşturulurken hata oluştu. Botun 'Kanalları Yönet' yetkisi olmalı.");
            }
        } else {
             message.reply(`✅ Log kanalı (**#${logChannelName}**) zaten mevcut.`);
        }

        try {
            await pool.query(
                'INSERT INTO log_settings (guild_id, channel_id) VALUES ($1, $2) ON CONFLICT (guild_id) DO UPDATE SET channel_id = EXCLUDED.channel_id',
                [message.guild.id, channel.id]
            );
            logChannelId = channel.id;
            channel.send(`🔒 Bu kanal, denetim kayıtları için kuruldu.`).catch(() => {});
        } catch (e) {
             message.reply("❌ Log kanalını veritabanına kaydederken hata oluştu.");
        }
        return;
    }

    // --- .ucubeyolla (Zorla Ban) ---
    if (command === '.ucubeyolla') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");

        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply("Kullanım: `.ucubeyolla [@kullanıcı] [sebep]`. Lütfen banlanacak bir kullanıcı etiketleyin.");

        if (targetMember.id === client.user.id) return message.reply("❌ Kendimi banlayamam!");

        const reason = args.slice(2).join(' ') || 'Bot sahibi isteği üzerine sunucudan uzaklaştırıldı.';

        try {
            await targetMember.ban({ reason: reason });
            message.channel.send(`🔨 **${targetMember.user.tag}** sunucudan **uzaklaştırıldı**. Sebep: *${reason}*`);

        } catch (e) {
            message.reply("❌ İşlem başarısız oldu. Botun rolü, banlanacak kişinin rolünden yüksek mi?");
        }
        return;
    }

    // --- .etkinlik (Katıl – Ayrıl – SQL ile yönetim) ---
    if (command === '.etkinlik') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");

        const maxParticipants = parseInt(args[1]) || 20;
        const eventTitle = args.slice(2).join(" ");

        if (!eventTitle)
            return message.reply("Kullanım: `.etkinlik [Max Kişi] [Etkinlik Adı]`");

        const eventEmbed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle(`🎉 YENİ ETKİNLİK: ${eventTitle}`)
            .setDescription(`**Katılmak için aşağıdaki emojilere tıklayın!**`)
            .addFields([
                { name: `Katılımcılar (0/${maxParticipants})`, value: "(Henüz kimse katılmadı)" }
            ])
            .setFooter({ text: `Maksimum Katılımcı: ${maxParticipants}` })
            .setTimestamp();

        const sentMessage = await message.channel.send({
            content: "@here",
            embeds: [eventEmbed],
        });

        await sentMessage.react("✅").catch(() => {});

        // SQL'e etkinlik oluştur
        await pool.query(
            `INSERT INTO etkinlik_katilim (message_id, user_id)
             VALUES ($1, $2)`,
            [sentMessage.id, "MAX_COUNT"]
        ).catch(console.error);

        // Tepki filtresi
        const filter = (reaction, user) =>
            reaction.emoji.name === "✅" && !user.bot;

        // Tepki collector
        const collector = sentMessage.createReactionCollector({ dispose: true });

        // --- KATILMA ---
        collector.on("collect", async (reaction, user) => {
            if (reaction.emoji.name !== "✅") return;

            try {
                // Bu etkinliğe toplam kaç kişi katılmış?
                const countCheck = await pool.query(
                    `SELECT * FROM etkinlik_katilim WHERE message_id = $1`,
                    [sentMessage.id]
                );

                const actualCount = countCheck.rowCount - 1; // MAX_COUNT hariç

                // Etkinlik dolu → tepkiyi kaldır
                if (actualCount >= maxParticipants) {
                    reaction.users.remove(user.id).catch(() => {});
                    return user.send("❌ Bu etkinlik dolu!").catch(() => {});
                }

                // Kullanıcı zaten eklenmiş mi?
                const exist = await pool.query(
                    `SELECT * FROM etkinlik_katilim 
                     WHERE message_id = $1 AND user_id = $2`,
                    [sentMessage.id, user.id]
                );

                if (exist.rowCount === 0) {
                    await pool.query(
                        `INSERT INTO etkinlik_katilim (message_id, user_id)
                         VALUES ($1, $2)`,
                        [sentMessage.id, user.id]
                    );
                }

                await updateEventEmbed(sentMessage, eventTitle, maxParticipants);

            } catch (err) {
                console.error("Katılım hatası:", err);
            }
        });

        // --- AYRILMA (Tepkiyi kaldırırsa) ---
        collector.on("remove", async (reaction, user) => {
            if (reaction.emoji.name !== "✅") return;

            try {
                // SQL'den sil
                await pool.query(
                    `DELETE FROM etkinlik_katilim 
                     WHERE message_id = $1 AND user_id = $2`,
                    [sentMessage.id, user.id]
                );

                await updateEventEmbed(sentMessage, eventTitle, maxParticipants);

            } catch (err) {
                console.error("Çıkarma hatası:", err);
            }
        });

        return;
    }

    // === Embed Güncelleme Fonksiyonu ===
    async function updateEventEmbed(message, title, maxParticipants) {
        const participants = await pool.query(
            `SELECT * FROM etkinlik_katilim 
             WHERE message_id = $1 AND user_id != 'MAX_COUNT'`,
            [message.id]
        );

        const listText =
            participants.rowCount > 0
                ? participants.rows.map(r => `<@${r.user_id}>`).join("\n")
                : "(Henüz kimse katılmadı)";

        const newEmbed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle(`🎉 YENİ ETKİNLİK: ${title}`)
            .setDescription("**Katılmak için aşağıdaki emojilere tıklayın!**")
            .addFields([
                {
                    name: `Katılımcılar (${participants.rowCount}/${maxParticipants})`,
                    value: listText
                }
            ])
            .setFooter({ text: `Maksimum Katılımcı: ${maxParticipants}` })
            .setTimestamp();

        await message.edit({ embeds: [newEmbed] });
    }

    // --- .etkinlik-bitir ---
    if (command === '.etkinlik-bitir') {
        if (!isOwner) return message.reply("Bu komutu kullanamazsın.");

        const msgId = args[1];
        if (!msgId) return message.reply("Kullanım: `.etkinlik-bitir [mesajID]`");

        try {
            // SQL'deki kayıtları sil
            await pool.query(
                `DELETE FROM etkinlik_katilim WHERE message_id = $1`,
                [msgId]
            );

            // Mesajı bulup embed'i kapat
            const channel = message.channel;
            const targetMsg = await channel.messages.fetch(msgId);

            const endedEmbed = EmbedBuilder.from(targetMsg.embeds[0])
                .setTitle("❌ Etkinlik Sona Erdi")
                .setDescription("Bu etkinlik artık kapatılmıştır.")
                .setFields([]);

            targetMsg.edit({ embeds: [endedEmbed] });
            targetMsg.reactions.removeAll().catch(() => {});

            return message.reply("Etkinlik başarıyla sonlandırıldı!");
        } catch (err) {
            console.error(err);
            return message.reply("Hata: Böyle bir etkinlik bulunamadı.");
        }
    }

    // --- .etkinlik-liste ---
    if (command === '.etkinlik-liste') {
        if (!isOwner) return message.reply("Bu komutu kullanamazsın.");

        const data = await pool.query(
            `SELECT DISTINCT message_id 
             FROM etkinlik_katilim 
             WHERE user_id = 'MAX_COUNT'`
        );

        if (data.rowCount === 0)
            return message.reply("Aktif bir etkinlik yok.");

        const list = data.rows
            .map(r => `• Mesaj ID: **${r.message_id}**`)
            .join("\n");

        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle("📋 Açık Etkinlikler")
            .setDescription(list);

        return message.reply({ embeds: [embed] });
    }

    // --- .etkinlik-sil ---
    if (command === '.etkinlik-sil') {
        if (!isOwner) return message.reply("Bu komutu kullanamazsın.");

        const msgId = args[1];
        if (!msgId) return message.reply("Kullanım: `.etkinlik-sil [mesajID]`");

        await pool.query(
            `DELETE FROM etkinlik_katilim WHERE message_id = $1`,
            [msgId]
        );

        return message.reply("SQL’den etkinlik verileri temizlendi.");
    }

    // --- .etekle ---
    if (command === '.etekle') {
        if (!isOwner) return message.reply("Bu komutu kullanamazsın.");

        const msgId = args[1];
        const user = message.mentions.users.first();

        if (!msgId || !user)
            return message.reply("Kullanım: `.etekle [mesajID] @kullanıcı`");

        // Kullanıcı zaten kayıtlı mı?
        const exists = await pool.query(
            `SELECT * FROM etkinlik_katilim WHERE message_id = $1 AND user_id = $2`,
            [msgId, user.id]
        );

        if (exists.rowCount > 0)
            return message.reply("Bu kullanıcı zaten etkinlikte.");

        // Ekle
        await pool.query(
            `INSERT INTO etkinlik_katilim (message_id, user_id) VALUES ($1, $2)`,
            [msgId, user.id]
        );

        message.reply(`<@${user.id}> etkinliğe eklendi.`);

        // Embed'i güncelle — ÖNEMLİ: önce mesajı fetch et
        let targetMsg;
        try {
            targetMsg = await message.channel.messages.fetch(msgId);
        } catch (err) {
            // Eğer mesaj farklı kanalda ise, önce tüm kanallardan fetch etmek gerekir. Burada en basit senaryo:
            return message.reply("Etkinlik mesajı bu kanalda bulunamadı. Mesaj farklı kanalda olabilir.");
        }

        await updateEventEmbed(targetMsg);
        return;
    }


    if (command === '.etçıkar') {
        if (!isOwner) return message.reply("Bu komutu sadece bot sahibi kullanabilir.");
        const member = message.mentions.users.first();
        if (!member) return message.reply("Lütfen çıkarılacak kullanıcıyı etiketleyin.");

        // Etkinlik mesajını veritabanından çekiyoruz (aktif etkinlik arama)
        const result = await pool.query(
            "SELECT message_id FROM etkinlik_katilim WHERE user_id = 'MAX_COUNT' LIMIT 1"
        );

        if (result.rowCount === 0) {
            return message.reply("Aktif etkinlik bulunamadı!");
        }

        const etkinlikMessageId = result.rows[0].message_id;

        // Mesajı kanalda bul (fetch)
        let eventMessage;
        try {
            eventMessage = await message.channel.messages.fetch(etkinlikMessageId);
        } catch (e) {
            return message.reply("Etkinlik mesajı bulunamadı (muhtemelen farklı kanalda veya silinmiş).");
        }

        // Veritabanından sil
        await pool.query(
            "DELETE FROM etkinlik_katilim WHERE user_id = $1 AND message_id = $2",
            [member.id, etkinlikMessageId]
        );

        // Embed'i güncelle
        await updateEventEmbed(eventMessage);

        return message.reply(`<@${member.id}> etkinlikten çıkarıldı.`);
    }



     
    // --- .strike (Strike Ekleme) ---
    if (command === '.strike') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const targetUser = message.mentions.users.first();

        if (!targetUser) return message.reply("Kullanım: `.strike [@kullanıcı]`. Lütfen bir kullanıcı etiketleyin.");

        const newCount = await addStrike(targetUser.id);

        if (newCount === -1) {
            return message.reply(`❌ Strike eklenirken veritabanı hatası oluştu.`);
        }

        message.channel.send(`⚠️ **${targetUser.tag}** kullanıcısına 1 strike eklendi. (Toplam: **${newCount}** strike)`);
        logAction(message.guild, `**Kullanıcı:** ${targetUser.tag}\n**Eylem:** 1 Strike Eklendi.`, 'STRIKE EKLENDİ', 0xFF4500);
        return;
    }

    // --- .removestrike (Strike Çıkarma) ---
    if (command === '.removestrike') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const targetUser = message.mentions.users.first();

        if (!targetUser) return message.reply("Kullanım: `.removestrike [@kullanıcı]`. Lütfen bir kullanıcı etiketleyin.");

        const newCount = await removeStrike(targetUser.id);

        if (newCount === -1) {
            return message.reply(`❌ Strike silinirken veritabanı hatası oluştu.`);
        }

        if (newCount === 0) {
            message.channel.send(`✅ **${targetUser.tag}** kullanıcısının tüm strike'ları silindi. (Toplam: **0** strike)`);
        } else {
             message.channel.send(`✅ **${targetUser.tag}** kullanıcısından 1 strike silindi. (Toplam: **${newCount}** strike)`);
        }

        logAction(message.guild, `**Kullanıcı:** ${targetUser.tag}\n**Eylem:** 1 Strike Silindi.`, 'STRIKE SİLİNDİ', 0x00FF00);
        return;
    }

    // --- .strikebilgi (Strike Sorgulama) ---
    if (command === '.strikebilgi') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const targetUser = message.mentions.users.first();

        if (!targetUser) return message.reply("Kullanım: `.strikebilgi [@kullanıcı]`. Lütfen bir kullanıcı etiketleyin.");

        const strikeCount = await getStrikeCount(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(strikeCount > 0 ? 0xFFA500 : 0x0099FF)
            .setTitle('📝 Kullanıcı Strike Bilgisi')
            .setDescription(`**${targetUser.tag}** kullanıcısının toplam strike sayısı:`)
            .addFields(
                { name: 'Toplam Strike', value: `**${strikeCount}**`, inline: true }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
        return;
    }

    // --- Moderasyon Komutları ---

    // .kick
    if (command === '.kick') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const targetMember = message.mentions.members.first();
        if (!targetMember) return message.reply("Lütfen atılacak bir kullanıcı etiketleyin.");

        const reason = args.slice(2).join(' ') || 'Bot sahibi isteği üzerine atıldı.';
        try {
            await targetMember.kick(reason);
            message.channel.send(`🚪 **${targetMember.user.tag}** sunucudan atıldı. Sebep: *${reason}*`);
        } catch (e) {
            message.reply("❌ Atma işlemi başarısız. Yetkileri kontrol edin.");
        }
        return;
    }

    // .unban
    if (command === '.unban') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const userId = args[1];
        if (!userId) return message.reply("Kullanım: `.unban [Kullanıcı ID]`");

        try {
            const user = await client.users.fetch(userId);
            await message.guild.bans.remove(user, `Bot sahibi tarafından yasağı kaldırıldı.`);
            message.channel.send(`✅ **${user.tag}** kullanıcısının yasağı kaldırıldı.`);
        } catch (e) {
            message.reply("❌ Yasağı kaldırma işlemi başarısız oldu. ID'yi kontrol edin veya kullanıcı banlı değil.");
        }
        return;
    }

    // .unforceban (Unban ile aynı işlev)
    if (command === '.unforceban') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const userId = args[1];
        if (!userId) return message.reply("Kullanım: `.unforceban [Kullanıcı ID]`");

        try {
            const user = await client.users.fetch(userId);
            await message.guild.bans.remove(user, `Bot sahibi tarafından yasağı kaldırıldı.`);
            message.channel.send(`✅ **${user.tag}** kullanıcısının zorla yasağı kaldırıldı.`);
        } catch (e) {
            message.reply("❌ Yasağı kaldırma işlemi başarısız oldu. ID'yi kontrol edin veya kullanıcı banlı değil.");
        }
        return;
    }

    // .timeout
    if (command === '.timeout') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const targetMember = message.mentions.members.first();
        const duration = parseInt(args[2]); // Süre (Dakika)

        if (!targetMember || isNaN(duration) || duration <= 0) return message.reply("Kullanım: `.timeout [@kullanıcı] [dakika]`");

        const msDuration = duration * 60 * 1000;
        const reason = args.slice(3).join(' ') || 'Bot sahibi isteği üzerine timeout uygulandı.';

        try {
            await targetMember.timeout(msDuration, reason);
            message.channel.send(`⏱️ **${targetMember.user.tag}** kullanıcısına **${duration} dakika** timeout uygulandı.`);
        } catch (e) {
            message.reply("❌ Timeout uygulanamadı.");
        }
        return;
    }

    // .untimeout
    if (command === '.untimeout') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const targetMember = message.mentions.members.first();

        if (!targetMember) return message.reply("Kullanım: `.untimeout [@kullanıcı]`");

        try {
            await targetMember.timeout(null, 'Bot sahibi tarafından timeout kaldırıldı.');
            message.channel.send(`✅ **${targetMember.user.tag}** kullanıcısının timeout cezası kaldırıldı.`);
        } catch (e) {
            message.reply("❌ Timeout kaldırılamadı. Kullanıcı timeout'ta değil veya yetki sorunu var.");
        }
        return;
    }

    // .nuke
    if (command === '.nuke') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");

        const channel = message.channel;
        const channelName = channel.name;

        try {
            const newChannel = await channel.clone({ name: channelName, reason: `Bot sahibi isteği üzerine kanal temizlendi.` });
            await channel.delete();
            newChannel.send(`☢️ Kanal, ${message.author} tarafından tamamen temizlendi!`).catch(() => {});
        } catch (e) {
            message.reply("❌ Kanal temizlenemedi. Botun 'Kanalları Yönet' yetkisi olmalı.");
        }
        return;
    }

    // .lock
    if (command === '.lock') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const channel = message.channel;

        try {
            await channel.permissionOverwrites.edit(message.guild.id, { SendMessages: false });
            message.reply(`🔒 **#${channel.name}** kanalı kilitlendi.`);
        } catch (e) {
            message.reply("❌ Kanal kilitlenirken hata oluştu.");
        }
        return;
    }

    // .unlock
    if (command === '.unlock') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const channel = message.channel;

        try {
            await channel.permissionOverwrites.edit(message.guild.id, { SendMessages: null });
            message.reply(`🔓 **#${channel.name}** kanalının kilidi açıldı.`);
        } catch (e) {
            message.reply("❌ Kanal kilidi açılırken hata oluştu.");
        }
        return;
    }

    // --- Eğlence ---
    if (command === '.supunablası') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const monkeyImages = [
            "https://imgur.com/a/7G77TiF",
            "https://imgur.com/a/4GA0HO6", 
            "https://i.imgur.com/7jF4c0V.jpeg", 
        ];
        const randomImage = monkeyImages[Math.floor(Math.random() * monkeyImages.length)];

        const embed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('🙈 Supunablası!')
            .setImage(randomImage)
            .setFooter({ text: 'Rastgele bir maymun resmi.' });

        message.reply({ embeds: [embed] });
        return;
    }

    // .emojiyazı
    if (command === '.emojiyazı') {
        const text = args.slice(1).join(' ').toLowerCase();
        if (!text) return message.reply("Kullanım: `.emojiyazı [metin]`");

        const emojified = text.split('').map(char => {
            if (char === ' ') return ' ';
            if (/[a-z]/.test(char)) {
                return `:regional_indicator_${char}:`;
            }
            return char;
        }).join('');

        if (emojified.length > 2000) { return message.reply("Mesaj çok uzun!"); }

        message.channel.send(emojified);
        await message.delete().catch(() => {});
        return;
    }

    // .yavaşmod
    if (command === '.yavaşmod') {
        if (!isOwner) return message.reply("Bu komutu kullanmaya yetkiniz yok.");
        const duration = parseInt(args[1]) || 0; // Süre saniye cinsinden

        if (duration < 0 || duration > 21600) return message.reply("Süre 0 ile 21600 saniye (6 saat) arasında olmalıdır.");

        await message.channel.setRateLimitPerUser(duration, `Bot sahibi isteği: ${message.author.tag}`).catch(() => {
            return message.reply("❌ Yavaş mod ayarlanamadı. Yetkileri kontrol edin.");
        });

        if (duration === 0) {
            message.reply("✅ Kanal yavaş modu kapatıldı.");
        } else {
            message.reply(`⏱️ Kanal yavaş modu **${duration} saniye** olarak ayarlandı.`);
        }
        return;
    }

    // --- Yardım ---
    if (command === '.yardım') {
        const embed = new EmbedBuilder()
            .setColor(0x000000) 
            .setTitle('🌟 Kaisen Bot Komutları')
            .setDescription('Tüm komutlar **.** ön ekini kullanır.')
            .setThumbnail(message.guild.iconURL()) 
            .addFields(
                { 
                    name: '👑 Sahibim / Sistem', 
                    value: '`.yetki [ekle/çıkar] [@kullanıcı]`\n`.restart`\n`.logkur` (Denetim Kaydı Kanalını Kurar)', 
                    inline: false 
                },

                { 
                    name: '🔨 MODERASYON', 
                    value: '`.ucubeyolla [@kullanıcı]` (Zorla Ban)\n`.ban / .unban`\n`.kick`\n`.timeout / .untimeout`\n`.sil [miktar]`\n`.lock / .unlock`\n`.nuke` (Kanalı Temizler)\n`.yavaşmod [süre]`', 
                    inline: false 
                },

                { 
                    name: '💥 STRIKE SİSTEMİ', 
                    value: '`.strike [@kullanıcı]` (Strike Ekler)\n`.removestrike [@kullanıcı]` (Strike Çıkarır)\n`.strikebilgi [@kullanıcı]` (Strike Sorgular)', 
                    inline: false 
                },

                { 
                    name: '🎉 ETKİNLİK SİSTEMİ', 
                    value:
                    '`.etkinlik [Max Kişi] [Adı]` — Yeni etkinlik başlatır\n' +
                    '`.etçıkar [mesajID] [@kullanıcı]` — Etkinlikten kişi çıkarır\n' +
                    '`.etekle [mesajID] [@kullanıcı]` — Etkinliğe kişi ekler\n' +
                    '`.etkinlik-bitir [mesajID]` — Etkinliği kapatır & verileri temizler\n' +
                    '`.etkinlik-sil [mesajID]` — Etkinliği tamamen siler\n' +
                    '`.etkinlik-liste` — Tüm açık etkinlikleri listeler\n',
                    inline: false 
                },

                { 
                    name: '🌐 Webhook / Duyuru', 
                    value:
                    '`.otobanwebhook/mesaj`\n`.duyuruwebhook/mesaj`\n`.yolla [mesajID] [#kanal]` veya \n`.yolla [@rol] [mesaj]`\n`.ticketkur` (Ticket Sistemi Kurar)', 
                    inline: false 
                },

                { 
                    name: '🙈 Eğlence', 
                    value: '`.supunablası`\n`.emojiyazı [metin]`', 
                    inline: false 
                }
            )
            .setFooter({ text: `Bot ${client.user.tag} tarafından yönetiliyor.` })
            .setTimestamp();

        message.reply({ embeds: [embed] });
        return;
    }
    // --- Yardım ---
    if (command === '.yardım') {
        const embed = new EmbedBuilder()
            .setColor(0x000000) 
            .setTitle('🌟 Kaisen Bot Komutları')
            .setDescription('Tüm komutlar **.** ön ekini kullanır.')
            .setThumbnail(message.guild.iconURL()) 
            .addFields(
                { 
                    name: 'Allahıma özel pampa', 
                    value: '`.yetki [ekle/çıkar] [@kullanıcı]`\n`.restart`\n`.logkur` (Denetim Kaydı Kanalını Kurar)', 
                    inline: false 
                },

                { 
                    name: 'moderasyon', 
                    value: '`.ucubeyolla [@kullanıcı]` (Zorla Ban)\n`.ban / .unban`\n`.kick`\n`.timeout / .untimeout`\n`.sil [miktar]`\n`.lock / .unlock`\n`.nuke` (Kanalı Temizler)\n`.yavaşmod [süre]`', 
                    inline: false 
                },

                { 
                    name: 'strike', 
                    value: '`.strike [@kullanıcı]` (Strike Ekler)\n`.removestrike [@kullanıcı]` (Strike Çıkarır)\n`.strikebilgi [@kullanıcı]` (Strike Sorgular)', 
                    inline: false 
                },

                { 
                    name: 'etkinlik-otoban', 
                    value:
                    '`.etkinlik [Max Kişi] [Adı]` — Yeni etkinlik başlatır\n' +
                    '`.etçıkar [mesajID] [@kullanıcı]` — Etkinlikten kişi çıkarır\n' +
                    '`.etekle [mesajID] [@kullanıcı]` — Etkinliğe kişi ekler\n' +
                    '`.etkinlik-bitir [mesajID]` — Etkinliği kapatır & verileri temizler\n' +
                    '`.etkinlik-sil [mesajID]` — Etkinliği tamamen siler\n' +
                    '`.etkinlik-liste` — Tüm açık etkinlikleri listeler\n',
                    inline: false 
                },

                { 
                    name: ' Duyuru', 
                    value:
                    '`.otobanwebhook/mesaj`\n`.duyuruwebhook/mesaj`\n`.yolla [mesajID] [#kanal]` veya \n`.yolla [@rol] [mesaj]`\n`.ticketkur` (Ticket Sistemi Kurar)', 
                    inline: false 
                },

                { 
                    name: 'Sikiş', 
                    value: '`.supunablası`\n`.emojiyazı [metin]`', 
                    inline: false 
                }
            )
            .setFooter({ text: `Bot ${client.user.tag} tarafından yönetiliyor.` })
            .setTimestamp();

        message.reply({ embeds: [embed] });
        return;
    }


});

// ... (Geriye kalan tüm helper fonksiyonlar, interactionCreate ve log eventleri buraya dahil edilmiştir) ...

async function updateEventEmbed(message) {
    if (!message) return;

    // SQL’den çek
    const participants = await pool.query(
        `SELECT user_id FROM etkinlik_katilim 
         WHERE message_id = $1 AND user_id != 'MAX_COUNT'`,
        [message.id]
    );

    const maxCountRow = await pool.query(
        `SELECT * FROM etkinlik_katilim 
         WHERE message_id = $1 AND user_id = 'MAX_COUNT'`,
        [message.id]
    );

    if (maxCountRow.rowCount === 0) return; // Bitmiş etkinlik

    const maxCount = message.embeds[0].footer.text.split(": ")[1];

    const listText =
        participants.rowCount > 0
            ? participants.rows.map(r => `<@${r.user_id}>`).join("\n")
            : "(Henüz kimse katılmadı)";

    const updatedEmbed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle(message.embeds[0].title)
        .setDescription(message.embeds[0].description)
        .addFields([
            {
                name: `Katılımcılar (${participants.rowCount}/${maxCount})`,
                value: listText,
            },
        ])
        .setFooter({ text: `Maksimum Katılımcı: ${maxCount}` })
        .setTimestamp();

    message.edit({ embeds: [updatedEmbed] });
}

async function updateEventEmbed(message) {
    if (!message) return;

    // SQL’den çek
    const participants = await pool.query(
        `SELECT user_id FROM etkinlik_katilim 
         WHERE message_id = $1 AND user_id != 'MAX_COUNT'`,
        [message.id]
    );

    const maxCountRow = await pool.query(
        `SELECT * FROM etkinlik_katilim 
         WHERE message_id = $1 AND user_id = 'MAX_COUNT'`,
        [message.id]
    );

    if (maxCountRow.rowCount === 0) return; // Bitmiş / silinmiş etkinlik

    const maxCount = message.embeds[0].footer.text.split(": ")[1];

    const listText =
        participants.rowCount > 0
            ? participants.rows.map(r => `<@${r.user_id}>`).join("\n")
            : "(Henüz kimse katılmadı)";

    const updatedEmbed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle(message.embeds[0].title)
        .setDescription(message.embeds[0].description)
        .addFields([
            {
                name: `Katılımcılar (${participants.rowCount}/${maxCount})`,
                value: listText,
            },
        ])
        .setFooter({ text: `Maksimum Katılımcı: ${maxCount}` })
        .setTimestamp();

    await message.edit({ embeds: [updatedEmbed] }).catch(() => {});
}
async function updateEventEmbed(message) {
    if (!message) return;

    // SQL’den katılımcıları çek
    const participants = await pool.query(
        `SELECT user_id FROM etkinlik_katilim 
         WHERE message_id = $1 AND user_id != 'MAX_COUNT'`,
        [message.id]
    );

    // MAX kişi sayısını embed footer’dan oku
    const oldEmbed = message.embeds[0];
    const footerText = oldEmbed?.footer?.text || "Maksimum Katılımcı: 20";
    const maxCount = parseInt(footerText.split(":").pop().trim()) || 20;

    const listText =
        participants.rowCount > 0
            ? participants.rows.map(r => `<@${r.user_id}>`).join("\n")
            : "(Henüz kimse katılmadı)";

    const newEmbed = new EmbedBuilder(oldEmbed)
        .setFields({
            name: `Katılımcılar (${participants.rowCount}/${maxCount})`,
            value: listText
        })
        .setFooter({ text: `Maksimum Katılımcı: ${maxCount}` });

    await message.edit({ embeds: [newEmbed] }).catch(console.error);
}

client.login(BOT_TOKEN);






