/**
 * VertexCapitals Platform Server (Node.js)
 * Full MySQL-Backed REST API Engine with safe async dispatch, non-blocking email notifications, and bulletproof request streaming.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

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

const db = require('./database');
const emailService = require('./email-service');

const PORT = process.env.PORT || 3000;

// Helper: 6-digit numeric verification code
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: Account Number
function generateAccountNumber() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Helper: Background Email Dispatcher (Never blocks HTTP response)
function dispatchEmailAsync({ userId, to, templateResult, eventType = 'general', customSubject, customBody }) {
  let subject = customSubject;
  let html = '';
  let text = customBody || '';

  if (templateResult) {
    subject = templateResult.subject;
    html = templateResult.html;
  } else if (customSubject && customBody) {
    const tmpl = emailService.EmailTemplates.customMessage('Investor', customSubject, customBody);
    subject = tmpl.subject;
    html = tmpl.html;
  }

  // Non-blocking fire-and-forget in background
  emailService.sendMail({
    userId,
    to,
    subject,
    html,
    text,
    eventType
  }).then(mailRecord => {
    db.logEmail({
      userId,
      to,
      subject,
      html,
      eventType
    }).catch(() => {});
  }).catch(err => {
    console.error('[Email Dispatch Background Warning]', err.message);
  });
}

// ==========================================
// ADMIN SESSION TOKEN STORE
// ==========================================
const adminSessions = new Map();
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function generateAdminToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < 64; i++) t += chars.charAt(Math.floor(Math.random() * chars.length));
  return `vx_adm_${t}`;
}

function createAdminSession(user) {
  const token = generateAdminToken();
  const now = Date.now();
  adminSessions.set(token, {
    userId: user.id,
    email: user.email,
    full_name: user.full_name,
    createdAt: now,
    expiresAt: now + ADMIN_SESSION_TTL_MS
  });
  return token;
}

function validateAdminToken(req) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return null;
  const session = adminSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return null;
  }
  return session;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (now > session.expiresAt) adminSessions.delete(token);
  }
}, 30 * 60 * 1000);

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

// Bulletproof Body Parser with 1.5s Max Safety Timer
function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') {
      return resolve(req.body);
    }

    const timer = setTimeout(() => {
      resolve({});
    }, 1500);

    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 2e6) { // 2MB limit
        clearTimeout(timer);
        req.destroy();
        resolve({});
      }
    });

    req.on('end', () => {
      clearTimeout(timer);
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });

    req.on('error', () => {
      clearTimeout(timer);
      resolve({});
    });
  });
}

function sendJSON(res, data, statusCode = 200) {
  if (res.writableEnded) return;
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

// Main HTTP Request Handler Function
async function requestHandler(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  // ==========================================
  // REST API ROUTER
  // ==========================================

  try {
    // 1. Auth: Register (Step 1 -> 6-Digit Email Code)
    if (method === 'POST' && pathname === '/api/auth/register') {
      const body = await parseBody(req);
      const fullName = (body.full_name || body.fullName || body.name || '').trim();
      const rawEmail = (body.email || '').trim().toLowerCase();
      const userPassword = body.password || body.pass || 'user123';
      const country = body.country || 'United States';
      const referralCode = body.referral_code || body.referralCode || null;

      if (!rawEmail || !fullName) {
        return sendJSON(res, { success: false, message: 'Full name and email are required.' }, 400);
      }

      const cleanEmail = rawEmail;
      const verificationCode = generateVerificationCode();
      const accountNum = generateAccountNumber();

      let user = await db.findUserByEmail(cleanEmail);
      if (!user) {
        user = await db.createUser({
          full_name: fullName,
          email: cleanEmail,
          password_hash: userPassword,
          country: country,
          account_number: accountNum,
          role: 'user',
          status: 'active',
          verification_code: verificationCode,
          is_verified: 0,
          referral_code: `VX-${accountNum}`,
          referred_by: referralCode,
          kyc_status: 'unverified'
        });
        await db.createWallet({ user_id: user.id });
      } else {
        user = await db.updateUser(user.id, {
          verification_code: verificationCode,
          password_hash: password || user.password_hash,
          full_name: full_name.trim() || user.full_name
        });
      }

      const template = emailService.EmailTemplates.verificationCode(user.full_name, verificationCode);
      dispatchEmailAsync({
        userId: user.id,
        to: cleanEmail,
        templateResult: template,
        eventType: 'verification_code'
      });

      return sendJSON(res, {
        success: true,
        message: '6-digit verification code sent to your email.',
        email: cleanEmail
      });
    }

    // 2. Auth: Verify 6-Digit Code (Step 2 -> Account Activated)
    if (method === 'POST' && pathname === '/api/auth/verify-email') {
      const body = await parseBody(req);
      const { email, code } = body;
      const cleanEmail = (email || '').trim().toLowerCase();
      const user = await db.findUserByEmail(cleanEmail);

      if (!user) {
        return sendJSON(res, { success: false, message: 'Account not found.' }, 404);
      }

      if (!user.verification_code || user.verification_code !== (code || '').toString().trim()) {
        return sendJSON(res, { success: false, message: 'Invalid 6-digit verification code.' }, 400);
      }

      const updatedUser = await db.updateUser(user.id, {
        is_verified: 1,
        verification_code: null
      });

      const wallet = await db.getWalletByUserId(user.id);

      const template = emailService.EmailTemplates.welcomeAccount(
        updatedUser.full_name,
        updatedUser.account_number
      );
      dispatchEmailAsync({
        userId: updatedUser.id,
        to: updatedUser.email,
        templateResult: template,
        eventType: 'welcome'
      });

      return sendJSON(res, { success: true, message: 'Account verified successfully!', user: updatedUser, wallet });
    }

    // 2b. Auth: Resend OTP Code
    if (method === 'POST' && pathname === '/api/auth/resend-otp') {
      const body = await parseBody(req);
      const { email } = body;
      const cleanEmail = (email || '').trim().toLowerCase();
      const user = await db.findUserByEmail(cleanEmail);

      if (!user) {
        return sendJSON(res, { success: false, message: 'Account not found. Please register first.' }, 404);
      }

      const verificationCode = generateVerificationCode();
      await db.updateUser(user.id, { verification_code: verificationCode });

      const template = emailService.EmailTemplates.verificationCode(user.full_name, verificationCode);
      dispatchEmailAsync({
        userId: user.id,
        to: cleanEmail,
        templateResult: template,
        eventType: 'verification_code'
      });

      return sendJSON(res, {
        success: true,
        message: 'Fresh 6-digit verification code sent to your email.',
        email: cleanEmail
      });
    }

    // 3. Auth: Login
    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await parseBody(req);
      const { email, password } = body;

      if (!email || !password) {
        return sendJSON(res, { success: false, message: 'Email and password are required.' }, 400);
      }

      const cleanEmail = (email || '').trim().toLowerCase();
      const user = await db.findUserByEmail(cleanEmail);

      if (!user) {
        return sendJSON(res, { success: false, message: 'Invalid email or password.' }, 401);
      }
      if (user.status === 'banned') {
        return sendJSON(res, { success: false, message: 'Account is suspended. Contact compliance desk.' }, 403);
      }

      if (!user.password_hash || user.password_hash !== password) {
        return sendJSON(res, { success: false, message: 'Invalid email or password.' }, 401);
      }

      if (user.is_verified === 0 && user.role !== 'admin') {
        const verificationCode = generateVerificationCode();
        await db.updateUser(user.id, { verification_code: verificationCode });

        const template = emailService.EmailTemplates.verificationCode(user.full_name, verificationCode);
        dispatchEmailAsync({
          userId: user.id,
          to: user.email,
          templateResult: template,
          eventType: 'verification_code'
        });
        return sendJSON(res, {
          success: false,
          requiresVerification: true,
          email: user.email,
          message: 'Account email is unverified. We dispatched a fresh 6-digit verification code to your inbox.'
        }, 403);
      }

      const wallet = await db.getWalletByUserId(user.id);

      if (user.role === 'admin') {
        const adminToken = createAdminSession(user);
        return sendJSON(res, {
          success: true,
          message: 'Admin login successful',
          user,
          wallet,
          adminToken,
          tokenExpiresIn: ADMIN_SESSION_TTL_MS
        });
      }

      return sendJSON(res, { success: true, message: 'Login successful', user, wallet });
    }

    // 4. Auth: Forgot Password
    if (method === 'POST' && pathname === '/api/auth/forgot-password') {
      const body = await parseBody(req);
      const { email } = body;
      const cleanEmail = (email || '').trim().toLowerCase();
      const user = await db.findUserByEmail(cleanEmail);

      if (!user) {
        return sendJSON(res, {
          success: false,
          message: 'No registered account found with that email address. Please check your spelling or create an account.'
        }, 404);
      }

      const code = generateVerificationCode();
      await db.updateUser(user.id, { verification_code: code });

      const template = emailService.EmailTemplates.passwordReset(user.full_name, code);
      dispatchEmailAsync({
        userId: user.id,
        to: cleanEmail,
        templateResult: template,
        eventType: 'password_reset'
      });

      return sendJSON(res, {
        success: true,
        message: '6-digit password recovery code dispatched to your email.',
        email: cleanEmail
      });
    }

    // 5. Auth: Reset Password
    if (method === 'POST' && pathname === '/api/auth/reset-password') {
      const body = await parseBody(req);
      const { email, code, new_password } = body;
      const cleanEmail = (email || '').trim().toLowerCase();
      const user = await db.findUserByEmail(cleanEmail);

      if (!user) {
        return sendJSON(res, { success: false, message: 'User not found.' }, 404);
      }
      if (!user.verification_code || user.verification_code !== (code || '').toString().trim()) {
        return sendJSON(res, { success: false, message: 'Invalid or expired 6-digit reset code.' }, 400);
      }

      await db.updateUser(user.id, {
        password_hash: new_password,
        verification_code: null
      });

      return sendJSON(res, { success: true, message: 'Password updated successfully. Please login.' });
    }

    // 6. Wallet: Summary
    if (method === 'GET' && pathname.startsWith('/api/wallet/summary/')) {
      const userId = parseInt(pathname.split('/').pop(), 10);
      const user = await db.findUserById(userId);
      if (!user) return sendJSON(res, { success: false, message: 'User not found' }, 404);

      const [wallet, otcPlan, transactions, companyWallets] = await Promise.all([
        db.getWalletByUserId(userId),
        db.getOtcPlanByUserId(userId),
        db.getTransactionsByUserId(userId),
        db.getCompanyWallets()
      ]);

      const activeWallets = (companyWallets || []).filter(w => w.is_active === 1);
      return sendJSON(res, { success: true, user, wallet, otcPlan, transactions, companyWallets: activeWallets });
    }

    // 7. Wallet: Request Deposit
    if (method === 'POST' && pathname === '/api/wallet/deposit') {
      const body = await parseBody(req);
      const { user_id, asset, amount, tx_hash } = body;
      const userId = parseInt(user_id, 10);
      const user = await db.findUserById(userId);

      if (!user) return sendJSON(res, { success: false, message: 'User not found.' }, 404);

      const txRef = 'TX-' + Math.floor(100000 + Math.random() * 900000);
      const newTx = await db.createTransaction({
        tx_ref: txRef,
        user_id: user.id,
        user_name: user.full_name,
        user_email: user.email,
        type: 'deposit',
        amount: parseFloat(amount || 0),
        asset: asset || 'USDT (TRC20)',
        status: 'pending',
        destination_address: 'Company Crypto Vault',
        tx_hash: tx_hash || 'TX-SUBMITTED',
        notes: 'Pending Admin Verification'
      });

      const template = emailService.EmailTemplates.depositPending(user.full_name, newTx.amount, newTx.asset, newTx.tx_hash);
      dispatchEmailAsync({
        userId: user.id,
        to: user.email,
        templateResult: template,
        eventType: 'deposit_pending'
      });

      return sendJSON(res, { success: true, message: 'Deposit request submitted.', transaction: newTx });
    }

    // 8. Wallet: Request Withdrawal
    if (method === 'POST' && pathname === '/api/wallet/withdraw') {
      const body = await parseBody(req);
      const { user_id, asset, amount, destination_address } = body;
      const userId = parseInt(user_id, 10);
      const user = await db.findUserById(userId);
      if (!user) return sendJSON(res, { success: false, message: 'User not found.' }, 404);

      const wallet = await db.getWalletByUserId(user.id);
      const parsedAmount = parseFloat(amount || 0);

      if (!wallet || wallet.exchange_balance < parsedAmount) {
        return sendJSON(res, { success: false, message: 'Insufficient Exchange Wallet balance.' }, 400);
      }

      const updatedWallet = await db.updateWallet(user.id, {
        exchange_balance: wallet.exchange_balance - parsedAmount
      });

      const txRef = 'WD-' + Math.floor(100000 + Math.random() * 900000);
      const newTx = await db.createTransaction({
        tx_ref: txRef,
        user_id: user.id,
        user_name: user.full_name,
        user_email: user.email,
        type: 'withdrawal',
        amount: parsedAmount,
        asset: asset || 'Bitcoin (BTC)',
        status: 'pending',
        destination_address: destination_address || 'External Address',
        tx_hash: 'PENDING-PAYOUT-DISPATCH',
        notes: 'Pending Admin Processing'
      });

      const template = emailService.EmailTemplates.withdrawalRequested(user.full_name, parsedAmount, newTx.asset, newTx.destination_address);
      dispatchEmailAsync({
        userId: user.id,
        to: user.email,
        templateResult: template,
        eventType: 'withdrawal_pending'
      });

      return sendJSON(res, { success: true, message: 'Withdrawal submitted.', wallet: updatedWallet, transaction: newTx });
    }

    // 9. Wallet: Invest in OTC
    if (method === 'POST' && pathname === '/api/wallet/invest-otc') {
      const body = await parseBody(req);
      const { user_id, amount, tranche_name, weekly_roi, duration_days } = body;
      const userId = parseInt(user_id, 10);
      const user = await db.findUserById(userId);
      
      if (!user) {
        return sendJSON(res, { success: false, message: 'User account not found.' }, 404);
      }

      const wallet = await db.getWalletByUserId(user.id);
      const parsedAmount = parseFloat(amount || 0);

      if (parsedAmount <= 0) {
        return sendJSON(res, { success: false, message: 'Please enter a valid investment amount.' }, 400);
      }

      if (!wallet || wallet.exchange_balance < parsedAmount) {
        return sendJSON(res, { success: false, message: `Insufficient Exchange Wallet balance ($${wallet ? wallet.exchange_balance.toFixed(2) : '0.00'} available). Please deposit funds first.` }, 400);
      }

      const trancheTitle = tranche_name || (parsedAmount >= 50000 ? 'Prime Sovereign Whale Tranche' : parsedAmount >= 5000 ? 'Executive Multi-Asset Tranche' : 'Starter Institutional Tranche');
      const roiRate = parseFloat(weekly_roi || (parsedAmount >= 50000 ? 10.0 : parsedAmount >= 5000 ? 7.5 : 5.0));
      const duration = parseInt(duration_days || (parsedAmount >= 50000 ? 60 : 30), 10);

      const updatedWallet = await db.updateWallet(user.id, {
        exchange_balance: wallet.exchange_balance - parsedAmount,
        otc_investment_balance: (parseFloat(wallet.otc_investment_balance) || 0) + parsedAmount,
        total_invested: (parseFloat(wallet.total_invested) || 0) + parsedAmount
      });

      let plan = await db.getOtcPlanByUserId(user.id);
      if (!plan) {
        plan = await db.createOtcPlan({
          user_id: user.id,
          tranche_name: trancheTitle,
          amount: parsedAmount,
          weekly_roi_percent: roiRate,
          duration_days: duration,
          days_elapsed: 1,
          profit_accrued: 0,
          status: 'active'
        });
      } else {
        plan = await db.updateOtcPlan(plan.id, {
          amount: (parseFloat(plan.amount) || 0) + parsedAmount,
          tranche_name: trancheTitle,
          weekly_roi_percent: roiRate,
          status: 'active'
        });
      }

      const txRef = 'OTC-' + Math.floor(100000 + Math.random() * 900000);
      const txObj = await db.createTransaction({
        tx_ref: txRef,
        user_id: user.id,
        user_name: user.full_name,
        type: 'invest_otc',
        amount: parsedAmount,
        asset: trancheTitle,
        status: 'completed',
        destination_address: 'OTC Trading Vault (Segregated)',
        tx_hash: 'INTERNAL-OTC-ALLOCATION',
        notes: `${trancheTitle} Allocation (${roiRate}% / wk)`
      });

      const template = emailService.EmailTemplates.otcCapitalAllocated(user.full_name, parsedAmount, trancheTitle, roiRate, duration);
      dispatchEmailAsync({
        userId: user.id,
        to: user.email,
        templateResult: template,
        eventType: 'otc_allocated'
      });

      return sendJSON(res, {
        success: true,
        message: `Successfully allocated $${parsedAmount.toLocaleString()} to ${trancheTitle}.`,
        wallet: updatedWallet,
        plan,
        transaction: txObj
      });
    }

    // 10a. Admin: Login
    if (method === 'POST' && pathname === '/api/admin/login') {
      const body = await parseBody(req);
      const { email, password } = body;

      if (!email || !password) {
        return sendJSON(res, { success: false, message: 'Email and password are required.' }, 400);
      }

      const cleanEmail = (email || '').trim().toLowerCase();
      const user = await db.findUserByEmail(cleanEmail);

      if (!user || user.role !== 'admin') {
        return sendJSON(res, { success: false, message: 'Invalid credentials.' }, 401);
      }
      if (user.status === 'banned') {
        return sendJSON(res, { success: false, message: 'Account suspended.' }, 403);
      }
      if (!user.password_hash || user.password_hash !== password) {
        return sendJSON(res, { success: false, message: 'Invalid credentials.' }, 401);
      }

      const adminToken = createAdminSession(user);
      return sendJSON(res, {
        success: true,
        message: 'Admin authentication successful.',
        adminToken,
        tokenExpiresIn: ADMIN_SESSION_TTL_MS,
        expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
        user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
      });
    }

    // 10b. Admin: Logout
    if (method === 'POST' && pathname === '/api/admin/logout') {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      if (token) adminSessions.delete(token);
      return sendJSON(res, { success: true, message: 'Admin session terminated.' });
    }

    // 10c. Admin: Verify Token
    if (method === 'GET' && pathname === '/api/admin/verify-token') {
      const session = validateAdminToken(req);
      if (!session) {
        return sendJSON(res, { success: false, message: 'Session expired or invalid. Please log in again.' }, 401);
      }
      return sendJSON(res, {
        success: true,
        session: {
          email: session.email,
          full_name: session.full_name,
          expiresAt: session.expiresAt,
          remainingMs: session.expiresAt - Date.now()
        }
      });
    }

    // 10. Admin: Overview (PROTECTED)
    if (method === 'GET' && pathname === '/api/admin/overview') {
      const session = validateAdminToken(req);
      if (!session) {
        return sendJSON(res, { success: false, message: 'Unauthorized. Valid admin session required.' }, 401);
      }
      const [users, wallets, transactions, companyWallets, otcPlans, emailLogs] = await Promise.all([
        db.getAllUsers(),
        db.getAllWallets(),
        db.getAllTransactions(),
        db.getCompanyWallets(),
        db.getAllOtcPlans(),
        db.getEmailLogs()
      ]);
      return sendJSON(res, {
        success: true,
        users,
        wallets,
        transactions,
        companyWallets,
        otcPlans,
        emailLogs
      });
    }

    // ==========================================
    // ADMIN ROUTES PROTECTION GATE
    // ==========================================
    if (pathname.startsWith('/api/admin/')) {
      const session = validateAdminToken(req);
      if (!session) {
        return sendJSON(res, { success: false, message: 'Unauthorized. Valid admin session required. Please log in.' }, 401);
      }
    }

    // 11. Admin: Approve Deposit
    if (method === 'POST' && pathname === '/api/admin/approve-deposit') {
      const body = await parseBody(req);
      const { tx_ref } = body;
      const tx = await db.getTransactionByRef(tx_ref);
      if (!tx) return sendJSON(res, { success: false, message: 'Transaction not found.' }, 404);

      const updatedTx = await db.updateTransaction(tx_ref, { status: 'completed' });
      const user = await db.findUserById(tx.user_id);
      const wallet = await db.getWalletByUserId(tx.user_id);
      
      let updatedWallet = wallet;
      if (wallet) {
        updatedWallet = await db.updateWallet(tx.user_id, {
          exchange_balance: (parseFloat(wallet.exchange_balance) || 0) + parseFloat(tx.amount)
        });
      }

      if (user && updatedWallet) {
        const template = emailService.EmailTemplates.depositApproved(user.full_name, tx.amount, tx.asset, updatedWallet.exchange_balance);
        dispatchEmailAsync({
          userId: user.id,
          to: user.email,
          templateResult: template,
          eventType: 'deposit_approved'
        });
      }

      return sendJSON(res, { success: true, message: 'Deposit approved and funds credited to user.', transaction: updatedTx, wallet: updatedWallet });
    }

    // 12. Admin: Approve Withdrawal
    if (method === 'POST' && pathname === '/api/admin/approve-withdrawal') {
      const body = await parseBody(req);
      const { tx_ref, tx_hash } = body;
      const tx = await db.getTransactionByRef(tx_ref);
      if (!tx) return sendJSON(res, { success: false, message: 'Transaction not found.' }, 404);

      const updatedTx = await db.updateTransaction(tx_ref, {
        status: 'completed',
        tx_hash: tx_hash || tx.tx_hash
      });

      const user = await db.findUserById(tx.user_id);
      if (user) {
        const template = emailService.EmailTemplates.withdrawalApproved(user.full_name, tx.amount, tx.asset, tx.destination_address, updatedTx.tx_hash);
        dispatchEmailAsync({
          userId: user.id,
          to: user.email,
          templateResult: template,
          eventType: 'withdrawal_approved'
        });
      }

      return sendJSON(res, { success: true, message: 'Withdrawal marked as completed and paid.', transaction: updatedTx });
    }

    // 13. Admin: Send Custom Email / Broadcast
    if (method === 'POST' && pathname === '/api/admin/send-email') {
      const body = await parseBody(req);
      const { recipient_email, subject, message } = body;

      if (!recipient_email || !subject || !message) {
        return sendJSON(res, { success: false, message: 'Recipient, subject, and message are required.' }, 400);
      }

      let targetUsers = [];
      if (recipient_email === 'ALL_USERS') {
        targetUsers = await db.getAllUsers();
      } else {
        const u = await db.findUserByEmail(recipient_email);
        targetUsers = u ? [u] : [{ id: null, full_name: 'Investor', email: recipient_email }];
      }

      for (const target of targetUsers) {
        const template = emailService.EmailTemplates.customMessage(target.full_name, subject, message);
        dispatchEmailAsync({
          userId: target.id,
          to: target.email,
          templateResult: template,
          eventType: 'admin_broadcast'
        });
      }

      return sendJSON(res, { success: true, message: `Email dispatch queued for ${targetUsers.length} recipient(s).` });
    }

    // 14. Admin: Credit OTC Profit
    if (method === 'POST' && pathname === '/api/admin/credit-profit') {
      const body = await parseBody(req);
      const { user_id, profit_amount, note } = body;
      const userId = parseInt(user_id, 10);
      const user = await db.findUserById(userId);
      const wallet = await db.getWalletByUserId(userId);

      if (!user || !wallet) {
        return sendJSON(res, { success: false, message: 'User or wallet not found.' }, 404);
      }

      const parsedProfit = parseFloat(profit_amount || 0);
      if (parsedProfit <= 0) {
        return sendJSON(res, { success: false, message: 'Please specify a valid profit amount.' }, 400);
      }

      const updatedWallet = await db.updateWallet(userId, {
        accrued_profit: (parseFloat(wallet.accrued_profit) || 0) + parsedProfit,
        exchange_balance: (parseFloat(wallet.exchange_balance) || 0) + parsedProfit
      });

      const txRef = 'YLD-' + Math.floor(100000 + Math.random() * 900000);
      const txObj = await db.createTransaction({
        tx_ref: txRef,
        user_id: user.id,
        user_name: user.full_name,
        type: 'otc_profit',
        amount: parsedProfit,
        asset: 'OTC Yield Return',
        status: 'completed',
        destination_address: 'Exchange Wallet',
        tx_hash: 'YIELD-CYCLE-SETTLEMENT',
        notes: note || 'Institutional Weekly OTC Yield Settled'
      });

      const template = emailService.EmailTemplates.otcProfitCredited(user.full_name, parsedProfit, updatedWallet.accrued_profit);
      dispatchEmailAsync({
        userId: user.id,
        to: user.email,
        templateResult: template,
        eventType: 'otc_profit_credited'
      });

      return sendJSON(res, {
        success: true,
        message: `+$${parsedProfit.toLocaleString()} profit credited to ${user.full_name}.`,
        wallet: updatedWallet,
        transaction: txObj
      });
    }

    // 15. Admin: Update User Balance
    if (method === 'POST' && pathname === '/api/admin/update-balance') {
      const body = await parseBody(req);
      const { user_id, exchange_balance, otc_balance, accrued_profit } = body;
      const userId = parseInt(user_id, 10);
      
      const user = await db.findUserById(userId);
      if (!user) {
        return sendJSON(res, { success: false, message: 'User not found.' }, 404);
      }

      const walletUpdates = {};
      if (exchange_balance !== undefined && exchange_balance !== null && exchange_balance !== '') {
        walletUpdates.exchange_balance = parseFloat(exchange_balance) || 0.0;
      }
      if (otc_balance !== undefined && otc_balance !== null && otc_balance !== '') {
        walletUpdates.otc_investment_balance = parseFloat(otc_balance) || 0.0;
      }
      if (accrued_profit !== undefined && accrued_profit !== null && accrued_profit !== '') {
        walletUpdates.accrued_profit = parseFloat(accrued_profit) || 0.0;
      }

      const updatedWallet = await db.updateWallet(user.id, walletUpdates);

      return sendJSON(res, {
        success: true,
        message: `Balances updated for ${user.full_name}.`,
        wallet: updatedWallet,
        user: { id: user.id, full_name: user.full_name, email: user.email }
      });
    }

    // 16. Admin: Reject Deposit
    if (method === 'POST' && pathname === '/api/admin/reject-deposit') {
      const body = await parseBody(req);
      const { tx_ref, reason } = body;
      const tx = await db.getTransactionByRef(tx_ref);
      if (!tx) return sendJSON(res, { success: false, message: 'Transaction not found.' }, 404);

      const updatedTx = await db.updateTransaction(tx_ref, {
        status: 'rejected',
        notes: reason || 'Deposit declined by treasury desk.'
      });
      return sendJSON(res, { success: true, message: 'Deposit rejected.', transaction: updatedTx });
    }

    // 17. Admin: Reject Withdrawal
    if (method === 'POST' && pathname === '/api/admin/reject-withdrawal') {
      const body = await parseBody(req);
      const { tx_ref, reason } = body;
      const tx = await db.getTransactionByRef(tx_ref);
      if (!tx) return sendJSON(res, { success: false, message: 'Transaction not found.' }, 404);

      const updatedTx = await db.updateTransaction(tx_ref, {
        status: 'rejected',
        notes: reason || 'Withdrawal rejected by treasury desk.'
      });

      const wallet = await db.getWalletByUserId(tx.user_id);
      let updatedWallet = wallet;
      if (wallet) {
        updatedWallet = await db.updateWallet(tx.user_id, {
          exchange_balance: (parseFloat(wallet.exchange_balance) || 0) + parseFloat(tx.amount)
        });
      }

      return sendJSON(res, { success: true, message: 'Withdrawal rejected and funds returned to user Exchange Wallet.', transaction: updatedTx, wallet: updatedWallet });
    }

    // 18. Admin CRUD: Create Investor User
    if (method === 'POST' && pathname === '/api/admin/users/create') {
      const body = await parseBody(req);
      const { full_name, email, password, country, initial_exchange, initial_otc, kyc_status, account_number, role } = body;

      if (!full_name || !email) {
        return sendJSON(res, { success: false, message: 'Name and email are required.' }, 400);
      }

      const existing = await db.findUserByEmail(email);
      if (existing) {
        return sendJSON(res, { success: false, message: 'An account with this email already exists.' }, 400);
      }

      const accNum = account_number || 'VX-' + Math.floor(10000 + Math.random() * 90000);
      const refCode = 'REF-' + Math.floor(100000 + Math.random() * 900000);

      const newUser = await db.createUser({
        full_name,
        email: email.toLowerCase(),
        password_hash: password || 'default123',
        country: country || 'United States',
        account_number: accNum,
        role: role || 'user',
        status: 'active',
        is_verified: 1,
        referral_code: refCode,
        kyc_status: kyc_status || 'verified'
      });

      const initialEx = parseFloat(initial_exchange || 0);
      const initialOtc = parseFloat(initial_otc || 0);

      const newWallet = await db.createWallet({
        user_id: newUser.id,
        exchange_balance: initialEx,
        otc_investment_balance: initialOtc,
        accrued_profit: 0.0,
        total_invested: initialOtc
      });

      if (initialOtc > 0) {
        await db.createOtcPlan({
          user_id: newUser.id,
          tranche_name: initialOtc >= 50000 ? 'Prime Sovereign Whale Tranche' : initialOtc >= 5000 ? 'Executive Multi-Asset Tranche' : 'Starter Institutional Tranche',
          weekly_roi_percent: initialOtc >= 50000 ? 10.0 : initialOtc >= 5000 ? 7.5 : 5.0,
          duration_days: initialOtc >= 50000 ? 60 : 30,
          days_elapsed: 1,
          profit_accrued: 0,
          status: 'active'
        });
      }

      return sendJSON(res, { success: true, message: 'Investor account created successfully.', user: newUser, wallet: newWallet });
    }

    // 19. Admin CRUD: Update Investor User Details
    if (method === 'POST' && pathname === '/api/admin/users/update') {
      const body = await parseBody(req);
      const { user_id, full_name, email, country, kyc_status, status, role, password } = body;
      const userId = parseInt(user_id, 10);
      const user = await db.findUserById(userId);

      if (!user) return sendJSON(res, { success: false, message: 'User not found.' }, 404);

      const updates = {};
      if (full_name) updates.full_name = full_name;
      if (email) updates.email = email.toLowerCase();
      if (country) updates.country = country;
      if (kyc_status) updates.kyc_status = kyc_status;
      if (status) updates.status = status;
      if (role) updates.role = role;
      if (password) updates.password_hash = password;

      const updatedUser = await db.updateUser(user.id, updates);
      return sendJSON(res, { success: true, message: 'Investor profile updated.', user: updatedUser });
    }

    // 20. Admin CRUD: Delete Investor User
    if (method === 'POST' && pathname === '/api/admin/users/delete') {
      const body = await parseBody(req);
      const { user_id } = body;
      const userId = parseInt(user_id, 10);

      if (userId === 1) {
        return sendJSON(res, { success: false, message: 'Cannot delete master administrator.' }, 400);
      }

      await db.deleteUser(userId);
      return sendJSON(res, { success: true, message: 'Investor account and associated records deleted.' });
    }

    // 20b. Admin CRUD: Bulk Delete
    if (method === 'POST' && pathname === '/api/admin/users/bulk-delete') {
      const body = await parseBody(req);
      const { user_ids } = body;

      if (!Array.isArray(user_ids) || user_ids.length === 0) {
        return sendJSON(res, { success: false, message: 'No user IDs provided for bulk deletion.' }, 400);
      }

      const ids = user_ids.map(id => parseInt(id, 10)).filter(id => id !== 1 && !isNaN(id));

      for (const id of ids) {
        await db.deleteUser(id);
      }

      return sendJSON(res, {
        success: true,
        message: `${ids.length} account(s) permanently deleted.`,
        deleted: ids.length
      });
    }

    // 21. Admin CRUD: Manual Transaction Injection
    if (method === 'POST' && pathname === '/api/admin/transactions/create') {
      const body = await parseBody(req);
      const { user_id, type, amount, asset, status, notes } = body;
      const userId = parseInt(user_id, 10);
      const user = await db.findUserById(userId);

      if (!user) return sendJSON(res, { success: false, message: 'Target user not found.' }, 404);

      const parsedAmount = parseFloat(amount || 0);
      const txType = type || 'deposit';
      const txStatus = status || 'completed';

      const txRef = (txType.substring(0, 3).toUpperCase()) + '-' + Math.floor(100000 + Math.random() * 900000);
      const newTx = await db.createTransaction({
        tx_ref: txRef,
        user_id: user.id,
        user_name: user.full_name,
        type: txType,
        amount: parsedAmount,
        asset: asset || 'USD Adjustment',
        status: txStatus,
        destination_address: txType === 'withdrawal' ? 'External Wallet' : 'Exchange Wallet',
        tx_hash: 'ADMIN-ADJUSTMENT-' + Date.now(),
        notes: notes || 'Administrative Balance Adjustment'
      });

      const wallet = await db.getWalletByUserId(userId);
      let updatedWallet = wallet;
      if (txStatus === 'completed' && wallet) {
        if (txType === 'deposit' || txType === 'otc_profit') {
          updatedWallet = await db.updateWallet(userId, {
            exchange_balance: (parseFloat(wallet.exchange_balance) || 0) + parsedAmount
          });
        } else if (txType === 'withdrawal') {
          updatedWallet = await db.updateWallet(userId, {
            exchange_balance: Math.max(0, (parseFloat(wallet.exchange_balance) || 0) - parsedAmount)
          });
        }
      }

      return sendJSON(res, { success: true, message: 'Transaction record created.', transaction: newTx, wallet: updatedWallet });
    }

    // 22. Admin CRUD: Delete Transaction Record
    if (method === 'POST' && pathname === '/api/admin/transactions/delete') {
      const body = await parseBody(req);
      const { tx_ref } = body;
      await db.deleteTransaction(tx_ref);
      return sendJSON(res, { success: true, message: `Transaction #${tx_ref} deleted.` });
    }

    // 23. Admin CRUD: Manage OTC Contracts
    if (method === 'POST' && pathname === '/api/admin/otc-plans/create') {
      const body = await parseBody(req);
      const { user_id, tranche_name, amount, weekly_roi_percent, duration_days } = body;
      const userId = parseInt(user_id, 10);
      const user = await db.findUserById(userId);

      if (!user) return sendJSON(res, { success: false, message: 'User not found.' }, 404);

      const parsedAmount = parseFloat(amount || 0);
      const roi = parseFloat(weekly_roi_percent || 7.5);
      const duration = parseInt(duration_days || 30, 10);

      const plan = await db.createOtcPlan({
        user_id: user.id,
        tranche_name: tranche_name || 'Executive Multi-Asset Tranche',
        amount: parsedAmount,
        weekly_roi_percent: roi,
        duration_days: duration,
        days_elapsed: 1,
        profit_accrued: 0,
        status: 'active'
      });

      const wallet = await db.getWalletByUserId(userId);
      const updatedWallet = await db.updateWallet(userId, {
        otc_investment_balance: (parseFloat(wallet.otc_investment_balance) || 0) + parsedAmount,
        total_invested: (parseFloat(wallet.total_invested) || 0) + parsedAmount
      });

      return sendJSON(res, { success: true, message: 'OTC investment contract allocated.', plan, wallet: updatedWallet });
    }

    if (method === 'POST' && pathname === '/api/admin/otc-plans/update') {
      const body = await parseBody(req);
      const { plan_id, tranche_name, weekly_roi_percent, duration_days, days_elapsed, status } = body;
      const planId = parseInt(plan_id, 10);

      const updates = {};
      if (tranche_name) updates.tranche_name = tranche_name;
      if (weekly_roi_percent !== undefined) updates.weekly_roi_percent = parseFloat(weekly_roi_percent);
      if (duration_days !== undefined) updates.duration_days = parseInt(duration_days, 10);
      if (days_elapsed !== undefined) updates.days_elapsed = parseInt(days_elapsed, 10);
      if (status) updates.status = status;

      const updatedPlan = await db.updateOtcPlan(planId, updates);
      return sendJSON(res, { success: true, message: 'OTC contract updated.', plan: updatedPlan });
    }

    if (method === 'POST' && pathname === '/api/admin/otc-plans/terminate') {
      const body = await parseBody(req);
      const { plan_id } = body;
      const planId = parseInt(plan_id, 10);

      const updatedPlan = await db.updateOtcPlan(planId, { status: 'completed' });
      if (!updatedPlan) return sendJSON(res, { success: false, message: 'OTC contract not found.' }, 404);

      const wallet = await db.getWalletByUserId(updatedPlan.user_id);
      let updatedWallet = wallet;
      if (wallet) {
        updatedWallet = await db.updateWallet(updatedPlan.user_id, {
          exchange_balance: (parseFloat(wallet.exchange_balance) || 0) + parseFloat(updatedPlan.amount),
          otc_investment_balance: Math.max(0, (parseFloat(wallet.otc_investment_balance) || 0) - parseFloat(updatedPlan.amount))
        });
      }

      return sendJSON(res, { success: true, message: 'Contract settled and principal returned to Exchange Wallet.', plan: updatedPlan, wallet: updatedWallet });
    }

    if (method === 'POST' && pathname === '/api/admin/otc-plans/delete') {
      const body = await parseBody(req);
      const { plan_id } = body;
      const planId = parseInt(plan_id, 10);
      await db.deleteOtcPlan(planId);
      return sendJSON(res, { success: true, message: 'OTC plan deleted.' });
    }

    // 24. Admin CRUD: Manage Company Wallets
    if (method === 'POST' && pathname === '/api/admin/save-company-wallet') {
      const body = await parseBody(req);
      const { symbol, name, network, address, is_active } = body;

      const sym = (symbol || '').trim();
      if (!sym) {
        return sendJSON(res, { success: false, message: 'Asset Symbol is required.' }, 400);
      }

      const cw = await db.saveCompanyWallet({
        symbol: sym,
        name,
        network,
        address,
        is_active
      });

      const companyWallets = await db.getCompanyWallets();
      return sendJSON(res, { success: true, message: `Company deposit wallet for ${cw.name} saved successfully.`, companyWallet: cw, companyWallets });
    }

    if (method === 'POST' && pathname === '/api/admin/delete-company-wallet') {
      const body = await parseBody(req);
      const { symbol } = body;
      await db.deleteCompanyWallet(symbol);
      const companyWallets = await db.getCompanyWallets();
      return sendJSON(res, { success: true, message: `Custody wallet ${symbol} removed.`, companyWallets });
    }

    // 25. Admin: Clear Email Logs
    if (method === 'POST' && pathname === '/api/admin/email-logs/clear') {
      await db.clearEmailLogs();
      return sendJSON(res, { success: true, message: 'Email dispatch logs cleared.' });
    }
  } catch (apiError) {
    console.error(`[API Router Exception] ${method} ${pathname}:`, apiError);
    return sendJSON(res, { success: false, message: 'Server processing error: ' + apiError.message }, 500);
  }

  // ==========================================
  // STATIC ASSET SERVING (Hardened)
  // ==========================================
  let sanitizedPath = path.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(__dirname, sanitizedPath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const htmlPath = filePath + '.html';
      if (fs.existsSync(htmlPath) && htmlPath.startsWith(__dirname)) {
        filePath = htmlPath;
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const baseName = path.basename(filePath);
    if (baseName.startsWith('.') || baseName === 'package.json' || baseName === 'schema.sql' || baseName.endsWith('.db') || baseName.endsWith('.sqlite')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('403 Forbidden');
    }

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('500 Internal Server Error');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

// Create HTTP server instance
const server = http.createServer(requestHandler);

// Start Server with complete CloudLinux / cPanel Passenger & Local Port support
// On Vercel serverless environment, VERCEL is defined so we don't call server.listen()
if (!process.env.VERCEL) {
  const rawPort = process.env.PORT;

  if (rawPort && isNaN(Number(rawPort))) {
    // Binds directly to Passenger socket on cPanel
    server.listen(rawPort, () => {
      console.log(`====================================================`);
      console.log(`🚀 VertexCapitals Platform Server is active via Passenger (${rawPort})!`);
      console.log(`====================================================`);
    });
  } else {
    let port = parseInt(rawPort || '3000', 10);
    if (isNaN(port) || port <= 0) port = 3000;

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        port++;
        console.warn(`[VertexCapitals Server] Port in use, trying next port ${port}...`);
        setTimeout(() => server.listen(port), 100);
      } else {
        console.error('[VertexCapitals Server Error]', err);
      }
    });

    server.listen(port, () => {
      console.log(`====================================================`);
      console.log(`🚀 VertexCapitals Platform Server is active!`);
      console.log(`🌐 Local URL: http://localhost:${port}`);
      console.log(`💳 User Dashboard: http://localhost:${port}/dashboard.html`);
      console.log(`🛡️ Admin Portal: http://localhost:${port}/admin.html`);
      console.log(`✉️ Email Service Engine: Ready with HTML Templates & SMTP Support`);
      console.log(`====================================================`);
    });
  }
}

// Export for Passenger, standalone node, and Vercel Serverless Function
module.exports = requestHandler;
module.exports.server = server;

// Initialize DB in background (non-blocking)
db.initDB().catch(err => {
  console.warn('[DB Background Startup Note]', err.message);
});
