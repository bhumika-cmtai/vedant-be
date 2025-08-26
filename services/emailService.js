import nodemailer from "nodemailer";

// Create transporter with better error handling
const createTransporter = () => {
  try {
    return nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT, 10) || 587,
      secure: process.env.MAIL_PORT == 465, // true for port 465, false for other ports
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  } catch (error) {
    console.error('Error creating email transporter:', error);
    throw error;
  }
};

/**
 * Generates the HTML for the email with a consistent header and footer
 * @param {string} subject - The subject of the email
 * @param {string} message - The main content of the email
 * @param {string} [imageUrl] - Optional URL for an image to include
 * @returns {string} - The full HTML content of the email
 */
const generateEmailHTML = (subject, message, imageUrl) => {
  const appName = process.env.APP_NAME || 'Gullnaaz';
  // Replace with your actual logo URL and social media links
  const logoUrl = 'https://res.cloudinary.com/dvsxcre8k/image/upload/v1756186468/products/jymuackdmew22yed6do4.png'; 
  const facebookUrl = 'https://facebook.com';
  const twitterUrl = 'https://twitter.com';
  const instagramUrl = 'https://instagram.com';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 10px; overflow: hidden;">
      <!-- Header -->
      <div style="background-color: #f8f8f8; padding: 20px; text-align: center; border-bottom: 1px solid #ddd;">
        <img src="${logoUrl}" alt="${appName} Logo" style="max-width: 150px;"/>
        <h1 style="color: #333; margin-top: 10px;">${appName}</h1>
      </div>

      <!-- Body -->
      <div style="padding: 20px;">
        <h2 style="color: #333;">${subject}</h2>
        ${imageUrl ? `<img src="${imageUrl}" alt="${subject}" style="max-width: 100%; height: auto; border-radius: 5px; margin-bottom: 20px;"/>` : ''}
        <div style="color: #555; font-size: 16px; line-height: 1.6;">
          ${message.replace(/\n/g, '<br>')}
        </div>
      </div>

      <!-- Footer -->
      <div style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #ddd;">
        <p style="color: #666; margin: 0 0 10px;">Follow us on social media</p>
        <div>
          <a href="${facebookUrl}" style="margin: 0 10px; text-decoration: none;">Facebook</a>
          <a href="${twitterUrl}" style="margin: 0 10px; text-decoration: none;">Twitter</a>
          <a href="${instagramUrl}" style="margin: 0 10px; text-decoration: none;">Instagram</a>
        </div>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">
          &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.
        </p>
      </div>
    </div>
  `;
};


/**
 * Sends an email to a list of recipients using BCC for privacy
 * @param {string[]} emailList - An array of recipient email addresses
 * @param {string} subject - The subject of the email
 * @param {string} message - The content of the email
 * @param {string} [imageUrl] - Optional URL for an image
 * @returns {Promise<{success: boolean, info?: any, error?: any}>}
 */
export const sendBulkEmail = async (emailList, subject, message, imageUrl) => {
  if (!emailList || !Array.isArray(emailList) || emailList.length === 0) {
    return { success: false, error: 'No valid recipients provided' };
  }
  if (!subject || !message) {
    return { success: false, error: 'Subject and message are required' };
  }

  const validEmails = emailList.filter(email => 
    email && typeof email === 'string' && email.includes('@')
  );

  if (validEmails.length === 0) {
    return { success: false, error: 'No valid email addresses found' };
  }

  console.log(`Preparing to send email to ${validEmails.length} users.`);

  try {
    const transporter = createTransporter();

    // Generate the full email HTML
    const emailHtml = generateEmailHTML(subject, message, imageUrl);

    const mailOptions = {
      from: `"${process.env.APP_NAME || 'Gullnaaz'}" <${process.env.MAIL_USER}>`,
      to: process.env.MAIL_USER,
      bcc: validEmails,
      subject: subject,
      html: emailHtml,
      text: message, // Fallback plain text
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('Email sent successfully:', info.messageId);
    return { 
      success: true, 
      info: {
        messageId: info.messageId,
        sentTo: validEmails.length
      }
    };

  } catch (error) {
    console.error('Error sending bulk email:', error);
    return { 
      success: false, 
      error: error.message || 'Failed to send email'
    };
  }
};