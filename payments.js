
const { getUserSubscription, updateUserSubscription } = require('./db'); // Add these imports
const axios = require('axios');

const OXAPAY_API_KEY = 'RY66BW-8ARPBE-8BYUZM-7GX380';
const OXAPAY_API_URL = 'https://api.oxapay.com/merchants/request'; // Correct endpoint
const OXAPAY_INQUIRY_URL = 'https://api.oxapay.com/merchants/inquiry'; // For payment verification

let invoiceToUserMapping = {};

async function createInvoice(amount, currency, description, callbackUrl, orderId, email) {
  try {
    const payload = {
      merchant: OXAPAY_API_KEY,
      amount,
      currency,
      description,
      callbackUrl,
      lifeTime: 60, // Default to 60 minutes
      feePaidByPayer: 0, // Merchant covers the fee
      orderId,
      email
    };
    console.log('Creating invoice with payload:', payload); // Log the request payload

    const response = await axios.post(OXAPAY_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('Oxapay API response:', response.data); // Log the response data
    if (response.data && response.data.result === 100) {
      return response.data;
    } else {
      console.error('Oxapay API error response:', response.data); // Log error response from Oxapay API
      throw new Error('Invalid response from Oxapay API');
    }
  } catch (error) {
    console.error('Error creating invoice:', error.response ? error.response.data : error.message); // Log detailed error
    throw new Error('Failed to create invoice');
  }
}

async function verifyPayment(trackId) {
  try {
    const payload = {
      merchant: OXAPAY_API_KEY,
      trackId
    };
    const response = await axios.post(OXAPAY_INQUIRY_URL, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('Payment verification response:', response.data); // Log the response data
    if (response.data && response.data.result === 100 && response.data.status === 'Paid') {
      // return true;
      return response.data;
    } else {
      return response.data;
    }
  } catch (error) {
    console.error('Error verifying payment:', error.response ? error.response.data : error.message); // Log detailed error
    return error.response;
  }
}

async function handleSubscription(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const userSubscription = await getUserSubscription(userId);
  if (userSubscription && new Date(userSubscription.expiryDate) > new Date()) {
    bot.sendMessage(chatId, `You are already subscribed. Your subscription is valid until ${userSubscription.expiryDate.toDateString()}.`);
    return;
  }

  const subscriptionOptions = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💰$2 Monthly', callback_data: 'monthly_subscription' }],
        [{ text: '💰$20 Yearly', callback_data: 'yearly_subscription' }]
      ]
    }
  };

  bot.sendMessage(chatId, 'Choose your subscription plan:', subscriptionOptions);

  bot.once('callback_query', async (callbackQuery) => {
    const { data } = callbackQuery;
    let amount, description;

    if (data === 'monthly_subscription') {
      amount = 2;
      description = 'Monthly Subscription';
    } else if (data === 'yearly_subscription') {
      amount = 20;
      description = 'Yearly Subscription';
    } else {
      return;
    }

    try {
      const orderId = `ORD-${Date.now()}`;
      const email = msg.from.username || '';
      const invoice = await createInvoice(amount, 'USD', description, 'https://yourserver.com/oxapay-webhook', orderId, email);
      invoiceToUserMapping[invoice.trackId] = { userId, amount, description };
      bot.sendMessage(chatId, `Please complete the payment using this link: ${invoice.payLink}`);
    } catch (error) {
      bot.sendMessage(chatId, 'Failed to create invoice. Please try again later.');
    }
  });
}

module.exports = {
  handleSubscription,
  createInvoice,
  verifyPayment
};