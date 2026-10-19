/**
 * VertexCapitals Email Service Engine (Resend API First-Class Integration)
 * Standard Premium Soothing Template Suite
 * Dispatches live emails via Resend HTTP API (https://api.resend.com/emails), SMTP, or Local Fallback.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Built-in zero-dependency .env loader
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      });
    }
  } catch (e) {}
}
loadEnv();

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (e) {}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  if (nodemailer && host && user && pass) {
    try {
      transporter = nodemailer.createTransporter({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
      });
      console.log(`[VertexCapitals Email] SMTP transporter configured: ${host}`);
    } catch (err) {
      transporter = null;
    }
  }
  return transporter;
}

/**
 * Dispatch email via Resend REST API (https://api.resend.com/emails)
 */
function sendViaResend({ apiKey, from, to, subject, html, text }) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || html.replace(/<[^>]*>?/gm, '')
    });

    const options = {
      hostname: 'api.resend.com',
      port: 443,
      path: '/emails',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(body || '{}');
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.message || `Resend HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          reject(new Error(`Resend response parse error: ${body}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

/**
 * Premium Soothing Base HTML Template Wrapper
 */
function wrapHtmlEmail(title, preheader, contentHtml) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #070a11; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #cbd5e1; }

    .wrapper { width: 100%; table-layout: fixed; background-color: #070a11; padding-bottom: 50px; }
    .email-container { max-width: 580px; margin: 0 auto; background: #0c121e; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.08); overflow: hidden; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7); }
    
    .top-glow-bar { height: 4px; background: linear-gradient(90deg, #183EFA 0%, #3B82F6 50%, #183EFA 100%); }
    
    .header { padding: 36px 30px 24px 30px; text-align: center; background: radial-gradient(circle at 50% 0%, rgba(24, 62, 250, 0.12) 0%, rgba(12, 18, 30, 0) 70%); }
    .brand-icon { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: rgba(24, 62, 250, 0.15); border: 1px solid rgba(24, 62, 250, 0.4); border-radius: 14px; margin-bottom: 12px; }
    .brand-title { font-size: 22px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff; margin: 0; }
    .brand-accent { color: #38BDF8; }
    .brand-subtitle { font-size: 11px; font-weight: 600; letter-spacing: 2px; color: #94a3b8; text-transform: uppercase; margin-top: 6px; }

    .body-card { padding: 8px 36px 36px 36px; }
    .headline { font-size: 20px; font-weight: 700; color: #f8fafc; margin: 0 0 16px 0; letter-spacing: -0.3px; }
    .text-p { font-size: 14.5px; line-height: 1.65; color: #94a3b8; margin: 0 0 20px 0; }
    
    .code-wrapper { background: linear-gradient(180deg, rgba(24, 62, 250, 0.1) 0%, rgba(24, 62, 250, 0.02) 100%); border: 1px solid rgba(24, 62, 250, 0.35); border-radius: 14px; padding: 26px 20px; text-align: center; margin: 26px 0; box-shadow: inset 0 0 20px rgba(24, 62, 250, 0.05); }
    .code-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #60A5FA; margin-bottom: 10px; }
    .code-number { font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; text-shadow: 0 2px 14px rgba(24, 62, 250, 0.4); line-height: 1; padding-left: 10px; }
    .code-expiry { font-size: 12px; color: #64748b; margin-top: 12px; }
    
    .data-card { background: #101726; border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 12px; overflow: hidden; margin: 24px 0; }
    .data-table { width: 100%; border-collapse: collapse; text-align: left; }
    .data-table tr:not(:last-child) td { border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
    .data-table td { padding: 14px 18px; font-size: 13.5px; }
    .data-table .label { color: #94a3b8; font-weight: 500; }
    .data-table .val { color: #f8fafc; font-weight: 600; text-align: right; }

    .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-success { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-pending { background: rgba(24, 62, 250, 0.15); color: #60a5fa; border: 1px solid rgba(24, 62, 250, 0.3); }
    
    .btn-container { text-align: center; margin: 30px 0 10px 0; }
    .btn-primary { display: inline-block; background: #183EFA; color: #ffffff !important; font-size: 13.5px; font-weight: 700; text-decoration: none; padding: 14px 34px; border-radius: 10px; letter-spacing: 0.6px; text-transform: uppercase; box-shadow: 0 6px 22px rgba(24, 62, 250, 0.35); }
    
    .security-notice { background: rgba(30, 41, 59, 0.4); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 10px; padding: 14px 16px; margin-top: 24px; font-size: 12.5px; color: #64748b; line-height: 1.5; }
    .security-notice strong { color: #94a3b8; }

    .footer { padding: 28px 36px 36px 36px; text-align: center; background: #080d15; border-top: 1px solid rgba(255, 255, 255, 0.05); }
    .footer-text { font-size: 12px; color: #64748b; line-height: 1.6; margin: 0 0 12px 0; }
    .footer-links a { color: #38bdf8; text-decoration: none; font-weight: 500; }
    .footer-disclaimer { font-size: 11px; color: #475569; line-height: 1.5; margin: 16px 0 0 0; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#070a11;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader}
  </div>

  <table role="presentation" class="wrapper" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding: 40px 15px;">
        <div class="email-container">
          <div class="top-glow-bar"></div>
          
          <div class="header">
            <div class="brand-icon">
              <!-- Clean SVG Icon -->
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="#183EFA" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="#38BDF8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <h1 class="brand-title">Vertex<span class="brand-accent">Capitals</span></h1>
            <div class="brand-subtitle">Institutional OTC & Asset Management</div>
          </div>

          <div class="body-card">
            ${contentHtml}

            <div class="security-notice">
              <strong>Security Protocol:</strong> VertexCapitals will never ask for your password or 6-digit codes. Verify you are on <span style="color: #38bdf8;">https://VertexCapitals.ltd</span>.
            </div>
          </div>

          <div class="footer">
            <p class="footer-text">
              VertexCapitals Ltd &bull; 100 Bishopsgate, London EC2N 4AG, United Kingdom<br>
              Authorized Institutional Custody & Asset Management
            </p>
            <div class="footer-links" style="font-size: 12px;">
              <a href="https://VertexCapitals.ltd">Official Portal</a> &nbsp;&bull;&nbsp; 
              <a href="mailto:support@vertexcapitals.ltd">Support Desk</a> &nbsp;&bull;&nbsp; 
              <a href="https://VertexCapitals.ltd/dashboard.html">Client Dashboard</a>
            </div>
            <p class="footer-disclaimer">
              &copy; ${new Date().getFullYear()} VertexCapitals.ltd. All rights reserved. Confidential transmission intended solely for the registered recipient.
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Universal SendMail function: Priority 1 = Resend API, Priority 2 = SMTP, Priority 3 = Memory Logger
 */
async function sendMail({ userId, to, subject, html, text, eventType = 'general' }) {
  let from = process.env.EMAIL_FROM || process.env.RESEND_FROM;
  if (!from) {
    const fromName = process.env.EMAIL_FROM_NAME || process.env.SMTP_FROM_NAME || 'VertexCapitals Security Desk';
    const fromEmail = process.env.SMTP_FROM || 'onboarding@resend.dev';
    from = `"${fromName}" <${fromEmail}>`;
  }

  const mailRecord = {
    id: Date.now(),
    user_id: userId || null,
    recipient_email: to,
    subject: subject,
    body: text || html.replace(/<[^>]*>?/gm, ''),
    html_body: html,
    event_type: eventType,
    sent_at: new Date().toISOString(),
    delivery_status: 'pending'
  };

  const resendApiKey = process.env.RESEND_API_KEY;

  // 1. Try Resend API first if configured
  if (resendApiKey && resendApiKey.startsWith('re_')) {
    try {
      const resendResult = await sendViaResend({
        apiKey: resendApiKey,
        from,
        to,
        subject,
        html,
        text: mailRecord.body
      });
      console.log(`[VertexCapitals Resend] Successfully sent live email to ${to} (ID: ${resendResult.id})`);
      mailRecord.delivery_status = 'delivered_resend';
      mailRecord.provider_id = resendResult.id;
      return mailRecord;
    } catch (err) {
      console.error(`\n❌ [VertexCapitals Resend Error] Could not dispatch email to: ${to}`);
      console.error(`   Details: ${err.message}`);
      if (err.message.includes('not verified') || err.message.includes('domain')) {
        console.error(`   💡 TIP: Make sure "${from}" is a verified domain in your Resend Dashboard (https://resend.com/domains).`);
        console.error(`   💡 For testing without a verified domain, set EMAIL_FROM=onboarding@resend.dev in .env and send to your Resend account email.`);
      }
      console.error(`\n`);
      mailRecord.delivery_status = 'failed_resend_fallback';
    }
  }

  // 2. Try SMTP fallback
  const activeTransporter = getTransporter();
  if (activeTransporter) {
    try {
      const info = await activeTransporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'VertexCapitals Desk'}" <${process.env.SMTP_FROM || 'support@vertexcapitals.ltd'}>`,
        to,
        subject,
        text: mailRecord.body,
        html: html
      });
      console.log(`[VertexCapitals SMTP] Delivered live email to ${to} (MessageID: ${info.messageId})`);
      mailRecord.delivery_status = 'delivered_smtp';
      return mailRecord;
    } catch (err) {
      console.error(`[VertexCapitals SMTP Error]`, err.message);
    }
  }

  // 3. In-memory log fallback
  console.log(`[VertexCapitals Email Service] (Local Log Fallback) Dispatched to: ${to} | Subject: ${subject}`);
  mailRecord.delivery_status = 'logged_in_memory';
  return mailRecord;
}


// ==========================================
// PRE-BUILT LUXURY TRANSACTIONAL TEMPLATES
// ==========================================

const EmailTemplates = {
  // 1. Account Verification Code (6-digit)
  verificationCode: (name, code) => {
    const title = 'Your VertexCapitals Verification Code';
    const preheader = `Your 6-digit verification code is ${code}. Valid for 15 minutes.`;
    const content = `
      <h2 class="headline">Verify Your Email Address</h2>
      <p class="text-p">Hello <strong style="color: #f8fafc;">${name || 'Investor'}</strong>,</p>
      <p class="text-p">Thank you for opening an account with VertexCapitals. Please enter the one-time 6-digit authorization code below in your registration window to verify your email and activate your account:</p>
      
      <div class="code-wrapper">
        <div class="code-label">One-Time Security Code</div>
        <div class="code-number">${code}</div>
        <div class="code-expiry">⏱ Valid for 15 minutes &bull; Single-use authorization</div>
      </div>

      <p class="text-p" style="font-size: 13.5px; margin-bottom: 0;">If you did not request this verification code, please disregard this transmission.</p>
    `;
    return { subject: `[VertexCapitals] Your 6-Digit Verification Code: ${code}`, html: wrapHtmlEmail(title, preheader, content) };
  },

  // 2. Welcome & Account Activated
  welcomeAccount: (name, accountNum) => {
    const title = 'Welcome to VertexCapitals - Account Activated';
    const preheader = `Your institutional account #${accountNum} is now active and ready.`;
    const content = `
      <h2 class="headline" style="color: #34d399;">Welcome to VertexCapitals</h2>
      <p class="text-p">Hello <strong style="color: #f8fafc;">${name || 'Investor'}</strong>,</p>
      <p class="text-p">Your email address has been verified and your institutional OTC investment account has been activated.</p>
      
      <div class="data-card">
        <table class="data-table">
          <tr><td class="label">Account Holder</td><td class="val">${name}</td></tr>
          <tr><td class="label">Account Number</td><td class="val" style="font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #fbbf24;">${accountNum}</td></tr>
          <tr><td class="label">Verification Status</td><td class="val"><span class="badge badge-success">Active & Verified</span></td></tr>
        </table>
      </div>

      <p class="text-p">You can now fund your liquid Exchange Wallet with cryptocurrency to participate in weekly OTC investment cycles.</p>

      <div class="btn-container">
        <a href="https://VertexCapitals.ltd/dashboard.html" class="btn-primary">Access Investor Dashboard</a>
      </div>
    `;
    return { subject: `[VertexCapitals] Welcome! Your Account #${accountNum} is Active`, html: wrapHtmlEmail(title, preheader, content) };
  },

  // 3. Password Reset Code
  passwordReset: (name, code) => {
    const title = 'VertexCapitals Password Reset';
    const preheader = `Your password recovery authorization code is ${code}`;
    const content = `
      <h2 class="headline">Reset Account Password</h2>
      <p class="text-p">Hello <strong style="color: #f8fafc;">${name || 'Investor'}</strong>,</p>
      <p class="text-p">We received a request to reset the password for your VertexCapitals account. Enter the verification code below:</p>
      
      <div class="code-wrapper">
        <div class="code-label">Password Recovery Code</div>
        <div class="code-number">${code}</div>
        <div class="code-expiry">⏱ Expires in 15 minutes &bull; Confidential</div>
      </div>

      <p class="text-p" style="font-size: 13.5px; margin-bottom: 0;">If you did not request this, please notify support@vertexcapitals.ltd immediately.</p>
    `;
    return { subject: `[Security Alert] Password Reset Code: ${code}`, html: wrapHtmlEmail(title, preheader, content) };
  },

  // 4. Deposit Submission Pending
  depositPending: (name, amount, asset, txHash) => {
    const title = 'Deposit Received & Under Review';
    const preheader = `Deposit of $${parseFloat(amount).toLocaleString()} (${asset}) is processing.`;
    const content = `
      <h2 class="headline">Deposit Received</h2>
      <p class="text-p">Hello <strong style="color: #f8fafc;">${name || 'Investor'}</strong>,</p>
      <p class="text-p">Your cryptocurrency deposit has been registered and is awaiting confirmation by our treasury desk.</p>
      
      <div class="data-card">
        <table class="data-table">
          <tr><td class="label">Asset & Network</td><td class="val">${asset}</td></tr>
          <tr><td class="label">Deposit Amount</td><td class="val" style="color: #fbbf24; font-size: 15px;">$${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
          <tr><td class="label">Transaction Reference / TXID</td><td class="val" style="font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; word-break: break-all;">${txHash || 'TX-PENDING'}</td></tr>
          <tr><td class="label">Status</td><td class="val"><span class="badge badge-pending">Pending Confirmation</span></td></tr>
        </table>
      </div>

      <p class="text-p" style="font-size: 13.5px; margin-bottom: 0;">Your Exchange Wallet balance will update automatically as soon as settlement is confirmed.</p>
    `;
    return { subject: `[VertexCapitals] Deposit Pending: $${parseFloat(amount).toLocaleString()} (${asset})`, html: wrapHtmlEmail(title, preheader, content) };
  },

  // 5. Deposit Approved & Balance Credited
  depositApproved: (name, amount, asset, newBalance) => {
    const title = 'Deposit Confirmed & Credited';
    const preheader = `Your deposit of +$${parseFloat(amount).toLocaleString()} has been credited to your Exchange Wallet.`;
    const content = `
      <h2 class="headline" style="color: #34d399;">Funds Successfully Credited</h2>
      <p class="text-p">Hello <strong style="color: #f8fafc;">${name || 'Investor'}</strong>,</p>
      <p class="text-p">Your cryptocurrency deposit has been verified and credited to your liquid Exchange Wallet.</p>
      
      <div class="data-card">
        <table class="data-table">
          <tr><td class="label">Amount Credited</td><td class="val" style="color: #34d399; font-size: 16px;">+$${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
          <tr><td class="label">Asset</td><td class="val">${asset}</td></tr>
          <tr><td class="label">Updated Exchange Balance</td><td class="val" style="font-weight: 800; font-size: 16px;">$${parseFloat(newBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
          <tr><td class="label">Settlement Status</td><td class="val"><span class="badge badge-success">Completed</span></td></tr>
        </table>
      </div>

      <div class="btn-container">
        <a href="https://VertexCapitals.ltd/dashboard.html" class="btn-primary">Access Dashboard & Allocate Capital</a>
      </div>
    `;
    return { subject: `[Confirmed] Deposit Credited: +$${parseFloat(amount).toLocaleString()} USD`, html: wrapHtmlEmail(title, preheader, content) };
  },

  // 6. Withdrawal Requested
  withdrawalRequested: (name, amount, asset, destinationAddress) => {
    const title = 'Withdrawal Request Submitted';
    const preheader = `Payout request of $${parseFloat(amount).toLocaleString()} submitted for processing.`;
    const content = `
      <h2 class="headline">Payout Request Initiated</h2>
      <p class="text-p">Hello <strong style="color: #f8fafc;">${name || 'Investor'}</strong>,</p>
      <p class="text-p">Your withdrawal request has been submitted to the treasury desk for security processing.</p>
      
      <div class="data-card">
        <table class="data-table">
          <tr><td class="label">Requested Amount</td><td class="val" style="color: #f8fafc; font-size: 15px;">$${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
          <tr><td class="label">Asset</td><td class="val">${asset}</td></tr>
          <tr><td class="label">Destination Wallet</td><td class="val" style="font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; word-break: break-all;">${destinationAddress}</td></tr>
          <tr><td class="label">Estimated Settlement</td><td class="val">Within 1–24 Hours</td></tr>
          <tr><td class="label">Status</td><td class="val"><span class="badge badge-pending">Processing</span></td></tr>
        </table>
      </div>
    `;
    return { subject: `[VertexCapitals] Payout Request Submitted: $${parseFloat(amount).toLocaleString()}`, html: wrapHtmlEmail(title, preheader, content) };
  },

  // 7. Withdrawal Approved & Paid
  withdrawalApproved: (name, amount, asset, destinationAddress, txHash) => {
    const title = 'Withdrawal Dispatched & Completed';
    const preheader = `Payout of $${parseFloat(amount).toLocaleString()} has been sent to your external wallet.`;
    const content = `
      <h2 class="headline" style="color: #34d399;">Withdrawal Dispatched</h2>
      <p class="text-p">Hello <strong style="color: #f8fafc;">${name || 'Investor'}</strong>,</p>
      <p class="text-p">Your withdrawal has been approved by the treasury desk and successfully broadcast on the blockchain.</p>
      
      <div class="data-card">
        <table class="data-table">
          <tr><td class="label">Dispatched Amount</td><td class="val" style="color: #34d399; font-size: 16px;">$${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
          <tr><td class="label">Asset</td><td class="val">${asset}</td></tr>
          <tr><td class="label">Destination Wallet</td><td class="val" style="font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; word-break: break-all;">${destinationAddress}</td></tr>
          <tr><td class="label">Blockchain TXID</td><td class="val" style="font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 12px; word-break: break-all;">${txHash || 'CONFIRMED-ON-CHAIN'}</td></tr>
          <tr><td class="label">Status</td><td class="val"><span class="badge badge-success">Dispatched & Paid</span></td></tr>
        </table>
      </div>
    `;
    return { subject: `[Processed] Payout Sent: $${parseFloat(amount).toLocaleString()} (${asset})`, html: wrapHtmlEmail(title, preheader, content) };
  },

  // 8. OTC Capital Allocated
  otcCapitalAllocated: (name, amount, trancheName, weeklyRoi, durationDays) => {
    const title = 'OTC Capital Allocation Confirmed';
    const preheader = `Your capital allocation of $${parseFloat(amount).toLocaleString()} to the ${trancheName || 'Institutional OTC'} Tranche is active.`;
    const weeklyEst = (parseFloat(amount) * (parseFloat(weeklyRoi || 7.5) / 100));
    const content = `
      <h2 class="headline" style="color: #34d399;">OTC Capital Allocation Confirmed</h2>
      <p class="text-p">Hello <strong style="color: #f8fafc;">${name || 'Investor'}</strong>,</p>
      <p class="text-p">Your capital allocation from your liquid Exchange Wallet to the VertexCapitals Institutional OTC desk has been executed and is now generating weekly yield.</p>
      
      <div class="data-card">
        <table class="data-table">
          <tr><td class="label">Tranche Tier</td><td class="val" style="color: #fbbf24; font-weight: 800;">${trancheName || 'Executive Multi-Asset Tranche'}</td></tr>
          <tr><td class="label">Principal Allocated</td><td class="val" style="color: #f8fafc; font-size: 16px; font-weight: 700;">$${parseFloat(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD</td></tr>
          <tr><td class="label">Target Yield Rate</td><td class="val" style="color: #34d399; font-weight: 700;">+${weeklyRoi || '7.50'}% / Week</td></tr>
          <tr><td class="label">Est. Weekly Return</td><td class="val" style="color: #34d399; font-weight: 700;">+$${weeklyEst.toLocaleString(undefined, { minimumFractionDigits: 2 })} / Week</td></tr>
          <tr><td class="label">Contract Duration</td><td class="val">${durationDays || 30} Days (Segregated Cold Vault)</td></tr>
          <tr><td class="label">Allocation Status</td><td class="val"><span class="badge badge-success">Active & Trading</span></td></tr>
        </table>
      </div>

      <div class="btn-container">
        <a href="https://VertexCapitals.ltd/invest-otc.html" class="btn-primary">View Active Contract & Yield Progress</a>
      </div>
    `;
    return { subject: `[Confirmed] $${parseFloat(amount).toLocaleString()} Allocated to OTC Trading`, html: wrapHtmlEmail(title, preheader, content) };
  },

  // 9. OTC Yield Accrued / Profit Credited
  otcProfitCredited: (name, profitAmount, totalAccrued) => {
    const title = 'OTC Yield Profit Credited';
    const preheader = `Weekly OTC Profit Return of +$${parseFloat(profitAmount).toLocaleString()} credited.`;
    const content = `
      <h2 class="headline" style="color: #fbbf24;">Institutional OTC Yield Credited</h2>
      <p class="text-p">Hello <strong style="color: #f8fafc;">${name || 'Investor'}</strong>,</p>
      <p class="text-p">Your allocated capital in the VertexCapitals OTC trading cycle has accrued its scheduled weekly return.</p>
      
      <div class="data-card">
        <table class="data-table">
          <tr><td class="label">Yield Return Credited</td><td class="val" style="color: #34d399; font-size: 16px;">+$${parseFloat(profitAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
          <tr><td class="label">Total Accrued Profit</td><td class="val" style="color: #fbbf24; font-weight: 800; font-size: 16px;">$${parseFloat(totalAccrued).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td></tr>
          <tr><td class="label">Contract Cycle</td><td class="val">Active 30-Day Tranche (7.5%/wk)</td></tr>
          <tr><td class="label">Yield Status</td><td class="val"><span class="badge badge-success">Credited</span></td></tr>
        </table>
      </div>

      <div class="btn-container">
        <a href="https://VertexCapitals.ltd/dashboard.html" class="btn-primary">View Portfolio & Transfer to Exchange</a>
      </div>
    `;
    return { subject: `[OTC Yield] +$${parseFloat(profitAmount).toLocaleString()} Profit Credited`, html: wrapHtmlEmail(title, preheader, content) };
  },

  // 9. Custom Admin Broadcast
  customMessage: (name, subject, customBody) => {
    const title = subject || 'Official Communication from VertexCapitals';
    const preheader = subject;
    const content = `
      <h2 class="headline">${subject}</h2>
      <p class="text-p">Hello <strong style="color: #f8fafc;">${name || 'Investor'}</strong>,</p>
      
      <div style="background: #101726; padding: 22px; border-radius: 12px; border-left: 4px solid #fbbf24; margin: 20px 0; font-size: 14.5px; line-height: 1.65; color: #f1f5f9;">
        ${customBody.replace(/\n/g, '<br>')}
      </div>

      <p class="text-p" style="font-size: 13.5px; margin-bottom: 0;">Our 24/7 institutional desk is available if you require any assistance.</p>
    `;
    return { subject: subject, html: wrapHtmlEmail(title, preheader, content) };
  }
};

module.exports = {
  sendMail,
  EmailTemplates,
  wrapHtmlEmail
};
