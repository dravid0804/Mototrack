// test-notify.js — Email only test
// Run: node test-notify.js
require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('\n=== RevTrack Email Test ===\n');
console.log('SMTP_HOST :', process.env.SMTP_HOST);
console.log('SMTP_PORT :', process.env.SMTP_PORT);
console.log('SMTP_USER :', process.env.SMTP_USER);
console.log('SMTP_PASS :', process.env.SMTP_PASS ? `✓ Set (${process.env.SMTP_PASS.length} chars)` : '❌ NOT SET');
console.log('EMAIL_FROM:', process.env.EMAIL_FROM);
console.log('');

async function test() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('❌ Set SMTP_USER and SMTP_PASS in your .env file first.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    tls: { rejectUnauthorized: false },
  });

  console.log('Connecting to Gmail SMTP...');
  try {
    await transporter.verify();
    console.log('✅ SMTP connection successful!\n');
  } catch (err) {
    console.log('❌ SMTP connection failed:', err.message);
    if (err.message.includes('Invalid login') || err.message.includes('Username and Password')) {
      console.log('\n🔧 Your SMTP_PASS is wrong.');
      console.log('   You MUST use a Gmail App Password, not your Gmail login password.');
      console.log('   Steps to get it:');
      console.log('   1. Go to: myaccount.google.com/apppasswords');
      console.log('   2. App name: RevTrack → Click Create');
      console.log('   3. Copy the 16-character code (no spaces)');
      console.log('   4. Put it in .env as: SMTP_PASS=abcdefghijklmnop');
    }
    return;
  }

  console.log('Sending test email to:', process.env.SMTP_USER);
  try {
    const info = await transporter.sendMail({
      from:    `"RevTrack" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to:      process.env.SMTP_USER,
      subject: '✅ RevTrack Email Working!',
      html: `<div style="font-family:sans-serif;max-width:500px;margin:40px auto;padding:30px;background:#f4f7fb;border-radius:12px">
        <h2 style="color:#E85D1A;margin-bottom:8px">⚙ RevTrack</h2>
        <h3 style="color:#0F172A">Email notifications are working!</h3>
        <p style="color:#334155">You will now receive:</p>
        <ul style="color:#334155;line-height:1.8">
          <li>⚠️ Service due warnings — 7 days before</li>
          <li>🚨 Urgent reminders — 3 days before</li>
          <li>🔴 Overdue critical alerts — immediately</li>
          <li>✅ Service completion confirmations</li>
          <li>📊 Monthly health digest</li>
        </ul>
        <p style="color:#64748B;font-size:12px;margin-top:20px">Sent from RevTrack on ${new Date().toLocaleString()}</p>
      </div>`,
    });
    console.log('✅ EMAIL SENT SUCCESSFULLY!');
    console.log('   Check inbox at:', process.env.SMTP_USER);
    console.log('   Message ID:', info.messageId);
  } catch (err) {
    console.log('❌ Send failed:', err.message);
  }
}

test();
