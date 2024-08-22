
const mongoose = require('mongoose');
const User=require('./models')


// Connection URI (replace with your actual MongoDB URI)
// const uri = process.env.MONGO_URI || 'mongodb://localhost:27017'; // Use your MongoDB URI
const uri = `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@mern-blog.c5mouhd.mongodb.net/reminder-bot?retryWrites=true&w=majority&appName=mern-blog`;

const dbName = 'reminder-bot'; // Replace with your actual database name

let db = null;

async function connectToDatabase() {
  if (db) {
    return db;
  }

  try {
    // Connect to MongoDB using Mongoose
    await mongoose.connect(uri, {
      dbName: dbName // Directly specify the database name here
    });

    console.log('Connected to the database, success');

    // Get the native MongoDB connection object
    db = mongoose.connection;
  
    return db;
  } catch (error) {
    console.error('Failed to connect to the database:', error.message);
    process.exit(1); // Exit the process with a non-zero status code
  }
}

// Function to check if the user is subscribed
async function isUserSubscribed(userId) {
  const db = await connectToDatabase();
  const usersCollection = db.collection('users');
  const user = await usersCollection.findOne({ userId });

  if (!user) return false;

  const currentDate = new Date();
  if (user.subscriptionExpiry && user.subscriptionExpiry > currentDate) {
    return true;
  }
  if (user.remindersSet < 20) {
    return true; // User is within the free trial limit
  }
  return false;
}



async function initializeUser(userId, chatName = null) {
  const db = await connectToDatabase();
  const usersCollection = db.collection('users');

  // Check if the user already exists
  const user = await usersCollection.findOne({ userId });

  // If the user doesn't exist, create a new user with chatName
  if (!user) {
    await usersCollection.insertOne({
      userId,
      chatName: chatName || 'Default Chat Name', // or null if optional
      freeTrialUsage: 0,
      subscriptionExpiry: null,
      remindersSet: 0,
    });
  } else if (chatName) {
    // Optionally update the chatName if it's provided and different from the existing one
    await usersCollection.updateOne(
      { userId },
      { $set: { chatName: chatName } }
    );
  }
}



//start free trial
async function startFreeTrial(userId){
  const db = await connectToDatabase();
  const usersCollection = db.collection('users');
 const userData= await usersCollection.findOne({userId})


  if(userData.freeTrialUsage===0){
    await usersCollection.updateOne({ userId }, { $set: { freeTrialUsage: 1 } });
  }
 
}

// Function to increment reminder usage for a user
async function incrementReminderUsage(userId) {
  const db = await connectToDatabase();
  const usersCollection = db.collection('users');

  // await initializeUser(userId);
  await usersCollection.updateOne({ userId }, { $inc: { remindersSet: 1 } });
}

// Function to get the number of reminders a user has set
async function getReminderUsage(userId) {
  const db = await connectToDatabase();
  const usersCollection = db.collection('users');
  
  await initializeUser(userId);
  const user = await usersCollection.findOne({ userId });
  return user.remindersSet;
}

// Function to get a user's subscription details
async function getUserSubscription(userId) {
  const db = await connectToDatabase();
  const usersCollection = db.collection('users');

  const user = await usersCollection.findOne({ userId });
  if (!user) return null;

  const currentDate = new Date();
  if (user.subscriptionExpiry && user.subscriptionExpiry > currentDate) {
    return { expiryDate: user.subscriptionExpiry, remindersLeft: user.remindersSet };
  }
  return null;
}

// Function to update a user's subscription details
async function updateUserSubscription(userId, expiryDate,subscriptionChoosen) {
  const db = await connectToDatabase();
  const usersCollection = db.collection('users');

  await initializeUser(userId);
  await usersCollection.updateOne(
    { userId },
    {
      $set: {
        subscriptionExpiry: expiryDate,
        subscriptionType:subscriptionChoosen,
        remindersSet: 0 // Reset reminders when a new subscription starts
      }
    }
  );
}

// Function to handle subscription callbacks from the bot
async function handleSubscriptionCallback(bot, callbackQuery) {
  const db = await connectToDatabase();
  const usersCollection = db.collection('users');

  const msg = callbackQuery.message;
  const userId = callbackQuery.from.id;
  const chatId = msg.chat.id;
  const chatName=msg.chat.username || msg.chat.first_name;

  const user = await usersCollection.findOne({ userId });

  await initializeUser(userId,chatName);

  const remindersSet = await getReminderUsage(userId);

  
  if (callbackQuery.data === 'free_trial') {
    if (remindersSet < 20) {
      const user = await usersCollection.findOne({ userId });
      if (user.freeTrialUsage === 0) {
        await usersCollection.updateOne({ userId }, { $set: { freeTrialUsage: 1 } });
        bot.sendMessage(chatId, 'You have chosen the Free Trial. You can set up to 20 reminders.');
      } else {
        const messageFreeTrial= bot.sendMessage(chatId, `You have already started your free trial and you have ${20-remindersSet} reminders left.`);
        setTimeout(() => {
          bot.deleteMessage(chatId, messageFreeTrial.message_id).catch((err) => {
            console.error('Failed to delete subscription message:', err.message);
          });
        }, 1000);
      }
    } 
    
  } else if (callbackQuery.data === 'subscription') {

    const subscriptionOptions = {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Monthly Subscription - $2', callback_data: 'subscribe_monthly' }],
          [{ text: 'Yearly Subscription - $20', callback_data: 'subscribe_yearly' }]
        ]
      }
    }; 
  
    bot.sendMessage(chatId, 'Please choose your subscription plan:', subscriptionOptions);
  }  
  
}

module.exports = {
  connectToDatabase,
  isUserSubscribed,
  initializeUser,
  startFreeTrial,
  handleSubscriptionCallback,
  incrementReminderUsage,
  getReminderUsage,
  getUserSubscription,
  updateUserSubscription
};