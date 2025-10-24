// models/Payment.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  tx_ref: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'ETB' },
  email: { type: String, required: true },
  firstName: { type: String, required: true },
  middleName: { type: String, required: true },
  donationType: { type: String },
  payment_type: { type: String, enum: ['donation', 'sponsorship'], required: true },
  status: { type: String, enum: ['pending', 'successful', 'failed'], default: 'pending' },
  is_recurring: { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // Will be populated when user creates account
  anonymousId: { type: String, index: true } ,// Temporary ID for anonymous donations
  webhookData: { type: mongoose.Schema.Types.Mixed },
  verificationData: { type: mongoose.Schema.Types.Mixed },
  verificationAttempts: { type: Number, default: 0 }
}, {
  timestamps: true
});



module.exports = mongoose.model('Payment', paymentSchema);