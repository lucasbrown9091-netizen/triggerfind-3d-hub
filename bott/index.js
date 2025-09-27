/* eslint-disable */
const { Client, GatewayIntentBits, Partials, ActivityType, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, OverwriteType } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const express = require('express');
require('dotenv').config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID; // optional: if set, register guild commands for instant updates
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const PORT = process.env.PORT || 3000;

if (!DISCORD_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('Missing environment variables. Please set DISCORD_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE');
  process.exit(1);
}

// Create Express app for port binding
const app = express();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: client.user ? client.user.tag : 'Not ready',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    status: client.isReady() ? 'ready' : 'connecting',
    guilds: client.guilds.cache.size,
    users: client.users.cache.size,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch (_) {
    return null;
  }
}

const payload = decodeJwtPayload(SUPABASE_SERVICE_ROLE);
if (!payload || payload.role !== 'service_role') {
  console.error('The SUPABASE_SERVICE_ROLE value is not a service role key. Use the Service Role secret from Supabase → Settings → API.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel, Partials.GuildMember],
});

const commands = [
  new SlashCommandBuilder()
    .setName('genkey')
    .setDescription('Generate license key(s)')
    .addIntegerOption(o => o.setName('count').setDescription('Number of keys').setMinValue(1).setMaxValue(50).setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Validity (e.g. 1d,7d,30d,lifetime)').setChoices(
      { name: '1 day', value: '1d' },
      { name: '7 days', value: '7d' },
      { name: '30 days', value: '30d' },
      { name: '90 days', value: '90d' },
      { name: 'Lifetime', value: 'lifetime' },
    ).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('users')
    .setDescription('Show current registered users count')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('send')
    .setDescription('Send a message to a channel')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message content').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('verify-setup')
    .setDescription('Post a verify embed with a button that grants a role')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post in').setRequired(true))
    .addRoleOption(o => o.setName('role').setDescription('Role to grant on verify').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('Post a ticket panel; creates tickets in a category')
    .addChannelOption(o => o.setName('channel').setDescription('Panel channel').setRequired(true))
    .addChannelOption(o => o.setName('category').setDescription('Category for tickets').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('ip-reset')
    .setDescription('Reset IP lock for a user profile')
    .addStringOption(o => o.setName('username').setDescription('Username to reset IP for').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('delete-profile')
    .setDescription('Delete a user profile (for banned users)')
    .addStringOption(o => o.setName('username').setDescription('Username to delete').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  new SlashCommandBuilder()
    .setName('delete-license')
    .setDescription('Delete a license key')
    .addStringOption(o => o.setName('licensekey').setDescription('License key to delete').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
];

async function registerCommands(applicationId) {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  if (GUILD_ID) {
    console.log(`[commands] Registering ${commands.length} guild commands to guild ${GUILD_ID}...`);
    // Ensure old global commands are removed to avoid duplicates
    try {
      console.log('[commands] Clearing global commands to prevent duplicates...');
      await rest.put(Routes.applicationCommands(applicationId), { body: [] });
    } catch (e) {
      console.warn('[commands] Failed clearing global commands (safe to ignore):', e?.message || e);
    }
    await rest.put(Routes.applicationGuildCommands(applicationId, GUILD_ID), { body: commands });
  } else {
    console.log(`[commands] Registering ${commands.length} global commands (may take up to 1 hour to appear)...`);
    await rest.put(Routes.applicationCommands(applicationId), { body: commands });
  }
}

function generateLicenseKey() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const block = (len) => Array.from({ length: len }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `EV-${block(4)}-${block(4)}-${block(4)}`;
}

async function getUserCount() {
  const { count, error } = await supabase.from('license_keys').select('*', { count: 'exact', head: true }).eq('is_used', true);
  if (error) throw error;
  return count || 0;
}

function parseDurationToExpiry(duration) {
  if (!duration || duration === 'lifetime') return null;
  const now = Date.now();
  const m = /^([0-9]+)([dhm])$/.exec(duration);
  if (!m) return null;
  const value = parseInt(m[1], 10);
  const unit = m[2];
  let ms = 0;
  if (unit === 'd') ms = value * 24 * 60 * 60 * 1000;
  if (unit === 'h') ms = value * 60 * 60 * 1000;
  if (unit === 'm') ms = value * 60 * 1000;
  return new Date(now + ms).toISOString();
}

async function upsertKeysWithDuration(num, duration) {
  const expiresAt = parseDurationToExpiry(duration);
  const results = [];
  let attempts = 0;
  
  while (results.length < num) {
    const toMake = Math.min(25, num - results.length);
    const batch = Array.from({ length: toMake }, () => ({
      license_key: generateLicenseKey(),
      is_used: false,
      ...(expiresAt && { expires_at: expiresAt })
    }));
    
    console.log('Inserting batch:', batch[0]); // Debug log
    
    const { data, error } = await supabase
      .from('license_keys')
      .insert(batch)
      .select('license_key, expires_at');
      
    if (error) {
      console.error('Supabase error:', error);
      // On unique constraint violations, retry a few times
      attempts++;
      if (attempts > 5) throw error;
      continue;
    }
    
    results.push(...data.map(k => ({ 
      key: k.license_key, 
      expires_at: k.expires_at
    })));
  }
  
  return results;
}

async function updatePresence() {
  try {
    const count = await getUserCount();
    await client.user.setActivity({
      name: `${count} users`,
      type: ActivityType.Watching,
    });
  } catch (e) {
    console.error('Failed to update presence', e);
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands(client.user.id);
  await updatePresence();
  setInterval(updatePresence, 60_000);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  
  if (interaction.commandName === 'genkey') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
    }
    
    const num = interaction.options.getInteger('count');
    const duration = interaction.options.getString('duration');
    
    try {
      const keys = await upsertKeysWithDuration(num, duration);
      const lines = keys.map(k => {
        const expiry = k.expires_at ? `expires ${k.expires_at}` : 'lifetime';
        return `${k.key} (${expiry})`;
      });
      
      await interaction.reply({ 
        content: `Generated ${num} key(s):\n${lines.join('\n')}`, 
        ephemeral: true 
      });
      await updatePresence();
    } catch (e) {
      console.error('Key generation error:', e);
      const errorMsg = e.message ? `Error: ${e.message}` : 'Unknown error occurred';
      await interaction.reply({ content: `Failed to generate keys. ${errorMsg}`, ephemeral: true });
    }
  }
  
  if (interaction.commandName === 'users') {
    try {
      const count = await getUserCount();
      await interaction.reply({ content: `Current users: ${count}`, ephemeral: true });
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: 'Failed to fetch count.', ephemeral: true });
    }
  }
  
  if (interaction.commandName === 'send') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server permission.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel');
    const message = interaction.options.getString('message');
    if (!channel || !('send' in channel)) {
      return interaction.reply({ content: 'Invalid channel.', ephemeral: true });
    }
    try {
      await channel.send({ content: message });
      await interaction.reply({ content: 'Message sent.', ephemeral: true });
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: 'Failed to send message.', ephemeral: true });
    }
  }
  
  if (interaction.commandName === 'verify-setup') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server permission.', ephemeral: true });
    }
    const channel = interaction.options.getChannel('channel');
    const role = interaction.options.getRole('role');
    if (!channel || !role) return interaction.reply({ content: 'Invalid options.', ephemeral: true });
    const embed = new EmbedBuilder()
      .setTitle('Verification')
      .setDescription('Click the button to verify and get access to the server.')
      .setColor(0x00FFFF);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`verify:${role.id}`).setStyle(ButtonStyle.Success).setLabel('Verify')
    );
    await channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: 'Verify panel posted.', ephemeral: true });
  }
  
  if (interaction.commandName === 'ticket-setup') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server permission.', ephemeral: true });
    }
    const panelChannel = interaction.options.getChannel('channel');
    const category = interaction.options.getChannel('category');
    if (!panelChannel || !category || category.type !== ChannelType.GuildCategory) {
      return interaction.reply({ content: 'Provide a valid category channel.', ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setTitle('Support Tickets')
      .setDescription('Click to open a ticket. Our team will assist you soon.')
      .setColor(0x00FFFF);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket-open:${category.id}`).setStyle(ButtonStyle.Primary).setLabel('Open Ticket')
    );
    await panelChannel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: 'Ticket panel posted.', ephemeral: true });
  }
  
  if (interaction.commandName === 'ip-reset') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
    }
    
    const username = interaction.options.getString('username');
    
    try {
      // Find user by username
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, username')
        .eq('username', username)
        .single();
      
      if (profileError || !profile) {
        return interaction.reply({ content: `User '${username}' not found.`, ephemeral: true });
      }
      
      // Reset IP lock by clearing the locked IP
      const { error: resetError } = await supabase
        .from('profiles')
        .update({ 
          locked_ip: null, 
          last_ip: null, 
          ip_updated_at: new Date().toISOString() 
        })
        .eq('user_id', profile.user_id);
      
      if (resetError) {
        console.error('IP reset error:', resetError);
        return interaction.reply({ content: `Failed to reset IP for ${username}: ${resetError.message}`, ephemeral: true });
      }
      
      await interaction.reply({ content: `IP lock reset successfully for ${username}`, ephemeral: true });
    } catch (e) {
      console.error('IP reset error:', e);
      await interaction.reply({ content: `Failed to reset IP for ${username}: ${e.message}`, ephemeral: true });
    }
  }
  
  if (interaction.commandName === 'delete-profile') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
    }
    
    const username = interaction.options.getString('username');
    
    try {
      // Find user by username
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, username, id')
        .eq('username', username)
        .single();
      
      if (profileError || !profile) {
        return interaction.reply({ content: `User '${username}' not found.`, ephemeral: true });
      }
      
      // Delete the profile
      const { error: deleteError } = await supabase
        .from('profiles')
        .delete()
        .eq('user_id', profile.user_id);
      
      if (deleteError) {
        console.error('Profile deletion error:', deleteError);
        return interaction.reply({ content: `Failed to delete profile for ${username}: ${deleteError.message}`, ephemeral: true });
      }
      
      // Also delete the auth user
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(profile.user_id);
      
      if (authDeleteError) {
        console.error('Auth user deletion error:', authDeleteError);
        // Don't fail the command if auth deletion fails, profile is already deleted
      }
      
      await interaction.reply({ content: `Profile deleted successfully for ${username}`, ephemeral: true });
    } catch (e) {
      console.error('Profile deletion error:', e);
      await interaction.reply({ content: `Failed to delete profile for ${username}: ${e.message}`, ephemeral: true });
    }
  }
  
  if (interaction.commandName === 'delete-license') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: 'You need Administrator permission to use this command.', ephemeral: true });
    }
    
    const licenseKey = interaction.options.getString('licensekey');
    
    try {
      // Find license key
      const { data: license, error: licenseError } = await supabase
        .from('license_keys')
        .select('id, license_key, is_used')
        .eq('license_key', licenseKey)
        .single();
      
      if (licenseError || !license) {
        return interaction.reply({ content: `License key '${licenseKey}' not found.`, ephemeral: true });
      }
      
      // Delete the license key
      const { error: deleteError } = await supabase
        .from('license_keys')
        .delete()
        .eq('id', license.id);
      
      if (deleteError) {
        console.error('License deletion error:', deleteError);
        return interaction.reply({ content: `Failed to delete license key: ${deleteError.message}`, ephemeral: true });
      }
      
      const status = license.is_used ? ' (was used)' : ' (was unused)';
      await interaction.reply({ content: `License key deleted successfully${status}`, ephemeral: true });
    } catch (e) {
      console.error('License deletion error:', e);
      await interaction.reply({ content: `Failed to delete license key: ${e.message}`, ephemeral: true });
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  try {
    const [action, param] = interaction.customId.split(':');
    if (action === 'verify') {
      const roleId = param;
      const member = await interaction.guild.members.fetch(interaction.user.id);
      await member.roles.add(roleId);
      return interaction.reply({ content: 'You are verified. Role granted.', ephemeral: true });
    }
    if (action === 'ticket-open') {
      const categoryId = param;
      const guild = interaction.guild;
      // Prevent multiple open tickets for the same user (checks by topic tag)
      const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.parentId === categoryId && typeof c.topic === 'string' && c.topic.startsWith(`ticket:${interaction.user.id}:open`));
      if (existing) {
        return interaction.reply({ content: `You already have an open ticket: ${existing}`, ephemeral: true });
      }
      const channelName = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);
      const chan = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryId,
        topic: `ticket:${interaction.user.id}:open`,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel], type: OverwriteType.Role },
          { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages], type: OverwriteType.Member },
        ],
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket-close:${chan.id}`).setStyle(ButtonStyle.Danger).setLabel('Close Ticket')
      );
      await chan.send({ content: `${interaction.user}`, embeds: [new EmbedBuilder().setTitle('Ticket Opened').setColor(0x00FFFF)], components: [row] });
      return interaction.reply({ content: `Ticket created: ${chan}`, ephemeral: true });
    }
    if (action === 'ticket-close') {
      const channelId = param;
      if (interaction.channelId !== channelId) return interaction.reply({ content: 'Use the close button inside the ticket.', ephemeral: true });
      // Mark topic as closed before deleting so cache checks prevent race conditions
      try {
        if (interaction.channel && interaction.channel.setTopic) {
          await interaction.channel.setTopic(`ticket:${interaction.user.id}:closed:${Date.now()}`);
        }
      } catch (_) {}
      await interaction.channel.delete('Ticket closed');
      return;
    }
  } catch (e) {
    console.error('Button interaction failed', e);
    if (interaction.deferred || interaction.replied) return;
    return interaction.reply({ content: 'Something went wrong.', ephemeral: true });
  }
});

// Start the Express server
const server = app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    client.destroy();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    client.destroy();
    process.exit(0);
  });
});

client.login(DISCORD_TOKEN);
