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
  const instagramUrl = 'https://www.instagram.com/gullnaaz925?igsh=NDk5ZzdqYWJ2b3Jx';

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

const generateOrderConfirmationHTML = (order) => {
  const appName = process.env.APP_NAME || 'Gullnaaz';
  const logoUrl = 'https://res.cloudinary.com/dvsxcre8k/image/upload/v1756186468/products/jymuackdmew22yed6do4.png';
  const instagramUrl = 'https://www.instagram.com/gullnaaz925?igsh=NDk5ZzdqYWJ2b3Jx';

  const orderItemsHTML = order.orderItems.map(item => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 10px;">${item.name}</td>
      <td style="padding: 10px; text-align: center;">${item.quantity}</td>
      <td style="padding: 10px; text-align: right;">₹${item.price.toLocaleString()}</td>
    </tr>
  `).join('');
  console.log()

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 10px; overflow: hidden;">
      <!-- Header -->
      <div style="background-color: #f8f8f8; padding: 20px; text-align: center; border-bottom: 1px solid #ddd;">
        <img src="${logoUrl}" alt="${appName} Logo" style="max-width: 150px;"/>
        <h1 style="color: #333; margin-top: 10px;">Order Placed Successfully!</h1>
      </div>

      <!-- Body -->
      <div style="padding: 20px;">
        <h2 style="color: #333;">Thank You For Your Order!</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          Hi ${order.shippingAddress.fullName},<br>
          We've received your order and are getting it ready for you. You can find the details below.
        </p>
        <p style="font-size: 14px; color: #555;"><strong>Order ID:</strong> ${order._id}</p>
        
        <!-- Order Items Table -->
        <h3 style="color: #333; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px;">Order Summary</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background-color: #f2f2f2;">
              <th style="padding: 10px; text-align: left;">Product</th>
              <th style="padding: 10px; text-align: center;">Quantity</th>
              <th style="padding: 10px; text-align: right;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${orderItemsHTML}
          </tbody>
        </table>
        
        <!-- Totals Section -->
        <div style="text-align: right; margin-top: 20px; font-size: 14px; color: #555;">
          <p>Subtotal: ₹${order.itemsPrice.toLocaleString()}</p>
          <p>Shipping: ₹${order.shippingPrice.toLocaleString()}</p>
          ${order.discountAmount > 0 ? `<p style="color: green;">Discount: -₹${order.discountAmount.toLocaleString()}</p>` : ''}
          <h4 style="color: #333; margin-top: 10px;">Total: ₹${order.totalPrice.toLocaleString()}</h4>
        </div>
        
        <!-- Shipping Address -->
        <h3 style="color: #333; border-top: 1px solid #eee; padding-top: 20px; margin-top: 20px;">Shipping To</h3>
        <address style="font-style: normal; font-size: 14px; color: #555;">
          ${order.shippingAddress.fullName}<br>
          ${order.shippingAddress.street}<br>
          ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.postalCode}<br>
          Phone: ${order.shippingAddress.phone}
        </address>
      </div>

      <!-- Footer -->
      <div style="background-color: #f8f8f8; padding: 20px; text-align: center; border-top: 1px solid #ddd;">
        <p style="color: #666; margin: 0 0 10px;">Follow us on social media</p>
        <div>
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
 * Sends a beautifully formatted order confirmation email to the user.
 * @param {string} userEmail - The recipient's email address.
 * @param {object} order - The complete order object.
 * @returns {Promise<void>}
 */
export const sendOrderConfirmationEmail = async (userEmail, order) => {
  if (!userEmail || !order) {
    console.error("sendOrderConfirmationEmail: Missing userEmail or order object.");
    return;
  }

  try {
    const transporter = createTransporter();
    const emailHtml = generateOrderConfirmationHTML(order);
    const subject = `Your ${process.env.APP_NAME || 'Gullnaaz'} Order Confirmation #${order._id}`;
    
    const mailOptions = {
      from: `"${process.env.APP_NAME || 'Gullnaaz'}" <${process.env.MAIL_USER}>`,
      to: userEmail,
      subject: subject,
      html: emailHtml,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent to ${userEmail}. Message ID: ${info.messageId}`);
  } catch (error) {
    console.error(`Failed to send order confirmation email to ${userEmail}:`, error);
    // We don't throw an error here because failing to send an email
    // should not cause the main order placement process to fail.
  }
};
