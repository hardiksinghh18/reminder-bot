const mongoose = require('mongoose');

// Define a schema for user data
const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  chatname:String,
  freeTrialUsage: { type: Number, default: 0 },
  subscriptionExpiry: Date,
  subscriptionType:String,
  remindersSet: { type: Number, default: 0 }
});


// Define a schema for reminders
const reminderSchema = new mongoose.Schema({
    userId: String,
    chatId: String,
    chatName: String,
    message: String,
    date: Date,
    jobName: String
  });
  
  
  const User = mongoose.model('User', userSchema);
  const Reminder = mongoose.model('Reminder', reminderSchema);


  module.exports= {User,Reminder}