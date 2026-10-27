import nodemailer, { type Transporter } from 'nodemailer';
import dns from 'node:dns';

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
let activePort = SMTP_PORT;

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

/**
 * Dispatch official Catering Quotation Email to customer
 */
export async function sendCateringQuotationEmail(lead: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
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

  const subject = `Official Catering Quotation from Ma'Great Taste Restaurant (₦${Number(quoteAmount).toLocaleString()})`;
  const formattedQuote = `₦${Number(quoteAmount).toLocaleString()}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Catering Quotation</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 10px; color: #1e293b;">
      <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 14px rgba(0,0,0,0.06);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #182838 0%, #0e1722 100%); padding: 34px 28px; text-align: center; border-bottom: 3px solid #fed485;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: 0.5px;">Ma'Great Taste</h1>
          <p style="margin: 6px 0 0; font-size: 13px; color: #fed485; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Chef Margaret &bull; Luxury Catering Services</p>
        </div>

        <!-- Content -->
        <div style="padding: 32px 28px;">
          <h2 style="font-size: 19px; color: #182838; margin: 0 0 12px; font-weight: 700;">Hello ${lead.customerName || 'Valued Client'},</h2>
          <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 20px;">
            Thank you for reaching out to Ma'Great Taste. We have carefully reviewed your event catering requirements and are delighted to present your official bespoke quotation below.
          </p>

          <!-- Quotation Box -->
          <div style="background: #fffbeb; border: 2px dashed #f59e0b; border-radius: 12px; padding: 22px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 12px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.8px;">Total Estimated Quotation</span>
            <div style="font-size: 32px; font-weight: 800; color: #c6381e; margin: 6px 0;">${formattedQuote}</div>
            <span style="font-size: 12px; color: #78350f;">Includes premium ingredients, preparation, and luxury service logistics</span>
          </div>

          <!-- Event Details -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px;">
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Expected Date:</td>
              <td style="padding: 10px 0; font-weight: 700; color: #1e293b; text-align: right;">${lead.eventDate || 'To be confirmed'}</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Guest Count:</td>
              <td style="padding: 10px 0; font-weight: 700; color: #1e293b; text-align: right;">${lead.guestCount || 'Flexible'} guests</td>
            </tr>
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Location / Venue:</td>
              <td style="padding: 10px 0; font-weight: 700; color: #1e293b; text-align: right;">${lead.location || 'Lagos, Nigeria'}</td>
            </tr>
            ${lead.dietaryRequirements ? `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; color: #64748b; font-weight: 600;">Dietary Requirements:</td>
              <td style="padding: 10px 0; font-weight: 700; color: #d97706; text-align: right;">${lead.dietaryRequirements}</td>
            </tr>
            ` : ''}
          </table>

          ${menuNotes ? `
          <div style="background: #f8fafc; border-left: 4px solid #182838; padding: 14px 16px; border-radius: 4px; margin-bottom: 24px;">
            <strong style="display: block; font-size: 13px; color: #182838; margin-bottom: 4px;">Chef's Proposed Menu & Logistics Notes:</strong>
            <p style="font-size: 13px; color: #334155; line-height: 1.5; margin: 0; white-space: pre-wrap;">${menuNotes}</p>
          </div>
          ` : ''}

          <div style="text-align: center; margin: 28px 0 10px;">
            <a href="https://wa.me/2349058271973?text=${encodeURIComponent(`Hello Chef Margaret, I received the quotation (${formattedQuote}) for my event on ${lead.eventDate || 'my chosen date'} and would like to confirm!`)}"
               style="display: inline-block; background: #25d366; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 10px rgba(37,211,102,0.3);">
              💬 Confirm or Discuss on WhatsApp
            </a>
          </div>

          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 18px 0 0;">
            Or reply directly to this email to adjust the menu, schedule a tasting, or confirm your booking.
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #182838; padding: 22px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #233548;">
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



