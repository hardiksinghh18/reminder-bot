const axios = require('axios');
const OXAPAY_API_KEY = 'RY66BW-8ARPBE-8BYUZM-7GX380';
const OXAPAY_API_URL = 'https://api.oxapay.com/v1/invoices';

async function createInvoice(amount, currency, description, callbackUrl) {
  try {
    const response = await axios.post(OXAPAY_API_URL, {
      amount,
      currency,
      description,
      callback_url: callbackUrl
    }, {
      headers: {
        'Authorization': `Bearer ${OXAPAY_API_KEY}`
      }
    });
    console.log('Oxapay API response:', response.data); // Log the response data
    if (response.data && response.data.invoice_url) {
      return response.data;
    } else {
      throw new Error('Invalid response from Oxapay API');
    }
  } catch (error) {
    console.error('Error creating invoice:', error);
    throw new Error('Failed to create invoice');
  }
}

module.exports = {
  createInvoice
};
