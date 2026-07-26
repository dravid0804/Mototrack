// src/controllers/contactController.js
const { sendContactMessage } = require('../services/contactService');

exports.send = async (req, res, next) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Subject and message are required' });
    }

    await sendContactMessage({
      fromName: `${req.user.first_name} ${req.user.last_name || ''}`.trim(),
      fromEmail: req.user.email,
      subject,
      message,
    });

    res.json({ success: true, message: 'Message sent' });
  } catch (err) { next(err); }
};