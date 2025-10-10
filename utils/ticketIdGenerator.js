// utils/ticketIdGenerator.js
function generateTicketId() {
    const prefix = "GRV"; // Grievance prefix
    const timestamp = Date.now().toString().slice(-6); // Last 6 digits of current timestamp
    const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 random alphanumeric characters
    return `${prefix}-${timestamp}-${randomChars}`;
}

export { generateTicketId };