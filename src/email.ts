import dotenv from 'dotenv';
dotenv.config();

import nodemailer, { type Transporter } from 'nodemailer';
import dns from 'node:dns';
import type { TastingRequest, SavedMealItem, Order } from './types.js';

// Ensure IPv4 first on Node environments to prevent DNS lookup timeouts
try {
  dns.setDefaultResultOrder?.('ipv4first');
} catch {
  // Ignore if unsupported
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@magreattaste.ng';
const SMTP_HOST = process.env.SMTP_HOST || process.env.MAIL_HOST || 'live.smtp.mailtrap.io';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || '587', 10);
const RAW_USER = process.env.SMTP_USER || process.env.MAIL_USERNAME || '';
// In Mailtrap Live SMTP, if user enters apismtp@mailtrap.io, the SMTP auth user is 'api'
const SMTP_USER = (SMTP_HOST.includes('mailtrap') && RAW_USER === 'apismtp@mailtrap.io') ? 'api' : RAW_USER;
const SMTP_PASS = process.env.SMTP_PASS || process.env.MAIL_PASSWORD || '';
const SENDER_NAME = process.env.MAIL_SENDER_NAME || 'Margaret O.';
const SENDER_EMAIL = process.env.MAIL_FROM || process.env.SMTP_FROM || `"${SENDER_NAME}" <${ADMIN_EMAIL}>`;

let transporter: Transporter | null = null;
let activePort = (SMTP_HOST.includes('mailtrap') && SMTP_PORT === 587) ? 2525 : SMTP_PORT;

function createMailer(port: number): Transporter {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: port,
    secure: port === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    tls: {
      rejectUnauthorized: false
    }
  });
}

function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  if (!SMTP_USER || !SMTP_PASS) {
    return null;
  }
  try {
    transporter = createMailer(activePort);
    return transporter;
  } catch (err) {
    console.error('[EMAIL SERVICE] Failed to initialize nodemailer transporter:', err);
    return null;
  }
}

// Verification cache to avoid excessive roundtrips on every page refresh
let lastVerifyResult: { success: boolean; message: string; host: string; port: number; user: string; timestamp: number } | null = null;

/**
 * Verify SMTP credentials and return live status with automatic port 2525 fallback
 */
export async function testSmtpConnection(forceFresh = false): Promise<{ success: boolean; message: string; host: string; port: number; user: string }> {
  const now = Date.now();
  if (!forceFresh && lastVerifyResult && (now - lastVerifyResult.timestamp < 60000)) {
    return {
      success: lastVerifyResult.success,
      message: lastVerifyResult.message,
      host: lastVerifyResult.host,
      port: lastVerifyResult.port,
      user: lastVerifyResult.user
    };
  }

  if (!SMTP_USER || !SMTP_PASS) {
    return {
      success: false,
      message: 'SMTP credentials are not configured in environment variables.',
      host: SMTP_HOST,
      port: activePort,
      user: SMTP_USER
    };
  }

  // 1. Try configured port (e.g. 587)
  try {
    const primaryMailer = createMailer(activePort);
    await primaryMailer.verify();
    transporter = primaryMailer;
    lastVerifyResult = {
      success: true,
      message: `Connected successfully to ${SMTP_HOST}:${activePort}`,
      host: SMTP_HOST,
      port: activePort,
      user: SMTP_USER,
      timestamp: now
    };
    return lastVerifyResult;
  } catch (err: any) {
    console.warn(`[SMTP VERIFY] Port ${activePort} connection failed (${err.message}). Trying Mailtrap cloud port 2525...`);
    
    // 2. If port 587 timed out or failed, try Mailtrap's unblocked cloud port 2525
    if (activePort !== 2525) {
      try {
        const fallbackMailer = createMailer(2525);
        await fallbackMailer.verify();
        activePort = 2525;
        transporter = fallbackMailer;
        lastVerifyResult = {
          success: true,
          message: `Connected successfully to ${SMTP_HOST}:2525 (Bypass Port)`,
          host: SMTP_HOST,
          port: 2525,
          user: SMTP_USER,
          timestamp: now
        };
        console.log('[SMTP VERIFY] Successfully connected via Mailtrap cloud port 2525!');
        return lastVerifyResult;
      } catch (fallbackErr: any) {
        console.error('[SMTP VERIFY] Both 587 and 2525 failed:', fallbackErr.message);
      }
    }

    lastVerifyResult = {
      success: false,
      message: err.message || 'Failed to authenticate with SMTP server',
      host: SMTP_HOST,
      port: activePort,
      user: SMTP_USER,
      timestamp: now
    };
    return lastVerifyResult;
  }
}

/**
 * Sends a notification email to hello@magreattaste.ng when a new subscriber joins
 */
export async function sendNewsletterNotification(subscriberEmail: string): Promise<boolean> {
  const mailer = getTransporter();
  const timestamp = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });

  if (!mailer) {
    console.log(`[EMAIL DISPATCH - RECORDED] New subscriber: "${subscriberEmail}". Delivery target: ${ADMIN_EMAIL} at ${timestamp}. (Configure SMTP_USER & SMTP_PASS in .env for live external SMTP transport)`);
    return false;
  }

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: ADMIN_EMAIL,
      subject: `📬 New Newsletter Subscriber: ${subscriberEmail}`,
      html: `
        <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <div style="background: linear-gradient(135deg, #182838 0%, #244661 100%); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px; color: #fed485;">MA' GREAT TASTE</h1>
            <p style="margin: 6px 0 0; font-size: 13px; color: #cbd5e1;">New Website Newsletter Subscriber</p>
          </div>
          <div style="padding: 28px 24px;">
            <p style="font-size: 15px; color: #1e293b; margin-top: 0;">Hello Chef &amp; Admin Team,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
              A new customer just entered their email to subscribe to <strong>Ma'Great Taste</strong> seasonal menus, chef updates, and early access offers.
            </p>
            <div style="background: #f8fafc; border-left: 4px solid #c6381e; padding: 16px; margin: 20px 0; border-radius: 6px;">
              <p style="margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 700;">Subscriber Email</p>
              <a href="mailto:${subscriberEmail}" style="font-size: 17px; font-weight: 700; color: #c6381e; text-decoration: none;">${subscriberEmail}</a>
              <p style="margin: 8px 0 0; font-size: 12px; color: #94a3b8;">Subscribed at: ${timestamp}</p>
            </div>
            <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
              This record has also been delivered to your <strong>Admin Dashboard &rarr; Messages</strong> inbox and saved in your customer database.
            </p>
          </div>
          <div style="background: #f1f5f9; padding: 14px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
            Ma'Great Taste Restaurant &amp; Catering Platform &bull; Lagos, Nigeria
          </div>
        </div>
      `
    });
    console.log(`[EMAIL DISPATCH - SUCCESS] Sent subscriber notification to ${ADMIN_EMAIL} for ${subscriberEmail}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL DISPATCH - ERROR] Failed to send email to ${ADMIN_EMAIL}:`, err);
    return false;
  }
}

/**
 * Sends an invitation email to a newly created admin with their temporary password.
 * @param admin { name, email, role, invitedBy }
 * @param plainPassword The password generated for the admin (in clear text).
 */
export async function sendAdminInviteEmail(admin: { name: string; email: string; role: string; invitedBy?: string }, plainPassword: string): Promise<boolean> {
  const mailer = getTransporter();
  const timestamp = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });
  if (!mailer) {
    console.log(`[EMAIL DISPATCH - RECORDED] Invite for admin ${admin.email} (role: ${admin.role}) by ${admin.invitedBy || 'system'} at ${timestamp}. (Configure SMTP for live transport)`);
    return false;
  }
  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: admin.email,
      subject: `🔑 You have been invited as ${admin.role === 'super_admin' ? 'Super Admin' : 'Admin Staff'} to Ma'Great Taste`,
      html: `
        <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <div style="background: linear-gradient(135deg, #182838 0%, #244661 100%); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px; color: #fed485;">Welcome to Ma'Great Taste</h1>
            <p style="margin: 6px 0 0; font-size: 13px; color: #cbd5e1;">Your admin account is ready</p>
          </div>
          <div style="padding: 28px 24px;">
            <p style="font-size: 15px; color: #1e293b; margin-top: 0;">Hello ${admin.name},</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
              You have been invited by ${admin.invitedBy || 'Chef Margaret'} to join the admin team as a <strong>${admin.role === 'super_admin' ? 'Super Admin' : 'Admin Staff'}</strong>.
            </p>
            <div style="background: #f8fafc; border-left: 4px solid #1d4ed8; padding: 16px; margin: 20px 0; border-radius: 6px;">
              <p style="margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 700;">Login Details</p>
              <p style="margin: 0; font-size: 16px; color: #1d4ed8;">Email: <strong>${admin.email}</strong></p>
              <p style="margin: 4px 0 0; font-size: 16px; color: #1d4ed8;">Temporary Password: <strong>${plainPassword}</strong></p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #94a3b8;">Please change your password after first login.</p>
            </div>
            <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
              Access the admin portal at <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/login" style="color:#1d4ed8; text-decoration:none;">${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/login</a>.
            </p>
          </div>
          <div style="background: #f1f5f9; padding: 14px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
            Ma'Great Taste Restaurant &amp; Catering Platform • Lagos, Nigeria
          </div>
        </div>
      `
    });
    console.log(`[EMAIL DISPATCH - SUCCESS] Invitation sent to ${admin.email}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL DISPATCH - ERROR] Failed to send admin invite to ${admin.email}:`, err);
    return false;
  }
}

/**
 * Sends a password reset email to an admin.
 * @param email Admin's email address.
 * @param token Secure reset token (included in link).
 */
export async function sendAdminPasswordResetEmail(email: string, token: string): Promise<boolean> {
  const mailer = getTransporter();
  const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  const timestamp = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });
  if (!mailer) {
    console.log(`[EMAIL DISPATCH - RECORDED] Password reset for ${email} at ${timestamp}. Link: ${resetLink}`);
    return false;
  }
  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: email,
      subject: '🔐 Password Reset Request for Ma\'Great Taste Admin',
      html: `
        <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <div style="background: linear-gradient(135deg, #182838 0%, #244661 100%); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px; color: #fed485;">Password Reset Request</h1>
            <p style="margin: 6px 0 0; font-size: 13px; color: #cbd5e1;">Ma'Great Taste Admin Portal</p>
          </div>
          <div style="padding: 28px 24px;">
            <p style="font-size: 15px; color: #1e293b; margin-top: 0;">Hello,</p>
            <p style="font-size: 14px; color: #475569; line-height: 1.6;">
              We received a request to reset the password for your admin account. Click the button below to set a new password. This link will expire in 1 hour.
            </p>
            <a href="${resetLink}" style="display:inline-block; margin:20px 0; padding:12px 24px; background:#1d4ed8; color:#ffffff; text-decoration:none; border-radius:6px; font-weight:600;">Reset Password</a>
            <p style="font-size: 12px; color:#64748b; margin-top:16px;">If you did not request this, you can safely ignore this email.</p>
          </div>
          <div style="background: #f1f5f9; padding: 14px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
            Ma'Great Taste Restaurant &amp; Catering Platform • Lagos, Nigeria
          </div>
        </div>
      `
    });
    console.log(`[EMAIL DISPATCH - SUCCESS] Password reset email sent to ${email}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL DISPATCH - ERROR] Failed to send password reset to ${email}:`, err);
    return false;
  }
}


/**
 * Sends a notification email to hello@magreattaste.ng when a customer sends an inquiry/message
 */
export async function sendContactMessageNotification(data: {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  body: string;
}): Promise<boolean> {
  const mailer = getTransporter();
  const timestamp = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });

  if (!mailer) {
    console.log(`[EMAIL DISPATCH - RECORDED] Message from ${data.name} (${data.email}). Delivery target: ${ADMIN_EMAIL} at ${timestamp}. (Configure SMTP_USER & SMTP_PASS in .env for live external SMTP transport)`);
    return false;
  }

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: ADMIN_EMAIL,
      replyTo: data.email,
      subject: `💬 New Enquiry: ${data.subject || 'Website Inquiry'} (from ${data.name})`,
      html: `
        <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <div style="background: linear-gradient(135deg, #182838 0%, #244661 100%); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.5px; color: #fed485;">MA' GREAT TASTE</h1>
            <p style="margin: 6px 0 0; font-size: 13px; color: #cbd5e1;">New Customer Message / Contact Form</p>
          </div>
          <div style="padding: 28px 24px;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr>
                <td style="padding: 6px 0; font-size: 13px; color: #64748b; width: 90px; font-weight: 600;">Customer:</td>
                <td style="padding: 6px 0; font-size: 14px; color: #1e293b; font-weight: 700;">${data.name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Email:</td>
                <td style="padding: 6px 0; font-size: 14px;"><a href="mailto:${data.email}" style="color: #c6381e; text-decoration: none; font-weight: 600;">${data.email}</a></td>
              </tr>
              ${data.phone ? `
              <tr>
                <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Phone:</td>
                <td style="padding: 6px 0; font-size: 14px; color: #1e293b;"><a href="tel:${data.phone}" style="color: #1e293b; text-decoration: none;">${data.phone}</a></td>
              </tr>` : ''}
              <tr>
                <td style="padding: 6px 0; font-size: 13px; color: #64748b; font-weight: 600;">Subject:</td>
                <td style="padding: 6px 0; font-size: 14px; color: #1e293b; font-weight: 600;">${data.subject || 'Website Inquiry'}</td>
              </tr>
            </table>

            <div style="background: #f8fafc; border-left: 4px solid #182838; padding: 16px; margin: 16px 0; border-radius: 6px;">
              <p style="margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; font-weight: 700;">Message</p>
              <p style="margin: 0; font-size: 14px; color: #334155; line-height: 1.6; white-space: pre-wrap;">${data.body}</p>
            </div>

            <div style="margin-top: 24px; text-align: center;">
              <a href="mailto:${data.email}?subject=Re:%20${encodeURIComponent(data.subject || 'Your Inquiry with Ma\'Great Taste')}" style="display: inline-block; background: #c6381e; color: #ffffff; text-decoration: none; padding: 11px 22px; border-radius: 6px; font-size: 13px; font-weight: 700;">
                Reply Directly to Customer
              </a>
            </div>
          </div>
          <div style="background: #f1f5f9; padding: 14px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
            Ma'Great Taste &bull; Good food for every occasion &bull; ${timestamp}
          </div>
        </div>
      `
    });
    console.log(`[EMAIL DISPATCH - SUCCESS] Sent customer message notification to ${ADMIN_EMAIL} from ${data.email}`);
    return true;
  } catch (err) {
    console.error(`[EMAIL DISPATCH - ERROR] Failed to send contact message email to ${ADMIN_EMAIL}:`, err);
    return false;
  }
}

/**
 * Automatically sends a confirmation email to the customer after submitting the contact form
 */
export async function sendContactConfirmationEmailToCustomer(data: {
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  body: string;
}): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) {
    console.log(`[CUSTOMER CONFIRMATION EMAIL - RECORDED] Confirmation for ${data.name} (${data.email}).`);
    return false;
  }

  const emailSubject = `We have received your message — Ma'Great Taste (${data.subject || 'Inquiry'})`;
  const whatsappUrl = `https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Chef Margaret, I just submitted an inquiry regarding "${data.subject || 'General Inquiry'}" from your website.`)}`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>We Received Your Message</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px 12px; color: #1e293b; -webkit-font-smoothing: antialiased;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 28px rgba(24,40,56,0.07);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #101a24 100%); padding: 32px 24px; text-align: center; border-bottom: 3px solid #d99c2b;">
          <img src="${BRAND_LOGO_URL}" alt="Ma'Great Taste" width="80" height="80" style="display: block; margin: 0 auto 12px auto; border-radius: 50%; border: 3px solid #d99c2b; box-shadow: 0 4px 14px rgba(0,0,0,0.35); object-fit: cover;" />
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: 1.2px; text-transform: uppercase;">MA’ GREAT TASTE</h1>
          <p style="margin: 5px 0 0; font-size: 11px; color: #d99c2b; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Events &bull; Catering &bull; Everyday Meals</p>
          <div style="margin-top: 12px;">
            <span style="display: inline-block; background: rgba(217, 156, 43, 0.16); color: #fed485; border: 1px solid rgba(217, 156, 43, 0.45); border-radius: 20px; padding: 4px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">MESSAGE RECEIVED</span>
          </div>
        </div>

        <!-- Body -->
        <div style="padding: 32px 26px;">
          <h2 style="font-size: 20px; color: #182838; margin: 0 0 12px; font-weight: 700;">
            Hello ${data.name || 'Valued Guest'}, 👋
          </h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.65; margin: 0 0 20px;">
            Thank you for reaching out to <strong>Ma'Great Taste</strong>. We have received your message regarding <strong>${data.subject || 'General Inquiry'}</strong>. Our kitchen operations and guest concierge team is reviewing your message and will get back to you within 30 minutes during service hours.
          </p>

          <!-- Inquiry Copy Box -->
          <div style="background: #fdfbf7; border: 1px solid #f2e8d9; border-radius: 10px; padding: 18px 20px; margin-bottom: 22px;">
            <div style="font-size: 11px; font-weight: 700; color: #8c5b1b; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 8px;">
              Copy of Your Submitted Message
            </div>
            <p style="font-size: 13px; color: #334155; line-height: 1.6; margin: 0; white-space: pre-wrap;">${data.body}</p>
          </div>

          <!-- Quick Connect & WhatsApp -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin-bottom: 24px;">
            <p style="font-size: 13px; color: #1e293b; margin: 0 0 6px; font-weight: 600;">
              Need urgent assistance or real-time order modifications?
            </p>
            <p style="font-size: 12px; color: #64748b; margin: 0;">
              Call our Central Kitchen Hotline at <strong>09058271973</strong> or message Chef Margaret directly on WhatsApp.
            </p>
          </div>

          <div style="text-align: center; margin-top: 20px;">
            <a href="${whatsappUrl}" target="_blank" style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 11px 26px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37,211,102,0.3);">
              Chat on WhatsApp Now &rarr;
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            <strong style="color: #182838;">Ma'Great Taste</strong> &bull; 14 Admiralty Way, Lekki Phase 1, Lagos &bull; +234 905 827 1973
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: data.email,
      subject: emailSubject,
      html
    });
    console.log(`[CUSTOMER CONFIRMATION EMAIL - SUCCESS] Sent to ${data.email}`);
    return true;
  } catch (err) {
    console.error(`[CUSTOMER CONFIRMATION EMAIL - ERROR] Failed to send to ${data.email}:`, err);
    return false;
  }
}

export interface BroadcastOptions {
  subject: string;
  title: string;
  content: string;
  buttonText?: string;
  buttonUrl?: string;
  recipients: string[];
}

/**
 * Dispatches a formatted branded newsletter campaign to a list of subscribers
 */
export async function sendBroadcastNewsletter(options: BroadcastOptions): Promise<{
  success: boolean;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  errors: string[];
}> {
  const mailer = getTransporter();
  const { subject, title, content, buttonText, buttonUrl, recipients } = options;

  if (!mailer) {
    throw new Error('SMTP transporter is not configured. Please set SMTP credentials in .env.');
  }

  if (!recipients || recipients.length === 0) {
    return { success: true, totalRecipients: 0, sentCount: 0, failedCount: 0, errors: [] };
  }

  // Format multi-line paragraphs into nice HTML paragraphs
  const formattedHtmlContent = content
    .split(/\n{2,}/)
    .map(p => `<p style="margin: 0 0 16px; font-size: 15px; color: #334155; line-height: 1.7;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');

  const ctaButtonHtml = buttonText && buttonUrl ? `
    <div style="margin: 28px 0 20px; text-align: center;">
      <a href="${buttonUrl}" style="display: inline-block; background: #c6381e; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 700; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(198, 56, 30, 0.25);">
        ${buttonText}
      </a>
    </div>
  ` : '';

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subject}</title>
    </head>
    <body style="margin: 0; padding: 24px 10px; background-color: #f1f5f9; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #244661 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 1px; color: #fed485; text-transform: uppercase;">MA' GREAT TASTE</h1>
          <p style="margin: 8px 0 0; font-size: 13px; color: #cbd5e1; letter-spacing: 0.5px;">Authentic Nigerian &amp; Intercontinental Cuisine &bull; Catering &bull; Meal Plans</p>
        </div>

        <!-- Hero Headline -->
        <div style="background: #fff8f0; border-bottom: 2px solid #fed485; padding: 20px 28px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700; color: #182838; line-height: 1.4;">${title}</h2>
        </div>

        <!-- Body Content -->
        <div style="padding: 28px 28px 20px;">
          ${formattedHtmlContent}
          ${ctaButtonHtml}
        </div>

        <!-- Highlights Bar -->
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 18px 24px; text-align: center;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="text-align: center; font-size: 12px; color: #64748b; font-weight: 600;">
                🍲 Freshly Cooked Daily
              </td>
              <td style="text-align: center; font-size: 12px; color: #64748b; font-weight: 600;">
                ⚡ Fast Delivery Across Lagos
              </td>
              <td style="text-align: center; font-size: 12px; color: #64748b; font-weight: 600;">
                🎉 Custom Catering
              </td>
            </tr>
          </table>
        </div>

        <!-- Footer -->
        <div style="background: #182838; padding: 26px 24px; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.6;">
          <p style="margin: 0 0 6px; font-weight: 700; color: #fed485; font-size: 13px;">Ma'Great Taste Restaurant &amp; Catering Platform</p>
          <p style="margin: 0 0 12px; color: #cbd5e1;">Lagos, Nigeria &bull; Questions or orders? Reply to this email or visit our website.</p>
          <p style="margin: 0; font-size: 11px; color: #64748b;">
            You received this newsletter because you subscribed at magreattaste.ng.
          </p>
        </div>

      </div>
    </body>
    </html>
  `;

  let sentCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    try {
      await mailer.sendMail({
        from: SENDER_EMAIL,
        to: recipient,
        subject,
        html: htmlTemplate
      });
      sentCount++;
      console.log(`[NEWSLETTER DISPATCH] Sent to ${recipient}`);
    } catch (err: any) {
      failedCount++;
      const errMsg = `Failed to deliver to ${recipient}: ${err.message}`;
      console.error(`[NEWSLETTER DISPATCH ERROR]`, errMsg);
      errors.push(errMsg);
    }
  }

  return {
    success: sentCount > 0 || recipients.length === 0,
    totalRecipients: recipients.length,
    sentCount,
    failedCount,
    errors
  };
}

const BRAND_LOGO_URL = 'https://res.cloudinary.com/p2pa6dfi/image/upload/f_auto,q_auto,w_240/v1792616012/magreat_brand/logo.jpg';
const BACKEND_URL = (process.env.BACKEND_URL || 'https://magreat-backend.onrender.com').replace(/\/+$/, '');

/**
 * Dispatch instant Thank You Email with consultation details card to customer
 */
export async function sendCateringConsultationThankYouEmail(lead: {
  id?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  eventType?: string;
  eventDate?: string;
  guestCount?: number;
  location?: string;
  budget?: string;
  notes?: string;
  dietaryRequirements?: string;
}): Promise<{ success: boolean; message: string }> {
  const mailer = getTransporter();
  if (!mailer) {
    return { success: false, message: 'SMTP mailer is not configured.' };
  }

  const subject = `Thank You for Your Catering Consultation — Ma'Great Taste (${lead.eventType || 'Event Catering'})`;
  const eventName = lead.eventType || 'Catering Consultation';
  const whatsappUrl = `https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Chef Margaret, I submitted a consultation for my ${eventName} on ${lead.eventDate || 'my chosen date'} and would love to connect!`)}`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Thank You for Your Catering Consultation</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px 12px; color: #1e293b; -webkit-font-smoothing: antialiased;">
      <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 28px rgba(24,40,56,0.07);">
        
        <!-- Luxury Brand Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #101a24 100%); padding: 34px 24px; text-align: center; border-bottom: 3px solid #d99c2b;">
          <img src="${BRAND_LOGO_URL}" alt="Ma'Great Taste" width="80" height="80" style="display: block; margin: 0 auto 12px auto; border-radius: 50%; border: 3px solid #d99c2b; box-shadow: 0 4px 14px rgba(0,0,0,0.35); object-fit: cover;" />
          <h1 style="margin: 0; font-size: 23px; font-weight: 800; color: #ffffff; letter-spacing: 1.2px; text-transform: uppercase;">MA’ GREAT TASTE</h1>
          <p style="margin: 5px 0 0; font-size: 11px; color: #d99c2b; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Events &bull; Catering &bull; Everyday Meals</p>
          <div style="margin-top: 14px;">
            <span style="display: inline-block; background: rgba(217, 156, 43, 0.16); color: #fed485; border: 1px solid rgba(217, 156, 43, 0.45); border-radius: 20px; padding: 4px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">CONSULTATION RECEIVED</span>
          </div>
        </div>

        <!-- Main Body -->
        <div style="padding: 32px 28px;">
          <h2 style="font-size: 21px; color: #182838; margin: 0 0 12px; font-weight: 700;">
            Thank You, ${lead.customerName || 'Valued Client'}! 🎉
          </h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.65; margin: 0 0 22px;">
            We have received your event catering consultation request. Executive Chef Margaret and our culinary banquet team are delighted at the opportunity to cater for your upcoming <strong>${eventName}</strong>.
          </p>

          <!-- Fine Card: Consultation Details -->
          <div style="background: #fbfbf9; border: 1.5px solid #e5e9ee; border-radius: 14px; padding: 22px 20px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f0e6d6; padding-bottom: 12px; margin-bottom: 16px;">
              <strong style="font-size: 13px; color: #182838; text-transform: uppercase; letter-spacing: 1px;">📋 Event Specifications</strong>
              ${lead.id ? `<span style="font-size: 11px; font-weight: 700; color: #c6381e; background: #fdf2f0; padding: 3px 8px; border-radius: 6px;">Ref: ${lead.id}</span>` : ''}
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600; width: 40%;">Event Category:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${eventName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Expected Date:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${lead.eventDate || 'To be confirmed'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Guest Count:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${lead.guestCount || 'Flexible'} guests</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Venue / City:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${lead.location || 'Lagos, Nigeria'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Target Budget:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #166534; text-align: right;">${lead.budget ? (lead.budget.startsWith('₦') ? lead.budget : `₦${lead.budget}`) : 'To be discussed'}</td>
              </tr>
              ${lead.dietaryRequirements ? `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Dietary Preferences:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #d97706; text-align: right;">${lead.dietaryRequirements}</td>
              </tr>
              ` : ''}
              ${lead.notes ? `
              <tr>
                <td style="padding: 9px 0; color: #64748b; font-weight: 600; vertical-align: top;">Special Notes:</td>
                <td style="padding: 9px 0; color: #334155; text-align: right; font-style: italic;">"${lead.notes}"</td>
              </tr>
              ` : ''}
            </table>
          </div>

          <!-- What Happens Next Reassurance Banner -->
          <div style="background: #fffbeb; border-left: 4px solid #d99c2b; padding: 16px 18px; border-radius: 8px; margin-bottom: 26px;">
            <strong style="display: block; font-size: 13px; color: #92400e; margin-bottom: 6px;">⏱ What Happens Next:</strong>
            <p style="margin: 0; font-size: 12.5px; color: #78350f; line-height: 1.6;">
              Our catering team is reviewing our kitchen capacity for your event date. You will receive an official bespoke quotation with a curated menu proposal within <b>2 to 4 hours</b>.
            </p>
          </div>

          <!-- WhatsApp Chat Button -->
          <div style="text-align: center; margin: 26px 0 10px;">
            <a href="${whatsappUrl}"
               style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 28px; box-shadow: 0 4px 12px rgba(37,211,102,0.32);">
              💬 Chat Directly with Chef Margaret on WhatsApp
            </a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 18px 0 0;">
            Need to update your guest count or date? Simply reply directly to this email.
          </p>
        </div>

        <!-- Fine Footer: Contact Details -->
        <div style="background: #182838; padding: 26px 20px; text-align: center; font-size: 12px; color: #cbd5e1; border-top: 1px solid #283a4c;">
          <p style="margin: 0 0 6px; font-weight: 800; font-size: 13px; color: #fed485; letter-spacing: 0.5px;">
            MA'GREAT TASTE RESTAURANT &amp; LUXURY EVENTS
          </p>
          <p style="margin: 0 0 6px; color: #e2e8f0;">
            📞 <b>Hotlines:</b> +234 905 827 1973 &bull; +234 805 330 8425
          </p>
          <p style="margin: 0 0 6px; color: #e2e8f0;">
            ✉️ <b>Email:</b> <a href="mailto:hello@magreattaste.ng" style="color: #fed485; text-decoration: none;">hello@magreattaste.ng</a>
          </p>
          <p style="margin: 0 0 8px; color: #94a3b8;">
            📍 Lekki Phase 1, Lagos, Nigeria &bull; Mon - Sun (8:00 AM - 10:00 PM)
          </p>
          <p style="margin: 0; font-size: 11px; color: #64748b;">
            Official Website: <a href="https://magreattaste.ng" style="color: #fed485; text-decoration: none;">magreattaste.ng</a> &bull; Good food, thoughtfully delivered.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: lead.customerEmail,
      bcc: ADMIN_EMAIL,
      subject,
      html
    });
    console.log(`[CATERING THANK YOU EMAIL] Successfully dispatched to ${lead.customerEmail}`);
    return { success: true, message: `Consultation thank you email sent to ${lead.customerEmail}!` };
  } catch (err: any) {
    console.error(`[CATERING THANK YOU EMAIL ERROR]`, err);
    return { success: false, message: `Failed to deliver thank you email: ${err.message}` };
  }
}

/**
 * Dispatch official Catering Quotation Email to customer in a fine branded card
 */
export async function sendCateringQuotationEmail(lead: {
  id?: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  eventType?: string;
  eventDate?: string;
  guestCount?: number;
  location?: string;
  notes?: string;
  dietaryRequirements?: string;
}, quoteAmount: number, menuNotes: string): Promise<{ success: boolean; message: string }> {
  const mailer = getTransporter();
  if (!mailer) {
    return { success: false, message: 'SMTP mailer is not configured.' };
  }

  const formattedQuote = `₦${Number(quoteAmount).toLocaleString()}`;
  const subject = `Official Catering Quotation: ${formattedQuote} — Ma'Great Taste Restaurant`;
  const confirmUrl = `${BACKEND_URL}/api/catering/${lead.id}/confirm`;
  const whatsappUrl = `https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Chef Margaret, I have received the official quotation (${formattedQuote}) for my ${lead.eventType || 'event'} on ${lead.eventDate || 'my chosen date'} and would love to confirm!`)}`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Official Catering Quotation</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px 12px; color: #1e293b; -webkit-font-smoothing: antialiased;">
      <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 28px rgba(24,40,56,0.07);">
        
        <!-- Luxury Brand Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #101a24 100%); padding: 34px 24px; text-align: center; border-bottom: 3px solid #d99c2b;">
          <img src="${BRAND_LOGO_URL}" alt="Ma'Great Taste" width="80" height="80" style="display: block; margin: 0 auto 12px auto; border-radius: 50%; border: 3px solid #d99c2b; box-shadow: 0 4px 14px rgba(0,0,0,0.35); object-fit: cover;" />
          <h1 style="margin: 0; font-size: 23px; font-weight: 800; color: #ffffff; letter-spacing: 1.2px; text-transform: uppercase;">MA’ GREAT TASTE</h1>
          <p style="margin: 5px 0 0; font-size: 11px; color: #d99c2b; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Official Catering &bull; Event Banquet Proposal</p>
          <div style="margin-top: 14px;">
            <span style="display: inline-block; background: rgba(198,56,30,0.18); color: #fca5a5; border: 1px solid rgba(198,56,30,0.4); border-radius: 20px; padding: 4px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">BESPOKE QUOTATION</span>
          </div>
        </div>

        <!-- Content -->
        <div style="padding: 32px 28px;">
          <h2 style="font-size: 20px; color: #182838; margin: 0 0 12px; font-weight: 700;">
            Hello ${lead.customerName || 'Valued Client'},
          </h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.65; margin: 0 0 20px;">
            Thank you for reaching out to Ma'Great Taste. We have carefully reviewed your event catering specifications and are delighted to present your official bespoke quotation below.
          </p>

          <!-- Fine Quotation Hero Card -->
          <div style="background: linear-gradient(180deg, #fffdf8 0%, #fff8ec 100%); border: 2px solid #f59e0b; border-radius: 14px; padding: 24px; text-align: center; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(217,156,43,0.12);">
            <span style="font-size: 11px; font-weight: 800; color: #92400e; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 4px;">
              TOTAL ESTIMATED QUOTATION
            </span>
            <div style="font-size: 34px; font-weight: 900; color: #c6381e; margin: 6px 0; letter-spacing: -0.5px;">
              ${formattedQuote}
            </div>
            <span style="font-size: 12px; color: #78350f; font-weight: 500;">
              Includes bespoke cooking, premium fresh ingredients, waitstaff logistics, and culinary service
            </span>
          </div>

          <!-- Fine Card: Event & Menu Details -->
          <div style="background: #fbfbf9; border: 1.5px solid #e5e9ee; border-radius: 14px; padding: 22px 20px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f0e6d6; padding-bottom: 10px; margin-bottom: 14px;">
              <strong style="font-size: 12.5px; color: #182838; text-transform: uppercase; letter-spacing: 1px;">Event Summary</strong>
              ${lead.id ? `<span style="font-size: 11px; font-weight: 700; color: #1e293b;">Ref #${lead.id}</span>` : ''}
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Event Category:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${lead.eventType || 'Catering'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Expected Date:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${lead.eventDate || 'To be confirmed'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Guest Count:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${lead.guestCount || 'Flexible'} guests</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Location / Venue:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${lead.location || 'Lagos, Nigeria'}</td>
              </tr>
              ${lead.dietaryRequirements ? `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Dietary Preferences:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #d97706; text-align: right;">${lead.dietaryRequirements}</td>
              </tr>
              ` : ''}
            </table>
          </div>

          ${menuNotes ? `
          <!-- Chef's Proposed Menu Breakdown -->
          <div style="background: #f8fafc; border-left: 4px solid #182838; padding: 16px 18px; border-radius: 6px; margin-bottom: 24px;">
            <strong style="display: block; font-size: 13px; color: #182838; margin-bottom: 6px;">👨‍🍳 Chef Margaret's Proposed Menu & Logistics Breakdown:</strong>
            <p style="font-size: 13px; color: #334155; line-height: 1.6; margin: 0; white-space: pre-wrap;">${menuNotes}</p>
          </div>
          ` : ''}

          <!-- Confirmation Action Buttons -->
          <div style="text-align: center; margin: 28px 0 16px;">
            <a href="${confirmUrl}"
               style="display: inline-block; background: #c6381e; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 30px; border-radius: 28px; box-shadow: 0 4px 14px rgba(198,56,30,0.32); margin-right: 8px; margin-bottom: 10px;">
              ✅ Confirm This Booking
            </a>
            <a href="${whatsappUrl}"
               style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 26px; border-radius: 28px; box-shadow: 0 4px 12px rgba(37,211,102,0.32); margin-bottom: 10px;">
              💬 Discuss on WhatsApp
            </a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 12px 0 0;">
            Clicking <b>Confirm This Booking</b> will immediately lock in Chef Margaret's brigade on our kitchen calendar. You can also reply directly to this email to customize dish selections.
          </p>
        </div>

        <!-- Fine Footer: Contact Details -->
        <div style="background: #182838; padding: 26px 20px; text-align: center; font-size: 12px; color: #cbd5e1; border-top: 1px solid #283a4c;">
          <p style="margin: 0 0 6px; font-weight: 800; font-size: 13px; color: #fed485; letter-spacing: 0.5px;">
            MA'GREAT TASTE RESTAURANT &amp; LUXURY EVENTS
          </p>
          <p style="margin: 0 0 6px; color: #e2e8f0;">
            📞 <b>Hotlines:</b> +234 905 827 1973 &bull; +234 805 330 8425
          </p>
          <p style="margin: 0 0 6px; color: #e2e8f0;">
            ✉️ <b>Email:</b> <a href="mailto:hello@magreattaste.ng" style="color: #fed485; text-decoration: none;">hello@magreattaste.ng</a>
          </p>
          <p style="margin: 0 0 8px; color: #94a3b8;">
            📍 Lekki Phase 1, Lagos, Nigeria &bull; Mon - Sun (8:00 AM - 10:00 PM)
          </p>
          <p style="margin: 0; font-size: 11px; color: #64748b;">
            Official Website: <a href="https://magreattaste.ng" style="color: #fed485; text-decoration: none;">magreattaste.ng</a> &bull; Good food, thoughtfully delivered.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: lead.customerEmail,
      bcc: ADMIN_EMAIL,
      subject,
      html
    });
    console.log(`[CATERING QUOTE EMAIL] Successfully dispatched quote to ${lead.customerEmail}`);
    return { success: true, message: `Quotation email successfully sent to ${lead.customerEmail}!` };
  } catch (err: any) {
    console.error(`[CATERING QUOTE EMAIL ERROR]`, err);
    return { success: false, message: `Failed to deliver email: ${err.message}` };
  }
}

/**
 * Dispatch alert to kitchen admin when a new catering enquiry arrives
 */
export async function sendCateringEnquiryAlert(lead: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  eventDate?: string;
  guestCount?: number;
  location?: string;
  budget?: string;
  notes?: string;
  dietaryRequirements?: string;
}): Promise<void> {
  const mailer = getTransporter();
  if (!mailer) return;

  const subject = `🔔 New Catering Enquiry: ${lead.customerName} (${lead.guestCount || 'Flexible'} guests)`;
  const html = `
    <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #c6381e; margin-top: 0;">New Catering Lead Received!</h2>
      <p><b>Client:</b> ${lead.customerName} (${lead.customerEmail})</p>
      <p><b>Phone:</b> ${lead.customerPhone || 'Not specified'}</p>
      <p><b>Guests:</b> ${lead.guestCount || 'Flexible'} guests</p>
      <p><b>Event Date:</b> ${lead.eventDate || 'Not specified'}</p>
      <p><b>Location:</b> ${lead.location || 'Lagos'}</p>
      <p><b>Budget:</b> ${lead.budget || 'Negotiable'}</p>
      ${lead.dietaryRequirements ? `<p><b>Dietary:</b> ${lead.dietaryRequirements}</p>` : ''}
      ${lead.notes ? `<p><b>Special Notes:</b> ${lead.notes}</p>` : ''}
      <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
      <p style="font-size: 12px; color: #64748b;">Log in to Ma'Great Taste Admin Studio to send an official quote.</p>
    </div>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: ADMIN_EMAIL,
      subject,
      html
    });
  } catch (err) {
    console.error('[CATERING ALERT ERROR]', err);
  }
}

/**
 * Sends an email notification to the customer when Chef Margaret replies to their inquiry/chat
 */
export async function sendCustomerMessageReplyEmail(data: {
  customerName: string;
  customerEmail: string;
  originalMessage: string;
  replyText: string;
  subject?: string;
}): Promise<boolean> {
  const mailer = getTransporter();
  const timestamp = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' });

  if (!mailer) {
    console.log(`[CUSTOMER REPLY - RECORDED] Reply to ${data.customerName} (${data.customerEmail}): "${data.replyText}". (Configure SMTP for live transmission)`);
    return false;
  }

  const subject = `Chef Margaret replied: ${data.subject || 'Your Ma\'Great Taste Inquiry'}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="margin: 0; padding: 20px 0; background-color: #f8fafc; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #244661 100%); padding: 26px 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #fed485; letter-spacing: 0.5px;">MA' GREAT TASTE</h1>
          <p style="margin: 6px 0 0; font-size: 13px; color: #cbd5e1;">Chef &amp; Kitchen Concierge Desk</p>
        </div>

        <!-- Body -->
        <div style="padding: 28px 24px;">
          <p style="font-size: 15px; color: #1e293b; margin-top: 0;">Hello <strong>${data.customerName}</strong>,</p>
          <p style="font-size: 14px; color: #475569; line-height: 1.6;">
            Chef Margaret from the Ma'Great Taste kitchen team has reviewed your message and responded:
          </p>

          <!-- Chef Margaret Reply Bubble -->
          <div style="background: #fff8f0; border: 1px solid #fed485; border-left: 4px solid #c6381e; border-radius: 8px; padding: 18px; margin: 20px 0;">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 13px; font-weight: 800; color: #c6381e; text-transform: uppercase; letter-spacing: 0.6px;">Chef Margaret &bull; Kitchen Team</span>
            </div>
            <p style="font-size: 15px; color: #182838; line-height: 1.6; margin: 0; white-space: pre-wrap; font-weight: 500;">${data.replyText}</p>
            <p style="font-size: 11px; color: #94a3b8; margin: 10px 0 0; text-align: right;">${timestamp}</p>
          </div>

          <!-- Original Message Accordion -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 16px 0;">
            <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 700;">Your Original Note</p>
            <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5; font-style: italic;">"${data.originalMessage}"</p>
          </div>

          <!-- CTAs -->
          <div style="text-align: center; margin: 26px 0 10px;">
            <a href="https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Chef Margaret! I am following up on your reply regarding: "${data.replyText.slice(0, 50)}..."`)}"
               style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 24px; border-radius: 8px; box-shadow: 0 3px 8px rgba(37,211,102,0.25);">
              💬 Reply on WhatsApp (+234 905 827 1973)
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #182838; padding: 18px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #233548;">
          <p style="margin: 0 0 4px; font-weight: 700; color: #fed485;">Ma'Great Taste Restaurant &amp; Events</p>
          <p style="margin: 0; color: #cbd5e1;">Lekki Phase 1, Lagos, Nigeria &bull; Hotlines: +234 905 827 1973</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: data.customerEmail,
      replyTo: SENDER_EMAIL,
      subject,
      html
    });
    console.log(`[CUSTOMER REPLY - SUCCESS] Dispatched chef reply email to ${data.customerEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[CUSTOMER REPLY - ERROR] Failed to send email to ${data.customerEmail}:`, err.message);
    return false;
  }
}

/**
 * Sends an order status update email to the customer's phone/inbox
 */
export async function sendOrderStatusUpdateEmail(order: {
  id: string;
  customerName: string;
  customerEmail?: string;
  status: string;
  total: number;
  deliveryAddress?: string;
}): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer || !order.customerEmail || !order.customerEmail.includes('@')) return false;

  const statusEmojis: Record<string, string> = {
    'Preparing': '🍳',
    'Ready': '🍱',
    'Out for Delivery': '🚴',
    'Delivered': '🎉',
    'Cancelled': '⚠️'
  };

  const emoji = statusEmojis[order.status] || '🍲';
  const subject = `${emoji} Order Update #${order.id}: Status is now ${order.status}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="margin: 0; padding: 20px 0; background-color: #f8fafc; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
        <div style="background: linear-gradient(135deg, #182838 0%, #244661 100%); padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #fed485;">MA' GREAT TASTE</h1>
          <p style="margin: 6px 0 0; font-size: 13px; color: #cbd5e1;">Live Feast Tracker &bull; Order #${order.id}</p>
        </div>
        <div style="padding: 26px 24px;">
          <p style="font-size: 15px; color: #1e293b; margin-top: 0;">Hello <strong>${order.customerName}</strong>,</p>
          <div style="background: #fdf2f0; border-left: 4px solid #c6381e; padding: 16px; border-radius: 6px; margin: 18px 0;">
            <p style="margin: 0; font-size: 16px; font-weight: 700; color: #c6381e;">${emoji} Order Status: ${order.status}</p>
            <p style="margin: 6px 0 0; font-size: 13px; color: #475569;">
              ${order.status === 'Preparing' ? 'Our kitchen team has fired up the burners and is preparing your meal with care.' :
                order.status === 'Ready' ? 'Your dishes are freshly packaged and staged for temperature-controlled dispatch.' :
                order.status === 'Out for Delivery' ? 'Your feast is en route with our dispatch rider to your address!' :
                order.status === 'Delivered' ? 'Delivered fresh to your table. We hope every bite is delicious!' :
                `Your order status has been updated to ${order.status}.`}
            </p>
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 13px;">
            <tr><td style="padding: 6px 0; color: #64748b;">Total Amount:</td><td style="padding: 6px 0; font-weight: 700; text-align: right; color: #1e293b;">₦${order.total.toLocaleString()}</td></tr>
            ${order.deliveryAddress ? `<tr><td style="padding: 6px 0; color: #64748b;">Delivery Destination:</td><td style="padding: 6px 0; text-align: right; color: #1e293b;">${order.deliveryAddress}</td></tr>` : ''}
          </table>
          <div style="text-align: center; margin-top: 24px;">
            <a href="https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Dispatch Team! I am checking on my Order #${order.id}`)}"
               style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 11px 22px; border-radius: 6px;">
              💬 Track or Contact Rider on WhatsApp (+234 905 827 1973)
            </a>
          </div>
        </div>
        <div style="background: #182838; padding: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
          Ma'Great Taste &bull; Lagos, Nigeria &bull; +234 905 827 1973
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: order.customerEmail,
      subject,
      html
    });
    return true;
  } catch (err: any) {
    console.error('[ORDER EMAIL ERROR]', err.message);
    return false;
  }
}

/**
 * Sends a welcome email when a customer signs up or signs in
 */
export async function sendWelcomeEmail(data: {
  customerName: string;
  customerEmail: string;
}): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer || !data.customerEmail || !data.customerEmail.includes('@')) {
    console.warn('[WELCOME EMAIL] Mailer not configured or invalid recipient email:', data.customerEmail);
    return false;
  }

  const firstName = data.customerName.replace(/^Chef\s+/i, '').split(/\s+/)[0] || 'Friend';
  const subject = `Welcome to Ma'Great Taste, ${firstName}! 🍲 Your account is active`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Welcome to Ma'Great Taste</title>
    </head>
    <body style="margin: 0; padding: 24px 0; background-color: #f8fafc; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 6px 20px rgba(0,0,0,0.06);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #244661 100%); padding: 32px 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 1px; color: #fed485;">MA' GREAT TASTE</h1>
          <p style="margin: 6px 0 0; font-size: 13px; color: #cbd5e1; text-transform: uppercase; letter-spacing: 1.5px;">Authentic Nigerian Dining &bull; Lagos</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 28px;">
          <h2 style="font-size: 20px; color: #182838; margin-top: 0; font-weight: 800;">
            Welcome to the Ma'Great Taste Family, ${firstName}! 🎉
          </h2>

          <p style="font-size: 15px; color: #334155; line-height: 1.6; margin: 14px 0;">
            Thank you for joining <strong>Ma'Great Taste</strong>. Your account is now active and ready! Whether you crave our signature smoky Party Jollof, rich Egusi with Pounded Yam, high-protein meal prep bowls, or planning a landmark celebration, we are fired up to bring you Lagos's finest dining experience.
          </p>

          <!-- Account Perks Box -->
          <div style="background: #fff8f6; border-left: 4px solid #c6381e; border-radius: 8px; padding: 16px 18px; margin: 22px 0;">
            <p style="margin: 0 0 8px; font-size: 13px; font-weight: 700; color: #c6381e; text-transform: uppercase; letter-spacing: 0.5px;">Your Account Privileges</p>
            <ul style="margin: 0; padding-left: 18px; font-size: 14px; color: #475569; line-height: 1.6;">
              <li><strong>Live Order Tracking:</strong> Watch your food prep &amp; dispatch in real-time.</li>
              <li><strong>Saved Meals:</strong> Bookmark favorite dishes for quick 1-click reordering.</li>
              <li><strong>Exclusive Chef Discounts:</strong> Get member-only vouchers &amp; seasonal surprises.</li>
              <li><strong>Automated Meal Reminders:</strong> Set daily alerts for Breakfast, Lunch, or Dinner.</li>
            </ul>
          </div>

          <!-- CTAs -->
          <div style="text-align: center; margin: 26px 0 16px;">
            <a href="http://localhost:5173/#menu"
               style="display: inline-block; background: #c6381e; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 13px 28px; border-radius: 8px; box-shadow: 0 4px 12px rgba(198,56,30,0.28); margin-bottom: 10px;">
              🍲 Explore Today's Fresh Menu
            </a>
            <br />
            <a href="https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Chef Margaret! I just signed into Ma'Great Taste as ${data.customerName}.`)}"
               style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 10px 22px; border-radius: 8px;">
              💬 Chat with Chef Margaret on WhatsApp
            </a>
          </div>

          <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-top: 26px; border-top: 1px solid #eef2f5; padding-top: 16px;">
            Warm regards,<br />
            <strong>Chef Margaret &amp; The Kitchen Dispatch Team</strong><br />
            Ma'Great Taste Restaurant &bull; Lekki Phase 1, Lagos, Nigeria
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #182838; padding: 18px 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #233548;">
          <p style="margin: 0 0 4px; font-weight: 700; color: #fed485;">Ma'Great Taste Restaurant &amp; Events</p>
          <p style="margin: 0; color: #cbd5e1;">Lekki Phase 1, Lagos, Nigeria &bull; Hotlines: +234 905 827 1973</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: data.customerEmail,
      replyTo: SENDER_EMAIL,
      subject,
      html
    });
    console.log(`[WELCOME EMAIL - SUCCESS] Dispatched welcome email to ${data.customerEmail} (${data.customerName})`);
    return true;
  } catch (err: any) {
    console.error(`[WELCOME EMAIL - ERROR] Failed to send welcome email to ${data.customerEmail}:`, err.message);
    return false;
  }
}

/**
 * Send 6-digit OTP verification email for Sign Up / Sign In
 */
export async function sendOtpVerificationEmail(data: {
  email: string;
  name?: string;
  otp: string;
  purpose?: 'signup' | 'signin';
}): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn(`[OTP EMAIL - SIMULATED] Mailer not configured. OTP for ${data.email}: ${data.otp}`);
    return false;
  }

  const firstName = (data.name || 'Food Lover').trim().split(' ')[0];
  const subject = `${data.otp} is your Ma'Great Taste verification code`;
  const actionText = data.purpose === 'signin' ? 'sign in to your account' : 'complete your account registration';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Ma'Great Taste Verification Code</title>
    </head>
    <body style="margin: 0; padding: 24px 0; background-color: #f8fafc; font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 6px 20px rgba(0,0,0,0.06);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #244661 100%); padding: 28px 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 1px; color: #fed485;">MA' GREAT TASTE</h1>
          <p style="margin: 4px 0 0; font-size: 12px; color: #cbd5e1; text-transform: uppercase; letter-spacing: 1.5px;">Authentic Nigerian Dining &bull; Security Verification</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 28px; text-align: center;">
          <h2 style="font-size: 19px; color: #182838; margin-top: 0; font-weight: 800;">
            Hello ${firstName},
          </h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 12px 0 24px;">
            Use the 6-digit one-time passcode below to ${actionText}:
          </p>

          <!-- OTP Box -->
          <div style="background: #fff8f6; border: 2px dashed #c6381e; border-radius: 12px; padding: 18px 24px; display: inline-block; margin: 0 auto 24px;">
            <span style="font-family: monospace, 'Courier New', Courier; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #c6381e;">
              ${data.otp}
            </span>
          </div>

          <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 16px;">
            This passcode is valid for <strong>10 minutes</strong>. Never share this code with anyone.
          </p>
          <p style="font-size: 12px; color: #94a3b8; line-height: 1.4; margin: 0;">
            If you did not request this verification code, please ignore this email.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #182838; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #233548;">
          <p style="margin: 0 0 4px; font-weight: 700; color: #fed485;">Ma'Great Taste Restaurant &bull; Lekki Phase 1, Lagos</p>
          <p style="margin: 0; color: #cbd5e1;">Hotlines &amp; WhatsApp: +234 905 827 1973</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: data.email,
      replyTo: SENDER_EMAIL,
      subject,
      html
    });
    console.log(`[OTP EMAIL - SUCCESS] Dispatched OTP ${data.otp} to ${data.email}`);
    return true;
  } catch (err: any) {
    console.error(`[OTP EMAIL - ERROR] Failed to send OTP email to ${data.email}:`, err.message);
    return false;
  }
}

/**
 * Send branded thank you confirmation to client who requested a corporate tasting box
 */
export async function sendTastingRequestThankYouEmail(request: TastingRequest): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) {
    console.warn('[TASTING EMAIL] SMTP transporter not available.');
    return false;
  }

  const subject = `Your Corporate Tasting Box Request — Ma'Great Taste 🍲`;
  const cleanPhone = (request.contactPhone || '').replace(/[^0-9]/g, '');
  const waContactUrl = `https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Chef Margaret, I just requested a tasting box for ${request.companyName} (Ref #${request.id}).`)}`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tasting Box Request Received</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px 12px; color: #1e293b; -webkit-font-smoothing: antialiased;">
      <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 28px rgba(24,40,56,0.07);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #101a24 100%); padding: 34px 24px; text-align: center; border-bottom: 3px solid #d99c2b;">
          <img src="${BRAND_LOGO_URL}" alt="Ma'Great Taste" width="80" height="80" style="display: block; margin: 0 auto 12px auto; border-radius: 50%; border: 3px solid #d99c2b; box-shadow: 0 4px 14px rgba(0,0,0,0.35); object-fit: cover;" />
          <h1 style="margin: 0; font-size: 23px; font-weight: 800; color: #ffffff; letter-spacing: 1.2px; text-transform: uppercase;">MA’ GREAT TASTE</h1>
          <p style="margin: 5px 0 0; font-size: 11px; color: #d99c2b; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Corporate Dining &bull; Central Kitchen &amp; Tasting Studio</p>
          <div style="margin-top: 14px;">
            <span style="display: inline-block; background: rgba(217,156,43,0.18); color: #fed485; border: 1px solid rgba(217,156,43,0.4); border-radius: 20px; padding: 4px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">TASTING BOX REQUEST RECEIVED</span>
          </div>
        </div>

        <!-- Content -->
        <div style="padding: 32px 28px;">
          <h2 style="font-size: 20px; color: #182838; margin: 0 0 12px; font-weight: 700;">
            Hello ${request.contactPerson || 'Team'} (${request.companyName}),
          </h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.65; margin: 0 0 20px;">
            Thank you for requesting a corporate tasting box from <b>Ma'Great Taste</b>! We are thrilled at the opportunity to introduce our culinary craft to your organization.
          </p>
          <p style="font-size: 14px; color: #475569; line-height: 1.65; margin: 0 0 24px;">
            Our executive culinary team is already reviewing your selected dishes and tasting requirements. One of our corporate coordinators will be in touch with you within <b>24 hours</b> to confirm your tasting schedule and delivery logistics.
          </p>

          <!-- Fine Summary Card -->
          <div style="background: #fbfbf9; border: 1.5px solid #e5e9ee; border-radius: 14px; padding: 22px 20px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f0e6d6; padding-bottom: 10px; margin-bottom: 14px;">
              <strong style="font-size: 12.5px; color: #182838; text-transform: uppercase; letter-spacing: 1px;">Tasting Box Specifications</strong>
              <span style="font-size: 11px; font-weight: 700; color: #c6381e;">Ref #${request.id}</span>
            </div>

            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Organization / Company:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${request.companyName}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Contact Person:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${request.contactPerson} (${request.contactPhone})</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Official Email:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${request.companyEmail}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Tasters / Team Size:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #c6381e; text-align: right;">${request.guestCount} People</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Number of Meals:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${request.mealCount} Dishes</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Preferred Date &amp; Time:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${request.preferredDate} at ${request.preferredTime}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 9px 0; color: #64748b; font-weight: 600;">Delivery / Office Location:</td>
                <td style="padding: 9px 0; font-weight: 700; color: #1e293b; text-align: right;">${request.location}</td>
              </tr>
            </table>

            <!-- Meals Selected Block -->
            <div style="background: #f8fafc; border-left: 4px solid #c6381e; padding: 14px 16px; border-radius: 6px; margin-top: 14px;">
              <strong style="display: block; font-size: 12px; color: #182838; text-transform: uppercase; margin-bottom: 4px;">Requested Tasting Dishes:</strong>
              <p style="font-size: 13px; color: #334155; line-height: 1.6; margin: 0; white-space: pre-wrap;">${request.mealSelections}</p>
            </div>

            ${request.notes ? `
            <div style="margin-top: 12px; font-size: 12px; color: #64748b;">
              <b>Special Dietary Notes:</b> ${request.notes}
            </div>
            ` : ''}
          </div>

          <!-- What Happens Next -->
          <div style="background: #fff8f6; border: 1px dashed #c6381e; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px;">
            <strong style="color: #c6381e; font-size: 13px; display: block; margin-bottom: 4px;">Next Steps:</strong>
            <p style="font-size: 13px; color: #475569; line-height: 1.5; margin: 0;">
              Our tasting coordinator will reach out directly to <b>${request.contactPhone}</b> or via <b>${request.companyEmail}</b> to confirm dispatch timing and answer any questions.
            </p>
          </div>

          <!-- WhatsApp Button -->
          <div style="text-align: center; margin: 24px 0 10px;">
            <a href="${waContactUrl}"
               style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 24px; border-radius: 28px; box-shadow: 0 4px 12px rgba(37,211,102,0.32);">
              💬 Have Questions? Chat with Us on WhatsApp
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #182838; padding: 26px 20px; text-align: center; font-size: 12px; color: #cbd5e1; border-top: 1px solid #283a4c;">
          <p style="margin: 0 0 6px; font-weight: 800; font-size: 13px; color: #fed485; letter-spacing: 0.5px;">
            MA'GREAT TASTE RESTAURANT &amp; TASTING STUDIO
          </p>
          <p style="margin: 0 0 6px; color: #e2e8f0;">
            📞 <b>Hotlines:</b> +234 905 827 1973 &bull; +234 805 330 8425
          </p>
          <p style="margin: 0 0 6px; color: #e2e8f0;">
            ✉️ <b>Email:</b> <a href="mailto:hello@magreattaste.ng" style="color: #fed485; text-decoration: none;">hello@magreattaste.ng</a>
          </p>
          <p style="margin: 0 0 8px; color: #94a3b8;">
            📍 Central Kitchen &amp; Tasting Studio, Lekki Phase 1, Lagos, Nigeria
          </p>
          <p style="margin: 0; font-size: 11px; color: #64748b;">
            Official Website: <a href="https://magreattaste.ng" style="color: #fed485; text-decoration: none;">magreattaste.ng</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: request.companyEmail,
      subject,
      html
    });
    console.log(`[TASTING CLIENT EMAIL] Successfully dispatched confirmation to ${request.companyEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[TASTING CLIENT EMAIL ERROR] Failed to send to ${request.companyEmail}:`, err.message);
    return false;
  }
}

/**
 * Dispatch alert to kitchen admin when a new corporate tasting box request arrives
 */
export async function sendTastingRequestAdminAlert(request: TastingRequest): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) return false;

  const subject = `🍱 [New Tasting Request] ${request.companyName} (${request.guestCount} people, ${request.mealCount} meals)`;
  const cleanPhone = (request.contactPhone || '').replace(/[^0-9]/g, '');
  const waUrl = `https://wa.me/${cleanPhone.startsWith('234') ? cleanPhone : '234' + cleanPhone.replace(/^0/, '')}?text=${encodeURIComponent(`Hello ${request.contactPerson}, this is Chef Margaret from Ma'Great Taste following up on your Corporate Tasting Box request for ${request.companyName}!`)}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: sans-serif; background: #f8fafc; padding: 20px; margin: 0;">
      <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
        <div style="background: #182838; padding: 20px 24px; border-bottom: 3px solid #c6381e;">
          <h2 style="color: #fed485; margin: 0; font-size: 18px;">🍱 NEW CORPORATE TASTING REQUEST</h2>
          <p style="color: #cbd5e1; margin: 4px 0 0; font-size: 12px;">Ref #${request.id} &bull; Received ${new Date(request.createdAt).toLocaleString()}</p>
        </div>

        <div style="padding: 24px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13.5px; margin-bottom: 20px;">
            <tr><td style="padding: 7px 0; color: #64748b;">Company:</td><td style="font-weight: 800; color: #182838; text-align: right;">${request.companyName}</td></tr>
            <tr><td style="padding: 7px 0; color: #64748b;">Contact Person:</td><td style="font-weight: 700; color: #182838; text-align: right;">${request.contactPerson}</td></tr>
            <tr><td style="padding: 7px 0; color: #64748b;">Phone:</td><td style="font-weight: 700; color: #182838; text-align: right;"><a href="tel:${request.contactPhone}" style="color: #c6381e;">${request.contactPhone}</a></td></tr>
            <tr><td style="padding: 7px 0; color: #64748b;">Email:</td><td style="font-weight: 700; color: #182838; text-align: right;"><a href="mailto:${request.companyEmail}" style="color: #c6381e;">${request.companyEmail}</a></td></tr>
            <tr><td style="padding: 7px 0; color: #64748b;">People / Tasters:</td><td style="font-weight: 800; color: #c6381e; text-align: right;">${request.guestCount} People</td></tr>
            <tr><td style="padding: 7px 0; color: #64748b;">Meals Count:</td><td style="font-weight: 700; color: #182838; text-align: right;">${request.mealCount} Dishes</td></tr>
            <tr><td style="padding: 7px 0; color: #64748b;">Target Date &amp; Time:</td><td style="font-weight: 700; color: #182838; text-align: right;">${request.preferredDate} (${request.preferredTime})</td></tr>
            <tr><td style="padding: 7px 0; color: #64748b;">Office Location:</td><td style="font-weight: 700; color: #182838; text-align: right;">${request.location}</td></tr>
          </table>

          <div style="background: #f1f5f9; border-left: 4px solid #182838; padding: 14px; border-radius: 6px; margin-bottom: 20px;">
            <strong style="font-size: 12px; color: #182838; text-transform: uppercase; display: block; margin-bottom: 4px;">Meals To Sample:</strong>
            <p style="font-size: 13px; color: #334155; margin: 0; line-height: 1.5; white-space: pre-wrap;">${request.mealSelections}</p>
          </div>

          ${request.notes ? `
          <div style="background: #fff8f6; border-left: 4px solid #c6381e; padding: 12px; border-radius: 6px; margin-bottom: 20px; font-size: 13px;">
            <b style="color: #c6381e;">Client Notes:</b> ${request.notes}
          </div>
          ` : ''}

          <div style="text-align: center; padding-top: 10px;">
            <a href="${waUrl}" style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 22px; border-radius: 24px; margin-right: 8px;">
              💬 WhatsApp Client
            </a>
            <a href="mailto:${request.companyEmail}?subject=Re:%20Ma'Great%20Taste%20Corporate%20Tasting%20Box%20Request%20(${encodeURIComponent(request.companyName)})" style="display: inline-block; background: #182838; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 22px; border-radius: 24px;">
              ✉️ Reply via Email
            </a>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: ADMIN_EMAIL,
      subject,
      html
    });
    console.log(`[TASTING ADMIN ALERT] Dispatched alert to ${ADMIN_EMAIL}`);
    return true;
  } catch (err: any) {
    console.error('[TASTING ADMIN ALERT ERROR]', err.message);
    return false;
  }
}


/**
 * Send a branded saved-meal confirmation email to the customer when they save meals.
 */
export async function sendSavedMealConfirmationEmail(params: {
  customerName: string;
  customerEmail: string;
  items: SavedMealItem[];
}): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) return false;

  const { customerName, customerEmail, items } = params;
  const name = customerName || 'Food Lover';
  const LOGO = 'https://res.cloudinary.com/p2pa6dfi/image/upload/f_auto,q_auto,w_240/v1792616012/magreat_brand/logo.jpg';

  const mealRows = items.map(m => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; vertical-align: middle;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <img src="${m.image}" alt="${m.name}" width="44" height="44"
            style="border-radius: 8px; object-fit: cover; flex-shrink: 0;"
            onerror="this.style.display='none'" />
          <div>
            <strong style="color: #182838; font-size: 13.5px;">${m.name}</strong><br>
            <span style="color: #64748b; font-size: 12px;">${m.category}</span>
          </div>
        </div>
      </td>
      <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 700; color: #c6381e; white-space: nowrap;">
        ₦${Number(m.price).toLocaleString()}
      </td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; padding: 24px; margin: 0;">
      <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #1e3a4a 100%); padding: 28px 28px 20px; text-align: center; border-bottom: 4px solid #c6381e;">
          <img src="${LOGO}" alt="Ma'Great Taste" width="72" height="72"
            style="border-radius: 50%; border: 3px solid #d99c2b; margin-bottom: 14px; display: block; margin-left: auto; margin-right: auto;" />
          <h1 style="color: #d99c2b; margin: 0; font-size: 22px; letter-spacing: -0.3px;">Ma'Great Taste</h1>
          <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">Events · Catering · Everyday Meals</p>
        </div>

        <!-- Body -->
        <div style="padding: 28px;">
          <h2 style="color: #182838; font-size: 18px; margin: 0 0 6px;">❤️ Meals Saved Successfully!</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 22px;">
            Hi <strong>${name}</strong>, your selected dishes have been saved to your Ma'Great Taste account.
            We'll send you helpful reminders so you never miss a fresh pot!
          </p>

          <!-- Meal list -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr>
                <th style="text-align: left; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">Saved Dish</th>
                <th style="text-align: right; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">Price</th>
              </tr>
            </thead>
            <tbody>${mealRows}</tbody>
          </table>

          <!-- CTA -->
          <div style="text-align: center; margin: 20px 0;">
            <a href="https://magreattaste.ng" style="display: inline-block; background: #c6381e; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 13px 28px; border-radius: 30px; letter-spacing: 0.2px;">
              🍽️ Order Now from Ma'Great Taste
            </a>
          </div>

          <p style="color: #94a3b8; font-size: 12.5px; line-height: 1.6; margin: 16px 0 0;">
            You'll receive personalised meal reminders at Breakfast, Lunch or Dinner time from Chef Margaret's kitchen.
            You can manage or remove your saved dishes at any time from our website.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 28px; text-align: center;">
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            <strong style="color: #182838;">Ma'Great Taste</strong> · hello@magreattaste.ng · +234 803 456 7890
          </p>
          <p style="color: #94a3b8; font-size: 11px; margin: 6px 0 0;">Lekki Phase 1, Lagos, Nigeria</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: customerEmail,
      subject: `❤️ Your saved meals at Ma'Great Taste — ${items.length} dish${items.length === 1 ? '' : 'es'} saved`,
      html
    });
    console.log(`[SAVED MEAL EMAIL] Confirmation sent to ${customerEmail}`);
    return true;
  } catch (err: any) {
    console.error('[SAVED MEAL EMAIL ERROR]', err.message);
    return false;
  }
}

/**
 * Dispatch instant Custom Meal Plan Confirmation Email to the customer
 */
export async function sendCustomMealPlanConfirmationEmail(data: {
  refId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  planType: string;
  description?: string;
  preferredStartDate?: string;
  deliveryArea?: string;
  mealOptions: Array<{ frequency: string; meal: string }>;
}): Promise<{ success: boolean; message: string }> {
  const mailer = getTransporter();
  if (!mailer) {
    return { success: false, message: 'SMTP mailer is not configured.' };
  }

  const subject = `✨ Your Custom Meal Plan Request Received [${data.refId}] — Ma'Great Taste`;
  const whatsappUrl = `https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Chef Margaret, I submitted a Custom Meal Plan request [${data.refId}] for ${data.planType} and would like to finalize my schedule!`)}`;

  const mealItemsHtml = data.mealOptions && data.mealOptions.length > 0
    ? data.mealOptions.map((item, idx) => `
        <div style="padding: 10px 14px; margin-bottom: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div style="font-size: 11px; font-weight: 700; color: #b34728; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px;">
            Meal #${idx + 1} &bull; ${item.frequency}
          </div>
          <div style="font-size: 13px; font-weight: 600; color: #182838;">
            ${item.meal && item.meal.trim() ? item.meal : 'Chef’s Selection / Recommended Specialty'}
          </div>
        </div>
      `).join('')
    : '<p style="font-size: 13px; color: #64748b; font-style: italic;">No specific dish options listed. Chef Margaret will propose dishes matching your plan type.</p>';

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Custom Meal Plan Confirmation</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px 12px; color: #1e293b; -webkit-font-smoothing: antialiased;">
      <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 28px rgba(24,40,56,0.07);">
        
        <!-- Luxury Brand Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #101a24 100%); padding: 34px 24px; text-align: center; border-bottom: 3px solid #d99c2b;">
          <img src="${BRAND_LOGO_URL}" alt="Ma'Great Taste" width="80" height="80" style="display: block; margin: 0 auto 12px auto; border-radius: 50%; border: 3px solid #d99c2b; box-shadow: 0 4px 14px rgba(0,0,0,0.35); object-fit: cover;" />
          <h1 style="margin: 0; font-size: 23px; font-weight: 800; color: #ffffff; letter-spacing: 1.2px; text-transform: uppercase;">MA’ GREAT TASTE</h1>
          <p style="margin: 5px 0 0; font-size: 11px; color: #d99c2b; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Chef-Prepared Freezer Stocking &bull; Custom Nutrition</p>
          <div style="margin-top: 14px;">
            <span style="display: inline-block; background: rgba(217, 156, 43, 0.16); color: #fed485; border: 1px solid rgba(217, 156, 43, 0.45); border-radius: 20px; padding: 4px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">CUSTOM PLAN REQUEST RECEIVED</span>
          </div>
        </div>

        <!-- Main Body -->
        <div style="padding: 32px 28px;">
          <h2 style="font-size: 21px; color: #182838; margin: 0 0 12px; font-weight: 700;">
            Thank You, ${data.customerName || 'Valued Client'}! 🍲
          </h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.65; margin: 0 0 22px;">
            We have received your custom meal plan request. Chef Margaret’s kitchen brigade has been notified and is reviewing your dietary preferences and meal schedule to design your tailored portions.
          </p>

          <!-- Plan Details Card -->
          <div style="background: #fdfbf7; border: 1px solid #f2e8d9; border-radius: 12px; padding: 20px 22px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid #ebd9c0; padding-bottom: 10px;">
              <span style="font-size: 11px; font-weight: 700; color: #8c5b1b; text-transform: uppercase; letter-spacing: 0.5px;">Plan Reference</span>
              <span style="font-family: monospace; font-size: 14px; font-weight: 700; color: #182838;">${data.refId}</span>
            </div>

            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; width: 140px;">Type of Plan:</td>
                <td style="padding: 6px 0; font-weight: 700; color: #182838;">${data.planType}</td>
              </tr>
              ${data.preferredStartDate ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Preferred Start Date:</td>
                <td style="padding: 6px 0; font-weight: 600; color: #182838;">${data.preferredStartDate}</td>
              </tr>` : ''}
              ${data.deliveryArea ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Delivery Area:</td>
                <td style="padding: 6px 0; font-weight: 600; color: #182838;">${data.deliveryArea}</td>
              </tr>` : ''}
              ${data.description ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b; vertical-align: top;">Dietary Notes:</td>
                <td style="padding: 6px 0; color: #334155; line-height: 1.5;">${data.description}</td>
              </tr>` : ''}
            </table>
          </div>

          <!-- Meal Options Section -->
          <h3 style="font-size: 15px; color: #182838; margin: 0 0 12px; font-weight: 700;">
            Requested Meal Options &amp; Schedule (${data.mealOptions?.length || 0})
          </h3>
          <div style="margin-bottom: 24px;">
            ${mealItemsHtml}
          </div>

          <!-- What Happens Next -->
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px 18px; margin-bottom: 26px;">
            <div style="font-size: 13px; font-weight: 700; color: #166534; margin-bottom: 4px;">What Happens Next?</div>
            <p style="font-size: 12px; color: #15803d; line-height: 1.6; margin: 0;">
              Our culinary concierge will contact you via phone/WhatsApp to confirm portion sizing, ingredient sourcing, and your preferred delivery dispatch window.
            </p>
          </div>

          <!-- WhatsApp Direct Action -->
          <div style="text-align: center; margin-top: 24px;">
            <a href="${whatsappUrl}" target="_blank" style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 28px; border-radius: 8px; box-shadow: 0 4px 14px rgba(37,211,102,0.35);">
              Chat Directly on WhatsApp &rarr;
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 28px; text-align: center;">
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            <strong style="color: #182838;">Ma'Great Taste</strong> &bull; hello@magreattaste.ng &bull; +234 905 827 1973
          </p>
          <p style="color: #94a3b8; font-size: 11px; margin: 6px 0 0;">Lekki Phase 1, Lagos, Nigeria</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: data.customerEmail,
      subject,
      html
    });
    console.log(`[CUSTOM PLAN EMAIL] Confirmation sent to ${data.customerEmail} for ref ${data.refId}`);

    // Also dispatch notification to admin
    mailer.sendMail({
      from: SENDER_EMAIL,
      to: ADMIN_EMAIL,
      subject: `🚨 [NEW CUSTOM MEAL PLAN] ${data.planType} from ${data.customerName} (${data.refId})`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
          <h2>New Custom Meal Plan Request</h2>
          <p><strong>Customer:</strong> ${data.customerName} (${data.customerEmail}, ${data.customerPhone || 'N/A'})</p>
          <p><strong>Plan Type:</strong> ${data.planType}</p>
          <p><strong>Start Date:</strong> ${data.preferredStartDate || 'Not specified'}</p>
          <p><strong>Delivery Location:</strong> ${data.deliveryArea || 'Lagos'}</p>
          <p><strong>Description:</strong> ${data.description || 'None'}</p>
          <h3>Meal Options:</h3>
          <ul>
            ${data.mealOptions?.map(m => `<li><strong>${m.frequency}:</strong> ${m.meal}</li>`).join('')}
          </ul>
        </div>
      `
    }).catch(err => console.error('[ADMIN NOTIFICATION ERROR]', err));

    return { success: true, message: 'Confirmation email dispatched successfully.' };
  } catch (err: any) {
    console.error('[CUSTOM PLAN EMAIL ERROR]', err.message);
    return { success: false, message: err.message };
  }
}

/**
 * Automatically sends an order confirmation email to the customer after successful Paystack payment
 */
export async function sendCustomerOrderConfirmationEmail(order: Order): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer || !order.customerEmail || !order.customerEmail.includes('@') || order.customerEmail.includes('example.com')) {
    console.log(`[ORDER CONFIRMATION EMAIL - RECORDED] Order #${order.id} for ${order.customerName} (${order.customerEmail}).`);
    return false;
  }

  const subject = `🎉 Order Confirmed #${order.id} — Paid via Paystack [Ma'Great Taste]`;
  const whatsappUrl = `https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Dispatch Team! I am checking on my confirmed Order #${order.id}`)}`;

  const itemsHtml = order.items && order.items.length > 0
    ? order.items.map(item => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #182838; font-weight: 600;">
            ${item.name} <span style="color: #64748b; font-weight: normal;">&times; ${item.quantity}</span>
          </td>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-size: 13px; font-weight: 700; color: #182838;">
            ₦${(item.price * item.quantity).toLocaleString()}
          </td>
        </tr>
      `).join('')
    : '<tr><td colspan="2" style="padding: 10px 0; color: #64748b;">Order details recorded.</td></tr>';

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmed</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f6f8; margin: 0; padding: 24px 12px; color: #1e293b; -webkit-font-smoothing: antialiased;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 28px rgba(24,40,56,0.07);">
        
        <!-- Luxury Brand Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #101a24 100%); padding: 34px 24px; text-align: center; border-bottom: 3px solid #d99c2b;">
          <img src="${BRAND_LOGO_URL}" alt="Ma'Great Taste" width="80" height="80" style="display: block; margin: 0 auto 12px auto; border-radius: 50%; border: 3px solid #d99c2b; box-shadow: 0 4px 14px rgba(0,0,0,0.35); object-fit: cover;" />
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: 1.2px; text-transform: uppercase;">MA’ GREAT TASTE</h1>
          <p style="margin: 5px 0 0; font-size: 11px; color: #d99c2b; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Lagos Kitchen &bull; Events &bull; Everyday Meals</p>
          <div style="margin-top: 14px;">
            <span style="display: inline-block; background: rgba(34, 197, 94, 0.18); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.45); border-radius: 20px; padding: 4px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">PAID VIA PAYSTACK &bull; VERIFIED</span>
          </div>
        </div>

        <!-- Main Body -->
        <div style="padding: 32px 28px;">
          <h2 style="font-size: 21px; color: #182838; margin: 0 0 8px; font-weight: 700;">
            Payment Verified &amp; Order Confirmed! 🎉
          </h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.65; margin: 0 0 22px;">
            Thank you, <strong>${order.customerName}</strong>! Your payment of <strong>₦${order.total.toLocaleString()}</strong> has been securely confirmed via Paystack. Chef Margaret’s kitchen brigade has received your order and started meal preparation.
          </p>

          <!-- Order Summary Pill -->
          <div style="background: #fdfbf7; border: 1px solid #f2e8d9; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
            <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
              <tr>
                <td style="padding: 5px 0; color: #64748b; width: 140px;">Order Number:</td>
                <td style="padding: 5px 0; font-weight: 700; color: #182838; font-family: monospace; font-size: 14px;">#${order.id}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #64748b;">Paystack Reference:</td>
                <td style="padding: 5px 0; font-weight: 600; color: #0284c7; font-family: monospace;">${order.paymentReference || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #64748b;">Estimated Delivery:</td>
                <td style="padding: 5px 0; font-weight: 700; color: #16a34a;">${order.estimatedDeliveryTime || '25–40 minutes'}</td>
              </tr>
              <tr>
                <td style="padding: 5px 0; color: #64748b;">Delivery Destination:</td>
                <td style="padding: 5px 0; font-weight: 600; color: #182838;">${order.deliveryAddress}${order.city ? `, ${order.city}` : ''}</td>
              </tr>
              ${order.deliveryNotes ? `
              <tr>
                <td style="padding: 5px 0; color: #64748b;">Special Notes:</td>
                <td style="padding: 5px 0; color: #475569; font-style: italic;">"${order.deliveryNotes}"</td>
              </tr>` : ''}
            </table>
          </div>

          <!-- Itemized Receipt -->
          <h3 style="font-size: 15px; color: #182838; margin: 0 0 10px; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
            Itemized Order Receipt
          </h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Subtotal:</td>
                <td style="padding: 8px 0; text-align: right; color: #182838; font-size: 13px; font-weight: 600;">₦${order.subtotal.toLocaleString()}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #64748b; font-size: 13px;">Lagos Delivery Fee:</td>
                <td style="padding: 8px 0; text-align: right; color: #182838; font-size: 13px; font-weight: 600;">₦${order.deliveryFee.toLocaleString()}</td>
              </tr>
              ${order.discountAmount ? `
              <tr>
                <td style="padding: 8px 0; color: #16a34a; font-size: 13px;">Promo Discount (${order.discountCode || 'Code'}):</td>
                <td style="padding: 8px 0; text-align: right; color: #16a34a; font-size: 13px; font-weight: 600;">-₦${order.discountAmount.toLocaleString()}</td>
              </tr>` : ''}
              <tr style="border-top: 2px solid #182838;">
                <td style="padding: 12px 0; font-size: 15px; font-weight: 800; color: #182838;">Total Paid (Paystack):</td>
                <td style="padding: 12px 0; text-align: right; font-size: 17px; font-weight: 800; color: #c6381e;">₦${order.total.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>

          <!-- WhatsApp Tracking Link -->
          <div style="text-align: center; margin-top: 26px;">
            <a href="${whatsappUrl}" target="_blank" style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 26px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37,211,102,0.3);">
              Track Order via WhatsApp Rider Concierge &rarr;
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center;">
          <p style="color: #64748b; font-size: 12px; margin: 0;">
            <strong style="color: #182838;">Ma'Great Taste</strong> &bull; Central Kitchen, Lekki Phase 1, Lagos &bull; +234 905 827 1973
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: order.customerEmail,
      subject,
      html
    });
    console.log(`[ORDER EMAIL - SUCCESS] Sent customer confirmation email for #${order.id} to ${order.customerEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[ORDER EMAIL - ERROR] Failed to send email for #${order.id}:`, err.message);
    return false;
  }
}

/**
 * Automatically sends an order notification email to the administrator after successful Paystack payment
 */
export async function sendAdminOrderNotificationEmail(order: Order): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) {
    console.log(`[ADMIN ORDER EMAIL - RECORDED] Admin alert for Order #${order.id}.`);
    return false;
  }

  const subject = `🚨 [NEW PAID ORDER] #${order.id} — ₦${order.total.toLocaleString()} (${order.customerName})`;
  const itemsList = order.items?.map(i => `<li><strong>${i.name}</strong> &times; ${i.quantity} (₦${(i.price * i.quantity).toLocaleString()})</li>`).join('') || '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="font-family: sans-serif; padding: 24px; color: #1e293b; background: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
        <h2 style="color: #16a34a; margin-top: 0;">🎉 New Paid Order Received</h2>
        <p><strong>Order ID:</strong> #${order.id}</p>
        <p><strong>Customer:</strong> ${order.customerName} (<a href="tel:${order.customerPhone}">${order.customerPhone}</a>, <a href="mailto:${order.customerEmail}">${order.customerEmail}</a>)</p>
        <p><strong>Payment Status:</strong> PAID (Paystack Reference: <code>${order.paymentReference || 'N/A'}</code>)</p>
        <p><strong>Delivery Destination:</strong> ${order.deliveryAddress}, ${order.city}</p>
        ${order.deliveryNotes ? `<p><strong>Delivery Notes:</strong> <em>${order.deliveryNotes}</em></p>` : ''}
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 18px 0;" />
        <h3>Dishes to Prepare:</h3>
        <ul>${itemsList}</ul>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 18px 0;" />
        <p><strong>Subtotal:</strong> ₦${order.subtotal.toLocaleString()}</p>
        <p><strong>Delivery Fee:</strong> ₦${order.deliveryFee.toLocaleString()}</p>
        <p style="font-size: 16px; font-weight: 800; color: #c6381e;">Total Received: ₦${order.total.toLocaleString()}</p>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: ADMIN_EMAIL,
      subject,
      html
    });
    console.log(`[ADMIN ORDER EMAIL - SUCCESS] Sent admin alert for #${order.id} to ${ADMIN_EMAIL}`);
    return true;
  } catch (err: any) {
    console.error(`[ADMIN ORDER EMAIL - ERROR] Failed to send admin alert for #${order.id}:`, err.message);
    return false;
  }
}

/**
 * Dispatch Welcome Email to new Newsletter Subscribers
 */
export async function sendNewsletterWelcomeEmail(subscriberEmail: string): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) return false;

  const LOGO = 'https://res.cloudinary.com/p2pa6dfi/image/upload/f_auto,q_auto,w_240/v1792616012/magreat_brand/logo.jpg';
  const subject = `🌿 Welcome to the Ma'Great Taste Family — Exclusive Menus & Culinary Privileges`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 28px rgba(24,40,56,0.07);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #101a24 100%); padding: 32px 24px; text-align: center; border-bottom: 3px solid #d99c2b;">
          <img src="${LOGO}" alt="Ma'Great Taste" width="76" height="76" style="border-radius: 50%; border: 3px solid #d99c2b; display: block; margin: 0 auto 12px; object-fit: cover;" />
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">MA’ GREAT TASTE</h1>
          <p style="color: #fed485; margin: 6px 0 0; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">Culinary Newsletter &bull; Insider Privileges</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 28px;">
          <h2 style="color: #182838; font-size: 20px; margin: 0 0 14px; font-weight: 700;">You're on the Chef's Insider List! 🎉</h2>
          <p style="color: #475569; font-size: 14.5px; line-height: 1.65; margin: 0 0 20px;">
            Thank you for subscribing to Ma'Great Taste. As an insider, you will now be the very first to know about:
          </p>

          <ul style="color: #334155; font-size: 14px; line-height: 1.8; margin: 0 0 24px; padding-left: 20px;">
            <li>🍲 <strong>Fresh Pot Daily Drops:</strong> Chef Margaret's specialty soups, jollof, and signature platters.</li>
            <li>✨ <strong>Secret Tasting Previews:</strong> Early access to our new seasonal menu additions.</li>
            <li>🎟️ <strong>Exclusive Promo Codes:</strong> Subscriber-only discounts on weekend feast orders and meal plans.</li>
            <li>🍾 <strong>Event Catering Guides:</strong> Curated banqueting tips for stress-free celebrations.</li>
          </ul>

          <div style="background: #fffdf8; border: 1.5px solid #fed485; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 26px;">
            <p style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: #92400e;">Hungry right now? Explore our live kitchen menu</p>
            <a href="https://magreattaste.ng" style="display: inline-block; background: #c6381e; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 13px 32px; border-radius: 28px; box-shadow: 0 4px 12px rgba(198,56,30,0.3);">
              🍽️ View Live Menu &amp; Order
            </a>
          </div>

          <p style="color: #64748b; font-size: 13px; line-height: 1.6; margin: 0;">
            Have an upcoming corporate event, birthday, or wedding? Reach out anytime directly on WhatsApp: <a href="https://wa.me/2349058271973" style="color: #25d366; font-weight: 700; text-decoration: none;">+234 905 827 1973</a>.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #182838; padding: 22px; text-align: center; font-size: 12px; color: #cbd5e1;">
          <p style="margin: 0 0 4px; font-weight: 700; color: #fed485;">Ma'Great Taste Restaurant &bull; Lekki Phase 1, Lagos</p>
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">You subscribed with ${subscriberEmail}. If this was not you, you can unsubscribe at any time.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: subscriberEmail,
      subject,
      html
    });
    console.log(`[NEWSLETTER WELCOME EMAIL] Sent to ${subscriberEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[NEWSLETTER WELCOME EMAIL ERROR] Failed to send to ${subscriberEmail}:`, err.message);
    return false;
  }
}

/**
 * Dispatch Branded Saved Meal Dinner Reminder Email to Customer
 */
export async function sendSavedMealReminderEmail(params: {
  customerName: string;
  customerEmail: string;
  items: SavedMealItem[];
  customMessage?: string;
}): Promise<{ success: boolean; message: string }> {
  const mailer = getTransporter();
  if (!mailer) return { success: false, message: 'SMTP mailer is not configured.' };

  const { customerName, customerEmail, items, customMessage } = params;
  const name = customerName || 'Valued Food Lover';
  const LOGO = 'https://res.cloudinary.com/p2pa6dfi/image/upload/f_auto,q_auto,w_240/v1792616012/magreat_brand/logo.jpg';
  const mealCount = items.length;
  const subject = `🍲 Chef Margaret's Kitchen is Ready For You: Your Saved Meals Await!`;

  const mealRows = items.map(m => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; vertical-align: middle;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <img src="${m.image || LOGO}" alt="${m.name}" width="50" height="50"
            style="border-radius: 10px; object-fit: cover; flex-shrink: 0; border: 1px solid #e2e8f0;"
            onerror="this.style.display='none'" />
          <div>
            <strong style="color: #182838; font-size: 14px;">${m.name}</strong><br>
            <span style="color: #64748b; font-size: 12px;">${m.category}</span>
          </div>
        </div>
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 800; color: #c6381e; font-size: 14px; white-space: nowrap;">
        ₦${Number(m.price).toLocaleString()}
      </td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; padding: 24px 12px; margin: 0; color: #1e293b;">
      <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 28px rgba(24,40,56,0.08);">

        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #1e3a4a 100%); padding: 30px 24px; text-align: center; border-bottom: 3px solid #c6381e;">
          <img src="${LOGO}" alt="Ma'Great Taste" width="74" height="74"
            style="border-radius: 50%; border: 3px solid #d99c2b; margin-bottom: 12px; display: block; margin-left: auto; margin-right: auto; object-fit: cover;" />
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">MA’ GREAT TASTE</h1>
          <p style="color: #fed485; margin: 5px 0 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;">Kitchen Concierge &bull; Fresh Dinner Alert</p>
        </div>

        <!-- Body -->
        <div style="padding: 30px 28px;">
          <div style="display: inline-block; background: #fef2f2; border: 1px solid #fee2e2; border-radius: 20px; padding: 4px 14px; font-size: 11px; font-weight: 700; color: #b91c1c; margin-bottom: 14px;">
            🔥 HOT POT ON THE FIRE
          </div>
          <h2 style="color: #182838; font-size: 20px; margin: 0 0 10px; font-weight: 800;">Hello ${name}, Dinner Is Served!</h2>
          <p style="color: #475569; font-size: 14.5px; line-height: 1.65; margin: 0 0 22px;">
            ${customMessage || `Chef Margaret and our kitchen team are simmering fresh pots right now. You saved these ${mealCount} favorite dish(es) on our site — don't let hunger catch you unaware!` }
          </p>

          <!-- Meal list -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr>
                <th style="text-align: left; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">Your Saved Dish</th>
                <th style="text-align: right; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">Price</th>
              </tr>
            </thead>
            <tbody>${mealRows}</tbody>
          </table>

          <!-- CTA Buttons -->
          <div style="text-align: center; margin: 26px 0 16px;">
            <a href="https://magreattaste.ng" style="display: inline-block; background: #c6381e; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14.5px; padding: 14px 34px; border-radius: 30px; box-shadow: 0 4px 14px rgba(198,56,30,0.32); margin-bottom: 10px;">
              🚀 Order Now (Fast 25-Min Delivery)
            </a>
            <br>
            <a href="https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Chef Margaret, I want to order my saved meals right away!`)}" style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 10px 24px; border-radius: 24px; box-shadow: 0 3px 10px rgba(37,211,102,0.25);">
              💬 Order via WhatsApp
            </a>
          </div>

          <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin: 20px 0 0; text-align: center;">
            Fresh ingredients &bull; Sealed tamper-proof thermal packaging &bull; Direct kitchen dispatch
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center;">
          <p style="color: #64748b; font-size: 12px; margin: 0 0 4px;">
            <strong style="color: #182838;">Ma'Great Taste</strong> &bull; hello@magreattaste.ng &bull; +234 905 827 1973
          </p>
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">Lekki Phase 1, Lagos, Nigeria</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: customerEmail,
      subject,
      html
    });
    console.log(`[SAVED MEAL REMINDER EMAIL] Dispatched to ${customerEmail}`);
    return { success: true, message: `Dinner reminder dispatched to ${customerEmail}!` };
  } catch (err: any) {
    console.error(`[SAVED MEAL REMINDER EMAIL ERROR]`, err);
    return { success: false, message: `Failed to deliver reminder email: ${err.message}` };
  }
}

/**
 * Dispatch Culinary Arts Academy Application Confirmation Email to Applicant
 */
export async function sendAcademyApplicationConfirmationEmail(application: {
  refNumber: string;
  fullName: string;
  email: string;
  phone: string;
  journey: string;
  schedule: string;
  experience?: string;
  notes?: string;
}): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) return false;

  const LOGO = 'https://res.cloudinary.com/p2pa6dfi/image/upload/f_auto,q_auto,w_240/v1792616012/magreat_brand/logo.jpg';
  const subject = `🎓 Application Received [${application.refNumber}] — Ma'Great Taste Culinary Arts Academy`;
  const whatsappUrl = `https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Admissions Office, I submitted my Culinary Academy application [${application.refNumber}] for ${application.journey} and would like to confirm my review status.`)}`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b;">
      <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 28px rgba(24,40,56,0.07);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #101a24 100%); padding: 34px 24px; text-align: center; border-bottom: 3px solid #d99c2b;">
          <img src="${LOGO}" alt="Ma'Great Taste Culinary Arts Academy" width="80" height="80" style="border-radius: 50%; border: 3px solid #d99c2b; display: block; margin: 0 auto 12px; object-fit: cover;" />
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">MA’ GREAT TASTE</h1>
          <p style="color: #fed485; margin: 6px 0 0; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">Culinary Arts Academy &bull; Executive Masterclasses</p>
          <div style="margin-top: 14px;">
            <span style="display: inline-block; background: rgba(217, 156, 43, 0.18); color: #fed485; border: 1px solid rgba(217, 156, 43, 0.45); border-radius: 20px; padding: 4px 16px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">
              APPLICATION FILED: ${application.refNumber}
            </span>
          </div>
        </div>

        <!-- Content -->
        <div style="padding: 32px 28px;">
          <h2 style="color: #182838; font-size: 20px; margin: 0 0 12px; font-weight: 800;">
            Congratulations, ${application.fullName}! 👩‍🍳
          </h2>
          <p style="color: #475569; font-size: 14.5px; line-height: 1.65; margin: 0 0 20px;">
            Thank you for applying to the <strong>Ma'Great Taste Culinary Arts Academy</strong>. Your application has been successfully logged with reference number <strong>${application.refNumber}</strong>.
          </p>

          <!-- Application Summary Box -->
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <div style="font-size: 11px; font-weight: 800; color: #b34728; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
              YOUR APPLICATION SPECIFICATIONS
            </div>
            <table style="width: 100%; font-size: 13.5px; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; width: 140px;">Applicant Name:</td>
                <td style="padding: 6px 0; font-weight: 700; color: #182838;">${application.fullName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Course / Journey:</td>
                <td style="padding: 6px 0; font-weight: 700; color: #c6381e;">${application.journey}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Schedule:</td>
                <td style="padding: 6px 0; font-weight: 600; color: #182838;">${application.schedule}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Cooking Experience:</td>
                <td style="padding: 6px 0; font-weight: 600; color: #182838;">${application.experience || 'Beginner'}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b;">Registered Phone:</td>
                <td style="padding: 6px 0; font-weight: 600; color: #182838;">${application.phone}</td>
              </tr>
            </table>
          </div>

          <!-- What Happens Next -->
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px 20px; margin-bottom: 24px;">
            <div style="font-size: 13px; font-weight: 800; color: #166534; margin-bottom: 6px;">Next Admissions Steps:</div>
            <ol style="margin: 0; padding-left: 20px; font-size: 13px; color: #15803d; line-height: 1.7;">
              <li>Our academic panel reviews your background and schedule availability.</li>
              <li>An admissions officer will contact you via WhatsApp / phone within <strong>24 to 48 hours</strong>.</li>
              <li>You will receive your official syllabus breakdown, uniform kit specifications, and cohort start dates.</li>
            </ol>
          </div>

          <!-- WhatsApp Chat -->
          <div style="text-align: center; margin-top: 24px;">
            <a href="${whatsappUrl}" target="_blank" style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 13px 28px; border-radius: 28px; box-shadow: 0 4px 12px rgba(37,211,102,0.32);">
              💬 Chat with Academy Admissions on WhatsApp
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #182838; padding: 22px; text-align: center; font-size: 12px; color: #cbd5e1;">
          <p style="margin: 0 0 4px; font-weight: 700; color: #fed485;">Ma'Great Taste Culinary Arts Academy &bull; Lekki Phase 1, Lagos</p>
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Official Admissions Hotline: +234 905 827 1973 &bull; admissions@magreattaste.ng</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: application.email,
      subject,
      html
    });
    console.log(`[ACADEMY APPLICANT EMAIL] Confirmation sent to ${application.email}`);
    return true;
  } catch (err: any) {
    console.error(`[ACADEMY APPLICANT EMAIL ERROR] Failed to send to ${application.email}:`, err.message);
    return false;
  }
}

/**
 * Dispatch Culinary Arts Academy Admin Alert to hello@magreattaste.ng
 */
export async function sendAcademyApplicationAdminAlert(application: {
  refNumber: string;
  fullName: string;
  email: string;
  phone: string;
  journey: string;
  schedule: string;
  experience?: string;
  notes?: string;
}): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer) return false;

  const subject = `👩‍🍳 [NEW ACADEMY APPLICATION] ${application.fullName} (${application.refNumber}) — ${application.journey}`;
  const cleanPhone = application.phone.replace(/[^0-9]/g, '');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="font-family: sans-serif; padding: 24px; color: #1e293b; background: #f8fafc;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;">
        <div style="display: inline-block; background: #dcfce7; color: #15803d; padding: 4px 12px; border-radius: 16px; font-weight: 700; font-size: 12px; margin-bottom: 12px;">
          🎓 NEW STUDENT APPLICATION
        </div>
        <h2 style="color: #182838; margin: 0 0 16px;">Applicant: ${application.fullName}</h2>
        <p><strong>Ref Number:</strong> <code>${application.refNumber}</code></p>
        <p><strong>Email:</strong> <a href="mailto:${application.email}">${application.email}</a></p>
        <p><strong>Phone:</strong> <a href="tel:${application.phone}">${application.phone}</a> | <a href="https://wa.me/${cleanPhone}">Open in WhatsApp</a></p>
        <p><strong>Chosen Course:</strong> <strong style="color: #c6381e;">${application.journey}</strong></p>
        <p><strong>Schedule:</strong> ${application.schedule}</p>
        <p><strong>Prior Experience:</strong> ${application.experience || 'Beginner'}</p>
        ${application.notes ? `<p><strong>Applicant Notes:</strong> <em>${application.notes}</em></p>` : ''}
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <div style="text-align: center;">
          <a href="https://wa.me/${cleanPhone}?text=${encodeURIComponent(`Hello ${application.fullName}, this is Chef Margaret from Ma'Great Taste Culinary Arts Academy regarding your application [${application.refNumber}].`)}"
             style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; padding: 12px 24px; border-radius: 20px;">
            💬 Reach Applicant on WhatsApp
          </a>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: ADMIN_EMAIL,
      subject,
      html
    });
    console.log(`[ACADEMY ADMIN ALERT] Dispatched for applicant ${application.fullName}`);
    return true;
  } catch (err: any) {
    console.error(`[ACADEMY ADMIN ALERT ERROR] Failed to dispatch:`, err.message);
    return false;
  }
}

/**
 * Dispatch Academy Application Status Update Email (Admin-Triggered: Admitted, Enrolled, Contacted)
 */
export async function sendAcademyStatusUpdateEmail(application: {
  refNumber: string;
  fullName: string;
  email: string;
  journey: string;
  schedule: string;
}, newStatus: string): Promise<boolean> {
  const mailer = getTransporter();
  if (!mailer || !application.email) return false;

  const LOGO = 'https://res.cloudinary.com/p2pa6dfi/image/upload/f_auto,q_auto,w_240/v1792616012/magreat_brand/logo.jpg';
  const subject = `📜 Admissions Update: Application Marked "${newStatus}" [${application.refNumber}] — Ma'Great Taste Academy`;

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b;">
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 28px rgba(24,40,56,0.07);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #101a24 100%); padding: 32px 24px; text-align: center; border-bottom: 3px solid #d99c2b;">
          <img src="${LOGO}" alt="Ma'Great Taste" width="76" height="76" style="border-radius: 50%; border: 3px solid #d99c2b; display: block; margin: 0 auto 12px; object-fit: cover;" />
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">MA’ GREAT TASTE</h1>
          <p style="color: #fed485; margin: 6px 0 0; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">Culinary Arts Academy &bull; Admissions Board</p>
        </div>

        <!-- Body -->
        <div style="padding: 30px 28px;">
          <div style="display: inline-block; background: #e0f2fe; border: 1px solid #bae6fd; border-radius: 20px; padding: 4px 14px; font-size: 11px; font-weight: 800; color: #0369a1; margin-bottom: 14px;">
            STATUS: ${newStatus.toUpperCase()}
          </div>
          <h2 style="color: #182838; font-size: 20px; margin: 0 0 12px; font-weight: 800;">
            Dear ${application.fullName},
          </h2>
          <p style="color: #475569; font-size: 14.5px; line-height: 1.65; margin: 0 0 18px;">
            Your application for the <strong>${application.journey}</strong> (${application.schedule}) has been reviewed and updated to:
          </p>

          <div style="background: #f8fafc; border: 2px dashed #0284c7; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 22px;">
            <div style="font-size: 22px; font-weight: 900; color: #0284c7;">${newStatus}</div>
            <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Application Reference: <strong>${application.refNumber}</strong></div>
          </div>

          <p style="color: #334155; font-size: 14px; line-height: 1.65; margin: 0 0 24px;">
            Our admissions concierge is standing by to assist with syllabus materials, tuition payment options, and culinary kit allocation.
          </p>

          <div style="text-align: center;">
            <a href="https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Admissions Office, my application [${application.refNumber}] is now ${newStatus}. I would like to proceed with the next steps.`)}"
               style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 13px 30px; border-radius: 28px; box-shadow: 0 4px 12px rgba(37,211,102,0.32);">
              💬 Continue on WhatsApp with Admissions
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #182838; padding: 20px; text-align: center; font-size: 12px; color: #cbd5e1;">
          <p style="margin: 0 0 4px; font-weight: 700; color: #fed485;">Ma'Great Taste Culinary Arts Academy</p>
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">hello@magreattaste.ng &bull; +234 905 827 1973</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await mailer.sendMail({
      from: SENDER_EMAIL,
      to: application.email,
      subject,
      html
    });
    console.log(`[ACADEMY STATUS EMAIL] Dispatched to ${application.email} for status ${newStatus}`);
    return true;
  } catch (err: any) {
    console.error(`[ACADEMY STATUS EMAIL ERROR] Failed to dispatch:`, err.message);
    return false;
  }
}


