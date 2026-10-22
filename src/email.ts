import nodemailer from 'nodemailer';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@magreattaste.ng';
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  if (!SMTP_USER || !SMTP_PASS) {
    return null;
  }
  try {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
    return transporter;
  } catch (err) {
    console.error('[EMAIL SERVICE] Failed to initialize nodemailer transporter:', err);
    return null;
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
      from: `"Ma'Great Taste Website" <${SMTP_USER}>`,
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
      from: `"Ma'Great Taste Website" <${SMTP_USER}>`,
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
