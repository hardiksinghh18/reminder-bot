require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const moment = require('moment-timezone');
const { handleReminderCommand, handleUpcomingCommand } = require('./reminders');
const {
  User,
  Reminder,
  isUserSubscribed,
  connectToDatabase,
  startFreeTrial,
  initializeUser,
  handleSubscriptionCallback,
  incrementReminderUsage,
  getReminderUsage,
  getUserSubscription,
  updateUserSubscription,
} = require('./db');
const { handleSubscription, createInvoice, verifyPayment } = require('./payments');

// Use environment variables for sensitive data
const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('Error: Bot token is missing.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (error) => console.error(`Polling error: ${error.message}`));




// Set up bot commands
bot.setMyCommands([
  { command: '/start', description: 'Initialize the Bot' },
  { command: '/reminder', description: 'Reminder format' },
  { command: '/upcoming', description: 'View all upcoming reminders' },
  { command: '/subscribe', description: 'View and choose subscription plans' }
]);

bot.onText(/\/start/, async (msg) => {
  const userId = msg.from.id;
  const chatName=msg.chat.username || msg.chat.first_name;
  const userSubscription = await getUserSubscription(userId);
// console.log(userSubscription)
  if (userSubscription && new Date(userSubscription.expiryDate) > new Date()) {
    
    const message = `
    🎉 <b>Welcome to ReminderAlertBot</b>!!!
    
    With ReminderAlertBot, you can:
    📝 <b>Set reminders</b> for important tasks and events.
    🎁 <b>Enjoy a free trial</b> with up to 20 reminders.
    💰 <b>Choose from affordable monthly or yearly subscription plans</b> for unlimited reminders.
    💬 <b>Manage reminders</b> in both group chats and private messages.
    📅 <b>View all your upcoming reminders</b> in one place.
    
    <b>Commands:</b>
    🚀 <b>/start</b> - Initialize the bot and view subscription options.
    ⏰ <b>/reminder</b> - Reminder format: <code>/reminder [message] on [DD Mon YYYY] at [HHMM] UTC</code>.
    📋 <b>/upcoming</b> - View all upcoming reminders.
    💳 <b>/subscribe</b> - View and choose subscription plans.
    
    <b>You are already subscribed. Your subscription is valid until ${userSubscription.expiryDate.toDateString()}.</b>
    `;

    const options = {
  
      parse_mode: 'HTML'
    };

    bot.sendMessage(msg.chat.id, message,options);

  } else {
    await initializeUser(userId,chatName);

    const welcomeMessage = `
🎉 <b>Welcome to ReminderAlertBot</b>!!!

With ReminderAlertBot, you can:
📝 <b>Set reminders</b> for important tasks and events.
🎁 <b>Enjoy a free trial</b> with up to 20 reminders.
💰 <b>Choose from affordable monthly or yearly subscription plans</b> for unlimited reminders.
💬 <b>Manage reminders</b> in both group chats and private messages.
📅 <b>View all your upcoming reminders</b> in one place.

<b>Commands:</b>
🚀 <b>/start</b> - Initialize the bot and view subscription options.
⏰ <b>/reminder</b> - Reminder format: <code>/reminder [message] on [DD Mon YYYY] at [HHMM] UTC</code>.
📋 <b>/upcoming</b> - View all upcoming reminders.
💳 <b>/subscribe</b> - View and choose subscription plans.

<b>Let's get started! Choose an option below to begin:</b>
`;

    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Free Trial 🎁', callback_data: 'free_trial' }],
          [{ text: 'Subscription 💳', callback_data: 'subscription' }]
        ]
      },
      parse_mode: 'HTML'
    };

    bot.sendMessage(msg.chat.id, welcomeMessage, options);
  }
});

bot.on('callback_query', async (callbackQuery) => {
  await handleSubscriptionCallback(bot, callbackQuery);
});

bot.onText(/\/reminder (.+) on (\d{1,2}) (\w+) (\d{4}) at (\d{4}) UTC/, async (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;
  const messageId = msg.message_id;
  
  const userSubscription = await getUserSubscription(userId);
  const remindersUsed = await getReminderUsage(userId);

  if (!userSubscription && remindersUsed >= 20) {
     await bot.sendMessage(chatId, 'You’ve reached the limit of 20 reminders on your free trial. To continue setting unlimited reminders, please visit @AlertmodeBot and choose a subscription plan.');
    // setTimeout(() => {
    //   bot.deleteMessage(chatId, subscriptionMessage.message_id).catch((err) => {
    //     console.error('Failed to delete subscription message:', err.message);
    //   });
    // }, 15000);

    // bot.deleteMessage(chatId, messageId.toString()).catch((err) => {
    //   console.error('Failed to delete non-subscriber message:', err.message);
    // });

    return;
  }
  if(!userSubscription && remindersUsed===0){
    bot.sendMessage(chatId,`Your free trial has started and you have ${20-remindersUsed} left.`)
  }
  if (!userSubscription && remindersUsed < 20) {
    await startFreeTrial(userId)
    await incrementReminderUsage(userId); // Increment reminder usage for free trial users
  }
 
  await handleReminderCommand(bot, msg, match);
});

// bot.onText(/\/reminder$/, async (msg) => {
//   const chatId = msg.chat.id;
//   const messageId = msg.message_id;

//   const reminderFormatMessage = `
//   ⚠️ <b>Please write the reminder in the correct format:</b>
//   <code>/reminder Message on ${getCurrentDateFormatted()} at ${getCurrentTimeFormatted()} UTC</code>📑
//   `;

//   bot.sendMessage(chatId, reminderFormatMessage, { parse_mode: 'HTML' })
//     .then(() => {
//       bot.deleteMessage(chatId, messageId.toString()).catch((err) => {
//         console.error('Failed to delete invalid command message:', err.message);
//       });
//     });
// });


bot.onText(/\/reminder$/, async (msg) => {
  const chatId = msg.chat.id;
  const messageId = msg.message_id;

  const reminderFormatMessage = `
  ⚠️ <b>Please write the reminder in the correct format:</b>
  <code>/reminder Message on ${getCurrentDateFormatted()} at ${getCurrentTimeFormatted()} UTC</code>📑
  `;

  try {
    // Send the reminder format message
    const sentMessage = await bot.sendMessage(chatId, reminderFormatMessage, { parse_mode: 'HTML' });

    // Set a timeout to delete the message after 3 seconds
    setTimeout(async () => {
      try {
        await bot.deleteMessage(chatId, sentMessage.message_id);
      } catch (err) {
        console.error('Failed to delete reminder format message:', err.message);
      }
    }, 20000); // 3000 ms = 3 seconds

    // Delete the original command message
    await bot.deleteMessage(chatId, messageId.toString());
  } catch (err) {
    console.error('Failed to handle /reminder command:', err.message);
  }
});

bot.onText(/\/upcoming/, async (msg) => {
  await handleUpcomingCommand(bot, msg);
});

bot.onText(/\/subscribe/, async (msg) => {
  const chatId = msg.chat.id;

  const subscriptionOptions = {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Monthly Subscription - $2', callback_data: 'subscribe_monthly' }],
        [{ text: 'Yearly Subscription - $20', callback_data: 'subscribe_yearly' }]
      ]
    }
  }; 

  bot.sendMessage(chatId, 'Please choose your subscription plan:', subscriptionOptions);
});

bot.on('callback_query', async (callbackQuery) => {
  const db = await connectToDatabase();
  const usersCollection = db.collection('users');

  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const data = callbackQuery.data;

  const user = await usersCollection.findOne({ userId });

  if(user.subscriptionType&& user.subscriptionExpiry && user.subscriptionExpiry> Date.now()){
    bot.sendMessage(chatId, `You have chosen ${user.subscriptionType} Subscription and your subscription is valid till ${user.subscriptionExpiry.toUTCString()}`);
  }
  else{
    
  let amount;
  let description;

  if (data === 'subscribe_monthly') {
    amount = 2;
    description = 'Monthly Subscription';
  } else if (data === 'subscribe_yearly') {
    amount = 20;
    description = 'Yearly Subscription';
  }

  if (amount && description) {
    try {
      const currency = 'USD';
      const callbackUrl = `http://your-server/verify-payment`;

      const invoice = await createInvoice(amount, currency, description, callbackUrl);
      const invoiceUrl = invoice.payLink;
      const trackId = invoice.trackId;

      await bot.sendMessage(chatId, `Please complete your payment using the following link: ${invoiceUrl}`);

      // Polling for payment verification
      pollPaymentStatus(trackId, userId);
    } catch (error) {
      console.error('Error creating invoice:', error.message);
      await bot.sendMessage(chatId, 'Failed to create an invoice. Please try again later.');
    }
  }
  }

});

function getCurrentDateFormatted() {
  const date = new Date();
  const day = String(date.getUTCDate()).padStart(2, '0');
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

function getCurrentTimeFormatted() {
  const date = new Date();
  date.setUTCMinutes(date.getUTCMinutes() + 2); // Add 2 minutes to the current time
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}${minutes}`;
}

const pollPaymentStatus = async (trackId, userId) => {
  const interval = setInterval(async () => {
    try {
      const verificationResult = await verifyPayment(trackId);
      if (verificationResult.status === 'Paid') {
        clearInterval(interval);

        const expiryDate = new Date();
        let subscriptionType = 'monthly';
        if (verificationResult.amount ==='2') {
          expiryDate.setMonth(expiryDate.getMonth() + 1);
        } else if (verificationResult.amount === '20') {
          expiryDate.setFullYear(expiryDate.getFullYear() + 1);
           subscriptionType = 'yearly';
        }

        await updateUserSubscription(userId, expiryDate,subscriptionType);
        await bot.sendMessage(userId, `🎉 Congratulations! Your payment is confirmed. Your subscription is valid until ${expiryDate.toUTCString()}. Thank you for subscribing!`);
      }
    } catch (error) {
      console.error('Error polling payment status:', error.message);
    }
  }, 60000); // Poll every 60 seconds
};

const app = express();
app.use(bodyParser.json());

app.post('/verify-payment', async (req, res) => {
  const { trackId } = req.body;

  try {
    const verificationResult = await verifyPayment(trackId);

    if (verificationResult.status === 'Paid') {
      console.log(`Payment for track ID ${trackId} has been verified.`);
      const userInfo = invoiceToUserMapping[trackId];
      if (userInfo) {
        const { userId, amount } = userInfo;
        const expiryDate = new Date();
        let subscriptionType = 'monthly';

        if (amount === '2') {
          expiryDate.setMonth(expiryDate.getMonth() + 1);
        } else if (amount === '20') {
          expiryDate.setFullYear(expiryDate.getUTCFullYear() + 1);
          subscriptionType = 'yearly';
        }

        await updateUserSubscription(userId, expiryDate,subscriptionType);
        bot.sendMessage(userId, `🎉 Congratulations! You have successfully subscribed to the ${subscriptionType} package. Your subscription is valid until ${expiryDate.toDateString()}. Thank you for subscribing!`);
      }
    } else {
      console.error(`Payment verification failed for track ID ${trackId}. Status: ${verificationResult.status}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error verifying payment:', error.message);
    res.sendStatus(500);
  }
});

console.log(`Bot is running`);

module.exports = { bot };
